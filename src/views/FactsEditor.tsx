/**
 * FactsEditor — 事实与伏笔工作区 (Phase G / V10)
 *
 * 左侧分栏切换：事实 / 伏笔
 * 事实列表：类型、内容、置信度、来源章节
 * 伏笔列表：埋设章节、计划回收章节、状态、逾期提醒
 * 右侧详情编辑
 */

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Bookmark, Plus, Trash2, AlertTriangle,
  FileText, Lightbulb,
} from "lucide-react";
import {
  listStoryFacts, createStoryFact, updateStoryFact, deleteStoryFact,
  listForeshadows, createForeshadow, updateForeshadow, deleteForeshadow,
} from "@/lib/tauri";
import { useChapters } from "@/hooks/useChapters";
import type { Project, StoryFact, Foreshadow } from "@/types";
import { toast } from "sonner";

type ActiveTab = "facts" | "foreshadows";

const FACT_TYPES = [
  { value: "character", label: "人物" },
  { value: "event", label: "事件" },
  { value: "world", label: "世界观" },
  { value: "timeline", label: "时间线" },
  { value: "other", label: "其他" },
];

const FORESHADOW_STATUSES = [
  { value: "setup", label: "已埋设", color: "var(--info)" },
  { value: "payoff", label: "已回收", color: "var(--success)" },
  { value: "overdue", label: "逾期", color: "var(--danger)" },
];

export function FactsEditor({ project }: { project: Project }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("facts");
  const [facts, setFacts] = useState<StoryFact[]>([]);
  const [foreshadows, setForeshadows] = useState<Foreshadow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFactId, setSelectedFactId] = useState<number | null>(null);
  const [selectedForeshadowId, setSelectedForeshadowId] = useState<number | null>(null);
  const { chapters, load: loadChapters } = useChapters(project.id);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [f, fs] = await Promise.all([
        listStoryFacts(project.id),
        listForeshadows(project.id),
      ]);
      setFacts(f);
      setForeshadows(fs);
    } catch (e) {
      toast.error("加载失败", { description: String(e) });
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { loadChapters(); }, [loadChapters]);
  useEffect(() => { loadData(); }, [loadData]);

  const chapterTitle = (chapterId: number | null): string => {
    if (!chapterId) return "—";
    const ch = chapters.find(c => c.id === chapterId);
    return ch ? `第${ch.chapter_number}章 ${ch.title || "未命名"}` : `#${chapterId}`;
  };

  const handleCreateFact = async () => {
    try {
      const fact = await createStoryFact(project.id, "other", "新事实");
      setFacts(prev => [fact, ...prev]);
      setSelectedFactId(fact.id);
    } catch (e) {
      toast.error("创建失败", { description: String(e) });
    }
  };

  const handleCreateForeshadow = async () => {
    try {
      const fs = await createForeshadow(project.id, "新伏笔");
      setForeshadows(prev => [fs, ...prev]);
      setSelectedForeshadowId(fs.id);
    } catch (e) {
      toast.error("创建失败", { description: String(e) });
    }
  };

  const handleDeleteFact = async (id: number) => {
    try {
      await deleteStoryFact(id);
      setFacts(prev => prev.filter(f => f.id !== id));
      if (selectedFactId === id) setSelectedFactId(null);
    } catch (e) {
      toast.error("删除失败", { description: String(e) });
    }
  };

  const handleDeleteForeshadow = async (id: number) => {
    try {
      await deleteForeshadow(id);
      setForeshadows(prev => prev.filter(f => f.id !== id));
      if (selectedForeshadowId === id) setSelectedForeshadowId(null);
    } catch (e) {
      toast.error("删除失败", { description: String(e) });
    }
  };

  const selectedFact = facts.find(f => f.id === selectedFactId);
  const selectedForeshadow = foreshadows.find(f => f.id === selectedForeshadowId);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ── Left: List Pane (320px) ── */}
      <div
        className="shrink-0 flex flex-col overflow-hidden"
        style={{ width: 320, borderRight: "1px solid var(--border)", backgroundColor: "var(--surface)" }}
      >
        {/* Tab header */}
        <div className="flex shrink-0" style={{ height: 40, borderBottom: "1px solid var(--border)" }}>
          <button
            onClick={() => setActiveTab("facts")}
            style={{
              flex: 1,
              height: "100%",
              fontSize: 12,
              fontWeight: activeTab === "facts" ? 600 : 400,
              color: activeTab === "facts" ? "var(--text-primary)" : "var(--text-muted)",
              borderBottom: activeTab === "facts" ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            事实 ({facts.length})
          </button>
          <button
            onClick={() => setActiveTab("foreshadows")}
            style={{
              flex: 1,
              height: "100%",
              fontSize: 12,
              fontWeight: activeTab === "foreshadows" ? 600 : 400,
              color: activeTab === "foreshadows" ? "var(--text-primary)" : "var(--text-muted)",
              borderBottom: activeTab === "foreshadows" ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            伏笔 ({foreshadows.length})
          </button>
        </div>

        {/* Add button */}
        <div className="shrink-0" style={{ padding: 8 }}>
          <Button
            variant="outline"
            size="sm"
            onClick={activeTab === "facts" ? handleCreateFact : handleCreateForeshadow}
            style={{ width: "100%", borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}
          >
            <Plus className="h-3.5 w-3.5" />
            {activeTab === "facts" ? "新增事实" : "新增伏笔"}
          </Button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center" style={{ height: 80, color: "var(--text-muted)" }}>
              <span style={{ fontSize: 12 }}>加载中...</span>
            </div>
          ) : activeTab === "facts" ? (
            facts.length === 0 ? (
              <EmptyState icon={<FileText />} text="暂无事实记录" />
            ) : (
              facts.map(fact => (
                <FactListItem
                  key={fact.id}
                  fact={fact}
                  chapterTitle={chapterTitle(fact.chapter_id)}
                  isSelected={selectedFactId === fact.id}
                  onClick={() => setSelectedFactId(fact.id)}
                  onDelete={() => handleDeleteFact(fact.id)}
                />
              ))
            )
          ) : (
            foreshadows.length === 0 ? (
              <EmptyState icon={<Bookmark />} text="暂无伏笔记录" />
            ) : (
              foreshadows.map(fs => (
                <ForeshadowListItem
                  key={fs.id}
                  foreshadow={fs}
                  chapterTitle={chapterTitle}
                  isSelected={selectedForeshadowId === fs.id}
                  onClick={() => setSelectedForeshadowId(fs.id)}
                  onDelete={() => handleDeleteForeshadow(fs.id)}
                />
              ))
            )
          )}
        </div>
      </div>

      {/* ── Right: Detail Editor ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ backgroundColor: "var(--canvas)" }}>
        {activeTab === "facts" && selectedFact ? (
          <FactDetail
            fact={selectedFact}
            chapterTitle={chapterTitle(selectedFact.chapter_id)}
            onUpdate={async (fields) => {
              try {
                const updated = await updateStoryFact(selectedFact.id, fields);
                setFacts(prev => prev.map(f => f.id === updated.id ? updated : f));
              } catch (e) {
                toast.error("更新失败", { description: String(e) });
              }
            }}
          />
        ) : activeTab === "foreshadows" && selectedForeshadow ? (
          <ForeshadowDetail
            foreshadow={selectedForeshadow}
            chapters={chapters}
            chapterTitle={chapterTitle}
            onUpdate={async (fields) => {
              try {
                const updated = await updateForeshadow(selectedForeshadow.id, fields);
                setForeshadows(prev => prev.map(f => f.id === updated.id ? updated : f));
              } catch (e) {
                toast.error("更新失败", { description: String(e) });
              }
            }}
          />
        ) : (
          <div className="flex items-center justify-center flex-1" style={{ color: "var(--text-muted)" }}>
            <div className="flex flex-col items-center gap-2">
              <Lightbulb style={{ width: 32, height: 32 }} />
              <span style={{ fontSize: 13 }}>选择左侧条目查看详情</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── List Items ─────────────────────────────────────────────────

function FactListItem({
  fact, chapterTitle, isSelected, onClick, onDelete,
}: {
  fact: StoryFact;
  chapterTitle: string;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const typeLabel = FACT_TYPES.find(t => t.value === fact.fact_type)?.label || fact.fact_type;
  return (
    <div
      onClick={onClick}
      className="cursor-pointer transition-colors group"
      style={{
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        backgroundColor: isSelected ? "var(--surface-selected)" : "transparent",
        borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
      }}
    >
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
          {typeLabel}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ padding: 2 }}
          title="删除"
        >
          <Trash2 className="h-3 w-3" style={{ color: "var(--danger)" }} />
        </button>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
        {fact.content}
      </p>
      <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{chapterTitle}</span>
        <span style={{ fontSize: 10, color: fact.confidence >= 0.8 ? "var(--success)" : "var(--warning)" }}>
          置信度 {Math.round(fact.confidence * 100)}%
        </span>
      </div>
    </div>
  );
}

function ForeshadowListItem({
  foreshadow, chapterTitle, isSelected, onClick, onDelete,
}: {
  foreshadow: Foreshadow;
  chapterTitle: (id: number | null) => string;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const statusInfo = FORESHADOW_STATUSES.find(s => s.value === foreshadow.status) || FORESHADOW_STATUSES[0];
  const isOverdue = foreshadow.status === "setup" && !foreshadow.payoff_chapter_id;

  return (
    <div
      onClick={onClick}
      className="cursor-pointer transition-colors group"
      style={{
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        backgroundColor: isSelected ? "var(--surface-selected)" : "transparent",
        borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="flex items-center gap-1"
          style={{ fontSize: 11, fontWeight: 600, color: statusInfo.color }}
        >
          {isOverdue && <AlertTriangle className="h-3 w-3" />}
          {statusInfo.label}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ padding: 2 }}
          title="删除"
        >
          <Trash2 className="h-3 w-3" style={{ color: "var(--danger)" }} />
        </button>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
        {foreshadow.content}
      </p>
      <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          埋设: {chapterTitle(foreshadow.setup_chapter_id)}
        </span>
        {foreshadow.payoff_chapter_id && (
          <span style={{ fontSize: 10, color: "var(--success)" }}>
            回收: {chapterTitle(foreshadow.payoff_chapter_id)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Detail Editors ─────────────────────────────────────────────

function FactDetail({
  fact, chapterTitle, onUpdate,
}: {
  fact: StoryFact;
  chapterTitle: string;
  onUpdate: (fields: { fact_type?: string; content?: string; confidence?: number }) => Promise<void>;
}) {
  const [content, setContent] = useState(fact.content);
  const [factType, setFactType] = useState(fact.fact_type);
  const [confidence, setConfidence] = useState(fact.confidence);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setContent(fact.content);
    setFactType(fact.fact_type);
    setConfidence(fact.confidence);
  }, [fact.id, fact.content, fact.fact_type, fact.confidence]);

  const handleSave = async () => {
    setSaving(true);
    await onUpdate({ fact_type: factType, content, confidence });
    setSaving(false);
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0" style={{ height: 44, padding: "0 16px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>事实详情</span>
        <Button size="sm" onClick={handleSave} disabled={saving} style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12 }}>
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 16, maxWidth: 640 }}>
        <div className="flex flex-col" style={{ gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>类型</label>
            <select
              value={factType}
              onChange={(e) => setFactType(e.target.value)}
              style={{
                width: "100%",
                marginTop: 4,
                height: 36,
                padding: "0 8px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                backgroundColor: "var(--surface)",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
            >
              {FACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>内容</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{ marginTop: 4, minHeight: 100, resize: "vertical" }}
              placeholder="描述这个事实..."
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
              置信度: {Math.round(confidence * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              style={{ width: "100%", marginTop: 8 }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>来源章节</label>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{chapterTitle}</p>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>创建时间</label>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, fontFamily: "var(--font-data)" }}>{fact.created_at}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ForeshadowDetail({
  foreshadow, chapters, chapterTitle, onUpdate,
}: {
  foreshadow: Foreshadow;
  chapters: Array<{ id: number; chapter_number: number; title: string }>;
  chapterTitle: (id: number | null) => string;
  onUpdate: (fields: { content?: string; status?: string; payoffChapterId?: number | null }) => Promise<void>;
}) {
  const [content, setContent] = useState(foreshadow.content);
  const [status, setStatus] = useState(foreshadow.status);
  const [payoffChapterId, setPayoffChapterId] = useState<number | null>(foreshadow.payoff_chapter_id);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setContent(foreshadow.content);
    setStatus(foreshadow.status);
    setPayoffChapterId(foreshadow.payoff_chapter_id);
  }, [foreshadow.id, foreshadow.content, foreshadow.status, foreshadow.payoff_chapter_id]);

  const handleSave = async () => {
    setSaving(true);
    await onUpdate({ content, status, payoffChapterId });
    setSaving(false);
  };

  const isOverdue = status === "setup" && !payoffChapterId;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0" style={{ height: 44, padding: "0 16px", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>伏笔详情</span>
          {isOverdue && (
            <span className="flex items-center gap-1" style={{ fontSize: 11, color: "var(--danger)", padding: "2px 6px", borderRadius: "var(--radius-sm)", backgroundColor: "rgba(239,68,68,0.1)" }}>
              <AlertTriangle className="h-3 w-3" />
              未回收
            </span>
          )}
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving} style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12 }}>
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 16, maxWidth: 640 }}>
        <div className="flex flex-col" style={{ gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>内容</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{ marginTop: 4, minHeight: 80, resize: "vertical" }}
              placeholder="描述这个伏笔..."
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>状态</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{
                width: "100%",
                marginTop: 4,
                height: 36,
                padding: "0 8px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                backgroundColor: "var(--surface)",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
            >
              {FORESHADOW_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>埋设章节</label>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{chapterTitle(foreshadow.setup_chapter_id)}</p>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>回收章节</label>
            <select
              value={payoffChapterId ?? ""}
              onChange={(e) => setPayoffChapterId(e.target.value ? parseInt(e.target.value) : null)}
              style={{
                width: "100%",
                marginTop: 4,
                height: 36,
                padding: "0 8px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                backgroundColor: "var(--surface)",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
            >
              <option value="">未回收</option>
              {chapters.map(ch => (
                <option key={ch.id} value={ch.id}>第{ch.chapter_number}章 {ch.title || "未命名"}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>创建时间</label>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, fontFamily: "var(--font-data)" }}>{foreshadow.created_at}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2" style={{ height: 80, color: "var(--text-muted)" }}>
      {icon}
      <span style={{ fontSize: 12 }}>{text}</span>
    </div>
  );
}
