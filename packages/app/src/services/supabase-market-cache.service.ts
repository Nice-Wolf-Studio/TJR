/**
 * @fileoverview Supabase Market Data Cache Service
 *
 * Phase 1B: Supabase-backed caching layer for Databento MCP historical bars.
 *
 * Features:
 * - Cache-first strategy: Check Supabase cache → Databento MCP → Cache result
 * - TTL-based expiration: Different TTLs per timeframe (1m, 5m, 1h, 1d)
 * - Upsert on cache updates (ON CONFLICT DO UPDATE)
 * - Graceful fallback to Databento on cache errors
 * - Comprehensive logging for cache hits/misses
 *
 * @module @tjr/app/services/supabase-market-cache
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Logger } from '@tjr/logger';
import type { MarketBar } from '@tjr/contracts';

/**
 * Configuration for Supabase Market Cache Service
 */
export interface SupabaseMarketCacheConfig {
  /** Supabase project URL */
  supabaseUrl: string;
  /** Supabase anon/service role key */
  supabaseKey: string;
  /** Logger instance */
  logger: Logger;
  /** Optional: Override default TTL values (in milliseconds) */
  ttlOverrides?: {
    '1m'?: number;
    '5m'?: number;
    '1h'?: number;
    '1d'?: number;
  };
}

/**
 * Market data cache entry (matches Supabase schema)
 */
interface CachedBar {
  symbol: string;
  timeframe: string;
  bar_timestamp: string; // ISO 8601 timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  expires_at: string; // ISO 8601 timestamp
  cached_at?: string; // ISO 8601 timestamp (optional, set by DB)
}

/**
 * Supabase Market Data Cache Service
 *
 * Provides cache-first strategy for Databento historical bars using Supabase
 * as the backing store. Implements TTL-based expiration and graceful fallback.
 *
 * @example
 * ```typescript
 * const cacheService = new SupabaseMarketCacheService({
 *   supabaseUrl: process.env.SUPABASE_URL,
 *   supabaseKey: process.env.SUPABASE_KEY,
 *   logger: logger.child({ module: 'cache' })
 * });
 *
 * // Cache-first fetch
 * const bars = await cacheService.getHistoricalBars('ES', '1h', 24, async () => {
 *   // Fallback to Databento MCP
 *   return await databento.getHistoricalBars({ symbol: 'ES', timeframe: '1h', count: 24 });
 * });
 * ```
 */
export class SupabaseMarketCacheService {
  private supabase: SupabaseClient;
  private logger: Logger;
  private ttlMs: Record<string, number>;

  constructor(config: SupabaseMarketCacheConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.logger = config.logger;

    // Default TTL values (in milliseconds)
    this.ttlMs = {
      '1m': config.ttlOverrides?.['1m'] ?? 1 * 60 * 1000, // 1 minute
      '5m': config.ttlOverrides?.['5m'] ?? 5 * 60 * 1000, // 5 minutes
      '1h': config.ttlOverrides?.['1h'] ?? 60 * 60 * 1000, // 1 hour
      '1d': config.ttlOverrides?.['1d'] ?? 24 * 60 * 60 * 1000, // 24 hours
    };
  }

  /**
   * Get TTL (time-to-live) in milliseconds for a given timeframe
   *
   * @param timeframe - Timeframe string (e.g., '1m', '5m', '1h', '1d')
   * @returns TTL in milliseconds
   *
   * @example
   * ```typescript
   * const ttl = cacheService.getTTL('1h'); // 3600000 (1 hour in ms)
   * ```
   */
  getTTL(timeframe: string): number {
    return this.ttlMs[timeframe] ?? this.ttlMs['1h'] ?? 3600000; // Default to 1 hour if unknown
  }

  /**
   * Get historical bars with cache-first strategy
   *
   * Flow:
   * 1. Check Supabase cache for sufficient data
   * 2. If cache hit (>= 90% of requested bars), return cached data
   * 3. If cache miss, call databentoFetcher callback
   * 4. Cache the fresh data asynchronously
   * 5. Return data to caller
   *
   * @param symbol - Market symbol (e.g., 'ES', 'NQ')
   * @param timeframe - Timeframe (e.g., '1h', '1d')
   * @param count - Number of bars requested
   * @param databentoFetcher - Async callback to fetch from Databento MCP (called on cache miss)
   * @returns Array of OHLCV bars
   *
   * @example
   * ```typescript
   * const bars = await cacheService.getHistoricalBars('ES', '1h', 24, async () => {
   *   return await mcpClient.executeTool('databento__get_historical_bars', {
   *     symbol: 'ES',
   *     timeframe: '1h',
   *     count: 24
   *   });
   * });
   * ```
   */
  async getHistoricalBars(
    symbol: string,
    timeframe: string,
    count: number,
    databentoFetcher: () => Promise<MarketBar[]>
  ): Promise<MarketBar[]> {
    try {
      // Attempt cache lookup
      const cachedBars = await this.getCachedBars(symbol, timeframe, count);

      // Cache hit threshold: 90% of requested bars
      const cacheHitThreshold = count * 0.9;

      if (cachedBars.length >= cacheHitThreshold) {
        this.logger.info('Cache hit', {
          symbol,
          timeframe,
          requested: count,
          cached: cachedBars.length,
          hitRate: (cachedBars.length / count) * 100,
        });

        // Return most recent N bars (in case cache has extras)
        return cachedBars.slice(-count);
      }

      this.logger.info('Cache miss', {
        symbol,
        timeframe,
        requested: count,
        cached: cachedBars.length,
        reason: cachedBars.length === 0 ? 'no_data' : 'insufficient_data',
      });
    } catch (cacheError) {
      this.logger.error('Cache read error, falling back to Databento', {
        symbol,
        timeframe,
        error: cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
    }

    // Cache miss or error: Fetch from Databento
    const freshBars = await databentoFetcher();

    // Cache fresh data asynchronously (don't block response)
    this.cacheBars(symbol, timeframe, freshBars).catch((err) => {
      this.logger.error('Failed to cache bars', {
        symbol,
        timeframe,
        count: freshBars.length,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return freshBars;
  }

  /**
   * Get cached bars from Supabase
   *
   * Queries market_data_cache table for non-expired bars matching symbol/timeframe.
   * Returns bars sorted by timestamp (oldest to newest).
   *
   * @param symbol - Market symbol
   * @param timeframe - Timeframe
   * @param count - Number of bars requested (used to optimize query)
   * @returns Array of cached bars (may be fewer than count)
   *
   * @example
   * ```typescript
   * const cached = await cacheService.getCachedBars('ES', '1h', 24);
   * if (cached.length >= 24) {
   *   console.log('Cache hit!');
   * }
   * ```
   */
  async getCachedBars(symbol: string, timeframe: string, count: number): Promise<MarketBar[]> {
    const now = new Date().toISOString();

    // Query Supabase for non-expired bars
    const { data, error } = await this.supabase
      .from('market_data_cache')
      .select('symbol, bar_timestamp, open, high, low, close, volume')
      .eq('symbol', symbol)
      .eq('timeframe', timeframe)
      .gt('expires_at', now) // Only non-expired bars
      .order('bar_timestamp', { ascending: true }) // Oldest to newest
      .limit(count * 2); // Fetch extra to account for gaps

    if (error) {
      this.logger.error('Supabase query error', {
        symbol,
        timeframe,
        error: error.message,
      });
      throw new Error(`Supabase query failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Transform to MarketBar format
    return data.map((row) => ({
      timestamp: row.bar_timestamp,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    }));
  }

  /**
   * Cache bars in Supabase with upsert strategy
   *
   * Uses ON CONFLICT (symbol, timeframe, bar_timestamp) DO UPDATE to handle
   * duplicate bars gracefully. Sets expires_at based on timeframe TTL.
   *
   * @param symbol - Market symbol
   * @param timeframe - Timeframe
   * @param bars - Array of bars to cache
   *
   * @example
   * ```typescript
   * await cacheService.cacheBars('ES', '1h', freshBars);
   * ```
   */
  async cacheBars(symbol: string, timeframe: string, bars: MarketBar[]): Promise<void> {
    if (bars.length === 0) {
      this.logger.debug('No bars to cache', { symbol, timeframe });
      return;
    }

    const ttl = this.getTTL(timeframe);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl).toISOString();

    // Transform bars to Supabase format
    const cachedBars: CachedBar[] = bars.map((bar) => ({
      symbol,
      timeframe,
      bar_timestamp: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      expires_at: expiresAt,
    }));

    // Upsert bars (insert or update on conflict)
    const { error } = await this.supabase.from('market_data_cache').upsert(cachedBars, {
      onConflict: 'symbol,timeframe,bar_timestamp', // Unique constraint columns
      ignoreDuplicates: false, // Update existing rows
    });

    if (error) {
      this.logger.error('Failed to upsert bars', {
        symbol,
        timeframe,
        count: bars.length,
        error: error.message,
      });
      throw new Error(`Supabase upsert failed: ${error.message}`);
    }

    this.logger.debug('Cached bars successfully', {
      symbol,
      timeframe,
      count: bars.length,
      ttl: `${ttl}ms`,
      expiresAt,
    });
  }

  /**
   * Clean up expired cache entries
   *
   * Deletes all rows from market_data_cache where expires_at < NOW().
   * Returns the number of rows deleted.
   *
   * Recommended to run periodically (e.g., via cron job or scheduled task).
   *
   * @returns Number of cache entries deleted
   *
   * @example
   * ```typescript
   * const deleted = await cacheService.cleanupExpiredCache();
   * console.log(`Cleaned up ${deleted} expired cache entries`);
   * ```
   */
  async cleanupExpiredCache(): Promise<number> {
    const now = new Date().toISOString();

    // Delete expired entries
    const { data, error } = await this.supabase
      .from('market_data_cache')
      .delete()
      .lt('expires_at', now)
      .select('id'); // Select to get count of deleted rows

    if (error) {
      this.logger.error('Cache cleanup failed', {
        error: error.message,
      });
      throw new Error(`Supabase cleanup failed: ${error.message}`);
    }

    const deletedCount = data?.length ?? 0;

    this.logger.info('Cache cleanup completed', {
      deletedCount,
      timestamp: now,
    });

    return deletedCount;
  }

  /**
   * Get cache statistics
   *
   * Returns counts of total cached bars, grouped by symbol and timeframe.
   *
   * @returns Cache statistics object
   *
   * @example
   * ```typescript
   * const stats = await cacheService.getCacheStats();
   * console.log(`Total cached bars: ${stats.totalBars}`);
   * ```
   */
  async getCacheStats(): Promise<{
    totalBars: number;
    expiredBars: number;
    activeBars: number;
  }> {
    const now = new Date().toISOString();

    // Get total count
    const { count: totalBars, error: totalError } = await this.supabase
      .from('market_data_cache')
      .select('id', { count: 'exact', head: true });

    if (totalError) {
      this.logger.error('Failed to get total cache count', { error: totalError.message });
      throw new Error(`Cache stats query failed: ${totalError.message}`);
    }

    // Get expired count
    const { count: expiredBars, error: expiredError } = await this.supabase
      .from('market_data_cache')
      .select('id', { count: 'exact', head: true })
      .lt('expires_at', now);

    if (expiredError) {
      this.logger.error('Failed to get expired cache count', { error: expiredError.message });
      throw new Error(`Cache stats query failed: ${expiredError.message}`);
    }

    const activeBars = (totalBars ?? 0) - (expiredBars ?? 0);

    return {
      totalBars: totalBars ?? 0,
      expiredBars: expiredBars ?? 0,
      activeBars,
    };
  }
}

/**
 * Example integration with Databento MCP:
 *
 * ```typescript
 * // In Discord bot or command handler:
 *
 * import { SupabaseMarketCacheService } from './services/supabase-market-cache.service';
 * import { McpClientService } from './services/mcp-client.service';
 *
 * // Initialize services
 * const logger = createLogger({ module: 'market-cache' });
 * const mcpClient = new McpClientService(logger);
 * await mcpClient.initialize(); // Loads Databento MCP
 *
 * const cacheService = new SupabaseMarketCacheService({
 *   supabaseUrl: process.env.SUPABASE_URL!,
 *   supabaseKey: process.env.SUPABASE_KEY!,
 *   logger: logger.child({ service: 'cache' })
 * });
 *
 * // Cache-first historical bars fetch
 * const bars = await cacheService.getHistoricalBars('ES', '1h', 24, async () => {
 *   // Fallback to Databento MCP
 *   const result = await mcpClient.executeTool('databento__get_historical_bars', {
 *     symbol: 'ES',
 *     timeframe: '1h',
 *     count: 24
 *   });
 *
 *   // Parse MCP result (format depends on tool output)
 *   return JSON.parse(result.content[0].text);
 * });
 *
 * console.log(`Fetched ${bars.length} bars for ES (1h)`);
 *
 * // Periodic cleanup (run via cron or scheduled task)
 * setInterval(async () => {
 *   const deleted = await cacheService.cleanupExpiredCache();
 *   logger.info('Periodic cache cleanup', { deleted });
 * }, 60 * 60 * 1000); // Every hour
 * ```
 */
