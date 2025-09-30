/**
 * Cache freshness and TTL policies for market data bars.
 *
 * Different timeframes have different staleness characteristics:
 * - 1m bars become stale quickly (5 minutes)
 * - 5m bars stay fresh longer (15 minutes)
 * - 1h bars remain valid for hours (2 hours)
 * - 1D bars are valid for a full day (24 hours)
 *
 * TTL policies help determine when cached data should be refreshed
 * from the data provider.
 */

import type { Timeframe } from '@tjr-suite/market-data-core'
import type { CachedBar } from './types.js'

/**
 * Time-to-live policy for a specific timeframe.
 *
 * Defines how long cached bars remain fresh before they should
 * be refreshed from the data provider.
 */
export interface FreshnessPolicy {
  /**
   * Timeframe this policy applies to (e.g., '1m', '5m', '1h', '1D').
   */
  timeframe: Timeframe

  /**
   * Time-to-live in milliseconds.
   *
   * After this duration from fetchedAt, the bar is considered stale
   * and should be refreshed.
   */
  ttlMs: number
}

/**
 * Default TTL policies for common timeframes.
 *
 * These values are based on typical market data usage patterns:
 * - High-frequency bars (1m, 5m) need frequent updates
 * - Medium-frequency bars (15m, 30m, 1h) can stay cached longer
 * - Daily bars rarely change after market close
 *
 * Policies can be customized based on specific use cases:
 * - Real-time trading: shorter TTLs
 * - Backtesting: longer TTLs or no TTL
 * - Research: longer TTLs acceptable
 */
export const DEFAULT_FRESHNESS_POLICIES: FreshnessPolicy[] = [
  { timeframe: '1m', ttlMs: 5 * 60 * 1000 }, // 5 minutes
  { timeframe: '5m', ttlMs: 15 * 60 * 1000 }, // 15 minutes
  { timeframe: '10m', ttlMs: 20 * 60 * 1000 }, // 20 minutes
  { timeframe: '15m', ttlMs: 30 * 60 * 1000 }, // 30 minutes
  { timeframe: '30m', ttlMs: 60 * 60 * 1000 }, // 1 hour
  { timeframe: '1h', ttlMs: 2 * 60 * 60 * 1000 }, // 2 hours
  { timeframe: '2h', ttlMs: 4 * 60 * 60 * 1000 }, // 4 hours
  { timeframe: '4h', ttlMs: 6 * 60 * 60 * 1000 }, // 6 hours
  { timeframe: '1D', ttlMs: 24 * 60 * 60 * 1000 }, // 24 hours
]

/**
 * Default TTL fallback for unknown timeframes.
 *
 * Used when no specific policy exists for a timeframe.
 * Conservative value of 10 minutes.
 */
const DEFAULT_TTL_MS = 10 * 60 * 1000

/**
 * Check if a cached bar is stale and needs refreshing.
 *
 * A bar is considered stale if:
 * 1. Current time - fetchedAt > TTL for the timeframe
 * 2. The bar represents a recent period that might still be updating
 *
 * Note: Bars from far in the past (historical data) are generally
 * not stale since they're finalized.
 *
 * @param bar - The cached bar to check
 * @param timeframe - Timeframe of the bar
 * @param policies - Optional custom freshness policies (uses defaults if not provided)
 * @param now - Optional current timestamp (defaults to Date.now())
 * @returns true if the bar is stale and should be refreshed
 *
 * Example:
 * ```typescript
 * const bar: CachedBar = {
 *   timestamp: Date.now() - 3600000, // 1 hour ago
 *   open: 100,
 *   high: 101,
 *   low: 99,
 *   close: 100.5,
 *   volume: 10000,
 *   provider: 'polygon',
 *   revision: 1,
 *   fetchedAt: Date.now() - 7200000 // fetched 2 hours ago
 * };
 *
 * // Check if stale for 1h timeframe (TTL = 2 hours)
 * const stale = isStale(bar, '1h'); // true, fetched 2+ hours ago
 * ```
 */
export function isStale(
  bar: CachedBar,
  timeframe: Timeframe,
  policies: FreshnessPolicy[] = DEFAULT_FRESHNESS_POLICIES,
  now: number = Date.now()
): boolean {
  // First check: if the bar timestamp is very old (historical data),
  // it's less likely to be updated, so consider it fresh regardless of fetchedAt.
  // This prevents unnecessary re-fetches of historical data.
  const barAge = now - bar.timestamp
  const isHistorical = barAge > 7 * 24 * 60 * 60 * 1000 // older than 7 days

  if (isHistorical) {
    // Historical bars are considered fresh (finalized)
    return false
  }

  // Find TTL policy for this timeframe
  const policy = policies.find((p) => p.timeframe === timeframe)
  const ttl = policy?.ttlMs ?? DEFAULT_TTL_MS

  // Calculate age of cached data
  const age = now - bar.fetchedAt

  // Bar is stale if age exceeds TTL
  return age > ttl
}

/**
 * Get the TTL for a specific timeframe.
 *
 * @param timeframe - Timeframe to get TTL for
 * @param policies - Optional custom freshness policies (uses defaults if not provided)
 * @returns TTL in milliseconds
 *
 * Example:
 * ```typescript
 * const ttl = getTTL('5m'); // 900000 (15 minutes)
 * ```
 */
export function getTTL(
  timeframe: Timeframe,
  policies: FreshnessPolicy[] = DEFAULT_FRESHNESS_POLICIES
): number {
  const policy = policies.find((p) => p.timeframe === timeframe)
  return policy?.ttlMs ?? DEFAULT_TTL_MS
}

/**
 * Check if multiple bars need refreshing.
 *
 * Filters a list of bars to find those that are stale.
 *
 * @param bars - Array of cached bars to check
 * @param timeframe - Timeframe of the bars
 * @param policies - Optional custom freshness policies
 * @param now - Optional current timestamp
 * @returns Array of stale bars that need refreshing
 *
 * Example:
 * ```typescript
 * const bars = await service.getBars({...});
 * const staleBars = getStaleBars(bars, '5m');
 *
 * if (staleBars.length > 0) {
 *   console.log(`${staleBars.length} bars need refreshing`);
 *   // Trigger refresh from provider
 * }
 * ```
 */
export function getStaleBars(
  bars: CachedBar[],
  timeframe: Timeframe,
  policies: FreshnessPolicy[] = DEFAULT_FRESHNESS_POLICIES,
  now: number = Date.now()
): CachedBar[] {
  return bars.filter((bar) => isStale(bar, timeframe, policies, now))
}

/**
 * Calculate when a bar will become stale.
 *
 * @param bar - The cached bar
 * @param timeframe - Timeframe of the bar
 * @param policies - Optional custom freshness policies
 * @returns Unix timestamp (ms) when the bar becomes stale
 *
 * Example:
 * ```typescript
 * const bar = {...};
 * const staleAt = getStaleTimestamp(bar, '1h');
 * const timeUntilStale = staleAt - Date.now();
 * console.log(`Bar will be stale in ${timeUntilStale / 1000} seconds`);
 * ```
 */
export function getStaleTimestamp(
  bar: CachedBar,
  timeframe: Timeframe,
  policies: FreshnessPolicy[] = DEFAULT_FRESHNESS_POLICIES
): number {
  const ttl = getTTL(timeframe, policies)
  return bar.fetchedAt + ttl
}