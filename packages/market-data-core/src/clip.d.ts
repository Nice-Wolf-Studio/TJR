/**
 * Bar clipping utilities.
 *
 * This module provides functions for extracting subsets of bars by timestamp
 * range. Clipping is useful for:
 * - Backtesting: Extract bars for a specific date range
 * - Chart rendering: Get visible bars without iterating entire dataset
 * - Data validation: Verify completeness of a time window
 *
 * All clipping operates in UTC. Provider adapters must convert local times to
 * UTC before calling these functions.
 */
import { Bar } from "./types.js";
/**
 * Options for clipBars function.
 */
export interface ClipOptions {
    /**
     * If true, includes bars that start before 'to' but may extend beyond it.
     * If false (default), excludes bars that extend beyond 'to'.
     *
     * Example: Clipping to [14:00, 14:05) with a 1-minute bar at 14:04
     * - includePartialLast=false: Includes bar (it ends at 14:05, within range)
     * - includePartialLast=true: Same result (bar is within range)
     *
     * This option only matters for the LAST bar in the range. It determines
     * whether a bar that STARTS before 'to' but ENDS after 'to' is included.
     */
    includePartialLast?: boolean;
}
/**
 * Clips bars to a timestamp range.
 *
 * Extracts bars that fall within the specified time range. The range is
 * defined as [from, to), meaning 'from' is inclusive and 'to' is exclusive.
 *
 * This function uses binary search for efficient clipping when the input array
 * is large and sorted.
 *
 * @param bars - Array of OHLCV bars (assumed sorted by timestamp ascending)
 * @param from - Start timestamp (inclusive, optional). If omitted, starts from first bar.
 * @param to - End timestamp (exclusive, optional). If omitted, ends at last bar.
 * @param options - Clipping options (optional)
 * @returns Filtered array of bars
 *
 * @example
 * ```typescript
 * const bars = [
 *   { timestamp: ts("14:00"), ... },
 *   { timestamp: ts("14:01"), ... },
 *   { timestamp: ts("14:02"), ... },
 *   { timestamp: ts("14:03"), ... },
 *   { timestamp: ts("14:04"), ... },
 *   { timestamp: ts("14:05"), ... },
 * ];
 *
 * // Clip to range [14:01, 14:04)
 * clipBars(bars, ts("14:01"), ts("14:04"));
 * // Result: [bars at 14:01, 14:02, 14:03]
 *
 * // Clip from 14:02 onward
 * clipBars(bars, ts("14:02"));
 * // Result: [bars at 14:02, 14:03, 14:04, 14:05]
 *
 * // Clip up to 14:03
 * clipBars(bars, undefined, ts("14:03"));
 * // Result: [bars at 14:00, 14:01, 14:02]
 *
 * // No clipping (return all bars)
 * clipBars(bars);
 * // Result: all bars
 * ```
 *
 * Edge cases:
 * - Empty input: Returns empty array
 * - No bars in range: Returns empty array
 * - from > to: Returns empty array
 * - from === to: Returns empty array (empty range)
 * - from/to outside bar range: Clips to available bars
 *
 * Performance:
 * - Time complexity: O(log n + m) where n = input size, m = output size
 * - Space complexity: O(m) where m = output size
 * - Uses binary search to find start/end indices
 *
 * Note: This function does NOT validate that bars are sorted. If bars are
 * unsorted, results are undefined.
 */
export declare function clipBars(bars: Bar[], from?: number, to?: number, _options?: ClipOptions): Bar[];
//# sourceMappingURL=clip.d.ts.map