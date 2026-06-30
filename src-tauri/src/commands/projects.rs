use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::db::{DbState, get_conn};
use crate::models::*;

#[derive(Debug, Serialize)]
pub struct ProjectProgress {
    pub has_outline: bool,
    pub character_count: i64,
    pub chapter_count: i64,
    pub has_content: bool,
}

#[tauri::command]
pub fn create_project(name: String, state: State<'_, DbState>) -> Result<Project, String> {
    let conn = get_conn(&state)?;

    conn.execute(
        "INSERT INTO projects (name) VALUES (?)",
        params![name],
    )
    .map_err(|e| e.to_string())?;

    let project_id = conn.last_insert_rowid();

    // Auto-create an outline row for the new project
    conn.execute(
        "INSERT INTO outlines (project_id) VALUES (?)",
        params![project_id],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, current_stage, created_at, updated_at FROM projects WHERE id = ?")
        .map_err(|e| e.to_string())?;

    let project = stmt
        .query_row(params![project_id], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                current_stage: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(project)
}

#[tauri::command]
pub fn list_projects(state: State<'_, DbState>) -> Result<Vec<Project>, String> {
    let conn = get_conn(&state)?;

    let mut stmt = conn
        .prepare("SELECT id, name, current_stage, created_at, updated_at FROM projects ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let projects = stmt
        .query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                current_stage: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(projects)
}

#[tauri::command]
pub fn get_project(id: i64, state: State<'_, DbState>) -> Result<Project, String> {
    let conn = get_conn(&state)?;

    let mut stmt = conn
        .prepare("SELECT id, name, current_stage, created_at, updated_at FROM projects WHERE id = ?")
        .map_err(|e| e.to_string())?;

    let project = stmt
        .query_row(params![id], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                current_stage: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(project)
}

#[tauri::command]
pub fn delete_project(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;

    conn.execute("DELETE FROM projects WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_project_stage(id: i64, stage: String, state: State<'_, DbState>) -> Result<Project, String> {
    let conn = get_conn(&state)?;

    conn.execute(
        "UPDATE projects SET current_stage = ?, updated_at = datetime('now') WHERE id = ?",
        params![stage, id],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, current_stage, created_at, updated_at FROM projects WHERE id = ?")
        .map_err(|e| e.to_string())?;

    let project = stmt
        .query_row(params![id], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                current_stage: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(project)
}

#[tauri::command]
pub fn get_project_progress(project_id: i64, state: State<'_, DbState>) -> Result<ProjectProgress, String> {
    let conn = get_conn(&state)?;

    let outline_status: String = conn
        .query_row(
            "SELECT status FROM outlines WHERE project_id = ?",
            params![project_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "empty".to_string());

    let character_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM characters WHERE project_id = ?",
            params![project_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let chapter_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM chapters WHERE project_id = ?",
            params![project_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let has_content: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM contents WHERE project_id = ? AND content != '' AND content IS NOT NULL",
            params![project_id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    Ok(ProjectProgress {
        has_outline: outline_status != "empty",
        character_count,
        chapter_count,
        has_content,
    })
}
