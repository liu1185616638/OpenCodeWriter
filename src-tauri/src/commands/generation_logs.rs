use crate::db::{DbState, get_conn};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct GenerationLog {
    pub id: i64,
    pub project_id: i64,
    pub target_type: String,
    pub target_id: Option<i64>,
    pub command: String,
    pub model_name: String,
    pub status: String,
    pub error: String,
    pub input_chars: i64,
    pub output_chars: i64,
    pub started_at: String,
    pub ended_at: Option<String>,
}

fn row_to_log(row: &rusqlite::Row<'_>) -> rusqlite::Result<GenerationLog> {
    Ok(GenerationLog {
        id: row.get(0)?,
        project_id: row.get(1)?,
        target_type: row.get(2)?,
        target_id: row.get(3)?,
        command: row.get(4)?,
        model_name: row.get(5)?,
        status: row.get(6)?,
        error: row.get(7)?,
        input_chars: row.get(8)?,
        output_chars: row.get(9)?,
        started_at: row.get(10)?,
        ended_at: row.get(11)?,
    })
}

#[tauri::command]
pub fn list_generation_logs(
    project_id: i64,
    limit: Option<i64>,
    state: State<'_, DbState>,
) -> Result<Vec<GenerationLog>, String> {
    let conn = get_conn(&state)?;
    let limit_val = limit.unwrap_or(50);
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, target_type, target_id, command, model_name, status, error, input_chars, output_chars, started_at, ended_at \
             FROM generation_logs \
             WHERE project_id = ?1 \
             ORDER BY started_at DESC LIMIT ?2"
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id, limit_val], row_to_log)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}
