/**
 * In-memory LRU cache for market data bars.
 *
 * Provides fast lookups for recently accessed bars with automatic eviction
 * when the cache reaches capacity. Uses a Map for O(1) lookups and maintains
 * LRU ordering for eviction.
 */

import type { CachedBar, CacheKey, CacheQuery } from './types.js';

/**
 * Default maximum number of bars to keep in memory.
 */
const DEFAULT_MAX_SIZE = 10000;

/**
 * Generate a string key from CacheKey components.
 *
 * Format: {symbol}:{timeframe}:{timestamp}
 * Example: "AAPL:5m:1633024800000"
 */
function serializeKey(key: CacheKey): string {
  return `${key.symbol}:${key.timeframe}:${key.timestamp}`;
}

/**
 * In-memory LRU cache for market data bars.
 *
 * Implements a simple Least Recently Used (LRU) eviction policy:
 * - New entries are added to the end
 * - Accessed entries are moved to the end
 * - When full, the oldest (first) entry is evicted
 *
 * Thread-safety: This implementation is NOT thread-safe. If used in a
 * concurrent environment, external synchronization is required.
 *
 * Example:
 * ```typescript
 * const cache = new CacheStore(1000); // max 1000 entries
 *
 * cache.set(
 *   { symbol: 'AAPL', timeframe: '5m', timestamp: 1633024800000 },
 *   { ...bar, provider: 'polygon', revision: 1, fetchedAt: Date.now() }
 * );
 *
 * const bar = cache.get({ symbol: 'AAPL', timeframe: '5m', timestamp: 1633024800000 });
 * ```
 */
export class CacheStore {
  private cache: Map<string, CachedBar>;
  private maxSize: number;

  /**
   * Create a new in-memory cache.
   *
   * @param maxSize - Maximum number of bars to cache (default: 10000)
   */
  constructor(maxSize: number = DEFAULT_MAX_SIZE) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Get a single bar from the cache.
   *
   * @param key - Cache key identifying the bar
   * @returns The cached bar if found, null otherwise
   *
   * Note: This operation moves the accessed entry to the end of the LRU queue.
   */
  get(key: CacheKey): CachedBar | null {
    const serializedKey = serializeKey(key);
    const bar = this.cache.get(serializedKey);

    if (bar === undefined) {
      return null;
    }

    // Move to end (LRU: most recently used)
    this.cache.delete(serializedKey);
    this.cache.set(serializedKey, bar);

    return bar;
  }

  /**
   * Store a bar in the cache.
   *
   * @param key - Cache key identifying the bar
   * @param bar - The cached bar to store
   *
   * Note: If the cache is full, the least recently used entry is evicted.
   */
  set(key: CacheKey, bar: CachedBar): void {
    const serializedKey = serializeKey(key);

    // Remove existing entry if present (to update position)
    if (this.cache.has(serializedKey)) {
      this.cache.delete(serializedKey);
    }

    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    // Add new entry to end
    this.cache.set(serializedKey, bar);
  }

  /**
   * Get all bars within a time range.
   *
   * @param query - Query parameters (symbol, timeframe, start, end)
   * @returns Array of cached bars matching the query, sorted by timestamp
   *
   * Note: This operation is O(n) where n is the total cache size.
   * It scans all entries and filters by query parameters.
   */
  getRange(query: CacheQuery): CachedBar[] {
    const results: CachedBar[] = [];

    for (const bar of this.cache.values()) {
      if (
        bar.timestamp >= query.start &&
        bar.timestamp < query.end &&
        // Note: We need to check symbol and timeframe from the bar itself
        // In a real implementation, we might want to store these in the bar
        // or use a more sophisticated indexing structure
        this.matchesBar(bar, query.symbol, query.timeframe)
      ) {
        results.push(bar);
      }
    }

    // Sort by timestamp (ascending)
    results.sort((a, b) => a.timestamp - b.timestamp);

    return results;
  }

  /**
   * Check if a bar matches the given symbol and timeframe.
   *
   * Since Bar doesn't include symbol/timeframe, we need to extract it from the cache key.
   * This is a helper method that parses the serialized key.
   */
  private matchesBar(bar: CachedBar, symbol: string, timeframe: string): boolean {
    // Find the key that corresponds to this bar
    for (const [key, cachedBar] of this.cache.entries()) {
      if (cachedBar === bar) {
        const parts = key.split(':');
        return parts[0] === symbol && parts[1] === timeframe;
      }
    }
    return false;
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current number of cached bars.
   *
   * @returns Current cache size
   */
  size(): number {
    return this.cache.size;
  }
}
