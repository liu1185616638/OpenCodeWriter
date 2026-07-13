use crate::ai::runtime::types::{AiRuntime, AiSkillInfo, AiToolInfo};
use crate::models::ModelPreset;
use std::future::Future;
use std::pin::Pin;

/// Runtime configuration loaded from settings.
#[derive(Debug, Clone)]
pub struct RuntimeConfig {
    pub default_runtime: String,
    pub fallback_runtime: String,
    pub sdk_adapter_command: String,
    pub sdk_adapter_args: String,
    pub thinking_policy: String,
    pub require_tool_approval: bool,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            default_runtime: crate::ai::runtime::RUNTIME_SDK_BACKED.to_string(),
            fallback_runtime: crate::ai::runtime::RUNTIME_OPENAI_COMPATIBLE.to_string(),
            sdk_adapter_command: "node".to_string(),
            sdk_adapter_args: String::new(),
            thinking_policy: "summary-only".to_string(),
            require_tool_approval: true,
        }
    }
}

/// Manages runtime selection and fallback.
///
/// In Phase 6 this is a lightweight helper — each command creates a runtime
/// via `create_runtime`. In later phases this can hold long-lived runtime
/// instances and handle fallback logic.
pub struct AiRuntimeManager;

impl AiRuntimeManager {
    /// Create the primary runtime for a task.
    pub fn create(config: &RuntimeConfig, preset: &ModelPreset) -> Box<dyn AiRuntime> {
        let primary = crate::ai::runtime::create_runtime(&config.default_runtime, preset, config);
        if config.default_runtime == config.fallback_runtime {
            return primary;
        }

        let fallback = crate::ai::runtime::create_runtime(&config.fallback_runtime, preset, config);
        Box::new(crate::ai::runtime::resilient::ResilientRuntime::new(
            primary,
            fallback,
        ))
    }

    /// Create the fallback runtime.
    pub fn create_fallback(config: &RuntimeConfig, preset: &ModelPreset) -> Box<dyn AiRuntime> {
        crate::ai::runtime::create_runtime(&config.fallback_runtime, preset, config)
    }
}

/// Placeholder for future runtime that delegates to a no-op implementation.
/// This exists so that the manager's public API is stable for later phases.
pub struct NoopRuntime;

impl AiRuntime for NoopRuntime {
    fn run(
        &self,
        _request: crate::ai::runtime::types::AiRequest,
    ) -> Pin<Box<dyn Future<Output = Result<crate::ai::runtime::types::AiStream, String>> + Send + '_>>
    {
        Box::pin(async { Err("NoopRuntime: no runtime configured".to_string()) })
    }

    fn abort(
        &self,
        _task_id: &str,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + '_>> {
        Box::pin(async { Ok(()) })
    }

    fn list_tools(
        &self,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<AiToolInfo>, String>> + Send + '_>> {
        Box::pin(async { Ok(Vec::new()) })
    }

    fn list_skills(
        &self,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<AiSkillInfo>, String>> + Send + '_>> {
        Box::pin(async { Ok(Vec::new()) })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_runtime_is_sdk_backed_with_openai_compatible_fallback() {
        let config = RuntimeConfig::default();
        assert_eq!(config.default_runtime, crate::ai::runtime::RUNTIME_SDK_BACKED);
        assert_eq!(
            config.fallback_runtime,
            crate::ai::runtime::RUNTIME_OPENAI_COMPATIBLE
        );
    }
}
