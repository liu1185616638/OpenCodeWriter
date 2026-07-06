use crate::db::{DbState, get_conn};
use crate::models::Job;
use rusqlite::params;
use tauri::State;

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

const JOB_COLS: &str = "id, project_id, job_type, status, payload_json, result_json, error, created_at, updated_at";

#[tauri::command]
pub fn list_jobs(project_id: i64, limit: Option<i64>, state: State<'_, DbState>) -> Result<Vec<Job>, String> {
    let conn = get_conn(&state)?;
    let limit_val = limit.unwrap_or(50);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} FROM jobs WHERE project_id = ?1 ORDER BY created_at DESC LIMIT ?2",
            JOB_COLS
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![project_id, limit_val], row_to_job).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
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
    conn.execute(
        "INSERT INTO jobs (project_id, job_type, status, payload_json) \
         VALUES (?1, ?2, 'pending', ?3)",
        params![project_id, job_type, payload_json],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        &format!("SELECT {} FROM jobs WHERE id = ?1", JOB_COLS),
        params![id],
        row_to_job,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_job_status(
    id: i64,
    status: String,
    result_json: Option<String>,
    error: Option<String>,
    state: State<'_, DbState>,
) -> Result<Job, String> {
    let conn = get_conn(&state)?;

    if let Some(rj) = result_json {
        conn.execute(
            "UPDATE jobs SET status = ?1, result_json = ?2, updated_at = datetime('now') WHERE id = ?3",
            params![status, rj, id],
        )
        .map_err(|e| e.to_string())?;
    } else if let Some(err) = error {
        conn.execute(
            "UPDATE jobs SET status = ?1, error = ?2, updated_at = datetime('now') WHERE id = ?3",
            params![status, err, id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE jobs SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![status, id],
        )
        .map_err(|e| e.to_string())?;
    }

    conn.query_row(
        &format!("SELECT {} FROM jobs WHERE id = ?1", JOB_COLS),
        params![id],
        row_to_job,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_job(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;
    conn.execute("DELETE FROM jobs WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
