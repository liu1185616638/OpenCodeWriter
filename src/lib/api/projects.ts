/**
 * API: Projects — 项目 CRUD、进度、摘要、设定、初始化
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  Project, ProjectProgress, ProjectProfile,
  ProjectSummary, ProfileChangeImpact,
} from "@/types";

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

export async function getProjectProgress(projectId: number): Promise<ProjectProgress> {
  return invoke("get_project_progress", { projectId });
}

export async function getProjectProfile(projectId: number): Promise<ProjectProfile> {
  return invoke("get_project_profile", { projectId });
}

export async function saveProjectProfile(
  projectId: number,
  fields: Partial<Omit<ProjectProfile, 'project_id' | 'updated_at'>>
): Promise<ProjectProfile> {
  return invoke("save_project_profile", { projectId, fields });
}

export async function listProjectSummaries(): Promise<ProjectSummary[]> {
  return invoke("list_project_summaries");
}

export async function touchProjectOpened(projectId: number): Promise<void> {
  return invoke("touch_project_opened", { projectId });
}

export async function previewProfileChangeImpact(projectId: number): Promise<ProfileChangeImpact> {
  return invoke("preview_profile_change_impact", { projectId });
}

export async function completeSetup(name: string, apiBase: string, apiKey: string, modelName: string): Promise<number> {
  return invoke("complete_setup", { name, apiBase, apiKey, modelName });
}
