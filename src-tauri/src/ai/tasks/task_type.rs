/// Task type constants used by `AiRequest` and model routing.
///
/// These match the `task_type` column in `model_routes`.
pub const OUTLINE: &str = "outline";
pub const CHARACTERS: &str = "characters";
pub const CHAPTERS: &str = "chapters";
pub const CONTENT: &str = "content";
pub const POLISH: &str = "polish";
pub const REVIEW: &str = "review";
pub const AFTERCARE: &str = "aftercare";
pub const KNOWLEDGE: &str = "knowledge";
pub const STYLE_RULES: &str = "style_rules";
pub const IDEA: &str = "idea";

/// Tauri command names for generation log entries.
pub const CMD_GENERATE_OUTLINE: &str = "generate_outline";
pub const CMD_GENERATE_CHARACTERS: &str = "generate_characters";
pub const CMD_GENERATE_CHAPTERS: &str = "generate_chapters";
pub const CMD_GENERATE_CONTENT: &str = "generate_content";
pub const CMD_POLISH_CONTENT: &str = "polish_content";
pub const CMD_POLISH_CHAPTER: &str = "polish_chapter";
pub const CMD_REVIEW_CHAPTER: &str = "review_chapter_content";
pub const CMD_REPAIR_CHAPTER: &str = "repair_chapter_content";
pub const CMD_AFTERCARE: &str = "chapter_aftercare";
pub const CMD_ANALYZE_TEXT: &str = "analyze_text";
pub const CMD_EXTRACT_RULES: &str = "extract_style_rules";
pub const CMD_GENERATE_CHARACTER_FROM_DESC: &str = "generate_character_from_description";
pub const CMD_GENERATE_IDEA_DIRECTIONS: &str = "generate_idea_directions";
pub const CMD_GENERATE_OUTLINE_FROM_DIRECTION: &str = "generate_outline_from_direction";
pub const CMD_BATCH_GENERATE: &str = "batch_generate_chapters";
