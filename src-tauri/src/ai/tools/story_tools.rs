use crate::db::DbState;
use rusqlite::params;

/// create_snapshot: 创建内容快照（受控写入）
pub fn create_snapshot(
    args: &serde_json::Value,
    db: &DbState,
) -> Result<serde_json::Value, String> {
    let project_id = args["project_id"]
        .as_i64()
        .ok_or("缺少 project_id 参数")?;
    let target_type = args["target_type"]
        .as_str()
        .ok_or("缺少 target_type 参数")?;
    let target_id = args["target_id"].as_i64();
    let content = args["content"]
        .as_str()
        .ok_or("缺少 content 参数")?;
    let reason = args["reason"]
        .as_str()
        .ok_or("缺少 reason 参数")?;

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO content_snapshots (project_id, target_type, target_id, content, reason) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![project_id, target_type, target_id, content, reason],
    )
    .map_err(|e| format!("创建快照失败: {}", e))?;

    let snapshot_id = conn.last_insert_rowid();
    Ok(serde_json::json!({ "snapshot_id": snapshot_id }))
}

/// save_chapter_review: 保存章节审核结果（受控写入）
pub fn save_chapter_review(
    args: &serde_json::Value,
    db: &DbState,
) -> Result<serde_json::Value, String> {
    let project_id = args["project_id"]
        .as_i64()
        .ok_or("缺少 project_id 参数")?;
    let chapter_id = args["chapter_id"]
        .as_i64()
        .ok_or("缺少 chapter_id 参数")?;
    let overall_score = args["overall_score"].as_i64().unwrap_or(0);
    let continuity_score = args["continuity_score"].as_i64().unwrap_or(0);
    let character_score = args["character_score"].as_i64().unwrap_or(0);
    let pacing_score = args["pacing_score"].as_i64().unwrap_or(0);
    let issues_json = args["issues_json"]
        .as_str()
        .unwrap_or("[]");
    let suggestions = args["suggestions"]
        .as_str()
        .unwrap_or("");

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO chapter_reviews \
         (project_id, chapter_id, overall_score, continuity_score, character_score, pacing_score, issues_json, suggestions) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            project_id,
            chapter_id,
            overall_score,
            continuity_score,
            character_score,
            pacing_score,
            issues_json,
            suggestions,
        ],
    )
    .map_err(|e| format!("保存审核结果失败: {}", e))?;

    let review_id = conn.last_insert_rowid();
    Ok(serde_json::json!({ "review_id": review_id }))
}

/// save_story_fact: 保存故事事实（受控写入）
pub fn save_story_fact(
    args: &serde_json::Value,
    db: &DbState,
) -> Result<serde_json::Value, String> {
    let project_id = args["project_id"]
        .as_i64()
        .ok_or("缺少 project_id 参数")?;
    let chapter_id = args["chapter_id"].as_i64();
    let fact_type = args["fact_type"]
        .as_str()
        .ok_or("缺少 fact_type 参数")?;
    let content = args["content"]
        .as_str()
        .ok_or("缺少 content 参数")?;
    let confidence = args["confidence"].as_f64().unwrap_or(1.0);

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO story_facts (project_id, chapter_id, fact_type, content, confidence) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![project_id, chapter_id, fact_type, content, confidence],
    )
    .map_err(|e| format!("保存故事事实失败: {}", e))?;

    let fact_id = conn.last_insert_rowid();
    Ok(serde_json::json!({ "fact_id": fact_id }))
}

/// save_foreshadow: 保存伏笔（受控写入）
pub fn save_foreshadow(
    args: &serde_json::Value,
    db: &DbState,
) -> Result<serde_json::Value, String> {
    let project_id = args["project_id"]
        .as_i64()
        .ok_or("缺少 project_id 参数")?;
    let setup_chapter_id = args["setup_chapter_id"].as_i64();
    let payoff_chapter_id = args["payoff_chapter_id"].as_i64();
    let content = args["content"]
        .as_str()
        .ok_or("缺少 content 参数")?;
    let status = args["status"]
        .as_str()
        .unwrap_or("setup");

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO foreshadows (project_id, setup_chapter_id, payoff_chapter_id, content, status) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![project_id, setup_chapter_id, payoff_chapter_id, content, status],
    )
    .map_err(|e| format!("保存伏笔失败: {}", e))?;

    let foreshadow_id = conn.last_insert_rowid();
    Ok(serde_json::json!({ "foreshadow_id": foreshadow_id }))
}
