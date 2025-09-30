/**
 * Bar aggregation utilities.
 *
 * This module provides functions for aggregating OHLCV bars from one timeframe
 * to another (e.g., 1m → 5m, 1h → 4h). Aggregation follows standard financial
 * conventions:
 * - Open = first bar's open
 * - High = max of all highs
 * - Low = min of all lows
 * - Close = last bar's close
 * - Volume = sum of all volumes
 *
 * All aggregation is performed in UTC. Provider adapters must convert local
 * times to UTC before calling these functions.
 */
import { Bar, Timeframe } from "./types.js";
/**
 * Options for aggregateBars function.
 */
export interface AggregateOptions {
    /**
     * If true, includes the last partial bar in the output (useful for live data).
     * If false (default), excludes the last bar if it doesn't span the full target timeframe.
     *
     * Example: Aggregating 1m bars [14:00, 14:01, 14:02] to 5m
     * - includePartialLast=false: Returns [] (no complete 5m bar yet)
     * - includePartialLast=true: Returns [partial bar from 14:00-14:02]
     */
    includePartialLast?: boolean;
    /**
     * If true, validates that input bars are sorted and have no duplicates.
     * If false (default), skips validation for performance.
     *
     * Recommendation: Enable validation during development, disable in production.
     */
    validate?: boolean;
    /**
     * If true, logs warnings for detected gaps in bar sequence.
     * If false (default), silently ignores gaps.
     *
     * A gap is defined as: expected_timestamp - actual_timestamp > source_timeframe_ms
     */
    warnOnGaps?: boolean;
}
/**
 * Aggregates bars from a source timeframe to a target timeframe.
 *
 * This function takes an array of OHLCV bars and aggregates them into a larger
 * timeframe. For example, ten 1-minute bars can be aggregated into two 5-minute
 * bars.
 *
 * Aggregation rules:
 * - Bars are grouped by aligned boundaries (e.g., 5m bars start at :00, :05, :10, etc.)
 * - Each group is aggregated into a single bar using OHLC semantics
 * - Partial bars at the end are excluded by default (opt-in via includePartialLast)
 *
 * @param bars - Array of OHLCV bars (must be sorted by timestamp ascending)
 * @param targetTimeframe - Desired output timeframe (must be >= inferred source timeframe)
 * @param options - Aggregation options (optional)
 * @returns Array of aggregated bars
 *
 * @throws Error if bars are unsorted (when validate=true)
 * @throws Error if target timeframe is smaller than source timeframe
 *
 * @example
 * ```typescript
 * // Aggregate ten 1-minute bars into two 5-minute bars
 * const bars1m = [
 *   { timestamp: ts("14:00"), o: 100, h: 101, l: 99, c: 100.5, v: 1000 },
 *   { timestamp: ts("14:01"), o: 100.5, h: 102, l: 100, c: 101, v: 1200 },
 *   { timestamp: ts("14:02"), o: 101, h: 101.5, l: 100.5, c: 101, v: 900 },
 *   { timestamp: ts("14:03"), o: 101, h: 101.8, l: 100.8, c: 101.2, v: 1100 },
 *   { timestamp: ts("14:04"), o: 101.2, h: 102, l: 101, c: 101.5, v: 1300 },
 *   { timestamp: ts("14:05"), o: 101.5, h: 102, l: 101, c: 101.8, v: 1000 },
 *   { timestamp: ts("14:06"), o: 101.8, h: 102.5, l: 101.5, c: 102, v: 1400 },
 *   { timestamp: ts("14:07"), o: 102, h: 102.2, l: 101.8, c: 102, v: 1000 },
 *   { timestamp: ts("14:08"), o: 102, h: 102.5, l: 102, c: 102.3, v: 1200 },
 *   { timestamp: ts("14:09"), o: 102.3, h: 103, l: 102, c: 102.8, v: 1500 },
 * ];
 *
 * const bars5m = aggregateBars(bars1m, "5m");
 * // Result: [
 * //   { timestamp: ts("14:00"), o: 100, h: 102, l: 99, c: 101.5, v: 5500 },
 * //   { timestamp: ts("14:05"), o: 101.5, h: 103, l: 101, c: 102.8, v: 6100 },
 * // ]
 * ```
 *
 * Edge cases:
 * - Empty input: Returns empty array
 * - Single bar: Returns array with single bar (if aligned and complete)
 * - Bars with gaps: Aggregates available bars, logs warning if warnOnGaps=true
 * - Bars with zero volume: Included in aggregation (volume sums to zero)
 *
 * Performance:
 * - Time complexity: O(n) where n = number of input bars
 * - Space complexity: O(m) where m = number of output bars
 * - No sorting is performed (assumes input is pre-sorted)
 *
 * Invariants (validated when validate=true):
 * - Input bars are sorted ascending by timestamp
 * - No duplicate timestamps
 * - Target timeframe is an integer multiple of source timeframe
 */
export declare function aggregateBars(bars: Bar[], targetTimeframe: Timeframe, options?: AggregateOptions): Bar[];
//# sourceMappingURL=aggregate.d.ts.map