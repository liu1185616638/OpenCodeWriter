import type { GenerationStatus } from "@/types/ai";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface GenerationRecoveryPanelProps {
  status: GenerationStatus; // "cancelled" | "failed"
  charCount?: number;
  error?: string | null;
  onSaveGenerated?: () => void;
  onDiscard?: () => void;
  onRetry?: () => void;
  onCopyError?: () => void;
}

export function GenerationRecoveryPanel({
  status,
  charCount,
  error,
  onSaveGenerated,
  onDiscard,
  onRetry,
  onCopyError,
}: GenerationRecoveryPanelProps) {
  if (status === "cancelled") {
    return (
      <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12h8" />
          </svg>
          <span className="font-medium">已停止生成</span>
        </div>

        {charCount != null && charCount > 0 && (
          <p className="text-sm text-muted-foreground">
            当前已生成 {charCount.toLocaleString()} 字
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onSaveGenerated}>
            保存已生成内容
          </Button>
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={onDiscard}>
            丢弃
          </Button>
        </div>
      </div>
    );
  }

  // status === "failed"
  return (
    <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center gap-2 text-destructive">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
        <span className="font-medium">生成失败</span>
      </div>

      {error && (
        <pre className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap break-all font-mono">
          {error}
        </pre>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onRetry}>
          重试
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (onCopyError) {
              onCopyError();
            } else if (error) {
              navigator.clipboard.writeText(error).then(() => {
                toast.success("错误信息已复制");
              });
            }
          }}
        >
          复制错误
        </Button>
      </div>
    </div>
  );
}
