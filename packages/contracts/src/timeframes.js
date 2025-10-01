"use strict";
/**
 * @fileoverview Timeframe enumeration and utilities for TJR trading system.
 *
 * Defines canonical timeframes used across all packages. Values are string
 * representations matching common provider APIs (minutes for intraday, 'D' for daily).
 *
 * @module @tjr/contracts/timeframes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Timeframe = void 0;
exports.isValidTimeframe = isValidTimeframe;
exports.timeframeToMinutes = timeframeToMinutes;
exports.getTimeframeLabel = getTimeframeLabel;
exports.compareTimeframes = compareTimeframes;
exports.parseTimeframe = parseTimeframe;
exports.getAllTimeframes = getAllTimeframes;
/**
 * Supported timeframes for market data and analysis.
 *
 * Values represent time duration:
 * - M1, M5, M10: Minutes (intraday)
 * - H1, H4: Hours (intraday/swing)
 * - D1: Daily (swing)
 *
 * @invariant All timeframes must be ordered from smallest to largest duration
 * @invariant String values must match provider API conventions
 */
var Timeframe;
(function (Timeframe) {
    /** 1-minute bars - highest resolution intraday */
    Timeframe["M1"] = "1";
    /** 5-minute bars - common intraday timeframe */
    Timeframe["M5"] = "5";
    /** 10-minute bars - reduced noise intraday */
    Timeframe["M10"] = "10";
    /** 1-hour bars - hourly analysis */
    Timeframe["H1"] = "60";
    /** 4-hour bars - swing trading timeframe */
    Timeframe["H4"] = "240";
    /** Daily bars - daily swing analysis */
    Timeframe["D1"] = "1D";
})(Timeframe || (exports.Timeframe = Timeframe = {}));
/**
 * Maps timeframe enum to minutes (for intraday) or special string (for daily).
 *
 * @internal
 */
const TIMEFRAME_MINUTES = {
    [Timeframe.M1]: 1,
    [Timeframe.M5]: 5,
    [Timeframe.M10]: 10,
    [Timeframe.H1]: 60,
    [Timeframe.H4]: 240,
    [Timeframe.D1]: '1D'
};
/**
 * Timeframe display names for UI/logging.
 *
 * @internal
 */
const TIMEFRAME_LABELS = {
    [Timeframe.M1]: '1 Minute',
    [Timeframe.M5]: '5 Minutes',
    [Timeframe.M10]: '10 Minutes',
    [Timeframe.H1]: '1 Hour',
    [Timeframe.H4]: '4 Hours',
    [Timeframe.D1]: 'Daily'
};
/**
 * Validates whether a string is a valid Timeframe enum value.
 *
 * @param value - String to validate
 * @returns True if value is a valid Timeframe
 *
 * @example
 * ```typescript
 * isValidTimeframe('5')    // true
 * isValidTimeframe('15')   // false
 * ```
 */
function isValidTimeframe(value) {
    return Object.values(Timeframe).includes(value);
}
/**
 * Converts Timeframe to minutes (or 'D' for daily).
 *
 * @param timeframe - Timeframe to convert
 * @returns Number of minutes (or '1D' for daily)
 *
 * @example
 * ```typescript
 * timeframeToMinutes(Timeframe.M5)  // 5
 * timeframeToMinutes(Timeframe.H1)  // 60
 * timeframeToMinutes(Timeframe.D1)  // '1D'
 * ```
 */
function timeframeToMinutes(timeframe) {
    return TIMEFRAME_MINUTES[timeframe];
}
/**
 * Gets human-readable label for a timeframe.
 *
 * @param timeframe - Timeframe to label
 * @returns Display-friendly string
 *
 * @example
 * ```typescript
 * getTimeframeLabel(Timeframe.M5)  // '5 Minutes'
 * getTimeframeLabel(Timeframe.D1)  // 'Daily'
 * ```
 */
function getTimeframeLabel(timeframe) {
    return TIMEFRAME_LABELS[timeframe];
}
/**
 * Compares two timeframes by duration.
 *
 * @param a - First timeframe
 * @param b - Second timeframe
 * @returns Negative if a < b, positive if a > b, zero if equal
 *
 * @example
 * ```typescript
 * compareTimeframes(Timeframe.M1, Timeframe.M5)   // < 0
 * compareTimeframes(Timeframe.H1, Timeframe.M10)  // > 0
 * ```
 */
function compareTimeframes(a, b) {
    const order = [Timeframe.M1, Timeframe.M5, Timeframe.M10, Timeframe.H1, Timeframe.H4, Timeframe.D1];
    return order.indexOf(a) - order.indexOf(b);
}
/**
 * Parses a string into a Timeframe, throwing if invalid.
 *
 * @param value - String to parse
 * @returns Validated Timeframe enum
 * @throws {Error} If value is not a valid timeframe
 *
 * @example
 * ```typescript
 * parseTimeframe('5')    // Timeframe.M5
 * parseTimeframe('99')   // throws Error
 * ```
 */
function parseTimeframe(value) {
    if (!isValidTimeframe(value)) {
        throw new Error(`Invalid timeframe: ${value}. Must be one of: ${Object.values(Timeframe).join(', ')}`);
    }
    return value;
}
/**
 * Returns all supported timeframes in ascending order (smallest to largest).
 *
 * @returns Array of all Timeframe values
 *
 * @example
 * ```typescript
 * getAllTimeframes()  // [Timeframe.M1, Timeframe.M5, ..., Timeframe.D1]
 * ```
 */
function getAllTimeframes() {
    return [Timeframe.M1, Timeframe.M5, Timeframe.M10, Timeframe.H1, Timeframe.H4, Timeframe.D1];
}
//# sourceMappingURL=timeframes.js.map