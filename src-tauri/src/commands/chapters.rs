use crate::db::{DbState, get_conn};
use crate::models::Chapter;
use rusqlite::params;
use tauri::State;

fn row_to_chapter(row: &rusqlite::Row<'_>) -> rusqlite::Result<Chapter> {
    Ok(Chapter {
        id: row.get(0)?,
        project_id: row.get(1)?,
        chapter_number: row.get(2)?,
        title: row.get(3)?,
        summary: row.get(4)?,
        sort_order: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

const SELECT_CHAPTER: &str = "SELECT id, project_id, chapter_number, title, summary, sort_order, updated_at FROM chapters WHERE id = ?1";
const SELECT_CHAPTERS_BY_PROJECT: &str = "SELECT id, project_id, chapter_number, title, summary, sort_order, updated_at FROM chapters WHERE project_id = ?1 ORDER BY sort_order";

#[tauri::command]
pub fn list_chapters(project_id: i64, state: State<'_, DbState>) -> Result<Vec<Chapter>, String> {
    let conn = get_conn(&state)?;
    let mut stmt = conn
        .prepare(SELECT_CHAPTERS_BY_PROJECT)
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], row_to_chapter)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn get_chapter(id: i64, state: State<'_, DbState>) -> Result<Chapter, String> {
    let conn = get_conn(&state)?;
    conn.query_row(SELECT_CHAPTER, params![id], row_to_chapter)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_chapter(
    project_id: i64,
    chapter_number: i64,
    title: String,
    summary: String,
    state: State<'_, DbState>,
) -> Result<Chapter, String> {
    let conn = get_conn(&state)?;

    // Auto sort_order: use MAX + 1 for this project
    let max_sort: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM chapters WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let sort_order = max_sort + 1;

    conn.execute(
        "INSERT INTO chapters (project_id, chapter_number, title, summary, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![project_id, chapter_number, title, summary, sort_order],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    conn.query_row(SELECT_CHAPTER, params![id], row_to_chapter)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_chapter(
    id: i64,
    title: Option<String>,
    summary: Option<String>,
    state: State<'_, DbState>,
) -> Result<Chapter, String> {
    let conn = get_conn(&state)?;

    let mut sets: Vec<String> = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(v) = title {
        sets.push("title = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = summary {
        sets.push("summary = ?".to_string());
        param_values.push(Box::new(v));
    }

    if sets.is_empty() {
        return conn.query_row(SELECT_CHAPTER, params![id], row_to_chapter)
            .map_err(|e| e.to_string());
    }

    sets.push("updated_at = datetime('now')".to_string());

    let sql = format!("UPDATE chapters SET {} WHERE id = ?", sets.join(", "));
    param_values.push(Box::new(id));

    let params: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, params.as_slice())
        .map_err(|e| e.to_string())?;

    conn.query_row(SELECT_CHAPTER, params![id], row_to_chapter)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_chapter(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;
    conn.execute("DELETE FROM chapters WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reorder_chapters(
    project_id: i64,
    chapter_ids: Vec<i64>,
    state: State<'_, DbState>,
) -> Result<Vec<Chapter>, String> {
    let conn = get_conn(&state)?;

    for (index, &chapter_id) in chapter_ids.iter().enumerate() {
        let sort_order = index as i64;
        conn.execute(
            "UPDATE chapters SET sort_order = ?1, updated_at = datetime('now') WHERE id = ?2 AND project_id = ?3",
            params![sort_order, chapter_id, project_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Return the updated list in new order
    let mut stmt = conn
        .prepare(SELECT_CHAPTERS_BY_PROJECT)
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], row_to_chapter)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}
