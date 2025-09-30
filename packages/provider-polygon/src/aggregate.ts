/**
 * Timeframe aggregation utilities for Polygon.io provider.
 *
 * This module provides functions to aggregate bars from native Polygon
 * timeframes (1m, 5m, 15m, 30m, 1h, 1D) to target timeframes (10m, 4h)
 * that Polygon doesn't directly support.
 */

import type { Bar, Timeframe } from "@tjr-suite/market-data-core";
import { aggregateBars } from "@tjr-suite/market-data-core";

/**
 * Native timeframes supported by Polygon.io API.
 * These can be requested directly without aggregation.
 */
export const POLYGON_NATIVE_TIMEFRAMES: Timeframe[] = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "1D",
];

/**
 * Timeframes that require aggregation from native Polygon timeframes.
 */
export const POLYGON_AGGREGATED_TIMEFRAMES: Timeframe[] = ["10m", "2h", "4h"];

/**
 * All timeframes supported by this provider (native + aggregated).
 */
export const POLYGON_SUPPORTED_TIMEFRAMES: Timeframe[] = [
  ...POLYGON_NATIVE_TIMEFRAMES,
  ...POLYGON_AGGREGATED_TIMEFRAMES,
];

/**
 * Determines if a timeframe requires aggregation.
 *
 * @param timeframe - Timeframe to check
 * @returns True if timeframe requires aggregation from a native timeframe
 *
 * @example
 * ```typescript
 * requiresAggregation('10m'); // true (aggregate from 5m)
 * requiresAggregation('4h');  // true (aggregate from 1h)
 * requiresAggregation('5m');  // false (native Polygon timeframe)
 * ```
 */
export function requiresAggregation(timeframe: Timeframe): boolean {
  return POLYGON_AGGREGATED_TIMEFRAMES.includes(timeframe);
}

/**
 * Gets the source timeframe to fetch from Polygon API.
 *
 * For native timeframes, returns the same timeframe.
 * For aggregated timeframes, returns the optimal source timeframe.
 *
 * @param targetTimeframe - Desired output timeframe
 * @returns Source timeframe to request from Polygon
 *
 * @example
 * ```typescript
 * getSourceTimeframe('5m');  // '5m' (native)
 * getSourceTimeframe('10m'); // '5m' (aggregate 2 bars)
 * getSourceTimeframe('4h');  // '1h' (aggregate 4 bars)
 * ```
 */
export function getSourceTimeframe(targetTimeframe: Timeframe): Timeframe {
  const aggregationMap: Record<Timeframe, Timeframe> = {
    // Native timeframes (no aggregation needed)
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1h",
    "1D": "1D",

    // Aggregated timeframes (source -> target)
    "10m": "5m",  // 2x 5m bars = 1x 10m bar
    "2h": "1h",   // 2x 1h bars = 1x 2h bar
    "4h": "1h",   // 4x 1h bars = 1x 4h bar
  };

  return aggregationMap[targetTimeframe] || targetTimeframe;
}

/**
 * Converts Polygon.io timeframe to API parameters.
 *
 * Polygon's aggregates API uses multiplier + timespan format:
 * - 1 minute = multiplier=1, timespan='minute'
 * - 5 minute = multiplier=5, timespan='minute'
 * - 1 hour = multiplier=1, timespan='hour'
 * - 1 day = multiplier=1, timespan='day'
 *
 * @param timeframe - Canonical timeframe
 * @returns Object with multiplier and timespan for Polygon API
 *
 * @example
 * ```typescript
 * toPolygonParams('5m');  // { multiplier: 5, timespan: 'minute' }
 * toPolygonParams('1h');  // { multiplier: 1, timespan: 'hour' }
 * toPolygonParams('1D');  // { multiplier: 1, timespan: 'day' }
 * ```
 */
export function toPolygonParams(timeframe: Timeframe): { multiplier: number; timespan: string } {
  const paramsMap: Record<Timeframe, { multiplier: number; timespan: string }> = {
    "1m": { multiplier: 1, timespan: "minute" },
    "5m": { multiplier: 5, timespan: "minute" },
    "10m": { multiplier: 10, timespan: "minute" }, // Not used (we aggregate from 5m)
    "15m": { multiplier: 15, timespan: "minute" },
    "30m": { multiplier: 30, timespan: "minute" },
    "1h": { multiplier: 1, timespan: "hour" },
    "2h": { multiplier: 2, timespan: "hour" }, // Not used (we aggregate from 1h)
    "4h": { multiplier: 4, timespan: "hour" }, // Not used (we aggregate from 1h)
    "1D": { multiplier: 1, timespan: "day" },
  };

  const params = paramsMap[timeframe];
  if (!params) {
    throw new Error(`Unsupported timeframe: ${timeframe}`);
  }

  return params;
}

/**
 * Aggregates bars to target timeframe if needed.
 *
 * If the target timeframe is native to Polygon, returns bars as-is.
 * Otherwise, aggregates from the source timeframe to the target timeframe.
 *
 * @param bars - Source bars from Polygon API
 * @param targetTimeframe - Desired output timeframe
 * @returns Bars aggregated to target timeframe
 *
 * @example
 * ```typescript
 * // No aggregation needed for native timeframes
 * const bars5m = aggregateToTimeframe(rawBars, '5m'); // Returns rawBars
 *
 * // Aggregation needed for 10m (from 5m source)
 * const bars10m = aggregateToTimeframe(bars5m, '10m'); // Aggregates 2x5m -> 1x10m
 *
 * // Aggregation needed for 4h (from 1h source)
 * const bars4h = aggregateToTimeframe(bars1h, '4h'); // Aggregates 4x1h -> 1x4h
 * ```
 */
export function aggregateToTimeframe(bars: Bar[], targetTimeframe: Timeframe): Bar[] {
  // If target is a native timeframe, no aggregation needed
  if (!requiresAggregation(targetTimeframe)) {
    return bars;
  }

  // Aggregate from source to target
  return aggregateBars(bars, targetTimeframe, {
    includePartialLast: false,
    validate: false,
    warnOnGaps: false,
  });
}

/**
 * Calculates the expected number of bars after aggregation.
 *
 * This is useful for estimating API limits and validating results.
 *
 * @param sourceCount - Number of source bars
 * @param sourceTimeframe - Source timeframe
 * @param targetTimeframe - Target timeframe
 * @returns Approximate number of bars after aggregation
 *
 * @example
 * ```typescript
 * // 100 bars of 5m data -> approximately 50 bars of 10m data
 * const estimated = estimateAggregatedCount(100, '5m', '10m'); // ~50
 *
 * // 100 bars of 1h data -> approximately 25 bars of 4h data
 * const estimated = estimateAggregatedCount(100, '1h', '4h'); // ~25
 * ```
 */
export function estimateAggregatedCount(
  sourceCount: number,
  sourceTimeframe: Timeframe,
  targetTimeframe: Timeframe
): number {
  if (!requiresAggregation(targetTimeframe)) {
    return sourceCount;
  }

  // Calculate aggregation ratio
  const ratioMap: Record<string, number> = {
    "5m->10m": 2,
    "1h->2h": 2,
    "1h->4h": 4,
  };

  const key = `${sourceTimeframe}->${targetTimeframe}`;
  const ratio = ratioMap[key] || 1;

  return Math.floor(sourceCount / ratio);
}