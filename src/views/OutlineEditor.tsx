import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useOutline } from "@/hooks/useOutline";
import { useSettings } from "@/hooks/useSettings";
import { useAI } from "@/contexts/AIContext";
import { useAppEvents } from "@/hooks/useAppEvents";
import { StaleAlert } from "@/components/shared/StaleAlert";
import { FlowGuide } from "@/components/flow/FlowGuide";
import { StreamingView, stripThinking } from "@/components/shared/StreamingView";
import { WorkspacePageLayout } from "@/components/editor/WorkspacePageLayout";
import { AppScrollArea } from "@/components/shared/AppScrollArea";
import { EditorActionBar } from "@/components/editor/EditorActionBar";
import { ModelPresetSelect } from "@/components/editor/ModelPresetSelect";
import { EditorStatusText } from "@/components/editor/EditorStatusText";
import { GenerationStatusBar } from "@/components/ai/GenerationStatusBar";
import { GenerateConfirmDialog } from "@/components/ai/GenerateConfirmDialog";
import type { GenerationApplyMode } from "@/types/ai";
import type { Project } from "@/types";
import { Save, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";

export function OutlineEditor({ project }: { project: Project }) {
  const { outline, loading, saving, load, save } = useOutline(project.id);
  const { currentPreset, currentPresetId, switchPreset, presets } = useSettings();
  const { generating, streamedContent, thinkingContent, generatingStage, error, generate, cancel, generationMeta, generatedCharCount, elapsedMs } = useAI();
  const [content, setContent] = useState("");
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const applyModeRef = useRef<GenerationApplyMode>("replace");

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (outline) setContent(outline.content);
  }, [outline]);

  // 生成中：更新 content 以驱动 StreamingView
  // 只在 generatingStage === "outline" 且 generating 时同步流式内容
  // 生成结束：自动保存 effect 处理保存 + reload
  useEffect(() => {
    if (generating && generatingStage === "outline") {
      setContent(streamedContent);
    }
  }, [streamedContent, generating, generatingStage]);

  const handleSave = useCallback(async () => {
    await save(content);
  }, [save, content]);

  const startGenerate = useCallback(async (mode: GenerationApplyMode) => {
    setShowGenerateConfirm(false);
    applyModeRef.current = mode;
    if (mode === "replace") setContent("");
    await generate({
      command: "generate_outline",
      stage: "outline",
      args: {
        projectId: project.id,
        presetId: currentPreset!.id,
      },
      onComplete: () => {
        // auto-save effect handles saving
      },
      onError: (err) => {
        toast.error("生成失败", { description: err });
      },
    });
  }, [generate, project.id, currentPreset]);

  const handleGenerateClick = useCallback(() => {
    if (!currentPreset || generating) return;
    if (content.trim()) {
      setShowGenerateConfirm(true);
      return;
    }
    startGenerate("replace");
  }, [currentPreset, generating, content, startGenerate]);

  // Auto-save when generation finishes
  const prevGeneratingRef = useRef(false);
  useEffect(() => {
    if (prevGeneratingRef.current && !generating) {
      const timer = setTimeout(() => {
        if (streamedContent) {
          const cleaned = stripThinking(streamedContent);
          if (applyModeRef.current === "append" && content.trim()) {
            const prevContent = content;
            const combined = prevContent + "\n\n" + cleaned;
            setContent(combined);
            save(combined).then(() => {
              toast.success("大纲已自动保存（追加）");
            }).catch(() => {
              toast.error("自动保存失败");
            });
          } else {
            setContent(cleaned);
            save(cleaned).then(() => {
              toast.success("大纲已自动保存");
            }).catch(() => {
              toast.error("自动保存失败");
            });
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
    prevGeneratingRef.current = generating;
  }, [generating, streamedContent, save, content]);

  useAppEvents({
    onGenerate: handleGenerateClick,
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
    <>
    <WorkspacePageLayout
      title="大纲"
      status={
        generating && generatingStage === "outline" ? (
          <GenerationStatusBar
            stageLabel="大纲"
            modelName={generationMeta?.modelName}
            charCount={generatedCharCount}
            elapsedMs={elapsedMs}
          />
        ) : (
          <EditorStatusText generating={generating} saved={saved} />
        )
      }
      alerts={
        <>
          <FlowGuide stage="outline" input={{ outlineContent: content }} />
          <StaleAlert projectId={project.id} targetType="outline" />
        </>
      }
      error={error}
      actionBar={
        <EditorActionBar>
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
              onClick={handleGenerateClick}
              disabled={!currentPreset}
              className="rounded-full px-4 py-2.5 gap-1.5"
            >
              <Sparkles className="h-4 w-4" />
              AI 生成大纲
            </Button>
          )}

          <ModelPresetSelect
            value={currentPresetId ?? null}
            presets={presets}
            onChange={(v) => switchPreset(v)}
            placeholder="选择模型"
          />

          <Button
            variant="outline"
            onClick={handleSave}
            disabled={saving || generating}
            className="rounded-full px-4 py-2.5 gap-1.5"
          >
            <Save className="h-4 w-4" />
            保存
          </Button>
        </EditorActionBar>
      }
    >
      <AppScrollArea>
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
      </AppScrollArea>
    </WorkspacePageLayout>
    <GenerateConfirmDialog
      open={showGenerateConfirm}
      onOpenChange={setShowGenerateConfirm}
      onConfirm={startGenerate}
    />
    </>
  );
}
