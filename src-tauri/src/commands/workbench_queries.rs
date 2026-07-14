use rusqlite::params;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::db::{DbState, get_conn};

/// Aggregated project summary for the project library list.
/// One row per project, includes word count, chapter stats, stale count, failed jobs.
#[derive(Debug, Serialize)]
pub struct ProjectSummary {
    pub id: i64,
    pub name: String,
    pub current_stage: String,
    pub created_at: String,
    pub updated_at: String,
    /// Genre from project_profiles (empty if not set)
    pub genre: String,
    /// Total content word count across all chapters
    pub total_word_count: i64,
    /// Number of chapters with content
    pub completed_chapters: i64,
    /// Total number of chapters
    pub total_chapters: i64,
    /// Number of stale markers
    pub stale_count: i64,
    /// Number of failed jobs
    pub failed_job_count: i64,
    /// Whether an outline exists
    pub has_outline: bool,
    /// Whether any characters exist
    pub has_characters: bool,
}

/// List all projects with aggregated summary data.
/// Returns projects ordered by updated_at DESC (most recently edited first).
#[tauri::command]
pub fn list_project_summaries(state: State<'_, DbState>) -> Result<Vec<ProjectSummary>, String> {
    let conn = get_conn(&state)?;

    let mut stmt = conn.prepare(
        "SELECT
            p.id, p.name, p.current_stage, p.created_at, p.updated_at,
            COALESCE(pp.genre, '') as genre,
            COALESCE((
                SELECT SUM(LENGTH(c.content))
                FROM contents c
                WHERE c.project_id = p.id AND c.content IS NOT NULL
            ), 0) as total_word_count,
            COALESCE((
                SELECT COUNT(*)
                FROM contents c
                WHERE c.project_id = p.id AND c.content IS NOT NULL AND c.content != ''
            ), 0) as completed_chapters,
            COALESCE((
                SELECT COUNT(*)
                FROM chapters ch
                WHERE ch.project_id = p.id
            ), 0) as total_chapters,
            COALESCE((
                SELECT COUNT(*)
                FROM stale_markers sm
                WHERE sm.project_id = p.id
            ), 0) as stale_count,
            COALESCE((
                SELECT COUNT(*)
                FROM jobs j
                WHERE j.project_id = p.id AND j.status = 'failed'
            ), 0) as failed_job_count,
            COALESCE((
                SELECT o.status != 'empty'
                FROM outlines o
                WHERE o.project_id = p.id
            ), 0) as has_outline,
            COALESCE((
                SELECT COUNT(*) > 0
                FROM characters ch
                WHERE ch.project_id = p.id
            ), 0) as has_characters
        FROM projects p
        LEFT JOIN project_profiles pp ON pp.project_id = p.id
        ORDER BY p.updated_at DESC"
    ).map_err(|e| e.to_string())?;

    let summaries = stmt.query_map([], |row| {
        Ok(ProjectSummary {
            id: row.get(0)?,
            name: row.get(1)?,
            current_stage: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            genre: row.get(5)?,
            total_word_count: row.get(6)?,
            completed_chapters: row.get(7)?,
            total_chapters: row.get(8)?,
            stale_count: row.get(9)?,
            failed_job_count: row.get(10)?,
            has_outline: row.get::<_, i64>(11)? != 0,
            has_characters: row.get::<_, i64>(12)? != 0,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    Ok(summaries)
}

/// Test API connection without creating a preset.
/// Returns the model name on success, or an error message on failure.
#[tauri::command]
pub async fn test_model_connection(api_base: String, api_key: String, model_name: String) -> Result<String, String> {
    let url = format!("{}/chat/completions", api_base.trim_end_matches('/'));
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "model": model_name,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 5,
        "stream": false,
    });

    let mut request = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body);

    // Only send Authorization header when api_key is non-empty
    // (local providers like Ollama don't require it)
    if !api_key.trim().is_empty() {
        request = request.header("Authorization", format!("Bearer {}", api_key));
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("连接失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API 返回错误 {} - {}", status, text));
    }

    // Try to parse the response to confirm it's valid
    let resp_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    let returned_model = resp_json
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or(&model_name);

    Ok(returned_model.to_string())
}

/// Complete setup in a single transaction:
/// 1. Create/update model preset
/// 2. Set current_preset_id
/// 3. Set setup_complete = true
#[tauri::command]
pub fn complete_setup(
    name: String,
    api_base: String,
    api_key: String,
    model_name: String,
    state: State<'_, DbState>,
) -> Result<i64, String> {
    let mut conn = get_conn(&state)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Insert preset
    tx.execute(
        "INSERT INTO model_presets (name, api_base, api_key, model_name) VALUES (?1, ?2, ?3, ?4)",
        params![name, api_base, api_key, model_name],
    ).map_err(|e| e.to_string())?;
    let preset_id = tx.last_insert_rowid();

    // Set current preset
    tx.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('current_preset_id', ?1)",
        params![preset_id.to_string()],
    ).map_err(|e| e.to_string())?;

    // Mark setup complete
    tx.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('setup_complete', 'true')",
        [],
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(preset_id)
}

/// Update the project's updated_at timestamp to record when it was last opened.
#[tauri::command]
pub fn touch_project_opened(project_id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;
    conn.execute(
        "UPDATE projects SET updated_at = datetime('now') WHERE id = ?1",
        params![project_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Preview what content would become stale if the project profile is changed.
#[derive(Debug, Serialize)]
pub struct ProfileChangeImpact {
    /// Number of outlines that would be stale
    pub outline_stale: i64,
    /// Number of chapters that would be stale
    pub chapter_stale: i64,
    /// Number of content entries that would be stale
    pub content_stale: i64,
    /// Human-readable summary
    pub summary: String,
}

/// Preview the impact of changing a project's profile.
/// Returns counts of content that would become stale.
#[tauri::command]
pub fn preview_profile_change_impact(project_id: i64, state: State<'_, DbState>) -> Result<ProfileChangeImpact, String> {
    let conn = get_conn(&state)?;

    let has_outline: bool = conn
        .query_row(
            "SELECT status != 'empty' FROM outlines WHERE project_id = ?1",
            params![project_id],
            |row| row.get::<_, bool>(0),
        )
        .unwrap_or(false);

    let chapter_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM chapters WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let content_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM contents WHERE project_id = ?1 AND content IS NOT NULL AND content != ''",
            params![project_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let outline_stale = if has_outline { 1 } else { 0 };
    let chapter_stale = chapter_count;
    let content_stale = content_count;

    let parts: Vec<String> = {
        let mut v = Vec::new();
        if outline_stale > 0 { v.push(format!("大纲 ×{}", outline_stale)); }
        if chapter_stale > 0 { v.push(format!("章节 ×{}", chapter_stale)); }
        if content_stale > 0 { v.push(format!("正文 ×{}", content_stale)); }
        v
    };

    let summary = if parts.is_empty() {
        "无下游内容受影响".to_string()
    } else {
        format!("以下内容可能过时：{}", parts.join("、"))
    };

    Ok(ProfileChangeImpact {
        outline_stale,
        chapter_stale,
        content_stale,
        summary,
    })
}

/// Returns the app data directory path.
#[tauri::command]
pub fn get_app_data_dir(app: AppHandle) -> Result<String, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(app_dir.to_string_lossy().to_string())
}
