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
import { Timeframe } from "./types.js";
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
export declare function toMillis(timeframe: Timeframe): number;
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
export declare function normalizeTimeframe(input: string): Timeframe;
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
export declare function alignTimestamp(timestamp: number, timeframe: Timeframe, direction: "floor" | "ceil"): number;
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
export declare function isAligned(timestamp: number, timeframe: Timeframe): boolean;
//# sourceMappingURL=timeframe.d.ts.map