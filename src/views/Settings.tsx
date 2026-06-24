import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useSettings } from "@/hooks/useSettings";
import { useProjects } from "@/hooks/useProjects";
import { useTheme } from "@/hooks/useTheme";
import type { Project } from "@/types";
import { getStyleConfig, saveStyleConfig, copyStyleConfig, fetchModels } from "@/lib/tauri";
import { STOPWORDS } from "@/lib/stopwords";
import type { StyleConfig, ModelPreset, ModelInfo } from "@/types";
import {
  Plus, Trash2, Save, Loader2, Pencil, X, RefreshCw,
  BookOpen, Type, Heart, Ban, Copy,
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
      <div className="flex-1 overflow-auto py-8 px-10">
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
    <div className="flex-1 overflow-auto px-10 py-8">
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
    if (!editId) return;
    try {
      setEditError(null);
      await editPreset(editId, { name: editName, api_base: editApiBase, api_key: editApiKey, model_name: editModelName });
      setEditId(null); setEditAvailableModels([]); setEditFetchError(null);
    } catch (e) { setEditError(String(e)); }
  };

  return (
    <div className="flex-1 overflow-auto px-10 py-8">
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
    <div className="flex-1 overflow-auto px-10 py-8">
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
    <div className="flex-1 overflow-auto px-10 py-8">
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

// ===== Main Settings Component =====
export function Settings({ onBack: _onBack, projectId, activeTab, currentProject }: { onBack: () => void; projectId: number | null; activeTab: string; currentProject: Project | null }) {
  switch (activeTab) {
    case "writing-style":
      return <WritingStylePage projectId={projectId} currentProject={currentProject} />;
    case "model-config":
      return <ModelConfigPage />;
    case "shortcuts":
      return <ShortcutsPage />;
    case "about":
      return <AboutPage />;
    default:
      return <WritingStylePage projectId={projectId} currentProject={currentProject} />;
  }
}
