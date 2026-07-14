/**
 * ChapterQualityPanel — 审核、修复草稿与差异预览。
 *
 * 修复任务使用独立的 "repair-draft" stage，流式输出不会进入正文编辑器。
 * 只有用户明确点击“应用修复”后才写入正文。
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listChapterReviews, saveContent } from "@/lib/tauri";
import { useAI } from "@/contexts/AIContext";
import { useSettings } from "@/hooks/useSettings";
import { stripThinking } from "@/components/shared/StreamingView";
import type { ChapterReview, ReviewIssue } from "@/types";
import { ClipboardCheck, Wrench, Check, X, Search } from "lucide-react";
import { toast } from "sonner";

const REPAIR_DRAFT_STAGE = "repair-draft";

interface ChapterQualityPanelProps {
  projectId: number;
  chapterId: number | null;
  hasContent: boolean;
  currentContent?: string;
  onContentRepaired?: (content: string) => void;
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
    case "high":
      return "destructive";
    case "medium":
      return "default";
    default:
      return "secondary";
  }
}

function issueTypeLabel(type: string): string {
  switch (type) {
    case "continuity":
      return "连续性";
    case "character":
      return "人物";
    case "pacing":
      return "节奏";
    case "quality":
      return "质量";
    default:
      return type;
  }
}

function computeDiff(
  original: string,
  repaired: string,
): Array<{ type: "same" | "added" | "removed"; text: string }> {
  const originalLines = original.split("\n");
  const repairedLines = repaired.split("\n");
  const result: Array<{ type: "same" | "added" | "removed"; text: string }> = [];
  const maxLength = Math.max(originalLines.length, repairedLines.length);

  for (let index = 0; index < maxLength; index += 1) {
    const originalLine = originalLines[index];
    const repairedLine = repairedLines[index];

    if (originalLine === repairedLine) {
      if (originalLine !== undefined) result.push({ type: "same", text: originalLine });
      continue;
    }

    if (originalLine !== undefined) result.push({ type: "removed", text: originalLine });
    if (repairedLine !== undefined) result.push({ type: "added", text: repairedLine });
  }

  return result;
}

export function ChapterQualityPanel({
  projectId,
  chapterId,
  hasContent,
  currentContent = "",
  onContentRepaired,
  onLocateIssue,
}: ChapterQualityPanelProps) {
  const [reviews, setReviews] = useState<ChapterReview[]>([]);
  const [repairDraft, setRepairDraft] = useState<string | null>(null);
  const [repairOriginal, setRepairOriginal] = useState("");
  const [applyingRepair, setApplyingRepair] = useState(false);
  const { generating, generatingStage, generate, cancel } = useAI();
  const { currentPreset } = useSettings();

  const contentRef = useRef(currentContent);
  contentRef.current = currentContent;

  const loadReviews = useCallback(async () => {
    if (!chapterId) {
      setReviews([]);
      return;
    }

    try {
      setReviews(await listChapterReviews(projectId, chapterId, 3));
    } catch (cause) {
      console.error("Failed to load chapter reviews:", cause);
    }
  }, [chapterId, projectId]);

  useEffect(() => {
    loadReviews();
    setRepairDraft(null);
    setRepairOriginal("");
  }, [loadReviews]);

  const handleReview = useCallback(async () => {
    if (!currentPreset || !chapterId || generating) return;

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
      onError: (message) => {
        toast.error("审核失败", { description: message });
      },
    });
  }, [chapterId, currentPreset, generate, generating, loadReviews, projectId]);

  const handleRepair = useCallback(async () => {
    if (!currentPreset || !chapterId || generating) return;

    const original = contentRef.current;
    setRepairOriginal(original);
    setRepairDraft(null);

    await generate({
      command: "repair_chapter_content",
      stage: REPAIR_DRAFT_STAGE,
      args: {
        projectId,
        chapterId,
        presetId: currentPreset.id,
      },
      onComplete: (content) => {
        const cleaned = stripThinking(content);
        if (!cleaned.trim()) {
          toast.warning("修复任务没有返回可应用内容");
          return;
        }
        setRepairDraft(cleaned);
        toast.success("修复草稿已生成", {
          description: "正文尚未改变，请检查差异后再应用",
        });
      },
      onError: (message) => {
        toast.error("修复失败", { description: message });
      },
      onCancel: () => {
        toast.info("已取消修复，正文未改变");
      },
    });
  }, [chapterId, currentPreset, generate, generating, projectId]);

  const handleApplyRepair = useCallback(async () => {
    if (!repairDraft || !chapterId || applyingRepair) return;

    if (contentRef.current !== repairOriginal) {
      toast.warning("正文在修复期间发生了变化", {
        description: "为避免覆盖新编辑，请重新执行审核和修复",
      });
      return;
    }

    setApplyingRepair(true);
    try {
      await saveContent(projectId, chapterId, repairDraft);
      onContentRepaired?.(repairDraft);
      setRepairDraft(null);
      setRepairOriginal("");
      toast.success("修复内容已应用并保存");
      loadReviews();
    } catch (cause) {
      toast.error("应用修复失败", { description: String(cause) });
    } finally {
      setApplyingRepair(false);
    }
  }, [
    applyingRepair,
    chapterId,
    loadReviews,
    onContentRepaired,
    projectId,
    repairDraft,
    repairOriginal,
  ]);

  const handleDiscardRepair = useCallback(() => {
    setRepairDraft(null);
    setRepairOriginal("");
    toast.info("已放弃修复结果，正文未改变");
  }, []);

  const handleLocateIssue = useCallback((issue: ReviewIssue) => {
    if (!issue.quote && issue.start === undefined) return;

    let start = issue.start;
    let end = issue.end;

    if ((start === undefined || end === undefined) && issue.quote) {
      const index = currentContent.indexOf(issue.quote);
      if (index >= 0) {
        start = index;
        end = index + issue.quote.length;
      }
    }

    if (start !== undefined && end !== undefined && onLocateIssue) {
      onLocateIssue(start, end);
      return;
    }

    if (issue.quote) {
      toast.warning("无法在当前正文中定位该问题", {
        description: "正文可能已经变化，建议重新审核",
      });
    }
  }, [currentContent, onLocateIssue]);

  if (!chapterId) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        选择章节后查看质量审核
      </div>
    );
  }

  const latestReview = reviews[0];
  const isReviewing = generating && generatingStage === "review";
  const isRepairing = generating && generatingStage === REPAIR_DRAFT_STAGE;
  const isBusy = isReviewing || isRepairing;

  let issues: ReviewIssue[] = [];
  if (latestReview) {
    try {
      issues = JSON.parse(latestReview.issues_json) as ReviewIssue[];
    } catch {
      issues = [];
    }
  }

  if (repairDraft !== null) {
    const diffLines = computeDiff(repairOriginal, repairDraft);
    const addedCount = diffLines.filter((line) => line.type === "added").length;
    const removedCount = diffLines.filter((line) => line.type === "removed").length;

    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">修复预览</h3>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              onClick={handleApplyRepair}
              disabled={applyingRepair}
              className="h-7 gap-1 rounded-full px-3"
            >
              <Check className="h-3 w-3" />
              {applyingRepair ? "应用中..." : "应用修复"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDiscardRepair}
              disabled={applyingRepair}
              className="h-7 gap-1 rounded-full px-3"
            >
              <X className="h-3 w-3" />
              放弃
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-4 py-3">
            <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="text-red-500">- {removedCount} 行修改</span>
              <span className="text-green-500">+ {addedCount} 行修改</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <pre className="whitespace-pre-wrap break-all font-mono text-xs">
                {diffLines.map((line, index) => (
                  <div
                    key={`${index}-${line.type}`}
                    className={`px-3 py-0.5 ${
                      line.type === "added"
                        ? "bg-green-500/10 text-green-700 dark:text-green-400"
                        : line.type === "removed"
                          ? "bg-red-500/10 text-red-700 line-through dark:text-red-400"
                          : ""
                    }`}
                  >
                    <span className="mr-2 select-none opacity-50">
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
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">质量审核</h3>
        <div className="flex gap-1.5">
          {isBusy ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={cancel}
              className="h-7 rounded-full px-3"
            >
              停止
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleReview}
                disabled={!currentPreset || !hasContent}
                className="h-7 gap-1 rounded-full px-3"
              >
                <ClipboardCheck className="h-3 w-3" />
                {latestReview ? "重新审核" : "AI 审核"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRepair}
                disabled={!currentPreset || !hasContent || !latestReview}
                className="h-7 gap-1 rounded-full px-3"
              >
                <Wrench className="h-3 w-3" />
                一键修复
              </Button>
            </>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 px-4 py-3">
          {isReviewing && (
            <div className="animate-pulse text-sm text-muted-foreground">
              正在审核中...
            </div>
          )}
          {isRepairing && (
            <div className="animate-pulse text-sm text-muted-foreground">
              正在生成独立修复草稿，正文不会被修改...
            </div>
          )}

          {!latestReview && !isReviewing && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {hasContent ? "点击「AI 审核」评估本章质量" : "请先生成正文，再进行审核"}
            </div>
          )}

          {latestReview && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <ScoreCard label="总评" score={latestReview.overall_score} />
                <ScoreCard label="连续性" score={latestReview.continuity_score} />
                <ScoreCard label="人物" score={latestReview.character_score} />
                <ScoreCard label="节奏" score={latestReview.pacing_score} />
              </div>

              {issues.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">
                    发现问题（{issues.length}）
                  </h4>
                  {issues.map((issue, index) => (
                    <IssueCard
                      key={`${issue.type}-${index}`}
                      issue={issue}
                      onLocate={() => handleLocateIssue(issue)}
                    />
                  ))}
                </div>
              )}

              {latestReview.suggestions && (
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-muted-foreground">修复建议</h4>
                  <p className="rounded-xl bg-muted/50 p-2.5 text-xs text-foreground">
                    {latestReview.suggestions}
                  </p>
                </div>
              )}

              <p className="text-right text-[10px] text-muted-foreground">
                审核时间：{new Date(latestReview.created_at).toLocaleString("zh-CN")}
              </p>
            </>
          )}

          {reviews.length > 1 && (
            <details className="border-t border-border pt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                历史审核记录（{reviews.length - 1}）
              </summary>
              <div className="mt-2 space-y-1.5">
                {reviews.slice(1).map((review) => (
                  <div
                    key={`${review.created_at}-${review.overall_score}`}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
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
    <div className="space-y-1.5 rounded-xl border border-border p-2.5">
      <div className="flex items-center gap-1.5">
        <Badge variant={severityVariant(issue.severity)} className="h-4 px-1.5 text-[10px]">
          {issue.severity === "high" ? "严重" : issue.severity === "medium" ? "中等" : "轻微"}
        </Badge>
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
          {issueTypeLabel(issue.type)}
        </Badge>
        {(issue.quote || issue.start !== undefined) && (
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
          <p className="text-[11px] italic text-muted-foreground">
            「{issue.quote.length > 80 ? `${issue.quote.slice(0, 80)}...` : issue.quote}」
          </p>
        </div>
      )}

      {!issue.quote && issue.location && (
        <p className="text-[10px] italic text-muted-foreground">位置：{issue.location}</p>
      )}
    </div>
  );
}

function ScoreCard({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-xl border border-border p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${scoreColor(score)}`}>{score}</div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${scoreBg(score)} transition-all`}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
    </div>
  );
}
