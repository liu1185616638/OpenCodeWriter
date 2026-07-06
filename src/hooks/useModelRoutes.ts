import { useState, useCallback } from "react";
import { listModelRoutes, upsertModelRoute } from "@/lib/tauri";
import type { ModelRoute } from "@/types";

export function useModelRoutes() {
  const [routes, setRoutes] = useState<ModelRoute[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
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

  const upsert = useCallback(async (taskType: string, primaryPresetId: number | null, fallbackPresetId: number | null) => {
    const route = await upsertModelRoute(taskType, primaryPresetId, fallbackPresetId);
    setRoutes(prev => {
      const idx = prev.findIndex(r => r.task_type === taskType);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = route;
        return next;
      }
      return [...prev, route];
    });
    return route;
  }, []);

  return { routes, loading, load, upsert };
}
