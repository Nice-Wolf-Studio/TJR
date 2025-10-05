# Supabase Market Data Cache - Logging Examples

This document demonstrates the logging output from SupabaseMarketCacheService for cache hits, cache misses, and error scenarios.

## Cache Hit Example

When requested data exists in cache and is not expired:

```json
{
  "level": "info",
  "module": "cache",
  "message": "Cache hit",
  "symbol": "ES",
  "timeframe": "1h",
  "requested": 24,
  "cached": 24,
  "hitRate": 100,
  "timestamp": "2025-10-04T17:30:45.123Z"
}
```

**Explanation:**
- `requested`: Number of bars requested by caller
- `cached`: Number of bars found in cache
- `hitRate`: Percentage of requested bars found (100% = perfect hit)
- No Databento MCP call is made

---

## Cache Miss Example

When requested data does NOT exist in cache or is insufficient:

```json
{
  "level": "info",
  "module": "cache",
  "message": "Cache miss",
  "symbol": "NQ",
  "timeframe": "1h",
  "requested": 24,
  "cached": 0,
  "reason": "no_data",
  "timestamp": "2025-10-04T17:31:12.456Z"
}
```

**Explanation:**
- `reason`: Either `"no_data"` (no cache entries) or `"insufficient_data"` (some cache, but < 90% of requested)
- Databento MCP is called to fetch fresh data

---

## Partial Cache Hit (Insufficient Data)

When cache has SOME data but less than 90% threshold:

```json
{
  "level": "info",
  "module": "cache",
  "message": "Cache miss",
  "symbol": "ES",
  "timeframe": "5m",
  "requested": 100,
  "cached": 60,
  "reason": "insufficient_data",
  "timestamp": "2025-10-04T17:32:30.789Z"
}
```

**Explanation:**
- Cache had 60 bars, but 100 were requested
- 60 < 90 (90% of 100), so cache miss
- Fresh data is fetched from Databento

---

## Successful Cache Write

After fetching from Databento, bars are cached:

```json
{
  "level": "debug",
  "module": "cache",
  "service": "supabase-cache",
  "message": "Cached bars successfully",
  "symbol": "ES",
  "timeframe": "1h",
  "count": 24,
  "ttl": "3600000ms",
  "expiresAt": "2025-10-04T18:30:45.123Z",
  "timestamp": "2025-10-04T17:30:45.123Z"
}
```

**Explanation:**
- `ttl`: Time-to-live in milliseconds (1 hour = 3600000ms)
- `expiresAt`: ISO timestamp when cache entry expires
- Upsert strategy handles duplicates gracefully

---

## Cache Read Error (Graceful Fallback)

If Supabase query fails, service falls back to Databento:

```json
{
  "level": "error",
  "module": "cache",
  "message": "Cache read error, falling back to Databento",
  "symbol": "ES",
  "timeframe": "1h",
  "error": "Supabase query failed: Network timeout",
  "timestamp": "2025-10-04T17:33:00.123Z"
}
```

**Explanation:**
- Cache error is logged but does NOT block data fetch
- Databento MCP is called as fallback
- User still receives data (zero downtime)

---

## Cache Write Error

If caching fails after successful Databento fetch:

```json
{
  "level": "error",
  "module": "cache",
  "message": "Failed to cache bars",
  "symbol": "NQ",
  "timeframe": "1h",
  "count": 24,
  "error": "Supabase upsert failed: Permission denied",
  "timestamp": "2025-10-04T17:34:15.456Z"
}
```

**Explanation:**
- Cache write failure does NOT affect data delivery
- User receives fresh data, but it's not cached for future
- Check Supabase permissions (RLS, table grants)

---

## Cleanup Operation

Periodic cleanup of expired cache entries:

```json
{
  "level": "info",
  "module": "cache",
  "message": "Cache cleanup completed",
  "deletedCount": 342,
  "timestamp": "2025-10-04T18:00:00.000Z"
}
```

**Explanation:**
- `deletedCount`: Number of expired cache entries removed
- Run via cron job or scheduled task
- Keeps database size under control

---

## Cache Statistics

Get current cache state:

```json
{
  "level": "info",
  "module": "cache",
  "message": "Cache statistics",
  "totalBars": 1250,
  "expiredBars": 180,
  "activeBars": 1070,
  "timestamp": "2025-10-04T17:35:00.123Z"
}
```

**Explanation:**
- `totalBars`: All rows in market_data_cache table
- `expiredBars`: Rows with expires_at < NOW()
- `activeBars`: Non-expired cache entries

---

## DatabentoCacheWrapper - Cached Tool Call

When wrapper intercepts get_historical_bars:

```json
{
  "level": "debug",
  "module": "cache-wrapper",
  "service": "supabase-cache",
  "message": "Fetching from Databento MCP",
  "symbol": "ES",
  "timeframe": "1h",
  "count": 24,
  "timestamp": "2025-10-04T17:36:12.345Z"
}
```

**Explanation:**
- Wrapper delegates to Databento MCP on cache miss
- Transparent caching - caller doesn't know cache exists

---

## DatabentoCacheWrapper - Pass-Through Tool

When wrapper passes non-cacheable tool unchanged:

```json
{
  "level": "info",
  "module": "mcp",
  "message": "Executing tool",
  "serverName": "databento",
  "toolName": "get_futures_quote",
  "arguments": { "symbol": "ES" },
  "timestamp": "2025-10-04T17:37:00.123Z"
}
```

**Explanation:**
- Only `get_historical_bars` is cached
- Other tools (get_futures_quote, get_session_info, etc.) pass through
- No caching overhead for non-historical data

---

## Production Monitoring Queries

### Cache Hit Rate (Last Hour)

Query Supabase `query_log` table to track cache effectiveness:

```sql
SELECT
  DATE_TRUNC('hour', created_at) AS hour,
  COUNT(*) FILTER (WHERE tools_used @> '[{"tool": "get_historical_bars", "cached": true}]') AS cache_hits,
  COUNT(*) FILTER (WHERE tools_used @> '[{"tool": "get_historical_bars"}]') AS total_calls,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE tools_used @> '[{"tool": "get_historical_bars", "cached": true}]')
    / NULLIF(COUNT(*) FILTER (WHERE tools_used @> '[{"tool": "get_historical_bars"}]'), 0),
    2
  ) AS hit_rate_percent
FROM query_log
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;
```

### Top Cached Symbols

```sql
SELECT
  symbol,
  timeframe,
  COUNT(*) AS bar_count,
  MAX(bar_timestamp) AS latest_bar,
  MAX(cached_at) AS last_cached
FROM market_data_cache
WHERE expires_at > NOW()
GROUP BY symbol, timeframe
ORDER BY bar_count DESC
LIMIT 10;
```

### Cache Size by Timeframe

```sql
SELECT
  timeframe,
  COUNT(*) AS total_bars,
  COUNT(*) FILTER (WHERE expires_at > NOW()) AS active_bars,
  COUNT(*) FILTER (WHERE expires_at <= NOW()) AS expired_bars,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (expires_at - cached_at)) / 60)::numeric,
    2
  ) AS avg_ttl_minutes
FROM market_data_cache
GROUP BY timeframe
ORDER BY timeframe;
```

---

## Best Practices

### 1. Log Levels
- `debug`: Cache operations (upsert, lookup details)
- `info`: Cache hits/misses, cleanup results
- `warn`: Unexpected cache states (stale data, low hit rate)
- `error`: Cache failures (graceful fallback logging)

### 2. Structured Logging
Always include:
- `symbol`, `timeframe`, `count` for cache operations
- `cached` count vs `requested` count for hit/miss context
- `error` messages for debugging failures

### 3. Monitoring
- Track cache hit rate (target: > 70%)
- Monitor expired entry count (cleanup needed if growing)
- Alert on cache write failures (may indicate Supabase issues)

### 4. Performance
- Use `BRIN` indexes on `bar_timestamp` for time-series queries
- Partial index on `expires_at > NOW()` for active cache queries
- Schedule cleanup during off-peak hours (e.g., 3 AM UTC)

---

## Troubleshooting

### Low Cache Hit Rate

**Symptom:** Hit rate < 50%

**Possible Causes:**
1. TTL too short (bars expiring before reuse)
2. Diverse symbol/timeframe requests (low reuse)
3. Cold cache (newly deployed)

**Solutions:**
- Increase TTL for stable timeframes (1h, 1d)
- Pre-warm cache for common symbols (ES, NQ)
- Monitor user query patterns (analytics)

### Cache Write Failures

**Symptom:** Frequent "Failed to cache bars" errors

**Possible Causes:**
1. Supabase permissions (RLS, table grants)
2. Network connectivity issues
3. Quota exceeded (free tier limits)

**Solutions:**
- Check Supabase dashboard for errors
- Verify service role key has write permissions
- Upgrade plan if hitting quotas

### Stale Data

**Symptom:** Users report outdated prices

**Possible Causes:**
1. TTL too long (1d bars not updating)
2. Cleanup not running (expired data served)
3. Upsert not updating existing rows

**Solutions:**
- Reduce TTL for active hours (e.g., 5m during market)
- Schedule cleanup every 15-30 minutes
- Verify upsert `onConflict` configuration
