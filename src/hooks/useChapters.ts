import { useState, useCallback } from "react";
import { listChapters, createChapter, updateChapter, deleteChapter, reorderChapters } from "@/lib/tauri";
import type { Chapter } from "@/types";

export function useChapters(projectId: number) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const list = await listChapters(projectId);
      setChapters(list);
    } catch (e) {
      console.error("Failed to load chapters:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const create = useCallback(async (chapterNumber: number, title: string, summary: string) => {
    const chapter = await createChapter(projectId, chapterNumber, title, summary);
    setChapters(prev => [...prev, chapter]);
    return chapter;
  }, [projectId]);

  const update = useCallback(async (id: number, fields: Partial<Pick<Chapter, 'title' | 'summary' | 'goal' | 'conflict_level' | 'hook' | 'payoff' | 'must_avoid' | 'target_word_count'>>) => {
    const updated = await updateChapter(id, fields);
    setChapters(prev => prev.map(c => c.id === id ? updated : c));
    return updated;
  }, []);

  const remove = useCallback(async (id: number) => {
    await deleteChapter(id);
    setChapters(prev => prev.filter(c => c.id !== id));
  }, []);

  const reorder = useCallback(async (chapterIds: number[]) => {
    const reordered = await reorderChapters(projectId, chapterIds);
    setChapters(reordered);
    return reordered;
  }, [projectId]);

  return { chapters, loading, load, create, update, remove, reorder };
}
