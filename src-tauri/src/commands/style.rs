use rusqlite::{params, OptionalExtension};
use tauri::State;

use crate::db::{DbState, get_conn};
use crate::models::StyleConfig;

#[tauri::command]
pub fn copy_style_config(source_project_id: i64, target_project_id: i64, state: State<'_, DbState>) -> Result<StyleConfig, String> {
    let conn = get_conn(&state)?;

    // Get source style config
    let source = conn
        .query_row(SELECT_STYLE, params![source_project_id], row_to_style_config)
        .optional()
        .map_err(|e| e.to_string())?;

    let source = match source {
        Some(sc) => sc,
        None => return Err("源项目没有写作风格配置".to_string()),
    };

    // Upsert target style config with source values
    let existing = conn
        .query_row(SELECT_STYLE, params![target_project_id], row_to_style_config)
        .optional()
        .map_err(|e| e.to_string())?;

    match existing {
        Some(target) => {
            conn.execute(
                "UPDATE style_configs SET reference_text = ?1, narrative_voice = ?2, formality = ?3, emotion_intensity = ?4, custom_stopwords = ?5, updated_at = datetime('now') WHERE id = ?6",
                params![source.reference_text, source.narrative_voice, source.formality, source.emotion_intensity, source.custom_stopwords, target.id],
            )
            .map_err(|e| e.to_string())?;

            conn.query_row(
                "SELECT id, project_id, reference_text, narrative_voice, formality, emotion_intensity, custom_stopwords, updated_at FROM style_configs WHERE id = ?1",
                params![target.id],
                row_to_style_config,
            )
            .map_err(|e| e.to_string())
        }
        None => {
            conn.execute(
                "INSERT INTO style_configs (project_id, reference_text, narrative_voice, formality, emotion_intensity, custom_stopwords) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![target_project_id, source.reference_text, source.narrative_voice, source.formality, source.emotion_intensity, source.custom_stopwords],
            )
            .map_err(|e| e.to_string())?;
            let id = conn.last_insert_rowid();
            conn.query_row(
                "SELECT id, project_id, reference_text, narrative_voice, formality, emotion_intensity, custom_stopwords, updated_at FROM style_configs WHERE id = ?1",
                params![id],
                row_to_style_config,
            )
            .map_err(|e| e.to_string())
        }
    }
}

fn row_to_style_config(row: &rusqlite::Row<'_>) -> Result<StyleConfig, rusqlite::Error> {
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
}

const SELECT_STYLE: &str = "SELECT id, project_id, reference_text, narrative_voice, formality, emotion_intensity, custom_stopwords, updated_at FROM style_configs WHERE project_id = ?1";

#[tauri::command]
pub fn get_style_config(project_id: i64, state: State<'_, DbState>) -> Result<StyleConfig, String> {
    let conn = get_conn(&state)?;

    let existing = conn
        .query_row(SELECT_STYLE, params![project_id], row_to_style_config)
        .optional()
        .map_err(|e| e.to_string())?;

    match existing {
        Some(sc) => Ok(sc),
        None => {
            // Create default style config
            conn.execute(
                "INSERT INTO style_configs (project_id, reference_text, narrative_voice, formality, emotion_intensity, custom_stopwords) VALUES (?1, '', 'third_person', 'moderate', 'moderate', '[]')",
                params![project_id],
            )
            .map_err(|e| e.to_string())?;
            let id = conn.last_insert_rowid();
            conn.query_row(
                "SELECT id, project_id, reference_text, narrative_voice, formality, emotion_intensity, custom_stopwords, updated_at FROM style_configs WHERE id = ?1",
                params![id],
                row_to_style_config,
            )
            .map_err(|e| e.to_string())
        }
    }
}

#[tauri::command]
pub fn save_style_config(
    project_id: i64,
    reference_text: Option<String>,
    narrative_voice: Option<String>,
    formality: Option<String>,
    emotion_intensity: Option<String>,
    custom_stopwords: Option<String>,
    state: State<'_, DbState>,
) -> Result<StyleConfig, String> {
    let conn = get_conn(&state)?;

    let existing = conn
        .query_row(SELECT_STYLE, params![project_id], row_to_style_config)
        .optional()
        .map_err(|e| e.to_string())?;

    match existing {
        Some(sc) => {
            // UPDATE non-None fields
            let reference_text = reference_text.unwrap_or(sc.reference_text);
            let narrative_voice = narrative_voice.unwrap_or(sc.narrative_voice);
            let formality = formality.unwrap_or(sc.formality);
            let emotion_intensity = emotion_intensity.unwrap_or(sc.emotion_intensity);
            let custom_stopwords = custom_stopwords.unwrap_or(sc.custom_stopwords);

            conn.execute(
                "UPDATE style_configs SET reference_text = ?1, narrative_voice = ?2, formality = ?3, emotion_intensity = ?4, custom_stopwords = ?5, updated_at = datetime('now') WHERE id = ?6",
                params![reference_text, narrative_voice, formality, emotion_intensity, custom_stopwords, sc.id],
            )
            .map_err(|e| e.to_string())?;

            conn.query_row(
                "SELECT id, project_id, reference_text, narrative_voice, formality, emotion_intensity, custom_stopwords, updated_at FROM style_configs WHERE id = ?1",
                params![sc.id],
                row_to_style_config,
            )
            .map_err(|e| e.to_string())
        }
        None => {
            let reference_text = reference_text.unwrap_or_default();
            let narrative_voice = narrative_voice.unwrap_or_else(|| "third_person".to_string());
            let formality = formality.unwrap_or_else(|| "moderate".to_string());
            let emotion_intensity = emotion_intensity.unwrap_or_else(|| "moderate".to_string());
            let custom_stopwords = custom_stopwords.unwrap_or_else(|| "[]".to_string());

            conn.execute(
                "INSERT INTO style_configs (project_id, reference_text, narrative_voice, formality, emotion_intensity, custom_stopwords) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![project_id, reference_text, narrative_voice, formality, emotion_intensity, custom_stopwords],
            )
            .map_err(|e| e.to_string())?;
            let id = conn.last_insert_rowid();
            conn.query_row(
                "SELECT id, project_id, reference_text, narrative_voice, formality, emotion_intensity, custom_stopwords, updated_at FROM style_configs WHERE id = ?1",
                params![id],
                row_to_style_config,
            )
            .map_err(|e| e.to_string())
        }
    }
}
