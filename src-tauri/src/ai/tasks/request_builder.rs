use crate::ai::client::ChatMessage;
use crate::ai::runtime::types::AiRequest;

/// Build an `AiRequest` from a task type and pre-built messages.
///
/// Context construction stays in business logic (commands/ai.rs via
/// `ContextBuilder`), but this helper ensures every command produces an
/// `AiRequest` with consistent defaults.
pub fn build_request(task_type: &str, messages: Vec<ChatMessage>) -> AiRequest {
    AiRequest::new(task_type, messages)
}
