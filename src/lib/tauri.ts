import { invoke } from "@tauri-apps/api/core";
import type {
  Project, Outline, Character, Chapter, Content,
  ModelPreset, StyleConfig
} from "@/types";

// Projects
export async function createProject(name: string): Promise<Project> {
  return invoke("create_project", { name });
}

export async function listProjects(): Promise<Project[]> {
  return invoke("list_projects");
}

export async function getProject(id: number): Promise<Project> {
  return invoke("get_project", { id });
}

export async function deleteProject(id: number): Promise<void> {
  return invoke("delete_project", { id });
}

export async function updateProjectStage(id: number, stage: string): Promise<Project> {
  return invoke("update_project_stage", { id, stage });
}

// Outlines
export async function getOutline(projectId: number): Promise<Outline> {
  return invoke("get_outline", { projectId });
}

export async function saveOutline(projectId: number, content: string): Promise<Outline> {
  return invoke("save_outline", { projectId, content });
}

export async function completeOutline(projectId: number): Promise<Outline> {
  return invoke("complete_outline", { projectId });
}

// Characters
export async function listCharacters(projectId: number): Promise<Character[]> {
  return invoke("list_characters", { projectId });
}

export async function listCharactersByTier(projectId: number, tier: string): Promise<Character[]> {
  return invoke("list_characters_by_tier", { projectId, tier });
}

export async function createCharacter(projectId: number, name: string, tier: string): Promise<Character> {
  return invoke("create_character", { projectId, name, tier });
}

export async function updateCharacter(id: number, fields: Record<string, string>): Promise<Character> {
  return invoke("update_character", { id, ...fields });
}

export async function deleteCharacter(id: number): Promise<void> {
  return invoke("delete_character", { id });
}

// Chapters
export async function listChapters(projectId: number): Promise<Chapter[]> {
  return invoke("list_chapters", { projectId });
}

export async function createChapter(projectId: number, chapterNumber: number, title: string, summary: string): Promise<Chapter> {
  return invoke("create_chapter", { projectId, chapterNumber, title, summary });
}

export async function updateChapter(id: number, title?: string, summary?: string): Promise<Chapter> {
  return invoke("update_chapter", { id, title, summary });
}

export async function deleteChapter(id: number): Promise<void> {
  return invoke("delete_chapter", { id });
}

export async function reorderChapters(projectId: number, chapterIds: number[]): Promise<Chapter[]> {
  return invoke("reorder_chapters", { projectId, chapterIds });
}

// Contents
export async function getContent(chapterId: number): Promise<Content | null> {
  return invoke("get_content", { chapterId });
}

export async function saveContent(projectId: number, chapterId: number, content: string): Promise<Content> {
  return invoke("save_content", { projectId, chapterId, content });
}

export async function markContentStale(chapterId: number, stale: boolean): Promise<void> {
  return invoke("mark_content_stale", { chapterId, stale });
}

// Settings
export async function getSetting(key: string): Promise<string | null> {
  return invoke("get_setting", { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke("set_setting", { key, value });
}

// Model Presets
export interface ModelInfo {
  id: string;
  owned_by: string | null;
}

export async function fetchModels(apiBase: string, apiKey: string): Promise<ModelInfo[]> {
  return invoke("fetch_models", { apiBase, apiKey });
}
export async function listModelPresets(): Promise<ModelPreset[]> {
  return invoke("list_model_presets");
}

export async function createModelPreset(name: string, apiBase: string, apiKey: string, modelName: string): Promise<ModelPreset> {
  return invoke("create_model_preset", { name, apiBase, apiKey, modelName });
}

export async function updateModelPreset(id: number, fields: Record<string, string>): Promise<ModelPreset> {
  return invoke("update_model_preset", { id, ...fields });
}

export async function deleteModelPreset(id: number): Promise<void> {
  return invoke("delete_model_preset", { id });
}

// Stale
export async function markStale(projectId: number, sourceType: string): Promise<void> {
  return invoke("mark_stale", { projectId, sourceType });
}

export async function isStale(projectId: number, targetType: string): Promise<boolean> {
  return invoke("is_stale", { projectId, targetType });
}

export async function clearStale(projectId: number, targetType: string): Promise<void> {
  return invoke("clear_stale", { projectId, targetType });
}

// Style Config
export async function getStyleConfig(projectId: number): Promise<StyleConfig> {
  return invoke("get_style_config", { projectId });
}

export async function saveStyleConfig(projectId: number, fields: Record<string, string>): Promise<StyleConfig> {
  return invoke("save_style_config", { projectId, ...fields });
}

export async function copyStyleConfig(sourceProjectId: number, targetProjectId: number): Promise<StyleConfig> {
  return invoke("copy_style_config", { sourceProjectId, targetProjectId });
}

// AI Generation
export async function generateOutline(projectId: number, presetId: number, sessionId: string): Promise<string> {
  return invoke("generate_outline", { projectId, presetId, sessionId });
}

export async function generateCharacters(projectId: number, presetId: number, sessionId: string): Promise<string> {
  return invoke("generate_characters", { projectId, presetId, sessionId });
}

export async function generateChapters(projectId: number, presetId: number, sessionId: string): Promise<string> {
  return invoke("generate_chapters", { projectId, presetId, sessionId });
}

export async function generateContent(projectId: number, chapterId: number, presetId: number, sessionId: string): Promise<string> {
  return invoke("generate_content", { projectId, chapterId, presetId, sessionId });
}
