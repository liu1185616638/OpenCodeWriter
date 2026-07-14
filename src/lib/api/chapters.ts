/**
 * API: Chapters — 章节、工作区摘要、任务单、排序、审核
 */

import { invoke } from "@tauri-apps/api/core";
import type { Chapter, ChapterWorkspaceSummary, ChapterReview } from "@/types";

export async function listChapters(projectId: number): Promise<Chapter[]> {
  return invoke("list_chapters", { projectId });
}

export async function createChapter(projectId: number, chapterNumber: number, title: string, summary: string): Promise<Chapter> {
  return invoke("create_chapter", { projectId, chapterNumber, title, summary });
}

export async function updateChapter(id: number, fields: Partial<Pick<Chapter, 'title' | 'summary' | 'goal' | 'conflict_level' | 'hook' | 'payoff' | 'must_avoid' | 'target_word_count' | 'viewpoint' | 'scene' | 'cast_character_ids_json' | 'turning_point' | 'outcome' | 'status'>>): Promise<Chapter> {
  return invoke("update_chapter", { id, fields });
}

export async function listChapterWorkspaceSummaries(projectId: number): Promise<ChapterWorkspaceSummary[]> {
  return invoke("list_chapter_workspace_summaries", { projectId });
}

export async function updateChapterTaskSheet(id: number, fields: Partial<Pick<Chapter, 'title' | 'summary' | 'goal' | 'conflict_level' | 'hook' | 'payoff' | 'must_avoid' | 'target_word_count' | 'viewpoint' | 'scene' | 'cast_character_ids_json' | 'turning_point' | 'outcome' | 'status'>> & { expected_updated_at?: string }): Promise<Chapter> {
  return invoke("update_chapter_task_sheet", { id, fields });
}

export async function moveChapter(id: number, beforeId?: number | null, afterId?: number | null): Promise<Chapter[]> {
  return invoke("move_chapter", { id, beforeId, afterId });
}

export async function deleteChapter(id: number): Promise<void> {
  return invoke("delete_chapter", { id });
}

export async function reorderChapters(projectId: number, chapterIds: number[]): Promise<Chapter[]> {
  return invoke("reorder_chapters", { projectId, chapterIds });
}

export async function listChapterReviews(projectId: number, chapterId: number, limit?: number): Promise<ChapterReview[]> {
  return invoke("list_chapter_reviews", { projectId, chapterId, limit });
}
