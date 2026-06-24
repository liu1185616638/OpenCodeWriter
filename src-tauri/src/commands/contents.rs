use rusqlite::{params, OptionalExtension};
use tauri::State;

use crate::db::{DbState, get_conn};
use crate::models::Content;

#[tauri::command]
pub fn get_content(chapter_id: i64, state: State<'_, DbState>) -> Result<Option<Content>, String> {
    let conn = get_conn(&state)?;
    let mut stmt = conn
        .prepare("SELECT id, project_id, chapter_id, content, stale, updated_at FROM contents WHERE chapter_id = ?1")
        .map_err(|e| e.to_string())?;
    let result = stmt
        .query_row(params![chapter_id], |row| {
            Ok(Content {
                id: row.get(0)?,
                project_id: row.get(1)?,
                chapter_id: row.get(2)?,
                content: row.get(3)?,
                stale: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub fn save_content(
    project_id: i64,
    chapter_id: i64,
    content: String,
    state: State<'_, DbState>,
) -> Result<Content, String> {
    let conn = get_conn(&state)?;

    let existing: Option<Content> = {
        let mut stmt = conn
            .prepare("SELECT id, project_id, chapter_id, content, stale, updated_at FROM contents WHERE chapter_id = ?1")
            .map_err(|e| e.to_string())?;
        stmt.query_row(params![chapter_id], |row| {
            Ok(Content {
                id: row.get(0)?,
                project_id: row.get(1)?,
                chapter_id: row.get(2)?,
                content: row.get(3)?,
                stale: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .optional()
        .map_err(|e| e.to_string())?
    };

    match existing {
        Some(c) => {
            conn.execute(
                "UPDATE contents SET content = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![content, c.id],
            )
            .map_err(|e| e.to_string())?;
            let mut stmt = conn
                .prepare("SELECT id, project_id, chapter_id, content, stale, updated_at FROM contents WHERE id = ?1")
                .map_err(|e| e.to_string())?;
            stmt.query_row(params![c.id], |row| {
                Ok(Content {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    chapter_id: row.get(2)?,
                    content: row.get(3)?,
                    stale: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())
        }
        None => {
            conn.execute(
                "INSERT INTO contents (project_id, chapter_id, content, stale, updated_at) VALUES (?1, ?2, ?3, 0, datetime('now'))",
                params![project_id, chapter_id, content],
            )
            .map_err(|e| e.to_string())?;
            let id = conn.last_insert_rowid();
            let mut stmt = conn
                .prepare("SELECT id, project_id, chapter_id, content, stale, updated_at FROM contents WHERE id = ?1")
                .map_err(|e| e.to_string())?;
            stmt.query_row(params![id], |row| {
                Ok(Content {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    chapter_id: row.get(2)?,
                    content: row.get(3)?,
                    stale: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())
        }
    }
}

#[tauri::command]
pub fn mark_content_stale(chapter_id: i64, stale: bool, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;
    let stale_val = if stale { 1 } else { 0 };
    conn.execute(
        "UPDATE contents SET stale = ?1, updated_at = datetime('now') WHERE chapter_id = ?2",
        params![stale_val, chapter_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_stale_contents(project_id: i64, state: State<'_, DbState>) -> Result<Vec<Content>, String> {
    let conn = get_conn(&state)?;
    let mut stmt = conn
        .prepare("SELECT id, project_id, chapter_id, content, stale, updated_at FROM contents WHERE project_id = ?1 AND stale = 1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok(Content {
                id: row.get(0)?,
                project_id: row.get(1)?,
                chapter_id: row.get(2)?,
                content: row.get(3)?,
                stale: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}
