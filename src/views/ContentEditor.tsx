import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { StreamingView } from "@/components/shared/StreamingView";
import { STOPWORD_SUGGESTIONS } from "@/lib/stopwords";
import type { Project } from "@/types";
import { Save, Sparkles, Square, Cpu, WandSparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ContentEditor({ project }: { project: Project }) {
  const { chapters, loading: chaptersLoading, load: loadChapters } = useChapters(project.id);
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const { content, saving, load: loadContent, save } = useContent(selectedChapterId ?? 0);
  const { currentPreset, currentPresetId, switchPreset, presets } = useSettings();
  const { generating, streamedContent, thinkingContent, error, generate, cancel } = useAI();
  const [text, setText] = useState("");

  const stopwords = useStopwords(text);

  const hasNoChapters = !chaptersLoading && chapters.length === 0;

  useEffect(() => { loadChapters(); }, [loadChapters]);

  useEffect(() => {
    if (selectedChapterId) loadContent();
  }, [selectedChapterId, loadContent]);

  useEffect(() => {
    if (content) setText(content.content);
  }, [content]);

  useEffect(() => {
    if (generating) {
      setText(streamedContent);
    } else if (streamedContent) {
      setText(streamedContent);
    }
  }, [streamedContent, generating]);

  // Auto-save when generation finishes
  const prevGeneratingRef = useRef(false);
  useEffect(() => {
    if (prevGeneratingRef.current && !generating && selectedChapterId) {
      // Use a timeout to ensure streamedContent state has fully settled
      const timer = setTimeout(() => {
        if (streamedContent) {
          save(project.id, streamedContent).then(() => {
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

  if (chaptersLoading) return <div className="text-muted-foreground">加载中...</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <h2 className="text-lg font-semibold text-foreground">
          {selectedChapter ? `第${selectedChapter.chapter_number}章 ${selectedChapter.title || "未命名"}` : "正文"}
        </h2>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
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
        <div className="mx-6 mb-2">
          <Alert>
            <AlertDescription>请先创建章节目录，再进行正文编辑</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Main area: chapter list + editor */}
      <div className="flex-1 flex overflow-auto">
        {/* Chapter list */}
        <div className="w-48 shrink-0 px-4 py-5 space-y-1 overflow-auto border-r border-border">
          {chapters.map((chapter) => (
            <button
              key={chapter.id}
              className={`w-full text-left px-3 py-2 rounded-2xl text-sm transition-colors ${
                selectedChapterId === chapter.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-foreground hover:bg-accent"
              }`}
              onClick={() => setSelectedChapterId(chapter.id)}
            >
              第{chapter.chapter_number}章 {chapter.title || "未命名"}
            </button>
          ))}
        </div>

        {/* Content editor — streaming view when generating, textarea otherwise */}
        <div className="flex-1 flex flex-col px-8 py-5 overflow-auto">
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
                  className="flex-1 min-h-[400px] resize-none bg-background border-none shadow-none focus-visible:ring-0 text-base leading-relaxed"
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
      </div>

      {error && (
        <p className="text-sm text-destructive px-8">{error}</p>
      )}

      {/* Action Bar — pill buttons */}
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
            disabled={!currentPreset || !selectedChapterId}
            className="rounded-full px-4 py-2.5 gap-1.5"
          >
            <Sparkles className="h-4 w-4" />
            AI 生成正文
          </Button>
        )}

        <Button variant="secondary" className="rounded-full px-4 py-2.5 gap-1.5">
          <Cpu className="h-4 w-4" />
          <Select value={String(currentPresetId ?? "")} onValueChange={(v) => switchPreset(Number(v))}>
            <SelectTrigger className="border-0 bg-transparent p-0 h-auto w-auto focus:ring-0 text-secondary-foreground">
              <SelectValue placeholder="模型 ▼" />
            </SelectTrigger>
            <SelectContent>
              {presets.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.model_name})</SelectItem>)}
            </SelectContent>
          </Select>
        </Button>

        <Button
          variant="outline"
          className="rounded-full px-4 py-2.5 gap-1.5"
          disabled
        >
          <WandSparkles className="h-4 w-4" />
          润色打磨
        </Button>

        <Button
          variant="outline"
          onClick={handleSave}
          disabled={saving || !selectedChapterId || generating}
          className="rounded-full px-4 py-2.5 gap-1.5"
        >
          <Save className="h-4 w-4" />
          Ctrl+S
        </Button>
      </div>
    </div>
  );
}
