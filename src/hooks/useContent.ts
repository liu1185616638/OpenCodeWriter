import { useState, useCallback } from "react";
import { getContent, saveContent, markContentStale } from "@/lib/tauri";
import type { Content } from "@/types";

export function useContent(chapterId: number) {
  const [content, setContent] = useState<Content | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getContent(chapterId);
      setContent(data);
    } catch (e) {
      console.error("Failed to load content:", e);
    } finally {
      setLoading(false);
    }
  }, [chapterId]);

  const save = useCallback(async (projectId: number, text: string) => {
    try {
      setSaving(true);
      const updated = await saveContent(projectId, chapterId, text);
      setContent(updated);
      return updated;
    } catch (e) {
      console.error("Failed to save content:", e);
      throw e;
    } finally {
      setSaving(false);
    }
  }, [chapterId]);

  const markStale = useCallback(async (stale: boolean) => {
    await markContentStale(chapterId, stale);
    if (content) {
      setContent({ ...content, stale: stale ? 1 : 0 });
    }
  }, [chapterId, content]);

  return { content, loading, saving, load, save, markStale };
}
