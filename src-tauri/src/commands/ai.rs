use futures::StreamExt;
use rusqlite::{params, OptionalExtension};
use tauri::{AppHandle, State};

use crate::ai::client::{AiClient, ChatMessage};
use crate::ai::context::ContextBuilder;
use crate::ai::events;
use crate::db::{get_conn, DbState};
use crate::models::{Character, ModelPreset, StyleConfig};

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

fn get_chapter_info(
    state: &State<'_, DbState>,
    chapter_id: i64,
) -> Result<(String, String, i64), String> {
    let conn = get_conn(state)?;
    conn.query_row(
        "SELECT title, summary, project_id FROM chapters WHERE id = ?1",
        params![chapter_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .map_err(|e| format!("获取章节信息失败: {}", e))
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

async fn stream_and_emit(
    client: &AiClient,
    messages: Vec<ChatMessage>,
    app: &AppHandle,
    session_id: &str,
) -> Result<String, String> {
    let mut stream = client.stream_chat(messages);
    let mut full_content = String::new();
    let mut chunk_count: u32 = 0;

    while let Some(item) = stream.next().await {
        match item {
            Ok(chunk) => {
                chunk_count += 1;
                // Only accumulate content (not thinking) for final result
                if chunk.chunk_type == "content" {
                    full_content.push_str(&chunk.text);
                }
                eprintln!("[stream] chunk #{} type={} len={}", chunk_count, chunk.chunk_type, chunk.text.len());
                events::emit_chunk(app, session_id, &chunk.text, &chunk.chunk_type);
            }
            Err(e) => {
                eprintln!("[stream] error after {} chunks: {}", chunk_count, e);
                events::emit_error(app, session_id, &e);
                return Err(e);
            }
        }
    }

    eprintln!("[stream] done, {} chunks, content len={}", chunk_count, full_content.len());
    events::emit_done(app, session_id);
    Ok(full_content)
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
    let preset = get_preset(&state, preset_id)?;
    drop(state);

    let builder = ContextBuilder::new();
    let messages = builder.build_outline_context(&project_name, &existing_content);
    let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name);

    stream_and_emit(&client, messages, &app, &session_id).await?;

    Ok(session_id)
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
    let preset = get_preset(&state, preset_id)?;
    drop(state);

    let builder = ContextBuilder::new();
    let messages = builder.build_characters_context(&outline_content);
    let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name);

    stream_and_emit(&client, messages, &app, &session_id).await?;

    Ok(session_id)
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
    let preset = get_preset(&state, preset_id)?;
    drop(state);

    let builder = ContextBuilder::new();
    let messages = builder.build_chapters_context(&outline_content, &characters_summary);
    let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name);

    stream_and_emit(&client, messages, &app, &session_id).await?;

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
    let (chapter_title, chapter_summary, _) = get_chapter_info(&state, chapter_id)?;
    let style_config = get_style_config(&state, project_id)?;
    let previous_content = get_previous_content(&state, project_id, chapter_id)?;
    let preset = get_preset(&state, preset_id)?;
    drop(state);

    let builder = ContextBuilder::new();
    let messages = builder.build_content_context(
        &outline_content,
        &characters_summary,
        &chapter_title,
        &chapter_summary,
        style_config.as_ref(),
        &previous_content,
    );
    let client = AiClient::new(preset.api_base, preset.api_key, preset.model_name);

    stream_and_emit(&client, messages, &app, &session_id).await?;

    Ok(session_id)
}
