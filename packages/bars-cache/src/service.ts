/**
 * Read-through cache service for market data bars.
 *
 * Implements a two-tier caching strategy:
 * 1. In-memory cache (fast, limited size)
 * 2. Database cache (slower, persistent)
 *
 * Provides read-through semantics: reads check memory first, then database,
 * and writes go through both layers.
 */

import type { Timeframe } from '@tjr-suite/market-data-core'
import type { CacheStore } from './cacheStore.js'
import type { DbCacheStore } from './dbCacheStore.js'
import type { CachedBar, CacheQuery } from './types.js'

/**
 * Market data cache service with read-through semantics.
 *
 * Orchestrates two cache layers:
 * - Memory cache: Fast in-memory LRU cache for hot data
 * - Database cache: Persistent storage for all cached bars
 *
 * Read flow:
 * 1. Check memory cache
 * 2. On miss, check database cache
 * 3. On database hit, populate memory cache
 * 4. Return merged results by provider priority
 *
 * Write flow:
 * 1. Write to database (persistent layer)
 * 2. Write to memory (hot cache)
 *
 * Example:
 * ```typescript
 * const memCache = new CacheStore(10000);
 * const dbCache = new DbCacheStore(dbConnection, ['polygon', 'yahoo']);
 * await dbCache.init();
 *
 * const service = new MarketDataCacheService(
 *   memCache,
 *   dbCache,
 *   ['polygon', 'yahoo']
 * );
 *
 * // Read-through: checks memory, then database
 * const bars = await service.getBars({
 *   symbol: 'AAPL',
 *   timeframe: '5m',
 *   start: Date.now() - 86400000,
 *   end: Date.now()
 * });
 *
 * // Write-through: writes to database and memory
 * await service.storeBars([{
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
 * ```
 */
export class MarketDataCacheService {
  private memCache: CacheStore
  private dbCache: DbCacheStore
  private providerPriority: string[]

  /**
   * Create a new market data cache service.
   *
   * @param memCache - In-memory cache for hot data
   * @param dbCache - Database cache for persistent storage
   * @param providerPriority - Ordered list of providers (highest priority first)
   *                           Example: ['polygon', 'yahoo'] prefers polygon over yahoo
   */
  constructor(
    memCache: CacheStore,
    dbCache: DbCacheStore,
    providerPriority: string[] = []
  ) {
    this.memCache = memCache
    this.dbCache = dbCache
    this.providerPriority = providerPriority
  }

  /**
   * Get bars for a time range with read-through semantics.
   *
   * Flow:
   * 1. Check memory cache for all bars in range
   * 2. For any missing bars, check database cache
   * 3. Populate memory cache with database hits
   * 4. Return all bars sorted by timestamp
   *
   * @param query - Query parameters (symbol, timeframe, start, end)
   * @returns Array of cached bars, sorted by timestamp
   */
  async getBars(query: CacheQuery): Promise<CachedBar[]> {
    try {
      // Step 1: Check memory cache
      const memBars = this.memCache.getRange(query)

      // If we have all bars in memory (covers full range), return them
      // This is a simplified check - in production you might want to verify
      // that the memory cache has complete coverage of the time range
      if (memBars.length > 0) {
        // Check if we have reasonable coverage (heuristic)
        const hasGoodCoverage = this.hasReasonableCoverage(memBars, query)

        if (hasGoodCoverage) {
          return memBars
        }
      }

      // Step 2: Check database cache
      const dbBars = await this.dbCache.getRange(query)

      // Step 3: Populate memory cache with database hits
      for (const bar of dbBars) {
        const key = {
          symbol: query.symbol,
          timeframe: query.timeframe,
          timestamp: bar.timestamp,
        }
        this.memCache.set(key, bar)
      }

      // Step 4: Return merged results
      return dbBars
    } catch (error) {
      throw new Error(`Failed to get bars: ${error}`)
    }
  }

  /**
   * Store bars to both cache layers (write-through).
   *
   * Flow:
   * 1. Write to database (durable storage)
   * 2. Write to memory (hot cache)
   *
   * Note: Bars must include symbol and timeframe information.
   * Since CachedBar extends Bar which doesn't include these fields,
   * we need to pass them separately.
   *
   * @param symbol - Symbol identifier
   * @param timeframe - Timeframe
   * @param bars - Array of cached bars to store
   */
  async storeBars(
    symbol: string,
    timeframe: Timeframe,
    bars: CachedBar[]
  ): Promise<void> {
    try {
      // Step 1: Write to database (durable)
      for (const bar of bars) {
        const key = {
          symbol,
          timeframe,
          timestamp: bar.timestamp,
        }
        await this.dbCache.setWithKey(key, bar)
      }

      // Step 2: Write to memory (hot cache)
      for (const bar of bars) {
        const key = {
          symbol,
          timeframe,
          timestamp: bar.timestamp,
        }
        this.memCache.set(key, bar)
      }
    } catch (error) {
      throw new Error(`Failed to store bars: ${error}`)
    }
  }

  /**
   * Warm the cache by loading historical data.
   *
   * Pre-loads bars for a symbol/timeframe from the database into memory.
   * Useful for preparing the cache before backtesting or analysis.
   *
   * @param symbol - Symbol to warm cache for
   * @param timeframe - Timeframe to warm cache for
   * @param lookbackMs - How far back to load (in milliseconds)
   *
   * Example:
   * ```typescript
   * // Warm cache with last 30 days of 5m bars for AAPL
   * await service.warmCache('AAPL', '5m', 30 * 86400000);
   * ```
   */
  async warmCache(
    symbol: string,
    timeframe: Timeframe,
    lookbackMs: number
  ): Promise<void> {
    try {
      const now = Date.now()
      const query: CacheQuery = {
        symbol,
        timeframe,
        start: now - lookbackMs,
        end: now,
      }

      // Load from database
      const bars = await this.dbCache.getRange(query)

      // Populate memory cache
      for (const bar of bars) {
        const key = {
          symbol,
          timeframe,
          timestamp: bar.timestamp,
        }
        this.memCache.set(key, bar)
      }
    } catch (error) {
      throw new Error(`Failed to warm cache: ${error}`)
    }
  }

  /**
   * Check if memory cache has reasonable coverage of the query range.
   *
   * This is a heuristic to decide whether to query the database.
   * Returns true if the memory cache appears to have most of the data.
   *
   * Heuristic: If we have at least one bar per expected timeframe interval,
   * consider coverage reasonable.
   *
   * @param bars - Bars from memory cache
   * @param query - Original query
   * @returns true if coverage seems reasonable
   */
  private hasReasonableCoverage(
    bars: CachedBar[],
    query: CacheQuery
  ): boolean {
    if (bars.length === 0) {
      return false
    }

    // Calculate expected number of bars based on timeframe
    const rangeMs = query.end - query.start
    const intervalMs = this.timeframeToMilliseconds(query.timeframe)
    const expectedBars = Math.floor(rangeMs / intervalMs)

    // Require at least 50% coverage (accounting for market hours, holidays, etc.)
    const coverageThreshold = 0.5
    const hasGoodCoverage = bars.length >= expectedBars * coverageThreshold

    return hasGoodCoverage
  }

  /**
   * Convert timeframe to milliseconds.
   *
   * @param timeframe - Timeframe string (e.g., '1m', '5m', '1h', '1D')
   * @returns Interval in milliseconds
   */
  private timeframeToMilliseconds(timeframe: Timeframe): number {
    const timeframeMap: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '10m': 10 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '2h': 2 * 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1D': 24 * 60 * 60 * 1000,
    }

    return timeframeMap[timeframe] || 60 * 1000
  }

  /**
   * Get statistics about cache usage.
   *
   * @returns Cache statistics
   */
  getStats(): { memCacheSize: number } {
    return {
      memCacheSize: this.memCache.size(),
    }
  }

  /**
   * Clear the memory cache.
   *
   * Note: This does NOT clear the database cache.
   */
  clearMemoryCache(): void {
    this.memCache.clear()
  }
}