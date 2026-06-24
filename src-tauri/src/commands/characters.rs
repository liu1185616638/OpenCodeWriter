use crate::db::{DbState, get_conn};
use crate::models::Character;
use rusqlite::params;
use tauri::State;

fn row_to_character(row: &rusqlite::Row<'_>) -> rusqlite::Result<Character> {
    Ok(Character {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        tier: row.get(3)?,
        identity: row.get(4)?,
        appearance: row.get(5)?,
        personality: row.get(6)?,
        motivation: row.get(7)?,
        relationships: row.get(8)?,
        key_events: row.get(9)?,
        sort_order: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

const SELECT_CHARACTER: &str = "SELECT id, project_id, name, tier, identity, appearance, personality, motivation, relationships, key_events, sort_order, updated_at FROM characters WHERE id = ?1";

#[tauri::command]
pub fn list_characters(project_id: i64, state: State<'_, DbState>) -> Result<Vec<Character>, String> {
    let conn = get_conn(&state)?;
    let mut stmt = conn
        .prepare("SELECT id, project_id, name, tier, identity, appearance, personality, motivation, relationships, key_events, sort_order, updated_at FROM characters WHERE project_id = ?1 ORDER BY sort_order")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], row_to_character)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn list_characters_by_tier(
    project_id: i64,
    tier: String,
    state: State<'_, DbState>,
) -> Result<Vec<Character>, String> {
    let conn = get_conn(&state)?;
    let mut stmt = conn
        .prepare("SELECT id, project_id, name, tier, identity, appearance, personality, motivation, relationships, key_events, sort_order, updated_at FROM characters WHERE project_id = ?1 AND tier = ?2 ORDER BY sort_order")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id, tier], row_to_character)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn get_character(id: i64, state: State<'_, DbState>) -> Result<Character, String> {
    let conn = get_conn(&state)?;
    conn.query_row(SELECT_CHARACTER, params![id], row_to_character)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_character(
    project_id: i64,
    name: String,
    tier: String,
    state: State<'_, DbState>,
) -> Result<Character, String> {
    let conn = get_conn(&state)?;

    // Auto sort_order: use MAX + 1 for this project
    let max_sort: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM characters WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let sort_order = max_sort + 1;

    conn.execute(
        "INSERT INTO characters (project_id, name, tier, sort_order) VALUES (?1, ?2, ?3, ?4)",
        params![project_id, name, tier, sort_order],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    conn.query_row(SELECT_CHARACTER, params![id], row_to_character)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_character(
    id: i64,
    name: Option<String>,
    identity: Option<String>,
    appearance: Option<String>,
    personality: Option<String>,
    motivation: Option<String>,
    relationships: Option<String>,
    key_events: Option<String>,
    state: State<'_, DbState>,
) -> Result<Character, String> {
    let conn = get_conn(&state)?;

    let mut sets: Vec<String> = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(v) = name {
        sets.push("name = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = identity {
        sets.push("identity = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = appearance {
        sets.push("appearance = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = personality {
        sets.push("personality = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = motivation {
        sets.push("motivation = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = relationships {
        sets.push("relationships = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = key_events {
        sets.push("key_events = ?".to_string());
        param_values.push(Box::new(v));
    }

    if sets.is_empty() {
        return conn.query_row(SELECT_CHARACTER, params![id], row_to_character)
            .map_err(|e| e.to_string());
    }

    sets.push("updated_at = datetime('now')".to_string());

    let sql = format!("UPDATE characters SET {} WHERE id = ?", sets.join(", "));
    param_values.push(Box::new(id));

    let params: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, params.as_slice())
        .map_err(|e| e.to_string())?;

    conn.query_row(SELECT_CHARACTER, params![id], row_to_character)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_character(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;
    conn.execute("DELETE FROM characters WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
