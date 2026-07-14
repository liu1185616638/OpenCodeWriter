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

interface AiCancelledPayload {
  session_id: string;
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
  onCancel?: () => void;
  /** Which creation stage is being generated (e.g. "outline", "characters") */
  stage?: string;
}

interface AiContextValue {
  generating: boolean;
  streamedContent: string;
  thinkingContent: string;
  error: string | null;
  generatingStage: string | undefined;
  /** The stage that just completed (stays set until next generation starts) */
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

type TerminalStatus = Exclude<GenerationStatus, "idle" | "confirming" | "generating">;

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
  const terminalSessionIdsRef = useRef<Set<string>>(new Set());
  const eventIdRef = useRef(0);
  const unlistenFns = useRef<UnlistenFn[]>([]);
  const onCompleteRef = useRef<GenerateOptions["onComplete"]>(undefined);
  const onErrorRef = useRef<GenerateOptions["onError"]>(undefined);
  const onCancelRef = useRef<GenerateOptions["onCancel"]>(undefined);
  const streamedContentRef = useRef("");
  const generatingStageRef = useRef<string | undefined>(undefined);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateStreamedContent = useCallback((updater: string | ((prev: string) => string)) => {
    setStreamedContent((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      streamedContentRef.current = next;
      return next;
    });
  }, []);

  const updateThinkingContent = useCallback((updater: string | ((prev: string) => string)) => {
    setThinkingContent((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  const addTimelineEvent = useCallback((
    eventType: AiTimelineEvent["event_type"],
    label: string,
    detail?: string,
  ) => {
    const id = ++eventIdRef.current;
    const event: AiTimelineEvent = {
      id,
      event_type: eventType,
      label,
      detail,
      timestamp: Date.now(),
    };
    setTimelineEvents((prev) => [...prev, event]);
  }, []);

  const cleanup = useCallback(() => {
    unlistenFns.current.forEach((unlisten) => unlisten());
    unlistenFns.current = [];
  }, []);

  const clearFallbackTimer = useCallback(() => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  const clearElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  /**
   * The only place allowed to move a generation session into a terminal state.
   * Events, invoke completion, invoke errors and user cancellation all pass
   * through this guard so callbacks can run at most once per session.
   */
  const finalizeSession = useCallback((
    sessionId: string,
    status: TerminalStatus,
    detail?: string,
  ): boolean => {
    if (terminalSessionIdsRef.current.has(sessionId)) return false;
    if (sessionIdRef.current !== sessionId) return false;

    terminalSessionIdsRef.current.add(sessionId);

    const completedStage = generatingStageRef.current;
    const onComplete = onCompleteRef.current;
    const onError = onErrorRef.current;
    const onCancel = onCancelRef.current;

    clearFallbackTimer();
    clearElapsedTimer();

    sessionIdRef.current = null;
    generatingStageRef.current = undefined;
    onCompleteRef.current = undefined;
    onErrorRef.current = undefined;
    onCancelRef.current = undefined;

    setGenerating(false);
    setLastCompletedStage(completedStage);
    setGeneratingStage(undefined);
    setGenerationStatus(status);
    setPendingMcpCall(null);
    setGenerationMeta((prev) => (prev ? { ...prev, endedAt: Date.now() } : null));

    if (status === "completed") {
      setError(null);
      addTimelineEvent("done", "生成完成");
    } else if (status === "cancelled") {
      setError(null);
      addTimelineEvent("error", "生成已取消");
    } else {
      const message = detail || "生成失败";
      setError(message);
      addTimelineEvent("error", message);
    }

    cleanup();

    if (status === "completed") {
      onComplete?.(streamedContentRef.current);
    } else if (status === "cancelled") {
      onCancel?.();
    } else {
      onError?.(detail || "生成失败");
    }

    return true;
  }, [addTimelineEvent, cleanup, clearElapsedTimer, clearFallbackTimer]);

  const generate = useCallback(async (
    options: GenerateOptions | string,
    legacyArgs?: Record<string, unknown>,
  ) => {
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
    clearFallbackTimer();
    clearElapsedTimer();
    terminalSessionIdsRef.current.clear();

    const sessionId = crypto.randomUUID();
    sessionIdRef.current = sessionId;
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
    onCancelRef.current = onCancel;

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
      setElapsedMs((prev) => prev + 500);
    }, 500);

    try {
      const chunkUnlisten = await listen<AiChunkPayload>("ai-chunk", (event) => {
        if (event.payload.session_id !== sessionId || sessionIdRef.current !== sessionId) return;
        const { chunk, chunk_type } = event.payload;
        if (chunk_type === "thinking") {
          updateThinkingContent((prev) => prev + chunk);
        } else {
          updateStreamedContent((prev) => prev + chunk);
          setGeneratedCharCount((prev) => prev + chunk.length);
        }
      });

      const doneUnlisten = await listen<AiDonePayload>("ai-done", (event) => {
        if (event.payload.session_id === sessionId) {
          finalizeSession(sessionId, "completed");
        }
      });

      const errorUnlisten = await listen<AiErrorPayload>("ai-error", (event) => {
        if (event.payload.session_id === sessionId) {
          finalizeSession(sessionId, "failed", event.payload.error);
        }
      });

      const cancelledUnlisten = await listen<AiCancelledPayload>("ai-cancelled", (event) => {
        if (event.payload.session_id === sessionId) {
          finalizeSession(sessionId, "cancelled");
        }
      });

      const mcpUnlisten = await listen<McpCallPayload>("ai-mcp-call", (event) => {
        if (event.payload.session_id !== sessionId || sessionIdRef.current !== sessionId) return;
        setPendingMcpCall(event.payload);
        addTimelineEvent(
          "mcp_call",
          `MCP 调用: ${event.payload.tool_name}`,
          JSON.stringify(event.payload.data, null, 2),
        );
      });

      const toolCallUnlisten = await listen<{
        session_id: string;
        tool_name: string;
        data: Record<string, unknown>;
      }>("ai-tool-call", (event) => {
        if (event.payload.session_id === sessionId && sessionIdRef.current === sessionId) {
          addTimelineEvent("tool_call", `工具调用: ${event.payload.tool_name}`);
        }
      });

      const toolResultUnlisten = await listen<{
        session_id: string;
        tool_name: string;
        success: boolean;
        error: string;
      }>("ai-tool-result", (event) => {
        if (event.payload.session_id === sessionId && sessionIdRef.current === sessionId) {
          addTimelineEvent(
            "tool_result",
            `工具结果: ${event.payload.tool_name}`,
            event.payload.success ? undefined : event.payload.error,
          );
        }
      });

      const skillStartUnlisten = await listen<{
        session_id: string;
        skill_name: string;
      }>("ai-skill-start", (event) => {
        if (event.payload.session_id === sessionId && sessionIdRef.current === sessionId) {
          addTimelineEvent("skill_start", `技能开始: ${event.payload.skill_name}`);
        }
      });

      const skillResultUnlisten = await listen<{
        session_id: string;
        skill_name: string;
        success: boolean;
        error: string;
      }>("ai-skill-result", (event) => {
        if (event.payload.session_id === sessionId && sessionIdRef.current === sessionId) {
          addTimelineEvent(
            "skill_result",
            `技能完成: ${event.payload.skill_name}`,
            event.payload.success ? undefined : event.payload.error,
          );
        }
      });

      const mcpResultUnlisten = await listen<{
        session_id: string;
        tool_name: string;
        success: boolean;
        error: string;
      }>("ai-mcp-result", (event) => {
        if (event.payload.session_id === sessionId && sessionIdRef.current === sessionId) {
          addTimelineEvent(
            "mcp_result",
            `MCP 结果: ${event.payload.tool_name}`,
            event.payload.success ? undefined : event.payload.error,
          );
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

      // Some commands may return successfully even when an event could not be
      // emitted. The terminal guard makes this fallback safe and idempotent.
      fallbackTimerRef.current = setTimeout(() => {
        finalizeSession(sessionId, "completed");
      }, 200);
    } catch (cause) {
      const message = String(cause);
      const normalized = message.toLowerCase();
      if (normalized.includes("cancelled") || message.includes("用户取消")) {
        finalizeSession(sessionId, "cancelled");
      } else {
        finalizeSession(sessionId, "failed", message);
      }
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
    if (!sessionId) return;

    // Finalize locally first so a backend event or the original invoke rejection
    // cannot race the UI into a failed state.
    finalizeSession(sessionId, "cancelled");

    try {
      await cancelAiSession(sessionId);
    } catch (cause) {
      console.error("Failed to cancel AI session:", cause);
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
        project_id: typeof pendingMcpCall.data.project_id === "number"
          ? pendingMcpCall.data.project_id
          : null,
        session_id: pendingMcpCall.session_id,
        server_name: typeof pendingMcpCall.data.server_name === "string"
          ? pendingMcpCall.data.server_name
          : "runtime",
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
        project_id: typeof pendingMcpCall.data.project_id === "number"
          ? pendingMcpCall.data.project_id
          : null,
        session_id: pendingMcpCall.session_id,
        server_name: typeof pendingMcpCall.data.server_name === "string"
          ? pendingMcpCall.data.server_name
          : "runtime",
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
      clearFallbackTimer();
      clearElapsedTimer();
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
              <Button variant="outline" className="rounded-full" onClick={denyPendingMcpCall}>
                拒绝
              </Button>
              <Button className="rounded-full" onClick={approvePendingMcpCall}>
                批准
              </Button>
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
