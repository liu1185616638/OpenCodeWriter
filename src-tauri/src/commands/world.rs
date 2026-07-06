use crate::db::{DbState, get_conn};
use crate::models::WorldItem;
use rusqlite::params;
use serde::Deserialize;
use tauri::State;

fn row_to_world_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorldItem> {
    Ok(WorldItem {
        id: row.get(0)?,
        project_id: row.get(1)?,
        item_type: row.get(2)?,
        name: row.get(3)?,
        description: row.get(4)?,
        rules: row.get(5)?,
        sort_order: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

const SELECT_COLS: &str = "id, project_id, item_type, name, description, rules, sort_order, updated_at";

#[tauri::command]
pub fn list_world_items(project_id: i64, state: State<'_, DbState>) -> Result<Vec<WorldItem>, String> {
    let conn = get_conn(&state)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} FROM world_items WHERE project_id = ?1 ORDER BY sort_order",
            SELECT_COLS
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], row_to_world_item)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_world_item(
    project_id: i64,
    item_type: String,
    name: String,
    state: State<'_, DbState>,
) -> Result<WorldItem, String> {
    let conn = get_conn(&state)?;
    let max_sort: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM world_items WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let sort_order = max_sort + 1;

    conn.execute(
        "INSERT INTO world_items (project_id, item_type, name, sort_order) VALUES (?1, ?2, ?3, ?4)",
        params![project_id, item_type, name, sort_order],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    conn.query_row(
        &format!("SELECT {} FROM world_items WHERE id = ?1", SELECT_COLS),
        params![id],
        row_to_world_item,
    )
    .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct WorldItemUpdate {
    pub item_type: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub rules: Option<String>,
}

#[tauri::command]
pub fn update_world_item(
    id: i64,
    fields: WorldItemUpdate,
    state: State<'_, DbState>,
) -> Result<WorldItem, String> {
    let conn = get_conn(&state)?;

    let mut sets: Vec<String> = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(v) = fields.item_type {
        sets.push("item_type = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = fields.name {
        sets.push("name = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = fields.description {
        sets.push("description = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = fields.rules {
        sets.push("rules = ?".to_string());
        param_values.push(Box::new(v));
    }

    if sets.is_empty() {
        return conn.query_row(
            &format!("SELECT {} FROM world_items WHERE id = ?1", SELECT_COLS),
            params![id],
            row_to_world_item,
        )
        .map_err(|e| e.to_string());
    }

    sets.push("updated_at = datetime('now')".to_string());
    let sql = format!("UPDATE world_items SET {} WHERE id = ?", sets.join(", "));
    param_values.push(Box::new(id));

    let params_ref: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, params_ref.as_slice())
        .map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("SELECT {} FROM world_items WHERE id = ?1", SELECT_COLS),
        params![id],
        row_to_world_item,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_world_item(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;
    conn.execute("DELETE FROM world_items WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Internal helper: get world items summary for context injection
pub fn get_world_items_summary(state: &State<'_, DbState>, project_id: i64) -> Result<String, String> {
    let conn = get_conn(state)?;
    let mut stmt = conn
        .prepare("SELECT item_type, name, description, rules FROM world_items WHERE project_id = ?1 ORDER BY sort_order")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut parts = Vec::new();
    for row in rows {
        let (item_type, name, description, rules) = row.map_err(|e| e.to_string())?;
        let mut line = format!("- [{}] {}", item_type, name);
        if !description.is_empty() {
            line.push_str(&format!("：{}", description));
        }
        if !rules.is_empty() {
            line.push_str(&format!("（规则：{}）", rules));
        }
        parts.push(line);
    }

    if parts.is_empty() {
        Ok(String::new())
    } else {
        Ok(format!("## 世界观设定\n\n{}\n\n", parts.join("\n")))
    }
}
