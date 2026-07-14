/**
 * API: Runtime — 运行时工具与技能
 */

import { invoke } from "@tauri-apps/api/core";
import type { RuntimeToolInfo, RuntimeSkillInfo } from "@/types";

export async function listRuntimeTools(): Promise<RuntimeToolInfo[]> {
  return invoke("list_runtime_tools");
}

export async function listRuntimeSkills(): Promise<RuntimeSkillInfo[]> {
  return invoke("list_runtime_skills");
}

export async function executeRuntimeTool(
  toolName: string,
  args: Record<string, unknown>,
  sessionId?: string,
  projectId?: number,
): Promise<unknown> {
  return invoke("execute_runtime_tool", { toolName, arguments: args, sessionId, projectId });
}
