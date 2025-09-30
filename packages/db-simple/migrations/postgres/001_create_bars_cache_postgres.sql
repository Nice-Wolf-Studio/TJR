-- Migration: Create bars_cache table (PostgreSQL)
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
  timestamp BIGINT NOT NULL,  -- Epoch milliseconds (UTC)

  -- OHLC price data (using DOUBLE PRECISION for better accuracy)
  open DOUBLE PRECISION NOT NULL,
  high DOUBLE PRECISION NOT NULL,
  low DOUBLE PRECISION NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION NOT NULL,

  -- Metadata for data quality and merging
  revision INTEGER NOT NULL DEFAULT 0,
  providerPriority INTEGER NOT NULL DEFAULT 100,
  insertedAt BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::BIGINT,

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

-- Note: For production deployments with large datasets, consider:
-- 1. Creating indexes CONCURRENTLY to avoid table locking
-- 2. Partitioning by timeframe or date range for better performance
-- 3. Using tablespaces for different storage tiers (hot/cold data)