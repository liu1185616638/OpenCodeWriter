/**
 * API: Jobs — 后台任务
 */

import { invoke } from "@tauri-apps/api/core";
import type { Job } from "@/types";

export async function listJobs(projectId: number, limit?: number): Promise<Job[]> {
  return invoke("list_jobs", { projectId, limit });
}

export async function createJob(projectId: number, jobType: string, payloadJson: string): Promise<Job> {
  return invoke("create_job", { projectId, jobType, payloadJson });
}

export async function updateJobStatus(id: number, status: string, resultJson?: string, error?: string): Promise<Job> {
  return invoke("update_job_status", { id, status, resultJson, error });
}

export async function deleteJob(id: number): Promise<void> {
  return invoke("delete_job", { id });
}
