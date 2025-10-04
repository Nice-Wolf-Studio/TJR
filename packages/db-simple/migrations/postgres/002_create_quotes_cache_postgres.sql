-- Migration: Create quotes_cache table (PostgreSQL)
-- Date: 2025-10-03
-- Description: Creates the quotes_cache table for storing real-time quote snapshots
--              from Databento and other market data providers. Quotes are more
--              transient than bars and have a shorter TTL.

-- Create quotes_cache table
CREATE TABLE IF NOT EXISTS quotes_cache (
  -- Core identification fields
  symbol TEXT NOT NULL,
  timestamp BIGINT NOT NULL,  -- Epoch milliseconds (UTC)

  -- Quote data
  bid_price DOUBLE PRECISION NOT NULL,
  ask_price DOUBLE PRECISION NOT NULL,
  bid_size DOUBLE PRECISION,              -- Optional: bid quantity
  ask_size DOUBLE PRECISION,              -- Optional: ask quantity
  mid_price DOUBLE PRECISION GENERATED ALWAYS AS ((bid_price + ask_price) / 2) STORED,

  -- Metadata
  provider TEXT NOT NULL DEFAULT 'databento',
  fetched_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,

  -- Primary key ensures one quote per symbol per timestamp
  PRIMARY KEY (symbol, timestamp)
);

-- Index for efficient quote lookups (most recent first)
-- Example: SELECT * FROM quotes_cache WHERE symbol = 'ES' ORDER BY timestamp DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_quotes_cache_lookup
  ON quotes_cache (symbol, timestamp DESC);

-- Index for TTL-based cleanup operations
-- Example: DELETE FROM quotes_cache WHERE fetched_at < ?
CREATE INDEX IF NOT EXISTS idx_quotes_cache_fetched
  ON quotes_cache (fetched_at);

-- Index for provider-specific queries
-- Example: SELECT COUNT(*) FROM quotes_cache WHERE provider = 'databento'
CREATE INDEX IF NOT EXISTS idx_quotes_cache_provider
  ON quotes_cache (provider);