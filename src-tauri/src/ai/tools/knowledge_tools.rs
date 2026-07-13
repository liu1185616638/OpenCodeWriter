use crate::db::DbState;
use crate::models::KnowledgeChunk;
use rusqlite::params;

/// search_knowledge: 在知识库中全文搜索
pub fn search_knowledge(
    args: &serde_json::Value,
    db: &DbState,
) -> Result<serde_json::Value, String> {
    let project_id = args["project_id"]
        .as_i64()
        .ok_or("缺少 project_id 参数")?;
    let query = args["query"]
        .as_str()
        .ok_or("缺少 query 参数")?;
    let limit = args["limit"].as_i64().unwrap_or(5);

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT source_id, title, content, source_type FROM knowledge_chunks \
             WHERE project_id = ?1 AND knowledge_chunks MATCH ?2 \
             ORDER BY rank LIMIT ?3",
        )
        .map_err(|e| format!("知识库搜索失败: {}", e))?;

    let rows = stmt
        .query_map(params![project_id, query, limit], |row| {
            Ok(KnowledgeChunk {
                source_id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                source_type: row.get(3)?,
            })
        })
        .map_err(|e| format!("知识库搜索查询失败: {}", e))?;

    let chunks: Vec<KnowledgeChunk> = rows.filter_map(|r| r.ok()).collect();
    Ok(serde_json::to_value(&chunks).map_err(|e| e.to_string())?)
}
