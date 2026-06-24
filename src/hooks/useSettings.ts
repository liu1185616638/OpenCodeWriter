import { useState, useEffect, useCallback } from "react";
import { getSetting, setSetting, listModelPresets, createModelPreset, deleteModelPreset, updateModelPreset } from "@/lib/tauri";
import type { ModelPreset } from "@/types";

export function useSettings() {
  const [presets, setPresets] = useState<ModelPreset[]>([]);
  const [currentPresetId, setCurrentPresetId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshPresets = useCallback(async () => {
    try {
      setLoading(true);
      const list = await listModelPresets();
      setPresets(list);
      // Load current preset id from settings
      const savedId = await getSetting("current_preset_id");
      if (savedId) setCurrentPresetId(Number(savedId));
    } catch (e) {
      console.error("Failed to load presets:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPresets();
  }, [refreshPresets]);

  const switchPreset = useCallback(async (presetId: number) => {
    await setSetting("current_preset_id", String(presetId));
    setCurrentPresetId(presetId);
    // Refresh presets to ensure model_name is up to date
    const list = await listModelPresets();
    setPresets(list);
  }, []);

  const addPreset = useCallback(async (name: string, apiBase: string, apiKey: string, modelName: string) => {
    const preset = await createModelPreset(name, apiBase, apiKey, modelName);
    setPresets(prev => [...prev, preset]);
    return preset;
  }, []);

  const removePreset = useCallback(async (id: number) => {
    await deleteModelPreset(id);
    setPresets(prev => prev.filter(p => p.id !== id));
    if (currentPresetId === id) {
      setCurrentPresetId(null);
      await setSetting("current_preset_id", "");
    }
  }, []);

  const editPreset = useCallback(async (id: number, fields: Record<string, string>) => {
    const updated = await updateModelPreset(id, fields);
    setPresets(prev => prev.map(p => p.id === id ? updated : p));
    return updated;
  }, []);

  const currentPreset = presets.find(p => p.id === currentPresetId);

  return { presets, currentPreset, currentPresetId, loading, switchPreset, addPreset, removePreset, editPreset, refreshPresets };
}
