/**
 * CharacterEditor — Carbon Frost 人物工作室
 *
 * 左侧人物列表支持分层、搜索和排序；
 * 中央显示人物核心资料；
 * 右侧检查器显示关系、状态、出场章节和引用。
 */

import { useEffect, useState, useCallback } from "react";
import { useCharacters } from "@/hooks/useCharacters";
import { useOutline } from "@/hooks/useOutline";
import { useSettings } from "@/hooks/useSettings";
import { useAI } from "@/contexts/AIContext";
import { useAppEvents } from "@/hooks/useAppEvents";
import { useCharacterAssets } from "@/hooks/useCharacterAssets";
import type { Project, Character, CharacterTier } from "@/types";
import {
  Sparkles, Square, UserPlus, Trash2,
  Star, Shield, Search,
  Loader2, Users, X,
} from "lucide-react";
import { toast } from "sonner";

const tierLabels: Record<CharacterTier, string> = {
  main: "主角",
  supporting: "配角",
  minor: "其他",
};

const tierIcons: Record<CharacterTier, typeof Star> = {
  main: Star,
  supporting: Shield,
  minor: UserPlus,
};

type SortKey = "name" | "tier";

export function CharacterEditor({ project }: { project: Project }) {
  const { characters, loading, load, update, remove, create } = useCharacters(project.id);
  const { outline, load: loadOutline } = useOutline(project.id);
  const { currentPreset, currentPresetId, switchPreset, presets } = useSettings();
  const { generating, streamedContent, thinkingContent, generatingStage, generate, cancel } = useAI();
  const { relations, states, load: loadAssets, createRelation, removeRelation } = useCharacterAssets(project.id);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("tier");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTier, setNewTier] = useState<CharacterTier>("supporting");
  const [showAddRelation, setShowAddRelation] = useState(false);
  const [newRelSource, setNewRelSource] = useState<number | null>(null);
  const [newRelTarget, setNewRelTarget] = useState<number | null>(null);
  const [newRelType, setNewRelType] = useState("");

  useEffect(() => { load(); loadAssets(); }, [load, loadAssets]);
  useEffect(() => { loadOutline(); }, [loadOutline]);

  // Auto-select first character
  useEffect(() => {
    if (!selectedId && characters.length > 0) {
      setSelectedId(characters[0].id);
    }
  }, [characters, selectedId]);

  const outlineEmpty = !outline || outline.status === "empty" || !outline.content;

  const handleGenerate = useCallback(async () => {
    if (!currentPreset) return;
    await generate({
      command: "generate_characters",
      stage: "characters",
      args: { projectId: project.id, presetId: currentPreset.id, modelName: currentPreset.model_name },
      onComplete: () => { load(); loadAssets(); toast.success("人物已生成"); },
      onError: (err) => toast.error("生成失败", { description: err }),
    });
  }, [currentPreset, generate, project.id, load, loadAssets]);

  useAppEvents({
    onGenerate: handleGenerate,
    onSwitchModel: () => {
      if (presets.length > 1 && currentPresetId) {
        const idx = presets.findIndex(p => p.id === currentPresetId);
        const next = presets[(idx + 1) % presets.length];
        switchPreset(next.id);
      }
    },
  });

  // Filtered + sorted list
  const filtered = characters.filter(c => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.identity || "").toLowerCase().includes(q);
  });

  const tierOrder: CharacterTier[] = ["main", "supporting", "minor"];
  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "tier") {
      return tierOrder.indexOf(a.tier as CharacterTier) - tierOrder.indexOf(b.tier as CharacterTier);
    }
    return a.name.localeCompare(b.name, "zh-CN");
  });

  const grouped = tierOrder.map(tier => ({
    tier,
    label: tierLabels[tier],
    Icon: tierIcons[tier],
    items: sorted.filter(c => c.tier === tier),
  }));

  const selected = characters.find(c => c.id === selectedId) || null;
  const selectedRelations = selected ? relations.filter(r => r.source_character_id === selected.id || r.target_character_id === selected.id) : [];
  const selectedStates = selected ? states.filter(s => s.character_id === selected.id) : [];

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const c = await create(newName.trim(), newTier);
    setNewName("");
    setShowAddDialog(false);
    setSelectedId(c.id);
    toast.success("已创建");
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)" }}>
        <Loader2 className="animate-spin" style={{ width: 20, height: 20 }} />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Character List */}
      <div
        className="flex flex-col shrink-0 border-r"
        style={{ width: 260, borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        {/* Search + Sort */}
        <div className="flex flex-col gap-2" style={{ padding: "10px 12px" }}>
          <div className="flex items-center gap-2 rounded-md border" style={{ height: 30, padding: "0 8px", borderColor: "var(--border)", backgroundColor: "var(--canvas)" }}>
            <Search style={{ width: 12, height: 12, color: "var(--text-muted)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索人物"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--text-primary)", fontSize: 12 }}
            />
          </div>
          <div className="flex items-center gap-2" style={{ fontSize: 11, color: "var(--text-muted)" }}>
            <button
              onClick={() => setSortKey("tier")}
              style={{ color: sortKey === "tier" ? "var(--text-secondary)" : "var(--text-muted)", fontWeight: sortKey === "tier" ? 500 : 400, background: "transparent", border: "none", cursor: "pointer", fontSize: 11 }}
            >
              按层级
            </button>
            <span style={{ color: "var(--border-strong)" }}>·</span>
            <button
              onClick={() => setSortKey("name")}
              style={{ color: sortKey === "name" ? "var(--text-secondary)" : "var(--text-muted)", fontWeight: sortKey === "name" ? 500 : 400, background: "transparent", border: "none", cursor: "pointer", fontSize: 11 }}
            >
              按名称
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto app-scrollbar" style={{ padding: "0 4px" }}>
          {grouped.map(({ tier, label, Icon, items }) => items.length > 0 && (
            <div key={tier} className="flex flex-col" style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", padding: "4px 12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {label}（{items.length}）
              </div>
              {items.map(c => (
                <CharacterListRow
                  key={c.id}
                  character={c}
                  Icon={Icon}
                  active={c.id === selectedId}
                  onClick={() => setSelectedId(c.id)}
                />
              ))}
            </div>
          ))}
          {characters.length === 0 && (
            <div className="flex flex-col items-center gap-3" style={{ padding: 40, color: "var(--text-muted)" }}>
              <UserPlus style={{ width: 24, height: 24 }} />
              <span style={{ fontSize: 12 }}>暂无人物</span>
            </div>
          )}
        </div>

        {/* Add button */}
        <div className="shrink-0 border-t" style={{ padding: 8, borderColor: "var(--border)" }}>
          <button
            onClick={() => setShowAddDialog(true)}
            className="flex items-center gap-2 rounded-md w-full transition-colors"
            style={{
              height: 32,
              padding: "0 12px",
              backgroundColor: "var(--surface-raised)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}
          >
            <UserPlus style={{ width: 14, height: 14 }} />
            手动添加
          </button>
        </div>
      </div>

      {/* Center: Character Detail */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between shrink-0 border-b" style={{ padding: "8px 18px", borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {selected ? selected.name : "人物"}
          </span>
          <div className="flex items-center gap-2">
            <select
              value={currentPresetId ?? ""}
              onChange={(e) => switchPreset(Number(e.target.value))}
              style={{ height: 28, padding: "0 8px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--canvas)", color: "var(--text-secondary)", fontSize: 12, outline: "none", cursor: "pointer" }}
            >
              {presets.map(p => <option key={p.id} value={p.id}>{p.model_name}</option>)}
            </select>
            {generating && generatingStage === "characters" ? (
              <button onClick={cancel} className="flex items-center gap-1.5 rounded-md" style={{ height: 28, padding: "0 10px", backgroundColor: "var(--danger-soft)", color: "var(--danger)", border: "1px solid var(--danger)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <Square style={{ width: 10, height: 10 }} />停止
              </button>
            ) : (
              <button onClick={handleGenerate} disabled={!currentPreset || outlineEmpty} className="flex items-center gap-1.5 rounded-md disabled:opacity-40" style={{ height: 28, padding: "0 12px", backgroundColor: "var(--accent)", color: "#FFFFFF", border: "none", fontSize: 12, fontWeight: 600, cursor: currentPreset && !outlineEmpty ? "pointer" : "not-allowed" }}>
                <Sparkles style={{ width: 12, height: 12 }} />AI 生成
              </button>
            )}
          </div>
        </div>

        {/* Detail body */}
        <div className="flex-1 overflow-y-auto app-scrollbar">
          {generating && generatingStage === "characters" ? (
            <div className="flex flex-col gap-3" style={{ padding: 24 }}>
              {thinkingContent && (
                <div style={{ padding: "8px 12px", borderRadius: 6, backgroundColor: "var(--surface-raised)", border: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, fontStyle: "italic" }}>
                  {thinkingContent}
                </div>
              )}
              <div style={{ padding: "8px 12px", borderRadius: 6, backgroundColor: "var(--accent-soft)", border: "1px solid var(--accent)", fontSize: 13, color: "var(--text-primary)", lineHeight: 1.8, whiteSpace: "pre-wrap", minHeight: 200 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 11, color: "var(--accent)" }}>
                  <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} />正在生成人物…
                </span>
                {streamedContent || "等待 AI 响应…"}
              </div>
            </div>
          ) : selected ? (
            <CharacterDetail character={selected} onUpdate={update} onDelete={async (id) => { await remove(id); setSelectedId(null); }} />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3" style={{ height: "100%", padding: 40, color: "var(--text-muted)" }}>
              <Users style={{ width: 28, height: 28 }} />
              <span style={{ fontSize: 13 }}>选择左侧人物查看详情</span>
            </div>
          )}
        </div>
      </div>

      {/* Right Inspector */}
      {selected && (
        <div className="shrink-0 border-l overflow-y-auto app-scrollbar" style={{ width: 280, borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <div className="flex flex-col gap-4" style={{ padding: 16 }}>
            <InspectorSection title="角色关系">
              <div className="flex flex-col gap-2">
                {selectedRelations.length > 0 ? (
                  selectedRelations.map(rel => {
                    const other = characters.find(c => c.id === (rel.source_character_id === selected.id ? rel.target_character_id : rel.source_character_id));
                    return (
                      <div key={rel.id} className="flex items-center justify-between gap-2" style={{ padding: "6px 8px", borderRadius: 4, backgroundColor: "var(--canvas)", border: "1px solid var(--border)" }}>
                        <div className="flex flex-col min-w-0">
                          <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{other?.name || "?"}</span>
                          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{rel.relation_type}</span>
                        </div>
                        <button onClick={() => removeRelation(rel.id)} style={{ color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}>
                          <Trash2 style={{ width: 12, height: 12 }} />
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>暂无关系记录</span>
                )}
                <button onClick={() => setShowAddRelation(!showAddRelation)} className="flex items-center gap-1.5 rounded-md w-full" style={{ height: 28, padding: "0 8px", border: "1px solid var(--border)", background: "var(--canvas)", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer" }}>
                  <UserPlus style={{ width: 12, height: 12 }} />添加关系
                </button>
              </div>
            </InspectorSection>

            <InspectorSection title="状态演变">
              {selectedStates.length > 0 ? (
                selectedStates.map(st => (
                  <div key={st.id} className="flex flex-col gap-1" style={{ padding: "6px 8px", borderRadius: 4, backgroundColor: "var(--canvas)", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{st.state_summary || "状态记录"}</span>
                    {st.goal && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>目标：{st.goal}</span>}
                    {st.emotion && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>情绪：{st.emotion}</span>}
                  </div>
                ))
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>暂无状态记录</span>
              )}
            </InspectorSection>
          </div>
        </div>
      )}

      {/* Add Character Dialog */}
      {showAddDialog && (
        <SimpleDialog onClose={() => setShowAddDialog(false)} title="添加人物">
          <div className="flex flex-col gap-3">
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>姓名</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="角色姓名" style={{ width: "100%", height: 36, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--canvas)", color: "var(--text-primary)", fontSize: 13, outline: "none" }} autoFocus onKeyDown={e => e.key === "Enter" && handleCreate()} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>层级</label>
              <div className="flex gap-2">
                {(["main", "supporting", "minor"] as CharacterTier[]).map(t => (
                  <button key={t} onClick={() => setNewTier(t)} style={{ height: 30, padding: "0 12px", borderRadius: 4, border: `1px solid ${newTier === t ? "var(--accent)" : "var(--border)"}`, backgroundColor: newTier === t ? "var(--accent-soft)" : "var(--canvas)", color: newTier === t ? "var(--accent)" : "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>
                    {tierLabels[t]}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleCreate} disabled={!newName.trim()} className="rounded-md disabled:opacity-40" style={{ height: 36, backgroundColor: "var(--accent)", color: "#FFFFFF", border: "none", fontSize: 13, fontWeight: 600, cursor: newName.trim() ? "pointer" : "not-allowed" }}>
              创建
            </button>
          </div>
        </SimpleDialog>
      )}

      {/* Add Relation Dialog */}
      {showAddRelation && selected && (
        <SimpleDialog onClose={() => setShowAddRelation(false)} title="添加关系">
          <div className="flex flex-col gap-3">
            <RelationForm
              characters={characters}
              sourceId={newRelSource}
              targetId={newRelTarget}
              relType={newRelType}
              onSourceChange={setNewRelSource}
              onTargetChange={setNewRelTarget}
              onTypeChange={setNewRelType}
              defaultSource={selected.id}
            />
            <button
              onClick={async () => {
                if (!newRelSource || !newRelTarget || !newRelType.trim()) return;
                await createRelation(newRelSource, newRelTarget, newRelType.trim());
                setNewRelSource(null); setNewRelTarget(null); setNewRelType("");
                setShowAddRelation(false);
                toast.success("关系已创建");
              }}
              disabled={!newRelSource || !newRelTarget || !newRelType.trim()}
              className="rounded-md disabled:opacity-40"
              style={{ height: 36, backgroundColor: "var(--accent)", color: "#FFFFFF", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              创建
            </button>
          </div>
        </SimpleDialog>
      )}
    </div>
  );
}

function CharacterListRow({ character, Icon, active, onClick }: { character: Character; Icon: typeof Star; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full text-left rounded-md transition-colors"
      style={{
        height: 36,
        padding: "0 12px",
        backgroundColor: active ? "var(--surface-selected)" : "transparent",
        borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        fontSize: 13, fontWeight: active ? 500 : 400,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.backgroundColor = "var(--surface-hover)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.backgroundColor = "transparent"; }}
      title={character.name}
    >
      <Icon style={{ width: 14, height: 14, color: active ? "var(--accent)" : "var(--text-muted)", flexShrink: 0 }} />
      <span className="min-w-0 truncate">{character.name}</span>
      {character.identity && (
        <span className="min-w-0 truncate" style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto", maxWidth: 80 }}>
          {character.identity}
        </span>
      )}
    </button>
  );
}

function CharacterDetail({ character, onUpdate, onDelete }: {
  character: Character;
  onUpdate: (id: number, fields: Record<string, string>) => Promise<Character>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Record<string, string>>({});

  const fields: { key: string; label: string; placeholder: string; multiline?: boolean }[] = [
    { key: "identity", label: "身份", placeholder: "角色身份" },
    { key: "appearance", label: "外貌", placeholder: "外貌描写", multiline: true },
    { key: "personality", label: "性格", placeholder: "性格特征", multiline: true },
    { key: "motivation", label: "动机", placeholder: "角色动机", multiline: true },
    { key: "relationships", label: "关系", placeholder: "人物关系", multiline: true },
    { key: "key_events", label: "关键事件", placeholder: "关键事件", multiline: true },
  ];

  const handleSave = async () => {
    if (Object.keys(editing).length === 0) return;
    await onUpdate(character.id, editing);
    setEditing({});
    toast.success("已保存");
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: 24 }} className="flex flex-col gap-4">
      {/* Name + Tier */}
      <div className="flex items-center gap-3">
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>
          {character.name}
        </h2>
        <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, backgroundColor: "var(--surface-raised)", color: "var(--text-secondary)" }}>
          {tierLabels[character.tier as CharacterTier] || character.tier}
        </span>
      </div>

      {/* Fields */}
      {fields.map(({ key, label, placeholder, multiline }) => {
        const value = editing[key] ?? (character[key as keyof Character] as string) ?? "";
        return (
          <div key={key} className="flex flex-col gap-1">
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>{label}</label>
            {multiline ? (
              <textarea
                value={value}
                onChange={e => setEditing(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={placeholder}
                style={{ width: "100%", minHeight: 60, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--canvas)", color: "var(--text-primary)", fontSize: 13, lineHeight: 1.6, outline: "none", resize: "vertical", fontFamily: "var(--font-ui)" }}
              />
            ) : (
              <input
                value={value}
                onChange={e => setEditing(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={placeholder}
                style={{ width: "100%", height: 36, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--canvas)", color: "var(--text-primary)", fontSize: 13, outline: "none" }}
              />
            )}
          </div>
        );
      })}

      {/* Actions */}
      <div className="flex items-center gap-2" style={{ paddingTop: 8 }}>
        <button
          onClick={handleSave}
          disabled={Object.keys(editing).length === 0}
          className="flex items-center gap-1.5 rounded-md disabled:opacity-40"
          style={{ height: 32, padding: "0 14px", backgroundColor: "var(--accent)", color: "#FFFFFF", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          保存
        </button>
        <button
          onClick={() => onDelete(character.id)}
          className="flex items-center gap-1.5 rounded-md"
          style={{ height: 32, padding: "0 14px", backgroundColor: "var(--danger-soft)", color: "var(--danger)", border: "1px solid var(--danger)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
        >
          <Trash2 style={{ width: 12, height: 12 }} />
          删除
        </button>
      </div>
    </div>
  );
}

function RelationForm({
  characters, sourceId, targetId, relType,
  onSourceChange, onTargetChange, onTypeChange, defaultSource,
}: {
  characters: Character[];
  sourceId: number | null;
  targetId: number | null;
  relType: string;
  onSourceChange: (v: number) => void;
  onTargetChange: (v: number) => void;
  onTypeChange: (v: string) => void;
  defaultSource: number;
}) {
  useEffect(() => { if (!sourceId) onSourceChange(defaultSource); }, []);
  return (
    <>
      <div>
        <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>角色 A</label>
        <select value={sourceId ?? ""} onChange={e => onSourceChange(Number(e.target.value))} style={{ width: "100%", height: 36, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--canvas)", color: "var(--text-primary)", fontSize: 13, outline: "none" }}>
          <option value="">选择</option>
          {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>角色 B</label>
        <select value={targetId ?? ""} onChange={e => onTargetChange(Number(e.target.value))} style={{ width: "100%", height: 36, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--canvas)", color: "var(--text-primary)", fontSize: 13, outline: "none" }}>
          <option value="">选择</option>
          {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>关系类型</label>
        <input value={relType} onChange={e => onTypeChange(e.target.value)} placeholder="如：师徒、仇敌、恋人" style={{ width: "100%", height: 36, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--canvas)", color: "var(--text-primary)", fontSize: 13, outline: "none" }} />
      </div>
    </>
  );
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function SimpleDialog({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.6)", zIndex: 50 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="flex flex-col gap-3 rounded-lg border" style={{ width: 440, padding: 24, backgroundColor: "var(--surface-raised)", borderColor: "var(--border-strong)", boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
        <div className="flex items-center justify-between">
          <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{title}</h3>
          <button onClick={onClose} aria-label="关闭" title="关闭" style={{ color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
