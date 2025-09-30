-- Test migration for PostgreSQL
-- Creates a simple test table using PostgreSQL-specific syntax

CREATE TABLE test_table (
  id BIGSERIAL PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);