/**
 * Type definitions for the bars cache system.
 *
 * This module defines the core types for caching market data bars with
 * support for multiple providers, revisions, and time-based queries.
 */

import { Bar, Timeframe } from '@tjr-suite/market-data-core';

/**
 * Cached bar with provider metadata and versioning.
 *
 * Extends the base Bar type with additional fields for cache management:
 * - provider: identifies the data source (e.g., 'yahoo', 'polygon')
 * - revision: monotonic version number for handling late corrections
 * - fetchedAt: timestamp when the bar was cached (for TTL/staleness checks)
 *
 * Example:
 * ```typescript
 * const cachedBar: CachedBar = {
 *   timestamp: 1633024800000, // 2021-09-30T14:00:00.000Z
 *   open: 100.5,
 *   high: 101.2,
 *   low: 100.1,
 *   close: 100.8,
 *   volume: 15000,
 *   provider: 'polygon',
 *   revision: 1,
 *   fetchedAt: 1633025000000
 * };
 * ```
 */
export interface CachedBar extends Bar {
  /**
   * Data provider identifier (e.g., 'yahoo', 'polygon', 'alpaca').
   *
   * Used for provider priority resolution when multiple providers
   * have data for the same bar.
   */
  provider: string;

  /**
   * Monotonic revision number for handling late corrections.
   *
   * Starts at 1 for initial bar data. Incremented when providers
   * publish corrections or adjustments. Higher revision numbers
   * take precedence over lower ones.
   */
  revision: number;

  /**
   * Unix timestamp (milliseconds) when this bar was fetched and cached.
   *
   * Used for TTL checks and cache staleness detection. All timestamps
   * are in UTC to avoid DST-related issues.
   */
  fetchedAt: number;
}

/**
 * Unique identifier for a cached bar.
 *
 * Combines symbol, timeframe, and timestamp to uniquely identify a bar.
 * Note: provider is not part of the key because we merge multiple providers
 * for the same bar using priority rules.
 *
 * Example:
 * ```typescript
 * const key: CacheKey = {
 *   symbol: 'AAPL',
 *   timeframe: '5m',
 *   timestamp: 1633024800000
 * };
 * ```
 */
export interface CacheKey {
  /**
   * Symbol/ticker identifier (e.g., 'AAPL', 'BTC-USD').
   */
  symbol: string;

  /**
   * Timeframe for the bar (e.g., '1m', '5m', '1h', '1D').
   */
  timeframe: Timeframe;

  /**
   * Bar timestamp (Unix milliseconds, UTC).
   *
   * This should be the start of the bar period, aligned to the
   * timeframe boundary.
   */
  timestamp: number;
}

/**
 * Query parameters for fetching a range of cached bars.
 *
 * Used to retrieve multiple bars within a time window.
 *
 * Example:
 * ```typescript
 * const query: CacheQuery = {
 *   symbol: 'AAPL',
 *   timeframe: '5m',
 *   start: 1633024800000, // 2021-09-30T14:00:00.000Z
 *   end: 1633111200000    // 2021-10-01T14:00:00.000Z
 * };
 * ```
 */
export interface CacheQuery {
  /**
   * Symbol/ticker identifier (e.g., 'AAPL', 'BTC-USD').
   */
  symbol: string;

  /**
   * Timeframe for the bars (e.g., '1m', '5m', '1h', '1D').
   */
  timeframe: Timeframe;

  /**
   * Start of time range (Unix milliseconds, UTC, inclusive).
   */
  start: number;

  /**
   * End of time range (Unix milliseconds, UTC, exclusive).
   */
  end: number;
}
