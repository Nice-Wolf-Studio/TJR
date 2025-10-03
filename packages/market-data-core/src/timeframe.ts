/**
 * Timeframe manipulation utilities.
 *
 * This module provides functions for:
 * - Normalizing timeframe strings (e.g., "1min" → "1m")
 * - Converting timeframes to milliseconds
 * - Aligning timestamps to timeframe boundaries
 *
 * All functions assume UTC timezone. Provider adapters are responsible for
 * converting local times to UTC before calling these functions.
 */

import { Timeframe } from './types.js';

/**
 * Mapping of canonical timeframes to their duration in milliseconds.
 *
 * This map serves as the single source of truth for supported timeframes.
 * All timeframe operations use this map to ensure consistency.
 *
 * Invariants:
 * - All values are positive integers
 * - Values are ordered from smallest to largest (for readability)
 * - Each timeframe is an integer multiple of all smaller timeframes
 */
const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '10m': 600_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '2h': 7_200_000,
  '4h': 14_400_000,
  '1D': 86_400_000,
};

/**
 * Reverse mapping: milliseconds → canonical timeframe.
 *
 * This map is used by normalizeTimeframe() to convert arbitrary inputs
 * (e.g., "60s", "1min") to canonical form (e.g., "1m").
 */
const MS_TO_TIMEFRAME = new Map<number, Timeframe>(
  Object.entries(TIMEFRAME_MS).map(([tf, ms]) => [ms, tf as Timeframe])
);

/**
 * Aliases for common non-canonical timeframe notations.
 *
 * These aliases allow provider adapters to use vendor-specific notations
 * (e.g., Polygon uses "minute", TradingView uses "D") without needing to
 * implement their own normalization logic.
 *
 * Example:
 * - "1min" → 60_000ms → "1m"
 * - "D" → 86_400_000ms → "1D"
 */
const TIMEFRAME_ALIASES: Record<string, number> = {
  // Minute aliases
  '1min': 60_000,
  '60s': 60_000,
  minute: 60_000,

  // 5-minute aliases
  '5min': 300_000,
  '300s': 300_000,

  // 10-minute aliases
  '10min': 600_000,
  '600s': 600_000,

  // 15-minute aliases
  '15min': 900_000,
  '900s': 900_000,

  // 30-minute aliases
  '30min': 1_800_000,
  '1800s': 1_800_000,

  // Hour aliases
  '1hour': 3_600_000,
  hour: 3_600_000,
  '60m': 3_600_000,
  '3600s': 3_600_000,

  // 2-hour aliases
  '2hour': 7_200_000,
  '120m': 7_200_000,

  // 4-hour aliases
  '4hour': 14_400_000,
  '240m': 14_400_000,

  // Daily aliases
  D: 86_400_000,
  day: 86_400_000,
  daily: 86_400_000,
  '1440m': 86_400_000,
};

/**
 * Converts a canonical timeframe to milliseconds.
 *
 * This is the primary function for timeframe-to-duration conversion. Use this
 * whenever you need to perform arithmetic on timeframes (e.g., calculating
 * bar boundaries, determining aggregation ratios).
 *
 * @param timeframe - Canonical timeframe (e.g., "1m", "4h", "1D")
 * @returns Duration in milliseconds
 *
 * @example
 * ```typescript
 * toMillis("1m")  // 60000
 * toMillis("4h")  // 14400000
 * toMillis("1D")  // 86400000
 * ```
 *
 * Complexity: O(1) (direct map lookup)
 */
export function toMillis(timeframe: Timeframe): number {
  return TIMEFRAME_MS[timeframe];
}

/**
 * Normalizes a timeframe string to canonical form.
 *
 * Accepts common timeframe notations (e.g., "1min", "60s", "D") and converts
 * them to canonical form (e.g., "1m", "1D"). This ensures consistency across
 * the codebase and allows provider adapters to use vendor-specific notations.
 *
 * @param input - Timeframe string (canonical or aliased)
 * @returns Canonical timeframe
 * @throws Error if the input is not a recognized timeframe
 *
 * @example
 * ```typescript
 * normalizeTimeframe("1m")    // "1m" (already canonical)
 * normalizeTimeframe("1min")  // "1m" (normalized)
 * normalizeTimeframe("60s")   // "1m" (normalized)
 * normalizeTimeframe("D")     // "1D" (normalized)
 * normalizeTimeframe("3m")    // Error: Unsupported timeframe: 3m (180000ms)
 * ```
 *
 * Edge cases:
 * - Input is case-sensitive: "1M" is NOT recognized (must be "1m")
 * - Leading/trailing whitespace is NOT trimmed (callers should pre-process)
 * - Arbitrary timeframes (e.g., "7m") are rejected
 *
 * Complexity: O(1) (map lookups)
 */
export function normalizeTimeframe(input: string): Timeframe {
  // Fast path: input is already canonical
  if (input in TIMEFRAME_MS) {
    return input as Timeframe;
  }

  // Check if input is a known alias
  const ms = TIMEFRAME_ALIASES[input];
  if (ms !== undefined) {
    const canonical = MS_TO_TIMEFRAME.get(ms);
    if (canonical) {
      return canonical;
    }
  }

  // Input is neither canonical nor aliased → unsupported
  throw new Error(`Unsupported timeframe: ${input}${ms !== undefined ? ` (${ms}ms)` : ''}`);
}

/**
 * Aligns a timestamp to the nearest timeframe boundary.
 *
 * This function is used to:
 * 1. Snap arbitrary timestamps to bar boundaries (e.g., for chart rendering)
 * 2. Validate that input bars are properly aligned
 * 3. Calculate start/end timestamps for aggregation windows
 *
 * @param timestamp - Unix epoch milliseconds (UTC)
 * @param timeframe - Canonical timeframe (e.g., "5m", "1h")
 * @param direction - "floor" (round down) or "ceil" (round up)
 * @returns Aligned timestamp
 *
 * @example
 * ```typescript
 * const ts = 1633024859000; // 2021-09-30T14:40:59.000Z (14:40:59)
 *
 * // Align to 5-minute boundary (floor)
 * alignTimestamp(ts, "5m", "floor"); // 1633024800000 (14:40:00)
 *
 * // Align to 5-minute boundary (ceil)
 * alignTimestamp(ts, "5m", "ceil");  // 1633025100000 (14:45:00)
 *
 * // Align to hourly boundary (floor)
 * alignTimestamp(ts, "1h", "floor"); // 1633024800000 (14:00:00)
 *
 * // Align to daily boundary (floor) - UTC midnight
 * alignTimestamp(ts, "1D", "floor"); // 1632960000000 (00:00:00)
 * ```
 *
 * Edge cases:
 * - If timestamp is already aligned, returns the same timestamp
 * - For "ceil", if timestamp is already aligned, returns timestamp + timeframe
 * - Negative timestamps are supported (for historical data before 1970)
 *
 * DST considerations:
 * This function operates in UTC, so DST transitions are not a concern. Provider
 * adapters must convert local times to UTC BEFORE calling this function.
 *
 * Complexity: O(1) (arithmetic operations only)
 */
export function alignTimestamp(
  timestamp: number,
  timeframe: Timeframe,
  direction: 'floor' | 'ceil'
): number {
  const tfMs = toMillis(timeframe);

  if (direction === 'floor') {
    // Round down to nearest boundary
    // Example: 14:40:59 with 5m → 14:40:00
    //   timestamp = 1633024859000
    //   tfMs = 300000 (5m)
    //   Math.floor(1633024859000 / 300000) = 5443416
    //   5443416 * 300000 = 1633024800000 (14:40:00)
    return Math.floor(timestamp / tfMs) * tfMs;
  } else {
    // Round up to nearest boundary
    // Example: 14:40:59 with 5m → 14:45:00
    //   timestamp = 1633024859000
    //   tfMs = 300000 (5m)
    //   Math.ceil(1633024859000 / 300000) = 5443417
    //   5443417 * 300000 = 1633025100000 (14:45:00)
    return Math.ceil(timestamp / tfMs) * tfMs;
  }
}

/**
 * Checks if a timestamp is aligned to a timeframe boundary.
 *
 * This is a convenience function for validation. Use it to verify that input
 * bars are properly aligned before aggregation.
 *
 * @param timestamp - Unix epoch milliseconds (UTC)
 * @param timeframe - Canonical timeframe (e.g., "5m", "1h")
 * @returns true if timestamp is aligned, false otherwise
 *
 * @example
 * ```typescript
 * isAligned(1633024800000, "5m"); // true  (14:40:00)
 * isAligned(1633024859000, "5m"); // false (14:40:59)
 * isAligned(1633024800000, "1h"); // true  (14:00:00)
 * ```
 *
 * Complexity: O(1)
 */
export function isAligned(timestamp: number, timeframe: Timeframe): boolean {
  const tfMs = toMillis(timeframe);
  return timestamp % tfMs === 0;
}
