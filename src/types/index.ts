export interface ModelPreset {
  id: number;
  name: string;
  api_base: string;
  api_key: string;
  model_name: string;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  current_stage: string;
  created_at: string;
  updated_at: string;
}

export interface Outline {
  id: number;
  project_id: number;
  content: string;
  status: string;
  updated_at: string;
}

export interface Character {
  id: number;
  project_id: number;
  name: string;
  tier: string;
  identity: string;
  appearance: string;
  personality: string;
  motivation: string;
  relationships: string;
  key_events: string;
  sort_order: number;
  updated_at: string;
}

export interface Chapter {
  id: number;
  project_id: number;
  chapter_number: number;
  title: string;
  summary: string;
  sort_order: number;
  goal: string;
  conflict_level: number;
  hook: string;
  payoff: string;
  must_avoid: string;
  target_word_count: number;
  updated_at: string;
}

export interface Content {
  id: number;
  project_id: number;
  chapter_id: number;
  content: string;
  stale: number;
  updated_at: string;
}

export interface StaleReason {
  source_type: string;
  created_at: string;
}

export interface StaleMarker {
  id: number;
  project_id: number;
  target_type: string;
  target_id: number | null;
  source_type: string;
  created_at: string;
}

export interface StyleConfig {
  id: number;
  project_id: number;
  reference_text: string;
  narrative_voice: string;
  formality: string;
  emotion_intensity: string;
  custom_stopwords: string;
  updated_at: string;
}

export interface Setting {
  key: string;
  value: string;
}

export type CreationStage = "outline" | "characters" | "chapters" | "content" | "world" | "knowledge";
export type CharacterTier = "main" | "supporting" | "minor";
export interface ModelInfo {
  id: string;
  owned_by: string | null;
}

export type OutlineStatus = "empty" | "draft" | "completed";

export interface ProjectProgress {
  has_outline: boolean;
  character_count: number;
  chapter_count: number;
  has_content: boolean;
}

export interface ContentSnapshot {
  id: number;
  project_id: number;
  target_type: string;
  target_id: number | null;
  content: string;
  reason: string;
  created_at: string;
}

export interface GenerationLog {
  id: number;
  project_id: number;
  target_type: string;
  target_id: number | null;
  command: string;
  model_name: string;
  status: string;
  error: string;
  input_chars: number;
  output_chars: number;
  started_at: string;
  ended_at: string | null;
}

export interface ProjectProfile {
  project_id: number;
  premise: string;
  genre: string;
  target_audience: string;
  selling_point: string;
  reader_promise: string;
  narrative_pov: string;
  pace_preference: string;
  default_chapter_length: number;
  estimated_chapter_count: number;
  updated_at: string;
}

export interface ChapterReview {
  id: number;
  project_id: number;
  chapter_id: number;
  overall_score: number;
  continuity_score: number;
  character_score: number;
  pacing_score: number;
  issues_json: string;
  suggestions: string;
  created_at: string;
}

export interface ReviewIssue {
  type: string;
  severity: string;
  description: string;
  location: string;
}

export interface IdeaDirection {
  title: string;
  genre: string;
  selling_point: string;
  target_audience: string;
  core_conflict: string;
  reader_promise: string;
}

// Phase 3: World & Character Assets

export type WorldItemType = "location" | "faction" | "rule" | "history" | "timeline" | "object";

export interface WorldItem {
  id: number;
  project_id: number;
  item_type: string;
  name: string;
  description: string;
  rules: string;
  sort_order: number;
  updated_at: string;
}

export interface CharacterRelation {
  id: number;
  project_id: number;
  source_character_id: number;
  target_character_id: number;
  relation_type: string;
  tension: string;
  summary: string;
  updated_at: string;
}

export interface CharacterState {
  id: number;
  project_id: number;
  character_id: number;
  chapter_id: number | null;
  state_summary: string;
  goal: string;
  emotion: string;
  location: string;
  created_at: string;
}

export interface StoryFact {
  id: number;
  project_id: number;
  chapter_id: number | null;
  fact_type: string;
  content: string;
  confidence: number;
  created_at: string;
}

export interface Foreshadow {
  id: number;
  project_id: number;
  setup_chapter_id: number | null;
  payoff_chapter_id: number | null;
  content: string;
  status: string;
  created_at: string;
}

export interface KnowledgeChunk {
  source_id: number;
  title: string;
  content: string;
  source_type: string;
}

export interface KnowledgeSource {
  id: number;
  project_id: number;
  title: string;
  source_type: string;
  raw_content: string;
  chunk_count: number;
  created_at: string;
}

export interface StyleRule {
  id: number;
  project_id: number;
  rule_type: string;
  content: string;
  enabled: boolean;
  created_at: string;
}

export interface ModelRoute {
  id: number;
  task_type: string;
  primary_preset_id: number | null;
  fallback_preset_id: number | null;
  updated_at: string;
}

export interface Job {
  id: number;
  project_id: number;
  job_type: string;
  status: string;
  payload_json: string;
  result_json: string;
  error: string;
  created_at: string;
  updated_at: string;
}

// Phase 8: Runtime Tools & Skills

export interface RuntimeToolInfo {
  name: string;
  description: string;
  permission: string;
  parameters_schema: Record<string, unknown>;
}

export interface RuntimeSkillInfo {
  name: string;
  description: string;
  task_type: string;
  command: string;
  required_tools: string[];
  writes_data: boolean;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args: string;
  enabled: boolean;
  allowed_tools: string[];
  require_approval: boolean;
}

export interface McpToolInfo {
  server_name: string;
  tool_name: string;
  enabled: boolean;
  requires_approval: boolean;
}

export interface McpApprovalRequest {
  project_id?: number | null;
  session_id: string;
  server_name: string;
  tool_name: string;
  arguments: Record<string, unknown>;
}

export interface McpCallLog {
  id: number;
  project_id: number | null;
  session_id: string;
  tool_name: string;
  arguments_json: string;
  result_json: string;
  success: boolean;
  error: string;
  call_type: string;
  created_at: string;
}
