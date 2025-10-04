/**
 * Market Data Cache Integration
 *
 * This module demonstrates how to integrate the bars-cache package with the
 * prompt processor to cache Databento API responses.
 *
 * Implementation guide for caching market data in the Discord bot.
 */

import type { DbConnection } from '@tjr-suite/db-simple';
import { CacheStore, DbCacheStore, MarketDataCacheService } from '@tjr/bars-cache';
import type { Logger } from '@tjr/logger';
import type { Bar } from '@tjr/analysis-kit';
import { getRecentBars as getRecentBarsFromDatabento, getQuote as getQuoteFromDatabento } from '@tjr/databento';

/**
 * Configuration for market data cache
 */
export interface MarketDataCacheConfig {
  /** Database connection */
  db: DbConnection;
  /** Logger instance */
  logger: Logger;
  /** Memory cache size for bars */
  memoryCacheSizeBars?: number;
  /** Memory cache size for quotes */
  memoryCacheSizeQuotes?: number;
  /** Provider priority list (highest priority first) */
  providerPriority?: string[];
}

/**
 * Quote cache entry
 */
interface CachedQuote {
  symbol: string;
  timestamp: number;
  bidPrice: number;
  askPrice: number;
  bidSize?: number;
  askSize?: number;
  provider: string;
  fetchedAt: number;
}

/**
 * Market data cache wrapper with Databento integration
 */
export class MarketDataCacheWrapper {
  private barsCache: MarketDataCacheService;
  private quotesMemCache: Map<string, CachedQuote>;
  private logger: Logger;
  private db: DbConnection;

  constructor(config: MarketDataCacheConfig) {
    this.logger = config.logger;
    this.db = config.db;

    // Initialize bars cache (using existing bars-cache package)
    const memCache = new CacheStore(config.memoryCacheSizeBars || 10000);
    const dbCache = new DbCacheStore(config.db, config.providerPriority || ['databento']);

    this.barsCache = new MarketDataCacheService(
      memCache,
      dbCache,
      config.providerPriority || ['databento']
    );

    // Initialize quotes memory cache (simple LRU)
    this.quotesMemCache = new Map();
  }

  /**
   * Initialize database schema
   */
  async initialize(): Promise<void> {
    // Initialize bars cache tables
    const dbCache = new DbCacheStore(this.db, ['databento']);
    await dbCache.init();

    // Quotes table is created by migration 002
    this.logger.info('Market data cache initialized');
  }

  /**
   * Get recent bars with caching
   *
   * Checks cache first, falls back to Databento API on miss
   */
  async getRecentBars(
    symbol: string,
    timeframe: '1m' | '1h' | '4h',
    count: number
  ): Promise<Bar[]> {
    const startTime = this.calculateStartTime(timeframe, count);
    const endTime = Date.now();

    // Check cache first
    const cacheQuery = {
      symbol,
      timeframe,
      start: startTime,
      end: endTime
    };

    this.logger.debug('Checking bars cache', { symbol, timeframe, count });

    try {
      const cachedBars = await this.barsCache.getBars(cacheQuery);

      if (cachedBars.length >= count * 0.9) { // Allow 90% cache hit
        this.logger.info('Bars cache hit', {
          symbol,
          timeframe,
          requested: count,
          cached: cachedBars.length
        });
        return cachedBars.slice(-count);
      }

      this.logger.info('Bars cache miss, fetching from Databento', {
        symbol,
        timeframe,
        requested: count,
        cached: cachedBars.length
      });
    } catch (error) {
      this.logger.error('Error reading bars cache', { error });
    }

    // Fetch from Databento
    const bars = await getRecentBarsFromDatabento(symbol as any, timeframe, count);

    // Store in cache asynchronously (don't block response)
    this.storeBarsInCache(symbol, timeframe, bars).catch(err => {
      this.logger.error('Failed to cache bars', { error: err });
    });

    return bars;
  }

  /**
   * Get quote with caching
   *
   * Checks memory and database cache first, falls back to Databento API
   */
  async getQuote(symbol: string): Promise<{ price: number; timestamp: Date }> {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    // Check memory cache first
    const memCached = this.quotesMemCache.get(symbol);
    if (memCached && memCached.fetchedAt > fiveMinutesAgo) {
      this.logger.debug('Quote memory cache hit', { symbol });
      return {
        price: (memCached.bidPrice + memCached.askPrice) / 2,
        timestamp: new Date(memCached.timestamp)
      };
    }

    // Check database cache
    try {
      const dbQuote = await this.getQuoteFromDb(symbol, fiveMinutesAgo);
      if (dbQuote) {
        this.logger.info('Quote database cache hit', { symbol });

        // Store in memory cache
        this.quotesMemCache.set(symbol, dbQuote);

        return {
          price: (dbQuote.bidPrice + dbQuote.askPrice) / 2,
          timestamp: new Date(dbQuote.timestamp)
        };
      }
    } catch (error) {
      this.logger.error('Error reading quotes cache', { error });
    }

    // Fetch from Databento
    this.logger.info('Quote cache miss, fetching from Databento', { symbol });
    const quote = await getQuoteFromDatabento(symbol as any);

    // Store in cache
    const cachedQuote: CachedQuote = {
      symbol,
      timestamp: quote.timestamp.getTime(),
      bidPrice: quote.price - 0.25, // Simulate bid/ask spread
      askPrice: quote.price + 0.25,
      provider: 'databento',
      fetchedAt: now
    };

    // Store in both memory and database
    this.quotesMemCache.set(symbol, cachedQuote);
    this.storeQuoteInDb(cachedQuote).catch(err => {
      this.logger.error('Failed to cache quote', { error: err });
    });

    return quote;
  }

  /**
   * Calculate start time for a given timeframe and bar count
   */
  private calculateStartTime(timeframe: string, count: number): number {
    const now = Date.now();
    const msPerBar: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1D': 24 * 60 * 60 * 1000
    };

    const barMs = msPerBar[timeframe] || msPerBar['1h'] || 60 * 60 * 1000;
    // Add 50% buffer for weekends/holidays
    return now - (count * barMs * 1.5);
  }

  /**
   * Store bars in cache (async, non-blocking)
   */
  private async storeBarsInCache(
    symbol: string,
    timeframe: string,
    bars: any[]
  ): Promise<void> {
    const cachedBars = bars.map(bar => ({
      ...bar,
      provider: 'databento',
      revision: 1,
      fetchedAt: Date.now()
    }));

    await this.barsCache.storeBars(symbol, timeframe as '1m' | '1h' | '4h' | '1D', cachedBars);
    this.logger.debug('Stored bars in cache', {
      symbol,
      timeframe,
      count: bars.length
    });
  }

  /**
   * Get quote from database
   */
  private async getQuoteFromDb(
    symbol: string,
    minTimestamp: number
  ): Promise<CachedQuote | null> {
    const sql = `
      SELECT symbol, timestamp, bid_price, ask_price, bid_size, ask_size,
             provider, fetched_at
      FROM quotes_cache
      WHERE symbol = ? AND fetched_at > ?
      ORDER BY timestamp DESC
      LIMIT 1
    `;

    const rows = await this.db.query<any>(sql, [symbol, minTimestamp]);

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      symbol: row.symbol,
      timestamp: row.timestamp,
      bidPrice: row.bid_price,
      askPrice: row.ask_price,
      bidSize: row.bid_size,
      askSize: row.ask_size,
      provider: row.provider,
      fetchedAt: row.fetched_at
    };
  }

  /**
   * Store quote in database
   */
  private async storeQuoteInDb(quote: CachedQuote): Promise<void> {
    const sql = this.db.dbType === 'sqlite'
      ? `
        INSERT OR REPLACE INTO quotes_cache (
          symbol, timestamp, bid_price, ask_price, bid_size, ask_size,
          provider, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      : `
        INSERT INTO quotes_cache (
          symbol, timestamp, bid_price, ask_price, bid_size, ask_size,
          provider, fetched_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (symbol, timestamp) DO UPDATE SET
          bid_price = EXCLUDED.bid_price,
          ask_price = EXCLUDED.ask_price,
          bid_size = EXCLUDED.bid_size,
          ask_size = EXCLUDED.ask_size,
          provider = EXCLUDED.provider,
          fetched_at = EXCLUDED.fetched_at
      `;

    await this.db.exec(sql, [
      quote.symbol,
      quote.timestamp,
      quote.bidPrice,
      quote.askPrice,
      quote.bidSize || null,
      quote.askSize || null,
      quote.provider,
      quote.fetchedAt
    ]);
  }

  /**
   * Clear expired quotes (TTL cleanup)
   */
  async cleanupExpiredQuotes(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;

    const sql = 'DELETE FROM quotes_cache WHERE fetched_at < ?';
    await this.db.exec(sql, [cutoff]);

    // Also clean memory cache
    for (const [symbol, quote] of this.quotesMemCache.entries()) {
      if (quote.fetchedAt < cutoff) {
        this.quotesMemCache.delete(symbol);
      }
    }

    const result = await this.db.query<{ changes: number }>(
      'SELECT changes() as changes',
      []
    );

    const deleted = result[0]?.changes || 0;
    this.logger.info('Cleaned up expired quotes', { deleted, maxAgeMs });

    return deleted;
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    bars: { memory: number; database: number };
    quotes: { memory: number; database: number };
  }> {
    const barsDbCount = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM bars_cache',
      []
    );

    const quotesDbCount = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM quotes_cache',
      []
    );

    return {
      bars: {
        memory: 0, // Would need to expose from CacheStore
        database: barsDbCount[0]?.count || 0
      },
      quotes: {
        memory: this.quotesMemCache.size,
        database: quotesDbCount[0]?.count || 0
      }
    };
  }
}

/**
 * Example integration with prompt processor:
 *
 * ```typescript
 * // In prompt-processor.ts constructor:
 *
 * import { connect } from '@tjr-suite/db-simple';
 * import { MarketDataCacheWrapper } from './market-data-cache-integration';
 *
 * constructor(config: PromptProcessorConfig) {
 *   // Connect to database
 *   const db = await connect('sqlite:data/market-cache.db');
 *
 *   // Initialize cache
 *   this.marketDataCache = new MarketDataCacheWrapper({
 *     db,
 *     logger: config.logger.child({ module: 'cache' }),
 *     memoryCacheSizeBars: 10000,
 *     memoryCacheSizeQuotes: 1000,
 *     providerPriority: ['databento']
 *   });
 *
 *   await this.marketDataCache.initialize();
 * }
 *
 * // Replace direct Databento calls:
 * // OLD: const bars = await getRecentBars(symbol, '1h', 24);
 * // NEW: const bars = await this.marketDataCache.getRecentBars(symbol, '1h', 24);
 * ```
 */