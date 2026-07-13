use crate::ai::runtime::types::{AiDelta, AiDeltaType};

pub fn parse_adapter_event_line(line: &str) -> Result<AiDelta, String> {
    let value: serde_json::Value = serde_json::from_str(line)
        .map_err(|e| format!("Invalid SDK adapter event: {}", e))?;
    let event_type = value
        .get("type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "SDK adapter event missing type".to_string())?;
    let text = value
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let payload = value
        .get("payload")
        .cloned()
        .unwrap_or(serde_json::Value::Null);

    let delta_type = match event_type {
        "content" => AiDeltaType::Content,
        "thinking" => AiDeltaType::Thinking,
        "thinking_summary" => AiDeltaType::ThinkingSummary,
        "tool_call" => AiDeltaType::ToolCall,
        "tool_result" => AiDeltaType::ToolResult,
        "skill_start" => AiDeltaType::SkillStart,
        "skill_result" => AiDeltaType::SkillResult,
        "mcp_call" => AiDeltaType::McpCall,
        "mcp_result" => AiDeltaType::McpResult,
        "error" => AiDeltaType::Error,
        "done" => AiDeltaType::Done,
        other => return Err(format!("Unknown SDK adapter event type: {}", other)),
    };

    Ok(AiDelta {
        delta_type,
        text,
        payload,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_content_event() {
        let delta = parse_adapter_event_line(r#"{"type":"content","text":"hello"}"#).unwrap();
        assert!(matches!(delta.delta_type, AiDeltaType::Content));
        assert_eq!(delta.text, "hello");
    }

    #[test]
    fn parse_thinking_event() {
        let delta = parse_adapter_event_line(r#"{"type":"thinking","text":"plan"}"#).unwrap();
        assert!(matches!(delta.delta_type, AiDeltaType::Thinking));
        assert_eq!(delta.text, "plan");
    }

    #[test]
    fn reject_unknown_event() {
        let err = parse_adapter_event_line(r#"{"type":"unknown"}"#).unwrap_err();
        assert!(err.contains("Unknown SDK adapter event type"));
    }
}
