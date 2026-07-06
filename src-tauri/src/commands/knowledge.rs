use crate::db::{DbState, get_conn};
use crate::models::{KnowledgeSource, KnowledgeChunk};
use rusqlite::params;
use tauri::State;

// ===================== Knowledge Sources =====================

fn row_to_source(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeSource> {
    Ok(KnowledgeSource {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        source_type: row.get(3)?,
        raw_content: row.get(4)?,
        chunk_count: row.get(5)?,
        created_at: row.get(6)?,
    })
}

const SOURCE_COLS: &str = "id, project_id, title, source_type, raw_content, chunk_count, created_at";

#[tauri::command]
pub fn list_knowledge_sources(project_id: i64, state: State<'_, DbState>) -> Result<Vec<KnowledgeSource>, String> {
    let conn = get_conn(&state)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} FROM knowledge_sources WHERE project_id = ?1 ORDER BY created_at DESC",
            SOURCE_COLS
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], row_to_source)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn delete_knowledge_source(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = get_conn(&state)?;
    // Delete chunks first (FTS5 table)
    conn.execute("DELETE FROM knowledge_chunks WHERE source_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM knowledge_sources WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ===================== Chunk Splitting =====================

/// Split text into chunks by paragraphs, each chunk up to ~500 chars.
/// Preserves the most recent heading as the chunk title.
fn split_text_into_chunks(content: &str) -> Vec<(String, String)> {
    let max_chunk_size = 500;
    let mut chunks = Vec::new();
    let mut current_title = String::new();
    let mut current_chunk = String::new();

    for line in content.lines() {
        let trimmed = line.trim();

        // Detect markdown headings
        if trimmed.starts_with('#') {
            // If we have accumulated content, save it as a chunk
            if !current_chunk.is_empty() {
                chunks.push((current_title.clone(), current_chunk.trim().to_string()));
                current_chunk.clear();
            }
            current_title = trimmed.trim_start_matches('#').trim().to_string();
            current_chunk.push_str(line);
            current_chunk.push('\n');
            continue;
        }

        current_chunk.push_str(line);
        current_chunk.push('\n');

        // If chunk is large enough and we hit a blank line, save it
        if current_chunk.len() >= max_chunk_size && trimmed.is_empty() {
            chunks.push((current_title.clone(), current_chunk.trim().to_string()));
            current_chunk.clear();
        }
    }

    // Don't forget the last chunk
    if !current_chunk.is_empty() {
        chunks.push((current_title.clone(), current_chunk.trim().to_string()));
    }

    // If no title was set, use a default
    for (title, _) in chunks.iter_mut() {
        if title.is_empty() {
            *title = "（无标题）".to_string();
        }
    }

    chunks
}

// ===================== Import Knowledge =====================

#[tauri::command]
pub fn import_knowledge(
    project_id: i64,
    title: String,
    source_type: String,
    content: String,
    state: State<'_, DbState>,
) -> Result<KnowledgeSource, String> {
    let conn = get_conn(&state)?;

    // Split content into chunks
    let chunks = split_text_into_chunks(&content);

    // Insert source
    conn.execute(
        "INSERT INTO knowledge_sources (project_id, title, source_type, raw_content, chunk_count) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![project_id, title, source_type, content, chunks.len() as i64],
    )
    .map_err(|e| e.to_string())?;

    let source_id = conn.last_insert_rowid();

    // Insert chunks into FTS5 table
    for (chunk_title, chunk_content) in &chunks {
        conn.execute(
            "INSERT INTO knowledge_chunks (project_id, source_id, title, content, source_type) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![project_id, source_id, chunk_title, chunk_content, source_type],
        )
        .map_err(|e| e.to_string())?;
    }

    conn.query_row(
        &format!("SELECT {} FROM knowledge_sources WHERE id = ?1", SOURCE_COLS),
        params![source_id],
        row_to_source,
    )
    .map_err(|e| e.to_string())
}

// ===================== Search =====================

#[tauri::command]
pub fn search_knowledge(
    project_id: i64,
    query: String,
    limit: Option<i64>,
    state: State<'_, DbState>,
) -> Result<Vec<KnowledgeChunk>, String> {
    let conn = get_conn(&state)?;
    let limit_val = limit.unwrap_or(10);

    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    // FTS5 search with snippet
    let mut stmt = conn
        .prepare(
            "SELECT source_id, title, content, source_type \
             FROM knowledge_chunks \
             WHERE project_id = ?1 AND knowledge_chunks MATCH ?2 \
             ORDER BY rank \
             LIMIT ?3"
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![project_id, query, limit_val], |row| {
            Ok(KnowledgeChunk {
                source_id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                source_type: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

// ===================== Internal helper for context injection =====================

pub fn search_knowledge_for_context(
    state: &State<'_, DbState>,
    project_id: i64,
    query: &str,
    limit: usize,
) -> Result<String, String> {
    if query.trim().is_empty() {
        return Ok(String::new());
    }

    let conn = get_conn(state)?;
    let mut stmt = conn
        .prepare(
            "SELECT title, content \
             FROM knowledge_chunks \
             WHERE project_id = ?1 AND knowledge_chunks MATCH ?2 \
             ORDER BY rank \
             LIMIT ?3"
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![project_id, query, limit as i64], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut parts = Vec::new();
    for row in rows {
        let (title, content) = row.map_err(|e| e.to_string())?;
        // Truncate content to avoid prompt explosion
        // Use char boundary to avoid splitting multi-byte UTF-8 characters
        let truncated = if content.len() > 300 {
            let mut end = 300;
            while end > 0 && !content.is_char_boundary(end) {
                end -= 1;
            }
            format!("{}...", &content[..end])
        } else {
            content
        };
        parts.push(format!("- [{}] {}", title, truncated));
    }

    if parts.is_empty() {
        Ok(String::new())
    } else {
        Ok(format!("## 相关资料\n\n{}\n\n", parts.join("\n")))
    }
}
