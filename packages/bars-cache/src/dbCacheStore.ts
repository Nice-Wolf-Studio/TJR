/**
 * Database-backed persistence layer for market data bar cache.
 *
 * Provides durable storage for bars with support for:
 * - Revision conflict resolution (newer revisions override older ones)
 * - Provider priority merging (prefer higher-priority providers)
 * - Range queries with efficient indexing
 */

import type { DbConnection } from '@tjr-suite/db-simple'
import type { CachedBar, CacheKey, CacheQuery } from './types.js'

/**
 * Database row type for bars_cache table.
 */
interface BarRow {
  symbol: string
  timeframe: string
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  provider: string
  revision: number
  fetched_at: number
}

/**
 * Database cache store for persistent bar storage.
 *
 * Stores bars in a database table with support for SQLite and PostgreSQL.
 * Handles revision conflicts and provider priority resolution.
 *
 * Schema:
 * - Primary key: (symbol, timeframe, timestamp, provider)
 * - Revision tracking: bars can be updated with newer revisions
 * - Provider merging: multiple providers can store data for the same bar
 *
 * Example:
 * ```typescript
 * const dbStore = new DbCacheStore(dbConnection, ['polygon', 'yahoo']);
 * await dbStore.init();
 *
 * // Store a bar
 * await dbStore.set({
 *   timestamp: 1633024800000,
 *   open: 100.5,
 *   high: 101.2,
 *   low: 100.1,
 *   close: 100.8,
 *   volume: 15000,
 *   provider: 'polygon',
 *   revision: 1,
 *   fetchedAt: Date.now()
 * });
 *
 * // Retrieve bars for a range
 * const bars = await dbStore.getRange({
 *   symbol: 'AAPL',
 *   timeframe: '5m',
 *   start: 1633024800000,
 *   end: 1633111200000
 * });
 * ```
 */
export class DbCacheStore {
  private db: DbConnection
  private providerPriority: string[]

  /**
   * Create a new database cache store.
   *
   * @param db - Database connection from @tjr-suite/db-simple
   * @param providerPriority - Ordered list of providers (highest priority first)
   *                           Example: ['polygon', 'yahoo'] prefers polygon over yahoo
   */
  constructor(db: DbConnection, providerPriority: string[] = []) {
    this.db = db
    this.providerPriority = providerPriority
  }

  /**
   * Initialize the database schema.
   *
   * Creates the bars_cache table if it doesn't exist. Safe to call multiple times.
   *
   * @throws Error if table creation fails
   */
  async init(): Promise<void> {
    try {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS bars_cache (
          symbol TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          open REAL NOT NULL,
          high REAL NOT NULL,
          low REAL NOT NULL,
          close REAL NOT NULL,
          volume REAL NOT NULL,
          provider TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          fetched_at INTEGER NOT NULL,
          PRIMARY KEY (symbol, timeframe, timestamp, provider)
        )
      `

      await this.db.exec(createTableSQL)

      // Create index for efficient range queries
      const createIndexSQL = `
        CREATE INDEX IF NOT EXISTS idx_bars_cache_lookup
        ON bars_cache (symbol, timeframe, timestamp)
      `

      await this.db.exec(createIndexSQL)
    } catch (error) {
      throw new Error(`Failed to initialize bars_cache table: ${error}`)
    }
  }

  /**
   * Get a single bar from the database.
   *
   * If multiple providers have data for the same bar, returns the one
   * with highest priority (based on providerPriority) and highest revision.
   *
   * @param key - Cache key (must include symbol, timeframe, timestamp)
   * @returns The cached bar if found, null otherwise
   */
  async get(key: CacheKey): Promise<CachedBar | null> {
    try {
      const sql = `
        SELECT symbol, timeframe, timestamp, open, high, low, close, volume,
               provider, revision, fetched_at
        FROM bars_cache
        WHERE symbol = ? AND timeframe = ? AND timestamp = ?
        ORDER BY revision DESC
      `

      const params = [key.symbol, key.timeframe, key.timestamp]
      const rows = await this.db.query<BarRow>(sql, params)

      if (rows.length === 0) {
        return null
      }

      // Select best bar based on provider priority and revision
      const bestBar = this.selectBestBar(rows)

      if (!bestBar) {
        return null
      }

      return {
        timestamp: bestBar.timestamp,
        open: bestBar.open,
        high: bestBar.high,
        low: bestBar.low,
        close: bestBar.close,
        volume: bestBar.volume,
        provider: bestBar.provider,
        revision: bestBar.revision,
        fetchedAt: bestBar.fetched_at,
      }
    } catch (error) {
      throw new Error(`Failed to get bar from database: ${error}`)
    }
  }

  /**
   * Store a bar in the database.
   *
   * Handles revision conflicts:
   * - If bar exists with lower revision, updates it
   * - If bar exists with same/higher revision, skips update
   * - Uses UPSERT logic (INSERT ... ON CONFLICT)
   *
   * @param bar - The cached bar to store (must include all fields)
   */
  async set(_bar: CachedBar): Promise<void> {
    // We need to extract symbol and timeframe from somewhere
    // Since CachedBar extends Bar which doesn't have these fields,
    // we need to pass them separately. Use setWithKey() instead.
    throw new Error('set() requires symbol and timeframe - use setWithKey() instead')
  }

  /**
   * Store a bar in the database with explicit key.
   *
   * @param key - Cache key (symbol, timeframe, timestamp)
   * @param bar - The cached bar to store
   */
  async setWithKey(key: CacheKey, bar: CachedBar): Promise<void> {
    try {
      if (this.db.dbType === 'sqlite') {
        // SQLite UPSERT syntax
        const sql = `
          INSERT INTO bars_cache (
            symbol, timeframe, timestamp, open, high, low, close, volume,
            provider, revision, fetched_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(symbol, timeframe, timestamp, provider)
          DO UPDATE SET
            open = excluded.open,
            high = excluded.high,
            low = excluded.low,
            close = excluded.close,
            volume = excluded.volume,
            revision = excluded.revision,
            fetched_at = excluded.fetched_at
          WHERE excluded.revision > bars_cache.revision
        `

        const params = [
          key.symbol,
          key.timeframe,
          key.timestamp,
          bar.open,
          bar.high,
          bar.low,
          bar.close,
          bar.volume,
          bar.provider,
          bar.revision,
          bar.fetchedAt,
        ]

        await this.db.exec(sql, params)
      } else {
        // PostgreSQL UPSERT syntax
        const sql = `
          INSERT INTO bars_cache (
            symbol, timeframe, timestamp, open, high, low, close, volume,
            provider, revision, fetched_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT(symbol, timeframe, timestamp, provider)
          DO UPDATE SET
            open = EXCLUDED.open,
            high = EXCLUDED.high,
            low = EXCLUDED.low,
            close = EXCLUDED.close,
            volume = EXCLUDED.volume,
            revision = EXCLUDED.revision,
            fetched_at = EXCLUDED.fetched_at
          WHERE EXCLUDED.revision > bars_cache.revision
        `

        const params = [
          key.symbol,
          key.timeframe,
          key.timestamp,
          bar.open,
          bar.high,
          bar.low,
          bar.close,
          bar.volume,
          bar.provider,
          bar.revision,
          bar.fetchedAt,
        ]

        await this.db.exec(sql, params)
      }
    } catch (error) {
      throw new Error(`Failed to set bar in database: ${error}`)
    }
  }

  /**
   * Get all bars within a time range.
   *
   * Returns bars merged by provider priority. For each timestamp, selects
   * the bar from the highest-priority provider with the highest revision.
   *
   * @param query - Query parameters (symbol, timeframe, start, end)
   * @returns Array of cached bars, sorted by timestamp
   */
  async getRange(query: CacheQuery): Promise<CachedBar[]> {
    try {
      const sql = `
        SELECT symbol, timeframe, timestamp, open, high, low, close, volume,
               provider, revision, fetched_at
        FROM bars_cache
        WHERE symbol = ?
          AND timeframe = ?
          AND timestamp >= ?
          AND timestamp < ?
        ORDER BY timestamp ASC, revision DESC
      `

      const params = [query.symbol, query.timeframe, query.start, query.end]
      const rows = await this.db.query<BarRow>(sql, params)

      // Group by timestamp and select best bar for each
      const barsByTimestamp = new Map<number, BarRow[]>()

      for (const row of rows) {
        const existing = barsByTimestamp.get(row.timestamp)
        if (!existing) {
          barsByTimestamp.set(row.timestamp, [row])
        } else {
          existing.push(row)
        }
      }

      // Select best bar for each timestamp
      const results: CachedBar[] = []

      for (const [, bars] of barsByTimestamp) {
        const bestBar = this.selectBestBar(bars)
        if (bestBar) {
          results.push({
            timestamp: bestBar.timestamp,
            open: bestBar.open,
            high: bestBar.high,
            low: bestBar.low,
            close: bestBar.close,
            volume: bestBar.volume,
            provider: bestBar.provider,
            revision: bestBar.revision,
            fetchedAt: bestBar.fetched_at,
          })
        }
      }

      return results
    } catch (error) {
      throw new Error(`Failed to get range from database: ${error}`)
    }
  }

  /**
   * Select the best bar from multiple candidates.
   *
   * Selection criteria:
   * 1. Highest provider priority (from providerPriority list)
   * 2. Highest revision number (for same provider)
   *
   * @param bars - Array of bars for the same timestamp
   * @returns The best bar, or null if input is empty
   */
  private selectBestBar(bars: BarRow[]): BarRow | null {
    if (bars.length === 0) {
      return null
    }

    if (bars.length === 1) {
      return bars[0]
    }

    // If no provider priority specified, return highest revision
    if (this.providerPriority.length === 0) {
      return bars.reduce((best, current) =>
        current.revision > best.revision ? current : best
      )
    }

    // Score each bar: lower score = higher priority
    const scored = bars.map((bar) => {
      const priorityIndex = this.providerPriority.indexOf(bar.provider)
      const priorityScore =
        priorityIndex >= 0 ? priorityIndex : this.providerPriority.length

      return { bar, priorityScore }
    })

    // Sort by priority (ascending), then revision (descending)
    scored.sort((a, b) => {
      if (a.priorityScore !== b.priorityScore) {
        return a.priorityScore - b.priorityScore
      }
      return b.bar.revision - a.bar.revision
    })

    return scored[0]?.bar ?? null
  }
}