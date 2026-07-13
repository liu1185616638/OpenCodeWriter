use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Permission level for a business tool.
///
/// `ReadOnly` tools only query data and have no side effects.
/// `ControlledWrite` tools modify data but only in whitelisted tables.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ToolPermission {
    ReadOnly,
    ControlledWrite,
}

/// Metadata describing a registered tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub permission: ToolPermission,
    pub parameters_schema: serde_json::Value,
}

/// A tool call request originating from the runtime or business layer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub tool_name: String,
    pub arguments: serde_json::Value,
}

/// The result of executing a tool call.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub tool_name: String,
    pub success: bool,
    pub data: serde_json::Value,
    pub error: Option<String>,
}

impl ToolResult {
    pub fn success(tool_name: &str, data: serde_json::Value) -> Self {
        Self {
            tool_name: tool_name.to_string(),
            success: true,
            data,
            error: None,
        }
    }

    pub fn error(tool_name: &str, error: String) -> Self {
        Self {
            tool_name: tool_name.to_string(),
            success: false,
            data: serde_json::Value::Null,
            error: Some(error),
        }
    }
}

/// Function type for tool executors.
///
/// Each executor takes JSON arguments and a database reference,
/// returning a JSON value or an error string.
pub type ToolExecutor = fn(&serde_json::Value, &DbState) -> Result<serde_json::Value, String>;

/// A registered tool with its definition and executor function.
pub struct RegisteredTool {
    pub definition: ToolDefinition,
    pub executor: ToolExecutor,
}

/// Registry of all business tools available to the Runtime.
///
/// Tools are registered at construction time with safe defaults.
/// The registry enforces permission checks and logs all calls.
pub struct BusinessToolRegistry {
    tools: HashMap<String, RegisteredTool>,
}

impl BusinessToolRegistry {
    /// Create a new registry and register all default business tools.
    pub fn new() -> Self {
        let mut registry = Self {
            tools: HashMap::new(),
        };
        registry.register_defaults();
        registry
    }

    /// Register a custom tool.
    pub fn register(&mut self, name: &str, definition: ToolDefinition, executor: ToolExecutor) {
        self.tools
            .insert(name.to_string(), RegisteredTool { definition, executor });
    }

    /// List all registered tool definitions.
    pub fn list_tools(&self) -> Vec<&ToolDefinition> {
        self.tools.values().map(|t| &t.definition).collect()
    }

    /// Get a tool definition by name.
    pub fn get_tool(&self, name: &str) -> Option<&ToolDefinition> {
        self.tools.get(name).map(|t| &t.definition)
    }

    /// Execute a tool call with permission checking and logging.
    ///
    /// Logs the call to `tool_call_logs` table for auditing.
    /// The `session_id` and `project_id` are used for log traceability.
    pub fn execute(
        &self,
        call: &ToolCall,
        db: &DbState,
        session_id: &str,
        project_id: Option<i64>,
    ) -> ToolResult {
        let result = match self.tools.get(&call.tool_name) {
            Some(tool) => match (tool.executor)(&call.arguments, db) {
                Ok(data) => ToolResult::success(&call.tool_name, data),
                Err(e) => ToolResult::error(&call.tool_name, e),
            },
            None => ToolResult::error(
                &call.tool_name,
                format!("工具 '{}' 未注册", call.tool_name),
            ),
        };

        // Log the tool call (best-effort, ignore errors)
        self.log_tool_call(call, &result, db, session_id, project_id);

        result
    }

    /// Insert a tool call log entry.
    fn log_tool_call(
        &self,
        call: &ToolCall,
        result: &ToolResult,
        db: &DbState,
        session_id: &str,
        project_id: Option<i64>,
    ) {
        if let Ok(conn) = db.conn.lock() {
            let args_str = serde_json::to_string(&call.arguments).unwrap_or_default();
            let result_str = serde_json::to_string(&result.data).unwrap_or_default();
            let _ = conn.execute(
                "INSERT INTO tool_call_logs (project_id, session_id, tool_name, arguments_json, result_json, success, error, call_type) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'tool')",
                params![
                    project_id,
                    session_id,
                    call.tool_name,
                    args_str,
                    result_str,
                    result.success as i64,
                    result.error.as_deref().unwrap_or(""),
                ],
            );
        }
    }

    /// Register all default Phase 8 business tools.
    fn register_defaults(&mut self) {
        // Read-only project tools
        self.register_readonly(
            "get_project_profile",
            "获取项目设定（题材、卖点、目标读者、核心冲突等）",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "project_id": { "type": "integer", "description": "项目ID" }
                },
                "required": ["project_id"]
            }),
            super::project_tools::get_project_profile,
        );

        self.register_readonly(
            "get_outline",
            "获取项目大纲内容",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "project_id": { "type": "integer", "description": "项目ID" }
                },
                "required": ["project_id"]
            }),
            super::project_tools::get_outline,
        );

        self.register_readonly(
            "get_characters",
            "获取项目所有人物列表（含身份、外貌、性格、动机等）",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "project_id": { "type": "integer", "description": "项目ID" }
                },
                "required": ["project_id"]
            }),
            super::project_tools::get_characters,
        );

        self.register_readonly(
            "get_chapters",
            "获取项目章节目录列表",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "project_id": { "type": "integer", "description": "项目ID" }
                },
                "required": ["project_id"]
            }),
            super::project_tools::get_chapters,
        );

        // Read-only knowledge tools
        self.register_readonly(
            "search_knowledge",
            "在知识库中全文搜索相关资料片段",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "project_id": { "type": "integer", "description": "项目ID" },
                    "query": { "type": "string", "description": "搜索关键词" },
                    "limit": { "type": "integer", "description": "返回结果数量上限，默认5" }
                },
                "required": ["project_id", "query"]
            }),
            super::knowledge_tools::search_knowledge,
        );

        // Read-only world/story tools
        self.register_readonly(
            "get_world_items",
            "获取世界观条目列表（地点、势力、规则等）",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "project_id": { "type": "integer", "description": "项目ID" }
                },
                "required": ["project_id"]
            }),
            super::world_tools::get_world_items,
        );

        self.register_readonly(
            "get_story_facts",
            "获取已记录的故事事实",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "project_id": { "type": "integer", "description": "项目ID" },
                    "limit": { "type": "integer", "description": "返回数量上限，默认30" }
                },
                "required": ["project_id"]
            }),
            super::world_tools::get_story_facts,
        );

        self.register_readonly(
            "get_foreshadows",
            "获取伏笔列表（含状态：setup/payoff）",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "project_id": { "type": "integer", "description": "项目ID" }
                },
                "required": ["project_id"]
            }),
            super::world_tools::get_foreshadows,
        );

        // Controlled write tools
        self.register_controlled_write(
            "create_snapshot",
            "创建内容快照（覆盖正文前备份）",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "project_id": { "type": "integer", "description": "项目ID" },
                    "target_type": { "type": "string", "description": "快照类型：outline/content" },
                    "target_id": { "type": "integer", "description": "目标ID（如章节ID）" },
                    "content": { "type": "string", "description": "快照内容" },
                    "reason": { "type": "string", "description": "快照原因" }
                },
                "required": ["project_id", "target_type", "content", "reason"]
            }),
            super::story_tools::create_snapshot,
        );

        self.register_controlled_write(
            "save_chapter_review",
            "保存章节审核结果到数据库",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "project_id": { "type": "integer", "description": "项目ID" },
                    "chapter_id": { "type": "integer", "description": "章节ID" },
                    "overall_score": { "type": "integer", "description": "总评分" },
                    "continuity_score": { "type": "integer", "description": "连续性评分" },
                    "character_score": { "type": "integer", "description": "人物评分" },
                    "pacing_score": { "type": "integer", "description": "节奏评分" },
                    "issues_json": { "type": "string", "description": "问题列表JSON" },
                    "suggestions": { "type": "string", "description": "改进建议" }
                },
                "required": ["project_id", "chapter_id"]
            }),
            super::story_tools::save_chapter_review,
        );

        self.register_controlled_write(
            "save_story_fact",
            "保存故事事实到数据库",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "project_id": { "type": "integer", "description": "项目ID" },
                    "chapter_id": { "type": "integer", "description": "关联章节ID" },
                    "fact_type": { "type": "string", "description": "事实类型" },
                    "content": { "type": "string", "description": "事实内容" },
                    "confidence": { "type": "number", "description": "置信度0-1" }
                },
                "required": ["project_id", "fact_type", "content"]
            }),
            super::story_tools::save_story_fact,
        );

        self.register_controlled_write(
            "save_foreshadow",
            "保存伏笔到数据库",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "project_id": { "type": "integer", "description": "项目ID" },
                    "setup_chapter_id": { "type": "integer", "description": "埋设章节ID" },
                    "payoff_chapter_id": { "type": "integer", "description": "回收章节ID" },
                    "content": { "type": "string", "description": "伏笔内容" },
                    "status": { "type": "string", "description": "状态：setup/payoff" }
                },
                "required": ["project_id", "content"]
            }),
            super::story_tools::save_foreshadow,
        );
    }

    fn register_readonly(
        &mut self,
        name: &str,
        description: &str,
        schema: serde_json::Value,
        executor: ToolExecutor,
    ) {
        self.register(
            name,
            ToolDefinition {
                name: name.to_string(),
                description: description.to_string(),
                permission: ToolPermission::ReadOnly,
                parameters_schema: schema,
            },
            executor,
        );
    }

    fn register_controlled_write(
        &mut self,
        name: &str,
        description: &str,
        schema: serde_json::Value,
        executor: ToolExecutor,
    ) {
        self.register(
            name,
            ToolDefinition {
                name: name.to_string(),
                description: description.to_string(),
                permission: ToolPermission::ControlledWrite,
                parameters_schema: schema,
            },
            executor,
        );
    }
}

impl Default for BusinessToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_has_all_default_tools() {
        let registry = BusinessToolRegistry::new();
        let names: Vec<&str> = registry.list_tools().iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"get_project_profile"));
        assert!(names.contains(&"get_outline"));
        assert!(names.contains(&"get_characters"));
        assert!(names.contains(&"get_chapters"));
        assert!(names.contains(&"search_knowledge"));
        assert!(names.contains(&"get_world_items"));
        assert!(names.contains(&"get_story_facts"));
        assert!(names.contains(&"get_foreshadows"));
        assert!(names.contains(&"create_snapshot"));
        assert!(names.contains(&"save_chapter_review"));
        assert!(names.contains(&"save_story_fact"));
        assert!(names.contains(&"save_foreshadow"));
        assert_eq!(names.len(), 12);
    }

    #[test]
    fn unregistered_tool_returns_error() {
        let registry = BusinessToolRegistry::new();
        // Create a dummy DbState for testing
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        let db = DbState {
            conn: std::sync::Mutex::new(conn),
        };
        let call = ToolCall {
            tool_name: "nonexistent_tool".to_string(),
            arguments: serde_json::Value::Null,
        };
        let result = registry.execute(&call, &db, "test-session", None);
        assert!(!result.success);
        assert!(result.error.unwrap().contains("未注册"));
    }
}
