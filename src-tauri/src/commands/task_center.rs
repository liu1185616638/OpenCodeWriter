use crate::ai::events;
use crate::ai::session_registry::AiSessionRegistry;
use crate::db::{DbState, get_conn};
use rusqlite::params;
use serde::Serialize;
use tauri::{AppHandle, State, Manager};

/// Unified task center item — aggregates jobs, generation_logs, and snapshots
/// into a single timeline for the task drawer and task center page.
#[derive(Debug, Serialize)]
pub struct TaskCenterItem {
    pub id: i64,
    pub item_type: String, // "generation" | "job" | "snapshot"
    pub project_id: i64,
    pub status: String,
    pub task_type: String,
    pub target_type: String,
    pub target_id: Option<i64>,
    pub model_name: String,
    pub error: String,
    pub session_id: String,
    pub progress_current: i64,
    pub progress_total: i64,
    pub input_chars: i64,
    pub output_chars: i64,
    pub created_at: String,
    pub ended_at: Option<String>,
}

fn row_to_task_center_item(row: &rusqlite::Row<'_>, item_type: &str) -> rusqlite::Result<TaskCenterItem> {
    Ok(TaskCenterItem {
        id: row.get(0)?,
        item_type: item_type.to_string(),
        project_id: row.get(1)?,
        status: row.get(2)?,
        task_type: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
        target_type: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
        target_id: row.get(5)?,
        model_name: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
        error: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
        session_id: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
        progress_current: row.get::<_, Option<i64>>(9)?.unwrap_or(0),
        progress_total: row.get::<_, Option<i64>>(10)?.unwrap_or(0),
        input_chars: row.get::<_, Option<i64>>(11)?.unwrap_or(0),
        output_chars: row.get::<_, Option<i64>>(12)?.unwrap_or(0),
        created_at: row.get(13)?,
        ended_at: row.get(14)?,
    })
}

/// List unified task center items for a project.
/// filter: "all" | "running" | "failed" | "completed"
/// Returns items ordered by created_at DESC, limited to `limit` (default 50).
#[tauri::command]
pub fn list_task_center_items(
    project_id: i64,
    filter: Option<String>,
    limit: Option<i64>,
    state: State<'_, DbState>,
) -> Result<Vec<TaskCenterItem>, String> {
    let conn = get_conn(&state)?;
    let limit_val = limit.unwrap_or(50).clamp(1, 200);
    let filter_val = filter.unwrap_or_else(|| "all".to_string());

    let status_filter = match filter_val.as_str() {
        "running" => " AND status IN ('started', 'running', 'pending')",
        "failed" => " AND status IN ('failed', 'timeout', 'cancelled')",
        "completed" => " AND status IN ('success', 'completed')",
        _ => "",
    };

    let mut items = Vec::new();

    let gen_sql = format!(
        "SELECT id, project_id, status, task_type, target_type, target_id, model_name, error, session_id, 0, 0, input_chars, output_chars, started_at, ended_at \
         FROM generation_logs \
         WHERE project_id = ?1{} \
         ORDER BY started_at DESC LIMIT ?2",
        status_filter
    );
    let mut stmt = conn.prepare(&gen_sql).map_err(|e| e.to_string())?;
    let gen_rows = stmt
        .query_map(params![project_id, limit_val], |row| row_to_task_center_item(row, "generation"))
        .map_err(|e| e.to_string())?;
    for row in gen_rows {
        items.push(row.map_err(|e| e.to_string())?);
    }

    let job_status_filter = match filter_val.as_str() {
        "running" => " AND status IN ('running', 'pending')",
        "failed" => " AND status IN ('failed', 'cancelled')",
        "completed" => " AND status = 'completed'",
        _ => "",
    };

    let job_sql = format!(
        "SELECT id, project_id, status, job_type, '', NULL, '', error, '', progress_current, progress_total, 0, 0, created_at, updated_at \
         FROM jobs \
         WHERE project_id = ?1{} \
         ORDER BY created_at DESC LIMIT ?2",
        job_status_filter
    );
    let mut stmt2 = conn.prepare(&job_sql).map_err(|e| e.to_string())?;
    let job_rows = stmt2
        .query_map(params![project_id, limit_val], |row| row_to_task_center_item(row, "job"))
        .map_err(|e| e.to_string())?;
    for row in job_rows {
        items.push(row.map_err(|e| e.to_string())?);
    }

    // Snapshots are immutable completed timeline items. They are excluded from
    // running and failed filters, but visible in all/completed views.
    if filter_val == "all" || filter_val == "completed" {
        let mut snapshot_stmt = conn.prepare(
            "SELECT id, project_id, 'completed', reason, target_type, target_id, '', '', '', 0, 0, 0, length(content), created_at, created_at \
             FROM content_snapshots \
             WHERE project_id = ?1 \
             ORDER BY created_at DESC LIMIT ?2",
        ).map_err(|e| e.to_string())?;
        let snapshot_rows = snapshot_stmt
            .query_map(params![project_id, limit_val], |row| {
                row_to_task_center_item(row, "snapshot")
            })
            .map_err(|e| e.to_string())?;
        for row in snapshot_rows {
            items.push(row.map_err(|e| e.to_string())?);
        }
    }

    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    items.truncate(limit_val as usize);

    Ok(items)
}

/// Cancel an AI session by session_id.
/// 1. Signal the cancellation handle so Runtime waits wake immediately
/// 2. Update the generation_log status to 'cancelled'
/// 3. Emit a dedicated ai-cancelled terminal event
/// 4. Return the session_id for confirmation
#[tauri::command]
pub async fn cancel_ai_session(
    session_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let registry = app.state::<AiSessionRegistry>();
    registry.cancel(&session_id);

    {
        let conn = get_conn(&state)?;
        conn.execute(
            "UPDATE generation_logs SET status = 'cancelled', ended_at = datetime('now') WHERE session_id = ?1 AND status = 'started'",
            params![session_id],
        ).map_err(|e| e.to_string())?;
    }

    events::emit_cancelled(&app, &session_id);

    Ok(session_id)
}

/// Retry a generation by session_id.
/// Returns the original command and arguments so the frontend can re-invoke.
#[derive(Debug, Serialize)]
pub struct RetryInfo {
    pub session_id: String,
    pub original_command: String,
    pub task_type: String,
    pub target_type: String,
    pub target_id: Option<i64>,
    pub project_id: i64,
    pub model_name: String,
}

/// Look up a generation log by session_id and return retry info.
/// The frontend is responsible for re-invoking the original command with
/// a new session_id, since commands require typed parameters.
#[tauri::command]
pub fn get_retry_info(
    session_id: String,
    state: State<'_, DbState>,
) -> Result<RetryInfo, String> {
    let conn = get_conn(&state)?;
    conn.query_row(
        "SELECT command, task_type, target_type, target_id, project_id, model_name \
         FROM generation_logs WHERE session_id = ?1 \
         ORDER BY started_at DESC LIMIT 1",
        params![session_id],
        |row| {
            Ok(RetryInfo {
                session_id: session_id.clone(),
                original_command: row.get(0)?,
                task_type: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                target_type: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                target_id: row.get(3)?,
                project_id: row.get(4)?,
                model_name: row.get(5)?,
            })
        },
    )
    .map_err(|e| format!("找不到 session_id={} 的生成记录: {}", session_id, e))
}
