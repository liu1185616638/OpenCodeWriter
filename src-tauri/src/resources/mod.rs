pub const METHODOLOGY: &str = include_str!("../../resources/methodology.md");
pub const OUTLINE_TEMPLATE: &str = include_str!("../../resources/templates/outline.md");
pub const CHARACTERS_TEMPLATE: &str = include_str!("../../resources/templates/characters.md");
pub const CHAPTERS_TEMPLATE: &str = include_str!("../../resources/templates/chapters.md");
pub const CONTENT_TEMPLATE: &str = include_str!("../../resources/templates/content.md");
pub const OUTLINE_EXAMPLE: &str = include_str!("../../resources/examples/outline.md");
pub const CHARACTERS_EXAMPLE: &str = include_str!("../../resources/examples/characters.md");
pub const STOPWORDS_JSON: &str = include_str!("../../resources/stopwords.json");

pub fn load_stopwords() -> Vec<String> {
    serde_json::from_str(STOPWORDS_JSON).unwrap_or_default()
}
