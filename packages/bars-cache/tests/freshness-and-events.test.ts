/**
 * Test suite for cache freshness, correction events, and revision semantics.
 *
 * Tests Issue #33 features:
 * - TTL policies and staleness detection
 * - Revision-aware upserts with correction tracking
 * - Event bus for correction notifications
 * - Deterministic merge logic for provider priority
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { connect } from '@tjr-suite/db-simple'
import type { DbConnection } from '@tjr-suite/db-simple'
import {
  CacheStore,
  DbCacheStore,
  MarketDataCacheService,
  EventBus,
  isStale,
  getTTL,
  getStaleBars,
  getStaleTimestamp,
  DEFAULT_FRESHNESS_POLICIES,
} from '../dist/index.js'
import type { CachedBar, CorrectionEvent, FreshnessPolicy } from '../dist/index.js'

// =============================================================================
// Freshness Tests
// =============================================================================

describe('Freshness and TTL Policies', () => {
  const now = Date.now()

  it('should have default TTL policies for common timeframes', () => {
    expect(getTTL('1m')).toBe(5 * 60 * 1000) // 5 minutes
    expect(getTTL('5m')).toBe(15 * 60 * 1000) // 15 minutes
    expect(getTTL('1h')).toBe(2 * 60 * 60 * 1000) // 2 hours
    expect(getTTL('1D')).toBe(24 * 60 * 60 * 1000) // 24 hours
  })

  it('should detect stale bars based on TTL', () => {
    const bar: CachedBar = {
      timestamp: now - 3600000, // 1 hour ago
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 10000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: now - 10 * 60 * 1000, // fetched 10 minutes ago
    }

    // 1m timeframe: TTL = 5 minutes, fetched 10 minutes ago → stale
    expect(isStale(bar, '1m', DEFAULT_FRESHNESS_POLICIES, now)).toBe(true)

    // 1h timeframe: TTL = 2 hours, fetched 10 minutes ago → fresh
    expect(isStale(bar, '1h', DEFAULT_FRESHNESS_POLICIES, now)).toBe(false)
  })

  it('should consider historical bars as fresh', () => {
    // Bar from 30 days ago, fetched 10 days ago
    const historicalBar: CachedBar = {
      timestamp: now - 30 * 24 * 60 * 60 * 1000,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 10000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: now - 10 * 24 * 60 * 60 * 1000,
    }

    // Historical bars (>7 days old) are considered fresh regardless of TTL
    expect(isStale(historicalBar, '1m', DEFAULT_FRESHNESS_POLICIES, now)).toBe(false)
  })

  it('should detect multiple stale bars in a list', () => {
    const bars: CachedBar[] = [
      {
        timestamp: now - 3600000,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 10000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: now - 10 * 60 * 1000, // 10 minutes ago (stale for 1m)
      },
      {
        timestamp: now - 7200000,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 10000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: now - 2 * 60 * 1000, // 2 minutes ago (fresh for 1m)
      },
      {
        timestamp: now - 10800000,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 10000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: now - 20 * 60 * 1000, // 20 minutes ago (stale for 1m)
      },
    ]

    const staleBars = getStaleBars(bars, '1m', DEFAULT_FRESHNESS_POLICIES, now)

    expect(staleBars.length).toBe(2)
    expect(staleBars[0].fetchedAt).toBe(now - 10 * 60 * 1000)
    expect(staleBars[1].fetchedAt).toBe(now - 20 * 60 * 1000)
  })

  it('should calculate when a bar becomes stale', () => {
    const bar: CachedBar = {
      timestamp: now,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 10000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: now,
    }

    const staleTimestamp = getStaleTimestamp(bar, '5m')

    // Should be fetchedAt + TTL (15 minutes for 5m)
    expect(staleTimestamp).toBe(now + 15 * 60 * 1000)
  })

  it('should support custom TTL policies', () => {
    const customPolicies: FreshnessPolicy[] = [
      { timeframe: '1m', ttlMs: 1 * 60 * 1000 }, // 1 minute (very aggressive)
      { timeframe: '1h', ttlMs: 10 * 60 * 60 * 1000 }, // 10 hours (very conservative)
    ]

    const bar: CachedBar = {
      timestamp: now - 3600000,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 10000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: now - 5 * 60 * 1000, // 5 minutes ago
    }

    // Custom policy: 1m TTL = 1 minute, fetched 5 minutes ago → stale
    expect(isStale(bar, '1m', customPolicies, now)).toBe(true)

    // Custom policy: 1h TTL = 10 hours, fetched 5 minutes ago → fresh
    expect(isStale(bar, '1h', customPolicies, now)).toBe(false)
  })

  it('should use default TTL for unknown timeframes', () => {
    const unknownTimeframe = '3h' as any

    // Should use default TTL (10 minutes)
    const ttl = getTTL(unknownTimeframe)
    expect(ttl).toBe(10 * 60 * 1000)
  })
})

// =============================================================================
// EventBus Tests
// =============================================================================

describe('EventBus', () => {
  let eventBus: EventBus

  beforeEach(() => {
    eventBus = new EventBus()
  })

  it('should emit and receive correction events', () => {
    const receivedEvents: CorrectionEvent[] = []

    eventBus.on('correction', (event) => {
      receivedEvents.push(event)
    })

    const event: CorrectionEvent = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: Date.now(),
      oldBar: null,
      newBar: {
        timestamp: Date.now(),
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 10000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
      correctionType: 'initial',
      detectedAt: Date.now(),
    }

    eventBus.emit('correction', event)

    expect(receivedEvents.length).toBe(1)
    expect(receivedEvents[0].symbol).toBe('AAPL')
    expect(receivedEvents[0].correctionType).toBe('initial')
  })

  it('should support multiple listeners', () => {
    const events1: CorrectionEvent[] = []
    const events2: CorrectionEvent[] = []

    eventBus.on('correction', (event) => events1.push(event))
    eventBus.on('correction', (event) => events2.push(event))

    const event: CorrectionEvent = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: Date.now(),
      oldBar: null,
      newBar: {
        timestamp: Date.now(),
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 10000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
      correctionType: 'initial',
      detectedAt: Date.now(),
    }

    eventBus.emit('correction', event)

    expect(events1.length).toBe(1)
    expect(events2.length).toBe(1)
  })

  it('should allow unsubscribing from events', () => {
    const receivedEvents: CorrectionEvent[] = []

    const unsubscribe = eventBus.on('correction', (event) => {
      receivedEvents.push(event)
    })

    const event: CorrectionEvent = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: Date.now(),
      oldBar: null,
      newBar: {
        timestamp: Date.now(),
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 10000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
      correctionType: 'initial',
      detectedAt: Date.now(),
    }

    eventBus.emit('correction', event)
    expect(receivedEvents.length).toBe(1)

    unsubscribe()
    eventBus.emit('correction', event)
    expect(receivedEvents.length).toBe(1) // No new event
  })

  it('should handle listener errors gracefully', () => {
    const receivedEvents: CorrectionEvent[] = []

    // First listener throws error
    eventBus.on('correction', () => {
      throw new Error('Listener error')
    })

    // Second listener should still receive events
    eventBus.on('correction', (event) => {
      receivedEvents.push(event)
    })

    const event: CorrectionEvent = {
      symbol: 'AAPL',
      timeframe: '5m',
      timestamp: Date.now(),
      oldBar: null,
      newBar: {
        timestamp: Date.now(),
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 10000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
      correctionType: 'initial',
      detectedAt: Date.now(),
    }

    // Should not throw
    expect(() => eventBus.emit('correction', event)).not.toThrow()

    // Second listener should have received event
    expect(receivedEvents.length).toBe(1)
  })

  it('should track listener count', () => {
    expect(eventBus.listenerCount('correction')).toBe(0)

    const unsub1 = eventBus.on('correction', () => {})
    expect(eventBus.listenerCount('correction')).toBe(1)

    const unsub2 = eventBus.on('correction', () => {})
    expect(eventBus.listenerCount('correction')).toBe(2)

    unsub1()
    expect(eventBus.listenerCount('correction')).toBe(1)

    unsub2()
    expect(eventBus.listenerCount('correction')).toBe(0)
  })

  it('should remove all listeners', () => {
    eventBus.on('correction', () => {})
    eventBus.on('correction', () => {})
    expect(eventBus.listenerCount('correction')).toBe(2)

    eventBus.removeAllListeners()
    expect(eventBus.listenerCount('correction')).toBe(0)
  })
})

// =============================================================================
// Revision-Aware Upsert Tests
// =============================================================================

describe('MarketDataCacheService - Revision Upserts', () => {
  let db: DbConnection
  let memCache: CacheStore
  let dbCache: DbCacheStore
  let service: MarketDataCacheService
  let eventBus: EventBus

  beforeEach(async () => {
    db = await connect('sqlite::memory:')
    memCache = new CacheStore(100)
    dbCache = new DbCacheStore(db, ['polygon', 'yahoo', 'alpaca'])
    await dbCache.init()
    eventBus = new EventBus()
    service = new MarketDataCacheService(memCache, dbCache, ['polygon', 'yahoo', 'alpaca'], eventBus)
  })

  afterEach(async () => {
    await db.close()
  })

  it('should emit correction event for revision update', async () => {
    const correctionEvents: CorrectionEvent[] = []
    eventBus.on('correction', (event) => correctionEvents.push(event))

    // Initial insert: revision 1
    const bar1: CachedBar = {
      timestamp: 1633024800000,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 10000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: Date.now(),
    }

    await service.upsertBars('AAPL', '5m', [bar1])
    expect(correctionEvents.length).toBe(0) // No correction for initial insert

    // Revision 2: correction
    const bar2: CachedBar = {
      timestamp: 1633024800000,
      open: 100,
      high: 101,
      low: 99,
      close: 100.8, // Corrected close
      volume: 10500, // Corrected volume
      provider: 'polygon',
      revision: 2,
      fetchedAt: Date.now(),
    }

    await service.upsertBars('AAPL', '5m', [bar2])

    expect(correctionEvents.length).toBe(1)
    expect(correctionEvents[0].symbol).toBe('AAPL')
    expect(correctionEvents[0].timeframe).toBe('5m')
    expect(correctionEvents[0].oldBar?.close).toBe(100.5)
    expect(correctionEvents[0].newBar.close).toBe(100.8)
    expect(correctionEvents[0].correctionType).toBe('revision')
  })

  it('should emit correction event for provider override', async () => {
    const correctionEvents: CorrectionEvent[] = []
    eventBus.on('correction', (event) => correctionEvents.push(event))

    // Insert from yahoo (lower priority)
    const yahooBar: CachedBar = {
      timestamp: 1633024800000,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 10000,
      provider: 'yahoo',
      revision: 1,
      fetchedAt: Date.now(),
    }

    await service.upsertBars('AAPL', '5m', [yahooBar])

    // Insert from polygon (higher priority)
    const polygonBar: CachedBar = {
      timestamp: 1633024800000,
      open: 100.1,
      high: 101.2,
      low: 99.8,
      close: 100.8,
      volume: 15000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: Date.now(),
    }

    await service.upsertBars('AAPL', '5m', [polygonBar])

    expect(correctionEvents.length).toBe(1)
    expect(correctionEvents[0].oldBar?.provider).toBe('yahoo')
    expect(correctionEvents[0].newBar.provider).toBe('polygon')
    expect(correctionEvents[0].correctionType).toBe('provider_override')
  })

  it('should not emit correction if bar is unchanged', async () => {
    const correctionEvents: CorrectionEvent[] = []
    eventBus.on('correction', (event) => correctionEvents.push(event))

    const bar: CachedBar = {
      timestamp: 1633024800000,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 10000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: Date.now(),
    }

    await service.upsertBars('AAPL', '5m', [bar])
    expect(correctionEvents.length).toBe(0)

    // Re-insert same bar (should not trigger correction)
    await service.upsertBars('AAPL', '5m', [bar])
    expect(correctionEvents.length).toBe(0)
  })

  it('should respect provider priority over revision', async () => {
    // Insert from yahoo with revision 5
    const yahooBar: CachedBar = {
      timestamp: 1633024800000,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 10000,
      provider: 'yahoo',
      revision: 5,
      fetchedAt: Date.now(),
    }

    await service.upsertBars('AAPL', '5m', [yahooBar])

    // Insert from polygon with revision 1 (higher priority provider)
    const polygonBar: CachedBar = {
      timestamp: 1633024800000,
      open: 100.1,
      high: 101.2,
      low: 99.8,
      close: 100.8,
      volume: 15000,
      provider: 'polygon',
      revision: 1,
      fetchedAt: Date.now(),
    }

    await service.upsertBars('AAPL', '5m', [polygonBar])

    // Query should return polygon bar (higher priority)
    const results = await service.getBars({
      symbol: 'AAPL',
      timeframe: '5m',
      start: 1633024800000,
      end: 1633024800000 + 1,
    })

    expect(results[0].provider).toBe('polygon')
    expect(results[0].revision).toBe(1)
  })

  it('should handle multiple corrections in sequence', async () => {
    const correctionEvents: CorrectionEvent[] = []
    eventBus.on('correction', (event) => correctionEvents.push(event))

    const timestamp = 1633024800000

    // Revision 1
    await service.upsertBars('AAPL', '5m', [
      {
        timestamp,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 10000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
    ])

    // Revision 2
    await service.upsertBars('AAPL', '5m', [
      {
        timestamp,
        open: 100,
        high: 101,
        low: 99,
        close: 100.6,
        volume: 10100,
        provider: 'polygon',
        revision: 2,
        fetchedAt: Date.now(),
      },
    ])

    // Revision 3
    await service.upsertBars('AAPL', '5m', [
      {
        timestamp,
        open: 100,
        high: 101,
        low: 99,
        close: 100.7,
        volume: 10200,
        provider: 'polygon',
        revision: 3,
        fetchedAt: Date.now(),
      },
    ])

    expect(correctionEvents.length).toBe(2)
    expect(correctionEvents[0].oldBar?.revision).toBe(1)
    expect(correctionEvents[0].newBar.revision).toBe(2)
    expect(correctionEvents[1].oldBar?.revision).toBe(2)
    expect(correctionEvents[1].newBar.revision).toBe(3)
  })

  it('should not update if incoming revision is lower', async () => {
    const correctionEvents: CorrectionEvent[] = []
    eventBus.on('correction', (event) => correctionEvents.push(event))

    const timestamp = 1633024800000

    // Insert revision 3
    await service.upsertBars('AAPL', '5m', [
      {
        timestamp,
        open: 100,
        high: 101,
        low: 99,
        close: 100.7,
        volume: 10200,
        provider: 'polygon',
        revision: 3,
        fetchedAt: Date.now(),
      },
    ])

    // Try to insert revision 2 (should be ignored)
    await service.upsertBars('AAPL', '5m', [
      {
        timestamp,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 10000,
        provider: 'polygon',
        revision: 2,
        fetchedAt: Date.now(),
      },
    ])

    expect(correctionEvents.length).toBe(0)

    // Verify revision 3 is still there
    const results = await service.getBars({
      symbol: 'AAPL',
      timeframe: '5m',
      start: timestamp,
      end: timestamp + 1,
    })

    expect(results[0].revision).toBe(3)
    expect(results[0].close).toBe(100.7)
  })

  it('should handle out-of-order bar arrivals', async () => {
    const correctionEvents: CorrectionEvent[] = []
    eventBus.on('correction', (event) => correctionEvents.push(event))

    // Insert bars for t1, t2, t3 in random order
    const t1 = 1633024800000
    const t2 = 1633025100000
    const t3 = 1633025400000

    // Insert t3 first
    await service.upsertBars('AAPL', '5m', [
      {
        timestamp: t3,
        open: 102,
        high: 103,
        low: 101,
        close: 102.5,
        volume: 12000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
    ])

    // Insert t1
    await service.upsertBars('AAPL', '5m', [
      {
        timestamp: t1,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 10000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
    ])

    // Insert t2
    await service.upsertBars('AAPL', '5m', [
      {
        timestamp: t2,
        open: 101,
        high: 102,
        low: 100,
        close: 101.5,
        volume: 11000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
    ])

    // Query should return bars in time order
    const results = await service.getBars({
      symbol: 'AAPL',
      timeframe: '5m',
      start: t1,
      end: t3 + 1,
    })

    expect(results.length).toBe(3)
    expect(results[0].timestamp).toBe(t1)
    expect(results[1].timestamp).toBe(t2)
    expect(results[2].timestamp).toBe(t3)

    // No corrections (all initial inserts)
    expect(correctionEvents.length).toBe(0)
  })

  it('should return correction events from upsertBars', async () => {
    const timestamp = 1633024800000

    // Initial insert
    await service.upsertBars('AAPL', '5m', [
      {
        timestamp,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 10000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: Date.now(),
      },
    ])

    // Correction
    const events = await service.upsertBars('AAPL', '5m', [
      {
        timestamp,
        open: 100,
        high: 101,
        low: 99,
        close: 100.8,
        volume: 10500,
        provider: 'polygon',
        revision: 2,
        fetchedAt: Date.now(),
      },
    ])

    expect(events.length).toBe(1)
    expect(events[0].correctionType).toBe('revision')
  })
})

// =============================================================================
// Input Validation Tests
// =============================================================================

describe('Input validation', () => {
  let db: DbConnection
  let memCache: CacheStore
  let dbCache: DbCacheStore
  let service: MarketDataCacheService

  beforeEach(async () => {
    db = await connect('sqlite::memory:')
    memCache = new CacheStore(100)
    dbCache = new DbCacheStore(db, ['polygon', 'yahoo', 'alpaca'])
    await dbCache.init()
    service = new MarketDataCacheService(memCache, dbCache, ['polygon', 'yahoo', 'alpaca'])
  })

  afterEach(async () => {
    await db.close()
  })

  it('should reject empty symbol', async () => {
    await expect(service.upsertBars('', '5m', [])).rejects.toThrow('Symbol must be a non-empty string')
  })

  it('should handle empty bars array', async () => {
    const events = await service.upsertBars('AAPL', '5m', [])
    expect(events).toEqual([])
  })

  it('should reject invalid revision', async () => {
    const invalidBar: CachedBar = {
      timestamp: Date.now(),
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1000,
      provider: 'test',
      revision: 0, // Invalid
      fetchedAt: Date.now(),
    }
    await expect(service.upsertBars('AAPL', '5m', [invalidBar])).rejects.toThrow('Invalid revision')
  })

  it('should reject negative timestamp', async () => {
    const invalidBar: CachedBar = {
      timestamp: -1, // Invalid
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1000,
      provider: 'test',
      revision: 1,
      fetchedAt: Date.now(),
    }
    await expect(service.upsertBars('AAPL', '5m', [invalidBar])).rejects.toThrow('Invalid timestamp')
  })
})

// =============================================================================
// Integration Tests: Freshness + Events + Revisions
// =============================================================================

describe('Integration: Freshness + Events + Revisions', () => {
  let db: DbConnection
  let service: MarketDataCacheService
  let eventBus: EventBus

  beforeEach(async () => {
    db = await connect('sqlite::memory:')
    const memCache = new CacheStore(100)
    const dbCache = new DbCacheStore(db, ['polygon', 'yahoo'])
    await dbCache.init()
    eventBus = new EventBus()
    service = new MarketDataCacheService(memCache, dbCache, ['polygon', 'yahoo'], eventBus)
  })

  afterEach(async () => {
    await db.close()
  })

  it('should handle late correction scenario with events', async () => {
    const correctionEvents: CorrectionEvent[] = []
    eventBus.on('correction', (event) => correctionEvents.push(event))

    const now = Date.now()
    const timestamp = now - 3600000 // 1 hour ago

    // Initial bars
    await service.upsertBars('ES', '1m', [
      {
        timestamp,
        open: 4500,
        high: 4505,
        low: 4495,
        close: 4502,
        volume: 1000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: now - 3600000,
      },
      {
        timestamp: timestamp + 60000,
        open: 4502,
        high: 4510,
        low: 4500,
        close: 4508,
        volume: 1100,
        provider: 'polygon',
        revision: 1,
        fetchedAt: now - 3540000,
      },
    ])

    expect(correctionEvents.length).toBe(0)

    // Late correction for first bar
    await service.upsertBars('ES', '1m', [
      {
        timestamp,
        open: 4500,
        high: 4505,
        low: 4495,
        close: 4503, // Corrected
        volume: 1050, // Corrected
        provider: 'polygon',
        revision: 2,
        fetchedAt: now,
      },
    ])

    expect(correctionEvents.length).toBe(1)
    expect(correctionEvents[0].symbol).toBe('ES')
    expect(correctionEvents[0].oldBar?.close).toBe(4502)
    expect(correctionEvents[0].newBar.close).toBe(4503)

    // Query should return corrected data
    const results = await service.getBars({
      symbol: 'ES',
      timeframe: '1m',
      start: timestamp,
      end: timestamp + 120000,
    })

    expect(results[0].close).toBe(4503)
    expect(results[0].revision).toBe(2)
    expect(results[1].close).toBe(4508)
    expect(results[1].revision).toBe(1)
  })

  it('should track staleness and emit corrections', async () => {
    const now = Date.now()
    const timestamp = now - 60000 // 1 minute ago

    // Insert fresh bar
    await service.upsertBars('AAPL', '1m', [
      {
        timestamp,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 10000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: now - 2 * 60 * 1000, // 2 minutes ago
      },
    ])

    // Get bars
    const bars = await service.getBars({
      symbol: 'AAPL',
      timeframe: '1m',
      start: timestamp,
      end: timestamp + 1,
    })

    // Check staleness (TTL for 1m = 5 minutes, fetched 2 minutes ago → fresh)
    const staleBars = getStaleBars(bars, '1m')
    expect(staleBars.length).toBe(0)

    // Simulate time passing (10 minutes)
    const futureNow = now + 10 * 60 * 1000
    const staleBarsLater = getStaleBars(bars, '1m', DEFAULT_FRESHNESS_POLICIES, futureNow)
    expect(staleBarsLater.length).toBe(1)
  })

  it('should handle complex multi-provider, multi-revision scenario', async () => {
    const correctionEvents: CorrectionEvent[] = []
    eventBus.on('correction', (event) => correctionEvents.push(event))

    const now = Date.now()
    const t1 = now - 7200000 // 2 hours ago
    const t2 = now - 3600000 // 1 hour ago

    // Initial data from yahoo
    await service.upsertBars('AAPL', '5m', [
      {
        timestamp: t1,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 10000,
        provider: 'yahoo',
        revision: 1,
        fetchedAt: now - 7200000,
      },
      {
        timestamp: t2,
        open: 100.5,
        high: 102,
        low: 100,
        close: 101.5,
        volume: 11000,
        provider: 'yahoo',
        revision: 1,
        fetchedAt: now - 3600000,
      },
    ])

    // Polygon data arrives (higher priority)
    await service.upsertBars('AAPL', '5m', [
      {
        timestamp: t1,
        open: 100.1,
        high: 101.2,
        low: 99.8,
        close: 100.8,
        volume: 15000,
        provider: 'polygon',
        revision: 1,
        fetchedAt: now - 3600000,
      },
    ])

    // Yahoo correction for t2
    await service.upsertBars('AAPL', '5m', [
      {
        timestamp: t2,
        open: 100.5,
        high: 102,
        low: 100,
        close: 101.6, // Corrected
        volume: 11100, // Corrected
        provider: 'yahoo',
        revision: 2,
        fetchedAt: now,
      },
    ])

    // Should have 2 corrections: 1 provider override, 1 revision
    expect(correctionEvents.length).toBe(2)

    // Query final state
    const results = await service.getBars({
      symbol: 'AAPL',
      timeframe: '5m',
      start: t1,
      end: t2 + 1,
    })

    expect(results.length).toBe(2)
    expect(results[0].provider).toBe('polygon') // Higher priority
    expect(results[0].close).toBe(100.8)
    expect(results[1].provider).toBe('yahoo')
    expect(results[1].close).toBe(101.6) // Corrected
    expect(results[1].revision).toBe(2)
  })
})