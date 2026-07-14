/**
 * ChapterEditor — Carbon Frost 章节规划工作台 (Phase E / V7)
 *
 * 左侧章节列表（表格行：序号、标题、视角、状态、字数进度、过时原因）
 * 右侧任务单检查器（完整字段：视角、场景、出场人物、转折点、结果等）
 * 拖拽排序 + 上移/下移按钮
 */

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useChapters } from "@/hooks/useChapters";
import { useOutline } from "@/hooks/useOutline";
import { useCharacters } from "@/hooks/useCharacters";
import { useSettings } from "@/hooks/useSettings";
import { useAI } from "@/contexts/AIContext";
import { useAppEvents } from "@/hooks/useAppEvents";
import { reorderChapters, moveChapter, listChapterWorkspaceSummaries, updateChapterTaskSheet } from "@/lib/tauri";
import { StaleAlert } from "@/components/shared/StaleAlert";
import { FlowGuide } from "@/components/flow/FlowGuide";
import { GeneratingLoader } from "@/components/shared/GeneratingLoader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Project, ChapterWorkspaceSummary } from "@/types";
import { Trash2, Plus, Sparkles, Square, WandSparkles, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, string> = {
  planned: "待写",
  drafting: "撰写中",
  completed: "已完成",
  reviewed: "已审核",
  needs_revision: "需修改",
};

const STATUS_COLORS: Record<string, string> = {
  planned: "var(--text-muted)",
  drafting: "var(--accent)",
  completed: "var(--success)",
  reviewed: "var(--info)",
  needs_revision: "var(--warning)",
};

export function ChapterEditor({ project }: { project: Project }) {
  const { chapters, loading, load, create, remove } = useChapters(project.id);
  const { outline, load: loadOutline } = useOutline(project.id);
  const { characters, load: loadCharacters } = useCharacters(project.id);
  const { currentPreset, currentPresetId, switchPreset, presets } = useSettings();
  const { generating, streamedContent, thinkingContent, generatingStage, error, generate, cancel, generatedCharCount, elapsedMs, generationMeta } = useAI();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [summaries, setSummaries] = useState<ChapterWorkspaceSummary[]>([]);

  // Task sheet fields (all Phase E fields)
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editGoal, setEditGoal] = useState("");
  const [editConflictLevel, setEditConflictLevel] = useState(3);
  const [editHook, setEditHook] = useState("");
  const [editPayoff, setEditPayoff] = useState("");
  const [editMustAvoid, setEditMustAvoid] = useState("");
  const [editTargetWordCount, setEditTargetWordCount] = useState(3000);
  const [editViewpoint, setEditViewpoint] = useState("");
  const [editScene, setEditScene] = useState("");
  const [editCastIds, setEditCastIds] = useState<number[]>([]);
  const [editTurningPoint, setEditTurningPoint] = useState("");
  const [editOutcome, setEditOutcome] = useState("");
  const [editStatus, setEditStatus] = useState("planned");
  const [editExpectedUpdatedAt, setEditExpectedUpdatedAt] = useState("");

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");

  const [dragId, setDragId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSummaries = useCallback(async () => {
    try {
      const list = await listChapterWorkspaceSummaries(project.id);
      setSummaries(list);
    } catch (e) {
      console.error("Failed to load chapter summaries:", e);
    }
  }, [project.id]);

  const handleCreateChapter = async () => {
    const nextChapterNumber = chapters.length > 0
      ? Math.max(...chapters.map(c => c.chapter_number)) + 1
      : 1;
    await create(nextChapterNumber, newTitle, newSummary);
    setNewTitle("");
    setNewSummary("");
    setShowAddDialog(false);
    loadSummaries();
  };

  useEffect(() => { load(); loadSummaries(); }, [load, loadSummaries]);
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
      setEditGoal(selectedChapter.goal);
      setEditConflictLevel(selectedChapter.conflict_level);
      setEditHook(selectedChapter.hook);
      setEditPayoff(selectedChapter.payoff);
      setEditMustAvoid(selectedChapter.must_avoid);
      setEditTargetWordCount(selectedChapter.target_word_count);
      setEditViewpoint(selectedChapter.viewpoint);
      setEditScene(selectedChapter.scene);
      try {
        setEditCastIds(JSON.parse(selectedChapter.cast_character_ids_json || "[]"));
      } catch { setEditCastIds([]); }
      setEditTurningPoint(selectedChapter.turning_point);
      setEditOutcome(selectedChapter.outcome);
      setEditStatus(selectedChapter.status);
      setEditExpectedUpdatedAt(selectedChapter.updated_at);
    }
  }, [selectedChapter]);

  const handleSaveTaskSheet = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await updateChapterTaskSheet(selectedId, {
        title: editTitle,
        summary: editSummary,
        goal: editGoal,
        conflict_level: editConflictLevel,
        hook: editHook,
        payoff: editPayoff,
        must_avoid: editMustAvoid,
        target_word_count: editTargetWordCount,
        viewpoint: editViewpoint,
        scene: editScene,
        cast_character_ids_json: JSON.stringify(editCastIds),
        turning_point: editTurningPoint,
        outcome: editOutcome,
        status: editStatus,
        expected_updated_at: editExpectedUpdatedAt,
      });
      await load();
      loadSummaries();
      toast.success("任务单已保存");
    } catch (e) {
      toast.error("保存失败", { description: String(e) });
    } finally {
      setSaving(false);
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
        modelName: currentPreset.model_name,
      },
      onComplete: () => {
        load();
        loadSummaries();
        toast.success("章节目录已生成");
      },
      onError: (err) => {
        toast.error("生成失败", { description: err });
      },
    });
  }, [currentPreset, generate, project.id, load, loadSummaries]);

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
        loadSummaries();
        toast.success("章节目录已润色");
      },
      onError: (err) => {
        toast.error("润色失败", { description: err });
      },
    });
  }, [currentPreset, generate, project.id, load, loadSummaries]);

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
    loadSummaries();
    setDragId(null);
  };

  const handleMoveUp = async (id: number) => {
    const idx = chapters.findIndex(c => c.id === id);
    if (idx <= 0) return;
    const beforeId = chapters[idx - 1].id;
    await moveChapter(id, beforeId, null);
    load();
    loadSummaries();
  };

  const handleMoveDown = async (id: number) => {
    const idx = chapters.findIndex(c => c.id === id);
    if (idx === -1 || idx >= chapters.length - 1) return;
    const afterId = chapters[idx + 1].id;
    await moveChapter(id, null, afterId);
    load();
    loadSummaries();
  };

  useAppEvents({
    onGenerate: handleGenerate,
    onSave: handleSaveTaskSheet,
    onSwitchModel: () => {
      if (presets.length > 1 && currentPresetId) {
        const idx = presets.findIndex(p => p.id === currentPresetId);
        const next = presets[(idx + 1) % presets.length];
        switchPreset(next.id);
      }
    },
  });

  if (loading) return <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>加载中...</div>;

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ── Left: Chapter List Area ── */}
      <div className="flex-1 min-w-0 flex flex-col" style={{ backgroundColor: "var(--canvas)" }}>
        {/* Toolbar */}
        <div className="flex items-center justify-between shrink-0" style={{ height: 48, padding: "0 16px", borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--text-secondary)", fontSize: 13, fontWeight: 600 }}>
              {chapters.length} 章
            </span>
            {summaries.some(s => s.content_stale) && (
              <span style={{ color: "var(--warning)", fontSize: 11 }}>
                {summaries.filter(s => s.content_stale).length} 章正文过时
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddDialog(true)}
              style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}
            >
              <Plus className="h-3.5 w-3.5" />新建章节
            </Button>
            {generating && generatingStage === "chapters" ? (
              <Button variant="destructive" size="sm" onClick={cancel} style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}>
                <Square className="h-3.5 w-3.5" />停止
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={handleGenerate}
                  disabled={!currentPreset || upstreamIncomplete}
                  style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}
                >
                  <Sparkles className="h-3.5 w-3.5" />AI 生成目录
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePolish}
                  disabled={!currentPreset || chapters.length === 0}
                  style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}
                >
                  <WandSparkles className="h-3.5 w-3.5" />润色
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Alerts */}
        {(upstreamIncomplete || error) && (
          <div style={{ padding: "8px 16px" }}>
            {error && <p style={{ color: "var(--danger)", fontSize: 12 }}>{error}</p>}
            {upstreamIncomplete && (
              <Alert style={{ borderRadius: "var(--radius-sm)" }}>
                <AlertDescription style={{ fontSize: 12 }}>
                  {outlineEmpty ? "请先完成大纲编写" : "请先完成人物设计"}，再生成章节目录
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Generation view */}
        {generating && generatingStage === "chapters" ? (
          <div className="flex-1 overflow-y-auto p-6">
            <GeneratingLoader
              thinkingContent={thinkingContent}
              outputContent={streamedContent}
              label="正在生成章节目录..."
              generating={generating}
              elapsedMs={elapsedMs}
              charCount={generatedCharCount}
              modelName={generationMeta?.modelName}
            />
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="flex items-center shrink-0" style={{ height: 36, borderBottom: "1px solid var(--border)", backgroundColor: "var(--surface)", padding: "0 16px" }}>
              <div style={{ width: 44 }} />
              <div style={{ width: 60, fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>序号</div>
              <div style={{ width: 220, fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>标题 / 摘要</div>
              <div style={{ width: 100, fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>视角</div>
              <div style={{ width: 110, fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>状态</div>
              <div style={{ width: 150, fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>字数进度</div>
              <div style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>备注</div>
            </div>

            {/* Chapter Rows */}
            <div className="flex-1 overflow-y-auto">
              {chapters.map((chapter) => {
                const summary = summaries.find(s => s.id === chapter.id);
                const isSelected = selectedId === chapter.id;
                return (
                  <div
                    key={chapter.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, chapter.id)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(chapter.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => setSelectedId(chapter.id)}
                    className="flex items-center cursor-pointer transition-colors group"
                    style={{
                      height: 56,
                      borderBottom: "1px solid var(--border)",
                      backgroundColor: isSelected ? "var(--surface-selected)" : "var(--surface)",
                      opacity: dragId === chapter.id ? 0.5 : 1,
                      padding: "0 16px",
                    }}
                  >
                    {/* Drag handle */}
                    <div style={{ width: 44, display: "flex", justifyContent: "center", alignItems: "center" }}>
                      <GripVertical className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-muted)" }} />
                    </div>
                    {/* Number */}
                    <div style={{ width: 60, display: "flex", justifyContent: "center", alignItems: "center" }}>
                      <span style={{ fontFamily: "var(--font-data)", fontSize: 13, color: "var(--text-secondary)" }}>
                        {chapter.chapter_number}
                      </span>
                    </div>
                    {/* Title + Summary */}
                    <div style={{ width: 220, overflow: "hidden", padding: "0 8px" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {chapter.title || "未命名"}
                      </div>
                      {chapter.summary && (
                        <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                          {chapter.summary}
                        </div>
                      )}
                    </div>
                    {/* POV */}
                    <div style={{ width: 100, display: "flex", justifyContent: "center", alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        {chapter.viewpoint || "—"}
                      </span>
                    </div>
                    {/* Status */}
                    <div style={{ width: 110, display: "flex", justifyContent: "center", alignItems: "center" }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "var(--radius-sm)",
                        color: STATUS_COLORS[chapter.status] || "var(--text-muted)",
                        backgroundColor: "var(--surface-hover)",
                      }}>
                        {STATUS_LABELS[chapter.status] || chapter.status}
                      </span>
                    </div>
                    {/* Word progress */}
                    <div style={{ width: 150, display: "flex", justifyContent: "center", alignItems: "center" }}>
                      <span style={{ fontFamily: "var(--font-data)", fontSize: 12, color: "var(--text-secondary)" }}>
                        {summary ? `${summary.word_count.toLocaleString()} / ${chapter.target_word_count.toLocaleString()}` : `0 / ${chapter.target_word_count.toLocaleString()}`}
                      </span>
                    </div>
                    {/* Stale reason / issues */}
                    <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 12px" }}>
                      {summary?.content_stale && (
                        <span style={{ fontSize: 12, color: "var(--warning)" }}>正文过时</span>
                      )}
                      {!summary?.content_stale && summary && summary.issue_count > 0 && (
                        <span style={{ fontSize: 12, color: "var(--warning)" }}>{summary.issue_count} 个审核问题</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {chapters.length === 0 && !generating && (
                <div className="flex items-center justify-center" style={{ height: 200, color: "var(--text-muted)" }}>
                  <span style={{ fontSize: 14 }}>暂无章节</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between shrink-0" style={{ height: 40, borderTop: "1px solid var(--border)", backgroundColor: "var(--surface)", padding: "0 16px" }}>
              <div className="flex items-center gap-2">
                <FlowGuide stage="chapters" input={{ outlineContent: outline?.content, characterCount: characters.length, chapterCount: chapters.length }} />
              </div>
              <StaleAlert projectId={project.id} targetType="chapters" onRegenerate={handleGenerate} />
            </div>
          </>
        )}
      </div>

      {/* ── Right: Task Sheet Inspector (320px) ── */}
      {selectedChapter && !generating && (
        <div className="shrink-0 flex flex-col overflow-hidden" style={{ width: 320, borderLeft: "1px solid var(--border)", backgroundColor: "var(--surface)" }}>
          {/* Inspector Header */}
          <div className="flex items-center justify-between shrink-0" style={{ height: 48, padding: "0 16px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>章节任务单</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleMoveUp(selectedChapter.id)}
                disabled={chapters.findIndex(c => c.id === selectedChapter.id) === 0}
                title="上移"
                style={{ padding: 4, borderRadius: "var(--radius-sm)", opacity: chapters.findIndex(c => c.id === selectedChapter.id) === 0 ? 0.3 : 1 }}
              >
                <ChevronUp className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
              </button>
              <button
                onClick={() => handleMoveDown(selectedChapter.id)}
                disabled={chapters.findIndex(c => c.id === selectedChapter.id) === chapters.length - 1}
                title="下移"
                style={{ padding: 4, borderRadius: "var(--radius-sm)", opacity: chapters.findIndex(c => c.id === selectedChapter.id) === chapters.length - 1 ? 0.3 : 1 }}
              >
                <ChevronDown className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
              </button>
            </div>
          </div>

          {/* Inspector Content */}
          <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
            <div className="flex flex-col" style={{ gap: 14 }}>
              {/* Title */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>标题</label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="章节标题" style={{ fontSize: 14, marginTop: 4 }} />
              </div>

              {/* Summary */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>摘要</label>
                <Textarea value={editSummary} onChange={(e) => setEditSummary(e.target.value)} placeholder="章节摘要" className="app-scrollbar" style={{ minHeight: 80, resize: "vertical", fontSize: 13, marginTop: 4 }} />
              </div>

              {/* Status */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>状态</label>
                <div className="flex gap-1.5" style={{ marginTop: 4 }}>
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setEditStatus(key)}
                      style={{
                        padding: "3px 8px",
                        borderRadius: "var(--radius-sm)",
                        fontSize: 11,
                        fontWeight: 600,
                        border: "1px solid",
                        borderColor: editStatus === key ? "var(--accent)" : "var(--border)",
                        backgroundColor: editStatus === key ? "var(--accent-soft)" : "transparent",
                        color: editStatus === key ? "var(--accent)" : "var(--text-muted)",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Viewpoint */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>视角</label>
                <Input value={editViewpoint} onChange={(e) => setEditViewpoint(e.target.value)} placeholder="如：主角方远" style={{ fontSize: 13, marginTop: 4 }} />
              </div>

              {/* Scene */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>场景</label>
                <Input value={editScene} onChange={(e) => setEditScene(e.target.value)} placeholder="如：雾港码头·夜" style={{ fontSize: 13, marginTop: 4 }} />
              </div>

              {/* Cast Characters */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>出场人物</label>
                <div className="flex flex-wrap gap-1.5" style={{ marginTop: 4 }}>
                  {characters.map(char => (
                    <button
                      key={char.id}
                      onClick={() => {
                        setEditCastIds(prev =>
                          prev.includes(char.id)
                            ? prev.filter(id => id !== char.id)
                            : [...prev, char.id]
                        );
                      }}
                      style={{
                        padding: "2px 8px",
                        borderRadius: "var(--radius-sm)",
                        fontSize: 12,
                        border: "1px solid",
                        borderColor: editCastIds.includes(char.id) ? "var(--accent)" : "var(--border)",
                        backgroundColor: editCastIds.includes(char.id) ? "var(--accent-soft)" : "transparent",
                        color: editCastIds.includes(char.id) ? "var(--accent)" : "var(--text-secondary)",
                      }}
                    >
                      {char.name}
                    </button>
                  ))}
                  {characters.length === 0 && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>暂无人物</span>
                  )}
                </div>
              </div>

              {/* Goal */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>本章目标</label>
                <Textarea value={editGoal} onChange={(e) => setEditGoal(e.target.value)} placeholder="本章要完成什么" className="app-scrollbar" style={{ minHeight: 56, resize: "vertical", fontSize: 13, marginTop: 4 }} />
              </div>

              {/* Conflict Level */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>冲突等级（1-5）</label>
                <div className="flex items-center gap-1.5" style={{ marginTop: 4 }}>
                  {[1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      onClick={() => setEditConflictLevel(level)}
                      style={{
                        width: 30, height: 30,
                        borderRadius: "var(--radius-sm)",
                        fontSize: 12, fontWeight: 600,
                        backgroundColor: editConflictLevel === level ? "var(--accent)" : "var(--surface-hover)",
                        color: editConflictLevel === level ? "#fff" : "var(--text-muted)",
                      }}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Turning Point */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>转折点</label>
                <Textarea value={editTurningPoint} onChange={(e) => setEditTurningPoint(e.target.value)} placeholder="本章的关键转折" className="app-scrollbar" style={{ minHeight: 56, resize: "vertical", fontSize: 13, marginTop: 4 }} />
              </div>

              {/* Hook */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>开篇钩子</label>
                <Input value={editHook} onChange={(e) => setEditHook(e.target.value)} placeholder="用什么抓住读者" style={{ fontSize: 13, marginTop: 4 }} />
              </div>

              {/* Payoff */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>收束回报</label>
                <Input value={editPayoff} onChange={(e) => setEditPayoff(e.target.value)} placeholder="结尾给读者什么满足感" style={{ fontSize: 13, marginTop: 4 }} />
              </div>

              {/* Outcome */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>结果</label>
                <Textarea value={editOutcome} onChange={(e) => setEditOutcome(e.target.value)} placeholder="本章结束时的状态" className="app-scrollbar" style={{ minHeight: 56, resize: "vertical", fontSize: 13, marginTop: 4 }} />
              </div>

              {/* Must Avoid */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>禁止事项</label>
                <Textarea value={editMustAvoid} onChange={(e) => setEditMustAvoid(e.target.value)} placeholder="必须避免的内容" className="app-scrollbar" style={{ minHeight: 56, resize: "vertical", fontSize: 13, marginTop: 4 }} />
              </div>

              {/* Target Word Count */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>目标字数</label>
                <Input
                  type="number"
                  value={editTargetWordCount}
                  onChange={(e) => setEditTargetWordCount(parseInt(e.target.value) || 0)}
                  min={0}
                  style={{ fontSize: 13, width: 120, marginTop: 4 }}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2" style={{ marginTop: 4 }}>
                <Button size="sm" onClick={handleSaveTaskSheet} disabled={saving} style={{ borderRadius: "var(--radius-sm)", fontSize: 12, flex: 1 }}>
                  {saving ? "保存中..." : "保存任务单"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (selectedId) {
                      remove(selectedId);
                      setSelectedId(null);
                      loadSummaries();
                    }
                  }}
                  style={{ borderRadius: "var(--radius-sm)", fontSize: 12 }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
