use crate::db::DbState;
use crate::models::{Foreshadow, StoryFact, WorldItem};
use rusqlite::params;

/// get_world_items: 获取世界观条目
pub fn get_world_items(
    args: &serde_json::Value,
    db: &DbState,
) -> Result<serde_json::Value, String> {
    let project_id = args["project_id"]
        .as_i64()
        .ok_or("缺少 project_id 参数")?;

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, item_type, name, description, rules, sort_order, updated_at \
             FROM world_items WHERE project_id = ?1 ORDER BY sort_order",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok(WorldItem {
                id: row.get(0)?,
                project_id: row.get(1)?,
                item_type: row.get(2)?,
                name: row.get(3)?,
                description: row.get(4)?,
                rules: row.get(5)?,
                sort_order: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let items: Vec<WorldItem> = rows.filter_map(|r| r.ok()).collect();
    Ok(serde_json::to_value(&items).map_err(|e| e.to_string())?)
}

/// get_story_facts: 获取故事事实
pub fn get_story_facts(
    args: &serde_json::Value,
    db: &DbState,
) -> Result<serde_json::Value, String> {
    let project_id = args["project_id"]
        .as_i64()
        .ok_or("缺少 project_id 参数")?;
    let limit = args["limit"].as_i64().unwrap_or(30);

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, chapter_id, fact_type, content, confidence, created_at \
             FROM story_facts WHERE project_id = ?1 ORDER BY created_at DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![project_id, limit], |row| {
            Ok(StoryFact {
                id: row.get(0)?,
                project_id: row.get(1)?,
                chapter_id: row.get(2)?,
                fact_type: row.get(3)?,
                content: row.get(4)?,
                confidence: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let facts: Vec<StoryFact> = rows.filter_map(|r| r.ok()).collect();
    Ok(serde_json::to_value(&facts).map_err(|e| e.to_string())?)
}

/// get_foreshadows: 获取伏笔列表
pub fn get_foreshadows(
    args: &serde_json::Value,
    db: &DbState,
) -> Result<serde_json::Value, String> {
    let project_id = args["project_id"]
        .as_i64()
        .ok_or("缺少 project_id 参数")?;

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, setup_chapter_id, payoff_chapter_id, content, status, created_at \
             FROM foreshadows WHERE project_id = ?1 ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok(Foreshadow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                setup_chapter_id: row.get(2)?,
                payoff_chapter_id: row.get(3)?,
                content: row.get(4)?,
                status: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let foreshadows: Vec<Foreshadow> = rows.filter_map(|r| r.ok()).collect();
    Ok(serde_json::to_value(&foreshadows).map_err(|e| e.to_string())?)
}
