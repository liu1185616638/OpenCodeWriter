import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { listSnapshots } from "@/lib/tauri";
import type { ContentSnapshot } from "@/types";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface SnapshotPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  targetType: string;
  targetId?: number | null;
  onRestore: (content: string) => void;
}

export function SnapshotPanel({
  open,
  onOpenChange,
  projectId,
  targetType,
  targetId,
  onRestore,
}: SnapshotPanelProps) {
  const [snapshots, setSnapshots] = useState<ContentSnapshot[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listSnapshots({
        projectId,
        targetType,
        targetId: targetId ?? null,
        limit: 10,
      });
      setSnapshots(list);
    } catch (e) {
      console.error("Failed to load snapshots:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, targetType, targetId]);

  useEffect(() => {
    if (open) loadSnapshots();
  }, [open, loadSnapshots]);

  const handleRestore = (snapshot: ContentSnapshot) => {
    onRestore(snapshot.content);
    onOpenChange(false);
    toast.success("已恢复到历史版本");
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + "Z");
      return d.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>历史版本</DialogTitle>
        </DialogHeader>
        <div className="max-h-80 overflow-auto space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">加载中...</p>
          ) : snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">暂无历史版本</p>
          ) : (
            snapshots.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-border px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{s.reason}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(s.created_at)}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRestore(s)}
                  className="shrink-0 rounded-full gap-1.5"
                >
                  <RotateCcw className="h-3 w-3" />
                  恢复
                </Button>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
