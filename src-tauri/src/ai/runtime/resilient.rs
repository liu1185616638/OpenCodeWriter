use crate::ai::runtime::types::{
    AiDeltaType, AiRequest, AiRuntime, AiSkillInfo, AiStream, AiToolInfo,
};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

/// Internal runtime wrapper that falls back only before any visible delta is emitted.
pub struct ResilientRuntime {
    primary: Arc<dyn AiRuntime>,
    fallback: Arc<dyn AiRuntime>,
}

impl ResilientRuntime {
    pub fn new(primary: Box<dyn AiRuntime>, fallback: Box<dyn AiRuntime>) -> Self {
        Self {
            primary: Arc::from(primary),
            fallback: Arc::from(fallback),
        }
    }
}

impl AiRuntime for ResilientRuntime {
    fn run(
        &self,
        request: AiRequest,
    ) -> Pin<Box<dyn Future<Output = Result<AiStream, String>> + Send + '_>> {
        let primary = Arc::clone(&self.primary);
        let fallback = Arc::clone(&self.fallback);
        Box::pin(async move {
            let primary_stream = primary.run(request.clone()).await;
            let (tx, rx) = mpsc::channel(32);

            match primary_stream {
                Ok(mut stream) => {
                    tokio::spawn(async move {
                        let mut emitted_any_delta = false;

                        while let Some(result) = futures::StreamExt::next(&mut stream).await {
                            match result {
                                Ok(delta) => {
                                    if matches!(delta.delta_type, AiDeltaType::Error)
                                        && !emitted_any_delta
                                    {
                                        send_runtime_stream(fallback, request, tx).await;
                                        return;
                                    }

                                    emitted_any_delta = true;
                                    let is_done = matches!(delta.delta_type, AiDeltaType::Done);
                                    if tx.send(Ok(delta)).await.is_err() {
                                        return;
                                    }
                                    if is_done {
                                        return;
                                    }
                                }
                                Err(e) => {
                                    if emitted_any_delta {
                                        let _ = tx.send(Err(e)).await;
                                    } else {
                                        send_runtime_stream(fallback, request, tx).await;
                                    }
                                    return;
                                }
                            }
                        }
                    });
                    Ok(Box::pin(ReceiverStream::new(rx)) as AiStream)
                }
                Err(_) => fallback.run(request).await,
            }
        })
    }

    fn abort(
        &self,
        task_id: &str,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + '_>> {
        let task_id = task_id.to_string();
        Box::pin(async move {
            let primary_result = self.primary.abort(&task_id).await;
            let fallback_result = self.fallback.abort(&task_id).await;
            primary_result.and(fallback_result)
        })
    }

    fn list_tools(
        &self,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<AiToolInfo>, String>> + Send + '_>> {
        Box::pin(async move { self.primary.list_tools().await })
    }

    fn list_skills(
        &self,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<AiSkillInfo>, String>> + Send + '_>> {
        Box::pin(async move { self.primary.list_skills().await })
    }
}

async fn send_runtime_stream(
    runtime: Arc<dyn AiRuntime>,
    request: AiRequest,
    tx: mpsc::Sender<Result<crate::ai::runtime::types::AiDelta, String>>,
) {
    match runtime.run(request).await {
        Ok(mut stream) => {
            while let Some(result) = futures::StreamExt::next(&mut stream).await {
                let is_done = result
                    .as_ref()
                    .ok()
                    .map(|delta| matches!(delta.delta_type, AiDeltaType::Done))
                    .unwrap_or(false);
                if tx.send(result).await.is_err() {
                    return;
                }
                if is_done {
                    return;
                }
            }
        }
        Err(e) => {
            let _ = tx.send(Err(e)).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::client::ChatMessage;
    use crate::ai::runtime::types::AiDelta;
    use futures::StreamExt;
    use tokio_stream::wrappers::ReceiverStream;

    struct FailingRunRuntime;

    impl AiRuntime for FailingRunRuntime {
        fn run(
            &self,
            _request: AiRequest,
        ) -> Pin<Box<dyn Future<Output = Result<AiStream, String>> + Send + '_>> {
            Box::pin(async { Err("primary unavailable".to_string()) })
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

    struct FirstEventErrorRuntime;

    impl AiRuntime for FirstEventErrorRuntime {
        fn run(
            &self,
            _request: AiRequest,
        ) -> Pin<Box<dyn Future<Output = Result<AiStream, String>> + Send + '_>> {
            Box::pin(async {
                let (tx, rx) = tokio::sync::mpsc::channel(1);
                tokio::spawn(async move {
                    let _ = tx.send(Ok(AiDelta::error("adapter error"))).await;
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

    #[tokio::test]
    async fn falls_back_when_primary_run_fails() {
        let runtime = ResilientRuntime::new(
            Box::new(FailingRunRuntime),
            Box::new(crate::ai::runtime::mock::MockRuntime::single("fallback")),
        );
        let request = AiRequest::new("test", vec![ChatMessage {
            role: "user".to_string(),
            content: "hi".to_string(),
        }]);

        let mut stream = runtime.run(request).await.unwrap();
        let mut content = String::new();
        while let Some(delta) = stream.next().await {
            content.push_str(&delta.unwrap().text);
        }

        assert_eq!(content, "fallback");
    }

    #[tokio::test]
    async fn falls_back_when_primary_first_event_is_error() {
        let runtime = ResilientRuntime::new(
            Box::new(FirstEventErrorRuntime),
            Box::new(crate::ai::runtime::mock::MockRuntime::single("fallback")),
        );
        let request = AiRequest::new("test", vec![ChatMessage {
            role: "user".to_string(),
            content: "hi".to_string(),
        }]);

        let mut stream = runtime.run(request).await.unwrap();
        let mut content = String::new();
        while let Some(delta) = stream.next().await {
            content.push_str(&delta.unwrap().text);
        }

        assert_eq!(content, "fallback");
    }
}
