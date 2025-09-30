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
import { EventBus, createCorrectionEvent } from './events.js'
import type { CorrectionEvent } from './events.js'

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
  private eventBus: EventBus

  /**
   * Create a new market data cache service.
   *
   * @param memCache - In-memory cache for hot data
   * @param dbCache - Database cache for persistent storage
   * @param providerPriority - Ordered list of providers (highest priority first)
   *                           Example: ['polygon', 'yahoo'] prefers polygon over yahoo
   * @param eventBus - Optional event bus for correction events
   * @param errorHandler - Optional error handler for event bus errors
   */
  constructor(
    memCache: CacheStore,
    dbCache: DbCacheStore,
    providerPriority: string[] = [],
    eventBus?: EventBus,
    errorHandler?: (error: Error, event: CorrectionEvent) => void
  ) {
    this.memCache = memCache
    this.dbCache = dbCache
    this.providerPriority = providerPriority
    this.eventBus = eventBus ?? new EventBus(errorHandler)
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
   * @deprecated Use upsertBars() for revision-aware storage with correction events
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
   * Upsert bars with revision semantics and correction tracking.
   *
   * This method implements deterministic merge logic:
   * 1. Check existing bar for the same timestamp
   * 2. Apply provider priority and revision rules
   * 3. Emit correction event if bar data changes
   * 4. Store the winning bar to cache
   *
   * Merge rules (in order):
   * - Higher priority provider wins (based on providerPriority)
   * - If same provider, higher revision wins
   * - If no existing bar, new bar wins
   *
   * @param symbol - Symbol identifier
   * @param timeframe - Timeframe
   * @param bars - Array of cached bars to upsert
   * @returns Array of correction events (empty if no corrections)
   *
   * Example:
   * ```typescript
   * // First insert: revision 1 from polygon
   * await service.upsertBars('AAPL', '5m', [{
   *   timestamp: 1633024800000,
   *   open: 100, high: 101, low: 99, close: 100.5, volume: 10000,
   *   provider: 'polygon', revision: 1, fetchedAt: Date.now()
   * }]);
   *
   * // Later: revision 2 from polygon (correction)
   * const events = await service.upsertBars('AAPL', '5m', [{
   *   timestamp: 1633024800000,
   *   open: 100, high: 101, low: 99, close: 100.6, volume: 10001,
   *   provider: 'polygon', revision: 2, fetchedAt: Date.now()
   * }]);
   *
   * // events[0] contains correction event with old/new data
   * ```
   */
  async upsertBars(
    symbol: string,
    timeframe: Timeframe,
    bars: CachedBar[]
  ): Promise<CorrectionEvent[]> {
    // Validate inputs
    if (!symbol || symbol.trim().length === 0) {
      throw new Error('Symbol must be a non-empty string')
    }

    if (bars.length === 0) {
      return [] // Early return for empty array
    }

    for (const bar of bars) {
      if (bar.revision < 1) {
        throw new Error(`Invalid revision ${bar.revision}, must be >= 1`)
      }
      if (bar.timestamp < 0) {
        throw new Error(`Invalid timestamp ${bar.timestamp}, must be >= 0`)
      }
    }

    const correctionEvents: CorrectionEvent[] = []

    try {
      for (const newBar of bars) {
        const key = {
          symbol,
          timeframe,
          timestamp: newBar.timestamp,
        }

        // Step 1: Check for existing bar
        let existingBar = this.memCache.get(key)
        if (!existingBar) {
          // Check database cache
          const dbBars = await this.dbCache.getRange({
            symbol,
            timeframe,
            start: newBar.timestamp,
            end: newBar.timestamp + 1,
          })
          existingBar = dbBars.length > 0 ? dbBars[0] : null
        }

        // Step 2: Determine winning bar using merge logic
        const winner = this.selectWinningBar(existingBar, newBar)

        // Step 3: If bar changed, emit correction event
        if (winner === newBar && existingBar !== null) {
          // Only emit if there's an actual change
          if (this.hasBarChanged(existingBar, newBar)) {
            const event = createCorrectionEvent(
              symbol,
              timeframe,
              newBar.timestamp,
              existingBar,
              newBar
            )
            correctionEvents.push(event)
            this.eventBus.emit('correction', event)
          }
        }

        // Step 4: Store winning bar (only if it's the new bar)
        if (winner === newBar) {
          await this.dbCache.setWithKey(key, newBar)
          this.memCache.set(key, newBar)
        }
      }

      return correctionEvents
    } catch (error) {
      throw new Error(`Failed to upsert bars: ${error}`)
    }
  }

  /**
   * Select winning bar based on provider priority and revision.
   *
   * Rules:
   * 1. If no existing bar, new bar wins
   * 2. If providers differ, higher priority provider wins
   * 3. If same provider, higher revision wins
   * 4. Otherwise, keep existing bar
   *
   * @param existingBar - Current bar (null if not present)
   * @param newBar - Incoming bar
   * @returns Winning bar
   */
  private selectWinningBar(
    existingBar: CachedBar | null,
    newBar: CachedBar
  ): CachedBar {
    // No existing bar: new bar wins
    if (existingBar === null) {
      return newBar
    }

    // Same provider: higher revision wins
    if (existingBar.provider === newBar.provider) {
      return newBar.revision > existingBar.revision ? newBar : existingBar
    }

    // Different providers: use priority
    const existingPriority = this.getProviderPriority(existingBar.provider)
    const newPriority = this.getProviderPriority(newBar.provider)

    // Lower index = higher priority
    if (newPriority < existingPriority) {
      return newBar
    }

    return existingBar
  }

  /**
   * Get provider priority index.
   *
   * Lower index = higher priority.
   * Providers not in the list get lowest priority.
   *
   * @param provider - Provider identifier
   * @returns Priority index (lower is better)
   */
  private getProviderPriority(provider: string): number {
    const index = this.providerPriority.indexOf(provider)
    return index === -1 ? Number.MAX_SAFE_INTEGER : index
  }

  /**
   * Check if bar data has actually changed.
   *
   * Compares OHLCV values and provider/revision metadata.
   *
   * @param oldBar - Previous bar
   * @param newBar - New bar
   * @returns true if bars are different
   */
  private hasBarChanged(oldBar: CachedBar, newBar: CachedBar): boolean {
    return (
      oldBar.open !== newBar.open ||
      oldBar.high !== newBar.high ||
      oldBar.low !== newBar.low ||
      oldBar.close !== newBar.close ||
      oldBar.volume !== newBar.volume ||
      oldBar.provider !== newBar.provider ||
      oldBar.revision !== newBar.revision
    )
  }

  /**
   * Get the event bus for subscribing to correction events.
   *
   * @returns Event bus instance
   *
   * Example:
   * ```typescript
   * const eventBus = service.getEventBus();
   * eventBus.on('correction', (event) => {
   *   console.log('Correction:', event);
   * });
   * ```
   */
  getEventBus(): EventBus {
    return this.eventBus
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