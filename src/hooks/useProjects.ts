import { useState, useEffect, useCallback } from "react";
import { createProject, listProjects, deleteProject, updateProjectStage } from "@/lib/tauri";
import type { Project, CreationStage } from "@/types";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const list = await listProjects();
      setProjects(list);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (name: string) => {
    const project = await createProject(name);
    setProjects(prev => [project, ...prev]);
    return project;
  }, []);

  const remove = useCallback(async (id: number) => {
    await deleteProject(id);
    setProjects(prev => prev.filter(p => p.id !== id));
  }, []);

  const updateStage = useCallback(async (id: number, stage: CreationStage) => {
    const updated = await updateProjectStage(id, stage);
    setProjects(prev => prev.map(p => p.id === id ? updated : p));
    return updated;
  }, []);

  return { projects, loading, error, refresh, create, remove, updateStage };
}
