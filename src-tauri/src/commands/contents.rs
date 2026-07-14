use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use tauri::State;

use crate::db::{DbState, get_conn};
use crate::models::{Content, Chapter, ChapterReview};

fn row_to_content(row: &rusqlite::Row<'_>) -> rusqlite::Result<Content> {
    Ok(Content {
        id: row.get(0)?,
        project_id: row.get(1)?,
        chapter_id: row.get(2)?,
        content: row.get(3)?,
        stale: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

const CONTENT_COLS: &str = "id, project_id, chapter_id, content, stale, updated_at";

#[tauri::command]
pub fn get_content(chapter_id: i64, state: State<'_, DbState>) -> Result<Option<Content>, String> {
    let conn = get_conn(&state)?;
    let mut stmt = conn
        .prepare(&format!("SELECT {} FROM contents WHERE chapter_id = ?1", CONTENT_COLS))
        .map_err(|e| e.to_string())?;
    let result = stmt
        .query_row(params![chapter_id], row_to_content)
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub fn save_content(
    project_id: i64,
    chapter_id: i64,
    content: String,
    state: State<'_, DbState>,
) -> Result<Content, String> {
    let conn = get_conn(&state)?;

    let existing: Option<Content> = {
        let mut stmt = conn
            .prepare(&format!("SELECT {} FROM contents WHERE chapter_id = ?1", CONTENT_COLS))
            .map_err(|e| e.to_string())?;
        stmt.query_row(params![chapter_id], row_to_content)
            .optional()
            .map_err(|e| e.to_string())?
    };

    match existing {
        Some(c) => {
            conn.execute(
                "UPDATE contents SET content = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![content, c.id],
            )
            .map_err(|e| e.to_string())?;
            let mut stmt = conn
                .prepare(&format!("SELECT {} FROM contents WHERE id = ?1", CONTENT_COLS))
                .map_err(|e| e.to_string())?;
            stmt.query_row(params![c.id], row_to_content)
                .map_err(|e| e.to_string())
        }
        None => {
            conn.execute(
                "INSERT INTO contents (project_id, chapter_id, content, stale, updated_at) VALUES (?1, ?2, ?3, 0, datetime('now'))",
                params![project_id, chapter_id, content],
            )
            .map_err(|e| e.to_string())?;
            let id = conn.last_insert_rowid();
            let mut stmt = conn
                .prepare(&format!("SELECT {} FROM contents WHERE id = ?1", CONTENT_COLS))
                .map_err(|e| e.to_string())?;
            stmt.query_row(params![id], row_to_content)
                .map_err(|e| e.to_string())
        }
    }
}

#[tauri::command]
pub fn mark_content_stale(chapter_id: i64, stale: bool, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;
    let stale_val = if stale { 1 } else { 0 };
    conn.execute(
        "UPDATE contents SET stale = ?1, updated_at = datetime('now') WHERE chapter_id = ?2",
        params![stale_val, chapter_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_stale_contents(project_id: i64, state: State<'_, DbState>) -> Result<Vec<Content>, String> {
    let conn = get_conn(&state)?;
    let mut stmt = conn
        .prepare(&format!("SELECT {} FROM contents WHERE project_id = ?1 AND stale = 1", CONTENT_COLS))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], row_to_content)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

// --- Content Workspace (Phase E) ---

/// Minimal chapter info for adjacent chapter display.
#[derive(Debug, Serialize)]
pub struct AdjacentChapterInfo {
    pub id: i64,
    pub chapter_number: i64,
    pub title: String,
}

/// Full workspace data for the content editor, loaded in a single call.
#[derive(Debug, Serialize)]
pub struct ContentWorkspace {
    pub chapter: Chapter,
    pub content: Option<Content>,
    /// Previous chapter in sort order (if any)
    pub prev_chapter: Option<AdjacentChapterInfo>,
    /// Next chapter in sort order (if any)
    pub next_chapter: Option<AdjacentChapterInfo>,
    /// Latest review for this chapter (if any)
    pub latest_review: Option<ChapterReview>,
}

/// Get all data needed to open the content editor for a chapter in one call.
#[tauri::command]
pub fn get_content_workspace(
    chapter_id: i64,
    state: State<'_, DbState>,
) -> Result<ContentWorkspace, String> {
    let conn = get_conn(&state)?;

    // Get chapter
    let chapter: Chapter = conn.query_row(
        "SELECT id, project_id, chapter_number, title, summary, sort_order, goal, conflict_level, hook, payoff, must_avoid, target_word_count, viewpoint, scene, cast_character_ids_json, turning_point, outcome, status, updated_at FROM chapters WHERE id = ?1",
        params![chapter_id],
        |row| {
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
                viewpoint: row.get(12)?,
                scene: row.get(13)?,
                cast_character_ids_json: row.get(14)?,
                turning_point: row.get(15)?,
                outcome: row.get(16)?,
                status: row.get(17)?,
                updated_at: row.get(18)?,
            })
        },
    ).map_err(|e| e.to_string())?;

    // Get content
    let content: Option<Content> = {
        let mut stmt = conn
            .prepare(&format!("SELECT {} FROM contents WHERE chapter_id = ?1", CONTENT_COLS))
            .map_err(|e| e.to_string())?;
        stmt.query_row(params![chapter_id], row_to_content)
            .optional()
            .map_err(|e| e.to_string())?
    };

    // Get prev chapter
    let prev_chapter: Option<AdjacentChapterInfo> = conn.query_row(
        "SELECT id, chapter_number, title FROM chapters WHERE project_id = ?1 AND sort_order < ?2 ORDER BY sort_order DESC LIMIT 1",
        params![chapter.project_id, chapter.sort_order],
        |row| Ok(AdjacentChapterInfo {
            id: row.get(0)?,
            chapter_number: row.get(1)?,
            title: row.get(2)?,
        }),
    ).optional().map_err(|e| e.to_string())?;

    // Get next chapter
    let next_chapter: Option<AdjacentChapterInfo> = conn.query_row(
        "SELECT id, chapter_number, title FROM chapters WHERE project_id = ?1 AND sort_order > ?2 ORDER BY sort_order ASC LIMIT 1",
        params![chapter.project_id, chapter.sort_order],
        |row| Ok(AdjacentChapterInfo {
            id: row.get(0)?,
            chapter_number: row.get(1)?,
            title: row.get(2)?,
        }),
    ).optional().map_err(|e| e.to_string())?;

    // Get latest review
    let latest_review: Option<ChapterReview> = conn.query_row(
        "SELECT id, project_id, chapter_id, overall_score, continuity_score, character_score, pacing_score, issues_json, suggestions, created_at FROM chapter_reviews WHERE chapter_id = ?1 ORDER BY created_at DESC LIMIT 1",
        params![chapter_id],
        |row| Ok(ChapterReview {
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
        }),
    ).optional().map_err(|e| e.to_string())?;

    Ok(ContentWorkspace {
        chapter,
        content,
        prev_chapter,
        next_chapter,
        latest_review,
    })
}
