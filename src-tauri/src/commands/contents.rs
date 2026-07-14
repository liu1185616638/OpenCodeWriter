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
    stmt.query_row(params![chapter_id], row_to_content)
        .optional()
        .map_err(|e| e.to_string())
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
        Some(existing_content) => {
            conn.execute(
                "UPDATE contents SET content = ?1, stale = 0, updated_at = datetime('now') WHERE id = ?2",
                params![content, existing_content.id],
            )
            .map_err(|e| e.to_string())?;
            let mut stmt = conn
                .prepare(&format!("SELECT {} FROM contents WHERE id = ?1", CONTENT_COLS))
                .map_err(|e| e.to_string())?;
            stmt.query_row(params![existing_content.id], row_to_content)
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

/// Apply a generated manuscript draft atomically.
///
/// The current manuscript is snapshotted in the same transaction before it is
/// replaced. `expected_updated_at` prevents a draft generated from an older base
/// from overwriting edits made while generation was running.
#[tauri::command]
pub fn apply_content_draft(
    project_id: i64,
    chapter_id: i64,
    content: String,
    expected_updated_at: Option<String>,
    reason: String,
    state: State<'_, DbState>,
) -> Result<Content, String> {
    let mut conn = get_conn(&state)?;
    let transaction = conn.transaction().map_err(|e| e.to_string())?;

    let existing: Option<Content> = {
        let mut stmt = transaction
            .prepare(&format!("SELECT {} FROM contents WHERE chapter_id = ?1", CONTENT_COLS))
            .map_err(|e| e.to_string())?;
        stmt.query_row(params![chapter_id], row_to_content)
            .optional()
            .map_err(|e| e.to_string())?
    };

    let content_id = match existing {
        Some(current) => {
            if let Some(expected) = expected_updated_at.as_deref() {
                if current.updated_at != expected {
                    return Err("正文在生成期间已被修改，请重新生成或手动合并草稿".to_string());
                }
            }

            if current.content != content && !current.content.trim().is_empty() {
                transaction.execute(
                    "INSERT INTO content_snapshots (project_id, target_type, target_id, content, reason) VALUES (?1, 'content', ?2, ?3, ?4)",
                    params![project_id, chapter_id, current.content, reason],
                ).map_err(|e| e.to_string())?;
            }

            transaction.execute(
                "UPDATE contents SET content = ?1, stale = 0, updated_at = datetime('now') WHERE id = ?2",
                params![content, current.id],
            ).map_err(|e| e.to_string())?;
            current.id
        }
        None => {
            if expected_updated_at.is_some() {
                return Err("正文基础版本不存在，请刷新章节后重试".to_string());
            }
            transaction.execute(
                "INSERT INTO contents (project_id, chapter_id, content, stale, updated_at) VALUES (?1, ?2, ?3, 0, datetime('now'))",
                params![project_id, chapter_id, content],
            ).map_err(|e| e.to_string())?;
            transaction.last_insert_rowid()
        }
    };

    let applied = {
        let mut stmt = transaction
            .prepare(&format!("SELECT {} FROM contents WHERE id = ?1", CONTENT_COLS))
            .map_err(|e| e.to_string())?;
        stmt.query_row(params![content_id], row_to_content)
            .map_err(|e| e.to_string())?
    };

    transaction.commit().map_err(|e| e.to_string())?;
    Ok(applied)
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
    let rows = stmt.query_map(params![project_id], row_to_content).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[derive(Debug, Serialize)]
pub struct AdjacentChapterInfo {
    pub id: i64,
    pub chapter_number: i64,
    pub title: String,
}

#[derive(Debug, Serialize)]
pub struct ContentWorkspace {
    pub chapter: Chapter,
    pub content: Option<Content>,
    pub prev_chapter: Option<AdjacentChapterInfo>,
    pub next_chapter: Option<AdjacentChapterInfo>,
    pub latest_review: Option<ChapterReview>,
}

#[tauri::command]
pub fn get_content_workspace(
    chapter_id: i64,
    state: State<'_, DbState>,
) -> Result<ContentWorkspace, String> {
    let conn = get_conn(&state)?;

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

    let content: Option<Content> = {
        let mut stmt = conn
            .prepare(&format!("SELECT {} FROM contents WHERE chapter_id = ?1", CONTENT_COLS))
            .map_err(|e| e.to_string())?;
        stmt.query_row(params![chapter_id], row_to_content)
            .optional()
            .map_err(|e| e.to_string())?
    };

    let prev_chapter = conn.query_row(
        "SELECT id, chapter_number, title FROM chapters WHERE project_id = ?1 AND sort_order < ?2 ORDER BY sort_order DESC LIMIT 1",
        params![chapter.project_id, chapter.sort_order],
        |row| Ok(AdjacentChapterInfo { id: row.get(0)?, chapter_number: row.get(1)?, title: row.get(2)? }),
    ).optional().map_err(|e| e.to_string())?;

    let next_chapter = conn.query_row(
        "SELECT id, chapter_number, title FROM chapters WHERE project_id = ?1 AND sort_order > ?2 ORDER BY sort_order ASC LIMIT 1",
        params![chapter.project_id, chapter.sort_order],
        |row| Ok(AdjacentChapterInfo { id: row.get(0)?, chapter_number: row.get(1)?, title: row.get(2)? }),
    ).optional().map_err(|e| e.to_string())?;

    let latest_review = conn.query_row(
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

    Ok(ContentWorkspace { chapter, content, prev_chapter, next_chapter, latest_review })
}
