import { invoke } from "@tauri-apps/api/core";
import type {
  Project, Outline, Character, Chapter, Content,
  ModelPreset, StyleConfig, ContentSnapshot, StaleReason, ProjectProgress,
  GenerationLog, ProjectProfile, ChapterReview,
  WorldItem, CharacterRelation, CharacterState, StoryFact, Foreshadow,
  KnowledgeSource, KnowledgeChunk,
  StyleRule, ModelRoute, Job
} from "@/types";

// Projects
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

// Outlines
export async function getOutline(projectId: number): Promise<Outline> {
  return invoke("get_outline", { projectId });
}

export async function saveOutline(projectId: number, content: string): Promise<Outline> {
  return invoke("save_outline", { projectId, content });
}

export async function completeOutline(projectId: number): Promise<Outline> {
  return invoke("complete_outline", { projectId });
}

// Characters
export async function listCharacters(projectId: number): Promise<Character[]> {
  return invoke("list_characters", { projectId });
}

export async function listCharactersByTier(projectId: number, tier: string): Promise<Character[]> {
  return invoke("list_characters_by_tier", { projectId, tier });
}

export async function createCharacter(projectId: number, name: string, tier: string): Promise<Character> {
  return invoke("create_character", { projectId, name, tier });
}

export async function updateCharacter(id: number, fields: Record<string, string>): Promise<Character> {
  return invoke("update_character", { id, ...fields });
}

export async function deleteCharacter(id: number): Promise<void> {
  return invoke("delete_character", { id });
}

// Chapters
export async function listChapters(projectId: number): Promise<Chapter[]> {
  return invoke("list_chapters", { projectId });
}

export async function createChapter(projectId: number, chapterNumber: number, title: string, summary: string): Promise<Chapter> {
  return invoke("create_chapter", { projectId, chapterNumber, title, summary });
}

export async function updateChapter(id: number, fields: Partial<Pick<Chapter, 'title' | 'summary' | 'goal' | 'conflict_level' | 'hook' | 'payoff' | 'must_avoid' | 'target_word_count'>>): Promise<Chapter> {
  return invoke("update_chapter", { id, fields });
}

export async function deleteChapter(id: number): Promise<void> {
  return invoke("delete_chapter", { id });
}

export async function reorderChapters(projectId: number, chapterIds: number[]): Promise<Chapter[]> {
  return invoke("reorder_chapters", { projectId, chapterIds });
}

// Contents
export async function getContent(chapterId: number): Promise<Content | null> {
  return invoke("get_content", { chapterId });
}

export async function saveContent(projectId: number, chapterId: number, content: string): Promise<Content> {
  return invoke("save_content", { projectId, chapterId, content });
}

export async function markContentStale(chapterId: number, stale: boolean): Promise<void> {
  return invoke("mark_content_stale", { chapterId, stale });
}

// Settings
export async function getSetting(key: string): Promise<string | null> {
  return invoke("get_setting", { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke("set_setting", { key, value });
}

// Model Presets
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

export async function updateModelPreset(id: number, fields: Record<string, string>): Promise<ModelPreset> {
  return invoke("update_model_preset", { id, ...fields });
}

export async function deleteModelPreset(id: number): Promise<void> {
  return invoke("delete_model_preset", { id });
}

// Stale
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

// Style Config
export async function getStyleConfig(projectId: number): Promise<StyleConfig> {
  return invoke("get_style_config", { projectId });
}

export async function saveStyleConfig(projectId: number, fields: Record<string, string>): Promise<StyleConfig> {
  return invoke("save_style_config", { projectId, ...fields });
}

export async function copyStyleConfig(sourceProjectId: number, targetProjectId: number): Promise<StyleConfig> {
  return invoke("copy_style_config", { sourceProjectId, targetProjectId });
}

// AI Generation
export async function generateOutline(projectId: number, presetId: number, sessionId: string): Promise<string> {
  return invoke("generate_outline", { projectId, presetId, sessionId });
}

export async function generateCharacters(projectId: number, presetId: number, sessionId: string): Promise<string> {
  return invoke("generate_characters", { projectId, presetId, sessionId });
}

export async function generateChapters(projectId: number, presetId: number, sessionId: string): Promise<string> {
  return invoke("generate_chapters", { projectId, presetId, sessionId });
}

export async function generateContent(projectId: number, chapterId: number, presetId: number, sessionId: string): Promise<string> {
  return invoke("generate_content", { projectId, chapterId, presetId, sessionId });
}

export async function chapterAftercare(projectId: number, chapterId: number, presetId: number, sessionId: string): Promise<string> {
  return invoke("chapter_aftercare", { projectId, chapterId, presetId, sessionId });
}

export async function analyzeText(projectId: number, content: string, presetId: number, sessionId: string): Promise<string> {
  return invoke("analyze_text", { projectId, content, presetId, sessionId });
}

export async function generateCharacterFromDescription(projectId: number, presetId: number, description: string, tier: string, sessionId: string): Promise<string> {
  return invoke("generate_character_from_description", { projectId, presetId, description, tier, sessionId });
}

export async function polishContent(projectId: number, chapterId: number, presetId: number, sessionId: string): Promise<string> {
  return invoke("polish_content", { projectId, chapterId, presetId, sessionId });
}

export async function polishChapter(projectId: number, presetId: number, sessionId: string): Promise<string> {
  return invoke("polish_chapter", { projectId, presetId, sessionId });
}

// Snapshots
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

// Generation Logs
export async function listGenerationLogs(projectId: number, limit?: number): Promise<GenerationLog[]> {
  return invoke("list_generation_logs", { projectId, limit });
}

// Project Profiles
export async function getProjectProfile(projectId: number): Promise<ProjectProfile> {
  return invoke("get_project_profile", { projectId });
}

export async function saveProjectProfile(
  projectId: number,
  fields: Partial<Omit<ProjectProfile, 'project_id' | 'updated_at'>>
): Promise<ProjectProfile> {
  return invoke("save_project_profile", { projectId, fields });
}

// Chapter Reviews
export async function listChapterReviews(projectId: number, chapterId: number, limit?: number): Promise<ChapterReview[]> {
  return invoke("list_chapter_reviews", { projectId, chapterId, limit });
}

// AI Review & Repair
export async function reviewChapterContent(projectId: number, chapterId: number, presetId: number, sessionId: string): Promise<string> {
  return invoke("review_chapter_content", { projectId, chapterId, presetId, sessionId });
}

export async function repairChapterContent(projectId: number, chapterId: number, presetId: number, sessionId: string): Promise<string> {
  return invoke("repair_chapter_content", { projectId, chapterId, presetId, sessionId });
}

export async function batchGenerateChapters(projectId: number, chapterIds: number[], presetId: number): Promise<number> {
  return invoke("batch_generate_chapters", { projectId, chapterIds, presetId });
}

export async function generateIdeaDirections(
  idea: string,
  presetId: number,
  sessionId: string
): Promise<string> {
  return invoke("generate_idea_directions", { idea, presetId, sessionId });
}

export async function generateOutlineFromDirection(
  projectId: number,
  directionJson: string,
  presetId: number,
  sessionId: string
): Promise<string> {
  return invoke("generate_outline_from_direction", { projectId, directionJson, presetId, sessionId });
}

// World Items
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

// Character Relations
export async function listCharacterRelations(projectId: number): Promise<CharacterRelation[]> {
  return invoke("list_character_relations", { projectId });
}

export async function createCharacterRelation(projectId: number, sourceCharacterId: number, targetCharacterId: number, relationType: string): Promise<CharacterRelation> {
  return invoke("create_character_relation", { projectId, sourceCharacterId, targetCharacterId, relationType });
}

export async function updateCharacterRelation(id: number, fields: Partial<Pick<CharacterRelation, 'relation_type' | 'tension' | 'summary'>>): Promise<CharacterRelation> {
  return invoke("update_character_relation", { id, fields });
}

export async function deleteCharacterRelation(id: number): Promise<void> {
  return invoke("delete_character_relation", { id });
}

// Character States
export async function listCharacterStates(projectId: number, characterId?: number, limit?: number): Promise<CharacterState[]> {
  return invoke("list_character_states", { projectId, characterId, limit });
}

export async function createCharacterState(params: {
  projectId: number;
  characterId: number;
  chapterId?: number | null;
  stateSummary: string;
  goal: string;
  emotion: string;
  location: string;
}): Promise<CharacterState> {
  return invoke("create_character_state", params);
}

export async function deleteCharacterState(id: number): Promise<void> {
  return invoke("delete_character_state", { id });
}

// Story Facts
export async function listStoryFacts(projectId: number, chapterId?: number, limit?: number): Promise<StoryFact[]> {
  return invoke("list_story_facts", { projectId, chapterId, limit });
}

export async function createStoryFact(projectId: number, factType: string, content: string, chapterId?: number | null): Promise<StoryFact> {
  return invoke("create_story_fact", { projectId, chapterId, factType, content });
}

export async function updateStoryFact(id: number, fields: Partial<Pick<StoryFact, 'fact_type' | 'content' | 'confidence'>>): Promise<StoryFact> {
  return invoke("update_story_fact", { id, ...fields });
}

export async function deleteStoryFact(id: number): Promise<void> {
  return invoke("delete_story_fact", { id });
}

// Foreshadows
export async function listForeshadows(projectId: number, status?: string): Promise<Foreshadow[]> {
  return invoke("list_foreshadows", { projectId, status });
}

export async function createForeshadow(projectId: number, content: string, setupChapterId?: number | null): Promise<Foreshadow> {
  return invoke("create_foreshadow", { projectId, setupChapterId, content });
}

export async function updateForeshadow(id: number, fields: { content?: string; status?: string; payoffChapterId?: number | null }): Promise<Foreshadow> {
  return invoke("update_foreshadow", { id, ...fields });
}

export async function deleteForeshadow(id: number): Promise<void> {
  return invoke("delete_foreshadow", { id });
}

// Knowledge Base
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

export async function extractStyleRules(projectId: number, content: string, presetId: number, sessionId: string): Promise<string> {
  return invoke("extract_style_rules", { projectId, content, presetId, sessionId });
}

// Style Rules
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

// Model Routes
export async function listModelRoutes(): Promise<ModelRoute[]> {
  return invoke("list_model_routes");
}

export async function upsertModelRoute(taskType: string, primaryPresetId: number | null, fallbackPresetId: number | null): Promise<ModelRoute> {
  return invoke("upsert_model_route", { taskType, primaryPresetId, fallbackPresetId });
}

// Jobs
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
