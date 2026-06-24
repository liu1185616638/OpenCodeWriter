use rusqlite::params;
use tauri::State;

use crate::db::{DbState, get_conn};
use crate::models::*;

fn row_to_outline(row: &rusqlite::Row<'_>) -> rusqlite::Result<Outline> {
    Ok(Outline {
        id: row.get(0)?,
        project_id: row.get(1)?,
        content: row.get(2)?,
        status: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

#[tauri::command]
pub fn get_outline(project_id: i64, state: State<'_, DbState>) -> Result<Outline, String> {
    let conn = get_conn(&state)?;

    let mut stmt = conn
        .prepare("SELECT id, project_id, content, status, updated_at FROM outlines WHERE project_id = ?")
        .map_err(|e| e.to_string())?;

    let outline = stmt
        .query_row(params![project_id], row_to_outline)
        .map_err(|e| e.to_string())?;

    Ok(outline)
}

#[tauri::command]
pub fn save_outline(project_id: i64, content: String, state: State<'_, DbState>) -> Result<Outline, String> {
    let conn = get_conn(&state)?;

    // Check current status; if "empty", promote to "draft"
    let current_status: String = conn
        .query_row(
            "SELECT status FROM outlines WHERE project_id = ?",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let new_status = if current_status == "empty" {
        "draft"
    } else {
        &current_status
    };

    conn.execute(
        "UPDATE outlines SET content = ?, status = ?, updated_at = datetime('now') WHERE project_id = ?",
        params![content, new_status, project_id],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, project_id, content, status, updated_at FROM outlines WHERE project_id = ?")
        .map_err(|e| e.to_string())?;

    let outline = stmt
        .query_row(params![project_id], row_to_outline)
        .map_err(|e| e.to_string())?;

    Ok(outline)
}

#[tauri::command]
pub fn complete_outline(project_id: i64, state: State<'_, DbState>) -> Result<Outline, String> {
    let conn = get_conn(&state)?;

    conn.execute(
        "UPDATE outlines SET status = 'completed', updated_at = datetime('now') WHERE project_id = ?",
        params![project_id],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, project_id, content, status, updated_at FROM outlines WHERE project_id = ?")
        .map_err(|e| e.to_string())?;

    let outline = stmt
        .query_row(params![project_id], row_to_outline)
        .map_err(|e| e.to_string())?;

    Ok(outline)
}
