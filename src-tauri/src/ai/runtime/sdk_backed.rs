use crate::ai::runtime::adapter_events::parse_adapter_event_line;
use crate::ai::runtime::manager::RuntimeConfig;
use crate::ai::runtime::types::{
    AiRequest, AiRuntime, AiSkillInfo, AiStream, AiToolInfo,
};
use crate::models::ModelPreset;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

/// Runtime backed by the local Node SDK Adapter.
///
/// The adapter is a stdio sidecar. OpenCodeWriter keeps business decisions,
/// persistence, snapshots, and validation in Rust; the sidecar only bridges
/// `AiRequest` to `@opencode-ai/sdk`.
pub struct SdkBackedRuntime {
    preset: ModelPreset,
    adapter_command: String,
    adapter_args: String,
}

impl SdkBackedRuntime {
    pub fn from_config(preset: &ModelPreset, config: &RuntimeConfig) -> Self {
        Self {
            preset: preset.clone(),
            adapter_command: config.sdk_adapter_command.clone(),
            adapter_args: config.sdk_adapter_args.clone(),
        }
    }

    fn adapter_args(&self) -> Vec<String> {
        if self.adapter_args.trim().is_empty() {
            return default_adapter_args();
        }
        split_args(&self.adapter_args)
    }
}

impl AiRuntime for SdkBackedRuntime {
    fn run(
        &self,
        request: AiRequest,
    ) -> Pin<Box<dyn Future<Output = Result<AiStream, String>> + Send + '_>> {
        let command = self.adapter_command.clone();
        let args = self.adapter_args();
        let preset = self.preset.clone();

        Box::pin(async move {
            let mut child = Command::new(&command)
                .args(&args)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("Failed to start SDK adapter '{}': {}", command, e))?;

            let mut stdin = child
                .stdin
                .take()
                .ok_or_else(|| "SDK adapter stdin unavailable".to_string())?;
            let stdout = child
                .stdout
                .take()
                .ok_or_else(|| "SDK adapter stdout unavailable".to_string())?;

            if let Some(stderr) = child.stderr.take() {
                tokio::spawn(async move {
                    let mut lines = BufReader::new(stderr).lines();
                    while let Ok(Some(line)) = lines.next_line().await {
                        eprintln!("[sdk-adapter] {}", line);
                    }
                });
            }

            let message = serde_json::json!({
                "type": "run",
                "id": uuid::Uuid::new_v4().to_string(),
                "request": {
                    "task_type": request.task_type,
                    "messages": request.messages,
                    "stream": request.stream,
                    "output_schema": request.output_schema,
                    "tools": request.tools,
                    "skills": request.skills,
                    "mcp_servers": request.mcp_servers,
                    "thinking": request.thinking,
                    "permission_policy": request.permission_policy,
                    "metadata": request.metadata,
                },
                "preset": preset,
            });
            let line = serde_json::to_string(&message)
                .map_err(|e| format!("Failed to encode SDK adapter request: {}", e))?;

            tokio::spawn(async move {
                let _ = stdin.write_all(line.as_bytes()).await;
                let _ = stdin.write_all(b"\n").await;
                let _ = stdin.shutdown().await;
            });

            let (tx, rx) = mpsc::channel(32);
            tokio::spawn(async move {
                let mut lines = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if line.trim().is_empty() {
                        continue;
                    }

                    match parse_adapter_event_line(&line) {
                        Ok(delta) => {
                            let is_done = matches!(
                                delta.delta_type,
                                crate::ai::runtime::types::AiDeltaType::Done
                            );
                            if tx.send(Ok(delta)).await.is_err() {
                                return;
                            }
                            if is_done {
                                break;
                            }
                        }
                        Err(e) => {
                            let _ = tx.send(Err(e)).await;
                            break;
                        }
                    }
                }

                match child.wait().await {
                    Ok(status) if status.success() => {}
                    Ok(status) => {
                        let _ = tx
                            .send(Err(format!("SDK adapter exited with status {}", status)))
                            .await;
                    }
                    Err(e) => {
                        let _ = tx
                            .send(Err(format!("Failed to wait for SDK adapter: {}", e)))
                            .await;
                    }
                }
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

fn default_adapter_args() -> Vec<String> {
    let candidates = adapter_script_candidates();
    let script = candidates
        .into_iter()
        .find(|path| path.exists())
        .unwrap_or_else(|| PathBuf::from("sdk-adapter/dist/index.js"));
    vec![script.to_string_lossy().to_string(), "--stdio".to_string()]
}

fn adapter_script_candidates() -> Vec<PathBuf> {
    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    vec![
        current_dir.join("sdk-adapter").join("dist").join("index.js"),
        current_dir.join("..").join("sdk-adapter").join("dist").join("index.js"),
    ]
}

fn split_args(args: &str) -> Vec<String> {
    args.split_whitespace().map(|arg| arg.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_adapter_args_by_whitespace() {
        assert_eq!(
            split_args("--dir sdk-adapter start --stdio"),
            vec!["--dir", "sdk-adapter", "start", "--stdio"]
        );
    }
}
