/**
 * @fileoverview Timeframe enumeration and utilities for TJR trading system.
 *
 * Defines canonical timeframes used across all packages. Values are string
 * representations matching common provider APIs (minutes for intraday, 'D' for daily).
 *
 * @module @tjr/contracts/timeframes
 */
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
export declare enum Timeframe {
  /** 1-minute bars - highest resolution intraday */
  M1 = '1',
  /** 5-minute bars - common intraday timeframe */
  M5 = '5',
  /** 10-minute bars - reduced noise intraday */
  M10 = '10',
  /** 1-hour bars - hourly analysis */
  H1 = '60',
  /** 4-hour bars - swing trading timeframe */
  H4 = '240',
  /** Daily bars - daily swing analysis */
  D1 = '1D',
}
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
export declare function isValidTimeframe(value: string): value is Timeframe;
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
export declare function timeframeToMinutes(timeframe: Timeframe): number | string;
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
export declare function getTimeframeLabel(timeframe: Timeframe): string;
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
export declare function compareTimeframes(a: Timeframe, b: Timeframe): number;
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
export declare function parseTimeframe(value: string): Timeframe;
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
export declare function getAllTimeframes(): Timeframe[];
//# sourceMappingURL=timeframes.d.ts.map
