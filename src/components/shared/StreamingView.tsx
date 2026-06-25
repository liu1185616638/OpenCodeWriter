import { useEffect, useRef, useState, useMemo } from "react";
import { Streamdown } from "streamdown";
import { ChevronDown, Brain } from "lucide-react";
import "streamdown/styles.css";

// =============================================================================
// Thinking tag parser — fallback for models that output <thinking>/<think> tags
// =============================================================================

interface ParsedThinking {
  thinking: string;
  content: string;
  isThinkingOpen: boolean;
}

const TAG_PAIRS = [
  { open: "<thinking>", close: "</thinking>" },
  { open: "<think>", close: "</think>" },
];

/**
 * Parse `<thinking>...</thinking>` and `<think>...</think>` tags from raw text.
 * Matches whichever opening tag appears first. Used as fallback for models
 * that embed thinking in content deltas instead of the `reasoning_content`
 * SSE field.
 */
function parseThinkingTags(raw: string): ParsedThinking {
  let matched: { open: string; close: string; openIdx: number } | null = null;

  for (const pair of TAG_PAIRS) {
    const openIdx = raw.indexOf(pair.open);
    if (openIdx !== -1) {
      if (!matched || openIdx < matched.openIdx) {
        matched = { ...pair, openIdx };
      }
    }
  }

  if (!matched) {
    return { thinking: "", content: raw, isThinkingOpen: false };
  }

  const afterOpen = matched.openIdx + matched.open.length;
  const closeIdx = raw.indexOf(matched.close, afterOpen);

  if (closeIdx === -1) {
    const beforeThinking = raw.slice(0, matched.openIdx).trim();
    return {
      thinking: raw.slice(afterOpen),
      content: beforeThinking,
      isThinkingOpen: true,
    };
  }

  const thinkingText = raw.slice(afterOpen, closeIdx).trim();
  const beforeThinking = raw.slice(0, matched.openIdx).trim();
  const afterThinking = raw.slice(closeIdx + matched.close.length).trimStart();

  return {
    thinking: thinkingText,
    content: [beforeThinking, afterThinking].filter(Boolean).join("\n\n"),
    isThinkingOpen: false,
  };
}

// =============================================================================
// StreamingView component — uses Streamdown for incremental rendering
//
// SSE deltas are small (1-5 tokens each) and naturally produce a typewriter
// effect when each delta triggers a React state update → Streamdown re-render.
// No RAF-based typewriter pacing is needed.
// =============================================================================

interface StreamingViewProps {
  content: string;
  thinkingContent: string;
  generating: boolean;
}

/**
 * Stream content renderer with:
 * 1. Thinking panel — auto-expanded during thinking, auto-collapsed when content arrives
 * 2. Direct delta-driven content display (no typewriter RAF)
 * 3. Streamdown incremental block rendering with caret
 * 4. Auto-scroll to bottom (both main container and thinking panel)
 * 5. Fallback <thinking>/<think> tag parsing when Rust didn't separate thinking
 */
export function StreamingView({ content, thinkingContent, generating }: StreamingViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const thinkingScrollRef = useRef<HTMLDivElement>(null);
  const thinkingBottomRef = useRef<HTMLDivElement>(null);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const hasEverHadContent = useRef(false);

  // When native thinkingContent is empty but content contains <thinking>/<think> tags,
  // parse them as a fallback.
  const parsed = useMemo(() => {
    if (thinkingContent) {
      // Rust already separated thinking — use as-is
      return { thinking: thinkingContent, content, isThinkingOpen: false };
    }
    // Fallback: try to extract thinking tags from the content stream
    return parseThinkingTags(content);
  }, [thinkingContent, content]);

  const hasThinkingStarted = parsed.thinking.length > 0;
  const isThinkingPhase = generating && (parsed.isThinkingOpen || (hasThinkingStarted && parsed.content.length === 0));

  // Track whether we've ever received real (non-thinking) content
  if (parsed.content.length > 0) {
    hasEverHadContent.current = true;
  }

  // Auto-expand thinking panel when thinking starts arriving
  useEffect(() => {
    if (hasThinkingStarted && isThinkingPhase && !thinkingExpanded) {
      setThinkingExpanded(true);
    }
  }, [hasThinkingStarted, isThinkingPhase, thinkingExpanded]);

  // Auto-collapse thinking when real content starts arriving
  useEffect(() => {
    if (hasEverHadContent.current && thinkingExpanded) {
      setThinkingExpanded(false);
    }
  }, [parsed.content.length, thinkingExpanded]);

  // Direct delta-driven display — SSE chunks are already 1-5 tokens each,
  // so Streamdown's incremental rendering gives a natural typewriter effect.
  const displayedContent = parsed.content;
  const hasContent = displayedContent.length > 0;

  // Auto-scroll main container to bottom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [displayedContent, parsed.thinking]);

  // Auto-scroll thinking panel to bottom
  useEffect(() => {
    const el = thinkingScrollRef.current;
    if (!el || !thinkingExpanded) return;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom) {
      requestAnimationFrame(() => {
        thinkingBottomRef.current?.scrollIntoView({ block: "end" });
      });
    }
  }, [parsed.thinking, thinkingExpanded]);

  // Reset state when generation session ends completely
  useEffect(() => {
    if (!generating && !hasThinkingStarted && !hasContent) {
      hasEverHadContent.current = false;
    }
  }, [generating, hasThinkingStarted, hasContent]);

  if (!generating && !hasThinkingStarted && !hasContent) {
    return null;
  }

  return (
    <div ref={containerRef} className="space-y-3 overflow-auto">
      {/* Thinking panel — auto-expanded during thinking phase */}
      {hasThinkingStarted && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
          <button
            className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-primary/10 transition-colors"
            onClick={() => setThinkingExpanded(!thinkingExpanded)}
          >
            {isThinkingPhase ? (
              <span className="flex items-center gap-1.5">
                <Brain className="h-4 w-4 text-primary animate-pulse" />
                <span className="text-sm font-medium text-primary animate-pulse">AI 正在构思...</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Brain className="h-4 w-4" />
                <span>构思过程</span>
                <span className="text-xs">({parsed.thinking.length} 字)</span>
              </span>
            )}
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground ml-auto transition-transform ${
                thinkingExpanded ? "rotate-0" : "-rotate-90"
              }`}
            />
          </button>

          {thinkingExpanded && (
            <div
              ref={thinkingScrollRef}
              className="px-4 pb-3 text-sm text-muted-foreground leading-relaxed border-t border-primary/10 max-h-64 overflow-auto"
            >
              <Streamdown mode="static">{parsed.thinking}</Streamdown>
              <div ref={thinkingBottomRef} />
            </div>
          )}
        </div>
      )}

      {/* Waiting for response (no thinking, no content yet) */}
      {generating && !hasThinkingStarted && !hasContent && (
        <div className="flex items-center gap-2 px-1 py-2 text-muted-foreground">
          <span className="inline-block h-4 w-0.5 bg-primary animate-pulse" />
          <span className="text-sm">等待模型响应...</span>
        </div>
      )}

      {/* Main content — direct delta-driven rendering via Streamdown */}
      {hasContent && (
        <Streamdown
          mode={generating ? "streaming" : "static"}
          animated
          isAnimating={generating}
          caret="circle"
          parseIncompleteMarkdown={generating}
        >
          {displayedContent}
        </Streamdown>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

/**
 * Strip `<thinking>...</thinking>` and `<think>...</think>` tags from text.
 * Exported for use in editors that need to extract content without thinking.
 */
export function stripThinking(text: string): string {
  const { content } = parseThinkingTags(text);
  return content;
}
