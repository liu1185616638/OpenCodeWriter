use crate::ai::events;
use crate::ai::runtime::types::{AiDeltaType, AiRequest, AiRuntime};
use crate::ai::session_registry::AiSessionRegistry;
use crate::db::{get_conn, DbState};
use futures::StreamExt;
use rusqlite::params;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager};
use tokio::time::{timeout, Duration};

/// Maximum time to wait for the entire generation to complete.
/// The SDK adapter is non-streaming (it collects the full response before
/// emitting), so this covers the full model inference time.
const GENERATION_TIMEOUT: Duration = Duration::from_secs(300);

/// Context for writing a generation_logs entry
pub struct GenerationLogContext {
    pub project_id: Option<i64>,
    pub target_type: String,
    pub target_id: Option<i64>,
    pub command: String,
    pub model_name: String,
    pub input_chars: usize,
    pub session_id: String,
    pub task_type: String,
}

/// Insert a "started" generation log entry, returns the log id (0 on failure or when project_id is None)
pub fn insert_generation_log(app: &AppHandle, ctx: &GenerationLogContext) -> i64 {
    let project_id = match ctx.project_id {
        Some(id) => id,
        None => return 0, // Skip logging for non-project operations (e.g. idea generation)
    };
    let state = app.state::<DbState>();
    let conn = match get_conn(&state) {
        Ok(c) => c,
        Err(_) => return 0,
    };
    let res = conn.execute(
        "INSERT INTO generation_logs (project_id, target_type, target_id, command, model_name, status, error, input_chars, output_chars, started_at, session_id, task_type) \
         VALUES (?1, ?2, ?3, ?4, ?5, 'started', '', ?6, 0, datetime('now'), ?7, ?8)",
        params![project_id, ctx.target_type, ctx.target_id, ctx.command, ctx.model_name, ctx.input_chars as i64, ctx.session_id, ctx.task_type],
    );
    if res.is_ok() { conn.last_insert_rowid() } else { 0 }
}

/// Update a generation log entry with final status (best-effort, errors ignored)
pub fn finish_generation_log(app: &AppHandle, log_id: i64, status: &str, error: &str, output_chars: usize) {
    if log_id <= 0 { return; }
    let state = app.state::<DbState>();
    let conn = match get_conn(&state) {
        Ok(c) => c,
        Err(_) => return,
    };
    let _ = conn.execute(
        "UPDATE generation_logs SET status = ?1, error = ?2, output_chars = ?3, ended_at = datetime('now') WHERE id = ?4 AND status = 'started'",
        params![status, error, output_chars as i64, log_id],
    );
}

/// Tag pairs to detect in content deltas.
const THINKING_TAG_PAIRS: &[(&str, &str)] = &[
    ("<thinking>", "</thinking>"),
    ("<think>", "</think>"),
];

/// Split a content delta into (text, chunk_type) pairs by detecting
/// `<thinking>`/`<think>` tags. Maintains `inside_thinking` state across
/// calls to handle tags that span delta boundaries.
///
/// Returns a vec of (text, "thinking"|"content") pairs. Empty strings are
/// not emitted.
pub fn split_thinking_tags(delta: &str, inside_thinking: &mut bool) -> Vec<(String, String)> {
    let mut results = Vec::new();
    let mut pos = 0;
    let len = delta.len();

    if *inside_thinking {
        // Look for any closing tag
        let mut found_close: Option<(usize, usize, &str)> = None; // (close_start, close_end, close_tag)
        for (_, close_tag) in THINKING_TAG_PAIRS {
            if let Some(idx) = delta.find(close_tag) {
                match found_close {
                    None => found_close = Some((idx, idx + close_tag.len(), *close_tag)),
                    Some((prev_idx, _, _)) if idx < prev_idx => {
                        found_close = Some((idx, idx + close_tag.len(), *close_tag))
                    }
                    _ => {}
                }
            }
        }

        match found_close {
            Some((close_start, close_end, _)) => {
                // Everything before close is thinking
                if close_start > 0 {
                    results.push((delta[..close_start].to_string(), "thinking".to_string()));
                }
                pos = close_end;
                *inside_thinking = false;
            }
            None => {
                // Still inside thinking — entire delta is thinking
                if !delta.is_empty() {
                    results.push((delta.to_string(), "thinking".to_string()));
                }
                return results;
            }
        }
    }

    // Outside thinking — scan for opening tags
    while pos < len {
        let remaining = &delta[pos..];

        // Find the earliest opening tag
        let mut found_open: Option<(usize, usize, usize, &str, &str)> = None;
        // (open_idx_in_remaining, open_end, open_tag_len, open_tag, close_tag)
        for (open_tag, close_tag) in THINKING_TAG_PAIRS {
            if let Some(idx) = remaining.find(open_tag) {
                let open_end = idx + open_tag.len();
                match found_open {
                    None => found_open = Some((idx, open_end, open_tag.len(), *open_tag, *close_tag)),
                    Some((prev_idx, _, _, _, _)) if idx < prev_idx => {
                        found_open = Some((idx, open_end, open_tag.len(), *open_tag, *close_tag))
                    }
                    _ => {}
                }
            }
        }

        match found_open {
            Some((open_idx, open_end, _, _, close_tag)) => {
                // Content before the opening tag
                if open_idx > 0 {
                    let content = remaining[..open_idx].to_string();
                    if !content.is_empty() {
                        results.push((content, "content".to_string()));
                    }
                }

                // Check if closing tag is in the same remaining text
                let after_open = &remaining[open_end..];
                if let Some(close_idx) = after_open.find(close_tag) {
                    // Complete thinking block within this delta
                    let thinking = after_open[..close_idx].to_string();
                    if !thinking.is_empty() {
                        results.push((thinking, "thinking".to_string()));
                    }
                    pos += open_end + close_idx + close_tag.len();
                    // inside_thinking stays false — continue scanning
                } else {
                    // Thinking continues into next delta
                    let thinking = after_open.to_string();
                    if !thinking.is_empty() {
                        results.push((thinking, "thinking".to_string()));
                    }
                    *inside_thinking = true;
                    break;
                }
            }
            None => {
                // No more opening tags — rest is content
                let content = remaining.to_string();
                if !content.is_empty() {
                    results.push((content, "content".to_string()));
                }
                break;
            }
        }
    }

    results
}

/// Strip <thinking>...</thinking> tags from content before JSON parsing.
/// Uses manual scan instead of regex crate to avoid adding a dependency.
pub fn strip_thinking_tags(content: &str) -> String {
    let mut result = String::new();
    let mut pos = 0;
    let open = "<thinking>";
    let close = "</thinking>";

    while let Some(start) = content[pos..].find(open) {
        // Content before the opening tag
        result.push_str(&content[pos..pos + start]);
        let after_open = pos + start + open.len();
        if let Some(end) = content[after_open..].find(close) {
            // Skip the thinking block entirely
            pos = after_open + end + close.len();
        } else {
            // Unclosed thinking tag — skip rest
            break;
        }
    }
    // Remaining content after all thinking blocks
    result.push_str(&content[pos..]);
    result.trim().to_string()
}

/// AiTaskService handles AI request execution through the Runtime abstraction.
///
/// In Phase 6, only `generate_outline` uses this service. Other commands
/// continue to use the legacy `stream_and_emit` path until Phase 7.
pub struct AiTaskService;

impl AiTaskService {
    /// Execute an AI request through the runtime, streaming chunks to the frontend.
    ///
    /// This replaces `stream_and_emit` for migrated commands. The runtime
    /// produces `AiDelta` events which are mapped to Tauri `ai-chunk` /
    /// `ai-done` / `ai-error` events, preserving frontend compatibility.
    pub async fn execute(
        app: &AppHandle,
        runtime: &dyn AiRuntime,
        request: AiRequest,
        session_id: &str,
        log_ctx: &GenerationLogContext,
    ) -> Result<String, String> {
        Self::execute_inner(app, runtime, request, session_id, log_ctx, true).await
    }

    pub async fn execute_without_done(
        app: &AppHandle,
        runtime: &dyn AiRuntime,
        request: AiRequest,
        session_id: &str,
        log_ctx: &GenerationLogContext,
    ) -> Result<String, String> {
        Self::execute_inner(app, runtime, request, session_id, log_ctx, false).await
    }

    async fn execute_inner(
        app: &AppHandle,
        runtime: &dyn AiRuntime,
        request: AiRequest,
        session_id: &str,
        log_ctx: &GenerationLogContext,
        emit_done: bool,
    ) -> Result<String, String> {
        let log_id = insert_generation_log(app, log_ctx);

        // Register session for cancellation support
        let registry = app.state::<AiSessionRegistry>();
        let cancel_flag = registry.register(session_id);

        let mut stream = runtime.run(request).await?;

        let mut full_content = String::new();
        let mut inside_thinking = false;

        loop {
            // Check cancellation before processing next delta
            if cancel_flag.load(Ordering::SeqCst) {
                finish_generation_log(app, log_id, "cancelled", "用户取消", full_content.len());
                // Don't emit ai-done; cancel_ai_session already emitted ai-error
                registry.unregister(session_id);
                return Err("cancelled".to_string());
            }

            let next_result = match timeout(GENERATION_TIMEOUT, stream.next()).await {
                Ok(Some(result)) => result,
                Ok(None) => break, // stream ended normally
                Err(_) => {
                    let msg = "生成超时（超过 5 分钟无响应），请检查模型配置或网络连接";
                    finish_generation_log(app, log_id, "timeout", msg, full_content.len());
                    events::emit_error(app, session_id, msg);
                    registry.unregister(session_id);
                    return Err(msg.to_string());
                }
            };

            match next_result {
                Ok(delta) => {
                    match delta.delta_type {
                        AiDeltaType::Content => {
                            // Split <thinking> tags from content deltas
                            let parts = split_thinking_tags(&delta.text, &mut inside_thinking);
                            for (text, chunk_type) in parts {
                                if chunk_type == "content" {
                                    full_content.push_str(&text);
                                }
                                events::emit_chunk(app, session_id, &text, &chunk_type);
                            }
                        }
                        AiDeltaType::Thinking | AiDeltaType::ThinkingSummary => {
                            events::emit_chunk(app, session_id, &delta.text, "thinking");
                        }
                        AiDeltaType::Error => {
                            finish_generation_log(
                                app,
                                log_id,
                                "failed",
                                &delta.text,
                                full_content.len(),
                            );
                            events::emit_error(app, session_id, &delta.text);
                            registry.unregister(session_id);
                            return Err(delta.text);
                        }
                        AiDeltaType::Done => {
                            break;
                        }
                        AiDeltaType::ToolCall => {
                            // Emit tool_call event for frontend visibility
                            events::emit_tool_call(
                                app,
                                session_id,
                                &delta.text,
                                &delta.payload,
                            );
                        }
                        AiDeltaType::ToolResult => {
                            let success = !delta.payload.is_null()
                                && delta.payload.get("success")
                                    .map(|v| v.as_bool().unwrap_or(true))
                                    .unwrap_or(true);
                            events::emit_tool_result(
                                app,
                                session_id,
                                &delta.text,
                                success,
                                "",
                                &delta.payload,
                            );
                        }
                        AiDeltaType::SkillStart => {
                            events::emit_skill_start(app, session_id, &delta.text);
                        }
                        AiDeltaType::SkillResult => {
                            let success = delta.payload.get("success")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(true);
                            let error = delta.payload.get("error")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            events::emit_skill_result(
                                app,
                                session_id,
                                &delta.text,
                                success,
                                error,
                            );
                        }
                        AiDeltaType::McpCall | AiDeltaType::McpResult => {
                            let success = delta.payload.get("success")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(matches!(delta.delta_type, AiDeltaType::McpCall));
                            let error = delta.payload.get("error")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            log_mcp_delta(app, session_id, &delta, success, error);
                            match delta.delta_type {
                                AiDeltaType::McpCall => {
                                    events::emit_mcp_call(
                                        app,
                                        session_id,
                                        &delta.text,
                                        &delta.payload,
                                    );
                                }
                                AiDeltaType::McpResult => {
                                    events::emit_mcp_result(
                                        app,
                                        session_id,
                                        &delta.text,
                                        success,
                                        error,
                                        &delta.payload,
                                    );
                                }
                                _ => {}
                            }
                        }
                    }
                }
                Err(e) => {
                    finish_generation_log(app, log_id, "failed", &e, full_content.len());
                    events::emit_error(app, session_id, &e);
                    registry.unregister(session_id);
                    return Err(e);
                }
            }
        }

        finish_generation_log(app, log_id, "success", "", full_content.len());
        registry.unregister(session_id);
        if emit_done {
            events::emit_done(app, session_id);
        }
        Ok(full_content)
    }
}

fn log_mcp_delta(
    app: &AppHandle,
    session_id: &str,
    delta: &crate::ai::runtime::types::AiDelta,
    success: bool,
    error: &str,
) {
    let state = app.state::<DbState>();
    let request = crate::ai::runtime::mcp::McpApprovalRequest {
        project_id: delta.payload.get("project_id").and_then(|v| v.as_i64()),
        session_id: session_id.to_string(),
        server_name: delta.payload.get("server_name")
            .and_then(|v| v.as_str())
            .unwrap_or("runtime")
            .to_string(),
        tool_name: delta.text.clone(),
        arguments: delta.payload.clone(),
    };
    let call_type = match delta.delta_type {
        AiDeltaType::McpCall => "mcp_call",
        AiDeltaType::McpResult => "mcp_result",
        _ => "mcp",
    };
    crate::ai::runtime::mcp::log_mcp_call(
        &state,
        &request,
        success,
        error,
        delta.payload.clone(),
        call_type,
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_thinking_tags_removes_complete_block() {
        let input = "<thinking>secret</thinking>visible content";
        assert_eq!(strip_thinking_tags(input), "visible content");
    }

    #[test]
    fn strip_thinking_tags_handles_no_tags() {
        assert_eq!(strip_thinking_tags("plain text"), "plain text");
    }

    #[test]
    fn split_thinking_tags_passes_plain_content() {
        let mut inside = false;
        let parts = split_thinking_tags("hello world", &mut inside);
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0].0, "hello world");
        assert_eq!(parts[0].1, "content");
        assert!(!inside);
    }

    #[test]
    fn split_thinking_tags_detects_complete_block() {
        let mut inside = false;
        let parts = split_thinking_tags("before<thinking>secret</thinking>after", &mut inside);
        assert_eq!(parts.len(), 3);
        assert_eq!(parts[0], ("before".to_string(), "content".to_string()));
        assert_eq!(parts[1], ("secret".to_string(), "thinking".to_string()));
        assert_eq!(parts[2], ("after".to_string(), "content".to_string()));
        assert!(!inside);
    }

    #[test]
    fn split_thinking_tags_handles_cross_boundary() {
        let mut inside = false;
        let parts1 = split_thinking_tags("text<thinking>partial", &mut inside);
        assert_eq!(parts1.len(), 2);
        assert_eq!(parts1[0], ("text".to_string(), "content".to_string()));
        assert_eq!(parts1[1], ("partial".to_string(), "thinking".to_string()));
        assert!(inside);

        let parts2 = split_thinking_tags("rest</thinking>end", &mut inside);
        assert_eq!(parts2.len(), 2);
        assert_eq!(parts2[0], ("rest".to_string(), "thinking".to_string()));
        assert_eq!(parts2[1], ("end".to_string(), "content".to_string()));
        assert!(!inside);
    }
}
