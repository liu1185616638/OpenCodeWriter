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
    pub updated_at: String,
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
