import { Loader2 } from "lucide-react";

interface EditorStatusTextProps {
  generating: boolean;
  saved?: boolean;
  generatingLabel?: string;
  idleLabel?: string;
}

export function EditorStatusText({
  generating,
  saved,
  generatingLabel = "生成中...",
  idleLabel,
}: EditorStatusTextProps) {
  if (generating) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
        <span className="text-primary">{generatingLabel}</span>
      </span>
    );
  }

  if (idleLabel) {
    return <span className="text-sm text-muted-foreground">{idleLabel}</span>;
  }

  if (saved !== undefined) {
    return (
      <span className="text-sm text-muted-foreground">
        {saved ? "已保存" : "未保存"}
      </span>
    );
  }

  return null;
}
