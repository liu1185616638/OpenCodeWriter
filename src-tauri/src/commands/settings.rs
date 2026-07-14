use rusqlite::{params, OptionalExtension};
use tauri::{AppHandle, State};
use serde::{Deserialize, Serialize};

use crate::db::{DbState, get_conn};
use crate::models::ModelPreset;

#[derive(Debug, Serialize)]
pub struct ModelInfo {
    id: String,
    owned_by: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ModelsResponse {
    data: Vec<ModelData>,
}

#[derive(Debug, Deserialize)]
struct ModelData {
    id: String,
    owned_by: Option<String>,
}

#[tauri::command]
pub async fn fetch_models(api_base: String, api_key: String) -> Result<Vec<ModelInfo>, String> {
    let url = format!("{}/models", api_base.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let mut request = client.get(&url);
    if !api_key.trim().is_empty() {
        request = request.header("Authorization", format!("Bearer {}", api_key));
    }
    let response = request
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API 返回错误 {} - {}", status, text));
    }

    let body: ModelsResponse = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    let models = body
        .data
        .into_iter()
        .map(|m| ModelInfo {
            id: m.id,
            owned_by: m.owned_by,
        })
        .collect();

    Ok(models)
}

#[tauri::command]
pub fn get_setting(key: String, state: State<'_, DbState>) -> Result<Option<String>, String> {
    let conn = get_conn(&state)?;
    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .map_err(|e| e.to_string())?;
    let result = stmt
        .query_row(params![key], |row| row.get::<_, String>(0))
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub fn set_setting(key: String, value: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_model_presets(state: State<'_, DbState>) -> Result<Vec<ModelPreset>, String> {
    let conn = get_conn(&state)?;
    let mut stmt = conn
        .prepare("SELECT id, name, api_base, api_key, model_name, created_at FROM model_presets")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ModelPreset {
                id: row.get(0)?,
                name: row.get(1)?,
                api_base: row.get(2)?,
                api_key: row.get(3)?,
                model_name: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_model_preset(
    name: String,
    api_base: String,
    api_key: String,
    model_name: String,
    state: State<'_, DbState>,
) -> Result<ModelPreset, String> {
    let conn = get_conn(&state)?;
    conn.execute(
        "INSERT INTO model_presets (name, api_base, api_key, model_name) VALUES (?1, ?2, ?3, ?4)",
        params![name, api_base, api_key, model_name],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let mut stmt = conn
        .prepare("SELECT id, name, api_base, api_key, model_name, created_at FROM model_presets WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    stmt.query_row(params![id], |row| {
        Ok(ModelPreset {
            id: row.get(0)?,
            name: row.get(1)?,
            api_base: row.get(2)?,
            api_key: row.get(3)?,
            model_name: row.get(4)?,
            created_at: row.get(5)?,
        })
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_model_preset(
    id: i64,
    name: Option<String>,
    api_base: Option<String>,
    api_key: Option<String>,
    model_name: Option<String>,
    state: State<'_, DbState>,
) -> Result<ModelPreset, String> {
    let conn = get_conn(&state)?;

    // Read existing row
    let mut stmt = conn
        .prepare("SELECT id, name, api_base, api_key, model_name, created_at FROM model_presets WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let existing = stmt
        .query_row(params![id], |row| {
            Ok(ModelPreset {
                id: row.get(0)?,
                name: row.get(1)?,
                api_base: row.get(2)?,
                api_key: row.get(3)?,
                model_name: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    // Merge: non-None fields override existing
    let name = name.unwrap_or(existing.name);
    let api_base = api_base.unwrap_or(existing.api_base);
    let api_key = api_key.unwrap_or(existing.api_key);
    let model_name = model_name.unwrap_or(existing.model_name);

    conn.execute(
        "UPDATE model_presets SET name = ?1, api_base = ?2, api_key = ?3, model_name = ?4 WHERE id = ?5",
        params![name, api_base, api_key, model_name, id],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, api_base, api_key, model_name, created_at FROM model_presets WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    stmt.query_row(params![id], |row| {
        Ok(ModelPreset {
            id: row.get(0)?,
            name: row.get(1)?,
            api_base: row.get(2)?,
            api_key: row.get(3)?,
            model_name: row.get(4)?,
            created_at: row.get(5)?,
        })
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_model_preset(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;
    conn.execute("DELETE FROM model_presets WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Load runtime configuration from settings table (helper for commands/ai.rs)
pub fn get_runtime_config(state: &State<'_, DbState>) -> crate::ai::runtime::manager::RuntimeConfig {
    let conn = match get_conn(state) {
        Ok(c) => c,
        Err(_) => return crate::ai::runtime::manager::RuntimeConfig::default(),
    };

    let get = |key: &str| -> Option<String> {
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .ok()
    };

    crate::ai::runtime::manager::RuntimeConfig {
        default_runtime: crate::ai::runtime::RUNTIME_SDK_BACKED.to_string(),
        fallback_runtime: crate::ai::runtime::RUNTIME_OPENAI_COMPATIBLE.to_string(),
        sdk_adapter_command: get("sdk_adapter_command")
            .unwrap_or_else(|| "node".to_string()),
        sdk_adapter_args: get("sdk_adapter_args")
            .unwrap_or_default(),
        thinking_policy: get("sdk_thinking_policy")
            .unwrap_or_else(|| "summary-only".to_string()),
        require_tool_approval: get("sdk_require_tool_approval")
            .map(|v| v == "true")
            .unwrap_or(true),
    }
}

/// Load runtime configuration from AppHandle (for commands that already dropped State)
pub fn get_runtime_config_from_app(app: &AppHandle) -> crate::ai::runtime::manager::RuntimeConfig {
    use tauri::Manager;
    let state = app.state::<crate::db::DbState>();
    get_runtime_config(&state)
}
