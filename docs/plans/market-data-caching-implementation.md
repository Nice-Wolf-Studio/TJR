# Market Data Caching Implementation Plan

## Overview

This document provides a complete implementation plan for adding market data caching to the Discord bot's Databento integration. The solution leverages existing packages (`db-simple`, `bars-cache`) and adds minimal new code.

## Architecture Summary

### Database Technology: SQLite

**Chosen**: SQLite with PostgreSQL migration path
- Simple deployment (single file, no server)
- Excellent read performance
- Sufficient for expected data volume
- Easy migration to PostgreSQL via `db-simple` abstraction

### Caching Layers

1. **L1 Memory Cache**: LRU with 10,000 bars / 1,000 quotes
2. **L2 Database Cache**: SQLite persistent storage
3. **L3 Source API**: Databento (on cache miss)

### Database Schema

#### Existing: `bars_cache` table
```sql
CREATE TABLE bars_cache (
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL,
  provider TEXT NOT NULL,
  revision INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (symbol, timeframe, timestamp, provider)
);
```

#### New: `quotes_cache` table
```sql
CREATE TABLE quotes_cache (
  symbol TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  bid_price REAL NOT NULL,
  ask_price REAL NOT NULL,
  bid_size REAL,
  ask_size REAL,
  provider TEXT DEFAULT 'databento',
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (symbol, timestamp)
);
```

## Integration Points

### 1. Prompt Processor (`packages/app/src/services/prompt-processor.ts`)

**Current code**:
```typescript
// Line 134: Direct Databento call
const bars = await getRecentBars(symbol, '1h', 24);

// Line 234: Direct quote fetch
const quote = await getQuote(symbol);
```

**Updated code**:
```typescript
// Use cache wrapper instead
const bars = await this.marketDataCache.getRecentBars(symbol, '1h', 24);
const quote = await this.marketDataCache.getQuote(symbol);
```

### 2. HTTP Server Initialization (`packages/app/src/server/http-server.ts`)

Add database and cache initialization:
```typescript
import { connect } from '@tjr-suite/db-simple';
import { MarketDataCacheWrapper } from '../services/market-data-cache-integration';

// In constructor
const db = await connect(config.databaseUrl || 'sqlite:data/market-cache.db');
const marketDataCache = new MarketDataCacheWrapper({
  db,
  logger: config.logger,
  memoryCacheSizeBars: 10000,
  memoryCacheSizeQuotes: 1000
});
await marketDataCache.initialize();

// Pass to PromptProcessor
this.promptProcessor = new PromptProcessor({
  logger: config.logger,
  marketDataCache
});
```

### 3. Application Bootstrap (`packages/app/src/index.ts`)

Add database configuration:
```typescript
const config = {
  // ... existing config
  databaseUrl: process.env.DATABASE_URL || 'sqlite:data/market-cache.db'
};
```

## File Changes Required

### New Files Created
1. ✅ `docs/adr/ADR-0316-market-data-caching.md` - Architecture decision record
2. ✅ `packages/db-simple/migrations/sqlite/002_create_quotes_cache_sqlite.sql` - SQLite migration
3. ✅ `packages/db-simple/migrations/postgres/002_create_quotes_cache_postgres.sql` - PostgreSQL migration
4. ✅ `packages/app/src/services/market-data-cache-integration.ts` - Cache wrapper implementation

### Files to Modify
1. `packages/app/src/services/prompt-processor.ts` - Replace Databento calls with cache
2. `packages/app/src/server/http-server.ts` - Initialize database and cache
3. `packages/app/package.json` - Add dependencies: `@tjr/bars-cache`, `@tjr-suite/db-simple`
4. `packages/app/src/config/index.ts` - Add database URL configuration

## Implementation Steps

### Step 1: Add Dependencies
```bash
cd packages/app
pnpm add @tjr/bars-cache @tjr-suite/db-simple
```

### Step 2: Run Migrations
```bash
# For SQLite
cd packages/db-simple
pnpm migrate:sqlite

# For PostgreSQL (if using)
DATABASE_URL=postgresql://... pnpm migrate:postgres
```

### Step 3: Update Prompt Processor
- Import `MarketDataCacheWrapper`
- Accept cache in constructor
- Replace `getRecentBars()` calls
- Replace `getQuote()` calls

### Step 4: Update HTTP Server
- Initialize database connection
- Create cache wrapper
- Pass to prompt processor

### Step 5: Test Integration
- Verify cache hits on repeated requests
- Check database for stored data
- Monitor performance improvements

## Performance Expectations

### Before Caching
- Databento API call: 100-500ms per request
- No data persistence
- Duplicate API calls for same data

### After Caching
- Memory cache hit: <1ms
- Database cache hit: 1-5ms
- API call only on cache miss
- Data persists across restarts

### Cache Hit Rates (Expected)
- Bars (1h): 95%+ (RTH detection uses same 24h window)
- Quotes: 50-70% (within 5-minute TTL)
- Overall API reduction: 80-90%

## Monitoring & Maintenance

### Metrics to Track
- Cache hit/miss rates
- Database size growth
- API call frequency
- Response latencies

### Maintenance Tasks
1. **Daily**: Clean expired quotes (>7 days old)
2. **Weekly**: Monitor database size
3. **Monthly**: Analyze cache performance metrics

### Cache Management Endpoints
Add admin endpoints to HTTP server:
- `GET /admin/cache/stats` - Cache statistics
- `POST /admin/cache/cleanup` - Manual cleanup
- `DELETE /admin/cache/clear` - Clear all caches

## Rollback Plan

If issues arise:
1. Remove cache wrapper from prompt processor
2. Revert to direct Databento calls
3. Database remains for forensics
4. No data loss (cache is additive)

## Future Enhancements

1. **Preloading**: Warm cache on startup for common symbols
2. **Compression**: Store compressed bars for older data
3. **Replication**: Sync cache across multiple instances
4. **Analytics**: Use cached data for backtesting
5. **WebSocket**: Real-time quote updates via streaming

## Success Criteria

- ✅ All Databento queries check cache first
- ✅ Cache hit rate >80% after warm-up
- ✅ Response time <10ms for cached data
- ✅ Database size <1GB for 6 months of data
- ✅ Zero data loss on application restart

## Questions & Decisions Pending

1. **Quote TTL**: Currently 5 minutes - optimal?
2. **Database location**: Local file vs. network database?
3. **Backup strategy**: How often to backup SQLite file?
4. **Multi-instance**: Share cache across bot instances?
5. **Rate limiting**: Add rate limits to prevent cache flooding?

## References

- [ADR-0316: Market Data Caching Strategy](../adr/ADR-0316-market-data-caching.md)
- [bars-cache Package](../../packages/bars-cache/README.md)
- [db-simple Package](../../packages/db-simple/README.md)
- [Databento API Docs](https://docs.databento.com/)