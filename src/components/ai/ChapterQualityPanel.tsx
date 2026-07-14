/**
 * ChapterQualityPanel — 审核与修复
 *
 * 修复输出只存在于本面板的草稿中，不修改中央正文。用户确认应用时，
 * 后端在同一事务中检查正文版本、创建快照并保存修复内容。
 */

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { applyContentDraft, listChapterReviews } from "@/lib/tauri";
import { useAI } from "@/contexts/AIContext";
import { useSettings } from "@/hooks/useSettings";
import { stripThinking } from "@/components/shared/StreamingView";
import type { ChapterReview, ReviewIssue } from "@/types";
import { ClipboardCheck, Wrench, Check, X, Search } from "lucide-react";
import { toast } from "sonner";

interface ChapterQualityPanelProps {
  projectId: number;
  chapterId: number | null;
  hasContent: boolean;
  currentContent?: string;
  currentContentUpdatedAt?: string | null;
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

function computeDiff(original: string, repaired: string): Array<{ type: "same" | "added" | "removed"; text: string }> {
  const originalLines = original.split("\n");
  const repairedLines = repaired.split("\n");
  const result: Array<{ type: "same" | "added" | "removed"; text: string }> = [];
  const maxLength = Math.max(originalLines.length, repairedLines.length);

  for (let index = 0; index < maxLength; index += 1) {
    const originalLine = originalLines[index];
    const repairedLine = repairedLines[index];
    if (originalLine === repairedLine) {
      if (originalLine !== undefined) result.push({ type: "same", text: originalLine });
    } else {
      if (originalLine !== undefined) result.push({ type: "removed", text: originalLine });
      if (repairedLine !== undefined) result.push({ type: "added", text: repairedLine });
    }
  }
  return result;
}

export function ChapterQualityPanel({
  projectId,
  chapterId,
  hasContent,
  currentContent = "",
  currentContentUpdatedAt = null,
  onContentRepaired,
  onLocateIssue,
}: ChapterQualityPanelProps) {
  const [reviews, setReviews] = useState<ChapterReview[]>([]);
  const [repairDraft, setRepairDraft] = useState<string | null>(null);
  const [repairOriginal, setRepairOriginal] = useState("");
  const [repairBaseUpdatedAt, setRepairBaseUpdatedAt] = useState<string | null>(null);
  const [applyingRepair, setApplyingRepair] = useState(false);
  const { generating, generatingStage, generate, cancel } = useAI();
  const { currentPreset } = useSettings();

  const loadReviews = useCallback(async () => {
    if (!chapterId) {
      setReviews([]);
      return;
    }
    try {
      setReviews(await listChapterReviews(projectId, chapterId, 3));
    } catch (error) {
      console.error("Failed to load reviews:", error);
    }
  }, [projectId, chapterId]);

  useEffect(() => {
    void loadReviews();
    setRepairDraft(null);
  }, [loadReviews]);

  const handleReview = useCallback(async () => {
    if (!currentPreset || !chapterId) return;
    await generate({
      command: "review_chapter_content",
      stage: "review",
      args: { projectId, chapterId, presetId: currentPreset.id },
      onComplete: () => {
        toast.success("审核完成");
        void loadReviews();
      },
      onError: (error) => toast.error("审核失败", { description: error }),
      onCancel: () => toast.info("已取消审核"),
    });
  }, [currentPreset, chapterId, projectId, generate, loadReviews]);

  const handleRepair = useCallback(async () => {
    if (!currentPreset || !chapterId) return;
    const original = currentContent;
    const baseUpdatedAt = currentContentUpdatedAt;
    setRepairDraft(null);
    setRepairOriginal(original);
    setRepairBaseUpdatedAt(baseUpdatedAt);

    await generate({
      command: "repair_chapter_content",
      stage: "repair",
      args: { projectId, chapterId, presetId: currentPreset.id },
      onComplete: (generated) => {
        const cleaned = stripThinking(generated);
        if (cleaned.trim()) {
          setRepairDraft(cleaned);
          toast.success("修复草稿已生成", { description: "请检查差异后再应用" });
        } else {
          toast.error("模型没有返回可应用的修复内容");
        }
      },
      onError: (error) => toast.error("修复失败", { description: error }),
      onCancel: () => toast.info("已取消修复，正文未发生变化"),
    });
  }, [currentPreset, chapterId, projectId, generate, currentContent, currentContentUpdatedAt]);

  const handleApplyRepair = useCallback(async () => {
    if (!repairDraft || !chapterId) return;
    setApplyingRepair(true);
    try {
      const applied = await applyContentDraft({
        projectId,
        chapterId,
        content: repairDraft,
        expectedUpdatedAt: repairBaseUpdatedAt,
        reason: "AI 修复应用前快照",
      });
      toast.success("修复内容已应用并保存");
      onContentRepaired?.(applied.content);
      setRepairDraft(null);
      void loadReviews();
    } catch (error) {
      toast.error("应用修复失败", { description: String(error) });
    } finally {
      setApplyingRepair(false);
    }
  }, [repairDraft, chapterId, projectId, repairBaseUpdatedAt, onContentRepaired, loadReviews]);

  const handleDiscardRepair = useCallback(() => {
    setRepairDraft(null);
    toast.info("已放弃修复结果，正文未发生变化");
  }, []);

  const handleLocateIssue = useCallback((issue: ReviewIssue) => {
    if (!issue.quote && issue.start === undefined) return;
    let start = issue.start;
    let end = issue.end;
    if ((start === undefined || end === undefined) && issue.quote && currentContent) {
      const index = currentContent.indexOf(issue.quote);
      if (index >= 0) {
        start = index;
        end = index + issue.quote.length;
      }
    }
    if (start !== undefined && end !== undefined && onLocateIssue) {
      onLocateIssue(start, end);
    } else if (issue.quote) {
      toast.warning("无法在当前正文中定位该问题，正文可能已被修改", {
        description: "建议重新审核以获取最新的问题定位",
      });
    }
  }, [currentContent, onLocateIssue]);

  const latestReview = reviews[0];
  const isReviewing = generating && generatingStage === "review";
  const isRepairing = generating && generatingStage === "repair";
  const isBusy = isReviewing || isRepairing;

  let issues: ReviewIssue[] = [];
  if (latestReview) {
    try {
      issues = JSON.parse(latestReview.issues_json);
    } catch {
      issues = [];
    }
  }

  if (!chapterId) {
    return <div className="p-4 text-sm text-muted-foreground text-center">选择章节后查看质量审核</div>;
  }

  if (repairDraft !== null) {
    const diffLines = computeDiff(repairOriginal, repairDraft);
    const addedCount = diffLines.filter((line) => line.type === "added").length;
    const removedCount = diffLines.filter((line) => line.type === "removed").length;

    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">修复预览</h3>
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => void handleApplyRepair()} disabled={applyingRepair} className="rounded-md h-7 px-3 gap-1">
              <Check className="h-3 w-3" />{applyingRepair ? "应用中" : "应用修复"}
            </Button>
            <Button size="sm" variant="outline" onClick={handleDiscardRepair} disabled={applyingRepair} className="rounded-md h-7 px-3 gap-1">
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
                {diffLines.map((line, index) => (
                  <div
                    key={`${line.type}-${index}`}
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
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">质量审核</h3>
        <div className="flex gap-1.5">
          {isBusy ? (
            <Button size="sm" variant="destructive" onClick={() => void cancel()} className="rounded-md h-7 px-3">停止</Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleReview()}
                disabled={!currentPreset || !hasContent}
                className="rounded-md h-7 px-3 gap-1"
              >
                <ClipboardCheck className="h-3 w-3" />
                {latestReview ? "重新审核" : "AI 审核"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleRepair()}
                disabled={!currentPreset || !hasContent || !latestReview}
                className="rounded-md h-7 px-3 gap-1"
              >
                <Wrench className="h-3 w-3" />一键修复
              </Button>
            </>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-4 py-3 space-y-3">
          {isReviewing && <div className="text-sm text-muted-foreground animate-pulse">正在审核中...</div>}
          {isRepairing && <div className="text-sm text-muted-foreground animate-pulse">正在修复中，正文保持不变...</div>}

          {!latestReview && !isReviewing && (
            <div className="text-sm text-muted-foreground text-center py-6">
              {hasContent ? "点击「AI 审核」评估本章质量" : "请先生成正文，再进行审核"}
            </div>
          )}

          {latestReview && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <ScoreCard label="总评" score={latestReview.overall_score} scoreColor={scoreColor} scoreBg={scoreBg} />
                <ScoreCard label="连续性" score={latestReview.continuity_score} scoreColor={scoreColor} scoreBg={scoreBg} />
                <ScoreCard label="人物" score={latestReview.character_score} scoreColor={scoreColor} scoreBg={scoreBg} />
                <ScoreCard label="节奏" score={latestReview.pacing_score} scoreColor={scoreColor} scoreBg={scoreBg} />
              </div>

              {issues.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">发现问题（{issues.length}）</h4>
                  {issues.map((issue, index) => (
                    <IssueCard key={`${issue.type}-${index}`} issue={issue} onLocate={() => handleLocateIssue(issue)} />
                  ))}
                </div>
              )}

              {latestReview.suggestions && (
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-muted-foreground">修复建议</h4>
                  <p className="text-xs text-foreground rounded-lg bg-muted/50 p-2.5">{latestReview.suggestions}</p>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground text-right">
                审核时间：{new Date(latestReview.created_at).toLocaleString("zh-CN")}
              </p>
            </>
          )}

          {reviews.length > 1 && (
            <details className="pt-2 border-t border-border">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                历史审核记录（{reviews.length - 1}）
              </summary>
              <div className="mt-2 space-y-1.5">
                {reviews.slice(1).map((review, index) => (
                  <div key={`${review.id}-${index}`} className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className={`font-medium ${scoreColor(review.overall_score)}`}>{review.overall_score}分</span>
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
    <div className="rounded-lg border border-border p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Badge variant={severityVariant(issue.severity)} className="text-[10px] h-4 px-1.5">
          {issue.severity === "high" ? "严重" : issue.severity === "medium" ? "中等" : "轻微"}
        </Badge>
        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{issueTypeLabel(issue.type)}</Badge>
        {issue.quote && (
          <button onClick={onLocate} className="ml-auto flex items-center gap-0.5 text-[10px] text-primary hover:underline" title="定位到正文">
            <Search className="h-3 w-3" />定位
          </button>
        )}
      </div>
      <p className="text-xs text-foreground">{issue.description}</p>
      {issue.quote && (
        <div className="rounded-md bg-muted/60 px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground italic">
            「{issue.quote.length > 80 ? `${issue.quote.slice(0, 80)}...` : issue.quote}」
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
  scoreColor: getScoreColor,
  scoreBg: getScoreBg,
}: {
  label: string;
  score: number;
  scoreColor: (score: number) => string;
  scoreBg: (score: number) => string;
}) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}</div>
      <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${getScoreBg(score)} transition-all`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
    </div>
  );
}
