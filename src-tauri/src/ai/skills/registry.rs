use crate::ai::tasks::task_type;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A skill definition describing a reusable AI capability.
///
/// Skills encapsulate AI execution logic. The business layer
/// is still responsible for saving results — skills only
/// handle the AI request/response cycle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDefinition {
    /// Unique skill name (e.g. "chapter_review")
    pub name: String,
    /// Human-readable description
    pub description: String,
    /// Associated task type for model routing
    pub task_type: String,
    /// Tauri command name for generation logs
    pub command: String,
    /// Tools this skill may use during execution
    pub required_tools: Vec<String>,
    /// Whether this skill writes data (affects permission checks)
    pub writes_data: bool,
}

/// Input for skill execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInput {
    pub project_id: i64,
    pub chapter_id: Option<i64>,
    pub payload: serde_json::Value,
}

/// Output from skill execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillOutput {
    /// The raw AI-generated content
    pub content: String,
    /// A short summary of what the skill did
    pub summary: String,
}

/// Status of a skill execution for logging.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillStatus {
    pub skill_name: String,
    pub session_id: String,
    pub success: bool,
    pub error: Option<String>,
}

/// Registry of all available skills.
///
/// Skills are metadata definitions — the actual AI execution
/// is handled by `AiTaskService`. The registry provides:
/// - Skill lookup by name
/// - Tool association
/// - Logging of skill_start/skill_result events
pub struct SkillRegistry {
    skills: HashMap<String, SkillDefinition>,
}

impl SkillRegistry {
    /// Create a new registry and register all default skills.
    pub fn new() -> Self {
        let mut registry = Self {
            skills: HashMap::new(),
        };
        registry.register_defaults();
        registry
    }

    /// Register a custom skill.
    pub fn register(&mut self, definition: SkillDefinition) {
        self.skills.insert(definition.name.clone(), definition);
    }

    /// List all registered skill definitions.
    pub fn list_skills(&self) -> Vec<&SkillDefinition> {
        self.skills.values().collect()
    }

    /// Get a skill definition by name.
    pub fn get_skill(&self, name: &str) -> Option<&SkillDefinition> {
        self.skills.get(name)
    }

    /// Get the tools required by a skill.
    pub fn get_required_tools(&self, name: &str) -> Vec<String> {
        self.skills
            .get(name)
            .map(|s| s.required_tools.clone())
            .unwrap_or_default()
    }

    /// Log a skill execution start (best-effort).
    pub fn log_skill_start(
        &self,
        db: &crate::db::DbState,
        skill_name: &str,
        session_id: &str,
        project_id: Option<i64>,
    ) {
        if let Ok(conn) = db.conn.lock() {
            let _ = conn.execute(
                "INSERT INTO tool_call_logs (project_id, session_id, tool_name, arguments_json, result_json, success, error, skill_name, call_type) \
                 VALUES (?1, ?2, ?3, '{}', '{}', 1, '', ?4, 'skill_start')",
                params![project_id, session_id, skill_name, skill_name],
            );
        }
    }

    /// Log a skill execution result (best-effort).
    pub fn log_skill_result(
        &self,
        db: &crate::db::DbState,
        skill_name: &str,
        session_id: &str,
        project_id: Option<i64>,
        success: bool,
        error: &str,
    ) {
        if let Ok(conn) = db.conn.lock() {
            let _ = conn.execute(
                "INSERT INTO tool_call_logs (project_id, session_id, tool_name, arguments_json, result_json, success, error, skill_name, call_type) \
                 VALUES (?1, ?2, ?3, '{}', '{}', ?4, ?5, ?6, 'skill_result')",
                params![
                    project_id,
                    session_id,
                    skill_name,
                    success as i64,
                    error,
                    skill_name,
                ],
            );
        }
    }

    /// Register all default Phase 8 skills.
    fn register_defaults(&mut self) {
        self.register(SkillDefinition {
            name: "novel_outline_planner".to_string(),
            description: "大纲规划：基于项目设定和灵感生成故事大纲".to_string(),
            task_type: task_type::OUTLINE.to_string(),
            command: task_type::CMD_GENERATE_OUTLINE.to_string(),
            required_tools: vec!["get_project_profile".to_string()],
            writes_data: false,
        });

        self.register(SkillDefinition {
            name: "novel_character_builder".to_string(),
            description: "人物生成：基于大纲生成人物小传".to_string(),
            task_type: task_type::CHARACTERS.to_string(),
            command: task_type::CMD_GENERATE_CHARACTERS.to_string(),
            required_tools: vec!["get_outline".to_string(), "get_project_profile".to_string()],
            writes_data: false,
        });

        self.register(SkillDefinition {
            name: "novel_content_writer".to_string(),
            description: "正文生成：基于大纲、人物、章节任务单生成章节正文".to_string(),
            task_type: task_type::CONTENT.to_string(),
            command: task_type::CMD_GENERATE_CONTENT.to_string(),
            required_tools: vec![
                "get_outline".to_string(),
                "get_characters".to_string(),
                "get_chapters".to_string(),
                "get_world_items".to_string(),
                "get_story_facts".to_string(),
                "get_foreshadows".to_string(),
                "search_knowledge".to_string(),
            ],
            writes_data: false,
        });

        self.register(SkillDefinition {
            name: "chapter_review".to_string(),
            description: "章节审核：对章节正文进行质量审核，返回评分和问题列表".to_string(),
            task_type: task_type::REVIEW.to_string(),
            command: task_type::CMD_REVIEW_CHAPTER.to_string(),
            required_tools: vec![
                "get_outline".to_string(),
                "get_characters".to_string(),
                "save_chapter_review".to_string(),
            ],
            writes_data: true,
        });

        self.register(SkillDefinition {
            name: "chapter_repair".to_string(),
            description: "章节修复：根据审核结果修复章节正文问题".to_string(),
            task_type: task_type::REVIEW.to_string(),
            command: task_type::CMD_REPAIR_CHAPTER.to_string(),
            required_tools: vec![
                "get_outline".to_string(),
                "get_characters".to_string(),
                "create_snapshot".to_string(),
            ],
            writes_data: true,
        });

        self.register(SkillDefinition {
            name: "aftercare_extractor".to_string(),
            description: "后护理提取：从章节正文提取事实、人物状态、伏笔".to_string(),
            task_type: task_type::AFTERCARE.to_string(),
            command: task_type::CMD_AFTERCARE.to_string(),
            required_tools: vec![
                "get_outline".to_string(),
                "get_characters".to_string(),
                "save_story_fact".to_string(),
                "save_foreshadow".to_string(),
            ],
            writes_data: true,
        });

        self.register(SkillDefinition {
            name: "style_rule_extractor".to_string(),
            description: "写法规则提取：从参考文本提取可复用的写作规则".to_string(),
            task_type: task_type::STYLE_RULES.to_string(),
            command: task_type::CMD_EXTRACT_RULES.to_string(),
            required_tools: vec![],
            writes_data: false,
        });

        self.register(SkillDefinition {
            name: "knowledge_retriever".to_string(),
            description: "知识库召回：搜索知识库并生成结构化摘要".to_string(),
            task_type: task_type::KNOWLEDGE.to_string(),
            command: task_type::CMD_ANALYZE_TEXT.to_string(),
            required_tools: vec!["search_knowledge".to_string()],
            writes_data: false,
        });
    }
}

impl Default for SkillRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_has_all_default_skills() {
        let registry = SkillRegistry::new();
        let names: Vec<&str> = registry.list_skills().iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"novel_outline_planner"));
        assert!(names.contains(&"novel_character_builder"));
        assert!(names.contains(&"novel_content_writer"));
        assert!(names.contains(&"chapter_review"));
        assert!(names.contains(&"chapter_repair"));
        assert!(names.contains(&"aftercare_extractor"));
        assert!(names.contains(&"style_rule_extractor"));
        assert!(names.contains(&"knowledge_retriever"));
        assert_eq!(names.len(), 8);
    }

    #[test]
    fn review_skill_has_write_tools() {
        let registry = SkillRegistry::new();
        let skill = registry.get_skill("chapter_review").unwrap();
        assert!(skill.writes_data);
        assert!(skill.required_tools.contains(&"save_chapter_review".to_string()));
    }

    #[test]
    fn content_writer_has_read_tools() {
        let registry = SkillRegistry::new();
        let skill = registry.get_skill("novel_content_writer").unwrap();
        assert!(!skill.writes_data);
        assert!(skill.required_tools.contains(&"get_outline".to_string()));
        assert!(skill.required_tools.contains(&"search_knowledge".to_string()));
    }
}
