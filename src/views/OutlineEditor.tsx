import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOutline } from "@/hooks/useOutline";
import { useSettings } from "@/hooks/useSettings";
import { useAI } from "@/contexts/AIContext";
import { useAppEvents } from "@/hooks/useAppEvents";
import { StaleAlert } from "@/components/shared/StaleAlert";
import { StreamingView, stripThinking } from "@/components/shared/StreamingView";
import type { Project } from "@/types";
import { Save, Sparkles, Square, Cpu, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function OutlineEditor({ project }: { project: Project }) {
  const { outline, loading, saving, load, save } = useOutline(project.id);
  const { currentPreset, currentPresetId, switchPreset, presets } = useSettings();
  const { generating, streamedContent, thinkingContent, error, generate, cancel } = useAI();
  const [content, setContent] = useState("");

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (outline) setContent(outline.content);
  }, [outline]);

  // 生成中：更新 content 以驱动 StreamingView
  // 生成结束：streamedContent 可能含 <thinking> 标签，先清洗
  useEffect(() => {
    if (generating) {
      setContent(streamedContent);
    } else if (streamedContent) {
      setContent(stripThinking(streamedContent));
    }
  }, [streamedContent, generating]);

  const handleSave = useCallback(async () => {
    await save(content);
  }, [save, content]);

  const handleGenerate = useCallback(async () => {
    if (!currentPreset || generating) return;
    setContent("");
    await generate({
      command: "generate_outline",
      stage: "outline",
      args: {
        projectId: project.id,
        presetId: currentPreset.id,
      },
      onComplete: () => {
        // Toast is shown by auto-save effect below
      },
      onError: (err) => {
        toast.error("生成失败", { description: err });
      },
    });
  }, [currentPreset, generating, generate, project.id]);

  // Auto-save when generation finishes
  const prevGeneratingRef = useRef(false);
  useEffect(() => {
    // Detect transition from generating=true to generating=false
    if (prevGeneratingRef.current && !generating) {
      // Use a timeout to ensure streamedContent state has fully settled
      // after the batch of ai-chunk + ai-done updates
      const timer = setTimeout(() => {
        if (streamedContent) {
          const cleaned = stripThinking(streamedContent);
          save(cleaned).then(() => {
            toast.success("大纲已自动保存");
          }).catch(() => {
            toast.error("自动保存失败");
          });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
    prevGeneratingRef.current = generating;
  }, [generating, streamedContent, save]);

  useAppEvents({
    onGenerate: handleGenerate,
    onSave: handleSave,
    onSwitchModel: () => {
      if (presets.length > 1 && currentPresetId) {
        const idx = presets.findIndex(p => p.id === currentPresetId);
        const next = presets[(idx + 1) % presets.length];
        switchPreset(next.id);
      }
    },
  });

  if (loading) return <div className="p-6 text-muted-foreground">加载中...</div>;

  const saved = !saving && outline?.content === content;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* Editor Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <h2 className="truncate text-lg font-semibold text-foreground">大纲</h2>
        <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
          {generating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
              <span className="text-primary">生成中...</span>
            </>
          ) : saved ? "已保存" : "未保存"}
        </span>
      </div>

      {/* Stale Alert */}
      <StaleAlert projectId={project.id} targetType="outline" />

      {/* Editor Area — streaming view when generating, textarea otherwise */}
      <ScrollArea className="min-h-0 min-w-0 flex-1 px-4 py-4 sm:px-8 sm:py-5">
        <div className="min-h-full w-full min-w-0 pr-2 sm:pr-3">
          {generating ? (
            <StreamingView
              content={content}
              thinkingContent={thinkingContent}
              generating={generating}
            />
          ) : (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="app-scrollbar min-h-[400px] w-full resize-none overflow-y-auto bg-background border-none shadow-none focus-visible:ring-0 text-base leading-relaxed"
              placeholder="在此编写大纲，或点击 AI 生成..."
            />
          )}
        </div>
      </ScrollArea>

      {error && (
        <p className="shrink-0 px-4 text-sm text-destructive sm:px-8">{error}</p>
      )}

      {/* Action Bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/60 px-4 py-3 sm:px-6">
        {generating ? (
          <Button
            variant="destructive"
            onClick={cancel}
            className="rounded-full px-4 py-2.5 gap-1.5"
          >
            <Square className="h-4 w-4" />停止生成
          </Button>
        ) : (
          <Button
            onClick={handleGenerate}
            disabled={!currentPreset}
            className="rounded-full px-4 py-2.5 gap-1.5"
          >
            <Sparkles className="h-4 w-4" />
            AI 生成大纲
          </Button>
        )}

        <div className="inline-flex h-10 min-w-0 max-w-full shrink-0 items-center gap-2 rounded-full bg-secondary px-4 text-sm text-secondary-foreground">
          <Cpu className="h-4 w-4 shrink-0" />
          <Select value={String(currentPresetId ?? "")} onValueChange={(v) => switchPreset(Number(v))}>
            <SelectTrigger className="h-auto w-[min(240px,55vw)] border-0 bg-transparent p-0 text-secondary-foreground focus:ring-0">
              <SelectValue placeholder="选择模型" />
            </SelectTrigger>
            <SelectContent>
              {presets.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name} ({p.model_name})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          onClick={handleSave}
          disabled={saving || generating}
          className="rounded-full px-4 py-2.5 gap-1.5"
        >
          <Save className="h-4 w-4" />
          Ctrl+S
        </Button>
      </div>
    </div>
  );
}
