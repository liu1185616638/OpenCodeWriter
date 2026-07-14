/**
 * AiTaskLauncher — 统一 AI 任务启动按钮 (Phase F)
 *
 * 封装生成/取消状态切换、模型显示和进度指示。
 * 各页面可使用此组件替代直接调用 useAI().generate()。
 *
 * 用法:
 * <AiTaskLauncher
 *   stage="outline"
 *   command="generate_outline"
 *   args={{ projectId, presetId }}
 *   modelName={preset?.model_name}
 *   onComplete={(content) => { ... }}
 *   label="生成大纲"
 * />
 */

import { Button } from "@/components/ui/button";
import { Sparkles, Square } from "lucide-react";
import { useAI } from "@/contexts/AIContext";
import { GenerationStatusBar } from "./GenerationStatusBar";

export interface AiTaskLauncherProps {
  /** Creation stage identifier (e.g. "outline", "characters", "content") */
  stage: string;
  /** Tauri command name */
  command: string;
  /** Command arguments (sessionId is injected automatically) */
  args: Record<string, unknown>;
  /** Model name for display */
  modelName?: string;
  /** Button label */
  label: string;
  /** Whether the launcher is disabled (e.g. missing prerequisites) */
  disabled?: boolean;
  /** Called when generation completes successfully */
  onComplete?: (content: string) => void;
  /** Called when generation fails */
  onError?: (error: string) => void;
  /** Whether to show the generation status bar inline */
  showStatusBar?: boolean;
  /** Button variant */
  variant?: "default" | "outline" | "ghost";
  /** Button size */
  size?: "default" | "sm" | "lg";
  /** Additional icon to show */
  icon?: React.ReactNode;
}

export function AiTaskLauncher({
  stage,
  command,
  args,
  modelName,
  label,
  disabled = false,
  onComplete,
  onError,
  showStatusBar = true,
  variant = "default",
  size = "default",
  icon,
}: AiTaskLauncherProps) {
  const { generating, generatingStage, generate, cancel, generationMeta, generatedCharCount, elapsedMs } = useAI();

  const isThisGenerating = generating && generatingStage === stage;

  const handleLaunch = async () => {
    await generate({
      command,
      args,
      stage,
      onComplete,
      onError,
    });
  };

  if (isThisGenerating) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="destructive"
          size={size}
          onClick={cancel}
          style={{ borderRadius: "var(--radius-sm)", gap: 4 }}
        >
          <Square className="h-3.5 w-3.5" />
          停止
        </Button>
        {showStatusBar && (
          <GenerationStatusBar
            stageLabel={stage}
            modelName={generationMeta?.modelName || modelName}
            charCount={generatedCharCount}
            elapsedMs={elapsedMs}
          />
        )}
      </div>
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleLaunch}
      disabled={disabled || generating}
      style={{ borderRadius: "var(--radius-sm)", gap: 4 }}
      title={modelName ? `模型: ${modelName}` : undefined}
    >
      {icon ?? <Sparkles className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}
