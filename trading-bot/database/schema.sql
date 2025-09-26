-- Trading Bot Database Schema
-- PostgreSQL Schema for comprehensive market data and analysis

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "timescaledb" CASCADE;

-- Drop existing tables if they exist (for development)
DROP TABLE IF EXISTS performance_metrics CASCADE;
DROP TABLE IF EXISTS confluences CASCADE;
DROP TABLE IF EXISTS liquidity_levels CASCADE;
DROP TABLE IF EXISTS price_data CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;
DROP TABLE IF EXISTS markets CASCADE;

-- Markets table - Trading pairs and session information
CREATE TABLE markets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(20) NOT NULL,
    base_currency VARCHAR(10) NOT NULL,
    quote_currency VARCHAR(10) NOT NULL,
    timeframe VARCHAR(10) NOT NULL, -- 1m, 5m, 15m, 1h, 4h, 1d
    exchange VARCHAR(50) NOT NULL,
    session_info JSONB, -- London, New York, Tokyo, Sydney session times
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_market_timeframe UNIQUE (symbol, timeframe, exchange)
);

-- Create indexes for markets table
CREATE INDEX idx_markets_symbol ON markets (symbol);
CREATE INDEX idx_markets_timeframe ON markets (timeframe);
CREATE INDEX idx_markets_active ON markets (is_active);
CREATE INDEX idx_markets_exchange ON markets (exchange);

-- Price data table - OHLCV data with proper indexing for time-series
CREATE TABLE price_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    open_price DECIMAL(20, 8) NOT NULL,
    high_price DECIMAL(20, 8) NOT NULL,
    low_price DECIMAL(20, 8) NOT NULL,
    close_price DECIMAL(20, 8) NOT NULL,
    volume DECIMAL(20, 8) DEFAULT 0,
    tick_volume INTEGER DEFAULT 0,
    spread DECIMAL(10, 5),
    session VARCHAR(20), -- London, NewYork, Tokyo, Sydney
    data_source VARCHAR(50) NOT NULL,
    quality_score DECIMAL(3, 2) DEFAULT 1.0, -- Data quality indicator (0-1)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_price_data UNIQUE (market_id, timestamp, data_source)
);

-- Convert price_data to hypertable for TimescaleDB optimization
SELECT create_hypertable('price_data', 'timestamp', if_not_exists => TRUE);

-- Create indexes for price_data table
CREATE INDEX idx_price_data_market_timestamp ON price_data (market_id, timestamp DESC);
CREATE INDEX idx_price_data_timestamp ON price_data (timestamp DESC);
CREATE INDEX idx_price_data_session ON price_data (session);
CREATE INDEX idx_price_data_source ON price_data (data_source);
CREATE INDEX idx_price_data_quality ON price_data (quality_score);

-- Liquidity levels table - Support/Resistance and liquidity zones
CREATE TABLE liquidity_levels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    level_price DECIMAL(20, 8) NOT NULL,
    level_type VARCHAR(20) NOT NULL, -- support, resistance, demand_zone, supply_zone
    strength DECIMAL(3, 2) NOT NULL, -- Strength score 0-10
    touches INTEGER DEFAULT 1, -- Number of times price touched this level
    session VARCHAR(20), -- Session when level was formed
    timeframe VARCHAR(10) NOT NULL,
    identified_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_tested TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    confluence_factors JSONB, -- Additional confluence data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT check_strength CHECK (strength >= 0 AND strength <= 10)
);

-- Create indexes for liquidity_levels table
CREATE INDEX idx_liquidity_market_level ON liquidity_levels (market_id, level_price);
CREATE INDEX idx_liquidity_type ON liquidity_levels (level_type);
CREATE INDEX idx_liquidity_active ON liquidity_levels (is_active);
CREATE INDEX idx_liquidity_session ON liquidity_levels (session);
CREATE INDEX idx_liquidity_timeframe ON liquidity_levels (timeframe);
CREATE INDEX idx_liquidity_strength ON liquidity_levels (strength DESC);

-- Confluences table - Trading confluences and setups
CREATE TABLE confluences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    confluence_type VARCHAR(50) NOT NULL, -- ict_setup, liquidity_sweep, fair_value_gap, etc.
    weight DECIMAL(3, 2) NOT NULL, -- Weight in confluence calculation (0-1)
    score DECIMAL(5, 2) NOT NULL, -- Overall confluence score
    direction VARCHAR(10), -- bullish, bearish, neutral
    session VARCHAR(20),
    timeframe VARCHAR(10) NOT NULL,
    details JSONB NOT NULL, -- Detailed confluence information
    is_valid BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT check_weight CHECK (weight >= 0 AND weight <= 1),
    CONSTRAINT check_score CHECK (score >= 0)
);

-- Create indexes for confluences table
CREATE INDEX idx_confluences_market_timestamp ON confluences (market_id, timestamp DESC);
CREATE INDEX idx_confluences_type ON confluences (confluence_type);
CREATE INDEX idx_confluences_score ON confluences (score DESC);
CREATE INDEX idx_confluences_direction ON confluences (direction);
CREATE INDEX idx_confluences_session ON confluences (session);
CREATE INDEX idx_confluences_valid ON confluences (is_valid);
CREATE INDEX idx_confluences_expires ON confluences (expires_at) WHERE expires_at IS NOT NULL;

-- User preferences table - User-specific trading preferences and thresholds
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(50) NOT NULL,
    preferred_pairs TEXT[], -- Array of preferred trading pairs
    confluence_threshold DECIMAL(3, 2) DEFAULT 0.7, -- Minimum confluence score
    risk_tolerance VARCHAR(20) DEFAULT 'medium', -- low, medium, high
    sessions_active TEXT[], -- Preferred trading sessions
    timeframes TEXT[], -- Preferred timeframes
    notification_settings JSONB,
    analysis_preferences JSONB, -- ICT concepts preferences
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_user UNIQUE (user_id),
    CONSTRAINT check_confluence_threshold CHECK (confluence_threshold >= 0 AND confluence_threshold <= 1)
);

-- Create indexes for user_preferences table
CREATE INDEX idx_user_preferences_user_id ON user_preferences (user_id);
CREATE INDEX idx_user_preferences_pairs ON user_preferences USING GIN (preferred_pairs);

-- Performance metrics table - Track setup performance and statistics
CREATE TABLE performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    confluence_id UUID REFERENCES confluences(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    setup_type VARCHAR(50) NOT NULL,
    entry_price DECIMAL(20, 8),
    exit_price DECIMAL(20, 8),
    stop_loss DECIMAL(20, 8),
    take_profit DECIMAL(20, 8),
    result VARCHAR(20), -- win, loss, breakeven, pending
    pips_gained DECIMAL(10, 2),
    percentage_return DECIMAL(8, 4),
    risk_reward_ratio DECIMAL(5, 2),
    holding_duration INTERVAL,
    session VARCHAR(20),
    confluence_score DECIMAL(5, 2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance_metrics table
CREATE INDEX idx_performance_market ON performance_metrics (market_id);
CREATE INDEX idx_performance_setup_type ON performance_metrics (setup_type);
CREATE INDEX idx_performance_result ON performance_metrics (result);
CREATE INDEX idx_performance_session ON performance_metrics (session);
CREATE INDEX idx_performance_confluence_score ON performance_metrics (confluence_score DESC);
CREATE INDEX idx_performance_created_at ON performance_metrics (created_at DESC);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at fields
CREATE TRIGGER update_markets_updated_at BEFORE UPDATE ON markets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_liquidity_levels_updated_at BEFORE UPDATE ON liquidity_levels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for common queries
CREATE VIEW active_markets AS
SELECT m.*,
       COUNT(pd.id) as price_data_count,
       MAX(pd.timestamp) as last_price_update
FROM markets m
LEFT JOIN price_data pd ON m.id = pd.market_id
WHERE m.is_active = true
GROUP BY m.id;

CREATE VIEW recent_confluences AS
SELECT c.*, m.symbol, m.timeframe
FROM confluences c
JOIN markets m ON c.market_id = m.id
WHERE c.timestamp >= NOW() - INTERVAL '24 hours'
  AND c.is_valid = true
ORDER BY c.score DESC, c.timestamp DESC;

CREATE VIEW liquidity_summary AS
SELECT
    m.symbol,
    m.timeframe,
    ll.level_type,
    ll.session,
    COUNT(*) as level_count,
    AVG(ll.strength) as avg_strength,
    MAX(ll.strength) as max_strength
FROM liquidity_levels ll
JOIN markets m ON ll.market_id = m.id
WHERE ll.is_active = true
GROUP BY m.symbol, m.timeframe, ll.level_type, ll.session;

-- Add comments for documentation
COMMENT ON TABLE markets IS 'Trading pairs and market session information';
COMMENT ON TABLE price_data IS 'OHLCV price data with TimescaleDB optimization';
COMMENT ON TABLE liquidity_levels IS 'Support/resistance levels and liquidity zones';
COMMENT ON TABLE confluences IS 'Trading confluences and ICT setups';
COMMENT ON TABLE user_preferences IS 'User-specific trading preferences and settings';
COMMENT ON TABLE performance_metrics IS 'Trading setup performance tracking';

-- Grant necessary permissions (adjust as needed for your environment)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO trading_bot_user;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO trading_bot_user;