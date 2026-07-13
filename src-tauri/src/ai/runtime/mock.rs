use crate::ai::runtime::types::{
    AiDelta, AiRequest, AiRuntime, AiSkillInfo, AiStream, AiToolInfo,
};
use std::future::Future;
use std::pin::Pin;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

/// A mock runtime for unit testing without a real model.
///
/// Emits a configurable sequence of content deltas, then ends.
pub struct MockRuntime {
    chunks: Vec<String>,
}

impl MockRuntime {
    pub fn new(chunks: Vec<String>) -> Self {
        Self { chunks }
    }

    /// Create a mock that emits a single content string.
    pub fn single(content: impl Into<String>) -> Self {
        Self::new(vec![content.into()])
    }
}

impl AiRuntime for MockRuntime {
    fn run(
        &self,
        _request: AiRequest,
    ) -> Pin<Box<dyn Future<Output = Result<AiStream, String>> + Send + '_>> {
        let chunks = self.chunks.clone();
        Box::pin(async move {
            let (tx, rx) = mpsc::channel(32);
            tokio::spawn(async move {
                for chunk in chunks {
                    if tx.send(Ok(AiDelta::content(chunk))).await.is_err() {
                        return;
                    }
                }
                // tx drops here — stream ends naturally
            });
            Ok(Box::pin(ReceiverStream::new(rx)) as AiStream)
        })
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
    use crate::ai::client::ChatMessage;
    use futures::StreamExt;

    #[tokio::test]
    async fn mock_runtime_emits_chunks() {
        let runtime = MockRuntime::new(vec!["Hello ".to_string(), "world".to_string()]);
        let request = AiRequest::new("test", vec![ChatMessage {
            role: "user".to_string(),
            content: "hi".to_string(),
        }]);
        let mut stream = runtime.run(request).await.unwrap();
        let mut content = String::new();
        while let Some(delta) = stream.next().await {
            let delta = delta.unwrap();
            content.push_str(&delta.text);
        }
        assert_eq!(content, "Hello world");
    }
}
