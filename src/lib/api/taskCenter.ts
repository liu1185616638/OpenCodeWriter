/**
 * API: TaskCenter — 任务中心、取消、重试
 */

import { invoke } from "@tauri-apps/api/core";
import type { TaskCenterItem, RetryInfo } from "@/types";

export async function listTaskCenterItems(projectId: number, filter?: string, limit?: number): Promise<TaskCenterItem[]> {
  return invoke("list_task_center_items", { projectId, filter, limit });
}

export async function cancelAiSession(sessionId: string): Promise<string> {
  return invoke("cancel_ai_session", { sessionId });
}

export async function getRetryInfo(sessionId: string): Promise<RetryInfo> {
  return invoke("get_retry_info", { sessionId });
}
