use crate::ai::runtime::openai_compatible::OpenAICompatibleRuntime;
use crate::ai::runtime::types::AiRuntime;
use crate::models::ModelPreset;

pub mod adapter_events;
pub mod manager;
pub mod mcp;
pub mod mock;
pub mod openai_compatible;
pub mod resilient;
pub mod sdk_backed;
pub mod types;

pub use manager::AiRuntimeManager;

/// Runtime type identifiers stored in settings.
pub const RUNTIME_OPENAI_COMPATIBLE: &str = "openai-compatible";
pub const RUNTIME_MOCK: &str = "mock";
pub const RUNTIME_SDK_BACKED: &str = "sdk-backed";

/// Create a runtime based on the configured type and model preset.
///
/// Falls back to `OpenAICompatibleRuntime` for unknown or unconfigured types.
pub fn create_runtime(
    runtime_type: &str,
    preset: &ModelPreset,
    config: &manager::RuntimeConfig,
) -> Box<dyn AiRuntime> {
    match runtime_type {
        RUNTIME_MOCK => Box::new(mock::MockRuntime::single("mock runtime content")),
        RUNTIME_SDK_BACKED => Box::new(sdk_backed::SdkBackedRuntime::from_config(preset, config)),
        _ => Box::new(OpenAICompatibleRuntime::from_preset(preset)),
    }
}
