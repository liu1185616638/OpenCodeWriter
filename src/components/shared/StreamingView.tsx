import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Streamdown } from "streamdown";
import { ChevronDown, Brain } from "lucide-react";
import "streamdown/styles.css";

// =============================================================================
// Thinking tag parser — fallback for models that output <thinking> tags
// =============================================================================

interface ParsedThinking {
  thinking: string;
  content: string;
  isThinkingOpen: boolean;
}

function parseThinkingTags(raw: string): ParsedThinking {
  const openTag = "<thinking>";
  const closeTag = "</thinking>";

  const openIdx = raw.indexOf(openTag);
  if (openIdx === -1) {
    return { thinking: "", content: raw, isThinkingOpen: false };
  }

  const afterOpen = openIdx + openTag.length;
  const closeIdx = raw.indexOf(closeTag, afterOpen);

  if (closeIdx === -1) {
    return {
      thinking: raw.slice(afterOpen),
      content: "",
      isThinkingOpen: true,
    };
  }

  const thinkingText = raw.slice(afterOpen, closeIdx).trim();
  const afterClose = closeIdx + closeTag.length;
  const contentText = raw.slice(afterClose).trimStart();

  return {
    thinking: thinkingText,
    content: contentText,
    isThinkingOpen: false,
  };
}

// =============================================================================
// useTypewriter — pace out content character-by-character via RAF
// =============================================================================

/** Characters to reveal per animation frame (~16ms). Tuned for readable speed. */
const CHARS_PER_FRAME = 6;

/**
 * Accepts the full (target) content string. Returns a progressively revealed
 * substring that grows toward the target at ~CHARS_PER_FRAME characters per
 * animation frame, giving a typewriter effect regardless of how fast the
 * upstream deltas arrive.
 *
 * When generating stops, the remaining content is revealed immediately so
 * there's no lag between "done" and "fully displayed".
 */
function useTypewriter(fullContent: string, generating: boolean): string {
  const [displayed, setDisplayed] = useState("");
  const fullRef = useRef(fullContent);
  const displayedRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const generatingRef = useRef(generating);

  // Keep refs in sync
  fullRef.current = fullContent;
  generatingRef.current = generating;

  // When generation starts fresh (content reset to ""), reset displayed
  useEffect(() => {
    if (fullContent === "" && displayedRef.current !== "") {
      displayedRef.current = "";
      setDisplayed("");
    }
  }, [fullContent]);

  // Core pacing loop — stable reference, reads from refs
  const tick = useCallback(() => {
    const target = fullRef.current;
    const current = displayedRef.current;

    if (current.length < target.length) {
      const next = target.slice(0, current.length + CHARS_PER_FRAME);
      displayedRef.current = next;
      setDisplayed(next);
    }

    // Continue while there's content to reveal or more may arrive
    if (current.length < target.length || generatingRef.current) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = null;
    }
  }, []);

  // Start / stop the pacing loop based on generating state
  useEffect(() => {
    if (generating) {
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    } else {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Immediately reveal all content when generation ends
      const target = fullRef.current;
      if (displayedRef.current.length < target.length) {
        displayedRef.current = target;
        setDisplayed(target);
      }
    }
  }, [generating, tick]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return displayed;
}

// =============================================================================
// StreamingView component — uses Streamdown + typewriter pacing
// =============================================================================

interface StreamingViewProps {
  content: string;
  thinkingContent: string;
  generating: boolean;
}

/**
 * Stream content renderer with:
 * 1. Thinking panel — auto-expanded during thinking, auto-collapsed when content arrives
 * 2. Typewriter-paced content display via useTypewriter hook
 * 3. Streamdown incremental block rendering with caret
 * 4. Auto-scroll to bottom
 * 5. Fallback <thinking> tag parsing when Rust didn't separate thinking
 */
export function StreamingView({ content, thinkingContent, generating }: StreamingViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const hasEverHadContent = useRef(false);

  // When native thinkingContent is empty but content contains <thinking> tags,
  // parse them as a fallback. This handles models that put thinking text
  // directly in the content delta without the reasoning_content field.
  const parsed = useMemo(() => {
    if (thinkingContent) {
      // Rust already separated thinking — use as-is
      return { thinking: thinkingContent, content, isThinkingOpen: false };
    }
    // Fallback: try to extract <thinking> tags from the content stream
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

  // Typewriter pacing — content grows smoothly regardless of delta size
  const displayedContent = useTypewriter(parsed.content, generating);

  const hasContent = displayedContent.length > 0;

  // Auto-scroll to bottom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [displayedContent, parsed.thinking]);

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
    <div ref={containerRef} className="space-y-3 h-full overflow-auto">
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
            <div className="px-4 pb-3 text-sm text-muted-foreground leading-relaxed border-t border-primary/10 max-h-64 overflow-auto">
              <Streamdown mode="static">{parsed.thinking}</Streamdown>
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

      {/* Main content — typewriter-paced, Streamdown streaming mode with caret */}
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
 * Parse thinking tags from text.
 * Exported for use in editors that need to extract content without thinking.
 */
export function stripThinking(text: string): string {
  const { content } = parseThinkingTags(text);
  return content;
}
