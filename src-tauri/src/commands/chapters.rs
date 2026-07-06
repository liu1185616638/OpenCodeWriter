use crate::db::{DbState, get_conn};
use crate::models::{Chapter, ChapterReview};
use rusqlite::params;
use serde::Deserialize;
use tauri::State;

fn row_to_chapter(row: &rusqlite::Row<'_>) -> rusqlite::Result<Chapter> {
    Ok(Chapter {
        id: row.get(0)?,
        project_id: row.get(1)?,
        chapter_number: row.get(2)?,
        title: row.get(3)?,
        summary: row.get(4)?,
        sort_order: row.get(5)?,
        goal: row.get(6)?,
        conflict_level: row.get(7)?,
        hook: row.get(8)?,
        payoff: row.get(9)?,
        must_avoid: row.get(10)?,
        target_word_count: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

const SELECT_CHAPTER: &str = "SELECT id, project_id, chapter_number, title, summary, sort_order, goal, conflict_level, hook, payoff, must_avoid, target_word_count, updated_at FROM chapters WHERE id = ?1";
const SELECT_CHAPTERS_BY_PROJECT: &str = "SELECT id, project_id, chapter_number, title, summary, sort_order, goal, conflict_level, hook, payoff, must_avoid, target_word_count, updated_at FROM chapters WHERE project_id = ?1 ORDER BY sort_order";

#[tauri::command]
pub fn list_chapters(project_id: i64, state: State<'_, DbState>) -> Result<Vec<Chapter>, String> {
    let conn = get_conn(&state)?;
    let mut stmt = conn
        .prepare(SELECT_CHAPTERS_BY_PROJECT)
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], row_to_chapter)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn get_chapter(id: i64, state: State<'_, DbState>) -> Result<Chapter, String> {
    let conn = get_conn(&state)?;
    conn.query_row(SELECT_CHAPTER, params![id], row_to_chapter)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_chapter(
    project_id: i64,
    chapter_number: i64,
    title: String,
    summary: String,
    state: State<'_, DbState>,
) -> Result<Chapter, String> {
    let conn = get_conn(&state)?;

    // Auto sort_order: use MAX + 1 for this project
    let max_sort: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM chapters WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let sort_order = max_sort + 1;

    conn.execute(
        "INSERT INTO chapters (project_id, chapter_number, title, summary, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![project_id, chapter_number, title, summary, sort_order],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    conn.query_row(SELECT_CHAPTER, params![id], row_to_chapter)
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct ChapterUpdate {
    pub title: Option<String>,
    pub summary: Option<String>,
    pub goal: Option<String>,
    pub conflict_level: Option<i64>,
    pub hook: Option<String>,
    pub payoff: Option<String>,
    pub must_avoid: Option<String>,
    pub target_word_count: Option<i64>,
}

#[tauri::command]
pub fn update_chapter(
    id: i64,
    fields: ChapterUpdate,
    state: State<'_, DbState>,
) -> Result<Chapter, String> {
    let conn = get_conn(&state)?;

    let mut sets: Vec<String> = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(v) = fields.title {
        sets.push("title = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = fields.summary {
        sets.push("summary = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = fields.goal {
        sets.push("goal = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = fields.conflict_level {
        sets.push("conflict_level = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = fields.hook {
        sets.push("hook = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = fields.payoff {
        sets.push("payoff = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = fields.must_avoid {
        sets.push("must_avoid = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = fields.target_word_count {
        sets.push("target_word_count = ?".to_string());
        param_values.push(Box::new(v));
    }

    if sets.is_empty() {
        return conn.query_row(SELECT_CHAPTER, params![id], row_to_chapter)
            .map_err(|e| e.to_string());
    }

    sets.push("updated_at = datetime('now')".to_string());

    let sql = format!("UPDATE chapters SET {} WHERE id = ?", sets.join(", "));
    param_values.push(Box::new(id));

    let params: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, params.as_slice())
        .map_err(|e| e.to_string())?;

    conn.query_row(SELECT_CHAPTER, params![id], row_to_chapter)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_chapter(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;
    conn.execute("DELETE FROM chapters WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reorder_chapters(
    project_id: i64,
    chapter_ids: Vec<i64>,
    state: State<'_, DbState>,
) -> Result<Vec<Chapter>, String> {
    let conn = get_conn(&state)?;

    for (index, &chapter_id) in chapter_ids.iter().enumerate() {
        let sort_order = index as i64;
        conn.execute(
            "UPDATE chapters SET sort_order = ?1, updated_at = datetime('now') WHERE id = ?2 AND project_id = ?3",
            params![sort_order, chapter_id, project_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Return the updated list in new order
    let mut stmt = conn
        .prepare(SELECT_CHAPTERS_BY_PROJECT)
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], row_to_chapter)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

// --- Chapter Reviews ---

fn row_to_review(row: &rusqlite::Row<'_>) -> rusqlite::Result<ChapterReview> {
    Ok(ChapterReview {
        id: row.get(0)?,
        project_id: row.get(1)?,
        chapter_id: row.get(2)?,
        overall_score: row.get(3)?,
        continuity_score: row.get(4)?,
        character_score: row.get(5)?,
        pacing_score: row.get(6)?,
        issues_json: row.get(7)?,
        suggestions: row.get(8)?,
        created_at: row.get(9)?,
    })
}

const SELECT_REVIEW_COLS: &str = "id, project_id, chapter_id, overall_score, continuity_score, character_score, pacing_score, issues_json, suggestions, created_at";

#[tauri::command]
pub fn list_chapter_reviews(
    project_id: i64,
    chapter_id: i64,
    limit: Option<i64>,
    state: State<'_, DbState>,
) -> Result<Vec<ChapterReview>, String> {
    let conn = get_conn(&state)?;
    let limit_val = limit.unwrap_or(5);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} FROM chapter_reviews WHERE project_id = ?1 AND chapter_id = ?2 ORDER BY created_at DESC LIMIT ?3",
            SELECT_REVIEW_COLS
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id, chapter_id, limit_val], row_to_review)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

/// Internal helper: save a chapter review (called from AI command)
pub fn save_review(
    state: &State<'_, DbState>,
    project_id: i64,
    chapter_id: i64,
    overall_score: i64,
    continuity_score: i64,
    character_score: i64,
    pacing_score: i64,
    issues_json: &str,
    suggestions: &str,
) -> Result<i64, String> {
    let conn = get_conn(state)?;
    conn.execute(
        "INSERT INTO chapter_reviews (project_id, chapter_id, overall_score, continuity_score, character_score, pacing_score, issues_json, suggestions) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![project_id, chapter_id, overall_score, continuity_score, character_score, pacing_score, issues_json, suggestions],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/// Internal helper: get the full chapter row including task sheet fields
pub fn get_chapter_full(state: &State<'_, DbState>, chapter_id: i64) -> Result<Chapter, String> {
    let conn = get_conn(state)?;
    conn.query_row(SELECT_CHAPTER, params![chapter_id], row_to_chapter)
        .map_err(|e| e.to_string())
}
