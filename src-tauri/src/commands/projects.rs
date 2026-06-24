use rusqlite::params;
use tauri::State;

use crate::db::{DbState, get_conn};
use crate::models::*;

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
