import { useState, useCallback } from "react";
import { getOutline, saveOutline, completeOutline } from "@/lib/tauri";
import type { Outline } from "@/types";

export function useOutline(projectId: number) {
  const [outline, setOutline] = useState<Outline | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getOutline(projectId);
      setOutline(data);
    } catch (e) {
      console.error("Failed to load outline:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const save = useCallback(async (content: string) => {
    try {
      setSaving(true);
      const updated = await saveOutline(projectId, content);
      setOutline(updated);
      return updated;
    } catch (e) {
      console.error("Failed to save outline:", e);
      throw e;
    } finally {
      setSaving(false);
    }
  }, [projectId]);

  const complete = useCallback(async () => {
    try {
      const updated = await completeOutline(projectId);
      setOutline(updated);
      return updated;
    } catch (e) {
      console.error("Failed to complete outline:", e);
      throw e;
    }
  }, [projectId]);

  return { outline, loading, saving, load, save, complete };
}
