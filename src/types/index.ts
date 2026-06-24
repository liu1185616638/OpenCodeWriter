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

export type CreationStage = "outline" | "characters" | "chapters" | "content";
export type CharacterTier = "main" | "supporting" | "minor";
export interface ModelInfo {
  id: string;
  owned_by: string | null;
}

export type OutlineStatus = "empty" | "draft" | "completed";
