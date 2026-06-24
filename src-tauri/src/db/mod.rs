use rusqlite::{Connection, Result as SqlResult};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub mod migrations;

/// Database state managed by Tauri
pub struct DbState {
    pub conn: Mutex<Connection>,
}

/// Initialize database connection and run migrations
pub fn init_db(app: &AppHandle) -> SqlResult<()> {
    let app_dir = app.path().app_data_dir().expect("failed to resolve app data dir");
    std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");

    let db_path = app_dir.join("data.db");
    let conn = Connection::open(&db_path)?;

    // Enable foreign keys
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    // Run migrations
    migrations::run(&conn)?;

    // Store connection in app state
    app.manage(DbState {
        conn: Mutex::new(conn),
    });

    Ok(())
}

/// Get a locked database connection from Tauri managed state
/// Usage: let conn = get_conn(&state)?;
pub fn get_conn<'a>(state: &'a State<'a, DbState>) -> Result<std::sync::MutexGuard<'a, Connection>, String> {
    state.conn.lock().map_err(|e| e.to_string())
}
