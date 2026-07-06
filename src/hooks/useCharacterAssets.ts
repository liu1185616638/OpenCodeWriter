import { useState, useCallback } from "react";
import {
  listCharacterRelations, createCharacterRelation, updateCharacterRelation, deleteCharacterRelation,
  listCharacterStates, createCharacterState, deleteCharacterState,
} from "@/lib/tauri";
import type { CharacterRelation, CharacterState } from "@/types";

export function useCharacterAssets(projectId: number) {
  const [relations, setRelations] = useState<CharacterRelation[]>([]);
  const [states, setStates] = useState<CharacterState[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [relList, stateList] = await Promise.all([
        listCharacterRelations(projectId),
        listCharacterStates(projectId),
      ]);
      setRelations(relList);
      setStates(stateList);
    } catch (e) {
      console.error("Failed to load character assets:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Relations
  const createRelation = useCallback(async (sourceCharacterId: number, targetCharacterId: number, relationType: string) => {
    const rel = await createCharacterRelation(projectId, sourceCharacterId, targetCharacterId, relationType);
    setRelations(prev => [rel, ...prev]);
    return rel;
  }, [projectId]);

  const updateRelation = useCallback(async (id: number, fields: Partial<Pick<CharacterRelation, 'relation_type' | 'tension' | 'summary'>>) => {
    const updated = await updateCharacterRelation(id, fields);
    setRelations(prev => prev.map(r => r.id === id ? updated : r));
    return updated;
  }, []);

  const removeRelation = useCallback(async (id: number) => {
    await deleteCharacterRelation(id);
    setRelations(prev => prev.filter(r => r.id !== id));
  }, []);

  // States
  const createState = useCallback(async (params: {
    characterId: number;
    chapterId?: number | null;
    stateSummary: string;
    goal: string;
    emotion: string;
    location: string;
  }) => {
    const st = await createCharacterState({ projectId, ...params });
    setStates(prev => [st, ...prev]);
    return st;
  }, [projectId]);

  const removeState = useCallback(async (id: number) => {
    await deleteCharacterState(id);
    setStates(prev => prev.filter(s => s.id !== id));
  }, []);

  return {
    relations, states, loading, load,
    createRelation, updateRelation, removeRelation,
    createState, removeState,
  };
}
