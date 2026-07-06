use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelPreset {
    pub id: i64,
    pub name: String,
    pub api_base: String,
    pub api_key: String,
    pub model_name: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub current_stage: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Outline {
    pub id: i64,
    pub project_id: i64,
    pub content: String,
    pub status: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Character {
    pub id: i64,
    pub project_id: i64,
    pub name: String,
    pub tier: String,
    pub identity: String,
    pub appearance: String,
    pub personality: String,
    pub motivation: String,
    pub relationships: String,
    pub key_events: String,
    pub sort_order: i64,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Chapter {
    pub id: i64,
    pub project_id: i64,
    pub chapter_number: i64,
    pub title: String,
    pub summary: String,
    pub sort_order: i64,
    pub goal: String,
    pub conflict_level: i64,
    pub hook: String,
    pub payoff: String,
    pub must_avoid: String,
    pub target_word_count: i64,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChapterReview {
    pub id: i64,
    pub project_id: i64,
    pub chapter_id: i64,
    pub overall_score: i64,
    pub continuity_score: i64,
    pub character_score: i64,
    pub pacing_score: i64,
    pub issues_json: String,
    pub suggestions: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Content {
    pub id: i64,
    pub project_id: i64,
    pub chapter_id: i64,
    pub content: String,
    pub stale: i64,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StaleMarker {
    pub id: i64,
    pub project_id: i64,
    pub target_type: String,
    pub target_id: Option<i64>,
    pub source_type: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StyleConfig {
    pub id: i64,
    pub project_id: i64,
    pub reference_text: String,
    pub narrative_voice: String,
    pub formality: String,
    pub emotion_intensity: String,
    pub custom_stopwords: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Setting {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectProfile {
    pub project_id: i64,
    pub premise: String,
    pub genre: String,
    pub target_audience: String,
    pub selling_point: String,
    pub reader_promise: String,
    pub narrative_pov: String,
    pub pace_preference: String,
    pub default_chapter_length: i64,
    pub estimated_chapter_count: i64,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorldItem {
    pub id: i64,
    pub project_id: i64,
    pub item_type: String,
    pub name: String,
    pub description: String,
    pub rules: String,
    pub sort_order: i64,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CharacterRelation {
    pub id: i64,
    pub project_id: i64,
    pub source_character_id: i64,
    pub target_character_id: i64,
    pub relation_type: String,
    pub tension: String,
    pub summary: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CharacterState {
    pub id: i64,
    pub project_id: i64,
    pub character_id: i64,
    pub chapter_id: Option<i64>,
    pub state_summary: String,
    pub goal: String,
    pub emotion: String,
    pub location: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StoryFact {
    pub id: i64,
    pub project_id: i64,
    pub chapter_id: Option<i64>,
    pub fact_type: String,
    pub content: String,
    pub confidence: f64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Foreshadow {
    pub id: i64,
    pub project_id: i64,
    pub setup_chapter_id: Option<i64>,
    pub payoff_chapter_id: Option<i64>,
    pub content: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KnowledgeSource {
    pub id: i64,
    pub project_id: i64,
    pub title: String,
    pub source_type: String,
    pub raw_content: String,
    pub chunk_count: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KnowledgeChunk {
    pub source_id: i64,
    pub title: String,
    pub content: String,
    pub source_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StyleRule {
    pub id: i64,
    pub project_id: i64,
    pub rule_type: String,
    pub content: String,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelRoute {
    pub id: i64,
    pub task_type: String,
    pub primary_preset_id: Option<i64>,
    pub fallback_preset_id: Option<i64>,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Job {
    pub id: i64,
    pub project_id: i64,
    pub job_type: String,
    pub status: String,
    pub payload_json: String,
    pub result_json: String,
    pub error: String,
    pub created_at: String,
    pub updated_at: String,
}
