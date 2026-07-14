/**
 * API: Knowledge — 知识库来源、搜索
 */

import { invoke } from "@tauri-apps/api/core";
import type { KnowledgeSource, KnowledgeChunk } from "@/types";

export async function listKnowledgeSources(projectId: number): Promise<KnowledgeSource[]> {
  return invoke("list_knowledge_sources", { projectId });
}

export async function importKnowledge(projectId: number, title: string, sourceType: string, content: string): Promise<KnowledgeSource> {
  return invoke("import_knowledge", { projectId, title, sourceType, content });
}

export async function deleteKnowledgeSource(id: number): Promise<void> {
  return invoke("delete_knowledge_source", { id });
}

export async function searchKnowledge(projectId: number, query: string, limit?: number): Promise<KnowledgeChunk[]> {
  return invoke("search_knowledge", { projectId, query, limit });
}
