/**
 * ModelRoutesPage — 模型路由设置页
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSettings } from "@/hooks/useSettings";
import { listModelRoutes, upsertModelRoute } from "@/lib/tauri";
import type { ModelPreset, ModelRoute } from "@/types";
import { Loader2, Save, AlertCircle } from "lucide-react";

const taskTypeLabels: Record<string, string> = {
  outline: "大纲生成",
  characters: "人物生成",
  chapters: "章节目录",
  content: "正文生成",
  polish: "正文润色",
  review: "章节审核",
};

export function ModelRoutesPage() {
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
            请先在"模型预设"中添加模型预设
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
