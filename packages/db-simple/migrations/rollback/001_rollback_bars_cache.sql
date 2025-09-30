-- Rollback: Drop bars_cache table and indexes
-- Date: 2025-09-30
-- Description: Rolls back the bars_cache table creation migration.
--              This script is database-agnostic (works on both SQLite and PostgreSQL).
--
-- WARNING: This is a destructive operation that will permanently delete all
--          bars_cache data. Always backup your database before running rollbacks.
--
-- Usage:
--   SQLite:  sqlite3 data/app.db < migrations/rollback/001_rollback_bars_cache.sql
--   PostgreSQL: psql $DATABASE_URL -f migrations/rollback/001_rollback_bars_cache.sql

-- Drop indexes first (some databases auto-drop with table, but explicit is clearer)
DROP INDEX IF EXISTS idx_bars_cache_lookup;
DROP INDEX IF EXISTS idx_bars_cache_provider;

-- Drop the table
DROP TABLE IF EXISTS bars_cache;