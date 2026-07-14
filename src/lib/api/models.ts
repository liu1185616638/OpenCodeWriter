/**
 * API: Models — 模型预设、路由、获取模型列表
 */

import { invoke } from "@tauri-apps/api/core";
import type { ModelPreset, ModelRoute } from "@/types";

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

type UpdateModelPresetFields = Partial<Pick<ModelPreset, "name" | "api_base" | "api_key" | "model_name">>;

export async function updateModelPreset(id: number, fields: UpdateModelPresetFields): Promise<ModelPreset> {
  const args: {
    id: number;
    name?: string;
    apiBase?: string;
    apiKey?: string;
    modelName?: string;
  } = { id };
  if (fields.name !== undefined) args.name = fields.name;
  if (fields.api_base !== undefined) args.apiBase = fields.api_base;
  if (fields.api_key !== undefined) args.apiKey = fields.api_key;
  if (fields.model_name !== undefined) args.modelName = fields.model_name;
  return invoke("update_model_preset", args);
}

export async function deleteModelPreset(id: number): Promise<void> {
  return invoke("delete_model_preset", { id });
}

export async function listModelRoutes(): Promise<ModelRoute[]> {
  return invoke("list_model_routes");
}

export async function upsertModelRoute(taskType: string, primaryPresetId: number | null, fallbackPresetId: number | null): Promise<ModelRoute> {
  return invoke("upsert_model_route", { taskType, primaryPresetId, fallbackPresetId });
}

export async function testModelConnection(apiBase: string, apiKey: string, modelName: string): Promise<string> {
  return invoke("test_model_connection", { apiBase, apiKey, modelName });
}
