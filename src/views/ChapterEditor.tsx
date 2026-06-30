import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useChapters } from "@/hooks/useChapters";
import { useOutline } from "@/hooks/useOutline";
import { useCharacters } from "@/hooks/useCharacters";
import { useSettings } from "@/hooks/useSettings";
import { useAI } from "@/contexts/AIContext";
import { useAppEvents } from "@/hooks/useAppEvents";
import { reorderChapters } from "@/lib/tauri";
import { StaleAlert } from "@/components/shared/StaleAlert";
import { FlowGuide } from "@/components/flow/FlowGuide";
import { StreamingView } from "@/components/shared/StreamingView";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { WorkspacePageLayout } from "@/components/editor/WorkspacePageLayout";
import { EditorActionBar } from "@/components/editor/EditorActionBar";
import { ModelPresetSelect } from "@/components/editor/ModelPresetSelect";
import { EditorStatusText } from "@/components/editor/EditorStatusText";
import type { Project } from "@/types";
import { Trash2, Plus, Sparkles, Square, GripVertical, WandSparkles } from "lucide-react";
import { toast } from "sonner";

export function ChapterEditor({ project }: { project: Project }) {
  const { chapters, loading, load, create, update, remove } = useChapters(project.id);
  const { outline, load: loadOutline } = useOutline(project.id);
  const { characters, load: loadCharacters } = useCharacters(project.id);
  const { currentPreset, currentPresetId, switchPreset, presets } = useSettings();
  const { generating, streamedContent, thinkingContent, generatingStage, error, generate, cancel } = useAI();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");

  const [dragId, setDragId] = useState<number | null>(null);

  const handleCreateChapter = async () => {
    const nextChapterNumber = chapters.length > 0
      ? Math.max(...chapters.map(c => c.chapter_number)) + 1
      : 1;
    await create(nextChapterNumber, newTitle, newSummary);
    setNewTitle("");
    setNewSummary("");
    setShowAddDialog(false);
  };

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadOutline(); }, [loadOutline]);
  useEffect(() => { loadCharacters(); }, [loadCharacters]);

  const outlineEmpty = !outline || outline.status === "empty" || !outline.content;
  const noCharacters = characters.length === 0;
  const upstreamIncomplete = outlineEmpty || noCharacters;

  const selectedChapter = chapters.find(c => c.id === selectedId);

  useEffect(() => {
    if (selectedChapter) {
      setEditTitle(selectedChapter.title);
      setEditSummary(selectedChapter.summary);
    }
  }, [selectedChapter]);

  const handleSaveSelected = async () => {
    if (selectedId) {
      await update(selectedId, editTitle, editSummary);
    }
  };

  const handleGenerate = useCallback(async () => {
    if (!currentPreset) return;
    await generate({
      command: "generate_chapters",
      stage: "chapters",
      args: {
        projectId: project.id,
        presetId: currentPreset.id,
      },
      onComplete: () => {
        load();
        toast.success("章节目录已生成");
      },
      onError: (err) => {
        toast.error("生成失败", { description: err });
      },
    });
  }, [currentPreset, generate, project.id, load]);

  const handlePolish = useCallback(async () => {
    if (!currentPreset) return;
    await generate({
      command: "polish_chapter",
      stage: "chapters",
      args: {
        projectId: project.id,
        presetId: currentPreset.id,
      },
      onComplete: () => {
        load();
        toast.success("章节目录已润色");
      },
      onError: (err) => {
        toast.error("润色失败", { description: err });
      },
    });
  }, [currentPreset, generate, project.id, load]);

  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (targetId: number) => {
    if (dragId === null || dragId === targetId) return;
    const ids = chapters.map(c => c.id);
    const fromIdx = ids.indexOf(dragId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, dragId);
    await reorderChapters(project.id, ids);
    load();
    setDragId(null);
  };

  useAppEvents({
    onGenerate: handleGenerate,
    onSave: handleSaveSelected,
    onSwitchModel: () => {
      if (presets.length > 1 && currentPresetId) {
        const idx = presets.findIndex(p => p.id === currentPresetId);
        const next = presets[(idx + 1) % presets.length];
        switchPreset(next.id);
      }
    },
  });

  if (loading) return <div className="p-6 text-muted-foreground">加载中...</div>;

  return (
    <WorkspacePageLayout
      title="章节目录"
      status={<EditorStatusText generating={generating} idleLabel={`${chapters.length} 章`} />}
      alerts={
        <>
          <FlowGuide stage="chapters" input={{ outlineContent: outline?.content, characterCount: characters.length, chapterCount: chapters.length }} />
          <StaleAlert projectId={project.id} targetType="chapters" onRegenerate={handleGenerate} />
          {upstreamIncomplete && (
            <div className="mx-4 mb-2 sm:mx-6">
              <Alert>
                <AlertDescription>
                  {outlineEmpty ? "请先完成大纲编写" : "请先完成人物设计"}，再生成章节目录
                </AlertDescription>
              </Alert>
            </div>
          )}
        </>
      }
      error={error ? <p className="text-sm text-destructive">{error}</p> : undefined}
      actionBar={
        <EditorActionBar>
          <Button
            variant="outline"
            onClick={() => setShowAddDialog(true)}
            className="rounded-full px-4 py-2.5 gap-1.5"
          >
            <Plus className="h-4 w-4" />新建章节
          </Button>
          {generating ? (
            <Button variant="destructive" onClick={cancel} className="rounded-full px-4 py-2.5 gap-1.5">
              <Square className="h-4 w-4" />停止生成
            </Button>
          ) : (
            <>
              <Button onClick={handleGenerate} disabled={!currentPreset || upstreamIncomplete} className="rounded-full px-4 py-2.5 gap-1.5">
                <Sparkles className="h-4 w-4" />
                AI 生成目录
              </Button>
              <Button
                variant="outline"
                onClick={handlePolish}
                disabled={!currentPreset || chapters.length === 0}
                className="rounded-full px-4 py-2.5 gap-1.5"
              >
                <WandSparkles className="h-4 w-4" />
                润色打磨
              </Button>
              <ModelPresetSelect
                value={currentPresetId ?? null}
                presets={presets}
                onChange={(v) => switchPreset(v)}
                placeholder="选择模型"
              />
            </>
          )}
        </EditorActionBar>
      }
    >
      {/* Main split pane area */}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* Chapter list with drag reorder */}
        <ScrollArea className="w-64 shrink-0 border-r border-border">
          <div className="space-y-1.5 px-4 py-5 pr-2">
            {chapters.map((chapter) => (
              <div
                key={chapter.id}
                draggable
                onDragStart={(e) => handleDragStart(e, chapter.id)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(chapter.id)}
                onDragEnd={() => setDragId(null)}
                className={`flex min-w-0 items-center gap-2 rounded-2xl px-3 py-3 cursor-pointer transition-colors ${
                  selectedId === chapter.id ? "bg-sidebar-accent" : "hover:bg-accent"
                } ${dragId === chapter.id ? "opacity-50" : ""}`}
                onClick={() => setSelectedId(chapter.id)}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">第{chapter.chapter_number}章</div>
                  <div className="text-foreground text-sm truncate">{chapter.title || "未命名"}</div>
                  {chapter.summary && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{chapter.summary}</p>
                  )}
                </div>
              </div>
            ))}
            {chapters.length === 0 && !generating && (
              <p className="text-muted-foreground text-center py-4 text-sm">暂无章节</p>
            )}
          </div>
        </ScrollArea>

        {/* Edit selected chapter / Streaming view during generation */}
        <ScrollArea className="min-w-0 flex-1 px-4 py-5 sm:px-8">
          <div className="min-h-full w-full min-w-0 space-y-3 pr-2 sm:pr-3">
            {generating && generatingStage === "chapters" ? (
              <StreamingView
                content={streamedContent}
                thinkingContent={thinkingContent}
                generating={generating}
              />
            ) : selectedChapter ? (
              <>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="章节标题" className="text-base" />
                <Textarea value={editSummary} onChange={(e) => setEditSummary(e.target.value)} placeholder="章节摘要" className="app-scrollbar min-h-[220px] resize-y overflow-y-auto bg-background border-border" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={handleSaveSelected} className="rounded-full">保存</Button>
                  <Button size="sm" variant="destructive" className="rounded-full" onClick={() => { if (selectedId) remove(selectedId); setSelectedId(null); }}>
                    <Trash2 className="h-3 w-3" />删除
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-center py-8">选择左侧章节进行编辑</p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* New chapter dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建章节</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">章节标题</label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="输入章节标题" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">章节摘要</label>
              <Textarea value={newSummary} onChange={(e) => setNewSummary(e.target.value)} placeholder="输入章节摘要（可选）" className="app-scrollbar min-h-[120px] resize-y" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} className="rounded-full">取消</Button>
            <Button onClick={handleCreateChapter} disabled={!newTitle.trim()} className="rounded-full">创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspacePageLayout>
  );
}
