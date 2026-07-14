/**
 * API: Outline — 大纲
 */

import { invoke } from "@tauri-apps/api/core";
import type { Outline } from "@/types";

export async function getOutline(projectId: number): Promise<Outline> {
  return invoke("get_outline", { projectId });
}

export async function saveOutline(projectId: number, content: string): Promise<Outline> {
  return invoke("save_outline", { projectId, content });
}

export async function completeOutline(projectId: number): Promise<Outline> {
  return invoke("complete_outline", { projectId });
}
