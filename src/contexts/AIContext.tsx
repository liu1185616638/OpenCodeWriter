import { createContext, useContext, useRef, useCallback, useState, useEffect, type ReactNode } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { GenerationStatus, GenerationTaskMeta } from "../types/ai";

// =============================================================================
// AI Context — lift useAI state to App level so it survives tab switches
//
// Streaming strategy: Each ai-chunk delta immediately updates React state.
// The SSE stream naturally delivers small deltas (1-few tokens each), which
// gives the typewriter effect for free. Streamdown's incremental block
// rendering ensures only the tail block re-renders per delta.
// =============================================================================

interface AiChunkPayload {
  session_id: string;
  chunk: string;
  chunk_type: string; // "thinking" | "content"
}

interface AiDonePayload {
  session_id: string;
}

interface AiErrorPayload {
  session_id: string;
  error: string;
}

export interface GenerateOptions {
  command: string;
  args: Record<string, unknown>;
  onComplete?: (content: string) => void;
  onError?: (error: string) => void;
  /** Which creation stage is being generated (e.g. "outline", "characters") */
  stage?: string;
}

interface AiContextValue {
  generating: boolean;
  streamedContent: string;
  thinkingContent: string;
  error: string | null;
  generatingStage: string | undefined;
  generationStatus: GenerationStatus;
  generationMeta: GenerationTaskMeta | null;
  generatedCharCount: number;
  elapsedMs: number;
  resetGeneration: () => void;
  generate: (options: GenerateOptions | string, legacyArgs?: Record<string, unknown>) => Promise<void>;
  cancel: () => void;
}

const AiContext = createContext<AiContextValue | null>(null);

export function AiProvider({ children }: { children: ReactNode }) {
  const [generating, setGenerating] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const [thinkingContent, setThinkingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [generatingStage, setGeneratingStage] = useState<string | undefined>(undefined);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [generationMeta, setGenerationMeta] = useState<GenerationTaskMeta | null>(null);
  const [generatedCharCount, setGeneratedCharCount] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const sessionIdRef = useRef<string | null>(null);
  const unlistenFns = useRef<UnlistenFn[]>([]);
  const onCompleteRef = useRef<GenerateOptions["onComplete"]>(undefined);
  const onErrorRef = useRef<GenerateOptions["onError"]>(undefined);
  const streamedContentRef = useRef("");
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep ref in sync so onComplete can access latest content
  const updateStreamedContent = useCallback((updater: string | ((prev: string) => string)) => {
    setStreamedContent(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      streamedContentRef.current = next;
      return next;
    });
  }, []);

  const updateThinkingContent = useCallback((updater: string | ((prev: string) => string)) => {
    setThinkingContent(prev => typeof updater === "function" ? updater(prev) : updater);
  }, []);

  const cleanup = useCallback(() => {
    unlistenFns.current.forEach(fn => fn());
    unlistenFns.current = [];
  }, []);

  const clearElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  const generate = useCallback(async (options: GenerateOptions | string, legacyArgs?: Record<string, unknown>) => {
    // Backward compat: generate("command", { args })
    let command: string;
    let args: Record<string, unknown>;
    let onComplete: GenerateOptions["onComplete"];
    let onError: GenerateOptions["onError"];
    let stage: string | undefined;

    if (typeof options === "string") {
      command = options;
      args = legacyArgs ?? {};
    } else {
      command = options.command;
      args = options.args;
      onComplete = options.onComplete;
      onError = options.onError;
      stage = options.stage;
    }

    // Cleanup previous listeners
    cleanup();
    clearElapsedTimer();
    setGenerating(true);
    setGeneratingStage(stage);
    setGenerationStatus("generating");
    setGenerationMeta({
      stage,
      command,
      presetId: args.presetId as number | undefined,
      modelName: args.modelName as string | undefined,
      startedAt: Date.now(),
    });
    setGeneratedCharCount(0);
    setElapsedMs(0);
    updateStreamedContent("");
    updateThinkingContent("");
    setError(null);

    // Start elapsed time tracker
    elapsedTimerRef.current = setInterval(() => {
      setElapsedMs(prev => prev + 500);
    }, 500);

    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;

    const sessionId = crypto.randomUUID();
    sessionIdRef.current = sessionId;

    // Each ai-chunk immediately updates React state — no buffering.
    // The SSE stream naturally delivers small deltas, giving typewriter
    // effect. Streamdown handles incremental rendering efficiently.
    let chunkCount = 0;
    const chunkUnlisten = await listen<AiChunkPayload>("ai-chunk", (event) => {
      if (event.payload.session_id === sessionIdRef.current) {
        chunkCount++;
        const { chunk, chunk_type } = event.payload;
        console.log(`[ai-chunk] #${chunkCount} type=${chunk_type} len=${chunk.length} preview="${chunk.substring(0, 40).replace(/\n/g, '\\n')}"`);
        if (chunk_type === "thinking") {
          updateThinkingContent(prev => prev + chunk);
        } else {
          updateStreamedContent(prev => prev + chunk);
          setGeneratedCharCount(prev => prev + chunk.length);
        }
      }
    });

    const doneUnlisten = await listen<AiDonePayload>("ai-done", (event) => {
      if (event.payload.session_id === sessionIdRef.current) {
        // Clear fallback timer — normal event-driven completion succeeded
        if (fallbackTimerRef.current) {
          clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }
        clearElapsedTimer();
        setGenerating(false);
        setGeneratingStage(undefined);
        setGenerationStatus("completed");
        setGenerationMeta(prev => prev ? { ...prev, endedAt: Date.now() } : null);
        cleanup();
        onCompleteRef.current?.(streamedContentRef.current);
      }
    });

    const errorUnlisten = await listen<AiErrorPayload>("ai-error", (event) => {
      if (event.payload.session_id === sessionIdRef.current) {
        clearElapsedTimer();
        setError(event.payload.error);
        setGenerating(false);
        setGeneratingStage(undefined);
        setGenerationStatus("failed");
        setGenerationMeta(prev => prev ? { ...prev, endedAt: Date.now() } : null);
        cleanup();
        onErrorRef.current?.(event.payload.error);
      }
    });

    unlistenFns.current = [chunkUnlisten, doneUnlisten, errorUnlisten];

    try {
      await invoke(command, { sessionId, ...args });
      // Fallback: if ai-done event was not received (e.g. emit failed),
      // force completion after 200ms after invoke returns.
      fallbackTimerRef.current = setTimeout(() => {
        if (sessionIdRef.current === sessionId) {
          clearElapsedTimer();
          setGenerating(false);
          setGeneratingStage(undefined);
          setGenerationStatus("completed");
          setGenerationMeta(prev => prev ? { ...prev, endedAt: Date.now() } : null);
          cleanup();
          onCompleteRef.current?.(streamedContentRef.current);
        }
      }, 200);
    } catch (e) {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      clearElapsedTimer();
      setError(String(e));
      setGenerating(false);
      setGeneratingStage(undefined);
      setGenerationStatus("failed");
      setGenerationMeta(prev => prev ? { ...prev, endedAt: Date.now() } : null);
      cleanup();
      onErrorRef.current?.(String(e));
    }
  }, [cleanup, clearElapsedTimer, updateStreamedContent, updateThinkingContent]);

  const cancel = useCallback(() => {
    clearElapsedTimer();
    setGenerating(false);
    setGeneratingStage(undefined);
    setGenerationStatus("cancelled");
    cleanup();
  }, [cleanup, clearElapsedTimer]);

  const resetGeneration = useCallback(() => {
    setGenerationStatus("idle");
    setGenerationMeta(null);
    setGeneratedCharCount(0);
    setElapsedMs(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      clearElapsedTimer();
    };
  }, [cleanup, clearElapsedTimer]);

  return (
    <AiContext.Provider value={{
      generating,
      streamedContent,
      thinkingContent,
      error,
      generatingStage,
      generationStatus,
      generationMeta,
      generatedCharCount,
      elapsedMs,
      resetGeneration,
      generate,
      cancel,
    }}>
      {children}
    </AiContext.Provider>
  );
}

export function useAI(): AiContextValue {
  const ctx = useContext(AiContext);
  if (!ctx) throw new Error("useAI must be used within an AiProvider");
  return ctx;
}
