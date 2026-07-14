import { createContext, useContext, useRef, useCallback, useState, useEffect, type ReactNode } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { approveMcpCall, denyMcpCall, cancelAiSession } from "@/lib/tauri";
import type { GenerationStatus, GenerationTaskMeta } from "../types/ai";
import type { AiTimelineEvent } from "@/types";

// =============================================================================
// AI Context — lift useAI state to App level so it survives tab switches
//
// Streaming strategy: Each ai-chunk delta immediately updates React state.
// The SSE stream naturally delivers small deltas (1-few tokens each), which
// gives the typewriter effect for free. Streamdown's incremental block
// rendering ensures only the tail block re-renders per delta.
//
// Phase F: Also collects a timeline of all AI events (tool, skill, mcp, etc.)
// for the Task Drawer, and supports backend-side session cancellation.
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

interface McpCallPayload {
  session_id: string;
  tool_name: string;
  data: Record<string, unknown>;
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
  timelineEvents: AiTimelineEvent[];
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
  const [pendingMcpCall, setPendingMcpCall] = useState<McpCallPayload | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<AiTimelineEvent[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const eventIdRef = useRef(0);
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

  const addTimelineEvent = useCallback((eventType: AiTimelineEvent["event_type"], label: string, detail?: string) => {
    const id = ++eventIdRef.current;
    const event: AiTimelineEvent = { id, event_type: eventType, label, detail, timestamp: Date.now() };
    setTimelineEvents(prev => [...prev, event]);
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
    setPendingMcpCall(null);
    setTimelineEvents([]);
    eventIdRef.current = 0;
    updateStreamedContent("");
    updateThinkingContent("");
    setError(null);
    addTimelineEvent("content", `开始生成${stage ? `：${stage}` : ""}`);

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
        setPendingMcpCall(null);
        addTimelineEvent("done", "生成完成");
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
        setPendingMcpCall(null);
        addTimelineEvent("error", event.payload.error);
        setGenerationMeta(prev => prev ? { ...prev, endedAt: Date.now() } : null);
        cleanup();
        onErrorRef.current?.(event.payload.error);
      }
    });

    const mcpUnlisten = await listen<McpCallPayload>("ai-mcp-call", (event) => {
      if (event.payload.session_id === sessionIdRef.current) {
        setPendingMcpCall(event.payload);
        addTimelineEvent("mcp_call", `MCP 调用: ${event.payload.tool_name}`, JSON.stringify(event.payload.data, null, 2));
      }
    });

    // Phase F: Listen to additional events for timeline
    const toolCallUnlisten = await listen<{ session_id: string; tool_name: string; data: Record<string, unknown> }>("ai-tool-call", (event) => {
      if (event.payload.session_id === sessionIdRef.current) {
        addTimelineEvent("tool_call", `工具调用: ${event.payload.tool_name}`);
      }
    });

    const toolResultUnlisten = await listen<{ session_id: string; tool_name: string; success: boolean; error: string }>("ai-tool-result", (event) => {
      if (event.payload.session_id === sessionIdRef.current) {
        addTimelineEvent("tool_result", `工具结果: ${event.payload.tool_name}`, event.payload.success ? undefined : event.payload.error);
      }
    });

    const skillStartUnlisten = await listen<{ session_id: string; skill_name: string }>("ai-skill-start", (event) => {
      if (event.payload.session_id === sessionIdRef.current) {
        addTimelineEvent("skill_start", `技能开始: ${event.payload.skill_name}`);
      }
    });

    const skillResultUnlisten = await listen<{ session_id: string; skill_name: string; success: boolean; error: string }>("ai-skill-result", (event) => {
      if (event.payload.session_id === sessionIdRef.current) {
        addTimelineEvent("skill_result", `技能完成: ${event.payload.skill_name}`, event.payload.success ? undefined : event.payload.error);
      }
    });

    const mcpResultUnlisten = await listen<{ session_id: string; tool_name: string; success: boolean; error: string }>("ai-mcp-result", (event) => {
      if (event.payload.session_id === sessionIdRef.current) {
        addTimelineEvent("mcp_result", `MCP 结果: ${event.payload.tool_name}`, event.payload.success ? undefined : event.payload.error);
      }
    });

    unlistenFns.current = [chunkUnlisten, doneUnlisten, errorUnlisten, mcpUnlisten, toolCallUnlisten, toolResultUnlisten, skillStartUnlisten, skillResultUnlisten, mcpResultUnlisten];

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
          setPendingMcpCall(null);
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
      setPendingMcpCall(null);
      addTimelineEvent("error", String(e));
      setGenerationMeta(prev => prev ? { ...prev, endedAt: Date.now() } : null);
      cleanup();
      onErrorRef.current?.(String(e));
    }
  }, [cleanup, clearElapsedTimer, updateStreamedContent, updateThinkingContent, addTimelineEvent]);

  const cancel = useCallback(async () => {
    clearElapsedTimer();
    // Phase F: Call backend to cancel the AI session
    if (sessionIdRef.current) {
      try {
        await cancelAiSession(sessionIdRef.current);
      } catch {
        // Backend cancel may fail if session already ended — ignore
      }
    }
    setGenerating(false);
    setGeneratingStage(undefined);
    setGenerationStatus("cancelled");
    setPendingMcpCall(null);
    addTimelineEvent("error", "用户取消了生成任务");
    cleanup();
  }, [cleanup, clearElapsedTimer, addTimelineEvent]);

  const resetGeneration = useCallback(() => {
    setGenerationStatus("idle");
    setGenerationMeta(null);
    setGeneratedCharCount(0);
    setElapsedMs(0);
  }, []);

  const approvePendingMcpCall = useCallback(async () => {
    if (!pendingMcpCall) return;
    try {
      await approveMcpCall({
        project_id: typeof pendingMcpCall.data.project_id === "number" ? pendingMcpCall.data.project_id : null,
        session_id: pendingMcpCall.session_id,
        server_name: typeof pendingMcpCall.data.server_name === "string" ? pendingMcpCall.data.server_name : "runtime",
        tool_name: pendingMcpCall.tool_name,
        arguments: pendingMcpCall.data,
      });
    } finally {
      setPendingMcpCall(null);
    }
  }, [pendingMcpCall]);

  const denyPendingMcpCall = useCallback(async () => {
    if (!pendingMcpCall) return;
    try {
      await denyMcpCall({
        project_id: typeof pendingMcpCall.data.project_id === "number" ? pendingMcpCall.data.project_id : null,
        session_id: pendingMcpCall.session_id,
        server_name: typeof pendingMcpCall.data.server_name === "string" ? pendingMcpCall.data.server_name : "runtime",
        tool_name: pendingMcpCall.tool_name,
        arguments: pendingMcpCall.data,
      }, "用户拒绝");
    } finally {
      setPendingMcpCall(null);
    }
  }, [pendingMcpCall]);

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
      timelineEvents,
      resetGeneration,
      generate,
      cancel,
    }}>
      {children}
      {pendingMcpCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-5 shadow-xl">
            <h2 className="text-base font-semibold text-foreground">MCP 调用审批</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="rounded-xl bg-muted px-3 py-2">
                <p className="text-xs text-muted-foreground">工具</p>
                <p className="break-all font-medium">{pendingMcpCall.tool_name}</p>
              </div>
              <pre className="max-h-48 overflow-auto rounded-xl bg-muted px-3 py-2 text-xs">
                {JSON.stringify(pendingMcpCall.data, null, 2)}
              </pre>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" className="rounded-full" onClick={denyPendingMcpCall}>拒绝</Button>
              <Button className="rounded-full" onClick={approvePendingMcpCall}>批准</Button>
            </div>
          </div>
        </div>
      )}
    </AiContext.Provider>
  );
}

export function useAI(): AiContextValue {
  const ctx = useContext(AiContext);
  if (!ctx) throw new Error("useAI must be used within an AiProvider");
  return ctx;
}
