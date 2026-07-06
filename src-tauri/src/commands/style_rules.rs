use crate::db::{DbState, get_conn};
use crate::models::StyleRule;
use rusqlite::params;
use tauri::State;

fn row_to_rule(row: &rusqlite::Row<'_>) -> rusqlite::Result<StyleRule> {
    Ok(StyleRule {
        id: row.get(0)?,
        project_id: row.get(1)?,
        rule_type: row.get(2)?,
        content: row.get(3)?,
        enabled: row.get::<_, i64>(4)? != 0,
        created_at: row.get(5)?,
    })
}

const RULE_COLS: &str = "id, project_id, rule_type, content, enabled, created_at";

#[tauri::command]
pub fn list_style_rules(project_id: i64, state: State<'_, DbState>) -> Result<Vec<StyleRule>, String> {
    let conn = get_conn(&state)?;
    let mut stmt = conn
        .prepare(&format!("SELECT {} FROM style_rules WHERE project_id = ?1 ORDER BY created_at DESC", RULE_COLS))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![project_id], row_to_rule).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_style_rule(
    project_id: i64,
    rule_type: String,
    content: String,
    state: State<'_, DbState>,
) -> Result<StyleRule, String> {
    let conn = get_conn(&state)?;
    conn.execute(
        "INSERT INTO style_rules (project_id, rule_type, content) VALUES (?1, ?2, ?3)",
        params![project_id, rule_type, content],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        &format!("SELECT {} FROM style_rules WHERE id = ?1", RULE_COLS),
        params![id],
        row_to_rule,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_style_rule(
    id: i64,
    enabled: Option<bool>,
    content: Option<String>,
    rule_type: Option<String>,
    state: State<'_, DbState>,
) -> Result<StyleRule, String> {
    let conn = get_conn(&state)?;
    let mut sets: Vec<String> = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(v) = enabled {
        sets.push("enabled = ?".to_string());
        param_values.push(Box::new(if v { 1i64 } else { 0 }));
    }
    if let Some(v) = content {
        sets.push("content = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = rule_type {
        sets.push("rule_type = ?".to_string());
        param_values.push(Box::new(v));
    }

    if sets.is_empty() {
        return conn.query_row(
            &format!("SELECT {} FROM style_rules WHERE id = ?1", RULE_COLS),
            params![id],
            row_to_rule,
        )
        .map_err(|e| e.to_string());
    }

    let sql = format!("UPDATE style_rules SET {} WHERE id = ?", sets.join(", "));
    param_values.push(Box::new(id));
    let params_ref: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, params_ref.as_slice()).map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("SELECT {} FROM style_rules WHERE id = ?1", RULE_COLS),
        params![id],
        row_to_rule,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_style_rule(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;
    conn.execute("DELETE FROM style_rules WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Internal helper: get enabled style rules summary for context injection
pub fn get_enabled_rules_summary(state: &State<'_, DbState>, project_id: i64) -> Result<String, String> {
    let conn = get_conn(state)?;
    let mut stmt = conn
        .prepare("SELECT rule_type, content FROM style_rules WHERE project_id = ?1 AND enabled = 1 ORDER BY created_at")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut parts = Vec::new();
    for row in rows {
        let (rule_type, content) = row.map_err(|e| e.to_string())?;
        parts.push(format!("- [{}] {}", rule_type, content));
    }

    if parts.is_empty() {
        Ok(String::new())
    } else {
        Ok(format!("## 写法规则\n\n{}\n\n", parts.join("\n")))
    }
}
