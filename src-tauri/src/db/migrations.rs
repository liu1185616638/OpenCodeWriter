use rusqlite::{Connection, Result as SqlResult};

const MIGRATION_001: &str = "
-- OpenCodeWriter initial schema

-- 模型预设
CREATE TABLE IF NOT EXISTS model_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  api_base TEXT NOT NULL,
  api_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 项目
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  current_stage TEXT DEFAULT 'outline',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 大纲
CREATE TABLE IF NOT EXISTS outlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT DEFAULT '',
  status TEXT DEFAULT 'empty',
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 人物
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tier TEXT NOT NULL,
  identity TEXT DEFAULT '',
  appearance TEXT DEFAULT '',
  personality TEXT DEFAULT '',
  motivation TEXT DEFAULT '',
  relationships TEXT DEFAULT '',
  key_events TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 章节目录
CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 正文
CREATE TABLE IF NOT EXISTS contents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  content TEXT DEFAULT '',
  stale INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 过时标记
CREATE TABLE IF NOT EXISTS stale_markers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id INTEGER,
  source_type TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 写作风格配置
CREATE TABLE IF NOT EXISTS style_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  reference_text TEXT DEFAULT '',
  narrative_voice TEXT DEFAULT 'third_person',
  formality TEXT DEFAULT 'moderate',
  emotion_intensity TEXT DEFAULT 'moderate',
  custom_stopwords TEXT DEFAULT '[]',
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 全局设置
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
";

const MIGRATION_002: &str = "
CREATE TABLE IF NOT EXISTS content_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id INTEGER,
  content TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_content_snapshots_target
ON content_snapshots(project_id, target_type, target_id, created_at);

CREATE TABLE IF NOT EXISTS generation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id INTEGER,
  command TEXT NOT NULL,
  model_name TEXT DEFAULT '',
  status TEXT NOT NULL,
  error TEXT DEFAULT '',
  input_chars INTEGER DEFAULT 0,
  output_chars INTEGER DEFAULT 0,
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT
);
";

const MIGRATION_003: &str = "
CREATE TABLE IF NOT EXISTS project_profiles (
  project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  premise TEXT DEFAULT '',
  genre TEXT DEFAULT '',
  target_audience TEXT DEFAULT '',
  selling_point TEXT DEFAULT '',
  reader_promise TEXT DEFAULT '',
  narrative_pov TEXT DEFAULT 'third_person',
  pace_preference TEXT DEFAULT 'balanced',
  default_chapter_length INTEGER DEFAULT 3000,
  estimated_chapter_count INTEGER DEFAULT 30,
  updated_at TEXT DEFAULT (datetime('now'))
);
";

const MIGRATION_004: &str = "
CREATE TABLE IF NOT EXISTS chapter_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  overall_score INTEGER DEFAULT 0,
  continuity_score INTEGER DEFAULT 0,
  character_score INTEGER DEFAULT 0,
  pacing_score INTEGER DEFAULT 0,
  issues_json TEXT DEFAULT '[]',
  suggestions TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chapter_reviews_chapter
ON chapter_reviews(project_id, chapter_id, created_at);
";

/// Check if a column exists in a table
fn column_exists(conn: &Connection, table: &str, column: &str) -> SqlResult<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let rows = stmt.query_map([], |row| {
        let name: String = row.get(1)?;
        Ok(name)
    })?;
    for row in rows {
        if row? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Safely add a column to a table if it doesn't already exist
fn add_column_if_missing(conn: &Connection, table: &str, column: &str, def: &str) -> SqlResult<()> {
    if !column_exists(conn, table, column)? {
        conn.execute_batch(&format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, def))?;
    }
    Ok(())
}

/// Migrate chapters table: add task sheet fields
fn migrate_chapters_v04(conn: &Connection) -> SqlResult<()> {
    add_column_if_missing(conn, "chapters", "goal", "TEXT DEFAULT ''")?;
    add_column_if_missing(conn, "chapters", "conflict_level", "INTEGER DEFAULT 3")?;
    add_column_if_missing(conn, "chapters", "hook", "TEXT DEFAULT ''")?;
    add_column_if_missing(conn, "chapters", "payoff", "TEXT DEFAULT ''")?;
    add_column_if_missing(conn, "chapters", "must_avoid", "TEXT DEFAULT ''")?;
    add_column_if_missing(conn, "chapters", "target_word_count", "INTEGER DEFAULT 3000")?;
    Ok(())
}

const MIGRATION_005: &str = "
CREATE TABLE IF NOT EXISTS world_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  rules TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS character_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  target_character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  relation_type TEXT DEFAULT '',
  tension TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS character_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  chapter_id INTEGER,
  state_summary TEXT DEFAULT '',
  goal TEXT DEFAULT '',
  emotion TEXT DEFAULT '',
  location TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS story_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id INTEGER,
  fact_type TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS foreshadows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  setup_chapter_id INTEGER,
  payoff_chapter_id INTEGER,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'setup',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_world_items_project
ON world_items(project_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_character_relations_project
ON character_relations(project_id);

CREATE INDEX IF NOT EXISTS idx_character_states_character
ON character_states(project_id, character_id, created_at);

CREATE INDEX IF NOT EXISTS idx_story_facts_project
ON story_facts(project_id, created_at);

CREATE INDEX IF NOT EXISTS idx_foreshadows_project
ON foreshadows(project_id, status);
";

const MIGRATION_006: &str = "
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks USING fts5(
  project_id UNINDEXED,
  source_id UNINDEXED,
  title,
  content,
  source_type UNINDEXED
);

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  raw_content TEXT DEFAULT '',
  chunk_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_project
ON knowledge_sources(project_id, created_at);
";

const MIGRATION_007: &str = "
CREATE TABLE IF NOT EXISTS style_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  content TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS model_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT NOT NULL UNIQUE,
  primary_preset_id INTEGER REFERENCES model_presets(id) ON DELETE SET NULL,
  fallback_preset_id INTEGER REFERENCES model_presets(id) ON DELETE SET NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT DEFAULT '{}',
  result_json TEXT DEFAULT '{}',
  error TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_style_rules_project
ON style_rules(project_id, enabled);

CREATE INDEX IF NOT EXISTS idx_jobs_project
ON jobs(project_id, created_at);
";

const MIGRATION_008: &str = "
CREATE TABLE IF NOT EXISTS tool_call_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  session_id TEXT DEFAULT '',
  tool_name TEXT NOT NULL,
  arguments_json TEXT DEFAULT '{}',
  result_json TEXT DEFAULT '{}',
  success INTEGER DEFAULT 1,
  error TEXT DEFAULT '',
  skill_name TEXT DEFAULT '',
  call_type TEXT DEFAULT 'tool',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tool_call_logs_project
ON tool_call_logs(project_id, created_at);

CREATE INDEX IF NOT EXISTS idx_tool_call_logs_session
ON tool_call_logs(session_id);
";

/// Migrate chapters table: add Phase E task sheet fields
fn migrate_chapters_phase_e(conn: &Connection) -> SqlResult<()> {
    add_column_if_missing(conn, "chapters", "viewpoint", "TEXT DEFAULT ''")?;
    add_column_if_missing(conn, "chapters", "scene", "TEXT DEFAULT ''")?;
    add_column_if_missing(conn, "chapters", "cast_character_ids_json", "TEXT DEFAULT '[]'")?;
    add_column_if_missing(conn, "chapters", "turning_point", "TEXT DEFAULT ''")?;
    add_column_if_missing(conn, "chapters", "outcome", "TEXT DEFAULT ''")?;
    add_column_if_missing(conn, "chapters", "status", "TEXT DEFAULT 'planned'")?;
    Ok(())
}

/// Phase F: Add session_id to generation_logs, progress fields to jobs
fn migrate_phase_f(conn: &Connection) -> SqlResult<()> {
    add_column_if_missing(conn, "generation_logs", "session_id", "TEXT DEFAULT ''")?;
    add_column_if_missing(conn, "generation_logs", "task_type", "TEXT DEFAULT ''")?;
    add_column_if_missing(conn, "jobs", "progress_current", "INTEGER DEFAULT 0")?;
    add_column_if_missing(conn, "jobs", "progress_total", "INTEGER DEFAULT 0")?;
    add_column_if_missing(conn, "jobs", "cancel_requested", "INTEGER DEFAULT 0")?;
    Ok(())
}

/// Phase H: Add performance indexes for project summaries, chapter summaries,
/// task center queries, and asset filtering.
fn migrate_phase_h(conn: &Connection) -> SqlResult<()> {
    // Chapter listing by project ordered by sort_order (list_chapter_workspace_summaries)
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_chapters_project_sort
         ON chapters(project_id, sort_order)"
    )?;

    // Generation logs by project + started_at (task center timeline)
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_generation_logs_project
         ON generation_logs(project_id, started_at)"
    )?;

    // Generation logs by session_id (cancel + retry lookups)
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_generation_logs_session
         ON generation_logs(session_id)"
    )?;

    // Contents by project (project summary aggregation)
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_contents_project
         ON contents(project_id)"
    )?;

    // Stale markers by project (project summary stale count)
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_stale_markers_project
         ON stale_markers(project_id)"
    )?;

    // Characters by project (project summary character count + list_characters)
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_characters_project
         ON characters(project_id, sort_order)"
    )?;

    // Jobs by project + status (task center job filter)
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_jobs_project_status
         ON jobs(project_id, status, created_at)"
    )?;

    Ok(())
}

/// Run all migrations on the database
pub fn run(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(MIGRATION_001)?;
    conn.execute_batch(MIGRATION_002)?;
    conn.execute_batch(MIGRATION_003)?;
    conn.execute_batch(MIGRATION_004)?;
    migrate_chapters_v04(conn)?;
    conn.execute_batch(MIGRATION_005)?;
    conn.execute_batch(MIGRATION_006)?;
    conn.execute_batch(MIGRATION_007)?;
    conn.execute_batch(MIGRATION_008)?;
    migrate_chapters_phase_e(conn)?;
    migrate_phase_f(conn)?;
    migrate_phase_h(conn)?;
    Ok(())
}
