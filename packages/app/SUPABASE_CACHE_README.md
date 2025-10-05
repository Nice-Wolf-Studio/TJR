# Supabase Market Data Cache - Implementation Guide

## Overview

Phase 1B implementation: Supabase-backed caching layer for Databento MCP historical bars.

**Files Created:**
- `/packages/app/src/services/supabase-market-cache.service.ts` - Core cache service
- `/packages/app/src/services/databento-cache-wrapper.ts` - MCP integration wrapper
- `/packages/app/examples/supabase-cache-demo.ts` - Usage demonstration
- `/packages/app/examples/cache-logging-example.md` - Logging documentation

**Dependencies Added:**
- `@supabase/supabase-js` (v2.58.0)

---

## Features

### 1. SupabaseMarketCacheService

Core caching service with the following capabilities:

#### Methods

- **`getHistoricalBars(symbol, timeframe, count, databentoFetcher)`**
  - Cache-first strategy: Check cache → Databento MCP → Cache result
  - Returns cached data if >= 90% of requested bars are available
  - Automatically caches fresh data asynchronously (non-blocking)

- **`getCachedBars(symbol, timeframe, count)`**
  - Direct cache lookup for testing/debugging
  - Returns only non-expired bars
  - Sorted by timestamp (oldest to newest)

- **`cacheBars(symbol, timeframe, bars)`**
  - Upsert strategy (ON CONFLICT update)
  - Sets expires_at based on timeframe TTL
  - Handles duplicates gracefully

- **`getTTL(timeframe)`**
  - Returns TTL in milliseconds for given timeframe
  - Default values:
    - `1m`: 1 minute (60,000 ms)
    - `5m`: 5 minutes (300,000 ms)
    - `1h`: 1 hour (3,600,000 ms)
    - `1d`: 24 hours (86,400,000 ms)
  - Unknown timeframes default to 1 hour

- **`cleanupExpiredCache()`**
  - Deletes expired cache entries (expires_at < NOW)
  - Returns count of deleted rows
  - Should be run periodically (cron job or scheduled task)

- **`getCacheStats()`**
  - Returns cache statistics:
    - `totalBars`: All rows in table
    - `expiredBars`: Expired entries
    - `activeBars`: Non-expired entries

#### Error Handling

- **Graceful fallback**: Cache errors don't block data delivery
- **Cache read failure**: Falls back to Databento MCP
- **Cache write failure**: Logs error but delivers data to user
- **All errors logged**: Comprehensive error context for debugging

---

### 2. DatabentoCacheWrapper

Transparent caching layer that wraps McpClientService:

#### Behavior

- **Intercepts `databento__get_historical_bars`**: Routes through cache
- **Passes through all other tools**: No overhead for non-historical data
- **MCP-compatible interface**: Drop-in replacement for McpClientService

#### Usage

```typescript
import { DatabentoCacheWrapper } from './services/databento-cache-wrapper';
import { McpClientService } from './services/mcp-client.service';

// Initialize MCP client
const mcpClient = new McpClientService(logger);
await mcpClient.initialize();

// Wrap with caching layer
const cachedClient = new DatabentoCacheWrapper({
  mcpClient: mcpClient,
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_KEY!,
  logger: logger.child({ service: 'cache-wrapper' })
});

// Use like normal MCP client (transparent caching)
const result = await cachedClient.executeTool('databento__get_historical_bars', {
  symbol: 'ES',
  timeframe: '1h',
  count: 24
});
```

---

## Configuration

### Environment Variables

Add to `.env`:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_or_service_key
```

### Supabase Setup

#### 1. Create Database Table

Run the schema from `/docs/database/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS market_data_cache (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    timeframe VARCHAR(10) NOT NULL,
    bar_timestamp TIMESTAMPTZ NOT NULL,
    open NUMERIC(12, 2) NOT NULL,
    high NUMERIC(12, 2) NOT NULL,
    low NUMERIC(12, 2) NOT NULL,
    close NUMERIC(12, 2) NOT NULL,
    volume BIGINT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_bar UNIQUE (symbol, timeframe, bar_timestamp)
);

-- Indexes
CREATE INDEX idx_market_data_symbol_timeframe ON market_data_cache (symbol, timeframe);
CREATE INDEX idx_market_data_bar_timestamp ON market_data_cache USING BRIN (bar_timestamp);
CREATE INDEX idx_market_data_expires_at ON market_data_cache (expires_at) WHERE expires_at > NOW();
```

#### 2. Set Permissions (RLS)

For service role key (server-side):
```sql
-- Grant full access to service role
GRANT SELECT, INSERT, UPDATE, DELETE ON market_data_cache TO service_role;
```

For anon key (client-side, optional):
```sql
-- Enable RLS
ALTER TABLE market_data_cache ENABLE ROW LEVEL SECURITY;

-- Allow read access to everyone
CREATE POLICY select_market_data ON market_data_cache
  FOR SELECT
  USING (true);
```

#### 3. Schedule Cleanup (Optional)

Using Supabase pg_cron extension:

```sql
-- Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cleanup every hour
SELECT cron.schedule(
  'cleanup-market-cache',
  '0 * * * *', -- Every hour at :00
  $$DELETE FROM market_data_cache WHERE expires_at < NOW()$$
);
```

---

## Integration Examples

### Example 1: Direct Cache Service

```typescript
import { SupabaseMarketCacheService } from './services/supabase-market-cache.service';

const cacheService = new SupabaseMarketCacheService({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_KEY!,
  logger: logger.child({ service: 'cache' })
});

// Fetch with cache-first strategy
const bars = await cacheService.getHistoricalBars('ES', '1h', 24, async () => {
  // Fallback: Fetch from Databento MCP
  const result = await mcpClient.executeTool('databento__get_historical_bars', {
    symbol: 'ES',
    timeframe: '1h',
    count: 24
  });
  return JSON.parse(result.content[0].text);
});
```

### Example 2: Wrapper Integration

```typescript
import { DatabentoCacheWrapper } from './services/databento-cache-wrapper';

const cachedClient = new DatabentoCacheWrapper({
  mcpClient: mcpClient,
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_KEY!,
  logger: logger.child({ service: 'wrapper' })
});

// Cached call
const bars = await cachedClient.executeTool('databento__get_historical_bars', {
  symbol: 'ES',
  timeframe: '1h',
  count: 24
});

// Pass-through call (not cached)
const quote = await cachedClient.executeTool('databento__get_futures_quote', {
  symbol: 'NQ'
});
```

### Example 3: Periodic Cleanup

```typescript
// Schedule cleanup every hour
setInterval(async () => {
  try {
    const deleted = await cacheService.cleanupExpiredCache();
    logger.info('Cache cleanup completed', { deleted });
  } catch (error) {
    logger.error('Cache cleanup failed', { error });
  }
}, 60 * 60 * 1000); // 1 hour
```

---

## Logging

### Cache Hit

```json
{
  "level": "info",
  "message": "Cache hit",
  "symbol": "ES",
  "timeframe": "1h",
  "requested": 24,
  "cached": 24,
  "hitRate": 100
}
```

### Cache Miss

```json
{
  "level": "info",
  "message": "Cache miss",
  "symbol": "NQ",
  "timeframe": "1h",
  "requested": 24,
  "cached": 0,
  "reason": "no_data"
}
```

### Cache Error (Graceful Fallback)

```json
{
  "level": "error",
  "message": "Cache read error, falling back to Databento",
  "symbol": "ES",
  "timeframe": "1h",
  "error": "Supabase query failed: Network timeout"
}
```

See `/packages/app/examples/cache-logging-example.md` for complete logging documentation.

---

## Testing

### Run Demo

```bash
# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_KEY="your_key_here"

# Run demo script
cd packages/app
pnpm tsx examples/supabase-cache-demo.ts
```

### Manual Testing

```typescript
import { SupabaseMarketCacheService } from './services/supabase-market-cache.service';

const service = new SupabaseMarketCacheService({
  supabaseUrl: 'https://your-project.supabase.co',
  supabaseKey: 'your_key',
  logger: console
});

// Test cache write
await service.cacheBars('TEST', '1h', [
  {
    timestamp: new Date().toISOString(),
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 1000
  }
]);

// Test cache read
const cached = await service.getCachedBars('TEST', '1h', 10);
console.log('Cached bars:', cached.length);

// Test cleanup
const deleted = await service.cleanupExpiredCache();
console.log('Deleted expired entries:', deleted);
```

---

## Performance Considerations

### Cache Hit Rate Target

- **Target**: > 70% cache hit rate
- **Monitor via**: Cache statistics and query logs
- **Improve by**: Pre-warming cache for common symbols, increasing TTL for stable timeframes

### Database Indexes

The schema includes three critical indexes:

1. **`idx_market_data_symbol_timeframe`**: B-tree index for exact lookups
2. **`idx_market_data_bar_timestamp`**: BRIN index for time-series queries
3. **`idx_market_data_expires_at`**: Partial index for cleanup queries

### Cleanup Schedule

- **Frequency**: Every 1-4 hours (depending on traffic)
- **Off-peak**: 3 AM UTC recommended for production
- **Monitor**: `expiredBars` count in cache stats

### TTL Tuning

Default TTLs are conservative. Adjust based on usage:

```typescript
const cacheService = new SupabaseMarketCacheService({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_KEY!,
  logger: logger,
  ttlOverrides: {
    '1m': 30 * 1000,       // 30 seconds (very active)
    '5m': 2 * 60 * 1000,   // 2 minutes
    '1h': 2 * 60 * 60 * 1000, // 2 hours
    '1d': 48 * 60 * 60 * 1000 // 48 hours (stable data)
  }
});
```

---

## Troubleshooting

### Issue: Low Cache Hit Rate (< 50%)

**Symptoms:**
- Frequent cache misses in logs
- High Databento MCP call volume

**Solutions:**
1. Check TTL values (may be too short)
2. Pre-warm cache for common symbols
3. Analyze user query patterns (diverse symbols = low reuse)

### Issue: Cache Write Failures

**Symptoms:**
- "Failed to cache bars" errors in logs
- Fresh data delivered but not cached

**Solutions:**
1. Verify Supabase permissions (service role key)
2. Check network connectivity
3. Review Supabase dashboard for errors
4. Ensure table exists and indexes are created

### Issue: Stale Data

**Symptoms:**
- Users report outdated prices
- Cache hit but data is old

**Solutions:**
1. Reduce TTL for active hours
2. Verify cleanup is running
3. Check upsert configuration (should update on conflict)
4. Force cache invalidation for specific symbol/timeframe

### Issue: High Database Storage Usage

**Symptoms:**
- Large market_data_cache table size
- Slow cleanup queries

**Solutions:**
1. Increase cleanup frequency
2. Reduce TTL values
3. Add symbol filters (cache only ES/NQ)
4. Implement table partitioning (by timeframe or date)

---

## Next Steps

### Phase 2: Enhanced Caching

- [ ] Add symbol filtering (cache only specific symbols)
- [ ] Implement cache warming (pre-fetch common queries)
- [ ] Add cache invalidation API (manual refresh)
- [ ] Track cache hit rate metrics (Supabase analytics)

### Phase 3: Multi-Provider Support

- [ ] Extend to other MCP tools (get_session_info, etc.)
- [ ] Add Redis layer for ultra-fast access
- [ ] Implement cache hierarchy (Redis → Supabase → Databento)

### Phase 4: Advanced Features

- [ ] Cache compression (reduce storage costs)
- [ ] Partial bar updates (streaming data)
- [ ] Cross-provider deduplication
- [ ] Real-time cache invalidation (websockets)

---

## Support

For issues or questions:
- Review logging examples: `/packages/app/examples/cache-logging-example.md`
- Run demo script: `/packages/app/examples/supabase-cache-demo.ts`
- Check Supabase dashboard for errors
- Enable debug logging: `LOG_LEVEL=debug`
