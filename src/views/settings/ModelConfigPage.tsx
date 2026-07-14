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
import { Plus, Trash2, Loader2, Pencil, RefreshCw, Eye, EyeOff } from "lucide-react";

/** Local providers (Ollama, LM Studio, etc.) do not require an API key. */
function isLocalProvider(apiBase: string): boolean {
  try {
    const hostname = new URL(apiBase).hostname.toLowerCase();
    return hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname === "0.0.0.0"
      || hostname === "::1"
      || hostname === "[::1]";
  } catch {
    return false;
  }
}

function hasRequiredCredentials(apiBase: string, apiKey: string): boolean {
  return Boolean(apiBase.trim()) && (Boolean(apiKey.trim()) || isLocalProvider(apiBase));
}

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
    if (!hasRequiredCredentials(apiBase, apiKey)) {
      const message = isLocalProvider(apiBase)
        ? "请先填写 API 地址"
        : "请先填写 API 地址和 API Key";
      if (target === "new") setFetchError(message);
      else setEditFetchError(message);
      return;
    }

    if (target === "new") {
      setFetchingModels(true);
      setFetchError(null);
    } else {
      setEditFetchingModels(true);
      setEditFetchError(null);
    }

    try {
      const models = await fetchModels(apiBase.trim(), apiKey.trim());
      if (target === "new") setAvailableModels(models);
      else setEditAvailableModels(models);
    } catch (error) {
      if (target === "new") setFetchError(String(error));
      else setEditFetchError(String(error));
    } finally {
      if (target === "new") setFetchingModels(false);
      else setEditFetchingModels(false);
    }
  };

  const handleAddPreset = async () => {
    try {
      setAddError(null);
      await addPreset(newName.trim(), newApiBase.trim(), newApiKey.trim(), newModelName.trim());
      setNewName("");
      setNewApiBase("https://api.openai.com/v1");
      setNewApiKey("");
      setNewModelName("");
      setAvailableModels([]);
      setFetchError(null);
    } catch (error) {
      setAddError(String(error));
    }
  };

  const handleOpenEdit = (preset: ModelPreset) => {
    setEditId(preset.id);
    setEditName(preset.name);
    setEditApiBase(preset.api_base);
    setEditApiKey(preset.api_key);
    setEditModelName(preset.model_name);
    setEditAvailableModels([]);
    setEditFetchError(null);
    setEditShowApiKey(false);
  };

  const handleSaveEdit = async () => {
    const id = editId;
    if (id === null) return;
    try {
      setEditError(null);
      await editPreset(id, {
        name: editName.trim(),
        api_base: editApiBase.trim(),
        api_key: editApiKey.trim(),
        model_name: editModelName.trim(),
      });
      setEditId(null);
      setEditAvailableModels([]);
      setEditFetchError(null);
    } catch (error) {
      setEditError(String(error));
    }
  };

  const canAddPreset = Boolean(newName.trim())
    && Boolean(newModelName.trim())
    && hasRequiredCredentials(newApiBase, newApiKey);
  const canSaveEdit = Boolean(editName.trim())
    && Boolean(editModelName.trim())
    && hasRequiredCredentials(editApiBase, editApiKey);

  return (
    <div className="flex-1 overflow-auto min-h-0 px-10 py-8">
      <h2 className="text-xl font-semibold text-foreground mb-6">模型预设</h2>

      <Card className="rounded-xl border border-border">
        <CardHeader><CardTitle className="text-base">新增预设</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="预设名称（如：本地 Ollama）" className="rounded-lg" />
          <Input value={newApiBase} onChange={(event) => setNewApiBase(event.target.value)} placeholder="API 地址（如：http://localhost:11434/v1）" className="rounded-lg" />
          <div className="relative">
            <Input
              type={showApiKey ? "text" : "password"}
              value={newApiKey}
              onChange={(event) => setNewApiKey(event.target.value)}
              placeholder={isLocalProvider(newApiBase) ? "API Key（本地服务可留空）" : "API Key"}
              className="rounded-lg pr-10"
            />
            <button
              onClick={() => setShowApiKey((visible) => !visible)}
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
                  <SelectTrigger className="rounded-lg w-full"><SelectValue placeholder="选择模型" /></SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.id}{model.owned_by ? ` (${model.owned_by})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={newModelName} onChange={(event) => setNewModelName(event.target.value)} placeholder="模型名称（如：qwen3:8b）" className="rounded-lg" />
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => void handleFetchModels(newApiBase, newApiKey, "new")}
              disabled={fetchingModels || !hasRequiredCredentials(newApiBase, newApiKey)}
              className="rounded-lg px-3 gap-1.5 shrink-0"
            >
              {fetchingModels ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}获取模型
            </Button>
          </div>
          {fetchError && <p className="text-xs text-destructive">{fetchError}</p>}
          {availableModels.length > 0 && <p className="text-xs text-muted-foreground">已获取 {availableModels.length} 个可用模型</p>}
          <Button onClick={() => void handleAddPreset()} disabled={!canAddPreset} className="rounded-lg px-4 py-2.5 gap-1.5 w-full">
            <Plus className="h-4 w-4" />添加
          </Button>
          {addError && <p className="text-xs text-destructive mt-1">{addError}</p>}
        </CardContent>
      </Card>

      <div className="space-y-3 mt-5">
        {presets.map((preset) => (
          <div key={preset.id} className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border">
            <div className="flex-1 min-w-0">
              <span className="font-medium">{preset.name}</span>
              <p className="text-sm text-muted-foreground truncate">{preset.model_name} — {preset.api_base}</p>
              <p className="text-xs text-muted-foreground">API Key: {preset.api_key ? "••••••••" : "未设置（本地服务）"}</p>
            </div>
            <Button variant="ghost" size="sm" className="rounded-md" onClick={() => handleOpenEdit(preset)} title="编辑预设">
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="rounded-md text-destructive hover:text-destructive" onClick={() => void removePreset(preset.id)} title="删除预设">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={editId !== null} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑预设</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="预设名称" className="rounded-lg" />
            <Input value={editApiBase} onChange={(event) => setEditApiBase(event.target.value)} placeholder="API 地址" className="rounded-lg" />
            <div className="relative">
              <Input
                type={editShowApiKey ? "text" : "password"}
                value={editApiKey}
                onChange={(event) => setEditApiKey(event.target.value)}
                placeholder={isLocalProvider(editApiBase) ? "API Key（本地服务可留空）" : "API Key"}
                className="rounded-lg pr-10"
              />
              <button
                onClick={() => setEditShowApiKey((visible) => !visible)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {editShowApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                {editAvailableModels.length > 0 ? (
                  <Select value={editModelName} onValueChange={setEditModelName}>
                    <SelectTrigger className="rounded-lg w-full"><SelectValue placeholder="选择模型" /></SelectTrigger>
                    <SelectContent>
                      {editAvailableModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.id}{model.owned_by ? ` (${model.owned_by})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={editModelName} onChange={(event) => setEditModelName(event.target.value)} placeholder="模型名称" className="rounded-lg" />
                )}
              </div>
              <Button
                variant="outline"
                onClick={() => void handleFetchModels(editApiBase, editApiKey, "edit")}
                disabled={editFetchingModels || !hasRequiredCredentials(editApiBase, editApiKey)}
                className="rounded-lg px-3 gap-1.5 shrink-0"
              >
                {editFetchingModels ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}获取模型
              </Button>
            </div>
            {editFetchError && <p className="text-xs text-destructive">{editFetchError}</p>}
            {editAvailableModels.length > 0 && <p className="text-xs text-muted-foreground">已获取 {editAvailableModels.length} 个可用模型</p>}
            {editError && <p className="text-xs text-destructive">{editError}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditId(null);
                setEditAvailableModels([]);
                setEditFetchError(null);
                setEditError(null);
              }}
              className="rounded-md"
            >取消</Button>
            <Button onClick={() => void handleSaveEdit()} disabled={!canSaveEdit} className="rounded-md">保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
