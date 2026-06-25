import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useChapters } from "@/hooks/useChapters";
import { useContent } from "@/hooks/useContent";
import { useSettings } from "@/hooks/useSettings";
import { useAI } from "@/contexts/AIContext";
import { useStopwords } from "@/hooks/useStopwords";
import { useAppEvents } from "@/hooks/useAppEvents";
import { StaleAlert } from "@/components/shared/StaleAlert";
import { StreamingView, stripThinking } from "@/components/shared/StreamingView";
import { STOPWORD_SUGGESTIONS } from "@/lib/stopwords";
import type { Project } from "@/types";
import { Save, Sparkles, Square, Cpu, WandSparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ContentEditor({ project }: { project: Project }) {
  const { chapters, loading: chaptersLoading, load: loadChapters } = useChapters(project.id);
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const { content, saving, load: loadContent, save } = useContent(selectedChapterId ?? 0);
  const { currentPreset, currentPresetId, switchPreset, presets } = useSettings();
  const { generating, streamedContent, thinkingContent, generatingStage, error, generate, cancel } = useAI();
  const [text, setText] = useState("");

  const stopwords = useStopwords(text);

  const hasNoChapters = !chaptersLoading && chapters.length === 0;

  useEffect(() => { loadChapters(); }, [loadChapters]);

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

  // Auto-save when generation finishes
  const prevGeneratingRef = useRef(false);
  useEffect(() => {
    if (prevGeneratingRef.current && !generating && selectedChapterId) {
      const timer = setTimeout(() => {
        if (streamedContent) {
          const cleaned = stripThinking(streamedContent);
          setText(cleaned);
          save(project.id, cleaned).then(() => {
            toast.success("正文已自动保存");
          }).catch(() => {
            toast.error("自动保存失败");
          });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
    prevGeneratingRef.current = generating;
  }, [generating, streamedContent, selectedChapterId, save, project.id]);

  const handleSave = useCallback(async () => {
    if (selectedChapterId) {
      await save(project.id, text);
    }
  }, [selectedChapterId, save, project.id, text]);

  const handleGenerate = useCallback(async () => {
    if (!currentPreset || !selectedChapterId) return;
    setText("");
    await generate({
      command: "generate_content",
      stage: "content",
      args: {
        projectId: project.id,
        chapterId: selectedChapterId,
        presetId: currentPreset.id,
      },
      onComplete: () => {
        // Toast is shown by auto-save effect below
      },
      onError: (err) => {
        toast.error("生成失败", { description: err });
      },
    });
  }, [currentPreset, selectedChapterId, generate, project.id]);

  const handlePolish = useCallback(async () => {
    if (!currentPreset || !selectedChapterId) return;
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

  const selectedChapter = chapters.find(c => c.id === selectedChapterId);
  const charCount = text.length;

  if (chaptersLoading) return <div className="p-6 text-muted-foreground">加载中...</div>;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* Editor Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <h2 className="min-w-0 truncate text-lg font-semibold text-foreground">
          {selectedChapter ? `第${selectedChapter.chapter_number}章 ${selectedChapter.title || "未命名"}` : "正文"}
        </h2>
        <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
          {generating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
              <span className="text-primary">生成中...</span>
            </>
          ) : selectedChapterId ? `${charCount.toLocaleString()} 字${stopwords.length > 0 ? ` | AI 味: ${stopwords.length} 处标记` : ""}` : ""}
        </span>
      </div>

      {/* Stale Alert */}
      <StaleAlert projectId={project.id} targetType="contents" onRegenerate={handleGenerate} />

      {hasNoChapters && (
        <div className="mx-4 mb-2 sm:mx-6">
          <Alert>
            <AlertDescription>请先创建章节目录，再进行正文编辑</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Main area: chapter list + editor */}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
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
        <ScrollArea className="min-w-0 flex-1 px-4 py-5 sm:px-8">
          <div className="flex min-h-full w-full min-w-0 flex-col pr-2 sm:pr-3">
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
        </ScrollArea>
      </div>

      {error && (
        <p className="shrink-0 px-4 text-sm text-destructive sm:px-8">{error}</p>
      )}

      {/* Action Bar — pill buttons */}
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
            disabled={!currentPreset || !selectedChapterId}
            className="rounded-full px-4 py-2.5 gap-1.5"
          >
            <Sparkles className="h-4 w-4" />
            AI 生成正文
          </Button>
        )}

        <div className="inline-flex h-10 min-w-0 max-w-full shrink-0 items-center gap-2 rounded-full bg-secondary px-4 text-sm text-secondary-foreground">
          <Cpu className="h-4 w-4 shrink-0" />
          <Select value={String(currentPresetId ?? "")} onValueChange={(v) => switchPreset(Number(v))}>
            <SelectTrigger className="h-auto w-[min(240px,55vw)] border-0 bg-transparent p-0 text-secondary-foreground focus:ring-0">
              <SelectValue placeholder="模型 ▼" />
            </SelectTrigger>
            <SelectContent>
              {presets.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.model_name})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {generating ? null : (
          <Button
            variant="outline"
            onClick={handlePolish}
            disabled={!currentPreset || !selectedChapterId || !text.trim()}
            className="rounded-full px-4 py-2.5 gap-1.5"
          >
            <WandSparkles className="h-4 w-4" />
            润色打磨
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
      </div>
    </div>
  );
}
