/**
 * API: World — 世界观条目
 */

import { invoke } from "@tauri-apps/api/core";
import type { WorldItem } from "@/types";

export async function listWorldItems(projectId: number): Promise<WorldItem[]> {
  return invoke("list_world_items", { projectId });
}

export async function createWorldItem(projectId: number, itemType: string, name: string): Promise<WorldItem> {
  return invoke("create_world_item", { projectId, itemType, name });
}

export async function updateWorldItem(id: number, fields: Partial<Pick<WorldItem, 'item_type' | 'name' | 'description' | 'rules'>>): Promise<WorldItem> {
  return invoke("update_world_item", { id, fields });
}

export async function deleteWorldItem(id: number): Promise<void> {
  return invoke("delete_world_item", { id });
}
