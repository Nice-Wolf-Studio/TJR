-- Example migration: Create initial tables
-- Demonstrates basic table creation with foreign keys
--
-- NOTE: This is a SQLite-specific example.
-- For PostgreSQL, replace:
--   - INTEGER PRIMARY KEY AUTOINCREMENT → BIGSERIAL PRIMARY KEY
--   - TEXT → VARCHAR or TEXT (both work in PostgreSQL)
--   - datetime('now') → CURRENT_TIMESTAMP
--
-- See examples/001_create_tables_postgres.sql for PostgreSQL version.

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_posts_user_id ON posts(user_id);