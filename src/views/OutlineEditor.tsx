import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

  if (loading) return <div className="text-muted-foreground">加载中...</div>;

  const saved = !saving && outline?.content === content;

  return (
    <div className="flex flex-col h-full">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <h2 className="text-lg font-semibold text-foreground">大纲</h2>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
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
      <div className="flex-1 px-8 py-5 overflow-auto min-h-0">
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
            className="flex-1 min-h-[400px] resize-none bg-background border-none shadow-none focus-visible:ring-0 text-base leading-relaxed"
            placeholder="在此编写大纲，或点击 AI 生成..."
          />
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive px-8">{error}</p>
      )}

      {/* Action Bar */}
      <div className="flex items-center gap-2 px-6 py-2">
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

        <Button
          variant="secondary"
          className="rounded-full px-4 py-2.5 gap-1.5"
          onClick={() => {
            // Select dropdown is embedded, clicking the button opens it
          }}
        >
          <Cpu className="h-4 w-4" />
          <Select value={String(currentPresetId ?? "")} onValueChange={(v) => switchPreset(Number(v))}>
            <SelectTrigger className="border-0 bg-transparent p-0 h-auto w-auto focus:ring-0 text-secondary-foreground">
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
        </Button>

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
