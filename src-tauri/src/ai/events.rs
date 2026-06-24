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
