/**
 * @tjr-suite/market-data-core
 *
 * Pure utilities for timeframe math, bar aggregation, and data clipping.
 *
 * This package provides deterministic, I/O-free functions for working with
 * OHLCV (Open-High-Low-Close-Volume) bar data. All operations are performed
 * in UTC to avoid DST-related bugs.
 *
 * Key features:
 * - Timeframe normalization and alignment
 * - Bar aggregation (e.g., 1m → 5m, 1h → 4h)
 * - Efficient bar clipping by timestamp range
 *
 * @example
 * ```typescript
 * import { aggregateBars, clipBars, normalizeTimeframe } from "@tjr-suite/market-data-core";
 *
 * // Normalize timeframe notation
 * const tf = normalizeTimeframe("1min"); // "1m"
 *
 * // Aggregate 1-minute bars to 5-minute bars
 * const bars5m = aggregateBars(bars1m, "5m");
 *
 * // Clip bars to a specific time range
 * const subset = clipBars(bars, from, to);
 * ```
 *
 * @packageDocumentation
 */

// Export types
export type { Bar, Timeframe } from "./types.js";

// Export timeframe utilities
export {
  toMillis,
  normalizeTimeframe,
  alignTimestamp,
  isAligned,
} from "./timeframe.js";

// Export aggregation utilities
export { aggregateBars } from "./aggregate.js";
export type { AggregateOptions } from "./aggregate.js";

// Export clipping utilities
export { clipBars } from "./clip.js";
export type { ClipOptions } from "./clip.js";

// Export composite provider selection
export { selectProvider, loadCapabilities } from "./composite.js";
export type {
  ProviderCapabilities,
  SelectProviderOptions,
  ProviderSelectionResult,
} from "./composite.js";