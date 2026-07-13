use crate::ai::client::ChatMessage;
use futures::Stream;
use serde::{Deserialize, Serialize};
use std::pin::Pin;

/// A unified AI request that all runtime implementations must handle.
#[derive(Clone)]
pub struct AiRequest {
    pub task_type: String,
    pub messages: Vec<ChatMessage>,
    pub stream: bool,
    pub output_schema: Option<serde_json::Value>,
    pub tools: Vec<String>,
    pub skills: Vec<String>,
    pub mcp_servers: Vec<String>,
    pub thinking: ThinkingPolicy,
    pub permission_policy: PermissionPolicy,
    pub metadata: serde_json::Value,
}

impl AiRequest {
    pub fn new(task_type: impl Into<String>, messages: Vec<ChatMessage>) -> Self {
        Self {
            task_type: task_type.into(),
            messages,
            stream: true,
            output_schema: None,
            tools: Vec::new(),
            skills: Vec::new(),
            mcp_servers: Vec::new(),
            thinking: ThinkingPolicy::default(),
            permission_policy: PermissionPolicy::default(),
            metadata: serde_json::Value::Null,
        }
    }
}

/// Controls how reasoning/thinking content is handled.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ThinkingPolicy {
    /// Do not request thinking.
    Disabled,
    /// Only output thinking summaries.
    SummaryOnly,
    /// Full internal thinking, UI decides whether to display.
    FullInternal,
}

impl Default for ThinkingPolicy {
    fn default() -> Self {
        ThinkingPolicy::SummaryOnly
    }
}

/// Permission policy for runtime capabilities.
/// Defaults are safe: business tools allowed, everything else disabled.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionPolicy {
    pub allow_business_tools: bool,
    pub allow_mcp: bool,
    pub allow_file_read: bool,
    pub allow_file_write: bool,
    pub allow_shell: bool,
    pub require_user_approval: bool,
}

impl Default for PermissionPolicy {
    fn default() -> Self {
        Self {
            allow_business_tools: true,
            allow_mcp: false,
            allow_file_read: false,
            allow_file_write: false,
            allow_shell: false,
            require_user_approval: true,
        }
    }
}

/// Type of a streaming delta from the runtime.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AiDeltaType {
    /// Reasoning/thinking content delta.
    Thinking,
    /// Summarized thinking content.
    ThinkingSummary,
    /// Final output content delta.
    Content,
    /// Tool call initiated by the runtime.
    ToolCall,
    /// Tool call result returned to the runtime.
    ToolResult,
    /// Skill execution started.
    SkillStart,
    /// Skill execution completed.
    SkillResult,
    /// MCP tool call.
    McpCall,
    /// MCP tool result.
    McpResult,
    /// Error during generation.
    Error,
    /// Generation completed.
    Done,
}

/// A single streaming delta from the runtime.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiDelta {
    pub delta_type: AiDeltaType,
    pub text: String,
    pub payload: serde_json::Value,
}

impl AiDelta {
    pub fn content(text: impl Into<String>) -> Self {
        Self {
            delta_type: AiDeltaType::Content,
            text: text.into(),
            payload: serde_json::Value::Null,
        }
    }

    pub fn thinking(text: impl Into<String>) -> Self {
        Self {
            delta_type: AiDeltaType::Thinking,
            text: text.into(),
            payload: serde_json::Value::Null,
        }
    }

    pub fn error(text: impl Into<String>) -> Self {
        Self {
            delta_type: AiDeltaType::Error,
            text: text.into(),
            payload: serde_json::Value::Null,
        }
    }

    pub fn done() -> Self {
        Self {
            delta_type: AiDeltaType::Done,
            text: String::new(),
            payload: serde_json::Value::Null,
        }
    }
}

/// A boxed, pinned async stream of AI deltas.
pub type AiStream = Pin<Box<dyn Stream<Item = Result<AiDelta, String>> + Send>>;

/// Information about an available tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiToolInfo {
    pub name: String,
    pub description: String,
}

/// Information about an available skill.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSkillInfo {
    pub name: String,
    pub description: String,
}

/// The unified AI runtime trait.
///
/// All AI operations in OpenCodeWriter must go through this trait.
/// Implementations include `OpenAICompatibleRuntime` (fallback),
/// `MockRuntime` (testing), and future `SdkBackedRuntime`.
pub trait AiRuntime: Send + Sync {
    /// Execute an AI request and return a streaming response.
    fn run(
        &self,
        request: AiRequest,
    ) -> Pin<Box<dyn std::future::Future<Output = Result<AiStream, String>> + Send + '_>>;

    /// Abort an in-progress task by ID.
    fn abort(
        &self,
        task_id: &str,
    ) -> Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send + '_>>;

    /// List available tools registered with this runtime.
    fn list_tools(
        &self,
    ) -> Pin<Box<dyn std::future::Future<Output = Result<Vec<AiToolInfo>, String>> + Send + '_>>;

    /// List available skills registered with this runtime.
    fn list_skills(
        &self,
    ) -> Pin<Box<dyn std::future::Future<Output = Result<Vec<AiSkillInfo>, String>> + Send + '_>>;
}
