/**
 * API: Content — 正文、工作区、快照、过时标记、生成日志
 */

import { invoke } from "@tauri-apps/api/core";
import type { Content, ContentWorkspace, ContentSnapshot, StaleReason, GenerationLog } from "@/types";

export async function getContent(chapterId: number): Promise<Content | null> {
  return invoke("get_content", { chapterId });
}

export async function saveContent(projectId: number, chapterId: number, content: string): Promise<Content> {
  return invoke("save_content", { projectId, chapterId, content });
}

export async function applyContentDraft(params: {
  projectId: number;
  chapterId: number;
  content: string;
  expectedUpdatedAt?: string | null;
  reason: string;
}): Promise<Content> {
  return invoke("apply_content_draft", params);
}

export async function markContentStale(chapterId: number, stale: boolean): Promise<void> {
  return invoke("mark_content_stale", { chapterId, stale });
}

export async function getContentWorkspace(chapterId: number): Promise<ContentWorkspace> {
  return invoke("get_content_workspace", { chapterId });
}

export async function createSnapshot(params: {
  projectId: number;
  targetType: string;
  targetId?: number | null;
  content: string;
  reason: string;
}): Promise<number> {
  return invoke("create_snapshot", params);
}

export async function listSnapshots(params: {
  projectId: number;
  targetType: string;
  targetId?: number | null;
  limit?: number;
}): Promise<ContentSnapshot[]> {
  return invoke("list_snapshots", params);
}

export async function markStale(projectId: number, sourceType: string): Promise<void> {
  return invoke("mark_stale", { projectId, sourceType });
}

export async function isStale(projectId: number, targetType: string): Promise<boolean> {
  return invoke("is_stale", { projectId, targetType });
}

export async function listStaleReasons(projectId: number, targetType: string): Promise<StaleReason[]> {
  return invoke("list_stale_reasons", { projectId, targetType });
}

export async function clearStale(projectId: number, targetType: string): Promise<void> {
  return invoke("clear_stale", { projectId, targetType });
}

export async function listGenerationLogs(projectId: number, limit?: number): Promise<GenerationLog[]> {
  return invoke("list_generation_logs", { projectId, limit });
}
