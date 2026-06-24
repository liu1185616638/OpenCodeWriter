import { useState, useCallback } from "react";
import { listCharacters, listCharactersByTier, createCharacter, updateCharacter, deleteCharacter } from "@/lib/tauri";
import type { Character, CharacterTier } from "@/types";

export function useCharacters(projectId: number) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const list = await listCharacters(projectId);
      setCharacters(list);
    } catch (e) {
      console.error("Failed to load characters:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const byTier = useCallback(async (tier: CharacterTier) => {
    return listCharactersByTier(projectId, tier);
  }, [projectId]);

  const create = useCallback(async (name: string, tier: CharacterTier) => {
    const char = await createCharacter(projectId, name, tier);
    setCharacters(prev => [...prev, char]);
    return char;
  }, [projectId]);

  const update = useCallback(async (id: number, fields: Record<string, string>) => {
    const updated = await updateCharacter(id, fields);
    setCharacters(prev => prev.map(c => c.id === id ? updated : c));
    return updated;
  }, []);

  const remove = useCallback(async (id: number) => {
    await deleteCharacter(id);
    setCharacters(prev => prev.filter(c => c.id !== id));
  }, []);

  const main = characters.filter(c => c.tier === "main");
  const supporting = characters.filter(c => c.tier === "supporting");
  const minor = characters.filter(c => c.tier === "minor");

  return { characters, main, supporting, minor, loading, load, byTier, create, update, remove };
}
