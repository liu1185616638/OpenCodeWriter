import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useSettings } from "@/hooks/useSettings";
import { useProjects } from "@/hooks/useProjects";
import { useTheme } from "@/hooks/useTheme";
import { useAI } from "@/contexts/AIContext";
import type { Project } from "@/types";
import {
  getStyleConfig, saveStyleConfig, copyStyleConfig, fetchModels,
  listStyleRules, createStyleRule, updateStyleRule, deleteStyleRule,
  listModelRoutes, upsertModelRoute,
  listMcpServers, saveMcpServers, listMcpTools, listMcpCallLogs,
} from "@/lib/tauri";
import { STOPWORDS } from "@/lib/stopwords";
import type { StyleConfig, ModelPreset, ModelInfo, StyleRule, ModelRoute, McpServerConfig, McpToolInfo, McpCallLog } from "@/types";
import {
  Plus, Trash2, Save, Loader2, Pencil, X, RefreshCw,
  BookOpen, Type, Heart, Ban, Copy,
  Sparkles, Check, AlertCircle, ShieldCheck,
} from "lucide-react";

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

// ===== Writing Style Page =====
function WritingStylePage({ projectId, currentProject }: { projectId: number | null; currentProject: Project | null }) {
  const { projects } = useProjects();
  const [currentStyle, setCurrentStyle] = useState<StyleConfig | null>(null);
  const [otherStyles, setOtherStyles] = useState<{ project: { id: number; name: string }; style: StyleConfig }[]>([]);
  const [copyingFrom, setCopyingFrom] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);

  // Edit state
  const [referenceText, setReferenceText] = useState("");
  const [narrativeVoice, setNarrativeVoice] = useState("third_person");
  const [formality, setFormality] = useState("moderate");
  const [emotionIntensity, setEmotionIntensity] = useState("moderate");
  const [customStopwords, setCustomStopwords] = useState<string[]>([]);
  const [newStopword, setNewStopword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (projectId) {
      getStyleConfig(projectId)
        .then(sc => {
          setCurrentStyle(sc);
          setReferenceText(sc.reference_text);
          setNarrativeVoice(sc.narrative_voice);
          setFormality(sc.formality);
          setEmotionIntensity(sc.emotion_intensity);
          try { setCustomStopwords(JSON.parse(sc.custom_stopwords || "[]")); } catch { setCustomStopwords([]); }
        })
        .catch(console.error);

      // Load other projects' styles
      const otherProjects = projects.filter(p => p.id !== projectId);
      Promise.all(otherProjects.map(async p => {
        const style = await getStyleConfig(p.id);
        return { project: { id: p.id, name: p.name }, style };
      }))
        .then(setOtherStyles)
        .catch(console.error);
    }
  }, [projectId, projects]);

  const handleSave = async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      const updated = await saveStyleConfig(projectId, {
        referenceText,
        narrativeVoice,
        formality,
        emotionIntensity,
        customStopwords: JSON.stringify(customStopwords),
      });
      setCurrentStyle(updated);
      setEditing(false);
    } catch (e) {
      console.error("Failed to save style config:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyFrom = async (sourceProjectId: number) => {
    if (!projectId) return;
    setCopyingFrom(sourceProjectId);
    try {
      const updated = await copyStyleConfig(sourceProjectId, projectId);
      setCurrentStyle(updated);
      setReferenceText(updated.reference_text);
      setNarrativeVoice(updated.narrative_voice);
      setFormality(updated.formality);
      setEmotionIntensity(updated.emotion_intensity);
      try { setCustomStopwords(JSON.parse(updated.custom_stopwords || "[]")); } catch { setCustomStopwords([]); }
    } catch (e) {
      console.error("Failed to copy style config:", e);
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

  if (!projectId || !currentStyle) {
    return (
      <div className="flex-1 overflow-auto min-h-0 py-8 px-10">
        <h2 className="text-xl font-semibold text-foreground mb-6">写作风格</h2>
        <Card className="rounded-3xl border border-border">
          <CardContent className="py-8 text-center text-muted-foreground">
            请先选择一个项目再配置写作风格
          </CardContent>
        </Card>
      </div>
    );
  }

  const charCount = referenceText.length;
  const stopwordCount = customStopwords.length;

  return (
    <>
    <div className="flex-1 overflow-auto min-h-0 px-10 py-8">
      <h2 className="text-xl font-semibold text-foreground mb-6">写作风格</h2>

      {/* Current project card */}
      <Card className="rounded-3xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5">
          <span className="text-base font-semibold text-foreground">
            {currentProject?.name ?? "当前项目"} — 当前项目
          </span>
          <Button
            variant="default"
            size="sm"
            className="rounded-full px-3 gap-1.5"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3.5 w-3.5" />编辑
          </Button>
        </div>
        <div className="px-6 pb-5 flex gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-primary-foreground text-sm font-medium">
            <BookOpen className="h-3.5 w-3.5" />{voiceLabels[currentStyle.narrative_voice] ?? currentStyle.narrative_voice}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-secondary-foreground text-sm font-medium">
            <Type className="h-3.5 w-3.5" />{formalityLabels[currentStyle.formality] ?? currentStyle.formality}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-secondary-foreground text-sm font-medium">
            <Heart className="h-3.5 w-3.5" />{emotionLabels[currentStyle.emotion_intensity] ?? currentStyle.emotion_intensity}
          </span>
          {stopwordCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-accent-foreground text-sm font-medium">
              <Ban className="h-3.5 w-3.5" />{stopwordCount} 个自定义词
            </span>
          )}
        </div>
        <div className="px-6 py-3 text-sm text-muted-foreground">
          参考文本：{charCount.toLocaleString()} 字
        </div>
      </Card>

      {/* Other project styles */}
      {otherStyles.length > 0 && (
        <>
          <h3 className="text-base font-semibold text-foreground mt-6">其他项目风格</h3>
          <div className="space-y-3 mt-4">
            {otherStyles.map(({ project, style }) => (
              <div key={project.id} className="rounded-2xl bg-tile overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4">
                  <span className="text-base font-semibold text-foreground">{project.name}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full px-3 gap-1.5"
                    disabled={copyingFrom === project.id}
                    onClick={() => handleCopyFrom(project.id)}
                  >
                    {copyingFrom === project.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                    复制到当前
                  </Button>
                </div>
                <div className="px-6 pb-4 flex gap-2.5 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-secondary-foreground text-sm font-medium">
                    {voiceLabels[style.narrative_voice] ?? style.narrative_voice}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-secondary-foreground text-sm font-medium">
                    {formalityLabels[style.formality] ?? style.formality}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-secondary-foreground text-sm font-medium">
                    {emotionLabels[style.emotion_intensity] ?? style.emotion_intensity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>

    {/* Edit dialog */}
    <Dialog open={editing} onOpenChange={setEditing}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑写作风格</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5">写作风格参考</label>
            <Textarea
              value={referenceText}
              onChange={(e) => setReferenceText(e.target.value.slice(0, 2000))}
              placeholder="粘贴一段你喜欢的写作风格文本（最多2000字）..."
              className="min-h-[120px] rounded-xl"
            />
            <p className="text-xs text-muted-foreground mt-1">字数统计：{charCount} / 2000</p>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5">叙事视角</label>
            <Select value={narrativeVoice} onValueChange={setNarrativeVoice}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="first_person">第一人称</SelectItem>
                <SelectItem value="third_person">第三人称</SelectItem>
                <SelectItem value="omniscient">全知视角</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5">正式程度</label>
            <Select value={formality} onValueChange={setFormality}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="formal">正式</SelectItem>
                <SelectItem value="moderate">适中</SelectItem>
                <SelectItem value="casual">口语化</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5">情感强度</label>
            <Select value={emotionIntensity} onValueChange={setEmotionIntensity}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">低</SelectItem>
                <SelectItem value="moderate">适中</SelectItem>
                <SelectItem value="high">高</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5">自定义高频词过滤</label>
            <p className="text-xs text-muted-foreground mb-2">
              系统内置 {STOPWORDS.length} 个 AI 味高频词。你还可以添加自定义词汇。
            </p>
            <div className="flex gap-2">
              <Input
                value={newStopword}
                onChange={(e) => setNewStopword(e.target.value)}
                placeholder="输入自定义高频词"
                className="rounded-xl"
                onKeyDown={(e) => e.key === "Enter" && handleAddStopword()}
              />
              <Button size="sm" onClick={handleAddStopword} disabled={!newStopword.trim()} className="rounded-full px-4 gap-1">
                <Plus className="h-3 w-3" />添加
              </Button>
            </div>
            {customStopwords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {customStopwords.map(word => (
                  <span key={word} className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-accent rounded-full text-xs">
                    {word}
                    <button onClick={() => handleRemoveStopword(word)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditing(false)} className="rounded-full">取消</Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-full gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ===== Model Config Page =====
function ModelConfigPage() {
  const { presets, addPreset, removePreset, editPreset } = useSettings();
  const [newName, setNewName] = useState("");
  const [newApiBase, setNewApiBase] = useState("https://api.openai.com/v1");
  const [newApiKey, setNewApiKey] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit preset dialog state
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editApiBase, setEditApiBase] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editModelName, setEditModelName] = useState("");
  const [editAvailableModels, setEditAvailableModels] = useState<ModelInfo[]>([]);
  const [editFetchingModels, setEditFetchingModels] = useState(false);
  const [editFetchError, setEditFetchError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const handleFetchModels = async (apiBase: string, apiKey: string, target: "new" | "edit") => {
    if (!apiBase || !apiKey) {
      if (target === "new") setFetchError("请先填写 API 地址和 API Key");
      else setEditFetchError("请先填写 API 地址和 API Key");
      return;
    }
    if (target === "new") { setFetchingModels(true); setFetchError(null); }
    else { setEditFetchingModels(true); setEditFetchError(null); }
    try {
      const models = await fetchModels(apiBase, apiKey);
      if (target === "new") setAvailableModels(models);
      else setEditAvailableModels(models);
    } catch (e) {
      if (target === "new") setFetchError(String(e));
      else setEditFetchError(String(e));
    } finally {
      if (target === "new") setFetchingModels(false);
      else setEditFetchingModels(false);
    }
  };

  const handleAddPreset = async () => {
    try {
      setAddError(null);
      await addPreset(newName, newApiBase, newApiKey, newModelName);
      setNewName(""); setNewApiBase("https://api.openai.com/v1"); setNewApiKey(""); setNewModelName("");
      setAvailableModels([]); setFetchError(null);
    } catch (e) { setAddError(String(e)); }
  };

  const handleOpenEdit = (preset: ModelPreset) => {
    setEditId(preset.id); setEditName(preset.name); setEditApiBase(preset.api_base);
    setEditApiKey(preset.api_key); setEditModelName(preset.model_name);
    setEditAvailableModels([]); setEditFetchError(null);
  };

  const handleSaveEdit = async () => {
    const id = editId;
    if (id === null) return;
    try {
      setEditError(null);
      await editPreset(id, { name: editName, api_base: editApiBase, api_key: editApiKey, model_name: editModelName });
      setEditId(null); setEditAvailableModels([]); setEditFetchError(null);
    } catch (e) { setEditError(String(e)); }
  };

  return (
    <div className="flex-1 overflow-auto min-h-0 px-10 py-8">
      <h2 className="text-xl font-semibold text-foreground mb-6">模型配置</h2>

      {/* Add new preset */}
      <Card className="rounded-3xl border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">新增预设</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="预设名称（如：我的 Claude）" className="rounded-xl" />
          <Input value={newApiBase} onChange={(e) => setNewApiBase(e.target.value)} placeholder="API 地址（如：https://api.openai.com/v1）" className="rounded-xl" />
          <Input type="password" value={newApiKey} onChange={(e) => setNewApiKey(e.target.value)} placeholder="API Key" className="rounded-xl" />
          <div className="flex gap-2">
            <div className="flex-1">
              {availableModels.length > 0 ? (
                <Select value={newModelName} onValueChange={setNewModelName}>
                  <SelectTrigger className="rounded-xl w-full"><SelectValue placeholder="选择模型" /></SelectTrigger>
                  <SelectContent>
                    {availableModels.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.id}{m.owned_by ? ` (${m.owned_by})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={newModelName} onChange={(e) => setNewModelName(e.target.value)} placeholder="模型名称（如：gpt-4o）" className="rounded-xl" />
              )}
            </div>
            <Button variant="outline" onClick={() => handleFetchModels(newApiBase, newApiKey, "new")} disabled={fetchingModels || !newApiBase || !newApiKey} className="rounded-xl px-3 gap-1.5 shrink-0">
              {fetchingModels ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}获取模型
            </Button>
          </div>
          {fetchError && <p className="text-xs text-destructive">{fetchError}</p>}
          {availableModels.length > 0 && <p className="text-xs text-muted-foreground">已获取 {availableModels.length} 个可用模型</p>}
          <Button onClick={handleAddPreset} disabled={!newName || !newApiKey || !newModelName} className="rounded-full px-4 py-2.5 gap-1.5 w-full">
            <Plus className="h-4 w-4" />添加
          </Button>
          {addError && <p className="text-xs text-destructive mt-1">{addError}</p>}
        </CardContent>
      </Card>

      {/* Preset list */}
      <div className="space-y-3 mt-5">
        {presets.map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-4 rounded-3xl bg-card border border-border shadow-sm">
            <div className="flex-1 min-w-0">
              <span className="font-medium">{p.name}</span>
              <p className="text-sm text-muted-foreground truncate">{p.model_name} — {p.api_base}</p>
            </div>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => handleOpenEdit(p)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full text-destructive hover:text-destructive" onClick={() => removePreset(p.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
      {presets.length > 0 && <p className="text-xs text-muted-foreground mt-3">💡 选中预设后按 Delete 键可删除</p>}

      {/* Edit preset dialog */}
      <Dialog open={editId !== null} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑预设</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="预设名称" className="rounded-xl" />
            <Input value={editApiBase} onChange={(e) => setEditApiBase(e.target.value)} placeholder="API 地址" className="rounded-xl" />
            <Input type="password" value={editApiKey} onChange={(e) => setEditApiKey(e.target.value)} placeholder="API Key" className="rounded-xl" />
            <div className="flex gap-2">
              <div className="flex-1">
                {editAvailableModels.length > 0 ? (
                  <Select value={editModelName} onValueChange={setEditModelName}>
                    <SelectTrigger className="rounded-xl w-full"><SelectValue placeholder="选择模型" /></SelectTrigger>
                    <SelectContent>
                      {editAvailableModels.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.id}{m.owned_by ? ` (${m.owned_by})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={editModelName} onChange={(e) => setEditModelName(e.target.value)} placeholder="模型名称" className="rounded-xl" />
                )}
              </div>
              <Button variant="outline" onClick={() => handleFetchModels(editApiBase, editApiKey, "edit")} disabled={editFetchingModels || !editApiBase || !editApiKey} className="rounded-xl px-3 gap-1.5 shrink-0">
                {editFetchingModels ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}获取模型
              </Button>
            </div>
            {editFetchError && <p className="text-xs text-destructive">{editFetchError}</p>}
            {editAvailableModels.length > 0 && <p className="text-xs text-muted-foreground">已获取 {editAvailableModels.length} 个可用模型</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditId(null); setEditAvailableModels([]); setEditFetchError(null); setEditError(null); }} className="rounded-full">取消</Button>
            <Button onClick={handleSaveEdit} className="rounded-full">保存</Button>
            {editError && <p className="text-xs text-destructive mt-2">{editError}</p>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== Shortcuts Page =====
function ShortcutsPage() {
  const shortcuts = [
    { key: "Ctrl+N", desc: "新建项目" },
    { key: "Ctrl+G", desc: "AI 生成" },
    { key: "Ctrl+S", desc: "保存当前内容" },
    { key: "Ctrl+M", desc: "切换模型" },
    { key: "Ctrl+P", desc: "切换项目" },
  ];
  return (
    <div className="flex-1 overflow-auto min-h-0 px-10 py-8">
      <h2 className="text-xl font-semibold text-foreground mb-6">快捷键</h2>
      <Card className="rounded-3xl border border-border shadow-sm">
        <CardContent className="divide-y divide-border">
          {shortcuts.map(s => (
            <div key={s.key} className="flex items-center justify-between py-3">
              <span className="text-sm text-foreground">{s.desc}</span>
              <kbd className="inline-flex items-center rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground">{s.key}</kbd>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ===== About Page =====
function AboutPage() {
  const { theme, set } = useTheme();
  return (
    <div className="flex-1 overflow-auto min-h-0 px-10 py-8">
      <h2 className="text-xl font-semibold text-foreground mb-6">关于</h2>

      <Card className="rounded-3xl border border-border shadow-sm mb-5">
        <CardContent className="py-6">
          <p className="font-bold text-lg text-primary">OpenCodeWriter</p>
          <p className="text-sm text-muted-foreground">版本 0.1.0</p>
          <p className="text-sm mt-2">AI 辅助小说创作工具</p>
          <p className="text-xs text-muted-foreground mt-4">基于 Tauri + React 构建</p>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border shadow-sm">
        <CardHeader><CardTitle className="text-base">主题切换</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button variant={theme === "light" ? "default" : "outline"} onClick={() => set("light")} className="rounded-full">亮色</Button>
            <Button variant={theme === "dark" ? "default" : "outline"} onClick={() => set("dark")} className="rounded-full">暗色</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== Style Rules Page =====
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

function StyleRulesPage({ projectId }: { projectId: number | null }) {
  const { presets } = useSettings();
  const { generate, generating, streamedContent, thinkingContent } = useAI();
  const [rules, setRules] = useState<StyleRule[]>([]);
  const [referenceText, setReferenceText] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null);
  const [extractedRules, setExtractedRules] = useState<ExtractedRule[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  const loadRules = useCallback(async () => {
    if (!projectId) return;
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
        // Parse the JSON from the response (strip thinking tags)
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
        }
        setExtracting(false);
      },
      onError: () => {
        setExtracting(false);
      },
    });
  };

  const handleSaveRule = async (rule: ExtractedRule, index: number) => {
    if (!projectId) return;
    try {
      const created = await createStyleRule(projectId, rule.rule_type, rule.content);
      setRules(prev => [created, ...prev]);
      setSavedIds(prev => new Set(prev).add(index));
    } catch (e) {
      console.error("Failed to save rule:", e);
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
    } catch (e) {
      console.error("Failed to delete rule:", e);
    }
  };

  if (!projectId) {
    return (
      <div className="flex-1 overflow-auto min-h-0 py-8 px-10">
        <h2 className="text-xl font-semibold text-foreground mb-6">写法规则</h2>
        <Card className="rounded-3xl border border-border">
          <CardContent className="py-8 text-center text-muted-foreground">
            请先选择一个项目再配置写法规则
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto min-h-0 px-10 py-8">
      <h2 className="text-xl font-semibold text-foreground mb-6">写法规则</h2>

      {/* Existing rules */}
      {rules.length > 0 && (
        <div className="mb-6">
          <h3 className="text-base font-semibold text-foreground mb-3">已有规则</h3>
          <div className="space-y-2">
            {rules.map(rule => (
              <div key={rule.id} className="flex items-start gap-3 p-4 rounded-2xl bg-card border border-border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={rule.enabled ? "default" : "secondary"}>
                      {ruleTypeLabels[rule.rule_type] ?? rule.rule_type}
                    </Badge>
                    {!rule.enabled && <span className="text-xs text-muted-foreground">已禁用</span>}
                  </div>
                  <p className="text-sm text-foreground">{rule.content}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full shrink-0"
                  onClick={() => handleToggleEnabled(rule)}
                >
                  {rule.enabled ? "禁用" : "启用"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-destructive hover:text-destructive shrink-0"
                  onClick={() => handleDeleteRule(rule.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Extract rules from reference text */}
      <Card className="rounded-3xl border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            从参考文本提取写法规则
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5">参考文本</label>
            <Textarea
              value={referenceText}
              onChange={(e) => setReferenceText(e.target.value.slice(0, 5000))}
              placeholder="粘贴一段你欣赏的写作文本（最多5000字），AI 将从中提取可复用的写法规则..."
              className="min-h-[120px] rounded-xl"
            />
            <p className="text-xs text-muted-foreground mt-1">{referenceText.length} / 5000 字</p>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5">使用模型</label>
            <Select
              value={selectedPresetId?.toString() ?? ""}
              onValueChange={(v) => setSelectedPresetId(Number(v))}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="选择模型预设" />
              </SelectTrigger>
              <SelectContent>
                {presets.map(p => (
                  <SelectItem key={p.id} value={p.id.toString()}>{p.name} — {p.model_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleExtract}
            disabled={!referenceText.trim() || !selectedPresetId || generating}
            className="rounded-full px-4 gap-1.5"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "提取中..." : "提取规则"}
          </Button>

          {/* Thinking content during extraction */}
          {extracting && thinkingContent && (
            <div className="rounded-xl bg-muted p-3 text-xs text-muted-foreground max-h-40 overflow-auto">
              <p className="font-medium mb-1">AI 分析中...</p>
              <p className="whitespace-pre-wrap">{thinkingContent.slice(-500)}</p>
            </div>
          )}

          {/* Streamed content during extraction */}
          {extracting && streamedContent && (
            <div className="rounded-xl bg-muted p-3 text-xs text-muted-foreground max-h-40 overflow-auto">
              <p className="whitespace-pre-wrap">{streamedContent.slice(-500)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Extracted rules for review */}
      {extractedRules.length > 0 && (
        <div className="mt-5">
          <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
            <Check className="h-4 w-4" />
            提取结果（点击保存加入规则池）
          </h3>
          <div className="space-y-2">
            {extractedRules.map((rule, index) => (
              <div key={index} className="flex items-start gap-3 p-4 rounded-2xl bg-card border border-border">
                <div className="flex-1 min-w-0">
                  <Badge variant="outline" className="mb-1">
                    {ruleTypeLabels[rule.rule_type] ?? rule.rule_type}
                  </Badge>
                  <p className="text-sm text-foreground">{rule.content}</p>
                </div>
                <Button
                  variant={savedIds.has(index) ? "ghost" : "default"}
                  size="sm"
                  className="rounded-full shrink-0 gap-1"
                  disabled={savedIds.has(index)}
                  onClick={() => handleSaveRule(rule, index)}
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
  );
}

// ===== Model Routes Page =====
const taskTypeLabels: Record<string, string> = {
  outline: "大纲生成",
  characters: "人物生成",
  chapters: "章节目录",
  content: "正文生成",
  polish: "正文润色",
  review: "章节审核",
};

function ModelRoutesPage() {
  const { presets } = useSettings();
  const [routes, setRoutes] = useState<ModelRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const loadRoutes = useCallback(async () => {
    try {
      setLoading(true);
      const list = await listModelRoutes();
      setRoutes(list);
    } catch (e) {
      console.error("Failed to load model routes:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  const getRoute = (taskType: string): ModelRoute | undefined => {
    return routes.find(r => r.task_type === taskType);
  };

  const handleSave = async (taskType: string, primaryId: number | null, fallbackId: number | null) => {
    setSavingKey(taskType);
    try {
      const updated = await upsertModelRoute(taskType, primaryId, fallbackId);
      setRoutes(prev => {
        const idx = prev.findIndex(r => r.task_type === taskType);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = updated;
          return copy;
        }
        return [...prev, updated];
      });
    } catch (e) {
      console.error("Failed to save route:", e);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="flex-1 overflow-auto min-h-0 px-10 py-8">
      <h2 className="text-xl font-semibold text-foreground mb-2">模型路由</h2>
      <p className="text-sm text-muted-foreground mb-6">
        为不同任务类型配置默认模型。当用户未手动选择模型时，系统将按路由配置选择模型。
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(taskTypeLabels).map(([taskType, label]) => {
            const route = getRoute(taskType);
            return (
              <ModelRouteRow
                key={taskType}
                taskType={taskType}
                label={label}
                presets={presets}
                primaryId={route?.primary_preset_id ?? null}
                fallbackId={route?.fallback_preset_id ?? null}
                saving={savingKey === taskType}
                onSave={handleSave}
              />
            );
          })}
        </div>
      )}

      {presets.length === 0 && (
        <Card className="rounded-3xl border border-border mt-4">
          <CardContent className="py-6 text-center text-muted-foreground flex items-center justify-center gap-2">
            <AlertCircle className="h-4 w-4" />
            请先在"模型配置"中添加模型预设
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ModelRouteRow({
  taskType, label, presets, primaryId, fallbackId, saving, onSave,
}: {
  taskType: string;
  label: string;
  presets: ModelPreset[];
  primaryId: number | null;
  fallbackId: number | null;
  saving: boolean;
  onSave: (taskType: string, primaryId: number | null, fallbackId: number | null) => void;
}) {
  const [primary, setPrimary] = useState<string>(primaryId?.toString() ?? "none");
  const [fallback, setFallback] = useState<string>(fallbackId?.toString() ?? "none");

  // Sync local state when props change
  useEffect(() => {
    setPrimary(primaryId?.toString() ?? "none");
    setFallback(fallbackId?.toString() ?? "none");
  }, [primaryId, fallbackId]);

  const hasChanges =
    primary !== (primaryId?.toString() ?? "none") ||
    fallback !== (fallbackId?.toString() ?? "none");

  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-card border border-border">
      <div className="w-28 shrink-0">
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <div className="flex-1">
        <Select value={primary} onValueChange={setPrimary}>
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="主模型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">不配置</SelectItem>
            {presets.map(p => (
              <SelectItem key={p.id} value={p.id.toString()}>{p.name} — {p.model_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1">
        <Select value={fallback} onValueChange={setFallback}>
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="备用模型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">不配置</SelectItem>
            {presets.map(p => (
              <SelectItem key={p.id} value={p.id.toString()}>{p.name} — {p.model_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        size="sm"
        className="rounded-full shrink-0 gap-1"
        disabled={!hasChanges || saving}
        onClick={() => onSave(
          taskType,
          primary === "none" ? null : Number(primary),
          fallback === "none" ? null : Number(fallback),
        )}
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        保存
      </Button>
    </div>
  );
}

function McpPermissionsPage() {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [tools, setTools] = useState<McpToolInfo[]>([]);
  const [logs, setLogs] = useState<McpCallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [serverList, toolList, logList] = await Promise.all([
        listMcpServers(),
        listMcpTools(),
        listMcpCallLogs(20),
      ]);
      setServers(serverList);
      setTools(toolList);
      setLogs(logList);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addServer = () => {
    setServers(prev => [
      ...prev,
      {
        name: "",
        command: "",
        args: "",
        enabled: false,
        allowed_tools: [],
        require_approval: true,
      },
    ]);
  };

  const updateServer = (index: number, patch: Partial<McpServerConfig>) => {
    setServers(prev => prev.map((server, i) => i === index ? { ...server, ...patch } : server));
  };

  const removeServer = (index: number) => {
    setServers(prev => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      await saveMcpServers(servers);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto min-h-0 px-10 py-8">
      <div className="mb-6 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold text-foreground">MCP 权限</h2>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-5">
          <Card className="rounded-3xl border border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">MCP Server</CardTitle>
              <Button onClick={addServer} size="sm" className="rounded-full gap-1.5">
                <Plus className="h-4 w-4" />新增
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {servers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  MCP 未启用
                </div>
              ) : (
                servers.map((server, index) => (
                  <div key={index} className="space-y-3 rounded-2xl border border-border bg-card p-4">
                    <div className="grid gap-2 md:grid-cols-2">
                      <Input
                        value={server.name}
                        onChange={(e) => updateServer(index, { name: e.target.value })}
                        placeholder="名称"
                        className="rounded-xl"
                      />
                      <Input
                        value={server.command}
                        onChange={(e) => updateServer(index, { command: e.target.value })}
                        placeholder="命令"
                        className="rounded-xl"
                      />
                    </div>
                    <Input
                      value={server.args}
                      onChange={(e) => updateServer(index, { args: e.target.value })}
                      placeholder="参数"
                      className="rounded-xl"
                    />
                    <Textarea
                      value={server.allowed_tools.join("\n")}
                      onChange={(e) => updateServer(index, {
                        allowed_tools: e.target.value
                          .split(/[\n,]/)
                          .map(item => item.trim())
                          .filter(Boolean),
                      })}
                      placeholder="工具白名单，每行一个"
                      className="min-h-24 rounded-xl"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={server.enabled}
                            onChange={(e) => updateServer(index, { enabled: e.target.checked })}
                          />
                          启用
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={server.require_approval}
                            onChange={(e) => updateServer(index, { require_approval: e.target.checked })}
                          />
                          需要审批
                        </label>
                      </div>
                      <Button variant="ghost" size="sm" className="rounded-full text-destructive hover:text-destructive" onClick={() => removeServer(index)}>
                        <Trash2 className="h-4 w-4" />删除
                      </Button>
                    </div>
                  </div>
                ))
              )}
              <Button onClick={save} disabled={saving} className="w-full rounded-full gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存 MCP 配置
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">已配置工具</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tools.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无可用 MCP 工具</p>
              ) : (
                tools.map((tool) => (
                  <div key={`${tool.server_name}:${tool.tool_name}`} className="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{tool.tool_name}</p>
                      <p className="text-xs text-muted-foreground">{tool.server_name}</p>
                    </div>
                    <Badge variant={tool.enabled ? "default" : "secondary"}>
                      {tool.requires_approval ? "审批" : "允许"}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">MCP 审计</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无记录</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="rounded-2xl border border-border px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium">{log.tool_name}</p>
                      <Badge variant={log.success ? "default" : "destructive"}>{log.call_type}</Badge>
                    </div>
                    {log.error && <p className="mt-1 text-xs text-destructive">{log.error}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{log.created_at}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ===== Main Settings Component =====
export function Settings({ onBack: _onBack, projectId, activeTab, currentProject }: { onBack: () => void; projectId: number | null; activeTab: string; currentProject: Project | null }) {
  switch (activeTab) {
    case "writing-style":
      return <WritingStylePage projectId={projectId} currentProject={currentProject} />;
    case "style-rules":
      return <StyleRulesPage projectId={projectId} />;
    case "model-config":
      return <ModelConfigPage />;
    case "model-routes":
      return <ModelRoutesPage />;
    case "mcp-permissions":
      return <McpPermissionsPage />;
    case "shortcuts":
      return <ShortcutsPage />;
    case "about":
      return <AboutPage />;
    default:
      return <WritingStylePage projectId={projectId} currentProject={currentProject} />;
  }
}
