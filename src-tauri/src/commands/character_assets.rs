use crate::db::{DbState, get_conn};
use crate::models::{CharacterRelation, CharacterState};
use rusqlite::params;
use serde::Deserialize;
use tauri::State;

// ===================== Character Relations =====================

fn row_to_relation(row: &rusqlite::Row<'_>) -> rusqlite::Result<CharacterRelation> {
    Ok(CharacterRelation {
        id: row.get(0)?,
        project_id: row.get(1)?,
        source_character_id: row.get(2)?,
        target_character_id: row.get(3)?,
        relation_type: row.get(4)?,
        tension: row.get(5)?,
        summary: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

const RELATION_COLS: &str = "id, project_id, source_character_id, target_character_id, relation_type, tension, summary, updated_at";

#[tauri::command]
pub fn list_character_relations(project_id: i64, state: State<'_, DbState>) -> Result<Vec<CharacterRelation>, String> {
    let conn = get_conn(&state)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} FROM character_relations WHERE project_id = ?1 ORDER BY updated_at DESC",
            RELATION_COLS
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], row_to_relation)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_character_relation(
    project_id: i64,
    source_character_id: i64,
    target_character_id: i64,
    relation_type: String,
    state: State<'_, DbState>,
) -> Result<CharacterRelation, String> {
    let conn = get_conn(&state)?;
    conn.execute(
        "INSERT INTO character_relations (project_id, source_character_id, target_character_id, relation_type) VALUES (?1, ?2, ?3, ?4)",
        params![project_id, source_character_id, target_character_id, relation_type],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        &format!("SELECT {} FROM character_relations WHERE id = ?1", RELATION_COLS),
        params![id],
        row_to_relation,
    )
    .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct RelationUpdate {
    pub relation_type: Option<String>,
    pub tension: Option<String>,
    pub summary: Option<String>,
}

#[tauri::command]
pub fn update_character_relation(
    id: i64,
    fields: RelationUpdate,
    state: State<'_, DbState>,
) -> Result<CharacterRelation, String> {
    let conn = get_conn(&state)?;
    let mut sets: Vec<String> = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(v) = fields.relation_type {
        sets.push("relation_type = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = fields.tension {
        sets.push("tension = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = fields.summary {
        sets.push("summary = ?".to_string());
        param_values.push(Box::new(v));
    }

    if sets.is_empty() {
        return conn.query_row(
            &format!("SELECT {} FROM character_relations WHERE id = ?1", RELATION_COLS),
            params![id],
            row_to_relation,
        )
        .map_err(|e| e.to_string());
    }

    sets.push("updated_at = datetime('now')".to_string());
    let sql = format!("UPDATE character_relations SET {} WHERE id = ?", sets.join(", "));
    param_values.push(Box::new(id));
    let params_ref: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, params_ref.as_slice())
        .map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("SELECT {} FROM character_relations WHERE id = ?1", RELATION_COLS),
        params![id],
        row_to_relation,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_character_relation(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;
    conn.execute("DELETE FROM character_relations WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ===================== Character States =====================

fn row_to_state(row: &rusqlite::Row<'_>) -> rusqlite::Result<CharacterState> {
    Ok(CharacterState {
        id: row.get(0)?,
        project_id: row.get(1)?,
        character_id: row.get(2)?,
        chapter_id: row.get(3)?,
        state_summary: row.get(4)?,
        goal: row.get(5)?,
        emotion: row.get(6)?,
        location: row.get(7)?,
        created_at: row.get(8)?,
    })
}

const STATE_COLS: &str = "id, project_id, character_id, chapter_id, state_summary, goal, emotion, location, created_at";

#[tauri::command]
pub fn list_character_states(
    project_id: i64,
    character_id: Option<i64>,
    limit: Option<i64>,
    state: State<'_, DbState>,
) -> Result<Vec<CharacterState>, String> {
    let conn = get_conn(&state)?;
    let limit_val = limit.unwrap_or(20);
    let sql = if character_id.is_some() {
        format!("SELECT {} FROM character_states WHERE project_id = ?1 AND character_id = ?2 ORDER BY created_at DESC LIMIT ?3", STATE_COLS)
    } else {
        format!("SELECT {} FROM character_states WHERE project_id = ?1 ORDER BY created_at DESC LIMIT ?3", STATE_COLS)
    };
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = if character_id.is_some() {
        stmt.query_map(params![project_id, character_id, limit_val], row_to_state)
    } else {
        stmt.query_map(params![project_id, None::<i64>, limit_val], row_to_state)
    }
    .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_character_state(
    project_id: i64,
    character_id: i64,
    chapter_id: Option<i64>,
    state_summary: String,
    goal: String,
    emotion: String,
    location: String,
    state: State<'_, DbState>,
) -> Result<CharacterState, String> {
    let conn = get_conn(&state)?;
    conn.execute(
        "INSERT INTO character_states (project_id, character_id, chapter_id, state_summary, goal, emotion, location) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![project_id, character_id, chapter_id, state_summary, goal, emotion, location],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        &format!("SELECT {} FROM character_states WHERE id = ?1", STATE_COLS),
        params![id],
        row_to_state,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_character_state(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;
    conn.execute("DELETE FROM character_states WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ===================== Internal helpers for context injection =====================

/// Get the latest state for each character in a project
pub fn get_latest_character_states_summary(state: &State<'_, DbState>, project_id: i64) -> Result<String, String> {
    let conn = get_conn(state)?;
    // Get the latest state per character
    let mut stmt = conn
        .prepare(
            "SELECT cs.character_id, cs.state_summary, cs.goal, cs.emotion, cs.location, c.name \
             FROM character_states cs \
             INNER JOIN characters c ON c.id = cs.character_id \
             WHERE cs.project_id = ?1 \
             AND cs.id IN (SELECT MAX(id) FROM character_states WHERE project_id = ?1 GROUP BY character_id) \
             ORDER BY cs.created_at DESC"
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut parts = Vec::new();
    for row in rows {
        let (_char_id, state_summary, goal, emotion, location, name) = row.map_err(|e| e.to_string())?;
        let mut line = format!("- {}", name);
        if !state_summary.is_empty() {
            line.push_str(&format!("：{}", state_summary));
        }
        if !goal.is_empty() {
            line.push_str(&format!("（目标：{}）", goal));
        }
        if !emotion.is_empty() {
            line.push_str(&format!("（情绪：{}）", emotion));
        }
        if !location.is_empty() {
            line.push_str(&format!("（位置：{}）", location));
        }
        parts.push(line);
    }

    if parts.is_empty() {
        Ok(String::new())
    } else {
        Ok(format!("## 角色当前状态\n\n{}\n\n", parts.join("\n")))
    }
}
