import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, RefreshCw } from "lucide-react";

export function StaleAlert({ projectId, targetType, onRegenerate }: {
  projectId: number;
  targetType: string;
  onRegenerate?: () => void;
}) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const result = await invoke<boolean>("is_stale", { projectId, targetType });
        setStale(result);
      } catch {
        setStale(false);
      }
    }
    check();
  }, [projectId, targetType]);

  const handleClearStale = async () => {
    await invoke("clear_stale", { projectId, targetType });
    setStale(false);
  };

  const handleRegenerate = () => {
    onRegenerate?.();
  };

  if (!stale) return null;

  return (
    <div className="mx-6 my-2 px-6 py-4 rounded-3xl bg-warning flex items-start gap-3">
      <AlertTriangle className="h-6 w-6 text-warning-foreground shrink-0 mt-0.5" />
      <div className="flex flex-col gap-2 flex-1">
        <p className="text-sm font-medium text-warning-foreground">
          上游内容已修改，当前内容可能需要更新
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
