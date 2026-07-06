import { useState, useCallback } from "react";
import { listWorldItems, createWorldItem, updateWorldItem, deleteWorldItem } from "@/lib/tauri";
import type { WorldItem } from "@/types";

export function useWorldItems(projectId: number) {
  const [items, setItems] = useState<WorldItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const list = await listWorldItems(projectId);
      setItems(list);
    } catch (e) {
      console.error("Failed to load world items:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const create = useCallback(async (itemType: string, name: string) => {
    const item = await createWorldItem(projectId, itemType, name);
    setItems(prev => [...prev, item]);
    return item;
  }, [projectId]);

  const update = useCallback(async (id: number, fields: Partial<Pick<WorldItem, 'item_type' | 'name' | 'description' | 'rules'>>) => {
    const updated = await updateWorldItem(id, fields);
    setItems(prev => prev.map(i => i.id === id ? updated : i));
    return updated;
  }, []);

  const remove = useCallback(async (id: number) => {
    await deleteWorldItem(id);
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  return { items, loading, load, create, update, remove };
}
