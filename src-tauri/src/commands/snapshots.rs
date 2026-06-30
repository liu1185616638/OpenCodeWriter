use crate::db::{DbState, get_conn};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct ContentSnapshot {
    pub id: i64,
    pub project_id: i64,
    pub target_type: String,
    pub target_id: Option<i64>,
    pub content: String,
    pub reason: String,
    pub created_at: String,
}

fn row_to_snapshot(row: &rusqlite::Row<'_>) -> rusqlite::Result<ContentSnapshot> {
    Ok(ContentSnapshot {
        id: row.get(0)?,
        project_id: row.get(1)?,
        target_type: row.get(2)?,
        target_id: row.get(3)?,
        content: row.get(4)?,
        reason: row.get(5)?,
        created_at: row.get(6)?,
    })
}

#[tauri::command]
pub fn create_snapshot(
    project_id: i64,
    target_type: String,
    target_id: Option<i64>,
    content: String,
    reason: String,
    state: State<'_, DbState>,
) -> Result<i64, String> {
    let conn = get_conn(&state)?;
    conn.execute(
        "INSERT INTO content_snapshots (project_id, target_type, target_id, content, reason) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![project_id, target_type, target_id, content, reason],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn list_snapshots(
    project_id: i64,
    target_type: String,
    target_id: Option<i64>,
    limit: Option<i64>,
    state: State<'_, DbState>,
) -> Result<Vec<ContentSnapshot>, String> {
    let conn = get_conn(&state)?;
    let limit_val = limit.unwrap_or(10);
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, target_type, target_id, content, reason, created_at \
             FROM content_snapshots \
             WHERE project_id = ?1 AND target_type = ?2 AND (target_id = ?3 OR ?3 IS NULL) \
             ORDER BY created_at DESC LIMIT ?4"
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id, target_type, target_id, limit_val], row_to_snapshot)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn delete_old_snapshots(
    project_id: i64,
    target_type: String,
    target_id: Option<i64>,
    keep: i64,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = get_conn(&state)?;
    conn.execute(
        "DELETE FROM content_snapshots WHERE id IN (
            SELECT id FROM content_snapshots \
            WHERE project_id = ?1 AND target_type = ?2 AND (target_id = ?3 OR ?3 IS NULL) \
            ORDER BY created_at DESC LIMIT -1 OFFSET ?4
        )",
        params![project_id, target_type, target_id, keep],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
