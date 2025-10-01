/**
 * Timeframe aggregation utilities for Polygon.io provider.
 *
 * This module provides functions to aggregate bars from native Polygon
 * timeframes (1m, 5m, 15m, 30m, 1h, 1D) to target timeframes (10m, 4h)
 * that Polygon doesn't directly support.
 */

import type { Bar, Timeframe as CoreTimeframe } from "@tjr-suite/market-data-core";
import { aggregateBars } from "@tjr-suite/market-data-core";
import { Timeframe } from "@tjr/contracts";

/**
 * Converts contracts Timeframe enum to market-data-core string format.
 */
function toCoreTimeframe(timeframe: Timeframe): CoreTimeframe {
  const mapping: Record<Timeframe, CoreTimeframe> = {
    [Timeframe.M1]: "1m",
    [Timeframe.M5]: "5m",
    [Timeframe.M10]: "10m",
    [Timeframe.H1]: "1h",
    [Timeframe.H4]: "4h",
    [Timeframe.D1]: "1D",
  };
  return mapping[timeframe];
}

/**
 * Native timeframes supported by Polygon.io API.
 * These can be requested directly without aggregation.
 */
export const POLYGON_NATIVE_TIMEFRAMES: Timeframe[] = [
  Timeframe.M1,
  Timeframe.M5,
  Timeframe.H1,
  Timeframe.D1,
];

/**
 * Timeframes that require aggregation from native Polygon timeframes.
 */
export const POLYGON_AGGREGATED_TIMEFRAMES: Timeframe[] = [Timeframe.M10, Timeframe.H4];

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
 * getSourceTimeframe(Timeframe.M5);  // Timeframe.M5 (native)
 * getSourceTimeframe(Timeframe.M10); // Timeframe.M5 (aggregate 2 bars)
 * getSourceTimeframe(Timeframe.H4);  // Timeframe.H1 (aggregate 4 bars)
 * ```
 */
export function getSourceTimeframe(targetTimeframe: Timeframe): Timeframe {
  const aggregationMap: Partial<Record<Timeframe, Timeframe>> = {
    // Native timeframes (no aggregation needed)
    [Timeframe.M1]: Timeframe.M1,
    [Timeframe.M5]: Timeframe.M5,
    [Timeframe.H1]: Timeframe.H1,
    [Timeframe.D1]: Timeframe.D1,

    // Aggregated timeframes (source -> target)
    [Timeframe.M10]: Timeframe.M5,  // 2x 5m bars = 1x 10m bar
    [Timeframe.H4]: Timeframe.H1,   // 4x 1h bars = 1x 4h bar
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
 * toPolygonParams(Timeframe.M5);  // { multiplier: 5, timespan: 'minute' }
 * toPolygonParams(Timeframe.H1);  // { multiplier: 1, timespan: 'hour' }
 * toPolygonParams(Timeframe.D1);  // { multiplier: 1, timespan: 'day' }
 * ```
 */
export function toPolygonParams(timeframe: Timeframe): { multiplier: number; timespan: string } {
  const paramsMap: Partial<Record<Timeframe, { multiplier: number; timespan: string }>> = {
    [Timeframe.M1]: { multiplier: 1, timespan: "minute" },
    [Timeframe.M5]: { multiplier: 5, timespan: "minute" },
    [Timeframe.M10]: { multiplier: 10, timespan: "minute" }, // Not used (we aggregate from 5m)
    [Timeframe.H1]: { multiplier: 1, timespan: "hour" },
    [Timeframe.H4]: { multiplier: 4, timespan: "hour" }, // Not used (we aggregate from 1h)
    [Timeframe.D1]: { multiplier: 1, timespan: "day" },
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
 * const bars5m = aggregateToTimeframe(rawBars, Timeframe.M5); // Returns rawBars
 *
 * // Aggregation needed for 10m (from 5m source)
 * const bars10m = aggregateToTimeframe(bars5m, Timeframe.M10); // Aggregates 2x5m -> 1x10m
 *
 * // Aggregation needed for 4h (from 1h source)
 * const bars4h = aggregateToTimeframe(bars1h, Timeframe.H4); // Aggregates 4x1h -> 1x4h
 * ```
 */
export function aggregateToTimeframe(bars: Bar[], targetTimeframe: Timeframe): Bar[] {
  // If target is a native timeframe, no aggregation needed
  if (!requiresAggregation(targetTimeframe)) {
    return bars;
  }

  // Convert to core timeframe format for aggregateBars
  const coreTimeframe = toCoreTimeframe(targetTimeframe);

  // Aggregate from source to target
  return aggregateBars(bars, coreTimeframe, {
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