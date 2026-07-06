use rusqlite::params;
use serde::Deserialize;
use tauri::State;

use crate::db::{DbState, get_conn};
use crate::models::ProjectProfile;

fn row_to_profile(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectProfile> {
    Ok(ProjectProfile {
        project_id: row.get(0)?,
        premise: row.get(1)?,
        genre: row.get(2)?,
        target_audience: row.get(3)?,
        selling_point: row.get(4)?,
        reader_promise: row.get(5)?,
        narrative_pov: row.get(6)?,
        pace_preference: row.get(7)?,
        default_chapter_length: row.get(8)?,
        estimated_chapter_count: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

const SELECT_COLS: &str = "project_id, premise, genre, target_audience, selling_point, reader_promise, narrative_pov, pace_preference, default_chapter_length, estimated_chapter_count, updated_at";

#[tauri::command]
pub fn get_project_profile(project_id: i64, state: State<'_, DbState>) -> Result<ProjectProfile, String> {
    let conn = get_conn(&state)?;
    conn.query_row(
        &format!("SELECT {} FROM project_profiles WHERE project_id = ?1", SELECT_COLS),
        params![project_id],
        row_to_profile,
    ).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct ProfileUpdate {
    pub premise: Option<String>,
    pub genre: Option<String>,
    pub target_audience: Option<String>,
    pub selling_point: Option<String>,
    pub reader_promise: Option<String>,
    pub narrative_pov: Option<String>,
    pub pace_preference: Option<String>,
    pub default_chapter_length: Option<i64>,
    pub estimated_chapter_count: Option<i64>,
}

#[tauri::command]
pub fn save_project_profile(project_id: i64, fields: ProfileUpdate, state: State<'_, DbState>) -> Result<ProjectProfile, String> {
    let conn = get_conn(&state)?;

    // Upsert: try insert first, fall back to update
    conn.execute(
        "INSERT OR IGNORE INTO project_profiles (project_id) VALUES (?1)",
        params![project_id],
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE project_profiles SET \
         premise = COALESCE(?2, premise), \
         genre = COALESCE(?3, genre), \
         target_audience = COALESCE(?4, target_audience), \
         selling_point = COALESCE(?5, selling_point), \
         reader_promise = COALESCE(?6, reader_promise), \
         narrative_pov = COALESCE(?7, narrative_pov), \
         pace_preference = COALESCE(?8, pace_preference), \
         default_chapter_length = COALESCE(?9, default_chapter_length), \
         estimated_chapter_count = COALESCE(?10, estimated_chapter_count), \
         updated_at = datetime('now') \
         WHERE project_id = ?1",
        params![
            project_id,
            fields.premise,
            fields.genre,
            fields.target_audience,
            fields.selling_point,
            fields.reader_promise,
            fields.narrative_pov,
            fields.pace_preference,
            fields.default_chapter_length,
            fields.estimated_chapter_count,
        ],
    ).map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("SELECT {} FROM project_profiles WHERE project_id = ?1", SELECT_COLS),
        params![project_id],
        row_to_profile,
    ).map_err(|e| e.to_string())
}

/// Internal helper: get profile for a project (returns default profile if not found)
pub fn get_profile(state: &State<'_, DbState>, project_id: i64) -> Result<Option<ProjectProfile>, String> {
    let conn = get_conn(state)?;
    match conn.query_row(
        &format!("SELECT {} FROM project_profiles WHERE project_id = ?1", SELECT_COLS),
        params![project_id],
        row_to_profile,
    ) {
        Ok(p) => Ok(Some(p)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
