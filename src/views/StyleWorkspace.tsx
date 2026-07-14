/**
 * StyleWorkspace — 写法引擎工作区 (Phase G / V12)
 *
 * 三个分区：
 * 1. 风格概览 — 叙事视角、正式程度、情感强度、自定义高频词
 * 2. 参考文本 — 可编辑参考文本，超过 2000 字提示截断
 * 3. 规则池 — 已有规则启停管理 + AI 提取待审阅区
 */

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSettings } from "@/hooks/useSettings";
import { useAI } from "@/contexts/AIContext";
import { useProjects } from "@/hooks/useProjects";
import {
  getStyleConfig, saveStyleConfig, copyStyleConfig,
  listStyleRules, createStyleRule, updateStyleRule, deleteStyleRule,
} from "@/lib/tauri";
import { STOPWORDS } from "@/lib/stopwords";
import type { Project, StyleConfig, StyleRule } from "@/types";
import {
  BookOpen, Type, Heart, Ban, Copy, Pencil, Save, Loader2, X, Plus,
  Sparkles, Check, Trash2,
} from "lucide-react";
import { toast } from "sonner";

type Section = "overview" | "reference" | "rules";

const voiceLabels: Record<string, string> = {
  first_person: "第一人称",
  third_person: "第三人称",
  omniscient: "全知视角",
};
const formalityLabels: Record<string, string> = {
  formal: "正式",
  moderate: "适中",
  casual: "口语化",
};
const emotionLabels: Record<string, string> = {
  low: "低",
  moderate: "适中",
  high: "高",
};

const ruleTypeLabels: Record<string, string> = {
  narrative: "叙事视角",
  dialogue: "对话风格",
  pacing: "节奏控制",
  description: "描写手法",
  emotion: "情感表达",
  structure: "结构技巧",
};

interface ExtractedRule {
  rule_type: string;
  content: string;
}

export function StyleWorkspace({ project }: { project: Project }) {
  const [section, setSection] = useState<Section>("overview");

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ── Left: Section selector (200px) ── */}
      <div
        className="shrink-0 flex flex-col overflow-hidden"
        style={{ width: 200, borderRight: "1px solid var(--border)", backgroundColor: "var(--surface)" }}
      >
        <div className="shrink-0" style={{ height: 40, padding: "0 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>写法引擎</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {([
            { key: "overview", label: "风格概览" },
            { key: "reference", label: "参考文本" },
            { key: "rules", label: "规则池" },
          ] as const).map(item => (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className="w-full text-left transition-colors"
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--border)",
                backgroundColor: section === item.key ? "var(--surface-selected)" : "transparent",
                borderLeft: section === item.key ? "2px solid var(--accent)" : "2px solid transparent",
                fontSize: 13,
                fontWeight: section === item.key ? 600 : 400,
                color: section === item.key ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: Content ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ backgroundColor: "var(--canvas)" }}>
        {section === "overview" && <StyleOverviewSection projectId={project.id} projectName={project.name} />}
        {section === "reference" && <ReferenceTextSection projectId={project.id} />}
        {section === "rules" && <RulePoolSection projectId={project.id} />}
      </div>
    </div>
  );
}

// ── Section 1: Style Overview ─────────────────────────────────

function StyleOverviewSection({ projectId, projectName }: { projectId: number; projectName: string }) {
  const { projects } = useProjects();
  const [style, setStyle] = useState<StyleConfig | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copyingFrom, setCopyingFrom] = useState<number | null>(null);

  // Edit state
  const [narrativeVoice, setNarrativeVoice] = useState("third_person");
  const [formality, setFormality] = useState("moderate");
  const [emotionIntensity, setEmotionIntensity] = useState("moderate");
  const [customStopwords, setCustomStopwords] = useState<string[]>([]);
  const [newStopword, setNewStopword] = useState("");
  const [otherStyles, setOtherStyles] = useState<{ project: { id: number; name: string }; style: StyleConfig }[]>([]);

  useEffect(() => {
    getStyleConfig(projectId)
      .then(sc => {
        setStyle(sc);
        setNarrativeVoice(sc.narrative_voice);
        setFormality(sc.formality);
        setEmotionIntensity(sc.emotion_intensity);
        try { setCustomStopwords(JSON.parse(sc.custom_stopwords || "[]")); } catch { setCustomStopwords([]); }
      })
      .catch(console.error);

    const otherProjects = projects.filter(p => p.id !== projectId);
    Promise.all(otherProjects.map(async p => {
      const s = await getStyleConfig(p.id);
      return { project: { id: p.id, name: p.name }, style: s };
    }))
      .then(setOtherStyles)
      .catch(console.error);
  }, [projectId, projects]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await saveStyleConfig(projectId, {
        referenceText: style?.reference_text ?? "",
        narrativeVoice,
        formality,
        emotionIntensity,
        customStopwords: JSON.stringify(customStopwords),
      });
      setStyle(updated);
      setEditing(false);
      toast.success("风格配置已保存");
    } catch (e) {
      toast.error("保存失败", { description: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyFrom = async (sourceProjectId: number) => {
    setCopyingFrom(sourceProjectId);
    try {
      const updated = await copyStyleConfig(sourceProjectId, projectId);
      setStyle(updated);
      setNarrativeVoice(updated.narrative_voice);
      setFormality(updated.formality);
      setEmotionIntensity(updated.emotion_intensity);
      try { setCustomStopwords(JSON.parse(updated.custom_stopwords || "[]")); } catch { setCustomStopwords([]); }
      toast.success("风格配置已复制");
    } catch (e) {
      toast.error("复制失败", { description: String(e) });
    } finally {
      setCopyingFrom(null);
    }
  };

  const handleAddStopword = () => {
    const word = newStopword.trim();
    if (word && !customStopwords.includes(word)) {
      setCustomStopwords(prev => [...prev, word]);
      setNewStopword("");
    }
  };

  const handleRemoveStopword = (word: string) => {
    setCustomStopwords(prev => prev.filter(w => w !== word));
  };

  if (!style) return <div className="flex items-center justify-center flex-1 text-muted-foreground">加载中...</div>;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0" style={{ height: 44, padding: "0 16px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
          {projectName} — 风格概览
        </span>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}>
            <Pencil className="h-3 w-3" />编辑
          </Button>
        ) : (
          <Button size="sm" onClick={handleSave} disabled={saving} style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            保存
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 16, maxWidth: 640 }}>
        {!editing ? (
          /* Read-only display */
          <div className="flex flex-col" style={{ gap: 20 }}>
            <div className="flex flex-wrap gap-2">
              <StyleBadge icon={<BookOpen className="h-3.5 w-3.5" />} label={voiceLabels[style.narrative_voice] ?? style.narrative_voice} />
              <StyleBadge icon={<Type className="h-3.5 w-3.5" />} label={formalityLabels[style.formality] ?? style.formality} />
              <StyleBadge icon={<Heart className="h-3.5 w-3.5" />} label={emotionLabels[style.emotion_intensity] ?? style.emotion_intensity} />
              {customStopwords.length > 0 && (
                <StyleBadge icon={<Ban className="h-3.5 w-3.5" />} label={`${customStopwords.length} 个自定义词`} />
              )}
            </div>

            {/* Custom stopwords list */}
            {customStopwords.length > 0 && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>自定义高频词</label>
                <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
                  {customStopwords.map(word => (
                    <span key={word} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs" style={{ backgroundColor: "var(--surface-selected)", border: "1px solid var(--border)" }}>
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>系统内置高频词</label>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                系统内置 {STOPWORDS.length} 个 AI 味高频词，生成时自动检测
              </p>
            </div>
          </div>
        ) : (
          /* Edit form */
          <div className="flex flex-col" style={{ gap: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>叙事视角</label>
              <Select value={narrativeVoice} onValueChange={setNarrativeVoice}>
                <SelectTrigger className="mt-1" style={{ borderRadius: "var(--radius-sm)" }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="first_person">第一人称</SelectItem>
                  <SelectItem value="third_person">第三人称</SelectItem>
                  <SelectItem value="omniscient">全知视角</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>正式程度</label>
              <Select value={formality} onValueChange={setFormality}>
                <SelectTrigger className="mt-1" style={{ borderRadius: "var(--radius-sm)" }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">正式</SelectItem>
                  <SelectItem value="moderate">适中</SelectItem>
                  <SelectItem value="casual">口语化</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>情感强度</label>
              <Select value={emotionIntensity} onValueChange={setEmotionIntensity}>
                <SelectTrigger className="mt-1" style={{ borderRadius: "var(--radius-sm)" }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">低</SelectItem>
                  <SelectItem value="moderate">适中</SelectItem>
                  <SelectItem value="high">高</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>自定义高频词过滤</label>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                系统内置 {STOPWORDS.length} 个 AI 味高频词，你还可以添加自定义词汇
              </p>
              <div className="flex gap-2">
                <Input
                  value={newStopword}
                  onChange={(e) => setNewStopword(e.target.value)}
                  placeholder="输入自定义高频词"
                  style={{ borderRadius: "var(--radius-sm)" }}
                  onKeyDown={(e) => e.key === "Enter" && handleAddStopword()}
                />
                <Button size="sm" onClick={handleAddStopword} disabled={!newStopword.trim()} style={{ borderRadius: "var(--radius-sm)", gap: 4 }}>
                  <Plus className="h-3 w-3" />添加
                </Button>
              </div>
              {customStopwords.length > 0 && (
                <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
                  {customStopwords.map(word => (
                    <span key={word} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs" style={{ backgroundColor: "var(--surface-selected)", border: "1px solid var(--border)" }}>
                      {word}
                      <button onClick={() => handleRemoveStopword(word)} style={{ color: "var(--danger)" }}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Other project styles */}
        {otherStyles.length > 0 && (
          <div style={{ marginTop: 32, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>其他项目风格</label>
            <div className="space-y-2" style={{ marginTop: 8 }}>
              {otherStyles.map(({ project: p, style: s }) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                    <Badge variant="secondary" className="text-[10px]">{voiceLabels[s.narrative_voice] ?? s.narrative_voice}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{formalityLabels[s.formality] ?? s.formality}</Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={copyingFrom === p.id}
                    onClick={() => handleCopyFrom(p.id)}
                    style={{ height: 28, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}
                  >
                    {copyingFrom === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
                    复制到当前
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section 2: Reference Text ─────────────────────────────────

function ReferenceTextSection({ projectId }: { projectId: number }) {
  const [style, setStyle] = useState<StyleConfig | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getStyleConfig(projectId)
      .then(sc => {
        setStyle(sc);
        setText(sc.reference_text);
      })
      .catch(console.error);
  }, [projectId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await saveStyleConfig(projectId, {
        referenceText: text,
        narrativeVoice: style?.narrative_voice ?? "third_person",
        formality: style?.formality ?? "moderate",
        emotionIntensity: style?.emotion_intensity ?? "moderate",
        customStopwords: style?.custom_stopwords ?? "[]",
      });
      setStyle(updated);
      toast.success("参考文本已保存");
    } catch (e) {
      toast.error("保存失败", { description: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const charCount = text.length;
  const overLimit = charCount > 2000;

  if (!style) return <div className="flex items-center justify-center flex-1 text-muted-foreground">加载中...</div>;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0" style={{ height: 44, padding: "0 16px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>参考文本</span>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 12, color: overLimit ? "var(--warning)" : "var(--text-muted)" }}>
            {charCount.toLocaleString()} / 2000 字
          </span>
          <Button size="sm" onClick={handleSave} disabled={saving} style={{ height: 30, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4 }}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            保存
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 16, maxWidth: 760 }}>
        {overLimit && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 mb-3">
            <p style={{ fontSize: 12, color: "var(--warning)" }}>
              参考文本超过 2000 字，生成时将被截断。建议精简到 2000 字以内。
            </p>
          </div>
        )}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="粘贴一段你喜欢的写作风格文本，AI 将参考此风格生成内容..."
          className="app-scrollbar"
          style={{
            minHeight: "400px",
            width: "100%",
            resize: "vertical",
            fontSize: 14,
            lineHeight: 1.75,
            borderRadius: "var(--radius-sm)",
          }}
        />
      </div>
    </div>
  );
}

// ── Section 3: Rule Pool ──────────────────────────────────────

function RulePoolSection({ projectId }: { projectId: number }) {
  const { presets } = useSettings();
  const { generate, generating, thinkingContent } = useAI();
  const [rules, setRules] = useState<StyleRule[]>([]);
  const [referenceText, setReferenceText] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null);
  const [extractedRules, setExtractedRules] = useState<ExtractedRule[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  const loadRules = useCallback(async () => {
    try {
      const list = await listStyleRules(projectId);
      setRules(list);
    } catch (e) {
      console.error("Failed to load style rules:", e);
    }
  }, [projectId]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleExtract = async () => {
    if (!projectId || !selectedPresetId || !referenceText.trim()) return;
    setExtracting(true);
    setExtractedRules([]);

    generate({
      command: "extract_style_rules",
      args: { projectId, content: referenceText, presetId: selectedPresetId },
      onComplete: (content) => {
        const cleaned = content
          .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
          .trim()
          .replace(/^```json\s*/, "")
          .replace(/^```\s*/, "")
          .replace(/```\s*$/, "")
          .trim();

        try {
          const parsed = JSON.parse(cleaned) as ExtractedRule[];
          if (Array.isArray(parsed)) {
            setExtractedRules(parsed);
          }
        } catch (e) {
          console.error("Failed to parse extracted rules:", e);
          toast.error("解析提取结果失败");
        }
        setExtracting(false);
      },
      onError: () => {
        setExtracting(false);
        toast.error("提取规则失败");
      },
    });
  };

  const handleSaveRule = async (rule: ExtractedRule, index: number) => {
    try {
      const created = await createStyleRule(projectId, rule.rule_type, rule.content);
      setRules(prev => [created, ...prev]);
      setSavedIds(prev => new Set(prev).add(index));
      toast.success("规则已保存到规则池");
    } catch (e) {
      toast.error("保存规则失败", { description: String(e) });
    }
  };

  const handleToggleEnabled = async (rule: StyleRule) => {
    try {
      const updated = await updateStyleRule(rule.id, { enabled: !rule.enabled });
      setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
    } catch (e) {
      console.error("Failed to toggle rule:", e);
    }
  };

  const handleDeleteRule = async (id: number) => {
    try {
      await deleteStyleRule(id);
      setRules(prev => prev.filter(r => r.id !== id));
      toast.success("规则已删除");
    } catch (e) {
      console.error("Failed to delete rule:", e);
    }
  };

  const enabledCount = rules.filter(r => r.enabled).length;
  const disabledCount = rules.length - enabledCount;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0" style={{ height: 44, padding: "0 16px", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>规则池</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            共 {rules.length} 条 · 启用 {enabledCount} · 禁用 {disabledCount}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 16, maxWidth: 760 }}>
        {/* Existing rules */}
        {rules.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>已有规则</h4>
            <div className="space-y-2">
              {rules.map(rule => (
                <div key={rule.id} className="flex items-start gap-3 rounded-lg border border-border p-3" style={{ opacity: rule.enabled ? 1 : 0.6 }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={rule.enabled ? "default" : "secondary"} className="text-[10px]">
                        {ruleTypeLabels[rule.rule_type] ?? rule.rule_type}
                      </Badge>
                      {!rule.enabled && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>已禁用</span>}
                    </div>
                    <p style={{ fontSize: 13, color: "var(--text-primary)" }}>{rule.content}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => handleToggleEnabled(rule)} style={{ height: 28, borderRadius: "var(--radius-sm)", fontSize: 12 }}>
                      {rule.enabled ? "禁用" : "启用"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteRule(rule.id)} title="删除规则" aria-label="删除规则" style={{ height: 28, borderRadius: "var(--radius-sm)", color: "var(--danger)" }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Extraction area */}
        <div style={{ borderTop: rules.length > 0 ? "1px solid var(--border)" : "none", paddingTop: rules.length > 0 ? 16 : 0 }}>
          <h4 style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
            <Sparkles className="h-3 w-3" />
            AI 提取写法规则
          </h4>
          <div className="space-y-3">
            <div>
              <Textarea
                value={referenceText}
                onChange={(e) => setReferenceText(e.target.value.slice(0, 5000))}
                placeholder="粘贴一段你欣赏的写作文本（最多5000字），AI 将从中提取可复用的写法规则..."
                className="app-scrollbar"
                style={{ minHeight: 100, borderRadius: "var(--radius-sm)", fontSize: 13 }}
              />
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{referenceText.length} / 5000 字</p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={selectedPresetId?.toString() ?? ""}
                onValueChange={(v) => setSelectedPresetId(Number(v))}
              >
                <SelectTrigger style={{ borderRadius: "var(--radius-sm)", flex: 1 }}>
                  <SelectValue placeholder="选择模型预设" />
                </SelectTrigger>
                <SelectContent>
                  {presets.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name} — {p.model_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleExtract}
                disabled={!referenceText.trim() || !selectedPresetId || generating}
                style={{ borderRadius: "var(--radius-sm)", gap: 4 }}
              >
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {generating ? "提取中..." : "提取规则"}
              </Button>
            </div>

            {/* Thinking content during extraction */}
            {extracting && thinkingContent && (
              <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground max-h-32 overflow-auto">
                <p className="font-medium mb-1">AI 分析中...</p>
                <p className="whitespace-pre-wrap">{thinkingContent.slice(-500)}</p>
              </div>
            )}
          </div>

          {/* Extracted rules for review */}
          {extractedRules.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                <Check className="h-3 w-3" />
                待审阅规则（点击保存加入规则池）
              </h4>
              <div className="space-y-2">
                {extractedRules.map((rule, index) => (
                  <div key={index} className="flex items-start gap-3 rounded-lg border border-dashed border-border p-3" style={{ backgroundColor: "var(--surface)" }}>
                    <div className="flex-1 min-w-0">
                      <Badge variant="outline" className="text-[10px] mb-1">
                        {ruleTypeLabels[rule.rule_type] ?? rule.rule_type}
                      </Badge>
                      <p style={{ fontSize: 13, color: "var(--text-primary)" }}>{rule.content}</p>
                    </div>
                    <Button
                      variant={savedIds.has(index) ? "ghost" : "default"}
                      size="sm"
                      disabled={savedIds.has(index)}
                      onClick={() => handleSaveRule(rule, index)}
                      style={{ height: 28, borderRadius: "var(--radius-sm)", fontSize: 12, gap: 4, flexShrink: 0 }}
                    >
                      {savedIds.has(index) ? (
                        <><Check className="h-3 w-3" />已保存</>
                      ) : (
                        <><Plus className="h-3 w-3" />保存</>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {rules.length === 0 && !extracting && extractedRules.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2" style={{ padding: 40, color: "var(--text-muted)" }}>
            <Sparkles style={{ width: 28, height: 28, opacity: 0.5 }} />
            <span style={{ fontSize: 13 }}>暂无写法规则</span>
            <span style={{ fontSize: 12 }}>从参考文本中提取规则，或手动创建规则</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper Components ─────────────────────────────────────────

function StyleBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium" style={{ backgroundColor: "var(--surface-selected)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
      {icon}
      {label}
    </span>
  );
}
