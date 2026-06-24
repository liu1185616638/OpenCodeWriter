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

/// Run all migrations on the database
pub fn run(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(MIGRATION_001)?;
    Ok(())
}
