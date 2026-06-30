import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useChapters } from "@/hooks/useChapters";
import { useContent } from "@/hooks/useContent";
import { useSettings } from "@/hooks/useSettings";
import { useAI } from "@/contexts/AIContext";
import { useStopwords } from "@/hooks/useStopwords";
import { useAppEvents } from "@/hooks/useAppEvents";
import { StaleAlert } from "@/components/shared/StaleAlert";
import { FlowGuide } from "@/components/flow/FlowGuide";
import { StreamingView, stripThinking } from "@/components/shared/StreamingView";
import { STOPWORD_SUGGESTIONS } from "@/lib/stopwords";
import { WorkspacePageLayout } from "@/components/editor/WorkspacePageLayout";
import { AppScrollArea } from "@/components/shared/AppScrollArea";
import { EditorActionBar } from "@/components/editor/EditorActionBar";
import { ModelPresetSelect } from "@/components/editor/ModelPresetSelect";
import { EditorStatusText } from "@/components/editor/EditorStatusText";
import { GenerationStatusBar } from "@/components/ai/GenerationStatusBar";
import { GenerateConfirmDialog } from "@/components/ai/GenerateConfirmDialog";
import type { GenerationApplyMode } from "@/types/ai";
import type { Project } from "@/types";
import { saveContent } from "@/lib/tauri";
import { Save, Sparkles, Square, WandSparkles } from "lucide-react";
import { toast } from "sonner";

export function ContentEditor({ project }: { project: Project }) {
  const { chapters, loading: chaptersLoading, load: loadChapters } = useChapters(project.id);
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const { content, saving, load: loadContent, save } = useContent(selectedChapterId ?? 0);
  const { currentPreset, currentPresetId, switchPreset, presets } = useSettings();
  const { generating, streamedContent, thinkingContent, generatingStage, error, generate, cancel, generationMeta, generatedCharCount, elapsedMs } = useAI();
  const [text, setText] = useState("");
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const applyModeRef = useRef<GenerationApplyMode>("replace");

  const stopwords = useStopwords(text);

  const hasNoChapters = !chaptersLoading && chapters.length === 0;

  useEffect(() => { loadChapters(); }, [loadChapters]);

  // 章节加载完成后，恢复上次选中的章节
  useEffect(() => {
    if (chaptersLoading || chapters.length === 0 || selectedChapterId !== null) return;
    const saved = localStorage.getItem(`lastChapter_${project.id}`);
    if (saved) {
      const savedId = parseInt(saved, 10);
      if (chapters.some(c => c.id === savedId)) {
        setSelectedChapterId(savedId);
        return;
      }
    }
    // 无存储记录时默认选中第一章
    setSelectedChapterId(chapters[0].id);
  }, [chaptersLoading, chapters, project.id, selectedChapterId]);

  // 记录当前选中章节，供下次恢复
  useEffect(() => {
    if (selectedChapterId !== null) {
      localStorage.setItem(`lastChapter_${project.id}`, String(selectedChapterId));
    }
  }, [selectedChapterId, project.id]);

  useEffect(() => {
    if (selectedChapterId) {
      loadContent();
    } else {
      setText("");
    }
  }, [selectedChapterId, loadContent]);

  useEffect(() => {
    if (content) {
      setText(content.content);
    } else {
      setText("");
    }
  }, [content]);

  useEffect(() => {
    // During content generation: sync streamed text for live display
    // After generation ends: auto-save effect handles saving + reload
    if (generating && generatingStage === "content") {
      setText(streamedContent);
    }
  }, [streamedContent, generating, generatingStage]);

  // 生成开始时锁定目标章节和原始文本，避免切换章节后保错位置
  const prevGeneratingRef = useRef(false);
  const generatingChapterIdRef = useRef<number | null>(null);
  const textBeforeGenerationRef = useRef("");

  // Auto-save when generation finishes
  useEffect(() => {
    if (prevGeneratingRef.current && !generating) {
      // 立即重置，防止 deps 变化时重复触发
      prevGeneratingRef.current = false;
      const chapterId = generatingChapterIdRef.current;
      if (!chapterId || !streamedContent) return;
      const cleaned = stripThinking(streamedContent);
      const timer = setTimeout(() => {
        if (applyModeRef.current === "append" && textBeforeGenerationRef.current.trim()) {
          const combined = textBeforeGenerationRef.current + "\n\n" + cleaned;
          setText(combined);
          saveContent(project.id, chapterId, combined)
            .then(() => toast.success("正文已自动保存（追加）"))
            .catch(() => toast.error("自动保存失败"));
        } else {
          setText(cleaned);
          saveContent(project.id, chapterId, cleaned)
            .then(() => toast.success("正文已自动保存"))
            .catch(() => toast.error("自动保存失败"));
        }
      }, 50);
      return () => clearTimeout(timer);
    }
    prevGeneratingRef.current = generating;
  }, [generating, streamedContent, project.id]);

  const handleSave = useCallback(async () => {
    if (selectedChapterId) {
      await save(project.id, text);
    }
  }, [selectedChapterId, save, project.id, text]);

  const startGenerate = useCallback(async (mode: GenerationApplyMode) => {
    setShowGenerateConfirm(false);
    applyModeRef.current = mode;
    generatingChapterIdRef.current = selectedChapterId;   // 锁定目标章节
    textBeforeGenerationRef.current = text;               // 锁定追加模式的原始文本
    if (mode === "replace") setText("");
    await generate({
      command: "generate_content",
      stage: "content",
      args: {
        projectId: project.id,
        chapterId: selectedChapterId!,
        presetId: currentPreset!.id,
      },
      onComplete: () => {
        // auto-save effect handles saving
      },
      onError: (err) => {
        toast.error("生成失败", { description: err });
      },
    });
  }, [generate, project.id, selectedChapterId, currentPreset]);

  const handleGenerateClick = useCallback(() => {
    if (!currentPreset || !selectedChapterId || generating) return;
    if (text.trim()) {
      setShowGenerateConfirm(true);
      return;
    }
    startGenerate("replace");
  }, [currentPreset, selectedChapterId, generating, text, startGenerate]);

  const handlePolish = useCallback(async () => {
    if (!currentPreset || !selectedChapterId) return;
    applyModeRef.current = "replace";
    generatingChapterIdRef.current = selectedChapterId;   // 锁定目标章节
    textBeforeGenerationRef.current = text;
    await generate({
      command: "polish_content",
      stage: "content",
      args: {
        projectId: project.id,
        chapterId: selectedChapterId,
        presetId: currentPreset.id,
      },
      onComplete: () => {
        // Auto-save effect handles save + toast
      },
      onError: (err) => {
        toast.error("润色失败", { description: err });
      },
    });
  }, [currentPreset, selectedChapterId, generate, project.id]);

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

  const selectedChapter = chapters.find(c => c.id === selectedChapterId);
  const charCount = text.length;

  if (chaptersLoading) return <div className="p-6 text-muted-foreground">加载中...</div>;

  return (
    <>
    <WorkspacePageLayout
      title={selectedChapter ? `第${selectedChapter.chapter_number}章 ${selectedChapter.title || "未命名"}` : "正文"}
      status={
        generating && generatingStage === "content" ? (
          <GenerationStatusBar
            stageLabel="正文"
            modelName={generationMeta?.modelName}
            charCount={generatedCharCount}
            elapsedMs={elapsedMs}
          />
        ) : (
          <EditorStatusText
            generating={generating}
            idleLabel={selectedChapterId ? `${charCount.toLocaleString()} 字${stopwords.length > 0 ? ` | AI 呜: ${stopwords.length} 处标记` : ""}` : ""}
          />
        )
      }
      alerts={
        <>
          <FlowGuide stage="content" input={{ chapterCount: chapters.length, selectedChapterId }} />
          <StaleAlert projectId={project.id} targetType="contents" onRegenerate={handleGenerateClick} />
          {hasNoChapters && (
            <div className="mx-4 mb-2 sm:mx-6">
              <Alert>
                <AlertDescription>请先创建章节目录，再进行正文编辑</AlertDescription>
              </Alert>
            </div>
          )}
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
              disabled={!currentPreset || !selectedChapterId}
              className="rounded-full px-4 py-2.5 gap-1.5"
            >
              <Sparkles className="h-4 w-4" />
              AI 生成正文
            </Button>
          )}

          <ModelPresetSelect
            value={currentPresetId ?? null}
            presets={presets}
            onChange={(v) => switchPreset(v)}
            placeholder="选择模型"
          />

          {generating ? null : (
            <Button
              variant="outline"
              onClick={handlePolish}
              disabled={!currentPreset || !selectedChapterId || !text.trim()}
              className="rounded-full px-4 py-2.5 gap-1.5"
            >
              <WandSparkles className="h-4 w-4" />
              涤色打磨
            </Button>
          )}

          <Button
            variant="outline"
            onClick={handleSave}
            disabled={saving || !selectedChapterId || generating}
            className="rounded-full px-4 py-2.5 gap-1.5"
          >
            <Save className="h-4 w-4" />
            保存
          </Button>
        </EditorActionBar>
      }
    >
      {/* Main area: chapter list + editor */}
      <div className="flex min-h-0 min-w-0 h-full overflow-hidden">
        {/* Chapter list */}
        <ScrollArea className="w-48 shrink-0 border-r border-border">
          <div className="space-y-1 px-4 py-5 pr-2">
            {chapters.map((chapter) => (
              <button
                key={chapter.id}
                className={`w-full min-w-0 rounded-2xl px-3 py-2 text-left text-sm transition-colors ${
                  selectedChapterId === chapter.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-foreground hover:bg-accent"
                }`}
                onClick={() => setSelectedChapterId(chapter.id)}
                title={`第${chapter.chapter_number}章 ${chapter.title || "未命名"}`}
              >
                <span className="block truncate">第{chapter.chapter_number}章 {chapter.title || "未命名"}</span>
              </button>
            ))}
          </div>
        </ScrollArea>

        {/* Content editor — streaming view when generating, textarea otherwise */}
        <AppScrollArea>
          <div className="flex min-h-full w-full min-w-0 flex-col">
            {selectedChapterId ? (
              <>
                {generating ? (
                  <StreamingView
                    content={text}
                    thinkingContent={thinkingContent}
                    generating={generating}
                  />
                ) : (
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="app-scrollbar min-h-[420px] w-full flex-1 resize-none overflow-y-auto bg-background border-none shadow-none focus-visible:ring-0 text-base leading-relaxed"
                    placeholder="正文内容..."
                  />
                )}
                {stopwords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3 p-3 bg-card rounded-2xl">
                    <span className="text-xs text-muted-foreground mr-2">高频词：</span>
                    {stopwords.map(({ word, count }) => (
                      <span key={word} className="group relative">
                        <Badge
                          variant="secondary"
                          className="text-xs cursor-help border border-highlight/30 rounded-full px-2.5 py-0.5"
                        >
                          {word} ×{count}
                        </Badge>
                        {STOPWORD_SUGGESTIONS[word] && (
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex flex-col items-center z-50">
                            <span className="bg-popover text-popover-foreground text-xs rounded-xl px-3 py-1.5 shadow-lg border whitespace-nowrap">
                              建议：{STOPWORD_SUGGESTIONS[word].join("、")}
                            </span>
                            <span className="w-2 h-2 bg-popover border-r border-b rotate-45 -mt-1" />
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-center py-8">选择左侧章节开始编辑</p>
            )}
          </div>
        </AppScrollArea>
      </div>
    </WorkspacePageLayout>
    <GenerateConfirmDialog
      open={showGenerateConfirm}
      onOpenChange={setShowGenerateConfirm}
      onConfirm={startGenerate}
    />
    </>
  );
}
