# ADR-0316: Market Data Caching Strategy for Discord Bot

## Status

Proposed

## Context

The Discord bot's prompt processor service currently queries Databento API for every request, which has several drawbacks:
- Unnecessary API calls for previously fetched data
- Increased latency for user responses
- Higher API costs from duplicate requests
- No data persistence across application restarts

The bot queries Databento for:
1. **Bars data**: Historical OHLCV data (1m, 1h, 4h timeframes)
2. **Quotes**: Latest bid/ask prices for futures symbols
3. **RTH session detection**: Uses 24 hours of 1h bars for bias calculations

Current implementation locations:
- `packages/app/src/services/prompt-processor.ts` - Main service querying Databento
- `packages/databento/src/index.ts` - Direct Databento API client
- HTTP API server on port 3000 serving Discord bot requests

Existing infrastructure:
- `@tjr-suite/db-simple` - Database abstraction layer (SQLite/PostgreSQL)
- `@tjr/bars-cache` - Two-tier caching system for market data bars
- Migration system for schema management

## Decision

### 1. Database Technology: SQLite

**Choice**: SQLite for initial implementation with PostgreSQL migration path

**Rationale**:
- **Simplicity**: Zero configuration, single file, no separate process
- **Performance**: Excellent read performance for cache workload
- **Deployment**: Simpler for Discord bot deployment (no database server)
- **Migration path**: Existing `db-simple` abstraction allows easy PostgreSQL migration
- **Data volume**: Expected data volume (hundreds of thousands of rows) well within SQLite limits

### 2. Database Schema

Extend existing `bars_cache` table and add new `quotes_cache` table:

```sql
-- Existing bars_cache table (already created by migration 001)
-- Adding support for Databento-specific fields

-- Create quotes_cache table for storing quote snapshots
CREATE TABLE IF NOT EXISTS quotes_cache (
  -- Core identification
  symbol TEXT NOT NULL,
  timestamp INTEGER NOT NULL,  -- Epoch milliseconds (UTC)

  -- Quote data
  bid_price REAL NOT NULL,
  ask_price REAL NOT NULL,
  bid_size REAL,
  ask_size REAL,

  -- Metadata
  provider TEXT NOT NULL DEFAULT 'databento',
  fetched_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),

  PRIMARY KEY (symbol, timestamp)
);

-- Index for efficient quote lookups
CREATE INDEX IF NOT EXISTS idx_quotes_cache_lookup
  ON quotes_cache (symbol, timestamp DESC);

-- Index for cleanup/TTL operations
CREATE INDEX IF NOT EXISTS idx_quotes_cache_fetched
  ON quotes_cache (fetched_at);
```

### 3. Caching Strategy

**Two-tier caching architecture**:

1. **Memory Cache (L1)**:
   - LRU cache with 10,000 bar capacity
   - 1,000 quote capacity
   - Sub-millisecond access time
   - Automatic eviction on memory pressure

2. **Database Cache (L2)**:
   - Persistent storage in SQLite
   - Unlimited capacity (disk-bound)
   - ~1-5ms access time
   - Survives application restarts

**Cache lookup flow**:
```
Request → L1 Memory → L2 Database → Databento API
         (if miss)    (if miss)     (if miss)
            ↓             ↓              ↓
         Store in L1   Store in L1   Store in L1+L2
```

### 4. Implementation Plan

#### Phase 1: Integrate bars caching (Week 1)
1. Wire `MarketDataCacheService` into prompt processor
2. Configure cache stores with proper provider priorities
3. Modify `getRecentBars()` calls to check cache first
4. Add cache warming on startup for common symbols

#### Phase 2: Add quotes caching (Week 1-2)
1. Extend cache service for quotes support
2. Create quotes table migration
3. Implement quote-specific cache logic
4. Add TTL-based eviction (quotes expire after 5 minutes)

#### Phase 3: Monitoring & optimization (Week 2)
1. Add cache hit/miss metrics
2. Implement cache preloading for RTH detection
3. Add admin endpoints for cache management
4. Document cache invalidation strategies

### 5. Integration Points

```typescript
// packages/app/src/services/prompt-processor.ts
class PromptProcessor {
  private cacheService: MarketDataCacheService;

  constructor(config: PromptProcessorConfig) {
    // Initialize cache service
    const memCache = new CacheStore(10000);
    const dbCache = new DbCacheStore(config.db, ['databento']);
    this.cacheService = new MarketDataCacheService(memCache, dbCache, ['databento']);
  }

  private async getRecentBarsWithCache(
    symbol: string,
    timeframe: string,
    count: number
  ): Promise<Bar[]> {
    // Check cache first
    const cached = await this.cacheService.getBars({
      symbol,
      timeframe,
      start: calculateStartTime(timeframe, count),
      end: Date.now()
    });

    if (cached.length >= count) {
      return cached;
    }

    // Fetch from Databento if cache miss
    const bars = await getRecentBars(symbol, timeframe, count);

    // Store in cache
    await this.cacheService.storeBars(symbol, timeframe, bars);

    return bars;
  }
}
```

### 6. Data Retention Policy

**Initial policy** (to be refined based on usage):
- **Bars**: Keep indefinitely (historical data doesn't change)
- **Quotes**: Keep for 7 days (more transient, recreatable)
- **Cleanup**: Daily cron to remove quotes older than retention period
- **Size limits**: Monitor database size, implement rolling window if > 1GB

## Consequences

### Positive
- **Reduced API costs**: Eliminate duplicate Databento queries
- **Improved latency**: Sub-5ms cache hits vs 100-500ms API calls
- **Offline capability**: Bot can serve cached data during API outages
- **Historical analysis**: Accumulated data enables backtesting
- **Cost transparency**: Track API usage through cache miss metrics

### Negative
- **Storage overhead**: ~100MB per million bars stored
- **Cache invalidation complexity**: Must handle data corrections
- **Additional maintenance**: Database backups, migrations, cleanup
- **Consistency challenges**: Multiple data sources may conflict

### Neutral
- **Migration path**: Can switch to PostgreSQL if SQLite limits reached
- **Extensibility**: Schema supports multiple providers for future expansion
- **Monitoring requirements**: Need observability for cache performance

## Implementation Notes

1. **Use existing packages**: Leverage `@tjr/bars-cache` and `@tjr-suite/db-simple`
2. **Provider priority**: Set Databento as highest priority provider
3. **Error handling**: Cache misses should gracefully fall back to API
4. **Testing**: Add integration tests for cache hit/miss scenarios
5. **Documentation**: Update API docs with cache behavior

## References

- ADR-0057: db-simple package design
- ADR-0055: market-data-core types and interfaces
- Databento API documentation
- SQLite performance characteristics
- bars-cache package implementation