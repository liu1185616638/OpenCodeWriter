use crate::ai::session_registry::AiSessionRegistry;
use crate::db::{DbState, get_conn};
use crate::models::Job;
use rusqlite::params;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

fn row_to_job(row: &rusqlite::Row<'_>) -> rusqlite::Result<Job> {
    Ok(Job {
        id: row.get(0)?,
        project_id: row.get(1)?,
        job_type: row.get(2)?,
        status: row.get(3)?,
        payload_json: row.get(4)?,
        result_json: row.get(5)?,
        error: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

const JOB_COLS: &str =
    "id, project_id, job_type, status, payload_json, result_json, error, created_at, updated_at";

fn chapter_count(json: &str, key: &str) -> i64 {
    serde_json::from_str::<Value>(json)
        .ok()
        .and_then(|value| value.get(key).and_then(Value::as_array).map(|items| items.len() as i64))
        .unwrap_or(0)
}

#[tauri::command]
pub fn list_jobs(
    project_id: i64,
    limit: Option<i64>,
    state: State<'_, DbState>,
) -> Result<Vec<Job>, String> {
    let conn = get_conn(&state)?;
    let limit_val = limit.unwrap_or(50).clamp(1, 200);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} FROM jobs WHERE project_id = ?1 ORDER BY created_at DESC LIMIT ?2",
            JOB_COLS
        ))
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![project_id, limit_val], row_to_job)
        .map_err(|error| error.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|error| error.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_job(
    project_id: i64,
    job_type: String,
    payload_json: String,
    state: State<'_, DbState>,
) -> Result<Job, String> {
    let conn = get_conn(&state)?;
    let progress_total = chapter_count(&payload_json, "chapter_ids");
    conn.execute(
        "INSERT INTO jobs (project_id, job_type, status, payload_json, progress_current, progress_total, cancel_requested) \
         VALUES (?1, ?2, 'pending', ?3, 0, ?4, 0)",
        params![project_id, job_type, payload_json, progress_total],
    )
    .map_err(|error| error.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        &format!("SELECT {} FROM jobs WHERE id = ?1", JOB_COLS),
        params![id],
        row_to_job,
    )
    .map_err(|error| error.to_string())
}

/// Update status while preserving a previously requested cancellation.
/// Existing batch code writes its completed chapter list into result_json;
/// this command derives the real progress columns from that payload so the
/// task center no longer depends on parsing result_json in the UI.
#[tauri::command]
pub fn update_job_status(
    id: i64,
    status: String,
    result_json: Option<String>,
    error: Option<String>,
    state: State<'_, DbState>,
) -> Result<Job, String> {
    let conn = get_conn(&state)?;

    if let Some(result) = result_json {
        let completed = chapter_count(&result, "completed_chapters");
        let total = chapter_count(&result, "chapter_ids");
        conn.execute(
            "UPDATE jobs SET \
               status = ?1, \
               result_json = ?2, \
               progress_current = MAX(progress_current, ?3), \
               progress_total = CASE WHEN ?4 > 0 THEN ?4 ELSE progress_total END, \
               updated_at = datetime('now') \
             WHERE id = ?5 AND status <> 'cancelled'",
            params![status, result, completed, total, id],
        )
        .map_err(|cause| cause.to_string())?;
    } else if let Some(message) = error {
        conn.execute(
            "UPDATE jobs SET status = ?1, error = ?2, updated_at = datetime('now') \
             WHERE id = ?3 AND status <> 'cancelled'",
            params![status, message, id],
        )
        .map_err(|cause| cause.to_string())?;
    } else if status == "completed" {
        conn.execute(
            "UPDATE jobs SET status = 'completed', progress_current = progress_total, updated_at = datetime('now') \
             WHERE id = ?1 AND status <> 'cancelled'",
            params![id],
        )
        .map_err(|cause| cause.to_string())?;
    } else {
        conn.execute(
            "UPDATE jobs SET status = ?1, updated_at = datetime('now') \
             WHERE id = ?2 AND status <> 'cancelled'",
            params![status, id],
        )
        .map_err(|cause| cause.to_string())?;
    }

    conn.query_row(
        &format!("SELECT {} FROM jobs WHERE id = ?1", JOB_COLS),
        params![id],
        row_to_job,
    )
    .map_err(|cause| cause.to_string())
}

/// Request cancellation for a batch job and wake its currently active child
/// AI session. Future chapter sessions are rejected by AiTaskService after it
/// observes cancel_requested/status in the jobs table.
#[tauri::command]
pub fn cancel_job(
    id: i64,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = get_conn(&state)?;
    let affected = conn
        .execute(
            "UPDATE jobs SET \
               cancel_requested = 1, \
               status = 'cancelled', \
               error = '用户取消', \
               updated_at = datetime('now') \
             WHERE id = ?1 AND status IN ('pending', 'running')",
            params![id],
        )
        .map_err(|cause| cause.to_string())?;

    if affected == 0 {
        return Err("任务不存在，或已经进入终态".to_string());
    }

    let registry = app.state::<AiSessionRegistry>();
    registry.cancel_batch_job(id);
    Ok(())
}

#[tauri::command]
pub fn delete_job(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;
    conn.execute("DELETE FROM jobs WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}
