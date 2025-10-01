"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadCapabilities = exports.selectProvider = exports.clipBars = exports.aggregateBars = exports.isAligned = exports.alignTimestamp = exports.normalizeTimeframe = exports.toMillis = void 0;
// Export timeframe utilities
var timeframe_js_1 = require("./timeframe.js");
Object.defineProperty(exports, "toMillis", { enumerable: true, get: function () { return timeframe_js_1.toMillis; } });
Object.defineProperty(exports, "normalizeTimeframe", { enumerable: true, get: function () { return timeframe_js_1.normalizeTimeframe; } });
Object.defineProperty(exports, "alignTimestamp", { enumerable: true, get: function () { return timeframe_js_1.alignTimestamp; } });
Object.defineProperty(exports, "isAligned", { enumerable: true, get: function () { return timeframe_js_1.isAligned; } });
// Export aggregation utilities
var aggregate_js_1 = require("./aggregate.js");
Object.defineProperty(exports, "aggregateBars", { enumerable: true, get: function () { return aggregate_js_1.aggregateBars; } });
// Export clipping utilities
var clip_js_1 = require("./clip.js");
Object.defineProperty(exports, "clipBars", { enumerable: true, get: function () { return clip_js_1.clipBars; } });
// Export composite provider selection
var composite_js_1 = require("./composite.js");
Object.defineProperty(exports, "selectProvider", { enumerable: true, get: function () { return composite_js_1.selectProvider; } });
Object.defineProperty(exports, "loadCapabilities", { enumerable: true, get: function () { return composite_js_1.loadCapabilities; } });
//# sourceMappingURL=index.js.map