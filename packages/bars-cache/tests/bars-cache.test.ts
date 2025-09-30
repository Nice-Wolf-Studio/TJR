/**
 * Comprehensive test suite for @tjr/bars-cache package
 *
 * Tests the two-tier caching system for market data bars:
 * - In-memory LRU cache (CacheStore)
 * - Database-backed persistent cache (DbCacheStore)
 * - Read-through cache service (MarketDataCacheService)
 *
 * Test coverage:
 * 1. Revision field handling - late corrections update existing bars
 * 2. Merge by providerPriority - when multiple providers have same bar, select by priority
 * 3. Late correction update - newer revisions override older ones
 * 4. SQLite persistence - data survives restart
 *
 * Run with: pnpm test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { connect } from '@tjr-suite/db-simple'
import type { DbConnection } from '@tjr-suite/db-simple'
import { CacheStore, DbCacheStore, MarketDataCacheService } from '../dist/index.js'
import type { CachedBar, CacheKey, CacheQuery } from '../dist/types.js'

// =============================================================================
// CacheStore Tests (In-Memory LRU Cache)
// =============================================================================

describe('CacheStore', () => {
  let cache: CacheStore

  beforeEach(() => {
    cache = new CacheStore(5) // Small cache for easy testing
  })

  it('should store and retrieve bars', () => {
    const key: CacheKey = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: 1633024800000,
    }

    const bar: CachedBar = {
      timestamp: 1633024800000,
      open: 100.5,
      high: 101.2,
      low: 100.1,
      close: 100.8,
      volume: 15000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: Date.now(),
    }

    cache.set(key, bar)
    const retrieved = cache.get(key)

    expect(retrieved).not.toBeNull()
    expect(retrieved?.open).toBe(100.5)
    expect(retrieved?.close).toBe(100.8)
    expect(retrieved?.provider).toBe('polygon')
  })

  it('should return null for non-existent key', () => {
    const key: CacheKey = {
      symbol: 'NONEXISTENT',
      timeframe: '1m',
      timestamp: 0,
    }

    const retrieved = cache.get(key)
    expect(retrieved).toBeNull()
  })

  it('should evict oldest entry when max size exceeded (LRU)', () => {
    // Fill cache to capacity (maxSize = 5)
    for (let i = 0; i < 5; i++) {
      const key: CacheKey = {
        symbol: 'AAPL',
        timeframe: '5m',
        timestamp: 1633024800000 + i * 300000, // 5-minute intervals
      }

      const bar: CachedBar = {
        timestamp: key.timestamp,
        open: 100 + i,
        high: 101 + i,
        low: 99 + i,
        close: 100.5 + i,
        volume: 10000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      }

      cache.set(key, bar)
    }

    expect(cache.size()).toBe(5)

    // Add one more entry, should evict the oldest
    const newKey: CacheKey = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: 1633024800000 + 5 * 300000,
    }

    const newBar: CachedBar = {
      timestamp: newKey.timestamp,
      open: 105,
      high: 106,
      low: 104,
      close: 105.5,
      volume: 10000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: Date.now(),
    }

    cache.set(newKey, newBar)

    // Cache should still be at max size
    expect(cache.size()).toBe(5)

    // Oldest entry (timestamp 1633024800000) should be evicted
    const oldestKey: CacheKey = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: 1633024800000,
    }
    expect(cache.get(oldestKey)).toBeNull()

    // Newest entry should exist
    expect(cache.get(newKey)).not.toBeNull()
  })

  it('should move accessed entries to end (LRU update)', () => {
    // Add 5 entries
    for (let i = 0; i < 5; i++) {
      const key: CacheKey = {
        symbol: 'AAPL',
        timeframe: '5m',
        timestamp: 1633024800000 + i * 300000,
      }

      const bar: CachedBar = {
        timestamp: key.timestamp,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 10000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      }

      cache.set(key, bar)
    }

    // Access the oldest entry (should move it to end)
    const oldestKey: CacheKey = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: 1633024800000,
    }
    cache.get(oldestKey)

    // Add new entry (should evict second-oldest, not the accessed one)
    const newKey: CacheKey = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: 1633024800000 + 5 * 300000,
    }

    const newBar: CachedBar = {
      timestamp: newKey.timestamp,
      open: 105,
      high: 106,
      low: 104,
      close: 105.5,
      volume: 10000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: Date.now(),
    }

    cache.set(newKey, newBar)

    // Oldest entry should still exist (was accessed)
    expect(cache.get(oldestKey)).not.toBeNull()

    // Second-oldest should be evicted
    const secondOldestKey: CacheKey = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: 1633024800000 + 300000,
    }
    expect(cache.get(secondOldestKey)).toBeNull()
  })

  it('should return bars in time order for range query', () => {
    // Add bars in random order
    const timestamps = [1633028400000, 1633024800000, 1633027500000, 1633026300000]

    for (const ts of timestamps) {
      const key: CacheKey = {
        symbol: 'AAPL',
        timeframe: '5m',
        timestamp: ts,
      }

      const bar: CachedBar = {
        timestamp: ts,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 10000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      }

      cache.set(key, bar)
    }

    const query: CacheQuery = {
      symbol: 'AAPL',
      timeframe: '5m',
      start: 1633024800000,
      end: 1633030000000,
    }

    const results = cache.getRange(query)

    // Should return bars in ascending time order
    expect(results.length).toBe(4)
    expect(results[0].timestamp).toBe(1633024800000)
    expect(results[1].timestamp).toBe(1633026300000)
    expect(results[2].timestamp).toBe(1633027500000)
    expect(results[3].timestamp).toBe(1633028400000)
  })

  it('should filter range query by time bounds', () => {
    // Create a larger cache to avoid LRU eviction during test
    const largeCache = new CacheStore(20)

    // Add bars spanning a wider time range
    for (let i = 0; i < 10; i++) {
      const ts = 1633024800000 + i * 300000
      const key: CacheKey = {
        symbol: 'AAPL',
        timeframe: '5m',
        timestamp: ts,
      }

      const bar: CachedBar = {
        timestamp: ts,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 10000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      }

      largeCache.set(key, bar)
    }

    // Query subset (bars 2-5)
    const query: CacheQuery = {
      symbol: 'AAPL',
      timeframe: '5m',
      start: 1633024800000 + 2 * 300000, // Inclusive
      end: 1633024800000 + 6 * 300000, // Exclusive
    }

    const results = largeCache.getRange(query)

    // Should return 4 bars (indices 2, 3, 4, 5)
    expect(results.length).toBe(4)
    expect(results[0].timestamp).toBe(1633024800000 + 2 * 300000)
    expect(results[3].timestamp).toBe(1633024800000 + 5 * 300000)
  })

  it('should clear all entries', () => {
    // Add some entries
    for (let i = 0; i < 3; i++) {
      const key: CacheKey = {
        symbol: 'AAPL',
        timeframe: '5m',
        timestamp: 1633024800000 + i * 300000,
      }

      const bar: CachedBar = {
        timestamp: key.timestamp,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 10000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      }

      cache.set(key, bar)
    }

    expect(cache.size()).toBe(3)

    cache.clear()
    expect(cache.size()).toBe(0)
  })

  it('should handle updates to existing keys', () => {
    const key: CacheKey = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: 1633024800000,
    }

    const bar1: CachedBar = {
      timestamp: 1633024800000,
      open: 100.5,
      high: 101.2,
      low: 100.1,
      close: 100.8,
      volume: 15000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: Date.now(),
    }

    cache.set(key, bar1)

    // Update with revision 2
    const bar2: CachedBar = {
      ...bar1,
      close: 101.0, // Corrected close price
      revision: 2,
    }

    cache.set(key, bar2)

    const retrieved = cache.get(key)
    expect(retrieved?.close).toBe(101.0)
    expect(retrieved?.revision).toBe(2)
    expect(cache.size()).toBe(1) // Should not duplicate
  })
})

// =============================================================================
// DbCacheStore Tests (Database-Backed Persistence)
// =============================================================================

describe('DbCacheStore', () => {
  let db: DbConnection
  let dbCache: DbCacheStore

  beforeEach(async () => {
    db = await connect('sqlite::memory:')
    dbCache = new DbCacheStore(db, ['polygon', 'yahoo', 'alpaca'])
    await dbCache.init()
  })

  afterEach(async () => {
    await db.close()
  })

  it('should initialize database schema', async () => {
    // Check that table exists
    const tables = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='bars_cache'"
    )

    expect(tables.length).toBe(1)
    expect(tables[0].name).toBe('bars_cache')
  })

  it('should store and retrieve a single bar', async () => {
    const key: CacheKey = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: 1633024800000,
    }

    const bar: CachedBar = {
      timestamp: 1633024800000,
      open: 100.5,
      high: 101.2,
      low: 100.1,
      close: 100.8,
      volume: 15000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: Date.now(),
    }

    await dbCache.setWithKey(key, bar)

    const retrieved = await dbCache.get(key)

    expect(retrieved).not.toBeNull()
    expect(retrieved?.open).toBe(100.5)
    expect(retrieved?.close).toBe(100.8)
    expect(retrieved?.provider).toBe('polygon')
    expect(retrieved?.revision).toBe(1)
  })

  it('should handle revision updates (late corrections)', async () => {
    const key: CacheKey = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: 1633024800000,
    }

    // Store initial bar with revision 1
    const bar1: CachedBar = {
      timestamp: 1633024800000,
      open: 100.5,
      high: 101.2,
      low: 100.1,
      close: 100.8,
      volume: 15000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: Date.now(),
    }

    await dbCache.setWithKey(key, bar1)

    // Update with revision 2 (late correction)
    const bar2: CachedBar = {
      ...bar1,
      close: 101.0, // Corrected close price
      revision: 2,
      fetchedAt: Date.now(),
    }

    await dbCache.setWithKey(key, bar2)

    // Should retrieve revision 2
    const retrieved = await dbCache.get(key)

    expect(retrieved?.close).toBe(101.0)
    expect(retrieved?.revision).toBe(2)
  })

  it('should not downgrade revision (ignore older data)', async () => {
    const key: CacheKey = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: 1633024800000,
    }

    // Store bar with revision 2
    const bar2: CachedBar = {
      timestamp: 1633024800000,
      open: 100.5,
      high: 101.2,
      low: 100.1,
      close: 101.0,
      volume: 15000,
      provider: 'polygon',
      revision: 2,
      fetchedAt: Date.now(),
    }

    await dbCache.setWithKey(key, bar2)

    // Try to update with revision 1 (older)
    const bar1: CachedBar = {
      ...bar2,
      close: 100.8,
      revision: 1,
    }

    await dbCache.setWithKey(key, bar1)

    // Should still have revision 2
    const retrieved = await dbCache.get(key)

    expect(retrieved?.close).toBe(101.0)
    expect(retrieved?.revision).toBe(2)
  })

  it('should merge bars by provider priority', async () => {
    const key: CacheKey = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: 1633024800000,
    }

    // Store bar from yahoo (lower priority)
    const yahooBar: CachedBar = {
      timestamp: 1633024800000,
      open: 100.0,
      high: 101.0,
      low: 100.0,
      close: 100.5,
      volume: 10000,
      provider: 'yahoo',
      revision: 1,
      fetchedAt: Date.now(),
    }

    await dbCache.setWithKey(key, yahooBar)

    // Store bar from polygon (higher priority)
    const polygonBar: CachedBar = {
      timestamp: 1633024800000,
      open: 100.5,
      high: 101.2,
      low: 100.1,
      close: 100.8,
      volume: 15000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: Date.now(),
    }

    await dbCache.setWithKey(key, polygonBar)

    // Should retrieve polygon bar (higher priority)
    const retrieved = await dbCache.get(key)

    expect(retrieved?.provider).toBe('polygon')
    expect(retrieved?.volume).toBe(15000)
  })

  it('should prefer higher priority provider even with lower revision', async () => {
    const key: CacheKey = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: 1633024800000,
    }

    // Store bar from yahoo with revision 2
    const yahooBar: CachedBar = {
      timestamp: 1633024800000,
      open: 100.0,
      high: 101.0,
      low: 100.0,
      close: 100.5,
      volume: 10000,
      provider: 'yahoo',
      revision: 2,
      fetchedAt: Date.now(),
    }

    await dbCache.setWithKey(key, yahooBar)

    // Store bar from polygon with revision 1
    const polygonBar: CachedBar = {
      timestamp: 1633024800000,
      open: 100.5,
      high: 101.2,
      low: 100.1,
      close: 100.8,
      volume: 15000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: Date.now(),
    }

    await dbCache.setWithKey(key, polygonBar)

    // Should retrieve polygon bar (higher priority overrides revision)
    const retrieved = await dbCache.get(key)

    expect(retrieved?.provider).toBe('polygon')
    expect(retrieved?.revision).toBe(1)
  })

  it('should return highest revision for same provider', async () => {
    const key: CacheKey = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: 1633024800000,
    }

    // Store multiple revisions from same provider
    for (let rev = 1; rev <= 3; rev++) {
      const bar: CachedBar = {
        timestamp: 1633024800000,
        open: 100.0,
        high: 101.0,
        low: 100.0,
        close: 100.0 + rev * 0.1, // Different close for each revision
        volume: 10000,
        provider: 'polygon',
        revision: rev,
        fetchedAt: Date.now(),
      }

      await dbCache.setWithKey(key, bar)
    }

    const retrieved = await dbCache.get(key)

    expect(retrieved?.revision).toBe(3)
    expect(retrieved?.close).toBe(100.3)
  })

  it('should retrieve bars in range query', async () => {
    // Store multiple bars
    for (let i = 0; i < 5; i++) {
      const key: CacheKey = {
        symbol: 'AAPL',
        timeframe: '5m',
        timestamp: 1633024800000 + i * 300000,
      }

      const bar: CachedBar = {
        timestamp: key.timestamp,
        open: 100 + i,
        high: 101 + i,
        low: 99 + i,
        close: 100.5 + i,
        volume: 10000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      }

      await dbCache.setWithKey(key, bar)
    }

    const query: CacheQuery = {
      symbol: 'AAPL',
      timeframe: '5m',
      start: 1633024800000,
      end: 1633024800000 + 5 * 300000,
    }

    const results = await dbCache.getRange(query)

    expect(results.length).toBe(5)
    expect(results[0].timestamp).toBe(1633024800000)
    expect(results[4].timestamp).toBe(1633024800000 + 4 * 300000)
  })

  it('should handle range query with multiple symbols', async () => {
    const symbols = ['AAPL', 'GOOGL', 'MSFT']

    // Store bars for multiple symbols
    for (const symbol of symbols) {
      for (let i = 0; i < 3; i++) {
        const key: CacheKey = {
          symbol,
          timeframe: '5m',
          timestamp: 1633024800000 + i * 300000,
        }

        const bar: CachedBar = {
          timestamp: key.timestamp,
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 10000,
          provider: 'polygon',
          revision: 1,
          fetchedAt: Date.now(),
        }

        await dbCache.setWithKey(key, bar)
      }
    }

    // Query only AAPL
    const query: CacheQuery = {
      symbol: 'AAPL',
      timeframe: '5m',
      start: 1633024800000,
      end: 1633024800000 + 3 * 300000,
    }

    const results = await dbCache.getRange(query)

    expect(results.length).toBe(3)
    // All results should be for AAPL only
    // (We can't verify symbol directly from CachedBar, but count validates isolation)
  })

  it('should handle range query with multiple timeframes', async () => {
    const timeframes = ['1m', '5m', '1h'] as const

    // Store bars for multiple timeframes
    for (const timeframe of timeframes) {
      for (let i = 0; i < 3; i++) {
        const key: CacheKey = {
          symbol: 'AAPL',
          timeframe,
          timestamp: 1633024800000 + i * 300000,
        }

        const bar: CachedBar = {
          timestamp: key.timestamp,
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 10000,
          provider: 'polygon',
          revision: 1,
          fetchedAt: Date.now(),
        }

        await dbCache.setWithKey(key, bar)
      }
    }

    // Query only 5m timeframe
    const query: CacheQuery = {
      symbol: 'AAPL',
      timeframe: '5m',
      start: 1633024800000,
      end: 1633024800000 + 3 * 300000,
    }

    const results = await dbCache.getRange(query)

    expect(results.length).toBe(3)
  })

  it('should return empty array for non-existent range', async () => {
    const query: CacheQuery = {
      symbol: 'NONEXISTENT',
      timeframe: '5m',
      start: 1633024800000,
      end: 1633024800000 + 300000,
    }

    const results = await dbCache.getRange(query)

    expect(results.length).toBe(0)
  })

  it('should persist data across reconnections', async () => {
    const dbPath = 'test-cache.db'

    // First connection: write data
    const db1 = await connect(`sqlite:${dbPath}`)
    const cache1 = new DbCacheStore(db1, ['polygon'])
    await cache1.init()

    const key: CacheKey = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: 1633024800000,
    }

    const bar: CachedBar = {
      timestamp: 1633024800000,
      open: 100.5,
      high: 101.2,
      low: 100.1,
      close: 100.8,
      volume: 15000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: Date.now(),
    }

    await cache1.setWithKey(key, bar)
    await db1.close()

    // Second connection: read data
    const db2 = await connect(`sqlite:${dbPath}`)
    const cache2 = new DbCacheStore(db2, ['polygon'])
    await cache2.init()

    const retrieved = await cache2.get(key)

    expect(retrieved).not.toBeNull()
    expect(retrieved?.open).toBe(100.5)
    expect(retrieved?.close).toBe(100.8)

    await db2.close()

    // Cleanup
    const fs = require('node:fs')
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath)
    }
  })
})

// =============================================================================
// MarketDataCacheService Tests (Read-Through Cache)
// =============================================================================

describe('MarketDataCacheService', () => {
  let db: DbConnection
  let memCache: CacheStore
  let dbCache: DbCacheStore
  let service: MarketDataCacheService

  beforeEach(async () => {
    db = await connect('sqlite::memory:')
    memCache = new CacheStore(100)
    dbCache = new DbCacheStore(db, ['polygon', 'yahoo'])
    await dbCache.init()
    service = new MarketDataCacheService(memCache, dbCache, ['polygon', 'yahoo'])
  })

  afterEach(async () => {
    await db.close()
  })

  it('should store bars to both layers (write-through)', async () => {
    const bars: CachedBar[] = [
      {
        timestamp: 1633024800000,
        open: 100.5,
        high: 101.2,
        low: 100.1,
        close: 100.8,
        volume: 15000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
    ]

    await service.storeBars('AAPL', '5m', bars)

    // Check memory cache
    const memKey: CacheKey = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: 1633024800000,
    }
    const memBar = memCache.get(memKey)
    expect(memBar).not.toBeNull()
    expect(memBar?.close).toBe(100.8)

    // Check database cache
    const dbBar = await dbCache.get(memKey)
    expect(dbBar).not.toBeNull()
    expect(dbBar?.close).toBe(100.8)
  })

  it('should implement read-through semantics', async () => {
    // Store directly to database (bypass memory cache)
    const key: CacheKey = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: 1633024800000,
    }

    const bar: CachedBar = {
      timestamp: 1633024800000,
      open: 100.5,
      high: 101.2,
      low: 100.1,
      close: 100.8,
      volume: 15000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: Date.now(),
    }

    await dbCache.setWithKey(key, bar)

    // Verify not in memory cache
    expect(memCache.get(key)).toBeNull()

    // Query via service (should hit database and populate memory)
    const query: CacheQuery = {
      symbol: 'AAPL',
      timeframe: '5m',
      start: 1633024800000,
      end: 1633024800000 + 300000,
    }

    const results = await service.getBars(query)

    expect(results.length).toBe(1)
    expect(results[0].close).toBe(100.8)

    // Verify now in memory cache
    expect(memCache.get(key)).not.toBeNull()
  })

  it('should return from memory cache on second query', async () => {
    const bars: CachedBar[] = [
      {
        timestamp: 1633024800000,
        open: 100.5,
        high: 101.2,
        low: 100.1,
        close: 100.8,
        volume: 15000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
    ]

    await service.storeBars('AAPL', '5m', bars)

    const query: CacheQuery = {
      symbol: 'AAPL',
      timeframe: '5m',
      start: 1633024800000,
      end: 1633024800000 + 300000,
    }

    // First query
    const results1 = await service.getBars(query)
    expect(results1.length).toBe(1)

    // Modify database directly (should not affect cached result)
    await db.exec(
      'UPDATE bars_cache SET close = 999.0 WHERE symbol = ? AND timestamp = ?',
      ['AAPL', 1633024800000]
    )

    // Second query (should hit memory cache with original value)
    const results2 = await service.getBars(query)
    expect(results2.length).toBe(1)
    expect(results2[0].close).toBe(100.8) // Original cached value
  })

  it('should warm cache by preloading data', async () => {
    // Store bars to database
    const now = Date.now()
    const bars: CachedBar[] = []

    for (let i = 0; i < 10; i++) {
      bars.push({
        timestamp: now - (10 - i) * 300000,
        open: 100 + i,
        high: 101 + i,
        low: 99 + i,
        close: 100.5 + i,
        volume: 10000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: now,
      })
    }

    await service.storeBars('AAPL', '5m', bars)

    // Clear memory cache
    service.clearMemoryCache()
    expect(memCache.size()).toBe(0)

    // Warm cache (last 30 minutes = 6 bars)
    await service.warmCache('AAPL', '5m', 30 * 60 * 1000)

    // Memory cache should be populated
    expect(memCache.size()).toBeGreaterThan(0)
  })

  it('should report cache statistics', async () => {
    const bars: CachedBar[] = [
      {
        timestamp: 1633024800000,
        open: 100.5,
        high: 101.2,
        low: 100.1,
        close: 100.8,
        volume: 15000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
      {
        timestamp: 1633025100000,
        open: 100.8,
        high: 101.5,
        low: 100.5,
        close: 101.2,
        volume: 12000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
    ]

    await service.storeBars('AAPL', '5m', bars)

    const stats = service.getStats()

    expect(stats.memCacheSize).toBe(2)
  })

  it('should handle provider priority cascade', async () => {
    // Store bars from multiple providers
    const yahooBar: CachedBar = {
      timestamp: 1633024800000,
      open: 100.0,
      high: 101.0,
      low: 100.0,
      close: 100.5,
      volume: 10000,
      provider: 'yahoo',
      revision: 1,
      fetchedAt: Date.now(),
    }

    await service.storeBars('AAPL', '5m', [yahooBar])

    const polygonBar: CachedBar = {
      timestamp: 1633024800000,
      open: 100.5,
      high: 101.2,
      low: 100.1,
      close: 100.8,
      volume: 15000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: Date.now(),
    }

    await service.storeBars('AAPL', '5m', [polygonBar])

    // Query should return polygon bar (higher priority)
    const query: CacheQuery = {
      symbol: 'AAPL',
      timeframe: '5m',
      start: 1633024800000,
      end: 1633024800000 + 300000,
    }

    const results = await service.getBars(query)

    expect(results.length).toBe(1)
    expect(results[0].provider).toBe('polygon')
    expect(results[0].volume).toBe(15000)
  })

  it('should clear memory cache without affecting database', async () => {
    const bars: CachedBar[] = [
      {
        timestamp: 1633024800000,
        open: 100.5,
        high: 101.2,
        low: 100.1,
        close: 100.8,
        volume: 15000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
    ]

    await service.storeBars('AAPL', '5m', bars)

    expect(memCache.size()).toBe(1)

    service.clearMemoryCache()
    expect(memCache.size()).toBe(0)

    // Database should still have the data
    const key: CacheKey = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: 1633024800000,
    }

    const dbBar = await dbCache.get(key)
    expect(dbBar).not.toBeNull()
  })
})

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration Tests', () => {
  let db: DbConnection
  let service: MarketDataCacheService

  beforeEach(async () => {
    db = await connect('sqlite::memory:')
    const memCache = new CacheStore(100)
    const dbCache = new DbCacheStore(db, ['polygon', 'yahoo', 'alpaca'])
    await dbCache.init()
    service = new MarketDataCacheService(memCache, dbCache, ['polygon', 'yahoo', 'alpaca'])
  })

  afterEach(async () => {
    await db.close()
  })

  it('should handle full round-trip: store → query → verify', async () => {
    const bars: CachedBar[] = [
      {
        timestamp: 1633024800000,
        open: 100.5,
        high: 101.2,
        low: 100.1,
        close: 100.8,
        volume: 15000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
      {
        timestamp: 1633025100000,
        open: 100.8,
        high: 101.5,
        low: 100.5,
        close: 101.2,
        volume: 12000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
      {
        timestamp: 1633025400000,
        open: 101.2,
        high: 102.0,
        low: 101.0,
        close: 101.8,
        volume: 18000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
    ]

    await service.storeBars('AAPL', '5m', bars)

    const query: CacheQuery = {
      symbol: 'AAPL',
      timeframe: '5m',
      start: 1633024800000,
      end: 1633025700000,
    }

    const results = await service.getBars(query)

    expect(results.length).toBe(3)
    expect(results[0].close).toBe(100.8)
    expect(results[1].close).toBe(101.2)
    expect(results[2].close).toBe(101.8)
  })

  it('should handle late correction scenario', async () => {
    // Initial bars with revision 1
    const bars1: CachedBar[] = [
      {
        timestamp: 1633024800000,
        open: 100.5,
        high: 101.2,
        low: 100.1,
        close: 100.8,
        volume: 15000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
      {
        timestamp: 1633025100000,
        open: 100.8,
        high: 101.5,
        low: 100.5,
        close: 101.2,
        volume: 12000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
    ]

    await service.storeBars('AAPL', '5m', bars1)

    // Late correction: update first bar with revision 2
    const bars2: CachedBar[] = [
      {
        timestamp: 1633024800000,
        open: 100.5,
        high: 101.2,
        low: 100.1,
        close: 101.0, // Corrected close
        volume: 15500, // Corrected volume
        provider: 'polygon',
        revision: 2,
        fetchedAt: Date.now(),
      },
    ]

    await service.storeBars('AAPL', '5m', bars2)

    // Query should return corrected data
    const query: CacheQuery = {
      symbol: 'AAPL',
      timeframe: '5m',
      start: 1633024800000,
      end: 1633025400000,
    }

    const results = await service.getBars(query)

    expect(results.length).toBe(2)
    expect(results[0].close).toBe(101.0) // Corrected value
    expect(results[0].volume).toBe(15500) // Corrected value
    expect(results[0].revision).toBe(2)
    expect(results[1].close).toBe(101.2) // Unchanged
    expect(results[1].revision).toBe(1)
  })

  it('should handle multi-provider scenario', async () => {
    // Store bars from yahoo first
    const yahooBars: CachedBar[] = [
      {
        timestamp: 1633024800000,
        open: 100.0,
        high: 101.0,
        low: 100.0,
        close: 100.5,
        volume: 10000,
        provider: 'yahoo',
        revision: 1,
        fetchedAt: Date.now(),
      },
      {
        timestamp: 1633025100000,
        open: 100.5,
        high: 101.2,
        low: 100.3,
        close: 101.0,
        volume: 11000,
        provider: 'yahoo',
        revision: 1,
        fetchedAt: Date.now(),
      },
    ]

    await service.storeBars('AAPL', '5m', yahooBars)

    // Store first bar from polygon (higher priority)
    const polygonBars: CachedBar[] = [
      {
        timestamp: 1633024800000,
        open: 100.5,
        high: 101.2,
        low: 100.1,
        close: 100.8,
        volume: 15000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
    ]

    await service.storeBars('AAPL', '5m', polygonBars)

    // Query should return mixed providers (polygon for first, yahoo for second)
    const query: CacheQuery = {
      symbol: 'AAPL',
      timeframe: '5m',
      start: 1633024800000,
      end: 1633025400000,
    }

    const results = await service.getBars(query)

    expect(results.length).toBe(2)
    expect(results[0].provider).toBe('polygon') // Higher priority
    expect(results[0].volume).toBe(15000)
    expect(results[1].provider).toBe('yahoo') // Only provider for this bar
    expect(results[1].volume).toBe(11000)
  })

  it('should handle edge case: empty range query', async () => {
    const query: CacheQuery = {
      symbol: 'AAPL',
      timeframe: '5m',
      start: 1633024800000,
      end: 1633024800000, // Empty range (start == end)
    }

    const results = await service.getBars(query)

    expect(results.length).toBe(0)
  })

  it('should handle edge case: no data in range', async () => {
    const bars: CachedBar[] = [
      {
        timestamp: 1633024800000,
        open: 100.5,
        high: 101.2,
        low: 100.1,
        close: 100.8,
        volume: 15000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
    ]

    await service.storeBars('AAPL', '5m', bars)

    // Query different time range
    const query: CacheQuery = {
      symbol: 'AAPL',
      timeframe: '5m',
      start: 1633024800000 + 3600000, // 1 hour later
      end: 1633024800000 + 7200000,
    }

    const results = await service.getBars(query)

    expect(results.length).toBe(0)
  })

  it('should handle edge case: different symbols isolated', async () => {
    const aaplBars: CachedBar[] = [
      {
        timestamp: 1633024800000,
        open: 100.5,
        high: 101.2,
        low: 100.1,
        close: 100.8,
        volume: 15000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
    ]

    const googlBars: CachedBar[] = [
      {
        timestamp: 1633024800000,
        open: 2800.0,
        high: 2850.0,
        low: 2790.0,
        close: 2820.0,
        volume: 5000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
    ]

    await service.storeBars('AAPL', '5m', aaplBars)
    await service.storeBars('GOOGL', '5m', googlBars)

    // Query AAPL
    const aaplQuery: CacheQuery = {
      symbol: 'AAPL',
      timeframe: '5m',
      start: 1633024800000,
      end: 1633025100000,
    }

    const aaplResults = await service.getBars(aaplQuery)

    expect(aaplResults.length).toBe(1)
    expect(aaplResults[0].close).toBe(100.8)

    // Query GOOGL
    const googlQuery: CacheQuery = {
      symbol: 'GOOGL',
      timeframe: '5m',
      start: 1633024800000,
      end: 1633025100000,
    }

    const googlResults = await service.getBars(googlQuery)

    expect(googlResults.length).toBe(1)
    expect(googlResults[0].close).toBe(2820.0)
  })
})