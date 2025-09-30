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
export function clipBars(
  bars: Bar[],
  from?: number,
  to?: number,
  _options: ClipOptions = {}
): Bar[] {
  // Handle empty input
  if (bars.length === 0) {
    return [];
  }

  // Note: includePartialLast is reserved for future use
  // const { includePartialLast = false } = options;

  // Determine effective 'from' and 'to' bounds
  const effectiveFrom = from ?? -Infinity;
  const effectiveTo = to ?? Infinity;

  // Handle invalid range
  if (effectiveFrom >= effectiveTo) {
    return [];
  }

  // Find start index using binary search
  // We want the first bar with timestamp >= effectiveFrom
  const startIdx = binarySearchGTE(bars, effectiveFrom);
  if (startIdx === -1) {
    // No bars >= from
    return [];
  }

  // Find end index using binary search
  // We want the last bar with timestamp < effectiveTo
  const endIdx = binarySearchLT(bars, effectiveTo);
  if (endIdx === -1 || endIdx < startIdx) {
    // No bars < to, or no overlap with start range
    return [];
  }

  // Extract slice [startIdx, endIdx + 1)
  // Note: slice() is exclusive of end index, so we use endIdx + 1
  return bars.slice(startIdx, endIdx + 1);
}

/**
 * Binary search: Find the first index where bar.timestamp >= target.
 *
 * Returns -1 if no such bar exists.
 *
 * @param bars - Sorted array of bars
 * @param target - Target timestamp
 * @returns Index of first bar >= target, or -1 if none found
 */
function binarySearchGTE(bars: Bar[], target: number): number {
  let left = 0;
  let right = bars.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const bar = bars[mid];
    if (!bar) break; // Safety check (shouldn't happen, but TS requires it)

    if (bar.timestamp >= target) {
      // Found a candidate, but there might be an earlier one
      result = mid;
      right = mid - 1;
    } else {
      // bars[mid] is too small, search right
      left = mid + 1;
    }
  }

  return result;
}

/**
 * Binary search: Find the last index where bar.timestamp < target.
 *
 * Returns -1 if no such bar exists.
 *
 * @param bars - Sorted array of bars
 * @param target - Target timestamp
 * @returns Index of last bar < target, or -1 if none found
 */
function binarySearchLT(bars: Bar[], target: number): number {
  let left = 0;
  let right = bars.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const bar = bars[mid];
    if (!bar) break; // Safety check (shouldn't happen, but TS requires it)

    if (bar.timestamp < target) {
      // Found a candidate, but there might be a later one
      result = mid;
      left = mid + 1;
    } else {
      // bars[mid] is too large, search left
      right = mid - 1;
    }
  }

  return result;
}