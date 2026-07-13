use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
struct ChunkPayload {
    session_id: String,
    chunk: String,
    chunk_type: String,
}

#[derive(Debug, Clone, Serialize)]
struct DonePayload {
    session_id: String,
}

#[derive(Debug, Clone, Serialize)]
struct ErrorPayload {
    session_id: String,
    error: String,
}

/// Emit a streaming chunk event.
/// chunk_type: "thinking" for reasoning content, "content" for final output text.
pub fn emit_chunk(app: &AppHandle, session_id: &str, chunk: &str, chunk_type: &str) {
    let payload = ChunkPayload {
        session_id: session_id.to_string(),
        chunk: chunk.to_string(),
        chunk_type: chunk_type.to_string(),
    };
    if let Err(e) = app.emit("ai-chunk", &payload) {
        eprintln!("Failed to emit ai-chunk event: {}", e);
    }
}

pub fn emit_done(app: &AppHandle, session_id: &str) {
    let payload = DonePayload {
        session_id: session_id.to_string(),
    };
    if let Err(e) = app.emit("ai-done", &payload) {
        eprintln!("Failed to emit ai-done event: {}", e);
    }
}

pub fn emit_error(app: &AppHandle, session_id: &str, error: &str) {
    let payload = ErrorPayload {
        session_id: session_id.to_string(),
        error: error.to_string(),
    };
    if let Err(e) = app.emit("ai-error", &payload) {
        eprintln!("Failed to emit ai-error event: {}", e);
    }
}

// --- Phase 8: Skill / Tool events ---

#[derive(Debug, Clone, Serialize)]
struct SkillEventPayload {
    session_id: String,
    skill_name: String,
    success: bool,
    error: String,
}

/// Emit a skill_start event when a skill begins execution.
pub fn emit_skill_start(app: &AppHandle, session_id: &str, skill_name: &str) {
    let payload = SkillEventPayload {
        session_id: session_id.to_string(),
        skill_name: skill_name.to_string(),
        success: true,
        error: String::new(),
    };
    if let Err(e) = app.emit("ai-skill-start", &payload) {
        eprintln!("Failed to emit ai-skill-start event: {}", e);
    }
}

/// Emit a skill_result event when a skill completes.
pub fn emit_skill_result(
    app: &AppHandle,
    session_id: &str,
    skill_name: &str,
    success: bool,
    error: &str,
) {
    let payload = SkillEventPayload {
        session_id: session_id.to_string(),
        skill_name: skill_name.to_string(),
        success,
        error: error.to_string(),
    };
    if let Err(e) = app.emit("ai-skill-result", &payload) {
        eprintln!("Failed to emit ai-skill-result event: {}", e);
    }
}

#[derive(Debug, Clone, Serialize)]
struct ToolEventPayload {
    session_id: String,
    tool_name: String,
    success: bool,
    error: String,
    data: serde_json::Value,
}

/// Emit a tool_call event when a tool is invoked.
pub fn emit_tool_call(
    app: &AppHandle,
    session_id: &str,
    tool_name: &str,
    arguments: &serde_json::Value,
) {
    let payload = ToolEventPayload {
        session_id: session_id.to_string(),
        tool_name: tool_name.to_string(),
        success: true,
        error: String::new(),
        data: arguments.clone(),
    };
    if let Err(e) = app.emit("ai-tool-call", &payload) {
        eprintln!("Failed to emit ai-tool-call event: {}", e);
    }
}

/// Emit a tool_result event when a tool completes.
pub fn emit_tool_result(
    app: &AppHandle,
    session_id: &str,
    tool_name: &str,
    success: bool,
    error: &str,
    data: &serde_json::Value,
) {
    let payload = ToolEventPayload {
        session_id: session_id.to_string(),
        tool_name: tool_name.to_string(),
        success,
        error: error.to_string(),
        data: data.clone(),
    };
    if let Err(e) = app.emit("ai-tool-result", &payload) {
        eprintln!("Failed to emit ai-tool-result event: {}", e);
    }
}

/// Emit an MCP call event when an external MCP tool is requested.
pub fn emit_mcp_call(
    app: &AppHandle,
    session_id: &str,
    tool_name: &str,
    arguments: &serde_json::Value,
) {
    let payload = ToolEventPayload {
        session_id: session_id.to_string(),
        tool_name: tool_name.to_string(),
        success: true,
        error: String::new(),
        data: arguments.clone(),
    };
    if let Err(e) = app.emit("ai-mcp-call", &payload) {
        eprintln!("Failed to emit ai-mcp-call event: {}", e);
    }
}

/// Emit an MCP result event when an external MCP tool completes or is denied.
pub fn emit_mcp_result(
    app: &AppHandle,
    session_id: &str,
    tool_name: &str,
    success: bool,
    error: &str,
    data: &serde_json::Value,
) {
    let payload = ToolEventPayload {
        session_id: session_id.to_string(),
        tool_name: tool_name.to_string(),
        success,
        error: error.to_string(),
        data: data.clone(),
    };
    if let Err(e) = app.emit("ai-mcp-result", &payload) {
        eprintln!("Failed to emit ai-mcp-result event: {}", e);
    }
}
