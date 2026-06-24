use futures::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::pin::Pin;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
}

/// A single chunk from the SSE stream, classified by type.
/// This mirrors opencode's lifecycle model where reasoning and text
/// are distinct event streams.
#[derive(Debug, Clone, Serialize)]
pub struct StreamChunk {
    /// "thinking" for reasoning/thinking content, "content" for final output
    pub chunk_type: String,
    /// The text delta
    pub text: String,
}

/// Extract content from a parsed SSE JSON value.
/// Returns (thinking_delta, content_delta) — both can be Some simultaneously.
/// Handles: standard OpenAI, GLM (reces), and reasoning_content (DeepSeek/GLM-4).
fn extract_deltas(value: &serde_json::Value) -> (Option<String>, Option<String>) {
    let choices = match value.get("choices").and_then(|c| c.get(0)) {
        Some(c) => c,
        None => return (None, None),
    };
    let delta = choices.get("delta");
    let mut thinking: Option<String> = None;
    let mut content: Option<String> = None;

    let extract_str = |v: &serde_json::Value| -> Option<String> {
        match v {
            serde_json::Value::String(s) if !s.is_empty() => Some(s.clone()),
            // Some models send reasoning_content as a non-string (null, object, etc.)
            // — treat as empty and skip.
            _ => None,
        }
    };

    if let Some(d) = delta {
        // Log the delta structure for the first few chunks to diagnose format issues
        eprintln!("[extract_deltas] delta keys: {:?}", d.as_object().map(|o| o.keys().collect::<Vec<_>>()).unwrap_or_default());

        // 1. reasoning_content field (DeepSeek, GLM-4, OpenAI o-series)
        if let Some(rc) = d.get("reasoning_content") {
            // Log the raw type for diagnosis
            eprintln!("[extract_deltas] reasoning_content type={}", match rc {
                serde_json::Value::String(s) => format!("string({} chars)", s.len()),
                serde_json::Value::Null => "null".to_string(),
                other => format!("{:?}", other),
            });
        }
        if let Some(rc) = d.get("reasoning_content").and_then(&extract_str) {
            thinking = Some(rc);
        }

        // 2. Standard OpenAI: choices[0].delta.content
        //    Important: do NOT early-return — a single delta may contain both
        //    reasoning_content and content (transition frame).
        if let Some(c) = d.get("content").and_then(&extract_str) {
            content = Some(c);
        }

        // 3. GLM variant: choices[0].delta.reces[].delta.content
        if let Some(reces) = d.get("reces").and_then(|r| r.as_array()) {
            for rec in reces {
                if let Some(rc) = rec.get("delta").and_then(|d| d.get("reasoning_content")).and_then(&extract_str) {
                    thinking = Some(rc);
                }
                if let Some(c) = rec.get("delta").and_then(|d| d.get("content")).and_then(&extract_str) {
                    content = Some(c);
                }
            }
        }
    }

    (thinking, content)
}

pub struct AiClient {
    api_base: String,
    api_key: String,
    model_name: String,
    client: Client,
}

impl AiClient {
    pub fn new(api_base: String, api_key: String, model_name: String) -> Self {
        Self {
            api_base,
            api_key,
            model_name,
            client: Client::new(),
        }
    }

    pub fn stream_chat(
        &self,
        messages: Vec<ChatMessage>,
    ) -> Pin<Box<dyn Stream<Item = Result<StreamChunk, String>> + Send>> {
        let url = format!("{}/chat/completions", self.api_base.trim_end_matches('/'));
        let api_key = self.api_key.clone();
        let body = ChatRequest {
            model: self.model_name.clone(),
            messages,
            stream: true,
        };
        let client = self.client.clone();

        let (tx, rx) = mpsc::channel(32);

        tokio::spawn(async move {
            let response = client
                .post(&url)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await;

            let mut response = match response {
                Ok(r) => r,
                Err(e) => {
                    let _ = tx.send(Err(format!("请求失败: {}", e))).await;
                    return;
                }
            };

            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                let _ = tx.send(Err(format!("API 返回错误 {} - {}", status, text))).await;
                return;
            }

            let mut buffer = String::new();
            let mut stream_ended = false;

            while let Some(chunk) = response.chunk().await.unwrap_or(None) {
                let text = match std::str::from_utf8(&chunk) {
                    Ok(t) => t,
                    Err(_) => continue,
                };

                buffer.push_str(text);

                // Process complete lines from buffer.
                while let Some(pos) = buffer.find('\n') {
                    let line = buffer[..pos].trim().to_string();
                    buffer = buffer[pos + 1..].to_string();

                    if line.is_empty() {
                        continue;
                    }

                    if line == "data: [DONE]" {
                        stream_ended = true;
                        break;
                    }

                    if let Some(data) = line.strip_prefix("data: ") {
                        let value: Result<serde_json::Value, _> = serde_json::from_str(data);
                        match value {
                            Ok(v) => {
                                let (thinking, content) = extract_deltas(&v);
                                if let Some(text) = thinking {
                                    if tx.send(Ok(StreamChunk {
                                        chunk_type: "thinking".to_string(),
                                        text,
                                    })).await.is_err() {
                                        return;
                                    }
                                }
                                if let Some(text) = content {
                                    if tx.send(Ok(StreamChunk {
                                        chunk_type: "content".to_string(),
                                        text,
                                    })).await.is_err() {
                                        return;
                                    }
                                }
                            }
                            Err(_) => {
                                // JSON parse failed — partial SSE or malformed line.
                            }
                        }
                    }
                }

                if stream_ended {
                    break;
                }
            }

            // Process any remaining data in buffer after stream ends.
            // Some APIs send "data: [DONE]" without a trailing newline,
            // so it stays in the buffer and never gets processed above.
            let remaining = buffer.trim();
            if remaining == "data: [DONE]" {
                stream_ended = true;
            } else if remaining.starts_with("data: ") {
                // Last SSE line without newline — try to parse it
                let data = remaining.strip_prefix("data: ").unwrap();
                if data.trim() != "[DONE]" {
                    let value: Result<serde_json::Value, _> = serde_json::from_str(data);
                    if let Ok(v) = value {
                        let (thinking, content) = extract_deltas(&v);
                        if let Some(text) = thinking {
                            let _ = tx.send(Ok(StreamChunk {
                                chunk_type: "thinking".to_string(),
                                text,
                            })).await;
                        }
                        if let Some(text) = content {
                            let _ = tx.send(Ok(StreamChunk {
                                chunk_type: "content".to_string(),
                                text,
                            })).await;
                        }
                    }
                }
            }
            // tx drops here — ReceiverStream will yield None, stream_and_emit
            // loop exits, and emit_done fires.
        });

        Box::pin(ReceiverStream::new(rx))
    }
}
