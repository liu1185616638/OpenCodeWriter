/**
 * API: Style — 风格配置、规则、提取
 */

import { invoke } from "@tauri-apps/api/core";
import type { StyleConfig, StyleRule } from "@/types";

export async function getStyleConfig(projectId: number): Promise<StyleConfig> {
  return invoke("get_style_config", { projectId });
}

export async function saveStyleConfig(projectId: number, fields: Record<string, string>): Promise<StyleConfig> {
  return invoke("save_style_config", { projectId, ...fields });
}

export async function copyStyleConfig(sourceProjectId: number, targetProjectId: number): Promise<StyleConfig> {
  return invoke("copy_style_config", { sourceProjectId, targetProjectId });
}

export async function listStyleRules(projectId: number): Promise<StyleRule[]> {
  return invoke("list_style_rules", { projectId });
}

export async function createStyleRule(projectId: number, ruleType: string, content: string): Promise<StyleRule> {
  return invoke("create_style_rule", { projectId, ruleType, content });
}

export async function updateStyleRule(id: number, fields: { enabled?: boolean; content?: string; rule_type?: string }): Promise<StyleRule> {
  return invoke("update_style_rule", { id, ...fields });
}

export async function deleteStyleRule(id: number): Promise<void> {
  return invoke("delete_style_rule", { id });
}

export async function extractStyleRules(projectId: number, content: string, presetId: number, sessionId: string): Promise<string> {
  return invoke("extract_style_rules", { projectId, content, presetId, sessionId });
}
