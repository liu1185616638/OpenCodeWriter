interface GenerationStatusBarProps {
  stageLabel: string;
  modelName?: string;
  charCount: number;
  elapsedMs: number;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function GenerationStatusBar({
  stageLabel,
  modelName,
  charCount,
  elapsedMs,
}: GenerationStatusBarProps) {
  const parts = [
    stageLabel,
    modelName,
    `${charCount.toLocaleString()} 字`,
    formatElapsed(elapsedMs),
  ].filter(Boolean);

  return (
    <span className="rounded-full bg-primary/10 text-primary text-xs px-3 py-1.5">
      {parts.join(" · ")}
    </span>
  );
}
