-- Migration: Create bars_cache table (SQLite)
-- Date: 2025-09-30
-- Description: Creates the bars_cache table for storing historical OHLC bar data
--              from multiple market data providers with revision tracking and
--              provider priority for intelligent merging.

-- Create bars_cache table
CREATE TABLE IF NOT EXISTS bars_cache (
  -- Core identification fields
  symbol TEXT NOT NULL,
  provider TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  timestamp INTEGER NOT NULL,  -- Epoch milliseconds (UTC)

  -- OHLC price data
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL,

  -- Metadata for data quality and merging
  revision INTEGER NOT NULL DEFAULT 0,
  providerPriority INTEGER NOT NULL DEFAULT 100,
  insertedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),

  -- Composite primary key ensures uniqueness per provider
  PRIMARY KEY (symbol, provider, timeframe, timestamp)
);

-- Index for common query pattern: range queries by symbol and timeframe
-- Example: SELECT * FROM bars_cache WHERE symbol = 'AAPL' AND timeframe = '5m' AND timestamp BETWEEN x AND y
CREATE INDEX IF NOT EXISTS idx_bars_cache_lookup
  ON bars_cache (symbol, timeframe, timestamp);

-- Index for provider-specific queries and data quality audits
-- Example: SELECT DISTINCT symbol FROM bars_cache WHERE provider = 'alpaca'
CREATE INDEX IF NOT EXISTS idx_bars_cache_provider
  ON bars_cache (provider, symbol);