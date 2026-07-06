use crate::db::{DbState, get_conn};
use crate::models::ModelRoute;
use rusqlite::params;
use tauri::State;

fn row_to_route(row: &rusqlite::Row<'_>) -> rusqlite::Result<ModelRoute> {
    Ok(ModelRoute {
        id: row.get(0)?,
        task_type: row.get(1)?,
        primary_preset_id: row.get(2)?,
        fallback_preset_id: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

const ROUTE_COLS: &str = "id, task_type, primary_preset_id, fallback_preset_id, updated_at";

#[tauri::command]
pub fn list_model_routes(state: State<'_, DbState>) -> Result<Vec<ModelRoute>, String> {
    let conn = get_conn(&state)?;
    let mut stmt = conn
        .prepare(&format!("SELECT {} FROM model_routes ORDER BY task_type", ROUTE_COLS))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_route).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn upsert_model_route(
    task_type: String,
    primary_preset_id: Option<i64>,
    fallback_preset_id: Option<i64>,
    state: State<'_, DbState>,
) -> Result<ModelRoute, String> {
    let conn = get_conn(&state)?;
    conn.execute(
        "INSERT INTO model_routes (task_type, primary_preset_id, fallback_preset_id, updated_at) \
         VALUES (?1, ?2, ?3, datetime('now')) \
         ON CONFLICT(task_type) DO UPDATE SET \
         primary_preset_id = ?2, fallback_preset_id = ?3, updated_at = datetime('now')",
        params![task_type, primary_preset_id, fallback_preset_id],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("SELECT {} FROM model_routes WHERE task_type = ?1", ROUTE_COLS),
        params![task_type],
        row_to_route,
    )
    .map_err(|e| e.to_string())
}

/// Internal helper: get the primary preset ID for a task type
pub fn get_route_preset(state: &State<'_, DbState>, task_type: &str) -> Result<Option<i64>, String> {
    let conn = get_conn(state)?;
    let result: Option<i64> = conn
        .query_row(
            "SELECT primary_preset_id FROM model_routes WHERE task_type = ?1",
            params![task_type],
            |row| row.get(0),
        )
        .unwrap_or(None);
    Ok(result)
}

/// Internal helper: get the fallback preset ID for a task type
pub fn get_route_fallback_preset(state: &State<'_, DbState>, task_type: &str) -> Result<Option<i64>, String> {
    let conn = get_conn(state)?;
    let result: Option<i64> = conn
        .query_row(
            "SELECT fallback_preset_id FROM model_routes WHERE task_type = ?1",
            params![task_type],
            |row| row.get(0),
        )
        .unwrap_or(None);
    Ok(result)
}
