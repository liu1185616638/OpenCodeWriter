/**
 * ModelConfigPage — 模型预设设置页
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useSettings } from "@/hooks/useSettings";
import { fetchModels } from "@/lib/tauri";
import type { ModelPreset, ModelInfo } from "@/types";
import {
  Plus, Trash2, Loader2, Pencil, RefreshCw,
  Eye, EyeOff,
} from "lucide-react";

export function ModelConfigPage() {
  const { presets, addPreset, removePreset, editPreset } = useSettings();
  const [newName, setNewName] = useState("");
  const [newApiBase, setNewApiBase] = useState("https://api.openai.com/v1");
  const [newApiKey, setNewApiKey] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
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
  const [editShowApiKey, setEditShowApiKey] = useState(false);
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
    setEditAvailableModels([]); setEditFetchError(null); setEditShowApiKey(false);
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
      <h2 className="text-xl font-semibold text-foreground mb-6">模型预设</h2>

      {/* Add new preset */}
      <Card className="rounded-3xl border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">新增预设</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="预设名称（如：我的 Claude）" className="rounded-xl" />
          <Input value={newApiBase} onChange={(e) => setNewApiBase(e.target.value)} placeholder="API 地址（如：https://api.openai.com/v1）" className="rounded-xl" />
          <div className="relative">
            <Input
              type={showApiKey ? "text" : "password"}
              value={newApiKey}
              onChange={(e) => setNewApiKey(e.target.value)}
              placeholder="API Key"
              className="rounded-xl pr-10"
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title={showApiKey ? "隐藏" : "显示"}
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
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
              <p className="text-xs text-muted-foreground">API Key: {"•".repeat(8)}</p>
            </div>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => handleOpenEdit(p)} title="编辑预设">
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full text-destructive hover:text-destructive" onClick={() => removePreset(p.id)} title="删除预设">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* Edit preset dialog */}
      <Dialog open={editId !== null} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑预设</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="预设名称" className="rounded-xl" />
            <Input value={editApiBase} onChange={(e) => setEditApiBase(e.target.value)} placeholder="API 地址" className="rounded-xl" />
            <div className="relative">
              <Input
                type={editShowApiKey ? "text" : "password"}
                value={editApiKey}
                onChange={(e) => setEditApiKey(e.target.value)}
                placeholder="API Key"
                className="rounded-xl pr-10"
              />
              <button
                onClick={() => setEditShowApiKey(!editShowApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {editShowApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
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
