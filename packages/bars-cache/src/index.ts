/**
 * @tjr/bars-cache
 *
 * Read-through caching service for market data bars.
 *
 * This package provides a two-tier caching system for market data bars:
 * - In-memory LRU cache for fast access to hot data
 * - Database-backed persistent cache for durable storage
 *
 * Key features:
 * - Read-through semantics (automatic fallback to database)
 * - Write-through semantics (writes to both memory and database)
 * - Provider priority resolution (prefer higher-quality data sources)
 * - Revision tracking (handle late corrections from providers)
 * - Efficient range queries with proper indexing
 *
 * Example usage:
 * ```typescript
 * import { MarketDataCacheService, CacheStore, DbCacheStore } from '@tjr/bars-cache';
 * import { connect } from '@tjr-suite/db-simple';
 *
 * // Setup
 * const db = await connect('sqlite:data/cache.db');
 * const memCache = new CacheStore(10000);
 * const dbCache = new DbCacheStore(db, ['polygon', 'yahoo']);
 * await dbCache.init();
 *
 * const service = new MarketDataCacheService(
 *   memCache,
 *   dbCache,
 *   ['polygon', 'yahoo']
 * );
 *
 * // Store bars
 * await service.storeBars('AAPL', '5m', [{
 *   timestamp: Date.now(),
 *   open: 100.5,
 *   high: 101.2,
 *   low: 100.1,
 *   close: 100.8,
 *   volume: 15000,
 *   provider: 'polygon',
 *   revision: 1,
 *   fetchedAt: Date.now()
 * }]);
 *
 * // Read bars (with automatic caching)
 * const bars = await service.getBars({
 *   symbol: 'AAPL',
 *   timeframe: '5m',
 *   start: Date.now() - 86400000,
 *   end: Date.now()
 * });
 * ```
 */

export * from './types.js'
export { CacheStore } from './cacheStore.js'
export { DbCacheStore } from './dbCacheStore.js'
export { MarketDataCacheService } from './service.js'