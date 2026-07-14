/**
 * API: AI — 生成、润色、审核、修复、批量、灵感向导
 */

import { invoke } from "@tauri-apps/api/core";

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

export async function chapterAftercare(projectId: number, chapterId: number, presetId: number, sessionId: string): Promise<string> {
  return invoke("chapter_aftercare", { projectId, chapterId, presetId, sessionId });
}

export async function analyzeText(projectId: number, content: string, presetId: number, sessionId: string): Promise<string> {
  return invoke("analyze_text", { projectId, content, presetId, sessionId });
}

export async function generateCharacterFromDescription(projectId: number, presetId: number, description: string, tier: string, sessionId: string): Promise<string> {
  return invoke("generate_character_from_description", { projectId, presetId, description, tier, sessionId });
}

export async function polishContent(projectId: number, chapterId: number, presetId: number, sessionId: string): Promise<string> {
  return invoke("polish_content", { projectId, chapterId, presetId, sessionId });
}

export async function polishChapter(projectId: number, presetId: number, sessionId: string): Promise<string> {
  return invoke("polish_chapter", { projectId, presetId, sessionId });
}

export async function reviewChapterContent(projectId: number, chapterId: number, presetId: number, sessionId: string): Promise<string> {
  return invoke("review_chapter_content", { projectId, chapterId, presetId, sessionId });
}

export async function repairChapterContent(projectId: number, chapterId: number, presetId: number, sessionId: string): Promise<string> {
  return invoke("repair_chapter_content", { projectId, chapterId, presetId, sessionId });
}

export async function batchGenerateChapters(projectId: number, chapterIds: number[], presetId: number): Promise<number> {
  return invoke("batch_generate_chapters", { projectId, chapterIds, presetId });
}

export async function generateIdeaDirections(
  idea: string,
  presetId: number,
  sessionId: string
): Promise<string> {
  return invoke("generate_idea_directions", { idea, presetId, sessionId });
}

export async function generateOutlineFromDirection(
  projectId: number,
  directionJson: string,
  presetId: number,
  sessionId: string
): Promise<string> {
  return invoke("generate_outline_from_direction", { projectId, directionJson, presetId, sessionId });
}
