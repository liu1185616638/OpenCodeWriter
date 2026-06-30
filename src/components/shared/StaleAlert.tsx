import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { listStaleReasons } from "@/lib/tauri";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { StaleReason } from "@/types";

const sourceLabels: Record<string, string> = {
  outline: "大纲已修改",
  characters: "人物设定已修改",
  chapters: "章节目录已修改",
  content: "正文已修改",
};

export function StaleAlert({ projectId, targetType, onRegenerate }: {
  projectId: number;
  targetType: string;
  onRegenerate?: () => void;
}) {
  const [stale, setStale] = useState(false);
  const [reason, setReason] = useState<StaleReason | null>(null);

  useEffect(() => {
    async function check() {
      try {
        const reasons = await listStaleReasons(projectId, targetType);
        if (reasons.length > 0) {
          setStale(true);
          setReason(reasons[0]);
        } else {
          setStale(false);
          setReason(null);
        }
      } catch {
        setStale(false);
        setReason(null);
      }
    }
    check();
  }, [projectId, targetType]);

  const handleClearStale = async () => {
    const { clearStale } = await import("@/lib/tauri");
    await clearStale(projectId, targetType);
    setStale(false);
    setReason(null);
  };

  const handleRegenerate = () => {
    onRegenerate?.();
  };

  if (!stale) return null;

  const reasonText = reason
    ? sourceLabels[reason.source_type] ?? reason.source_type
    : "上游内容已修改";

  return (
    <div className="mx-6 my-2 px-6 py-4 rounded-3xl bg-warning flex items-start gap-3">
      <AlertTriangle className="h-6 w-6 text-warning-foreground shrink-0 mt-0.5" />
      <div className="flex flex-col gap-2 flex-1">
        <p className="text-sm font-medium text-warning-foreground">
          该内容可能已过时：{reasonText}。建议重新生成或手动检查。
        </p>
        <div className="flex items-center gap-2">
          {onRegenerate && (
            <Button
              size="sm"
              onClick={handleRegenerate}
              className="rounded-full px-4 py-1.5 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <RefreshCw className="h-3 w-3" />重新生成
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleClearStale}
            className="rounded-full px-4 py-1.5 gap-1.5 border-warning-foreground/30 text-warning-foreground hover:bg-warning-foreground/10"
          >
            保持当前
          </Button>
        </div>
      </div>
    </div>
  );
}
