import { useState, useCallback } from "react";
import { listStyleRules, createStyleRule, updateStyleRule, deleteStyleRule } from "@/lib/tauri";
import type { StyleRule } from "@/types";

export function useStyleRules(projectId: number | null) {
  const [rules, setRules] = useState<StyleRule[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) { setRules([]); setLoading(false); return; }
    try {
      setLoading(true);
      const list = await listStyleRules(projectId);
      setRules(list);
    } catch (e) {
      console.error("Failed to load style rules:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const create = useCallback(async (ruleType: string, content: string) => {
    if (!projectId) return;
    const rule = await createStyleRule(projectId, ruleType, content);
    setRules(prev => [rule, ...prev]);
    return rule;
  }, [projectId]);

  const update = useCallback(async (id: number, fields: { enabled?: boolean; content?: string; rule_type?: string }) => {
    const updated = await updateStyleRule(id, fields);
    setRules(prev => prev.map(r => r.id === id ? updated : r));
    return updated;
  }, []);

  const remove = useCallback(async (id: number) => {
    await deleteStyleRule(id);
    setRules(prev => prev.filter(r => r.id !== id));
  }, []);

  return { rules, loading, load, create, update, remove };
}
