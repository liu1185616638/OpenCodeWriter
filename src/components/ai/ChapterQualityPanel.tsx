import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listChapterReviews } from "@/lib/tauri";
import { useAI } from "@/contexts/AIContext";
import { useSettings } from "@/hooks/useSettings";
import { stripThinking } from "@/components/shared/StreamingView";
import { saveContent } from "@/lib/tauri";
import type { ChapterReview, ReviewIssue } from "@/types";
import { ClipboardCheck, Wrench } from "lucide-react";
import { toast } from "sonner";

interface ChapterQualityPanelProps {
  projectId: number;
  chapterId: number | null;
  hasContent: boolean;
  onContentRepaired?: (content: string) => void;
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

export function ChapterQualityPanel({ projectId, chapterId, hasContent, onContentRepaired }: ChapterQualityPanelProps) {
  const [reviews, setReviews] = useState<ChapterReview[]>([]);
  const { generating, streamedContent, generatingStage, generate, cancel } = useAI();
  const { currentPreset } = useSettings();

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
    if (!generating && generatingStage === "review") {
      loadReviews();
    }
    if (!generating && generatingStage === "repair" && streamedContent) {
      // Auto-save repaired content
      const cleaned = stripThinking(streamedContent);
      if (chapterId && cleaned.trim()) {
        saveContent(projectId, chapterId, cleaned)
          .then(() => {
            toast.success("修复后的正文已自动保存");
            onContentRepaired?.(cleaned);
            loadReviews();
          })
          .catch(() => toast.error("修复内容保存失败"));
      }
    }
  }, [generating, generatingStage, streamedContent, chapterId, projectId, onContentRepaired, loadReviews]);

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
    await generate({
      command: "repair_chapter_content",
      stage: "repair",
      args: {
        projectId,
        chapterId,
        presetId: currentPreset.id,
      },
      onComplete: () => {
        // Auto-save effect handles saving
      },
      onError: (err) => {
        toast.error("修复失败", { description: err });
      },
    });
  }, [currentPreset, chapterId, projectId, generate]);

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

  if (!chapterId) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">
        选择章节后查看质量审核
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
              正在修复中...
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
                    <div key={idx} className="rounded-xl border border-border p-2.5 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={severityVariant(issue.severity)} className="text-[10px] h-4 px-1.5">
                          {issue.severity === "high" ? "严重" : issue.severity === "medium" ? "中等" : "轻微"}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          {issueTypeLabel(issue.type)}
                        </Badge>
                      </div>
                      <p className="text-xs text-foreground">{issue.description}</p>
                      {issue.location && (
                        <p className="text-[10px] text-muted-foreground italic">位置：{issue.location}</p>
                      )}
                    </div>
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
