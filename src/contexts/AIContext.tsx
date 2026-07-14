import { createContext, useContext, useRef, useCallback, useState, useEffect, type ReactNode } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { approveMcpCall, denyMcpCall, cancelAiSession } from "@/lib/tauri";
import type { GenerationStatus, GenerationTaskMeta } from "../types/ai";
import type { AiTimelineEvent } from "@/types";

interface AiChunkPayload {
  session_id: string;
  chunk: string;
  chunk_type: string;
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

type TerminalStatus = "completed" | "failed" | "cancelled";

export interface GenerateOptions {
  command: string;
  args: Record<string, unknown>;
  onComplete?: (content: string) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
  stage?: string;
}

interface AiContextValue {
  generating: boolean;
  streamedContent: string;
  thinkingContent: string;
  error: string | null;
  generatingStage: string | undefined;
  lastCompletedStage: string | undefined;
  generationStatus: GenerationStatus;
  generationMeta: GenerationTaskMeta | null;
  generatedCharCount: number;
  elapsedMs: number;
  timelineEvents: AiTimelineEvent[];
  resetGeneration: () => void;
  generate: (options: GenerateOptions | string, legacyArgs?: Record<string, unknown>) => Promise<void>;
  cancel: () => Promise<void>;
}

const AiContext = createContext<AiContextValue | null>(null);

export function AiProvider({ children }: { children: ReactNode }) {
  const [generating, setGenerating] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const [thinkingContent, setThinkingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [generatingStage, setGeneratingStage] = useState<string | undefined>(undefined);
  const [lastCompletedStage, setLastCompletedStage] = useState<string | undefined>(undefined);
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
  const onCancelRef = useRef<GenerateOptions["onCancel"]>(undefined);
  const streamedContentRef = useRef("");
  const generatingStageRef = useRef<string | undefined>(undefined);
  const terminalSessionIdsRef = useRef(new Set<string>());
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateStreamedContent = useCallback((updater: string | ((previous: string) => string)) => {
    setStreamedContent((previous) => {
      const next = typeof updater === "function" ? updater(previous) : updater;
      streamedContentRef.current = next;
      return next;
    });
  }, []);

  const updateThinkingContent = useCallback((updater: string | ((previous: string) => string)) => {
    setThinkingContent((previous) => typeof updater === "function" ? updater(previous) : updater);
  }, []);

  const addTimelineEvent = useCallback((eventType: AiTimelineEvent["event_type"], label: string, detail?: string) => {
    const id = ++eventIdRef.current;
    setTimelineEvents((previous) => [
      ...previous,
      { id, event_type: eventType, label, detail, timestamp: Date.now() },
    ]);
  }, []);

  const cleanup = useCallback(() => {
    unlistenFns.current.forEach((unlisten) => unlisten());
    unlistenFns.current = [];
  }, []);

  const clearElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  const clearFallbackTimer = useCallback(() => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  const finalizeSession = useCallback((
    sessionId: string,
    status: TerminalStatus,
    detail?: string,
  ): boolean => {
    if (terminalSessionIdsRef.current.has(sessionId)) return false;
    terminalSessionIdsRef.current.add(sessionId);
    window.setTimeout(() => terminalSessionIdsRef.current.delete(sessionId), 30_000);

    clearFallbackTimer();
    clearElapsedTimer();

    const completedStage = generatingStageRef.current;
    setGenerating(false);
    setLastCompletedStage(completedStage);
    setGeneratingStage(undefined);
    generatingStageRef.current = undefined;
    setGenerationStatus(status);
    setPendingMcpCall(null);
    setGenerationMeta((previous) => previous ? { ...previous, endedAt: Date.now() } : null);

    if (status === "completed") {
      setError(null);
      addTimelineEvent("done", "生成完成");
    } else if (status === "cancelled") {
      setError(null);
      addTimelineEvent("error", detail || "生成已取消");
    } else {
      const message = detail || "生成失败";
      setError(message);
      addTimelineEvent("error", message);
    }

    if (sessionIdRef.current === sessionId) {
      sessionIdRef.current = null;
    }

    cleanup();

    if (status === "completed") {
      onCompleteRef.current?.(streamedContentRef.current);
    } else if (status === "cancelled") {
      onCancelRef.current?.();
    } else {
      onErrorRef.current?.(detail || "生成失败");
    }

    onCompleteRef.current = undefined;
    onErrorRef.current = undefined;
    onCancelRef.current = undefined;
    return true;
  }, [addTimelineEvent, cleanup, clearElapsedTimer, clearFallbackTimer]);

  const generate = useCallback(async (options: GenerateOptions | string, legacyArgs?: Record<string, unknown>) => {
    let command: string;
    let args: Record<string, unknown>;
    let onComplete: GenerateOptions["onComplete"];
    let onError: GenerateOptions["onError"];
    let onCancel: GenerateOptions["onCancel"];
    let stage: string | undefined;

    if (typeof options === "string") {
      command = options;
      args = legacyArgs ?? {};
    } else {
      command = options.command;
      args = options.args;
      onComplete = options.onComplete;
      onError = options.onError;
      onCancel = options.onCancel;
      stage = options.stage;
    }

    cleanup();
    clearElapsedTimer();
    clearFallbackTimer();

    setGenerating(true);
    setGeneratingStage(stage);
    generatingStageRef.current = stage;
    setLastCompletedStage(undefined);
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

    elapsedTimerRef.current = setInterval(() => {
      setElapsedMs((previous) => previous + 500);
    }, 500);

    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
    onCancelRef.current = onCancel;

    const sessionId = crypto.randomUUID();
    sessionIdRef.current = sessionId;

    try {
      const chunkUnlisten = await listen<AiChunkPayload>("ai-chunk", (event) => {
        if (event.payload.session_id !== sessionIdRef.current) return;
        const { chunk, chunk_type } = event.payload;
        if (chunk_type === "thinking") {
          updateThinkingContent((previous) => previous + chunk);
        } else {
          updateStreamedContent((previous) => previous + chunk);
          setGeneratedCharCount((previous) => previous + chunk.length);
        }
      });

      const doneUnlisten = await listen<AiDonePayload>("ai-done", (event) => {
        if (event.payload.session_id === sessionIdRef.current) {
          finalizeSession(event.payload.session_id, "completed");
        }
      });

      const errorUnlisten = await listen<AiErrorPayload>("ai-error", (event) => {
        if (event.payload.session_id === sessionIdRef.current) {
          finalizeSession(event.payload.session_id, "failed", event.payload.error);
        }
      });

      const cancelledUnlisten = await listen<AiErrorPayload>("ai-cancelled", (event) => {
        if (event.payload.session_id === sessionIdRef.current) {
          finalizeSession(event.payload.session_id, "cancelled", event.payload.error);
        }
      });

      const mcpUnlisten = await listen<McpCallPayload>("ai-mcp-call", (event) => {
        if (event.payload.session_id === sessionIdRef.current) {
          setPendingMcpCall(event.payload);
          addTimelineEvent("mcp_call", `MCP 调用: ${event.payload.tool_name}`, JSON.stringify(event.payload.data, null, 2));
        }
      });

      const toolCallUnlisten = await listen<{ session_id: string; tool_name: string }>("ai-tool-call", (event) => {
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

      unlistenFns.current = [
        chunkUnlisten,
        doneUnlisten,
        errorUnlisten,
        cancelledUnlisten,
        mcpUnlisten,
        toolCallUnlisten,
        toolResultUnlisten,
        skillStartUnlisten,
        skillResultUnlisten,
        mcpResultUnlisten,
      ];

      await invoke(command, { sessionId, ...args });

      if (!terminalSessionIdsRef.current.has(sessionId)) {
        fallbackTimerRef.current = setTimeout(() => {
          finalizeSession(sessionId, "completed");
        }, 250);
      }
    } catch (invokeError) {
      finalizeSession(sessionId, "failed", String(invokeError));
    }
  }, [
    addTimelineEvent,
    cleanup,
    clearElapsedTimer,
    clearFallbackTimer,
    finalizeSession,
    updateStreamedContent,
    updateThinkingContent,
  ]);

  const cancel = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || terminalSessionIdsRef.current.has(sessionId)) return;

    try {
      await cancelAiSession(sessionId);
    } finally {
      finalizeSession(sessionId, "cancelled", "用户取消了生成任务");
    }
  }, [finalizeSession]);

  const resetGeneration = useCallback(() => {
    setGenerationStatus("idle");
    setGenerationMeta(null);
    setGeneratedCharCount(0);
    setElapsedMs(0);
    setError(null);
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

  useEffect(() => {
    return () => {
      cleanup();
      clearElapsedTimer();
      clearFallbackTimer();
    };
  }, [cleanup, clearElapsedTimer, clearFallbackTimer]);

  return (
    <AiContext.Provider value={{
      generating,
      streamedContent,
      thinkingContent,
      error,
      generatingStage,
      lastCompletedStage,
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
  const context = useContext(AiContext);
  if (!context) throw new Error("useAI must be used within an AiProvider");
  return context;
}
