import { useState, useCallback } from "react";
import { isStale, markStale, clearStale } from "@/lib/tauri";

export function useStale(projectId: number) {
  const [staleState, setStaleState] = useState<Record<string, boolean>>({});

  const check = useCallback(async (targetType: string) => {
    const result = await isStale(projectId, targetType);
    setStaleState(prev => ({ ...prev, [targetType]: result }));
    return result;
  }, [projectId]);

  const mark = useCallback(async (sourceType: string) => {
    await markStale(projectId, sourceType);
    // Re-check all downstream targets
    const targets = getDownstreamTargets(sourceType);
    for (const t of targets) {
      await check(t);
    }
  }, [projectId, check]);

  const clear = useCallback(async (targetType: string) => {
    await clearStale(projectId, targetType);
    setStaleState(prev => ({ ...prev, [targetType]: false }));
  }, [projectId]);

  return { staleState, check, mark, clear };
}

function getDownstreamTargets(sourceType: string): string[] {
  switch (sourceType) {
    case "outline": return ["characters", "chapters", "contents"];
    case "characters": return ["chapters", "contents"];
    case "chapters": return ["contents"];
    default: return [];
  }
}
