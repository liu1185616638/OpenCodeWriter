/**
 * API: Facts — 事实与伏笔
 */

import { invoke } from "@tauri-apps/api/core";
import type { StoryFact, Foreshadow } from "@/types";

export async function listStoryFacts(projectId: number, chapterId?: number, limit?: number): Promise<StoryFact[]> {
  return invoke("list_story_facts", { projectId, chapterId, limit });
}

export async function createStoryFact(projectId: number, factType: string, content: string, chapterId?: number | null): Promise<StoryFact> {
  return invoke("create_story_fact", { projectId, chapterId, factType, content });
}

export async function updateStoryFact(id: number, fields: Partial<Pick<StoryFact, 'fact_type' | 'content' | 'confidence'>>): Promise<StoryFact> {
  return invoke("update_story_fact", { id, ...fields });
}

export async function deleteStoryFact(id: number): Promise<void> {
  return invoke("delete_story_fact", { id });
}

export async function listForeshadows(projectId: number, status?: string): Promise<Foreshadow[]> {
  return invoke("list_foreshadows", { projectId, status });
}

export async function createForeshadow(projectId: number, content: string, setupChapterId?: number | null): Promise<Foreshadow> {
  return invoke("create_foreshadow", { projectId, setupChapterId, content });
}

export async function updateForeshadow(id: number, fields: { content?: string; status?: string; payoffChapterId?: number | null }): Promise<Foreshadow> {
  return invoke("update_foreshadow", { id, ...fields });
}

export async function deleteForeshadow(id: number): Promise<void> {
  return invoke("delete_foreshadow", { id });
}
