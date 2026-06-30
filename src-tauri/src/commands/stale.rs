use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::db::{DbState, get_conn};

#[derive(Debug, Serialize)]
pub struct StaleReason {
    pub source_type: String,
    pub created_at: String,
}

/// Cascade rules:
/// - outline changed -> mark characters, chapters, contents as stale
/// - characters changed -> mark chapters, contents as stale
/// - chapters changed -> mark contents as stale
#[tauri::command]
pub fn mark_stale(project_id: i64, source_type: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;

    let cascade_targets: Vec<&str> = match source_type.as_str() {
        "outline" => vec!["characters", "chapters", "contents"],
        "characters" => vec!["chapters", "contents"],
        "chapters" => vec!["contents"],
        _ => return Err(format!("Unknown source_type: {}", source_type)),
    };

    for target_type in cascade_targets {
        // Insert stale_markers row for this target
        conn.execute(
            "INSERT INTO stale_markers (project_id, target_type, source_type) VALUES (?1, ?2, ?3)",
            params![project_id, target_type, source_type],
        )
        .map_err(|e| e.to_string())?;

        // If target is contents, also UPDATE the stale field on contents rows
        if target_type == "contents" {
            conn.execute(
                "UPDATE contents SET stale = 1, updated_at = datetime('now') WHERE project_id = ?1",
                params![project_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn is_stale(project_id: i64, target_type: String, state: State<'_, DbState>) -> Result<bool, String> {
    let conn = get_conn(&state)?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM stale_markers WHERE project_id = ?1 AND target_type = ?2",
            params![project_id, target_type],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count > 0)
}

#[tauri::command]
pub fn list_stale_reasons(
    project_id: i64,
    target_type: String,
    state: State<'_, DbState>,
) -> Result<Vec<StaleReason>, String> {
    let conn = get_conn(&state)?;
    let mut stmt = conn
        .prepare(
            "SELECT source_type, created_at FROM stale_markers \
             WHERE project_id = ?1 AND target_type = ?2 \
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id, target_type], |row| {
            Ok(StaleReason {
                source_type: row.get(0)?,
                created_at: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn clear_stale(project_id: i64, target_type: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;

    // Delete stale_markers for this target_type
    conn.execute(
        "DELETE FROM stale_markers WHERE project_id = ?1 AND target_type = ?2",
        params![project_id, target_type],
    )
    .map_err(|e| e.to_string())?;

    // If clearing contents stale markers, also update stale=0 on contents
    if target_type == "contents" {
        conn.execute(
            "UPDATE contents SET stale = 0, updated_at = datetime('now') WHERE project_id = ?1",
            params![project_id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}
