import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { listGenerationLogs, listJobs } from "@/lib/tauri";
import type { GenerationLog, Job } from "@/types";
import { History, CheckCircle2, XCircle, Loader2, RefreshCw, List } from "lucide-react";

const targetLabels: Record<string, string> = {
  outline: "大纲",
  characters: "人物",
  chapters: "目录",
  content: "正文",
  idea: "灵感",
};

const commandLabels: Record<string, string> = {
  generate_outline: "大纲生成",
  generate_characters: "人物生成",
  generate_chapters: "目录生成",
  generate_content: "正文生成",
  chapter_aftercare: "章节后护理",
  analyze_text: "拆书分析",
  extract_style_rules: "写法规则提取",
  generate_character_from_description: "人物生成",
  polish_content: "正文润色",
  polish_chapter: "目录润色",
  review_chapter_content: "章节审核",
  repair_chapter_content: "章节修复",
  generate_idea_directions: "方向候选",
  generate_outline_from_direction: "初始大纲",
};

const jobTypeLabels: Record<string, string> = {
  batch_generate: "批量生成",
  batch_polish: "批量润色",
  batch_review: "批量审核",
};

function StatusBadge({ status, isJob }: { status: string; isJob?: boolean }) {
  // Job statuses: pending, running, completed, failed
  // Log statuses: started, success, failed
  if (status === "success" || status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success-foreground">
        <CheckCircle2 className="h-3.5 w-3.5" />
        成功
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-error-foreground">
        <XCircle className="h-3.5 w-3.5" />
        失败
      </span>
    );
  }
  if (isJob && status === "running") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        进行中
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      {isJob ? "待执行" : "进行中"}
    </span>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr.includes("Z") ? dateStr : dateStr + "Z");
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

interface GenerationHistoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
}

type TabType = "logs" | "jobs";

export function GenerationHistoryPanel({
  open,
  onOpenChange,
  projectId,
}: GenerationHistoryPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>("logs");
  const [logs, setLogs] = useState<GenerationLog[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listGenerationLogs(projectId, 50);
      setLogs(list);
    } catch (e) {
      console.error("Failed to load generation logs:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listJobs(projectId, 50);
      setJobs(list);
    } catch (e) {
      console.error("Failed to load jobs:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) {
      if (activeTab === "logs") loadLogs();
      else loadJobs();
    }
  }, [open, activeTab, loadLogs, loadJobs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            任务中心
          </DialogTitle>
        </DialogHeader>

        <div className="flex border-b border-border">
          <Button
            variant={activeTab === "logs" ? "ghost" : "secondary"}
            size="sm"
            className="rounded-none border-0 border-b-2 border-transparent hover:bg-transparent data-[state=active]:border-primary rounded-tl-xl rounded-tr-xl px-6 py-2 text-sm font-medium"
            onClick={() => setActiveTab("logs")}
          >
            生成日志
          </Button>
          <Button
            variant={activeTab === "jobs" ? "ghost" : "secondary"}
            size="sm"
            className="rounded-none border-0 border-b-2 border-transparent hover:bg-transparent data-[state=active]:border-primary rounded-tr-xl px-6 py-2 text-sm font-medium"
            onClick={() => setActiveTab("jobs")}
          >
            任务 ({jobs.length})
          </Button>
        </div>

        <ScrollArea className="max-h-[480px]">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              加载中...
            </p>
          ) : activeTab === "logs" && logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              暂无生成记录
            </p>
          ) : activeTab === "jobs" && jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 flex flex-col items-center gap-3">
              <List className="h-8 w-8 text-muted-foreground" />
              <span>暂无任务记录</span>
            </p>
          ) : (
            <div className="space-y-2 pr-1">
              {activeTab === "logs" && logs.map((log) => {
                const targetLabel = targetLabels[log.target_type] ?? log.target_type;
                const commandLabel = commandLabels[log.command] ?? log.command;
                return (
                  <div
                    key={log.id}
                    className="rounded-xl border border-border px-4 py-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-foreground truncate">
                          {commandLabel}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {targetLabel}
                        </span>
                      </div>
                      <StatusBadge status={log.status} />
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {log.model_name && (
                        <span className="truncate">{log.model_name}</span>
                      )}
                      <span>输入 {log.input_chars.toLocaleString()} 字</span>
                      <span>输出 {log.output_chars.toLocaleString()} 字</span>
                    </div>

                    {log.error && (
                      <p className="text-xs text-error-foreground break-all line-clamp-2">
                        {log.error}
                      </p>
                    )}

                    <p className="text-xs text-muted-foreground">
                      {formatDate(log.started_at)}
                    </p>
                  </div>
                );
              })}
              {activeTab === "jobs" && jobs.map((job) => {
                const jobLabel = jobTypeLabels[job.job_type] ?? job.job_type;
                let payloadObj: Record<string, any> | null = null;
                try {
                  payloadObj = JSON.parse(job.payload_json);
                } catch {}
                const completed = payloadObj?.completed_chapters?.length || 0;
                const total = payloadObj?.chapter_ids?.length || 0;
                return (
                  <div
                    key={job.id}
                    className="rounded-xl border border-border px-4 py-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-foreground truncate">
                          {jobLabel}
                        </span>
                      </div>
                      <StatusBadge status={job.status} />
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(job.created_at)}</span>
                      {job.updated_at !== job.created_at && (
                        <span>更新于 {formatDate(job.updated_at)}</span>
                      )}
                    </div>

                    {total > 0 && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Progress value={(completed / total) * 100} className="flex-1 h-1.5" />
                        <span>{completed} / {total}</span>
                      </div>
                    )}

                    {job.error && (
                      <p className="text-xs text-error-foreground break-all line-clamp-2">
                        {job.error}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => activeTab === "logs" ? loadLogs() : loadJobs()}
            className="rounded-full"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
