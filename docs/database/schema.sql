-- =============================================================================
-- TJR Suite Trading Bot - Supabase Database Schema
-- =============================================================================
-- Purpose: Complete database schema for Discord trading bot with market data
--          caching, query logging, trading journal, and analysis tracking.
--
-- Design Principles:
-- - Time-series optimized (BRIN indexes for timestamp columns)
-- - JSONB for flexible metadata storage
-- - TTL-based cache expiration for market data
-- - Comprehensive audit trail via query_log
-- - Materialized view for analytics performance
--
-- Created: 2025-10-04
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. MARKET DATA CACHE TABLE
-- =============================================================================
-- Purpose: Cache Databento market data (OHLCV bars) with TTL-based expiration
-- Cache Strategy: Store bars with expiration timestamp, clean up via cron
-- Performance: BRIN index on bar_timestamp for time-series queries
-- =============================================================================

CREATE TABLE IF NOT EXISTS market_data_cache (
    id BIGSERIAL PRIMARY KEY,

    -- Symbol and timeframe identification
    symbol VARCHAR(20) NOT NULL,  -- e.g., 'ES.FUT', 'NQ.FUT'
    timeframe VARCHAR(10) NOT NULL,  -- e.g., '1h', 'H4', '1d'

    -- Bar timestamp (UTC)
    bar_timestamp TIMESTAMPTZ NOT NULL,

    -- OHLCV data
    open NUMERIC(12, 2) NOT NULL,
    high NUMERIC(12, 2) NOT NULL,
    low NUMERIC(12, 2) NOT NULL,
    close NUMERIC(12, 2) NOT NULL,
    volume BIGINT NOT NULL DEFAULT 0,

    -- Cache metadata
    expires_at TIMESTAMPTZ NOT NULL,  -- TTL expiration timestamp
    cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate bars
    CONSTRAINT unique_bar UNIQUE (symbol, timeframe, bar_timestamp),

    -- Data integrity checks
    CONSTRAINT valid_ohlc CHECK (
        high >= low AND
        high >= open AND
        high >= close AND
        low <= open AND
        low <= close
    )
);

-- Indexes for market_data_cache
CREATE INDEX idx_market_data_symbol_timeframe ON market_data_cache (symbol, timeframe);
CREATE INDEX idx_market_data_bar_timestamp ON market_data_cache USING BRIN (bar_timestamp);
CREATE INDEX idx_market_data_expires_at ON market_data_cache (expires_at)
    WHERE expires_at > NOW();  -- Partial index for active cache entries

-- Comment on table
COMMENT ON TABLE market_data_cache IS
    'Cached Databento market data with TTL-based expiration. ' ||
    'Cleaned up via scheduled job (see cleanup function below).';

COMMENT ON COLUMN market_data_cache.bar_timestamp IS
    'UTC timestamp of the bar. Use BRIN index for time-series queries.';

COMMENT ON COLUMN market_data_cache.expires_at IS
    'Cache expiration timestamp. Rows with expires_at < NOW() are stale.';

-- =============================================================================
-- 2. QUERY LOG TABLE
-- =============================================================================
-- Purpose: Comprehensive audit trail of all Discord bot interactions
-- Analytics: Track user engagement, tool usage, latency, error rates
-- Privacy: Consider PII redaction for user_id/channel_id in production
-- =============================================================================

CREATE TABLE IF NOT EXISTS query_log (
    id BIGSERIAL PRIMARY KEY,

    -- Discord context
    user_id VARCHAR(100) NOT NULL,  -- Discord user ID
    channel_id VARCHAR(100) NOT NULL,  -- Discord channel ID
    conversation_id UUID DEFAULT uuid_generate_v4(),  -- Group related queries

    -- Query metadata
    prompt TEXT NOT NULL,  -- User's original question
    intent VARCHAR(50),  -- 'trading', 'admin', 'general', etc.
    response TEXT,  -- Bot's response

    -- Execution tracking
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error TEXT,  -- Error message if success=false
    latency_ms INTEGER,  -- Response time in milliseconds
    iteration_count INTEGER DEFAULT 1,  -- Number of LLM iterations

    -- Tool usage tracking (JSONB array)
    -- Example: [{"tool": "get_futures_quote", "symbol": "ES", "duration_ms": 150}]
    tools_used JSONB DEFAULT '[]'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for query_log
CREATE INDEX idx_query_log_user_id ON query_log (user_id);
CREATE INDEX idx_query_log_created_at ON query_log USING BRIN (created_at);
CREATE INDEX idx_query_log_intent ON query_log (intent) WHERE intent IS NOT NULL;
CREATE INDEX idx_query_log_success ON query_log (success) WHERE success = FALSE;
CREATE INDEX idx_query_log_tools_used ON query_log USING GIN (tools_used);

-- Comment on table
COMMENT ON TABLE query_log IS
    'Audit trail of all Discord bot interactions. ' ||
    'Used for analytics, debugging, and user behavior tracking.';

COMMENT ON COLUMN query_log.tools_used IS
    'JSONB array of tool executions. Each object contains: ' ||
    '{"tool": "<tool_name>", "duration_ms": <ms>, "success": <bool>}';

COMMENT ON COLUMN query_log.conversation_id IS
    'UUID to group related queries in a conversation thread. ' ||
    'Can be used for multi-turn chat analytics.';

-- =============================================================================
-- 3. TRADES TABLE
-- =============================================================================
-- Purpose: User trading journal with PnL tracking and metadata
-- Analytics: Track win rate, average PnL, session performance
-- Extensibility: JSONB for custom metadata (screenshots, tags, etc.)
-- =============================================================================

CREATE TABLE IF NOT EXISTS trades (
    id BIGSERIAL PRIMARY KEY,

    -- User context
    user_id VARCHAR(100) NOT NULL,  -- Discord user ID

    -- Trade identification
    symbol VARCHAR(20) NOT NULL,  -- e.g., 'ES.FUT', 'NQ.FUT'
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('long', 'short')),

    -- Entry/exit prices
    entry_price NUMERIC(12, 2) NOT NULL,
    exit_price NUMERIC(12, 2),  -- NULL if trade still open

    -- Entry/exit times (UTC)
    entry_time TIMESTAMPTZ NOT NULL,
    exit_time TIMESTAMPTZ,  -- NULL if trade still open

    -- PnL calculation (in points, not dollars)
    pnl NUMERIC(12, 2),  -- NULL if trade still open

    -- Trading context
    session VARCHAR(20),  -- 'asian', 'london', 'ny', etc.
    setup_type VARCHAR(50),  -- 'breakout', 'pullback', 'reversal', etc.
    notes TEXT,  -- User notes about the trade

    -- Metadata (flexible JSONB for screenshots, tags, etc.)
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Data integrity checks
    CONSTRAINT valid_exit_time CHECK (exit_time IS NULL OR exit_time > entry_time),
    CONSTRAINT pnl_requires_exit CHECK (
        (exit_price IS NULL AND exit_time IS NULL AND pnl IS NULL) OR
        (exit_price IS NOT NULL AND exit_time IS NOT NULL AND pnl IS NOT NULL)
    )
);

-- Indexes for trades
CREATE INDEX idx_trades_user_id ON trades (user_id);
CREATE INDEX idx_trades_symbol ON trades (symbol);
CREATE INDEX idx_trades_entry_time ON trades USING BRIN (entry_time);
CREATE INDEX idx_trades_session ON trades (session) WHERE session IS NOT NULL;
CREATE INDEX idx_trades_open_trades ON trades (user_id, exit_time)
    WHERE exit_time IS NULL;  -- Partial index for open positions

-- Comment on table
COMMENT ON TABLE trades IS
    'User trading journal with entry/exit tracking and PnL calculation. ' ||
    'PnL is in points, not dollars (multiply by contract value for P&L).';

COMMENT ON COLUMN trades.pnl IS
    'Profit/Loss in points (not dollars). ' ||
    'For ES: 1 point = $50, for NQ: 1 point = $20.';

COMMENT ON COLUMN trades.metadata IS
    'Flexible JSONB for custom data like screenshots, tags, broker IDs, etc.';

-- =============================================================================
-- 4. ANALYSIS TABLE
-- =============================================================================
-- Purpose: Daily market analysis and bias tracking (ICT methodology)
-- Analytics: Track bias accuracy, break of structure timing, liquidity levels
-- Design: One row per symbol per session per day
-- =============================================================================

CREATE TABLE IF NOT EXISTS analysis (
    id BIGSERIAL PRIMARY KEY,

    -- Symbol and date
    symbol VARCHAR(20) NOT NULL,  -- e.g., 'ES.FUT', 'NQ.FUT'
    analysis_date DATE NOT NULL,

    -- Session context
    session VARCHAR(20) NOT NULL,  -- 'asian', 'london', 'ny', etc.

    -- Daily bias
    bias VARCHAR(10) CHECK (bias IN ('bullish', 'bearish', 'neutral')),

    -- OHLC for the session
    open NUMERIC(12, 2),
    high NUMERIC(12, 2),
    low NUMERIC(12, 2),
    close NUMERIC(12, 2),

    -- Break of structure times (JSONB array)
    -- Example: [{"time": "2025-10-04T09:30:00Z", "type": "bullish", "price": 5750.00}]
    bos_times JSONB DEFAULT '[]'::jsonb,

    -- Liquidity levels (JSONB array)
    -- Example: [{"level": 5800.00, "type": "buy_side", "swept": false}]
    liquidity_levels JSONB DEFAULT '[]'::jsonb,

    -- Notes
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate analysis for same symbol/session/date
    CONSTRAINT unique_analysis UNIQUE (symbol, analysis_date, session)
);

-- Indexes for analysis
CREATE INDEX idx_analysis_symbol_date ON analysis (symbol, analysis_date DESC);
CREATE INDEX idx_analysis_session ON analysis (session);
CREATE INDEX idx_analysis_bias ON analysis (bias) WHERE bias IS NOT NULL;
CREATE INDEX idx_analysis_bos_times ON analysis USING GIN (bos_times);
CREATE INDEX idx_analysis_liquidity_levels ON analysis USING GIN (liquidity_levels);

-- Comment on table
COMMENT ON TABLE analysis IS
    'Daily market analysis and bias tracking using ICT methodology. ' ||
    'One row per symbol per session per day.';

COMMENT ON COLUMN analysis.bos_times IS
    'JSONB array of break of structure events. Each object contains: ' ||
    '{"time": "<ISO8601>", "type": "bullish|bearish", "price": <number>}';

COMMENT ON COLUMN analysis.liquidity_levels IS
    'JSONB array of liquidity levels. Each object contains: ' ||
    '{"level": <price>, "type": "buy_side|sell_side", "swept": <bool>}';

-- =============================================================================
-- 5. QUERY INSIGHTS - MATERIALIZED VIEW
-- =============================================================================
-- Purpose: Pre-aggregated analytics for dashboard queries
-- Refresh Strategy: Manual (REFRESH MATERIALIZED VIEW) or scheduled via cron
-- Performance: Significantly faster than querying query_log directly
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS query_insights AS
SELECT
    -- Time bucketing (hourly aggregation)
    DATE_TRUNC('hour', created_at) AS hour,

    -- Grouping dimensions
    intent,
    success,

    -- Aggregated metrics
    COUNT(*) AS query_count,
    AVG(latency_ms) AS avg_latency_ms,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50_latency_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms,
    AVG(iteration_count) AS avg_iterations,

    -- Tool usage aggregation
    JSONB_AGG(DISTINCT tools_used) FILTER (WHERE tools_used != '[]'::jsonb) AS tools_usage_patterns,

    -- Error analysis
    COUNT(*) FILTER (WHERE success = FALSE) AS error_count,
    JSONB_AGG(DISTINCT error) FILTER (WHERE error IS NOT NULL) AS error_types

FROM query_log
GROUP BY
    DATE_TRUNC('hour', created_at),
    intent,
    success;

-- Indexes for query_insights
CREATE UNIQUE INDEX idx_query_insights_hour_intent_success
    ON query_insights (hour, intent, success);

-- Comment on materialized view
COMMENT ON MATERIALIZED VIEW query_insights IS
    'Pre-aggregated analytics from query_log. ' ||
    'Refresh manually: REFRESH MATERIALIZED VIEW query_insights; ' ||
    'Or schedule via cron for automatic updates.';

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function: Clean up expired cache entries
-- Usage: Schedule via pg_cron or call manually
-- Example: SELECT cleanup_expired_cache();

CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS TABLE (
    deleted_count BIGINT,
    oldest_deleted TIMESTAMPTZ,
    newest_deleted TIMESTAMPTZ
) AS $$
DECLARE
    v_deleted_count BIGINT;
    v_oldest_deleted TIMESTAMPTZ;
    v_newest_deleted TIMESTAMPTZ;
BEGIN
    -- Delete expired cache entries and capture statistics
    WITH deleted AS (
        DELETE FROM market_data_cache
        WHERE expires_at < NOW()
        RETURNING bar_timestamp
    )
    SELECT
        COUNT(*),
        MIN(bar_timestamp),
        MAX(bar_timestamp)
    INTO
        v_deleted_count,
        v_oldest_deleted,
        v_newest_deleted
    FROM deleted;

    -- Return statistics
    RETURN QUERY SELECT
        v_deleted_count,
        v_oldest_deleted,
        v_newest_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_cache() IS
    'Delete expired market data cache entries. ' ||
    'Returns statistics: (deleted_count, oldest_deleted, newest_deleted). ' ||
    'Schedule via pg_cron: SELECT cron.schedule(''0 * * * *'', ''SELECT cleanup_expired_cache()'');';

-- Function: Refresh query insights materialized view
-- Usage: Call after significant query_log changes
-- Example: SELECT refresh_query_insights();

CREATE OR REPLACE FUNCTION refresh_query_insights()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY query_insights;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_query_insights() IS
    'Refresh the query_insights materialized view concurrently. ' ||
    'Schedule via pg_cron for automatic updates: ' ||
    'SELECT cron.schedule(''0 */6 * * *'', ''SELECT refresh_query_insights()'');';

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Trigger: Auto-update updated_at timestamp on trades table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_trades_updated_at
    BEFORE UPDATE ON trades
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Auto-update updated_at timestamp on analysis table
CREATE TRIGGER update_analysis_updated_at
    BEFORE UPDATE ON analysis
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) - OPTIONAL
-- =============================================================================
-- Note: Uncomment these lines if you want to enable RLS for multi-tenant isolation
-- This ensures users can only see their own trades/queries

-- Enable RLS on query_log
-- ALTER TABLE query_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own queries
-- CREATE POLICY user_query_log_policy ON query_log
--     FOR ALL
--     USING (user_id = current_setting('app.current_user_id')::text);

-- Enable RLS on trades
-- ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own trades
-- CREATE POLICY user_trades_policy ON trades
--     FOR ALL
--     USING (user_id = current_setting('app.current_user_id')::text);

-- =============================================================================
-- GRANT PERMISSIONS (Adjust based on your Supabase setup)
-- =============================================================================
-- Note: Replace 'anon' and 'authenticated' with your actual roles

-- Grant read/write access to authenticated users
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
-- GRANT SELECT ON query_insights TO authenticated;

-- Grant read-only access to anonymous users (if needed)
-- GRANT SELECT ON market_data_cache TO anon;
-- GRANT SELECT ON analysis TO anon;

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
