import { useEffect, useMemo, useRef } from "react";
import { Streamdown } from "streamdown";
import { Brain, Loader2 } from "lucide-react";

interface GeneratingLoaderProps {
  /** Thinking content from the AI (chain-of-thought) */
  thinkingContent: string;
  /** Raw generated content received so far, useful for JSON-returning tasks */
  outputContent?: string;
  /** Label shown during loading, e.g. "正在生成人物..." */
  label: string;
  /** Whether generation is in progress */
  generating: boolean;
  /** Elapsed milliseconds since generation started */
  elapsedMs?: number;
  /** Characters received so far (content + thinking) */
  charCount?: number;
  /** Model name for display */
  modelName?: string;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Loading indicator for JSON-returning AI generation stages (characters, chapters).
 * Shows thinking/content deltas, a loading spinner, and real-time progress
 * (elapsed time, characters received, model name).
 */
export function GeneratingLoader({
  thinkingContent,
  outputContent = "",
  label,
  generating,
  elapsedMs = 0,
  charCount = 0,
  modelName,
}: GeneratingLoaderProps) {
  const hasThinking = thinkingContent.trim().length > 0;
  const hasOutput = outputContent.trim().length > 0;
  const panelRef = useRef<HTMLDivElement>(null);

  const thinking = useMemo(() => thinkingContent.trim(), [thinkingContent]);
  const output = useMemo(() => outputContent.trim(), [outputContent]);

  useEffect(() => {
    if (panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
    }
  }, [thinking, output]);

  if (!generating && !hasThinking && !hasOutput) return null;

  const elapsedStr = formatElapsed(elapsedMs);

  return (
    <div className="space-y-3">
      {/* Streaming panel */}
      {(hasThinking || hasOutput) && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5">
            {generating ? (
              <>
                <Brain className="h-4 w-4 text-primary animate-pulse" />
                <span className="text-sm font-medium text-primary animate-pulse">{label}</span>
              </>
            ) : (
              <>
                <Brain className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">构思过程</span>
              </>
            )}
          </div>
          <div ref={panelRef} className="px-4 pb-3 text-sm text-muted-foreground leading-relaxed border-t border-primary/10 max-h-80 overflow-auto app-scrollbar">
            {hasThinking && (
              <div className="pt-3">
                <div className="mb-1 text-xs font-medium text-primary">构思过程</div>
                <Streamdown mode="streaming">{thinking}</Streamdown>
              </div>
            )}
            {hasOutput && (
              <div className="pt-3">
                <div className="mb-1 text-xs font-medium text-primary">生成结果</div>
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/80">
                  {output}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading indicator with progress info */}
      {generating && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 px-1 py-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 text-primary animate-spin" />
              <span className="text-sm text-primary">
                {hasOutput ? "正在接收生成结果..." : hasThinking ? "正在解析生成结果..." : label}
              </span>
            </div>
            {/* Progress badges */}
            <div className="flex items-center gap-2">
              {modelName && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {modelName}
                </span>
              )}
              {charCount > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {charCount.toLocaleString()} 字
                </span>
              )}
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary tabular-nums">
                {elapsedStr}
              </span>
            </div>
          </div>
          {/* Patience hint: show when waiting > 15s with no content received */}
          {charCount === 0 && elapsedMs > 15000 && (
            <div className="px-1 pb-2 text-xs text-muted-foreground/70">
              模型正在生成中，请耐心等待...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
