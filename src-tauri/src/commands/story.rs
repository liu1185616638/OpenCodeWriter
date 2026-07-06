use crate::db::{DbState, get_conn};
use crate::models::{StoryFact, Foreshadow};
use rusqlite::params;
use tauri::State;

// ===================== Story Facts =====================

fn row_to_fact(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoryFact> {
    Ok(StoryFact {
        id: row.get(0)?,
        project_id: row.get(1)?,
        chapter_id: row.get(2)?,
        fact_type: row.get(3)?,
        content: row.get(4)?,
        confidence: row.get(5)?,
        created_at: row.get(6)?,
    })
}

const FACT_COLS: &str = "id, project_id, chapter_id, fact_type, content, confidence, created_at";

#[tauri::command]
pub fn list_story_facts(
    project_id: i64,
    chapter_id: Option<i64>,
    limit: Option<i64>,
    state: State<'_, DbState>,
) -> Result<Vec<StoryFact>, String> {
    let conn = get_conn(&state)?;
    let limit_val = limit.unwrap_or(100);
    let sql = if chapter_id.is_some() {
        format!("SELECT {} FROM story_facts WHERE project_id = ?1 AND chapter_id = ?2 ORDER BY created_at DESC LIMIT ?3", FACT_COLS)
    } else {
        format!("SELECT {} FROM story_facts WHERE project_id = ?1 ORDER BY created_at DESC LIMIT ?3", FACT_COLS)
    };
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = if chapter_id.is_some() {
        stmt.query_map(params![project_id, chapter_id, limit_val], row_to_fact)
    } else {
        stmt.query_map(params![project_id, None::<i64>, limit_val], row_to_fact)
    }
    .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_story_fact(
    project_id: i64,
    chapter_id: Option<i64>,
    fact_type: String,
    content: String,
    state: State<'_, DbState>,
) -> Result<StoryFact, String> {
    let conn = get_conn(&state)?;
    conn.execute(
        "INSERT INTO story_facts (project_id, chapter_id, fact_type, content) VALUES (?1, ?2, ?3, ?4)",
        params![project_id, chapter_id, fact_type, content],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        &format!("SELECT {} FROM story_facts WHERE id = ?1", FACT_COLS),
        params![id],
        row_to_fact,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_story_fact(
    id: i64,
    fact_type: Option<String>,
    content: Option<String>,
    confidence: Option<f64>,
    state: State<'_, DbState>,
) -> Result<StoryFact, String> {
    let conn = get_conn(&state)?;
    let mut sets: Vec<String> = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(v) = fact_type {
        sets.push("fact_type = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = content {
        sets.push("content = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = confidence {
        sets.push("confidence = ?".to_string());
        param_values.push(Box::new(v));
    }

    if sets.is_empty() {
        return conn.query_row(
            &format!("SELECT {} FROM story_facts WHERE id = ?1", FACT_COLS),
            params![id],
            row_to_fact,
        )
        .map_err(|e| e.to_string());
    }

    let sql = format!("UPDATE story_facts SET {} WHERE id = ?", sets.join(", "));
    param_values.push(Box::new(id));
    let params_ref: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, params_ref.as_slice())
        .map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("SELECT {} FROM story_facts WHERE id = ?1", FACT_COLS),
        params![id],
        row_to_fact,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_story_fact(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;
    conn.execute("DELETE FROM story_facts WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ===================== Foreshadows =====================

fn row_to_foreshadow(row: &rusqlite::Row<'_>) -> rusqlite::Result<Foreshadow> {
    Ok(Foreshadow {
        id: row.get(0)?,
        project_id: row.get(1)?,
        setup_chapter_id: row.get(2)?,
        payoff_chapter_id: row.get(3)?,
        content: row.get(4)?,
        status: row.get(5)?,
        created_at: row.get(6)?,
    })
}

const FORESHADOW_COLS: &str = "id, project_id, setup_chapter_id, payoff_chapter_id, content, status, created_at";

#[tauri::command]
pub fn list_foreshadows(
    project_id: i64,
    status: Option<String>,
    state: State<'_, DbState>,
) -> Result<Vec<Foreshadow>, String> {
    let conn = get_conn(&state)?;
    let sql = if status.is_some() {
        format!("SELECT {} FROM foreshadows WHERE project_id = ?1 AND status = ?2 ORDER BY created_at DESC", FORESHADOW_COLS)
    } else {
        format!("SELECT {} FROM foreshadows WHERE project_id = ?1 ORDER BY created_at DESC", FORESHADOW_COLS)
    };
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = if status.is_some() {
        stmt.query_map(params![project_id, status], row_to_foreshadow)
    } else {
        stmt.query_map(params![project_id], row_to_foreshadow)
    }
    .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_foreshadow(
    project_id: i64,
    setup_chapter_id: Option<i64>,
    content: String,
    state: State<'_, DbState>,
) -> Result<Foreshadow, String> {
    let conn = get_conn(&state)?;
    conn.execute(
        "INSERT INTO foreshadows (project_id, setup_chapter_id, content) VALUES (?1, ?2, ?3)",
        params![project_id, setup_chapter_id, content],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        &format!("SELECT {} FROM foreshadows WHERE id = ?1", FORESHADOW_COLS),
        params![id],
        row_to_foreshadow,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_foreshadow(
    id: i64,
    content: Option<String>,
    status: Option<String>,
    payoff_chapter_id: Option<Option<i64>>,
    state: State<'_, DbState>,
) -> Result<Foreshadow, String> {
    let conn = get_conn(&state)?;
    let mut sets: Vec<String> = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(v) = content {
        sets.push("content = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = status {
        sets.push("status = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = payoff_chapter_id {
        sets.push("payoff_chapter_id = ?".to_string());
        param_values.push(Box::new(v));
    }

    if sets.is_empty() {
        return conn.query_row(
            &format!("SELECT {} FROM foreshadows WHERE id = ?1", FORESHADOW_COLS),
            params![id],
            row_to_foreshadow,
        )
        .map_err(|e| e.to_string());
    }

    let sql = format!("UPDATE foreshadows SET {} WHERE id = ?", sets.join(", "));
    param_values.push(Box::new(id));
    let params_ref: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, params_ref.as_slice())
        .map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("SELECT {} FROM foreshadows WHERE id = ?1", FORESHADOW_COLS),
        params![id],
        row_to_foreshadow,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_foreshadow(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;
    conn.execute("DELETE FROM foreshadows WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ===================== Internal helpers for context injection =====================

pub fn get_facts_summary(state: &State<'_, DbState>, project_id: i64, limit: usize) -> Result<String, String> {
    let conn = get_conn(state)?;
    let mut stmt = conn
        .prepare("SELECT fact_type, content FROM story_facts WHERE project_id = ?1 ORDER BY created_at DESC LIMIT ?2")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id, limit as i64], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut parts = Vec::new();
    for row in rows {
        let (fact_type, content) = row.map_err(|e| e.to_string())?;
        parts.push(format!("- [{}] {}", fact_type, content));
    }

    if parts.is_empty() {
        Ok(String::new())
    } else {
        Ok(format!("## 已知事实\n\n{}\n\n", parts.join("\n")))
    }
}

pub fn get_foreshadows_summary(state: &State<'_, DbState>, project_id: i64) -> Result<String, String> {
    let conn = get_conn(state)?;
    let mut stmt = conn
        .prepare("SELECT content, status FROM foreshadows WHERE project_id = ?1 AND status != 'resolved' ORDER BY created_at DESC LIMIT 20")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut parts = Vec::new();
    for row in rows {
        let (content, status) = row.map_err(|e| e.to_string())?;
        let status_label = match status.as_str() {
            "setup" => "已埋设",
            "payoff" => "已回收",
            _ => &status,
        };
        parts.push(format!("- [{}] {}", status_label, content));
    }

    if parts.is_empty() {
        Ok(String::new())
    } else {
        Ok(format!("## 伏笔追踪\n\n{}\n\n", parts.join("\n")))
    }
}
