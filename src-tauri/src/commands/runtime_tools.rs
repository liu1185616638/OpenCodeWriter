use crate::ai::skills::SkillRegistry;
use crate::ai::runtime::mcp::{
    self, McpApprovalRequest, McpCallLog, McpServerConfig, McpToolInfo,
};
use crate::ai::tools::registry::{
    BusinessToolRegistry, ToolCall,
};
use crate::db::DbState;
use serde::Serialize;
use tauri::State;

/// Tool definition for frontend display.
#[derive(Debug, Serialize)]
pub struct ToolInfo {
    pub name: String,
    pub description: String,
    pub permission: String,
    pub parameters_schema: serde_json::Value,
}

/// Skill definition for frontend display.
#[derive(Debug, Serialize)]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub task_type: String,
    pub command: String,
    pub required_tools: Vec<String>,
    pub writes_data: bool,
}

/// List all registered business tools.
#[tauri::command]
pub fn list_runtime_tools() -> Result<Vec<ToolInfo>, String> {
    let registry = BusinessToolRegistry::new();
    let tools = registry
        .list_tools()
        .iter()
        .map(|t| ToolInfo {
            name: t.name.clone(),
            description: t.description.clone(),
            permission: format!("{:?}", t.permission).to_lowercase(),
            parameters_schema: t.parameters_schema.clone(),
        })
        .collect();
    Ok(tools)
}

/// List all registered skills.
#[tauri::command]
pub fn list_runtime_skills() -> Result<Vec<SkillInfo>, String> {
    let registry = SkillRegistry::new();
    let skills = registry
        .list_skills()
        .iter()
        .map(|s| SkillInfo {
            name: s.name.clone(),
            description: s.description.clone(),
            task_type: s.task_type.clone(),
            command: s.command.clone(),
            required_tools: s.required_tools.clone(),
            writes_data: s.writes_data,
        })
        .collect();
    Ok(skills)
}

/// Execute a business tool by name with given arguments.
///
/// This is primarily for testing and debugging — during normal AI
/// generation, tool calls are handled internally by the Runtime.
#[tauri::command]
pub fn execute_runtime_tool(
    tool_name: String,
    arguments: serde_json::Value,
    session_id: Option<String>,
    project_id: Option<i64>,
    state: State<'_, DbState>,
) -> Result<serde_json::Value, String> {
    let registry = BusinessToolRegistry::new();
    let call = ToolCall {
        tool_name: tool_name.clone(),
        arguments,
    };
    let session = session_id.unwrap_or_else(|| "manual".to_string());
    let result = registry.execute(&call, &state, &session, project_id);

    if result.success {
        Ok(result.data)
    } else {
        Err(result.error.unwrap_or_else(|| "工具执行失败".to_string()))
    }
}

#[tauri::command]
pub fn list_mcp_servers(state: State<'_, DbState>) -> Result<Vec<McpServerConfig>, String> {
    mcp::load_mcp_servers(&state)
}

#[tauri::command]
pub fn save_mcp_servers(
    servers: Vec<McpServerConfig>,
    state: State<'_, DbState>,
) -> Result<(), String> {
    mcp::save_mcp_servers(&state, &servers)
}

#[tauri::command]
pub fn list_mcp_tools(state: State<'_, DbState>) -> Result<Vec<McpToolInfo>, String> {
    let servers = mcp::load_mcp_servers(&state)?;
    Ok(mcp::list_configured_mcp_tools(&servers))
}

#[tauri::command]
pub fn approve_mcp_call(
    request: McpApprovalRequest,
    state: State<'_, DbState>,
) -> Result<(), String> {
    mcp::log_mcp_call(
        &state,
        &request,
        true,
        "",
        serde_json::json!({ "approved": true }),
        "mcp_approval",
    );
    Ok(())
}

#[tauri::command]
pub fn deny_mcp_call(
    request: McpApprovalRequest,
    reason: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    mcp::log_mcp_call(
        &state,
        &request,
        false,
        &reason,
        serde_json::json!({ "approved": false }),
        "mcp_approval",
    );
    Ok(())
}

#[tauri::command]
pub fn list_mcp_call_logs(
    limit: Option<i64>,
    state: State<'_, DbState>,
) -> Result<Vec<McpCallLog>, String> {
    mcp::list_mcp_call_logs(&state, limit.unwrap_or(30))
}
