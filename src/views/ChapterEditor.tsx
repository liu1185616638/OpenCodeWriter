import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useChapters } from "@/hooks/useChapters";
import { useOutline } from "@/hooks/useOutline";
import { useCharacters } from "@/hooks/useCharacters";
import { useSettings } from "@/hooks/useSettings";
import { useAI } from "@/contexts/AIContext";
import { useAppEvents } from "@/hooks/useAppEvents";
import { reorderChapters } from "@/lib/tauri";
import { StaleAlert } from "@/components/shared/StaleAlert";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Project } from "@/types";
import { Trash2, Plus, Sparkles, Square, GripVertical, Cpu, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ChapterEditor({ project }: { project: Project }) {
  const { chapters, loading, load, create, update, remove } = useChapters(project.id);
  const { outline, load: loadOutline } = useOutline(project.id);
  const { characters, load: loadCharacters } = useCharacters(project.id);
  const { currentPreset, currentPresetId, switchPreset, presets } = useSettings();
  const { generating, error, generate, cancel } = useAI();
  // thinkingContent available but not used for non-text editors
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

  if (loading) return <div className="text-muted-foreground">加载中...</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <h2 className="text-lg font-semibold text-foreground">章节目录</h2>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {generating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
              <span className="text-primary">生成中...</span>
            </>
          ) : `${chapters.length} 章`}
        </span>
      </div>

      {/* Stale Alert */}
      <StaleAlert projectId={project.id} targetType="chapters" onRegenerate={handleGenerate} />

      {upstreamIncomplete && (
        <div className="mx-6 mb-2">
          <Alert>
            <AlertDescription>
              {outlineEmpty ? "请先完成大纲编写" : "请先完成人物设计"}，再生成章节目录
            </AlertDescription>
          </Alert>
        </div>
      )}

      {error && (
        <div className="mx-6 mb-2 p-3 rounded-3xl bg-destructive/10">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex overflow-auto">
        {/* Chapter list with drag reorder */}
        <div className="w-64 shrink-0 px-4 py-5 space-y-1.5 overflow-auto border-r border-border">
          {chapters.map((chapter) => (
            <div
              key={chapter.id}
              draggable
              onDragStart={(e) => handleDragStart(e, chapter.id)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(chapter.id)}
              onDragEnd={() => setDragId(null)}
              className={`flex items-center gap-2 px-3 py-3 rounded-2xl cursor-pointer transition-colors ${
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

        {/* Edit selected chapter */}
        <div className="flex-1 px-8 py-5 space-y-3 overflow-auto">
          {selectedChapter ? (
            <>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="章节标题" className="text-base" />
              <Textarea value={editSummary} onChange={(e) => setEditSummary(e.target.value)} placeholder="章节摘要" className="min-h-[200px] resize-none bg-background border-border" />
              <div className="flex gap-2">
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
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-2 px-6 py-2">
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
          <Button onClick={handleGenerate} disabled={!currentPreset || upstreamIncomplete} className="rounded-full px-4 py-2.5 gap-1.5">
            <Sparkles className="h-4 w-4" />
            AI 生成目录
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
              <Textarea value={newSummary} onChange={(e) => setNewSummary(e.target.value)} placeholder="输入章节摘要（可选）" className="min-h-[100px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} className="rounded-full">取消</Button>
            <Button onClick={handleCreateChapter} disabled={!newTitle.trim()} className="rounded-full">创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
