import { useState, useCallback } from "react";
import { listKnowledgeSources, importKnowledge, deleteKnowledgeSource, searchKnowledge } from "@/lib/tauri";
import type { KnowledgeSource, KnowledgeChunk } from "@/types";

export function useKnowledge(projectId: number) {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [searchResults, setSearchResults] = useState<KnowledgeChunk[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const list = await listKnowledgeSources(projectId);
      setSources(list);
    } catch (e) {
      console.error("Failed to load knowledge sources:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const import_ = useCallback(async (title: string, sourceType: string, content: string) => {
    const source = await importKnowledge(projectId, title, sourceType, content);
    setSources(prev => [source, ...prev]);
    return source;
  }, [projectId]);

  const remove = useCallback(async (id: number) => {
    await deleteKnowledgeSource(id);
    setSources(prev => prev.filter(s => s.id !== id));
  }, []);

  const search = useCallback(async (query: string, limit?: number) => {
    const results = await searchKnowledge(projectId, query, limit);
    setSearchResults(results);
    return results;
  }, [projectId]);

  return { sources, searchResults, loading, load, import: import_, remove, search };
}
