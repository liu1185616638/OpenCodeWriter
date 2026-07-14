use crate::db::DbState;
use crate::models::{Character, Chapter};
use rusqlite::params;
use serde::Serialize;

/// get_project_profile: 获取项目设定
pub fn get_project_profile(
    args: &serde_json::Value,
    db: &DbState,
) -> Result<serde_json::Value, String> {
    let project_id = args["project_id"]
        .as_i64()
        .ok_or("缺少 project_id 参数")?;

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT project_id, premise, genre, target_audience, selling_point, reader_promise, \
             narrative_pov, pace_preference, default_chapter_length, estimated_chapter_count, updated_at \
             FROM project_profiles WHERE project_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let result = stmt
        .query_row(params![project_id], |row| {
            Ok(serde_json::json!({
                "project_id": row.get::<_, i64>(0)?,
                "premise": row.get::<_, String>(1)?,
                "genre": row.get::<_, String>(2)?,
                "target_audience": row.get::<_, String>(3)?,
                "selling_point": row.get::<_, String>(4)?,
                "reader_promise": row.get::<_, String>(5)?,
                "narrative_pov": row.get::<_, String>(6)?,
                "pace_preference": row.get::<_, String>(7)?,
                "default_chapter_length": row.get::<_, i64>(8)?,
                "estimated_chapter_count": row.get::<_, i64>(9)?,
                "updated_at": row.get::<_, String>(10)?,
            }))
        })
        .map_err(|e| format!("获取项目设定失败: {}", e))?;

    Ok(result)
}

/// get_outline: 获取大纲内容
pub fn get_outline(args: &serde_json::Value, db: &DbState) -> Result<serde_json::Value, String> {
    let project_id = args["project_id"]
        .as_i64()
        .ok_or("缺少 project_id 参数")?;

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let result = conn
        .query_row(
            "SELECT content, status FROM outlines WHERE project_id = ?1",
            params![project_id],
            |row| {
                Ok(serde_json::json!({
                    "content": row.get::<_, String>(0)?,
                    "status": row.get::<_, String>(1)?,
                }))
            },
        )
        .map_err(|e| format!("获取大纲失败: {}", e))?;

    Ok(result)
}

/// get_characters: 获取人物列表
pub fn get_characters(
    args: &serde_json::Value,
    db: &DbState,
) -> Result<serde_json::Value, String> {
    let project_id = args["project_id"]
        .as_i64()
        .ok_or("缺少 project_id 参数")?;

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, name, tier, identity, appearance, personality, motivation, \
             relationships, key_events, sort_order, updated_at \
             FROM characters WHERE project_id = ?1 ORDER BY sort_order",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok(Character {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                tier: row.get(3)?,
                identity: row.get(4)?,
                appearance: row.get(5)?,
                personality: row.get(6)?,
                motivation: row.get(7)?,
                relationships: row.get(8)?,
                key_events: row.get(9)?,
                sort_order: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let characters: Vec<Character> = rows.filter_map(|r| r.ok()).collect();
    Ok(serde_json::to_value(&characters).map_err(|e| e.to_string())?)
}

/// get_chapters: 获取章节目录
pub fn get_chapters(
    args: &serde_json::Value,
    db: &DbState,
) -> Result<serde_json::Value, String> {
    let project_id = args["project_id"]
        .as_i64()
        .ok_or("缺少 project_id 参数")?;

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, chapter_number, title, summary, sort_order, goal, \
             conflict_level, hook, payoff, must_avoid, target_word_count, \
             viewpoint, scene, cast_character_ids_json, turning_point, outcome, status, updated_at \
             FROM chapters WHERE project_id = ?1 ORDER BY sort_order",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![project_id], |row| {
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
        })
        .map_err(|e| e.to_string())?;

    let chapters: Vec<Chapter> = rows.filter_map(|r| r.ok()).collect();
    Ok(serde_json::to_value(&chapters).map_err(|e| e.to_string())?)
}
