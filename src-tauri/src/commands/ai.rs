use futures::StreamExt;
use rusqlite::{params, OptionalExtension};
use tauri::{AppHandle, Manager, State};

use crate::ai::client::{AiClient, ChatMessage};
use crate::ai::context::{ContextBuilder, ChapterTaskSheet};
use crate::ai::events;
use crate::db::{get_conn, DbState};
use crate::models::{Character, Chapter, ModelPreset, StyleConfig};
use serde::Deserialize;

/// Phase 5.4: Resolve preset by task type when preset_id is 0.
/// If preset_id > 0, use it directly (manual selection).
/// If preset_id == 0, look up model_routes for the task type.
fn resolve_preset(state: &State<'_, DbState>, preset_id: i64, task_type: &str) -> Result<ModelPreset, String> {
    if preset_id > 0 {
        return get_preset(state, preset_id);
    }
    // Look up route
    let route_preset_id = crate::commands::model_routes::get_route_preset(state, task_type)?;
    match route_preset_id {
        Some(id) => get_preset(state, id),
        None => Err(format!("未配置模型且任务类型 '{}' 无路由预设，请手动选择模型或配置模型路由", task_type)),
    }
}

fn get_preset(state: &State<'_, DbState>, preset_id: i64) -> Result<ModelPreset, String> {
    let conn = get_conn(state)?;
    conn.query_row(
        "SELECT id, name, api_base, api_key, model_name, created_at FROM model_presets WHERE id = ?1",
        params![preset_id],
        |row| {
            Ok(ModelPreset {
                id: row.get(0)?,
                name: row.get(1)?,
                api_base: row.get(2)?,
                api_key: row.get(3)?,
                model_name: row.get(4)?,
                created_at: row.get(5)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

fn get_outline_content(state: &State<'_, DbState>, project_id: i64) -> Result<String, String> {
    let conn = get_conn(state)?;
    conn.query_row(
        "SELECT content FROM outlines WHERE project_id = ?1",
        params![project_id],
        |row| row.get::<_, String>(0),
    )
    .map_err(|e| format!("获取大纲失败: {}", e))
}

fn get_characters_summary(state: &State<'_, DbState>, project_id: i64) -> Result<String, String> {
    let conn = get_conn(state)?;
    let mut stmt = conn
        .prepare(
            "SELECT name, tier, identity, appearance, personality, motivation, relationships, key_events \
             FROM characters WHERE project_id = ?1 ORDER BY sort_order",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok(Character {
                id: 0,
                project_id,
                name: row.get(0)?,
                tier: row.get(1)?,
                identity: row.get(2)?,
                appearance: row.get(3)?,
                personality: row.get(4)?,
                motivation: row.get(5)?,
                relationships: row.get(6)?,
                key_events: row.get(7)?,
                sort_order: 0,
                updated_at: String::new(),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut summary = String::new();
    for row in rows {
        let c = row.map_err(|e| e.to_string())?;
        summary.push_str(&format!(
            "### {}（{}）\n- 身份：{}\n- 外貌：{}\n- 性格：{}\n- 动机：{}\n- 关系：{}\n- 关键事件：{}\n\n",
            c.name, c.tier, c.identity, c.appearance, c.personality,
            c.motivation, c.relationships, c.key_events,
        ));
    }
    Ok(summary)
}

fn get_project_name(state: &State<'_, DbState>, project_id: i64) -> Result<String, String> {
    let conn = get_conn(state)?;
    conn.query_row(
        "SELECT name FROM projects WHERE id = ?1",
        params![project_id],
        |row| row.get::<_, String>(0),
    )
    .map_err(|e| format!("获取项目名称失败: {}", e))
}

fn get_chapter_full(
    state: &State<'_, DbState>,
    chapter_id: i64,
) -> Result<Chapter, String> {
    crate::commands::chapters::get_chapter_full(state, chapter_id)
}

/// Build a ChapterTaskSheet from a Chapter model
fn chapter_to_task_sheet(ch: &Chapter) -> ChapterTaskSheet {
    ChapterTaskSheet {
        goal: ch.goal.clone(),
        conflict_level: ch.conflict_level,
        hook: ch.hook.clone(),
        payoff: ch.payoff.clone(),
        must_avoid: ch.must_avoid.clone(),
        target_word_count: ch.target_word_count,
    }
}

fn get_previous_content(
    state: &State<'_, DbState>,
    project_id: i64,
    chapter_id: i64,
) -> Result<String, String> {
    let conn = get_conn(state)?;
    // Get the chapter just before the current one by sort_order
    let sort_order: i64 = conn
        .query_row(
            "SELECT sort_order FROM chapters WHERE id = ?1",
            params![chapter_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let prev_chapter_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM chapters WHERE project_id = ?1 AND sort_order < ?2 ORDER BY sort_order DESC LIMIT 1",
            params![project_id, sort_order],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .map(|id: i64| id);

    if let Some(prev_id) = prev_chapter_id {
        conn.query_row(
            "SELECT content FROM contents WHERE chapter_id = ?1",
            params![prev_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())
        .map(|opt| opt.unwrap_or_default())
    } else {
        Ok(String::new())
    }
}

fn get_adjacent_chapters_context(
    state: &State<'_, DbState>,
    project_id: i64,
    chapter_id: i64,
) -> Result<String, String> {
    let conn = get_conn(state)?;
    let sort_order: i64 = conn
        .query_row(
            "SELECT sort_order FROM chapters WHERE id = ?1",
            params![chapter_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let previous = conn
        .query_row(
            "SELECT title, summary FROM chapters WHERE project_id = ?1 AND sort_order < ?2 ORDER BY sort_order DESC LIMIT 1",
            params![project_id, sort_order],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let next = conn
        .query_row(
            "SELECT title, summary FROM chapters WHERE project_id = ?1 AND sort_order > ?2 ORDER BY sort_order ASC LIMIT 1",
            params![project_id, sort_order],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(format_adjacent_chapters_context(previous, next))
}

fn format_adjacent_chapters_context(
    previous: Option<(String, String)>,
    next: Option<(String, String)>,
) -> String {
    if previous.is_none() && next.is_none() {
        return String::new();
    }

    let mut context = String::from("## 相邻章节衔接\n\n");
    if let Some((title, summary)) = previous {
        context.push_str(&format!("上一章《{}》：{}\n", title, summary));
    }
    if let Some((title, summary)) = next {
        context.push_str(&format!("下一章《{}》：{}\n", title, summary));
    }
    context
}

fn get_style_config(
    state: &State<'_, DbState>,
    project_id: i64,
) -> Result<Option<StyleConfig>, String> {
    let conn = get_conn(state)?;
    conn.query_row(
        "SELECT id, project_id, reference_text, narrative_voice, formality, emotion_intensity, custom_stopwords, updated_at \
         FROM style_configs WHERE project_id = ?1",
        params![project_id],
        |row| {
            Ok(StyleConfig {
                id: row.get(0)?,
                project_id: row.get(1)?,
                reference_text: row.get(2)?,
                narrative_voice: row.get(3)?,
                formality: row.get(4)?,
                emotion_intensity: row.get(5)?,
                custom_stopwords: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// Get content text for a chapter (for polish_content)
fn get_content_text(state: &State<'_, DbState>, chapter_id: i64) -> Result<String, String> {
    let conn = get_conn(state)?;
    conn.query_row(
        "SELECT content FROM contents WHERE chapter_id = ?1",
        params![chapter_id],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| e.to_string())
    .and_then(|opt| opt.ok_or_else(|| "该章节暂无正文内容".to_string()))
}

/// Get preset from AppHandle (for use after State has been dropped)
fn get_preset_from_app(app: &AppHandle, preset_id: i64) -> Result<ModelPreset, String> {
    let state = app.state::<DbState>();
    get_preset(&state, preset_id)
}

/// Update chapters with polished title/summary from AI response
fn update_polished_chapters(
    state: &State<'_, DbState>,
    project_id: i64,
    content: &str,
) -> Result<usize, String> {
    let cleaned = strip_thinking_tags(content);
    let json_text = cleaned
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let response: ChaptersResponse = serde_json::from_str(json_text)
        .map_err(|e| format!("章节 JSON 解析失败: {}", e))?;

    let conn = get_conn(state)?;
    let mut updated = 0;

    for ch in &response.chapters {
        if ch.title.trim().is_empty() {
            continue;
        }

        // Update by chapter_number + project_id
        let rows = conn.execute(
            "UPDATE chapters SET title = ?1, summary = ?2, updated_at = datetime('now') \
             WHERE project_id = ?3 AND chapter_number = ?4",
            params![ch.title.trim(), ch.summary.trim(), project_id, ch.chapter_number],
        )
        .map_err(|e| format!("更新章节失败: {}", e))?;

        if rows > 0 {
            updated += rows as usize;
        }
    }

    Ok(updated)
}

/// Context for writing a generation_logs entry
struct GenerationLogContext {
    project_id: Option<i64>,
    target_type: String,
    target_id: Option<i64>,
    command: String,
    model_name: String,
    input_chars: usize,
}

/// Insert a "started" generation log entry, returns the log id (0 on failure or when project_id is None)
fn insert_generation_log(app: &AppHandle, ctx: &GenerationLogContext) -> i64 {
    let project_id = match ctx.project_id {
        Some(id) => id,
        None => return 0, // Skip logging for non-project operations (e.g. idea generation)
    };
    let state = app.state::<DbState>();
    let conn = match get_conn(&state) {
        Ok(c) => c,
        Err(_) => return 0,
    };
    let res = conn.execute(
        "INSERT INTO generation_logs (project_id, target_type, target_id, command, model_name, status, error, input_chars, output_chars, started_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, 'started', '', ?6, 0, datetime('now'))",
        params![project_id, ctx.target_type, ctx.target_id, ctx.command, ctx.model_name, ctx.input_chars as i64],
    );
    if res.is_ok() { conn.last_insert_rowid() } else { 0 }
}

/// Update a generation log entry with final status (best-effort, errors ignored)
fn finish_generation_log(app: &AppHandle, log_id: i64, status: &str, error: &str, output_chars: usize) {
    if log_id <= 0 { return; }
    let state = app.state::<DbState>();
    let conn = match get_conn(&state) {
        Ok(c) => c,
        Err(_) => return,
    };
    let _ = conn.execute(
        "UPDATE generation_logs SET status = ?1, error = ?2, output_chars = ?3, ended_at = datetime('now') WHERE id = ?4",
        params![status, error, output_chars as i64, log_id],
    );
}

async fn stream_and_emit(
    client: &AiClient,
    messages: Vec<ChatMessage>,
    app: &AppHandle,
    session_id: &str,
    log_ctx: &GenerationLogContext,
) -> Result<String, String> {
    let log_id = insert_generation_log(app, log_ctx);
    let mut stream = client.stream_chat(messages);
    let mut full_content = String::new();
    let mut chunk_count: u32 = 0;
    // State machine for detecting <thinking>/皮肤病 tags in content deltas.
    // Models that don't support the reasoning_content SSE field may output
    // thinking text wrapped in these tags directly in the content delta.
    let mut inside_thinking = false;

    while let Some(item) = stream.next().await {
        match item {
            Ok(chunk) => {
                chunk_count += 1;
                eprintln!("[stream] chunk #{} type={} len={}", chunk_count, chunk.chunk_type, chunk.text.len());

                if chunk.chunk_type == "content" {
                    // Try to split <thinking>/皮肤病 tags from content deltas
                    let parts = split_thinking_tags(&chunk.text, &mut inside_thinking);
                    for (text, chunk_type) in parts {
                        if chunk_type == "content" {
                            full_content.push_str(&text);
                        }
                        events::emit_chunk(app, session_id, &text, &chunk_type);
                    }
                } else {
                    // thinking chunks from reasoning_content field — pass through
                    events::emit_chunk(app, session_id, &chunk.text, &chunk.chunk_type);
                }
            }
            Err(e) => {
                eprintln!("[stream] error after {} chunks: {}", chunk_count, e);
                finish_generation_log(app, log_id, "failed", &e, full_content.len());
                events::emit_error(app, session_id, &e);
                return Err(e);
            }
        }
    }

    eprintln!("[stream] done, {} chunks, content len={}", chunk_count, full_content.len());
    finish_generation_log(app, log_id, "success", "", full_content.len());
    events::emit_done(app, session_id);
    Ok(full_content)
}

/// Tag pairs to detect in content deltas.
const THINKING_TAG_PAIRS: &[(&str, &str)] = &[
    ("<thinking>", "</thinking>"),
    ("<think>", "</think>"),
];

/// Split a content delta into (text, chunk_type) pairs by detecting
/// `<thinking>`/`<think>` tags. Maintains `inside_thinking` state across
/// calls to handle tags that span delta boundaries.
///
/// Returns a vec of (text, "thinking"|"content") pairs. Empty strings are
/// not emitted.
fn split_thinking_tags(delta: &str, inside_thinking: &mut bool) -> Vec<(String, String)> {
    let mut results = Vec::new();
    let mut pos = 0;
    let len = delta.len();

    if *inside_thinking {
        // Look for any closing tag
        let mut found_close: Option<(usize, usize, &str)> = None; // (close_start, close_end, close_tag)
        for (_, close_tag) in THINKING_TAG_PAIRS {
            if let Some(idx) = delta.find(close_tag) {
                match found_close {
                    None => found_close = Some((idx, idx + close_tag.len(), *close_tag)),
                    Some((prev_idx, _, _)) if idx < prev_idx => {
                        found_close = Some((idx, idx + close_tag.len(), *close_tag))
                    }
                    _ => {}
                }
            }
        }

        match found_close {
            Some((close_start, close_end, _)) => {
                // Everything before close is thinking
                if close_start > 0 {
                    results.push((delta[..close_start].to_string(), "thinking".to_string()));
                }
                pos = close_end;
                *inside_thinking = false;
            }
            None => {
                // Still inside thinking — entire delta is thinking
                if !delta.is_empty() {
                    results.push((delta.to_string(), "thinking".to_string()));
                }
                return results;
            }
        }
    }

    // Outside thinking — scan for opening tags
    while pos < len {
        let remaining = &delta[pos..];

        // Find the earliest opening tag
        let mut found_open: Option<(usize, usize, usize, &str, &str)> = None;
        // (open_idx_in_remaining, open_end, open_tag_len, open_tag, close_tag)
        for (open_tag, close_tag) in THINKING_TAG_PAIRS {
            if let Some(idx) = remaining.find(open_tag) {
                let open_end = idx + open_tag.len();
                match found_open {
                    None => found_open = Some((idx, open_end, open_tag.len(), *open_tag, *close_tag)),
                    Some((prev_idx, _, _, _, _)) if idx < prev_idx => {
                        found_open = Some((idx, open_end, open_tag.len(), *open_tag, *close_tag))
                    }
                    _ => {}
                }
            }
        }

        match found_open {
            Some((open_idx, open_end, _, _, close_tag)) => {
                // Content before the opening tag
                if open_idx > 0 {
                    let content = remaining[..open_idx].to_string();
                    if !content.is_empty() {
                        results.push((content, "content".to_string()));
                    }
                }

                // Check if closing tag is in the same remaining text
                let after_open = &remaining[open_end..];
                if let Some(close_idx) = after_open.find(close_tag) {
                    // Complete thinking block within this delta
                    let thinking = after_open[..close_idx].to_string();
                    if !thinking.is_empty() {
                        results.push((thinking, "thinking".to_string()));
                    }
                    pos += open_end + close_idx + close_tag.len();
                    // inside_thinking stays false — continue scanning
                } else {
                    // Thinking continues into next delta
                    let thinking = after_open.to_string();
                    if !thinking.is_empty() {
                        results.push((thinking, "thinking".to_string()));
                    }
                    *inside_thinking = true;
                    break;
                }
            }
            None => {
                // No more opening tags — rest is content
                let content = remaining.to_string();
                if !content.is_empty() {
                    results.push((content, "content".to_string()));
                }
                break;
            }
        }
    }

    results
}

#[tauri::command]
pub async fn generate_outline(
    project_id: i64,
    preset_id: i64,
    session_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<String, String> {
    // Fetch data synchronously, drop MutexGuard before async
    let project_name = get_project_name(&state, project_id)?;
    let existing_content = get_outline_content(&state, project_id).unwrap_or_default();
    let profile = crate::commands::profiles::get_profile(&state, project_id)?;
    let preset = resolve_preset(&state, preset_id, "outline")?;
    drop(state);

    let builder = ContextBuilder::new();
    let messages = builder.build_outline_context(&project_name, &existing_content, profile.as_ref());
    let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name.clone());

    let log_ctx = GenerationLogContext {
        project_id: Some(project_id),
        target_type: "outline".to_string(),
        target_id: None,
        command: "generate_outline".to_string(),
        model_name: preset.model_name,
        input_chars: existing_content.len(),
    };

    stream_and_emit(&client, messages, &app, &session_id, &log_ctx).await?;

    Ok(session_id)
}

/// JSON 人物数据结构，用于解析 AI 返回
#[derive(Debug, Deserialize)]
struct CharacterJson {
    name: String,
    tier: String,
    identity: String,
    appearance: String,
    personality: String,
    motivation: String,
    relationships: String,
    key_events: String,
}

#[derive(Debug, Deserialize)]
struct CharactersResponse {
    characters: Vec<CharacterJson>,
}

/// Strip <thinking>...</thinking> tags from content before JSON parsing.
/// Uses manual scan instead of regex crate to avoid adding a dependency.
fn strip_thinking_tags(content: &str) -> String {
    let mut result = String::new();
    let mut pos = 0;
    let open = "<thinking>";
    let close = "</thinking>";

    while let Some(start) = content[pos..].find(open) {
        // Content before the opening tag
        result.push_str(&content[pos..pos + start]);
        let after_open = pos + start + open.len();
        if let Some(end) = content[after_open..].find(close) {
            // Skip the thinking block entirely
            pos = after_open + end + close.len();
        } else {
            // Unclosed thinking tag — skip rest
            break;
        }
    }
    // Remaining content after all thinking blocks
    result.push_str(&content[pos..]);
    result.trim().to_string()
}

/// Parse AI-returned JSON characters and insert into database
fn save_generated_characters(
    state: &State<'_, DbState>,
    project_id: i64,
    content: &str,
) -> Result<usize, String> {
    let cleaned = strip_thinking_tags(content);
    // Some models wrap JSON in code blocks — strip those too
    let json_text = cleaned
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let response: CharactersResponse = serde_json::from_str(json_text)
        .map_err(|e| format!("人物 JSON 解析失败: {}", e))?;

    let conn = get_conn(state)?;
    let mut saved = 0;

    for ch in &response.characters {
        // Skip empty names
        if ch.name.trim().is_empty() {
            continue;
        }

        // Check if character with same name already exists
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM characters WHERE project_id = ?1 AND name = ?2",
                params![project_id, ch.name.trim()],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        if exists {
            continue; // Skip duplicates
        }

        // Auto sort_order: use MAX + 1
        let max_sort: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) FROM characters WHERE project_id = ?1",
                params![project_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        let tier = match ch.tier.as_str() {
            "main" | "supporting" | "minor" => ch.tier.as_str(),
            _ => "supporting", // Default tier for unrecognized values
        };

        conn.execute(
            "INSERT INTO characters (project_id, name, tier, identity, appearance, personality, motivation, relationships, key_events, sort_order) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                project_id,
                ch.name.trim(),
                tier,
                ch.identity.trim(),
                ch.appearance.trim(),
                ch.personality.trim(),
                ch.motivation.trim(),
                ch.relationships.trim(),
                ch.key_events.trim(),
                max_sort + 1,
            ],
        )
        .map_err(|e| format!("插入人物失败: {}", e))?;

        saved += 1;
    }

    Ok(saved)
}

#[tauri::command]
pub async fn generate_characters(
    project_id: i64,
    preset_id: i64,
    session_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let outline_content = get_outline_content(&state, project_id)?;
    let profile = crate::commands::profiles::get_profile(&state, project_id)?;
    let preset = resolve_preset(&state, preset_id, "characters")?;
    drop(state);

    let builder = ContextBuilder::new();
    let messages = builder.build_characters_context(&outline_content, profile.as_ref());
    let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name.clone());

    let log_ctx = GenerationLogContext {
        project_id: Some(project_id),
        target_type: "characters".to_string(),
        target_id: None,
        command: "generate_characters".to_string(),
        model_name: preset.model_name,
        input_chars: outline_content.len(),
    };

    let content = stream_and_emit(&client, messages, &app, &session_id, &log_ctx).await?;

    // Parse JSON and insert characters into database
    let db_state = app.state::<DbState>();
    let count = save_generated_characters(&db_state, project_id, &content)?;
    eprintln!("[generate_characters] saved {} characters", count);

    Ok(session_id)
}

/// JSON 章节数据结构，用于解析 AI 返回
#[derive(Debug, Deserialize)]
struct ChapterJson {
    chapter_number: i64,
    title: String,
    summary: String,
}

#[derive(Debug, Deserialize)]
struct ChaptersResponse {
    chapters: Vec<ChapterJson>,
}

/// Parse AI-returned JSON chapters and insert into database
fn save_generated_chapters(
    state: &State<'_, DbState>,
    project_id: i64,
    content: &str,
) -> Result<usize, String> {
    let cleaned = strip_thinking_tags(content);
    let json_text = cleaned
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let response: ChaptersResponse = serde_json::from_str(json_text)
        .map_err(|e| format!("章节 JSON 解析失败: {}", e))?;

    let conn = get_conn(state)?;
    let mut saved = 0;

    for ch in &response.chapters {
        // Skip entries with empty titles
        if ch.title.trim().is_empty() {
            continue;
        }

        // Check if chapter with same number already exists
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM chapters WHERE project_id = ?1 AND chapter_number = ?2",
                params![project_id, ch.chapter_number],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        if exists {
            continue; // Skip duplicates
        }

        // Auto sort_order: use MAX + 1
        let max_sort: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) FROM chapters WHERE project_id = ?1",
                params![project_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO chapters (project_id, chapter_number, title, summary, sort_order) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                project_id,
                ch.chapter_number,
                ch.title.trim(),
                ch.summary.trim(),
                max_sort + 1,
            ],
        )
        .map_err(|e| format!("插入章节失败: {}", e))?;

        saved += 1;
    }

    Ok(saved)
}

#[tauri::command]
pub async fn generate_chapters(
    project_id: i64,
    preset_id: i64,
    session_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let outline_content = get_outline_content(&state, project_id)?;
    let characters_summary = get_characters_summary(&state, project_id)?;
    let profile = crate::commands::profiles::get_profile(&state, project_id)?;
    let preset = resolve_preset(&state, preset_id, "chapters")?;
    drop(state);

    let builder = ContextBuilder::new();
    let messages = builder.build_chapters_context(&outline_content, &characters_summary, profile.as_ref());
    let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name.clone());

    let log_ctx = GenerationLogContext {
        project_id: Some(project_id),
        target_type: "chapters".to_string(),
        target_id: None,
        command: "generate_chapters".to_string(),
        model_name: preset.model_name,
        input_chars: outline_content.len() + characters_summary.len(),
    };

    let content = stream_and_emit(&client, messages, &app, &session_id, &log_ctx).await?;

    // Parse JSON and insert chapters into database
    let db_state = app.state::<DbState>();
    let count = save_generated_chapters(&db_state, project_id, &content)?;
    eprintln!("[generate_chapters] saved {} chapters", count);

    Ok(session_id)
}

#[tauri::command]
pub async fn generate_content(
    project_id: i64,
    chapter_id: i64,
    preset_id: i64,
    session_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let outline_content = get_outline_content(&state, project_id)?;
    let characters_summary = get_characters_summary(&state, project_id)?;
    let chapter = get_chapter_full(&state, chapter_id)?;
    let style_config = get_style_config(&state, project_id)?;
    let previous_content = get_previous_content(&state, project_id, chapter_id)?;
    let adjacent_chapters_context = get_adjacent_chapters_context(&state, project_id, chapter_id)?;
    let profile = crate::commands::profiles::get_profile(&state, project_id)?;

    // Phase 3.7: Inject world items, character states, facts, foreshadows into context
    let world_summary = crate::commands::world::get_world_items_summary(&state, project_id).unwrap_or_default();
    let char_states_summary = crate::commands::character_assets::get_latest_character_states_summary(&state, project_id).unwrap_or_default();
    let facts_summary = crate::commands::story::get_facts_summary(&state, project_id, 30).unwrap_or_default();
    let foreshadows_summary = crate::commands::story::get_foreshadows_summary(&state, project_id).unwrap_or_default();

    // Phase 4.5: Search knowledge base for relevant chunks
    let knowledge_query = format!("{} {}", chapter.title, chapter.summary);
    let knowledge_summary = crate::commands::knowledge::search_knowledge_for_context(&state, project_id, &knowledge_query, 5).unwrap_or_default();

    // Phase 5.2: Inject enabled style rules
    let style_rules_summary = crate::commands::style_rules::get_enabled_rules_summary(&state, project_id).unwrap_or_default();

    let assets_section = format!("{}{}{}{}{}{}", world_summary, char_states_summary, facts_summary, foreshadows_summary, knowledge_summary, style_rules_summary);

    let preset = resolve_preset(&state, preset_id, "content")?;
    drop(state);

    let builder = ContextBuilder::new();
    let task_sheet = chapter_to_task_sheet(&chapter);
    let messages = builder.build_content_context(
        &outline_content,
        &characters_summary,
        &chapter.title,
        &chapter.summary,
        style_config.as_ref(),
        &previous_content,
        &adjacent_chapters_context,
        profile.as_ref(),
        Some(&task_sheet),
        &assets_section,
    );
    let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name.clone());

    let log_ctx = GenerationLogContext {
        project_id: Some(project_id),
        target_type: "content".to_string(),
        target_id: Some(chapter_id),
        command: "generate_content".to_string(),
        model_name: preset.model_name,
        input_chars: outline_content.len() + characters_summary.len() + chapter.title.len() + chapter.summary.len(),
    };

    stream_and_emit(&client, messages, &app, &session_id, &log_ctx).await?;

    Ok(session_id)
}

/// Phase 3.5: chapter_aftercare — 从本章正文提取新增事实、人物状态、新人物候选、伏笔、下一章衔接
#[tauri::command]
pub async fn chapter_aftercare(
    project_id: i64,
    chapter_id: i64,
    preset_id: i64,
    session_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let outline_content = get_outline_content(&state, project_id)?;
    let characters_summary = get_characters_summary(&state, project_id)?;
    let chapter = get_chapter_full(&state, chapter_id)?;

    // Get chapter content
    let content_text: String = {
        let conn = get_conn(&state)?;
        conn.query_row(
            "SELECT content FROM contents WHERE chapter_id = ?1",
            params![chapter_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_default()
    };

    if content_text.trim().is_empty() {
        return Err("章节正文为空，无法执行后护理".to_string());
    }

    let preset = get_preset(&state, preset_id)?;
    drop(state);

    let builder = ContextBuilder::new();
    let messages = builder.build_aftercare_context(
        &outline_content,
        &characters_summary,
        &chapter.title,
        &chapter.summary,
        &content_text,
    );

    let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name.clone());

    let log_ctx = GenerationLogContext {
        project_id: Some(project_id),
        target_type: "aftercare".to_string(),
        target_id: Some(chapter_id),
        command: "chapter_aftercare".to_string(),
        model_name: preset.model_name,
        input_chars: content_text.len() + outline_content.len() + characters_summary.len(),
    };

    stream_and_emit(&client, messages, &app, &session_id, &log_ctx).await?;

    Ok(session_id)
}

/// Phase 4.6: analyze_text — 对资料生成结构化摘要
#[tauri::command]
pub async fn analyze_text(
    project_id: i64,
    content: String,
    preset_id: i64,
    session_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let preset = get_preset(&state, preset_id)?;
    drop(state);

    let builder = ContextBuilder::new();
    let messages = builder.build_analyze_context(&content);

    let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name.clone());

    let log_ctx = GenerationLogContext {
        project_id: Some(project_id),
        target_type: "knowledge".to_string(),
        target_id: None,
        command: "analyze_text".to_string(),
        model_name: preset.model_name,
        input_chars: content.len(),
    };

    stream_and_emit(&client, messages, &app, &session_id, &log_ctx).await?;

    Ok(session_id)
}

/// Phase 5.1: extract_style_rules — 从参考文本提取写法规则
#[tauri::command]
pub async fn extract_style_rules(
    project_id: i64,
    content: String,
    preset_id: i64,
    session_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let preset = get_preset(&state, preset_id)?;
    drop(state);

    let builder = ContextBuilder::new();
    let messages = builder.build_extract_rules_context(&content);

    let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name.clone());

    let log_ctx = GenerationLogContext {
        project_id: Some(project_id),
        target_type: "style_rules".to_string(),
        target_id: None,
        command: "extract_style_rules".to_string(),
        model_name: preset.model_name,
        input_chars: content.len(),
    };

    stream_and_emit(&client, messages, &app, &session_id, &log_ctx).await?;

    Ok(session_id)
}

#[tauri::command]
pub async fn generate_character_from_description(
    project_id: i64,
    preset_id: i64,
    description: String,
    tier: String,
    session_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let outline_content = get_outline_content(&state, project_id)?;
    let preset = get_preset(&state, preset_id)?;
    drop(state);

    let builder = ContextBuilder::new();
    let messages = builder.build_character_from_description_context(&outline_content, &description, &tier);
    let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name.clone());

    let log_ctx = GenerationLogContext {
        project_id: Some(project_id),
        target_type: "characters".to_string(),
        target_id: None,
        command: "generate_character_from_description".to_string(),
        model_name: preset.model_name,
        input_chars: description.len() + outline_content.len(),
    };

    let content = stream_and_emit(&client, messages, &app, &session_id, &log_ctx).await?;

    // Parse JSON and insert character into database
    let db_state = app.state::<DbState>();
    let count = save_generated_characters(&db_state, project_id, &content)?;
    eprintln!("[generate_character_from_description] saved {} character(s)", count);

    Ok(session_id)
}

#[tauri::command]
pub async fn polish_content(
    project_id: i64,
    chapter_id: i64,
    preset_id: i64,
    session_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let outline_content = get_outline_content(&state, project_id)?;
    let characters_summary = get_characters_summary(&state, project_id)?;
    let chapter = get_chapter_full(&state, chapter_id)?;
    let style_config = get_style_config(&state, project_id)?;
    let original_content = get_content_text(&state, chapter_id)?;
    let preset = resolve_preset(&state, preset_id, "polish")?;

    // Phase 5.2: Inject enabled style rules
    let style_rules_summary = crate::commands::style_rules::get_enabled_rules_summary(&state, project_id).unwrap_or_default();
    drop(state);

    let builder = ContextBuilder::new();
    let messages = builder.build_polish_content_context(
        &outline_content,
        &characters_summary,
        &chapter.title,
        &chapter.summary,
        &original_content,
        style_config.as_ref(),
        &style_rules_summary,
    );
    let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name.clone());

    let log_ctx = GenerationLogContext {
        project_id: Some(project_id),
        target_type: "content".to_string(),
        target_id: Some(chapter_id),
        command: "polish_content".to_string(),
        model_name: preset.model_name,
        input_chars: original_content.len(),
    };

    stream_and_emit(&client, messages, &app, &session_id, &log_ctx).await?;

    Ok(session_id)
}

#[tauri::command]
pub async fn polish_chapter(
    project_id: i64,
    preset_id: i64,
    session_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let outline_content = get_outline_content(&state, project_id)?;
    let characters_summary = get_characters_summary(&state, project_id)?;

    // Build original chapters summary from database
    let chapters: Vec<(i64, String, String)> = {
        let conn = get_conn(&state)?;
        let mut stmt = conn
            .prepare("SELECT chapter_number, title, summary FROM chapters WHERE project_id = ?1 ORDER BY sort_order")
            .map_err(|e| e.to_string())?;
        let result = stmt
            .query_map(params![project_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        result
    };
    drop(state);

    let original_chapters = chapters
        .iter()
        .map(|(num, title, summary)| format!("第{}章 {} —— {}", num, title, summary))
        .collect::<Vec<String>>()
        .join("\n");

    let preset = get_preset_from_app(&app, preset_id)?;

    let builder = ContextBuilder::new();
    let messages = builder.build_polish_chapter_context(&outline_content, &characters_summary, &original_chapters);
    let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name.clone());

    let log_ctx = GenerationLogContext {
        project_id: Some(project_id),
        target_type: "chapters".to_string(),
        target_id: None,
        command: "polish_chapter".to_string(),
        model_name: preset.model_name,
        input_chars: original_chapters.len(),
    };

    let content = stream_and_emit(&client, messages, &app, &session_id, &log_ctx).await?;

    // Parse JSON and update chapters in database
    let db_state = app.state::<DbState>();
    let count = update_polished_chapters(&db_state, project_id, &content)?;
    eprintln!("[polish_chapter] updated {} chapters", count);

    Ok(session_id)
}

/// JSON 方向候选数据结构，用于解析 AI 返回
#[derive(Debug, Deserialize)]
struct DirectionJson {
    title: String,
    genre: String,
    selling_point: String,
    target_audience: String,
    core_conflict: String,
    reader_promise: String,
}

#[derive(Debug, Deserialize)]
struct DirectionsResponse {
    directions: Vec<DirectionJson>,
}

#[tauri::command]
pub async fn generate_idea_directions(
    idea: String,
    preset_id: i64,
    session_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let preset = get_preset(&state, preset_id)?;
    drop(state);

    let builder = ContextBuilder::new();
    let messages = builder.build_idea_directions_context(&idea);
    let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name.clone());

    let log_ctx = GenerationLogContext {
        project_id: None, // 临时项目，不属于任何项目
        target_type: "idea".to_string(),
        target_id: None,
        command: "generate_idea_directions".to_string(),
        model_name: preset.model_name,
        input_chars: idea.len(),
    };

    let content = stream_and_emit(&client, messages, &app, &session_id, &log_ctx).await?;

    // Parse JSON to validate and return structured directions
    let cleaned = strip_thinking_tags(&content);
    let json_text = cleaned
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let _response: DirectionsResponse = serde_json::from_str(json_text)
        .map_err(|e| format!("方向候选 JSON 解析失败: {}", e))?;

    // Return the cleaned JSON content (front-end will parse it)
    Ok(json_text.to_string())
}

#[tauri::command]
pub async fn generate_outline_from_direction(
    project_id: i64,
    direction_json: String,
    preset_id: i64,
    session_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let preset = get_preset(&state, preset_id)?;
    drop(state);

    let builder = ContextBuilder::new();
    let messages = builder.build_outline_from_direction_context(&direction_json);
    let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name.clone());

    let log_ctx = GenerationLogContext {
        project_id: Some(project_id),
        target_type: "outline".to_string(),
        target_id: None,
        command: "generate_outline_from_direction".to_string(),
        model_name: preset.model_name,
        input_chars: direction_json.len(),
    };

    stream_and_emit(&client, messages, &app, &session_id, &log_ctx).await?;

    Ok(session_id)
}

/// JSON 审核结果数据结构，用于解析 AI 返回
#[derive(Debug, serde::Serialize, Deserialize)]
struct ReviewIssueJson {
    #[serde(rename = "type")]
    issue_type: String,
    severity: String,
    description: String,
    location: String,
}

#[derive(Debug, Deserialize)]
struct ReviewResponse {
    overall_score: i64,
    continuity_score: i64,
    character_score: i64,
    pacing_score: i64,
    issues: Vec<ReviewIssueJson>,
    suggestions: String,
}

#[tauri::command]
pub async fn review_chapter_content(
    project_id: i64,
    chapter_id: i64,
    preset_id: i64,
    session_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let outline_content = get_outline_content(&state, project_id)?;
    let characters_summary = get_characters_summary(&state, project_id)?;
    let chapter = get_chapter_full(&state, chapter_id)?;
    let content = get_content_text(&state, chapter_id)?;
    let profile = crate::commands::profiles::get_profile(&state, project_id)?;
    let preset = resolve_preset(&state, preset_id, "review")?;

    // Phase 5.2: Inject enabled style rules
    let style_rules_summary = crate::commands::style_rules::get_enabled_rules_summary(&state, project_id).unwrap_or_default();
    drop(state);

    let builder = ContextBuilder::new();
    let task_sheet = chapter_to_task_sheet(&chapter);
    let messages = builder.build_review_context(
        &outline_content,
        &characters_summary,
        &chapter.title,
        &chapter.summary,
        &content,
        Some(&task_sheet),
        profile.as_ref(),
        &style_rules_summary,
    );
    let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name.clone());

    let log_ctx = GenerationLogContext {
        project_id: Some(project_id),
        target_type: "content".to_string(),
        target_id: Some(chapter_id),
        command: "review_chapter_content".to_string(),
        model_name: preset.model_name.clone(),
        input_chars: content.len() + outline_content.len() + characters_summary.len(),
    };

    let raw_content = stream_and_emit(&client, messages, &app, &session_id, &log_ctx).await?;

    // Parse JSON and save review to database
    let cleaned = strip_thinking_tags(&raw_content);
    let json_text = cleaned
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let review: ReviewResponse = serde_json::from_str(json_text)
        .map_err(|e| format!("审核结果 JSON 解析失败: {}", e))?;

    let issues_json = serde_json::to_string(&review.issues)
        .unwrap_or_else(|_| "[]".to_string());

    let db_state = app.state::<DbState>();
    let _review_id = crate::commands::chapters::save_review(
        &db_state,
        project_id,
        chapter_id,
        review.overall_score,
        review.continuity_score,
        review.character_score,
        review.pacing_score,
        &issues_json,
        &review.suggestions,
    )?;

    eprintln!("[review_chapter_content] saved review for chapter {}", chapter_id);

    Ok(session_id)
}

#[tauri::command]
pub async fn repair_chapter_content(
    project_id: i64,
    chapter_id: i64,
    preset_id: i64,
    session_id: String,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let outline_content = get_outline_content(&state, project_id)?;
    let characters_summary = get_characters_summary(&state, project_id)?;
    let chapter = get_chapter_full(&state, chapter_id)?;
    let original_content = get_content_text(&state, chapter_id)?;
    let profile = crate::commands::profiles::get_profile(&state, project_id)?;

    // Get the latest review for this chapter
    let latest_review = {
        let conn = get_conn(&state)?;
        conn.query_row(
            "SELECT issues_json, suggestions FROM chapter_reviews \
             WHERE project_id = ?1 AND chapter_id = ?2 \
             ORDER BY created_at DESC LIMIT 1",
            params![project_id, chapter_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
    };
    // Phase 5.2: Inject enabled style rules
    let style_rules_summary = crate::commands::style_rules::get_enabled_rules_summary(&state, project_id).unwrap_or_default();
    let preset = resolve_preset(&state, preset_id, "review")?;
    drop(state);

    let (issues_json, suggestions) = latest_review
        .ok_or_else(|| "没有找到审核记录，请先执行 AI 审核".to_string())?;

    let builder = ContextBuilder::new();
    let task_sheet = chapter_to_task_sheet(&chapter);
    let messages = builder.build_repair_context(
        &outline_content,
        &characters_summary,
        &chapter.title,
        &chapter.summary,
        &original_content,
        &issues_json,
        &suggestions,
        Some(&task_sheet),
        profile.as_ref(),
        &style_rules_summary,
    );
    let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name.clone());

    // Capture input_chars before original_content is moved into snapshot
    let input_chars = original_content.len() + issues_json.len();

    // Create a snapshot of the original content BEFORE repair
    // (must happen before stream_and_emit to guarantee snapshot exists before any overwrite)
    let db_state = app.state::<DbState>();
    let _ = crate::commands::snapshots::create_snapshot(
        project_id,
        "content".to_string(),
        Some(chapter_id),
        original_content,
        "AI 修复前快照".to_string(),
        db_state,
    );

    let log_ctx = GenerationLogContext {
        project_id: Some(project_id),
        target_type: "content".to_string(),
        target_id: Some(chapter_id),
        command: "repair_chapter_content".to_string(),
        model_name: preset.model_name,
        input_chars,
    };

    stream_and_emit(&client, messages, &app, &session_id, &log_ctx).await?;

    Ok(session_id)
}

/// Batch generate content for multiple chapters with job tracking
#[tauri::command]
pub async fn batch_generate_chapters(
    project_id: i64,
    chapter_ids: Vec<i64>,
    preset_id: i64,
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<i64, String> {
    // Create a job record
    let payload_json = serde_json::json!({
        "chapter_ids": chapter_ids,
        "completed_chapters": []
    }).to_string();
    let job = crate::commands::jobs::create_job(
        project_id,
        "batch_generate".to_string(),
        payload_json,
        state.clone(),
    )?;

    let job_id = job.id;

    // Update job status to running
    let _ = crate::commands::jobs::update_job_status(job_id, "running".to_string(), None, None, state.clone());

    // Spawn a background task to process chapters
    let app_clone = app.clone();
    let project_id_copy = project_id;
    let preset_id_copy = preset_id;

    tauri::async_runtime::spawn(async move {
        let mut completed_chapters = Vec::new();
        let mut error_msg: Option<String> = None;

        for (idx, chapter_id) in chapter_ids.iter().enumerate() {
            // Generate a unique session ID for each chapter
            let session_id = format!("batch_{}_{}_{}", job_id, chapter_id, uuid::Uuid::new_v4());

            // Get state from app handle
            let db_state = app_clone.state::<DbState>();

            // Try to generate content for this chapter
            match generate_content(project_id_copy, *chapter_id, preset_id_copy, session_id, app_clone.clone(), db_state).await {
                Ok(_) => {
                    completed_chapters.push(*chapter_id);
                    // Update job progress
                    let progress_json = serde_json::json!({
                        "chapter_ids": chapter_ids,
                        "completed_chapters": completed_chapters,
                        "current_index": idx
                    }).to_string();
                    let db_state = app_clone.state::<DbState>();
                    let _ = crate::commands::jobs::update_job_status(
                        job_id,
                        "running".to_string(),
                        Some(progress_json),
                        None,
                        db_state,
                    );
                }
                Err(e) => {
                    error_msg = Some(format!("章节 {} 生成失败: {}", chapter_id, e));
                    break;
                }
            }
        }

        // Update job final status
        let db_state = app_clone.state::<DbState>();
        if error_msg.is_some() {
            let _ = crate::commands::jobs::update_job_status(
                job_id,
                "failed".to_string(),
                None,
                error_msg,
                db_state,
            );
        } else {
            let _ = crate::commands::jobs::update_job_status(
                job_id,
                "completed".to_string(),
                None,
                None,
                db_state,
            );
        }
    });

    Ok(job_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adjacent_chapters_context_formats_previous_and_next_chapters() {
        let context = format_adjacent_chapters_context(
            Some(("码头疑云".to_string(), "主角拿到半张船票，决定追查失踪货船。".to_string())),
            Some(("夜访仓库".to_string(), "主角将顺着船票线索潜入仓库。".to_string())),
        );

        assert!(context.contains("## 相邻章节衔接"));
        assert!(context.contains("上一章《码头疑云》"));
        assert!(context.contains("主角拿到半张船票"));
        assert!(context.contains("下一章《夜访仓库》"));
        assert!(context.contains("潜入仓库"));
    }
}
