use crate::ai::events;
use crate::ai::runtime::types::{AiDeltaType, AiRequest, AiRuntime};
use crate::ai::session_registry::{AiSessionRegistry, SessionCancellation};
use crate::db::{get_conn, DbState};
use futures::StreamExt;
use rusqlite::params;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::time::{timeout, Duration};

/// Maximum period without a Runtime result or stream item.
const GENERATION_TIMEOUT: Duration = Duration::from_secs(300);

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

pub fn insert_generation_log(app: &AppHandle, ctx: &GenerationLogContext) -> i64 {
    let project_id = match ctx.project_id {
        Some(id) => id,
        None => return 0,
    };
    let state = app.state::<DbState>();
    let conn = match get_conn(&state) {
        Ok(connection) => connection,
        Err(_) => return 0,
    };
    let result = conn.execute(
        "INSERT INTO generation_logs (project_id, target_type, target_id, command, model_name, status, error, input_chars, output_chars, started_at, session_id, task_type) \
         VALUES (?1, ?2, ?3, ?4, ?5, 'started', '', ?6, 0, datetime('now'), ?7, ?8)",
        params![
            project_id,
            ctx.target_type,
            ctx.target_id,
            ctx.command,
            ctx.model_name,
            ctx.input_chars as i64,
            ctx.session_id,
            ctx.task_type
        ],
    );
    if result.is_ok() {
        conn.last_insert_rowid()
    } else {
        0
    }
}

/// Terminal updates are conditional so cancelled rows can never be overwritten
/// by a late success or failure.
pub fn finish_generation_log(
    app: &AppHandle,
    log_id: i64,
    status: &str,
    error: &str,
    output_chars: usize,
) {
    if log_id <= 0 {
        return;
    }
    let state = app.state::<DbState>();
    let conn = match get_conn(&state) {
        Ok(connection) => connection,
        Err(_) => return,
    };
    let _ = conn.execute(
        "UPDATE generation_logs SET status = ?1, error = ?2, output_chars = ?3, ended_at = datetime('now') WHERE id = ?4 AND status = 'started'",
        params![status, error, output_chars as i64, log_id],
    );
}

const THINKING_TAG_PAIRS: &[(&str, &str)] = &[
    ("<thinking>", "</thinking>"),
    ("<think>", "</think>"),
];

pub fn split_thinking_tags(
    delta: &str,
    inside_thinking: &mut bool,
) -> Vec<(String, String)> {
    let mut results = Vec::new();
    let mut position = 0;
    let length = delta.len();

    if *inside_thinking {
        let mut found_close: Option<(usize, usize)> = None;
        for (_, close_tag) in THINKING_TAG_PAIRS {
            if let Some(index) = delta.find(close_tag) {
                match found_close {
                    None => found_close = Some((index, index + close_tag.len())),
                    Some((previous, _)) if index < previous => {
                        found_close = Some((index, index + close_tag.len()))
                    }
                    _ => {}
                }
            }
        }

        match found_close {
            Some((close_start, close_end)) => {
                if close_start > 0 {
                    results.push((
                        delta[..close_start].to_string(),
                        "thinking".to_string(),
                    ));
                }
                position = close_end;
                *inside_thinking = false;
            }
            None => {
                if !delta.is_empty() {
                    results.push((delta.to_string(), "thinking".to_string()));
                }
                return results;
            }
        }
    }

    while position < length {
        let remaining = &delta[position..];
        let mut found_open: Option<(usize, usize, &str)> = None;

        for (open_tag, close_tag) in THINKING_TAG_PAIRS {
            if let Some(index) = remaining.find(open_tag) {
                let open_end = index + open_tag.len();
                match found_open {
                    None => found_open = Some((index, open_end, *close_tag)),
                    Some((previous, _, _)) if index < previous => {
                        found_open = Some((index, open_end, *close_tag))
                    }
                    _ => {}
                }
            }
        }

        match found_open {
            Some((open_index, open_end, close_tag)) => {
                if open_index > 0 {
                    results.push((
                        remaining[..open_index].to_string(),
                        "content".to_string(),
                    ));
                }

                let after_open = &remaining[open_end..];
                if let Some(close_index) = after_open.find(close_tag) {
                    let thinking = &after_open[..close_index];
                    if !thinking.is_empty() {
                        results.push((thinking.to_string(), "thinking".to_string()));
                    }
                    position += open_end + close_index + close_tag.len();
                } else {
                    if !after_open.is_empty() {
                        results.push((after_open.to_string(), "thinking".to_string()));
                    }
                    *inside_thinking = true;
                    break;
                }
            }
            None => {
                if !remaining.is_empty() {
                    results.push((remaining.to_string(), "content".to_string()));
                }
                break;
            }
        }
    }

    results
}

pub fn strip_thinking_tags(content: &str) -> String {
    let mut result = String::new();
    let mut position = 0;
    let open = "<thinking>";
    let close = "</thinking>";

    while let Some(start) = content[position..].find(open) {
        result.push_str(&content[position..position + start]);
        let after_open = position + start + open.len();
        if let Some(end) = content[after_open..].find(close) {
            position = after_open + end + close.len();
        } else {
            break;
        }
    }

    result.push_str(&content[position..]);
    result.trim().to_string()
}

pub struct AiTaskService;

impl AiTaskService {
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
        let registry = app.state::<AiSessionRegistry>();
        let cancellation = registry.register(session_id);

        let stream_result = tokio::select! {
            _ = cancellation.cancelled() => {
                return finish_cancelled(
                    app,
                    &registry,
                    &cancellation,
                    session_id,
                    log_id,
                    0,
                );
            }
            result = timeout(GENERATION_TIMEOUT, runtime.run(request)) => result,
        };

        let mut stream = match stream_result {
            Ok(Ok(stream)) => stream,
            Ok(Err(error)) => {
                finish_generation_log(app, log_id, "failed", &error, 0);
                events::emit_error(app, session_id, &error);
                registry.unregister(session_id);
                return Err(error);
            }
            Err(_) => {
                let message = "生成启动超时（超过 5 分钟无响应），请检查模型配置或网络连接";
                finish_generation_log(app, log_id, "timeout", message, 0);
                events::emit_error(app, session_id, message);
                registry.unregister(session_id);
                return Err(message.to_string());
            }
        };

        let mut full_content = String::new();
        let mut inside_thinking = false;

        loop {
            let stream_result = tokio::select! {
                _ = cancellation.cancelled() => {
                    return finish_cancelled(
                        app,
                        &registry,
                        &cancellation,
                        session_id,
                        log_id,
                        full_content.len(),
                    );
                }
                result = timeout(GENERATION_TIMEOUT, stream.next()) => result,
            };

            let next_result = match stream_result {
                Ok(Some(result)) => result,
                Ok(None) => break,
                Err(_) => {
                    let message = "生成超时（超过 5 分钟无响应），请检查模型配置或网络连接";
                    finish_generation_log(
                        app,
                        log_id,
                        "timeout",
                        message,
                        full_content.len(),
                    );
                    events::emit_error(app, session_id, message);
                    registry.unregister(session_id);
                    return Err(message.to_string());
                }
            };

            match next_result {
                Ok(delta) => match delta.delta_type {
                    AiDeltaType::Content => {
                        for (text, chunk_type) in
                            split_thinking_tags(&delta.text, &mut inside_thinking)
                        {
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
                    AiDeltaType::Done => break,
                    AiDeltaType::ToolCall => {
                        events::emit_tool_call(
                            app,
                            session_id,
                            &delta.text,
                            &delta.payload,
                        );
                    }
                    AiDeltaType::ToolResult => {
                        let success = !delta.payload.is_null()
                            && delta
                                .payload
                                .get("success")
                                .map(|value| value.as_bool().unwrap_or(true))
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
                        let success = delta
                            .payload
                            .get("success")
                            .and_then(|value| value.as_bool())
                            .unwrap_or(true);
                        let error = delta
                            .payload
                            .get("error")
                            .and_then(|value| value.as_str())
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
                        let success = delta
                            .payload
                            .get("success")
                            .and_then(|value| value.as_bool())
                            .unwrap_or(matches!(delta.delta_type, AiDeltaType::McpCall));
                        let error = delta
                            .payload
                            .get("error")
                            .and_then(|value| value.as_str())
                            .unwrap_or("");
                        log_mcp_delta(app, session_id, &delta, success, error);

                        match delta.delta_type {
                            AiDeltaType::McpCall => events::emit_mcp_call(
                                app,
                                session_id,
                                &delta.text,
                                &delta.payload,
                            ),
                            AiDeltaType::McpResult => events::emit_mcp_result(
                                app,
                                session_id,
                                &delta.text,
                                success,
                                error,
                                &delta.payload,
                            ),
                            _ => {}
                        }
                    }
                },
                Err(error) => {
                    finish_generation_log(
                        app,
                        log_id,
                        "failed",
                        &error,
                        full_content.len(),
                    );
                    events::emit_error(app, session_id, &error);
                    registry.unregister(session_id);
                    return Err(error);
                }
            }
        }

        // Cancellation can race the stream's terminal item.
        if cancellation.is_cancelled() {
            return finish_cancelled(
                app,
                &registry,
                &cancellation,
                session_id,
                log_id,
                full_content.len(),
            );
        }

        finish_generation_log(app, log_id, "success", "", full_content.len());
        registry.unregister(session_id);
        if emit_done {
            events::emit_done(app, session_id);
        }
        Ok(full_content)
    }
}

fn finish_cancelled(
    app: &AppHandle,
    registry: &AiSessionRegistry,
    cancellation: &Arc<SessionCancellation>,
    session_id: &str,
    log_id: i64,
    output_chars: usize,
) -> Result<String, String> {
    if cancellation.is_cancelled() {
        finish_generation_log(
            app,
            log_id,
            "cancelled",
            "用户取消",
            output_chars,
        );
    }
    registry.unregister(session_id);
    Err("cancelled".to_string())
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
        project_id: delta.payload.get("project_id").and_then(|value| value.as_i64()),
        session_id: session_id.to_string(),
        server_name: delta
            .payload
            .get("server_name")
            .and_then(|value| value.as_str())
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
        let parts =
            split_thinking_tags("before<thinking>secret</thinking>after", &mut inside);
        assert_eq!(parts.len(), 3);
        assert_eq!(parts[0], ("before".to_string(), "content".to_string()));
        assert_eq!(parts[1], ("secret".to_string(), "thinking".to_string()));
        assert_eq!(parts[2], ("after".to_string(), "content".to_string()));
        assert!(!inside);
    }

    #[test]
    fn split_thinking_tags_handles_cross_boundary() {
        let mut inside = false;
        let first = split_thinking_tags("text<thinking>partial", &mut inside);
        assert_eq!(first.len(), 2);
        assert_eq!(first[0], ("text".to_string(), "content".to_string()));
        assert_eq!(first[1], ("partial".to_string(), "thinking".to_string()));
        assert!(inside);

        let second = split_thinking_tags("rest</thinking>end", &mut inside);
        assert_eq!(second.len(), 2);
        assert_eq!(second[0], ("rest".to_string(), "thinking".to_string()));
        assert_eq!(second[1], ("end".to_string(), "content".to_string()));
        assert!(!inside);
    }
}
