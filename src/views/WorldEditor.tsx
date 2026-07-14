/**
 * WorldEditor — Carbon Frost 世界观工作台
 *
 * 类型分段筛选、搜索、列表、详情检查器。
 * 详情中显示规则、描述和相关内容。
 * 支持空、加载、保存中和失败状态。
 */

import { useEffect, useState, useCallback } from "react";
import { useWorldItems } from "@/hooks/useWorldItems";
import type { Project, WorldItem, WorldItemType } from "@/types";
import {
  Plus, Trash2, Search, MapPin, Swords, Scroll, Clock,
  Calendar, Package, Loader2, X, Save,
} from "lucide-react";
import { toast } from "sonner";

const itemTypes: { key: WorldItemType; label: string; icon: typeof MapPin }[] = [
  { key: "location", label: "地点", icon: MapPin },
  { key: "faction", label: "势力", icon: Swords },
  { key: "rule", label: "规则", icon: Scroll },
  { key: "history", label: "历史", icon: Clock },
  { key: "timeline", label: "时间线", icon: Calendar },
  { key: "object", label: "物件", icon: Package },
];

const typeIconMap = Object.fromEntries(itemTypes.map(t => [t.key, t.icon]));

export function WorldEditor({ project }: { project: Project }) {
  const { items, loading, load, create, update, remove } = useWorldItems(project.id);
  const [activeType, setActiveType] = useState<WorldItemType | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newType, setNewType] = useState<WorldItemType>("location");
  const [newName, setNewName] = useState("");

  useEffect(() => { load(); }, [load]);

  // Auto-select first item
  useEffect(() => {
    if (!selectedId && items.length > 0) setSelectedId(items[0].id);
  }, [items, selectedId]);

  // Filter items
  const filtered = items.filter(item => {
    if (activeType !== "all" && item.item_type !== activeType) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return item.name.toLowerCase().includes(q) || (item.description || "").toLowerCase().includes(q);
    }
    return true;
  });

  const selected = items.find(i => i.id === selectedId) || null;

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    const item = await create(newType, newName.trim());
    setNewName("");
    setShowAddDialog(false);
    setSelectedId(item.id);
    toast.success("已创建");
  }, [create, newType, newName]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)" }}>
        <Loader2 className="animate-spin" style={{ width: 20, height: 20 }} />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Type filter + List */}
      <div
        className="flex flex-col shrink-0 border-r"
        style={{ width: 280, borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        {/* Type filter segments */}
        <div className="flex flex-wrap gap-1" style={{ padding: "10px 12px" }}>
          <TypeSegment
            label="全部"
            count={items.length}
            active={activeType === "all"}
            onClick={() => setActiveType("all")}
          />
          {itemTypes.map(({ key, label, icon: Icon }) => {
            const count = items.filter(i => i.item_type === key).length;
            return (
              <TypeSegment
                key={key}
                label={label}
                count={count}
                active={activeType === key}
                icon={<Icon style={{ width: 10, height: 10 }} />}
                onClick={() => setActiveType(key)}
              />
            );
          })}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2" style={{ padding: "0 12px 8px" }}>
          <div className="flex items-center gap-2 rounded-md border flex-1" style={{ height: 30, padding: "0 8px", borderColor: "var(--border)", backgroundColor: "var(--canvas)" }}>
            <Search style={{ width: 12, height: 12, color: "var(--text-muted)" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索名称或描述"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--text-primary)", fontSize: 12 }}
            />
          </div>
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto app-scrollbar" style={{ padding: "0 4px" }}>
          {filtered.length > 0 ? (
            filtered.map(item => {
              const Icon = typeIconMap[item.item_type] || MapPin;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className="flex items-center gap-2 w-full text-left rounded-md transition-colors"
                  style={{
                    height: 36,
                    padding: "0 12px",
                    backgroundColor: item.id === selectedId ? "var(--surface-selected)" : "transparent",
                    borderLeft: item.id === selectedId ? "2px solid var(--accent)" : "2px solid transparent",
                    color: item.id === selectedId ? "var(--text-primary)" : "var(--text-secondary)",
                    fontSize: 13,
                    fontWeight: item.id === selectedId ? 500 : 400,
                  }}
                  onMouseEnter={e => { if (item.id !== selectedId) e.currentTarget.style.backgroundColor = "var(--surface-hover)"; }}
                  onMouseLeave={e => { if (item.id !== selectedId) e.currentTarget.style.backgroundColor = "transparent"; }}
                  title={item.name}
                >
                  <Icon style={{ width: 14, height: 14, color: item.id === selectedId ? "var(--accent)" : "var(--text-muted)", flexShrink: 0 }} />
                  <span className="min-w-0 truncate">{item.name}</span>
                  {item.description && (
                    <span className="min-w-0 truncate" style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto", maxWidth: 80 }}>
                      {item.description.slice(0, 20)}
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <div className="flex flex-col items-center gap-3" style={{ padding: 40, color: "var(--text-muted)" }}>
              <MapPin style={{ width: 24, height: 24 }} />
              <span style={{ fontSize: 12 }}>
                {search.trim() ? `未找到匹配 "${search}"` : "暂无条目"}
              </span>
            </div>
          )}
        </div>

        {/* Add button */}
        <div className="shrink-0 border-t" style={{ padding: 8, borderColor: "var(--border)" }}>
          <button
            onClick={() => setShowAddDialog(true)}
            className="flex items-center gap-2 rounded-md w-full transition-colors"
            style={{ height: 32, padding: "0 12px", backgroundColor: "var(--surface-raised)", color: "var(--text-primary)", border: "1px solid var(--border)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            新增条目
          </button>
        </div>
      </div>

      {/* Center: Detail */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {selected ? (
          <WorldItemDetail item={selected} onUpdate={update} onDelete={async (id) => { await remove(id); setSelectedId(null); }} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-3" style={{ height: "100%", padding: 40, color: "var(--text-muted)" }}>
            <MapPin style={{ width: 28, height: 28 }} />
            <span style={{ fontSize: 13 }}>选择左侧条目查看详情</span>
          </div>
        )}
      </div>

      {/* Add Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.6)", zIndex: 50 }} onClick={() => setShowAddDialog(false)}>
          <div onClick={e => e.stopPropagation()} className="flex flex-col gap-3 rounded-lg border" style={{ width: 440, padding: 24, backgroundColor: "var(--surface-raised)", borderColor: "var(--border-strong)", boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
            <div className="flex items-center justify-between">
              <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>新增条目</h3>
              <button onClick={() => setShowAddDialog(false)} style={{ color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>类型</label>
              <div className="flex flex-wrap gap-1.5">
                {itemTypes.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setNewType(key)}
                    className="flex items-center gap-1 rounded-md"
                    style={{
                      height: 28, padding: "0 10px",
                      border: `1px solid ${newType === key ? "var(--accent)" : "var(--border)"}`,
                      backgroundColor: newType === key ? "var(--accent-soft)" : "var(--canvas)",
                      color: newType === key ? "var(--accent)" : "var(--text-muted)",
                      fontSize: 12, cursor: "pointer",
                    }}
                  >
                    <Icon style={{ width: 12, height: 12 }} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>名称</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="条目名称"
                style={{ width: "100%", height: 36, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--canvas)", color: "var(--text-primary)", fontSize: 13, outline: "none" }}
                autoFocus
                onKeyDown={e => e.key === "Enter" && handleCreate()}
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="rounded-md disabled:opacity-40"
              style={{ height: 36, backgroundColor: "var(--accent)", color: "#FFFFFF", border: "none", fontSize: 13, fontWeight: 600, cursor: newName.trim() ? "pointer" : "not-allowed" }}
            >
              创建
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TypeSegment({ label, count, active, icon, onClick }: { label: string; count: number; active: boolean; icon?: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-md transition-colors"
      style={{
        height: 24,
        padding: "0 8px",
        backgroundColor: active ? "var(--accent-soft)" : "var(--canvas)",
        color: active ? "var(--accent)" : "var(--text-muted)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        fontSize: 11,
        fontWeight: active ? 500 : 400,
        cursor: "pointer",
      }}
    >
      {icon}
      {label}
      {count > 0 && <span style={{ fontSize: 10, opacity: 0.7 }}>{count}</span>}
    </button>
  );
}

function WorldItemDetail({
  item,
  onUpdate,
  onDelete,
}: {
  item: WorldItem;
  onUpdate: (id: number, fields: Partial<Pick<WorldItem, "item_type" | "name" | "description" | "rules">>) => Promise<WorldItem>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description || "");
  const [rules, setRules] = useState(item.rules || "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset when item changes
  useEffect(() => {
    setName(item.name);
    setDescription(item.description || "");
    setRules(item.rules || "");
    setDirty(false);
  }, [item.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(item.id, { name, description, rules });
      setDirty(false);
      toast.success("已保存");
    } catch (e) {
      toast.error("保存失败", { description: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const markDirty = () => setDirty(true);

  const Icon = typeIconMap[item.item_type] || MapPin;
  const typeLabel = itemTypes.find(t => t.key === item.item_type)?.label || item.item_type;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between shrink-0 border-b" style={{ padding: "8px 18px", borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
        <div className="flex items-center gap-2">
          <Icon style={{ width: 14, height: 14, color: "var(--text-muted)" }} />
          <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{name}</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{typeLabel}</span>
          {dirty && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>编辑中…</span>}
          {saving && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>保存中…</span>}
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="flex items-center gap-1.5 rounded-md disabled:opacity-40"
          style={{ height: 28, padding: "0 10px", backgroundColor: "var(--accent)", color: "#FFFFFF", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          <Save style={{ width: 12, height: 12 }} />
          保存
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto app-scrollbar" style={{ maxWidth: 680, margin: "0 auto", width: "100%", padding: 24 }}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>名称</label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); markDirty(); }}
              style={{ width: "100%", height: 36, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--canvas)", color: "var(--text-primary)", fontSize: 14, outline: "none" }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>描述</label>
            <textarea
              value={description}
              onChange={e => { setDescription(e.target.value); markDirty(); }}
              placeholder="详细描述这个世界条目"
              style={{ width: "100%", minHeight: 100, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--canvas)", color: "var(--text-primary)", fontSize: 13, lineHeight: 1.6, outline: "none", resize: "vertical", fontFamily: "var(--font-ui)" }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>规则</label>
            <textarea
              value={rules}
              onChange={e => { setRules(e.target.value); markDirty(); }}
              placeholder="这个世界条目的规则、约束或机制"
              style={{ width: "100%", minHeight: 80, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--canvas)", color: "var(--text-primary)", fontSize: 13, lineHeight: 1.6, outline: "none", resize: "vertical", fontFamily: "var(--font-ui)" }}
            />
          </div>

          {/* Delete */}
          <div style={{ paddingTop: 8, borderTop: "1px solid var(--border)" }}>
            <button
              onClick={() => { if (confirm(`确定删除 "${item.name}" 吗？`)) onDelete(item.id); }}
              className="flex items-center gap-1.5 rounded-md"
              style={{ height: 30, padding: "0 10px", backgroundColor: "var(--danger-soft)", color: "var(--danger)", border: "1px solid var(--danger)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
            >
              <Trash2 style={{ width: 12, height: 12 }} />
              删除条目
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
