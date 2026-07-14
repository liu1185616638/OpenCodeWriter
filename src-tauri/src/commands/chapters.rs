use crate::db::{DbState, get_conn};
use crate::models::{Chapter, ChapterReview};
use rusqlite::params;
use serde::{Deserialize, Serialize};
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
        viewpoint: row.get(12)?,
        scene: row.get(13)?,
        cast_character_ids_json: row.get(14)?,
        turning_point: row.get(15)?,
        outcome: row.get(16)?,
        status: row.get(17)?,
        updated_at: row.get(18)?,
    })
}

const SELECT_CHAPTER: &str = "SELECT id, project_id, chapter_number, title, summary, sort_order, goal, conflict_level, hook, payoff, must_avoid, target_word_count, viewpoint, scene, cast_character_ids_json, turning_point, outcome, status, updated_at FROM chapters WHERE id = ?1";
const SELECT_CHAPTERS_BY_PROJECT: &str = "SELECT id, project_id, chapter_number, title, summary, sort_order, goal, conflict_level, hook, payoff, must_avoid, target_word_count, viewpoint, scene, cast_character_ids_json, turning_point, outcome, status, updated_at FROM chapters WHERE project_id = ?1 ORDER BY sort_order";

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
    pub viewpoint: Option<String>,
    pub scene: Option<String>,
    pub cast_character_ids_json: Option<String>,
    pub turning_point: Option<String>,
    pub outcome: Option<String>,
    pub status: Option<String>,
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
    if let Some(v) = fields.viewpoint {
        sets.push("viewpoint = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = fields.scene {
        sets.push("scene = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = fields.cast_character_ids_json {
        sets.push("cast_character_ids_json = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = fields.turning_point {
        sets.push("turning_point = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = fields.outcome {
        sets.push("outcome = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = fields.status {
        sets.push("status = ?".to_string());
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

/// Move a single chapter to a new position relative to another chapter.
/// If `before_id` is provided, the chapter is moved before that chapter.
/// If `after_id` is provided, the chapter is moved after that chapter.
/// This avoids the frontend having to submit the full ID list every time.
#[tauri::command]
pub fn move_chapter(
    id: i64,
    before_id: Option<i64>,
    after_id: Option<i64>,
    state: State<'_, DbState>,
) -> Result<Vec<Chapter>, String> {
    let conn = get_conn(&state)?;

    // Get the project_id of the chapter being moved
    let project_id: i64 = conn
        .query_row("SELECT project_id FROM chapters WHERE id = ?1", params![id], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    // Fetch all chapters in current order
    let mut stmt = conn
        .prepare(SELECT_CHAPTERS_BY_PROJECT)
        .map_err(|e| e.to_string())?;
    let chapters: Vec<Chapter> = stmt
        .query_map(params![project_id], row_to_chapter)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Build new order
    let mut new_order: Vec<i64> = chapters.iter().map(|c| c.id).collect();
    new_order.retain(|&cid| cid != id);

    let insert_pos = if let Some(bid) = before_id {
        new_order.iter().position(|&cid| cid == bid).unwrap_or(new_order.len())
    } else if let Some(aid) = after_id {
        new_order.iter().position(|&cid| cid == aid).map(|p| p + 1).unwrap_or(new_order.len())
    } else {
        new_order.len()
    };
    new_order.insert(insert_pos, id);

    // Apply new sort_order
    for (index, &chapter_id) in new_order.iter().enumerate() {
        let sort_order = index as i64;
        conn.execute(
            "UPDATE chapters SET sort_order = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![sort_order, chapter_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Return updated list
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

// --- Chapter Workspace Summaries (Phase E) ---

/// Aggregated summary for a single chapter in the chapter planner.
/// Includes word count, review issue count, and stale status.
#[derive(Debug, Serialize)]
pub struct ChapterWorkspaceSummary {
    pub id: i64,
    pub project_id: i64,
    pub chapter_number: i64,
    pub title: String,
    pub summary: String,
    pub sort_order: i64,
    pub status: String,
    pub viewpoint: String,
    pub conflict_level: i64,
    pub target_word_count: i64,
    /// Actual content word count (character count of content text)
    pub word_count: i64,
    /// Whether content exists for this chapter
    pub has_content: bool,
    /// Whether content is marked stale
    pub content_stale: bool,
    /// Number of issues from latest review
    pub issue_count: i64,
    /// Latest review overall score (0 if none)
    pub latest_review_score: i64,
}

/// List all chapters with aggregated workspace data for the chapter planner.
#[tauri::command]
pub fn list_chapter_workspace_summaries(
    project_id: i64,
    state: State<'_, DbState>,
) -> Result<Vec<ChapterWorkspaceSummary>, String> {
    let conn = get_conn(&state)?;

    let mut stmt = conn.prepare(
        &format!(
            "SELECT
                c.id, c.project_id, c.chapter_number, c.title, c.summary,
                c.sort_order, c.status, c.viewpoint, c.conflict_level, c.target_word_count,
                COALESCE(LENGTH(ct.content), 0) as word_count,
                CASE WHEN ct.content IS NOT NULL AND ct.content != '' THEN 1 ELSE 0 END as has_content,
                COALESCE(ct.stale, 0) as content_stale,
                COALESCE((
                    SELECT json_array_length(cr.issues_json)
                    FROM chapter_reviews cr
                    WHERE cr.chapter_id = c.id
                    ORDER BY cr.created_at DESC LIMIT 1
                ), 0) as issue_count,
                COALESCE((
                    SELECT cr.overall_score 
                    FROM chapter_reviews cr 
                    WHERE cr.chapter_id = c.id 
                    ORDER BY cr.created_at DESC LIMIT 1
                ), 0) as latest_review_score
            FROM chapters c
            LEFT JOIN contents ct ON ct.chapter_id = c.id
            WHERE c.project_id = ?1
            ORDER BY c.sort_order"
        )
    ).map_err(|e| e.to_string())?;

    let summaries = stmt.query_map(params![project_id], |row| {
        Ok(ChapterWorkspaceSummary {
            id: row.get(0)?,
            project_id: row.get(1)?,
            chapter_number: row.get(2)?,
            title: row.get(3)?,
            summary: row.get(4)?,
            sort_order: row.get(5)?,
            status: row.get(6)?,
            viewpoint: row.get(7)?,
            conflict_level: row.get(8)?,
            target_word_count: row.get(9)?,
            word_count: row.get(10)?,
            has_content: row.get::<_, i64>(11)? != 0,
            content_stale: row.get::<_, i64>(12)? != 0,
            issue_count: row.get(13)?,
            latest_review_score: row.get(14)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    Ok(summaries)
}

/// Update the full task sheet for a chapter.
/// Includes all Phase E fields plus version check via expected_updated_at.
#[derive(Debug, Deserialize)]
pub struct ChapterTaskSheetUpdate {
    pub title: Option<String>,
    pub summary: Option<String>,
    pub goal: Option<String>,
    pub conflict_level: Option<i64>,
    pub hook: Option<String>,
    pub payoff: Option<String>,
    pub must_avoid: Option<String>,
    pub target_word_count: Option<i64>,
    pub viewpoint: Option<String>,
    pub scene: Option<String>,
    pub cast_character_ids_json: Option<String>,
    pub turning_point: Option<String>,
    pub outcome: Option<String>,
    pub status: Option<String>,
    /// If provided, the update will fail if the chapter's updated_at doesn't match.
    pub expected_updated_at: Option<String>,
}

#[tauri::command]
pub fn update_chapter_task_sheet(
    id: i64,
    fields: ChapterTaskSheetUpdate,
    state: State<'_, DbState>,
) -> Result<Chapter, String> {
    let conn = get_conn(&state)?;

    // Version check
    if let Some(expected) = &fields.expected_updated_at {
        let actual: String = conn
            .query_row("SELECT updated_at FROM chapters WHERE id = ?1", params![id], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        if &actual != expected {
            return Err(format!("版本冲突：章节已被其他操作修改（期望 {}，实际 {}）", expected, actual));
        }
    }

    let mut sets: Vec<String> = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    macro_rules! add_field {
        ($field:ident, $col:expr) => {
            if let Some(v) = fields.$field {
                sets.push(format!("{} = ?", $col));
                param_values.push(Box::new(v));
            }
        };
    }

    add_field!(title, "title");
    add_field!(summary, "summary");
    add_field!(goal, "goal");
    add_field!(conflict_level, "conflict_level");
    add_field!(hook, "hook");
    add_field!(payoff, "payoff");
    add_field!(must_avoid, "must_avoid");
    add_field!(target_word_count, "target_word_count");
    add_field!(viewpoint, "viewpoint");
    add_field!(scene, "scene");
    add_field!(cast_character_ids_json, "cast_character_ids_json");
    add_field!(turning_point, "turning_point");
    add_field!(outcome, "outcome");
    add_field!(status, "status");

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
