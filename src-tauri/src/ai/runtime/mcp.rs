use crate::db::DbState;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

pub const MCP_SERVERS_SETTING_KEY: &str = "mcp_servers_json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub name: String,
    pub command: String,
    pub args: String,
    pub enabled: bool,
    pub allowed_tools: Vec<String>,
    pub require_approval: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolInfo {
    pub server_name: String,
    pub tool_name: String,
    pub enabled: bool,
    pub requires_approval: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpApprovalRequest {
    pub project_id: Option<i64>,
    pub session_id: String,
    pub server_name: String,
    pub tool_name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpCallLog {
    pub id: i64,
    pub project_id: Option<i64>,
    pub session_id: String,
    pub tool_name: String,
    pub arguments_json: String,
    pub result_json: String,
    pub success: bool,
    pub error: String,
    pub call_type: String,
    pub created_at: String,
}

pub fn load_mcp_servers(db: &DbState) -> Result<Vec<McpServerConfig>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![MCP_SERVERS_SETTING_KEY],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    match value {
        Some(json) if !json.trim().is_empty() => {
            serde_json::from_str(&json).map_err(|e| format!("MCP 配置解析失败: {}", e))
        }
        _ => Ok(Vec::new()),
    }
}

pub fn save_mcp_servers(db: &DbState, servers: &[McpServerConfig]) -> Result<(), String> {
    validate_servers(servers)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let json = serde_json::to_string(servers).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![MCP_SERVERS_SETTING_KEY, json],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_configured_mcp_tools(servers: &[McpServerConfig]) -> Vec<McpToolInfo> {
    servers
        .iter()
        .filter(|server| server.enabled)
        .flat_map(|server| {
            server.allowed_tools.iter().map(move |tool| McpToolInfo {
                server_name: server.name.clone(),
                tool_name: tool.clone(),
                enabled: is_tool_allowed(tool),
                requires_approval: server.require_approval,
            })
        })
        .collect()
}

pub fn validate_servers(servers: &[McpServerConfig]) -> Result<(), String> {
    for server in servers {
        if server.enabled && server.name.trim().is_empty() {
            return Err("启用的 MCP server 必须有名称".to_string());
        }
        if server.enabled && server.command.trim().is_empty() {
            return Err(format!("MCP server '{}' 缺少启动命令", server.name));
        }
        for tool in &server.allowed_tools {
            if !is_tool_allowed(tool) {
                return Err(format!("MCP 工具 '{}' 不在安全白名单内", tool));
            }
        }
    }
    Ok(())
}

pub fn is_tool_allowed(tool_name: &str) -> bool {
    let normalized = tool_name.trim().to_lowercase();
    if normalized.is_empty() {
        return false;
    }
    let blocked_fragments = [
        "shell",
        "exec",
        "spawn",
        "delete",
        "remove",
        "write_file",
        "filesystem.write",
        "fs.write",
    ];
    if normalized == "rm" || normalized.starts_with("rm_") || normalized.starts_with("rm.") {
        return false;
    }
    !blocked_fragments
        .iter()
        .any(|fragment| normalized.contains(fragment))
}

pub fn log_mcp_call(
    db: &DbState,
    request: &McpApprovalRequest,
    success: bool,
    error: &str,
    result: serde_json::Value,
    call_type: &str,
) {
    if let Ok(conn) = db.conn.lock() {
        let args_str = serde_json::to_string(&request.arguments).unwrap_or_default();
        let result_str = serde_json::to_string(&result).unwrap_or_default();
        let tool_name = format!("{}:{}", request.server_name, request.tool_name);
        let _ = conn.execute(
            "INSERT INTO tool_call_logs (project_id, session_id, tool_name, arguments_json, result_json, success, error, call_type) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                request.project_id,
                request.session_id,
                tool_name,
                args_str,
                result_str,
                success as i64,
                error,
                call_type,
            ],
        );
    }
}

pub fn list_mcp_call_logs(db: &DbState, limit: i64) -> Result<Vec<McpCallLog>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, session_id, tool_name, arguments_json, result_json, success, error, call_type, created_at \
             FROM tool_call_logs \
             WHERE call_type LIKE 'mcp%' \
             ORDER BY created_at DESC \
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![limit.max(1).min(100)], |row| {
            Ok(McpCallLog {
                id: row.get(0)?,
                project_id: row.get(1)?,
                session_id: row.get(2)?,
                tool_name: row.get(3)?,
                arguments_json: row.get(4)?,
                result_json: row.get(5)?,
                success: row.get::<_, i64>(6)? == 1,
                error: row.get(7)?,
                call_type: row.get(8)?,
                created_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mcp_tools_are_disabled_by_default() {
        let servers: Vec<McpServerConfig> = Vec::new();
        assert!(list_configured_mcp_tools(&servers).is_empty());
    }

    #[test]
    fn dangerous_tool_names_are_blocked() {
        assert!(is_tool_allowed("search_docs"));
        assert!(is_tool_allowed("search_terms"));
        assert!(!is_tool_allowed("shell_exec"));
        assert!(!is_tool_allowed("filesystem.write"));
        assert!(!is_tool_allowed("delete_file"));
        assert!(!is_tool_allowed("rm_file"));
    }
}
