/**
 * ChapterQualityPanel — Phase G 审核修复增强
 *
 * - 审核问题显示 quote 引用文本
 * - 点击问题可定位到正文中的对应位置
 * - 修复结果不直接覆盖，先展示 diff 预览
 * - 支持全部应用、放弃
 * - 正文已变化时提示重新审核
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listChapterReviews } from "@/lib/tauri";
import { useAI } from "@/contexts/AIContext";
import { useSettings } from "@/hooks/useSettings";
import { stripThinking } from "@/components/shared/StreamingView";
import { saveContent } from "@/lib/tauri";
import type { ChapterReview, ReviewIssue } from "@/types";
import { ClipboardCheck, Wrench, Check, X, AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";

interface ChapterQualityPanelProps {
  projectId: number;
  chapterId: number | null;
  hasContent: boolean;
  /** Current content text for quote matching and version check */
  currentContent?: string;
  onContentRepaired?: (content: string) => void;
  /** Called when user clicks an issue, to scroll the editor to the quote position */
  onLocateIssue?: (start: number, end: number) => void;
}

function scoreColor(score: number): string {
  if (score >= 90) return "text-green-600";
  if (score >= 70) return "text-blue-600";
  if (score >= 50) return "text-yellow-600";
  return "text-red-600";
}

function scoreBg(score: number): string {
  if (score >= 90) return "bg-green-500";
  if (score >= 70) return "bg-blue-500";
  if (score >= 50) return "bg-yellow-500";
  return "bg-red-500";
}

function severityVariant(severity: string): "destructive" | "default" | "secondary" {
  switch (severity) {
    case "high": return "destructive";
    case "medium": return "default";
    default: return "secondary";
  }
}

function issueTypeLabel(type: string): string {
  switch (type) {
    case "continuity": return "连续性";
    case "character": return "人物";
    case "pacing": return "节奏";
    case "quality": return "质量";
    default: return type;
  }
}

/** Compute a simple line-level diff between two texts */
function computeDiff(original: string, repaired: string): Array<{ type: "same" | "added" | "removed"; text: string }> {
  const origLines = original.split("\n");
  const newLines = repaired.split("\n");
  const result: Array<{ type: "same" | "added" | "removed"; text: string }> = [];
  const maxLen = Math.max(origLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const orig = origLines[i];
    const neu = newLines[i];
    if (orig === neu) {
      if (orig !== undefined) result.push({ type: "same", text: orig });
    } else {
      if (orig !== undefined) result.push({ type: "removed", text: orig });
      if (neu !== undefined) result.push({ type: "added", text: neu });
    }
  }
  return result;
}

export function ChapterQualityPanel({ projectId, chapterId, hasContent, currentContent = "", onContentRepaired, onLocateIssue }: ChapterQualityPanelProps) {
  const [reviews, setReviews] = useState<ChapterReview[]>([]);
  const [repairDraft, setRepairDraft] = useState<string | null>(null);
  const [repairOriginal, setRepairOriginal] = useState<string>("");
  const { generating, generatingStage, generate, cancel, lastCompletedStage, generationStatus } = useAI();
  const { currentPreset } = useSettings();
  const contentRef = useRef(currentContent);
  contentRef.current = currentContent;

  const loadReviews = useCallback(async () => {
    if (!chapterId) {
      setReviews([]);
      return;
    }
    try {
      const list = await listChapterReviews(projectId, chapterId, 3);
      setReviews(list);
    } catch (e) {
      console.error("Failed to load reviews:", e);
    }
  }, [projectId, chapterId]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  // Reload reviews when review generation completes
  useEffect(() => {
    if (!generating && lastCompletedStage === "review" && generationStatus === "completed") {
      loadReviews();
    }
  }, [generating, lastCompletedStage, generationStatus, loadReviews]);

  const handleReview = useCallback(async () => {
    if (!currentPreset || !chapterId) return;
    await generate({
      command: "review_chapter_content",
      stage: "review",
      args: {
        projectId,
        chapterId,
        presetId: currentPreset.id,
      },
      onComplete: () => {
        toast.success("审核完成");
        loadReviews();
      },
      onError: (err) => {
        toast.error("审核失败", { description: err });
      },
    });
  }, [currentPreset, chapterId, projectId, generate, loadReviews]);

  const handleRepair = useCallback(async () => {
    if (!currentPreset || !chapterId) return;
    setRepairDraft(null);
    await generate({
      command: "repair_chapter_content",
      stage: "repair",
      args: {
        projectId,
        chapterId,
        presetId: currentPreset.id,
      },
      onComplete: (content) => {
        const cleaned = stripThinking(content);
        if (cleaned.trim()) {
          setRepairOriginal(contentRef.current);
          setRepairDraft(cleaned);
        }
      },
      onError: (err) => {
        toast.error("修复失败", { description: err });
      },
    });
  }, [currentPreset, chapterId, projectId, generate]);

  const handleApplyRepair = useCallback(async () => {
    if (!repairDraft || !chapterId) return;
    try {
      await saveContent(projectId, chapterId, repairDraft);
      toast.success("修复内容已应用并保存");
      onContentRepaired?.(repairDraft);
      setRepairDraft(null);
      loadReviews();
    } catch (e) {
      toast.error("应用修复失败", { description: String(e) });
    }
  }, [repairDraft, chapterId, projectId, onContentRepaired, loadReviews]);

  const handleDiscardRepair = useCallback(() => {
    setRepairDraft(null);
    toast.info("已放弃修复结果");
  }, []);

  const handleLocateIssue = useCallback((issue: ReviewIssue) => {
    if (!issue.quote && issue.start === undefined) return;
    // Try to find the quote in the current content
    let start = issue.start;
    let end = issue.end;
    if ((start === undefined || end === undefined) && issue.quote && currentContent) {
      const idx = currentContent.indexOf(issue.quote);
      if (idx >= 0) {
        start = idx;
        end = idx + issue.quote.length;
      }
    }
    if (start !== undefined && end !== undefined && onLocateIssue) {
      onLocateIssue(start, end);
    } else if (issue.quote) {
      // Quote not found in current content - content may have changed
      toast.warning("无法在当前正文中定位该问题，正文可能已被修改", {
        description: "建议重新审核以获取最新的问题定位",
      });
    }
  }, [currentContent, onLocateIssue]);

  const latestReview = reviews[0];
  const isReviewing = generating && generatingStage === "review";
  const isRepairing = generating && generatingStage === "repair";
  const isBusy = generating && (isReviewing || isRepairing);

  // Parse issues from latest review
  let issues: ReviewIssue[] = [];
  if (latestReview) {
    try {
      issues = JSON.parse(latestReview.issues_json);
    } catch {
      issues = [];
    }
  }

  // Check if content has changed since the latest review
  const contentChangedSinceReview = latestReview && currentContent && hasContent;

  if (!chapterId) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">
        选择章节后查看质量审核
      </div>
    );
  }

  // Show repair diff preview
  if (repairDraft !== null) {
    const diffLines = computeDiff(repairOriginal, repairDraft);
    const addedCount = diffLines.filter(l => l.type === "added").length;
    const removedCount = diffLines.filter(l => l.type === "removed").length;

    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">修复预览</h3>
          <div className="flex gap-1.5">
            <Button size="sm" onClick={handleApplyRepair} className="rounded-full h-7 px-3 gap-1">
              <Check className="h-3 w-3" />应用修复
            </Button>
            <Button size="sm" variant="outline" onClick={handleDiscardRepair} className="rounded-full h-7 px-3 gap-1">
              <X className="h-3 w-3" />放弃
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="px-4 py-3">
            <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="text-red-500">- {removedCount} 行修改</span>
              <span className="text-green-500">+ {addedCount} 行修改</span>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                {diffLines.map((line, i) => (
                  <div
                    key={i}
                    className={`px-3 py-0.5 ${
                      line.type === "added"
                        ? "bg-green-500/10 text-green-700 dark:text-green-400"
                        : line.type === "removed"
                        ? "bg-red-500/10 text-red-700 dark:text-red-400 line-through"
                        : ""
                    }`}
                  >
                    <span className="select-none mr-2 opacity-50">
                      {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                    </span>
                    {line.text || " "}
                  </div>
                ))}
              </pre>
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header with action buttons */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">质量审核</h3>
        <div className="flex gap-1.5">
          {isBusy ? (
            <Button size="sm" variant="destructive" onClick={cancel} className="rounded-full h-7 px-3">
              停止
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleReview}
                disabled={!currentPreset || !hasContent}
                className="rounded-full h-7 px-3 gap-1"
              >
                <ClipboardCheck className="h-3 w-3" />
                {latestReview ? "重新审核" : "AI 审核"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRepair}
                disabled={!currentPreset || !hasContent || !latestReview}
                className="rounded-full h-7 px-3 gap-1"
              >
                <Wrench className="h-3 w-3" />
                一键修复
              </Button>
            </>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-4 py-3 space-y-3">
          {/* Streaming indicator */}
          {isReviewing && (
            <div className="text-sm text-muted-foreground animate-pulse">
              正在审核中...
            </div>
          )}
          {isRepairing && (
            <div className="text-sm text-muted-foreground animate-pulse">
              正在修复中，完成后将显示差异预览...
            </div>
          )}

          {/* No review yet */}
          {!latestReview && !isReviewing && (
            <div className="text-sm text-muted-foreground text-center py-6">
              {hasContent
                ? "点击「AI 审核」评估本章质量"
                : "请先生成正文，再进行审核"}
            </div>
          )}

          {/* Latest review */}
          {latestReview && (
            <>
              {/* Content changed warning */}
              {contentChangedSinceReview && (
                <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-yellow-600 mt-0.5" />
                  <p className="text-xs text-yellow-700 dark:text-yellow-500">
                    正文在审核后已有修改，问题定位可能不准确。建议重新审核。
                  </p>
                </div>
              )}

              {/* Score cards */}
              <div className="grid grid-cols-2 gap-2">
                <ScoreCard label="总评" score={latestReview.overall_score} scoreColor={scoreColor} scoreBg={scoreBg} />
                <ScoreCard label="连续性" score={latestReview.continuity_score} scoreColor={scoreColor} scoreBg={scoreBg} />
                <ScoreCard label="人物" score={latestReview.character_score} scoreColor={scoreColor} scoreBg={scoreBg} />
                <ScoreCard label="节奏" score={latestReview.pacing_score} scoreColor={scoreColor} scoreBg={scoreBg} />
              </div>

              {/* Issues list */}
              {issues.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">发现问题（{issues.length}）</h4>
                  {issues.map((issue, idx) => (
                    <IssueCard
                      key={idx}
                      issue={issue}
                      onLocate={() => handleLocateIssue(issue)}
                    />
                  ))}
                </div>
              )}

              {/* Suggestions */}
              {latestReview.suggestions && (
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-muted-foreground">修复建议</h4>
                  <p className="text-xs text-foreground rounded-xl bg-muted/50 p-2.5">
                    {latestReview.suggestions}
                  </p>
                </div>
              )}

              {/* Timestamp */}
              <p className="text-[10px] text-muted-foreground text-right">
                审核时间：{new Date(latestReview.created_at).toLocaleString("zh-CN")}
              </p>
            </>
          )}

          {/* History */}
          {reviews.length > 1 && (
            <details className="pt-2 border-t border-border">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                历史审核记录（{reviews.length - 1}）
              </summary>
              <div className="mt-2 space-y-1.5">
                {reviews.slice(1).map((review, idx) => (
                  <div key={idx} className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className={`font-medium ${scoreColor(review.overall_score)}`}>
                      {review.overall_score}分
                    </span>
                    <span>{new Date(review.created_at).toLocaleString("zh-CN")}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function IssueCard({ issue, onLocate }: { issue: ReviewIssue; onLocate: () => void }) {
  return (
    <div className="rounded-xl border border-border p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Badge variant={severityVariant(issue.severity)} className="text-[10px] h-4 px-1.5">
          {issue.severity === "high" ? "严重" : issue.severity === "medium" ? "中等" : "轻微"}
        </Badge>
        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
          {issueTypeLabel(issue.type)}
        </Badge>
        {issue.quote && (
          <button
            onClick={onLocate}
            className="ml-auto flex items-center gap-0.5 text-[10px] text-primary hover:underline"
            title="定位到正文"
          >
            <Search className="h-3 w-3" />
            定位
          </button>
        )}
      </div>
      <p className="text-xs text-foreground">{issue.description}</p>
      {issue.quote && (
        <div className="rounded-md bg-muted/60 px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground italic">
            「{issue.quote.length > 80 ? issue.quote.slice(0, 80) + "..." : issue.quote}」
          </p>
        </div>
      )}
      {!issue.quote && issue.location && (
        <p className="text-[10px] text-muted-foreground italic">位置：{issue.location}</p>
      )}
    </div>
  );
}

function ScoreCard({
  label,
  score,
  scoreColor,
  scoreBg,
}: {
  label: string;
  score: number;
  scoreColor: (s: number) => string;
  scoreBg: (s: number) => string;
}) {
  return (
    <div className="rounded-xl border border-border p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${scoreColor(score)}`}>{score}</div>
      <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full ${scoreBg(score)} transition-all`}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
    </div>
  );
}
