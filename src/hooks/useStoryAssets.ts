import { useState, useCallback } from "react";
import {
  listStoryFacts, createStoryFact, updateStoryFact, deleteStoryFact,
  listForeshadows, createForeshadow, updateForeshadow, deleteForeshadow,
} from "@/lib/tauri";
import type { StoryFact, Foreshadow } from "@/types";

export function useStoryAssets(projectId: number) {
  const [facts, setFacts] = useState<StoryFact[]>([]);
  const [foreshadows, setForeshadows] = useState<Foreshadow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [factList, foreshadowList] = await Promise.all([
        listStoryFacts(projectId),
        listForeshadows(projectId),
      ]);
      setFacts(factList);
      setForeshadows(foreshadowList);
    } catch (e) {
      console.error("Failed to load story assets:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Facts
  const createFact = useCallback(async (factType: string, content: string, chapterId?: number | null) => {
    const fact = await createStoryFact(projectId, factType, content, chapterId);
    setFacts(prev => [fact, ...prev]);
    return fact;
  }, [projectId]);

  const updateFact = useCallback(async (id: number, fields: Partial<Pick<StoryFact, 'fact_type' | 'content' | 'confidence'>>) => {
    const updated = await updateStoryFact(id, fields);
    setFacts(prev => prev.map(f => f.id === id ? updated : f));
    return updated;
  }, []);

  const removeFact = useCallback(async (id: number) => {
    await deleteStoryFact(id);
    setFacts(prev => prev.filter(f => f.id !== id));
  }, []);

  // Foreshadows
  const createForeshadowItem = useCallback(async (content: string, setupChapterId?: number | null) => {
    const item = await createForeshadow(projectId, content, setupChapterId);
    setForeshadows(prev => [item, ...prev]);
    return item;
  }, [projectId]);

  const updateForeshadowItem = useCallback(async (id: number, fields: { content?: string; status?: string; payoffChapterId?: number | null }) => {
    const updated = await updateForeshadow(id, fields);
    setForeshadows(prev => prev.map(f => f.id === id ? updated : f));
    return updated;
  }, []);

  const removeForeshadow = useCallback(async (id: number) => {
    await deleteForeshadow(id);
    setForeshadows(prev => prev.filter(f => f.id !== id));
  }, []);

  return {
    facts, foreshadows, loading, load,
    createFact, updateFact, removeFact,
    createForeshadowItem, updateForeshadowItem, removeForeshadow,
  };
}
