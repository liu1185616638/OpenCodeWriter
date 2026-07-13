use crate::ai::client::AiClient;
use crate::ai::runtime::types::{
    AiDelta, AiDeltaType, AiRequest, AiRuntime, AiSkillInfo, AiStream, AiToolInfo,
};
use crate::models::ModelPreset;
use futures::StreamExt;
use std::future::Future;
use std::pin::Pin;

/// Wraps the existing `AiClient` as an `AiRuntime` implementation.
///
/// This is the default fallback runtime. It preserves the exact same
/// streaming behavior as the original direct `AiClient` usage.
pub struct OpenAICompatibleRuntime {
    api_base: String,
    api_key: String,
    model_name: String,
}

impl OpenAICompatibleRuntime {
    pub fn from_preset(preset: &ModelPreset) -> Self {
        Self {
            api_base: preset.api_base.clone(),
            api_key: preset.api_key.clone(),
            model_name: preset.model_name.clone(),
        }
    }
}

impl AiRuntime for OpenAICompatibleRuntime {
    fn run(
        &self,
        request: AiRequest,
    ) -> Pin<Box<dyn Future<Output = Result<AiStream, String>> + Send + '_>> {
        let client = AiClient::new(
            self.api_base.clone(),
            self.api_key.clone(),
            self.model_name.clone(),
        );

        Box::pin(async move {
            let chunk_stream = client.stream_chat(request.messages);

            // Convert StreamChunk stream to AiDelta stream.
            // The original stream yields Result<StreamChunk, String>.
            // We map each chunk to an AiDelta, preserving chunk_type.
            let delta_stream = chunk_stream.map(|result| {
                result.map(|chunk| {
                    let delta_type = match chunk.chunk_type.as_str() {
                        "thinking" => AiDeltaType::Thinking,
                        _ => AiDeltaType::Content,
                    };
                    AiDelta {
                        delta_type,
                        text: chunk.text,
                        payload: serde_json::Value::Null,
                    }
                })
            });

            Ok(Box::pin(delta_stream) as AiStream)
        })
    }

    fn abort(
        &self,
        _task_id: &str,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + '_>> {
        // The current AiClient does not support abort by task ID.
        // Stream cancellation happens when the receiver is dropped.
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
