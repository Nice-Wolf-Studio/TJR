/**
 * @fileoverview Premium/Discount Calculator - Equilibrium Analysis
 *
 * Implements equilibrium (50% level) calculation for swing ranges and price
 * zone classification (Premium/Discount/Equilibrium). Provides core logic
 * for determining where current price sits relative to a swing range.
 *
 * Key Features:
 * - Pure function design (deterministic, no side effects)
 * - Defensive input validation
 * - Fixed precision arithmetic for floating-point safety
 * - Configurable threshold for "at equilibrium" classification
 * - Configurable minimum range size filter
 *
 * Attribution:
 * - Implementation: TJR Suite monorepo
 * - Date: 2025-10-05
 * - PR: #1 (Premium/Discount Calculator)
 *
 * @module @tjr/strategy/equilibrium
 */

import type {
  SwingRange,
  EquilibriumConfig,
  EquilibriumZone,
  EquilibriumLevel,
  SwingPoint,
  HTF,
} from '@tjr/contracts';

/**
 * Default equilibrium configuration
 *
 * - threshold: 2% (0.02) - within 2% of equilibrium is considered "at equilibrium"
 * - minRangeSize: 5 points - ranges smaller than 5 points are filtered out
 * - precision: 6 decimal places - standard financial precision
 */
export const DEFAULT_EQUILIBRIUM_CONFIG: Required<EquilibriumConfig> = {
  threshold: 0.02,
  minRangeSize: 5,
  precision: 6,
};

/**
 * Round number to fixed precision using safe integer arithmetic
 *
 * Avoids floating-point errors by using integer multiplication/division.
 * This ensures deterministic results across different platforms and runs.
 *
 * @param value - Number to round
 * @param decimals - Number of decimal places (default 6)
 * @returns Rounded number
 *
 * @example
 * ```typescript
 * toFixedPrecision(1.23456789, 4); // Returns 1.2346
 * toFixedPrecision(4550.123456789, 6); // Returns 4550.123457
 * ```
 */
function toFixedPrecision(value: number, decimals: number = 6): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Validate numeric input for calculation
 *
 * Checks if value is a valid finite number (not NaN, not Infinity).
 *
 * @param value - Value to validate
 * @returns True if valid number
 */
function isValidNumber(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Classify price zone based on distance from equilibrium
 *
 * Uses configurable threshold to determine if price is at equilibrium.
 * Price is considered at equilibrium if within threshold percentage.
 *
 * Zone Logic:
 * - PREMIUM: Price is above equilibrium by more than threshold
 * - DISCOUNT: Price is below equilibrium by more than threshold
 * - EQUILIBRIUM: Price is within threshold of equilibrium
 *
 * @param distancePercent - Distance as percentage (-1 to 1 scale)
 * @param threshold - Threshold for "at equilibrium" (default 0.02 = 2%)
 * @returns Zone classification
 *
 * @example
 * ```typescript
 * classifyZone(0.05, 0.02);  // Returns 'PREMIUM' (5% above, threshold 2%)
 * classifyZone(-0.05, 0.02); // Returns 'DISCOUNT' (5% below, threshold 2%)
 * classifyZone(0.01, 0.02);  // Returns 'EQUILIBRIUM' (1% above, within 2% threshold)
 * ```
 */
function classifyZone(distancePercent: number, threshold: number): EquilibriumZone {
  // Check if within threshold (absolute value handles both directions)
  if (Math.abs(distancePercent) < threshold) {
    return 'EQUILIBRIUM';
  }

  // Above equilibrium = premium, below = discount
  return distancePercent > 0 ? 'PREMIUM' : 'DISCOUNT';
}

/**
 * Calculate equilibrium level and classify price zone
 *
 * Computes the 50% level (equilibrium) of a swing range and determines
 * where the current price sits relative to it. Returns null if inputs
 * are invalid or range is too small to be meaningful.
 *
 * Calculation Logic:
 * 1. Validate inputs (low < high, all numbers valid)
 * 2. Check minimum range size (filter noise ranges)
 * 3. Calculate equilibrium = low + ((high - low) / 2)
 * 4. Calculate distance percent = (currentPrice - equilibrium) / (high - low)
 * 5. Classify zone using threshold
 *
 * Edge Cases:
 * - Returns null if low >= high (invalid range)
 * - Returns null if any input is NaN or Infinity
 * - Returns null if range size < minRangeSize (noise filter)
 * - Returns null if currentPrice is invalid
 *
 * @param low - Swing low price
 * @param high - Swing high price
 * @param currentPrice - Current market price
 * @param config - Optional configuration (uses defaults if not provided)
 * @returns EquilibriumLevel or null if invalid inputs
 *
 * @example
 * ```typescript
 * // Example 1: Price at equilibrium
 * const result1 = calculateEquilibrium(4500, 4600, 4550);
 * // Returns: {
 * //   equilibrium: 4550,
 * //   zone: 'EQUILIBRIUM',
 * //   distancePercent: 0.0,
 * //   distancePoints: 0.0,
 * //   ...
 * // }
 *
 * // Example 2: Price in premium
 * const result2 = calculateEquilibrium(4500, 4600, 4580);
 * // Returns: {
 * //   equilibrium: 4550,
 * //   zone: 'PREMIUM',
 * //   distancePercent: 0.3 (30% above equilibrium),
 * //   distancePoints: 30,
 * //   ...
 * // }
 *
 * // Example 3: Range too small (noise)
 * const result3 = calculateEquilibrium(4500, 4502, 4501, { minRangeSize: 5 });
 * // Returns: null (range is only 2 points, below minimum of 5)
 * ```
 */
export function calculateEquilibrium(
  low: number,
  high: number,
  currentPrice: number,
  config?: EquilibriumConfig
): EquilibriumLevel | null {
  // Merge config with defaults
  const finalConfig: Required<EquilibriumConfig> = {
    ...DEFAULT_EQUILIBRIUM_CONFIG,
    ...config,
  };

  // Validate inputs
  if (!isValidNumber(low) || !isValidNumber(high) || !isValidNumber(currentPrice)) {
    return null;
  }

  // Check if low < high (valid range)
  if (low >= high) {
    return null;
  }

  // Calculate range size
  const rangeSize = high - low;

  // Check minimum range size (filter noise)
  if (rangeSize < finalConfig.minRangeSize) {
    return null;
  }

  // Calculate equilibrium (50% level)
  const equilibrium = toFixedPrecision(low + (rangeSize / 2), finalConfig.precision);

  // Calculate distance from equilibrium
  const distanceFromEquilibrium = currentPrice - equilibrium;

  // Calculate distance as percentage of range (-1 to 1 scale)
  // Positive = above equilibrium (premium)
  // Negative = below equilibrium (discount)
  const distancePercent = toFixedPrecision(
    distanceFromEquilibrium / rangeSize,
    finalConfig.precision
  );

  // Calculate absolute distance in points
  const distancePoints = toFixedPrecision(
    Math.abs(distanceFromEquilibrium),
    finalConfig.precision
  );

  // Classify zone
  const zone = classifyZone(distancePercent, finalConfig.threshold);

  // Create swing range object
  const range: SwingRange = {
    high,
    low,
    timestamp: new Date(),
    timeframe: 'H4', // Default to H4, caller should provide proper timeframe
    source: 'PROVIDED',
  };

  // Return complete equilibrium level result
  return {
    range,
    equilibrium,
    currentPrice,
    zone,
    distancePercent,
    distancePoints,
    timestamp: new Date(),
  };
}

/**
 * Calculate equilibrium from a SwingRange object
 *
 * Convenience wrapper around calculateEquilibrium that accepts a
 * SwingRange object instead of individual high/low values.
 *
 * @param range - Swing range object
 * @param currentPrice - Current market price
 * @param config - Optional configuration
 * @returns EquilibriumLevel or null if invalid inputs
 *
 * @example
 * ```typescript
 * const range: SwingRange = {
 *   high: 4600,
 *   low: 4500,
 *   timestamp: new Date(),
 *   timeframe: 'H4',
 *   source: 'COMPUTED'
 * };
 *
 * const result = calculateEquilibriumFromRange(range, 4580);
 * // Returns equilibrium level with zone classification
 * ```
 */
export function calculateEquilibriumFromRange(
  range: SwingRange,
  currentPrice: number,
  config?: EquilibriumConfig
): EquilibriumLevel | null {
  const result = calculateEquilibrium(range.low, range.high, currentPrice, config);

  // If calculation succeeded, update the range object with provided metadata
  if (result) {
    result.range = {
      ...range,
      timestamp: range.timestamp,
      timeframe: range.timeframe,
      source: range.source,
    };
  }

  return result;
}

/**
 * Batch calculate equilibrium for multiple ranges
 *
 * Efficiently processes multiple ranges with the same current price.
 * Filters out null results (invalid ranges).
 *
 * @param ranges - Array of swing ranges
 * @param currentPrice - Current market price
 * @param config - Optional configuration
 * @returns Array of valid EquilibriumLevel results
 *
 * @example
 * ```typescript
 * const ranges: SwingRange[] = [
 *   { high: 4600, low: 4500, timestamp: new Date(), timeframe: 'H4', source: 'COMPUTED' },
 *   { high: 4580, low: 4520, timestamp: new Date(), timeframe: 'H1', source: 'COMPUTED' },
 *   { high: 4560, low: 4540, timestamp: new Date(), timeframe: 'M5', source: 'COMPUTED' },
 * ];
 *
 * const results = batchCalculateEquilibrium(ranges, 4550);
 * // Returns array of equilibrium levels for each valid range
 * ```
 */
export function batchCalculateEquilibrium(
  ranges: SwingRange[],
  currentPrice: number,
  config?: EquilibriumConfig
): EquilibriumLevel[] {
  return ranges
    .map((range) => calculateEquilibriumFromRange(range, currentPrice, config))
    .filter((result): result is EquilibriumLevel => result !== null);
}

/**
 * Validate equilibrium configuration
 *
 * Checks that all configuration values are valid and within reasonable ranges.
 * Throws descriptive errors for invalid configurations.
 *
 * @param config - Configuration to validate
 * @throws {Error} If configuration is invalid
 *
 * @example
 * ```typescript
 * const config: EquilibriumConfig = {
 *   threshold: 0.02,
 *   minRangeSize: 5,
 *   precision: 6
 * };
 *
 * validateEquilibriumConfig(config); // Passes validation
 *
 * const badConfig: EquilibriumConfig = {
 *   threshold: -0.5, // Invalid: negative threshold
 *   minRangeSize: 5,
 *   precision: 6
 * };
 *
 * validateEquilibriumConfig(badConfig); // Throws Error
 * ```
 */
export function validateEquilibriumConfig(config: EquilibriumConfig): void {
  // Validate threshold
  if (config.threshold !== undefined) {
    if (typeof config.threshold !== 'number' || config.threshold < 0 || config.threshold > 1) {
      throw new Error(
        `Invalid threshold: must be between 0 and 1 (got ${config.threshold})`
      );
    }
  }

  // Validate minRangeSize
  if (config.minRangeSize !== undefined) {
    if (typeof config.minRangeSize !== 'number' || config.minRangeSize < 0) {
      throw new Error(
        `Invalid minRangeSize: must be non-negative number (got ${config.minRangeSize})`
      );
    }
  }

  // Validate precision
  if (config.precision !== undefined) {
    if (typeof config.precision !== 'number' || config.precision < 0 || config.precision > 15) {
      throw new Error(
        `Invalid precision: must be between 0 and 15 (got ${config.precision})`
      );
    }
  }
}

/**
 * Check if price is in premium zone (above equilibrium)
 *
 * @param level - EquilibriumLevel result from calculateEquilibrium()
 * @returns true if zone is PREMIUM, false otherwise
 *
 * @example
 * const level = calculateEquilibrium(4500, 4600, 4580);
 * if (isPremium(level)) {
 *   console.log('Price is in premium zone - expect reversal down');
 * }
 */
export function isPremium(level: EquilibriumLevel | null): boolean {
  return level !== null && level.zone === 'PREMIUM';
}

/**
 * Check if price is in discount zone (below equilibrium)
 *
 * @param level - EquilibriumLevel result from calculateEquilibrium()
 * @returns true if zone is DISCOUNT, false otherwise
 *
 * @example
 * const level = calculateEquilibrium(4500, 4600, 4520);
 * if (isDiscount(level)) {
 *   console.log('Price is in discount zone - can continue up');
 * }
 */
export function isDiscount(level: EquilibriumLevel | null): boolean {
  return level !== null && level.zone === 'DISCOUNT';
}

/**
 * Check if price is at equilibrium (within threshold)
 *
 * @param level - EquilibriumLevel result from calculateEquilibrium()
 * @returns true if zone is EQUILIBRIUM, false otherwise
 *
 * @example
 * const level = calculateEquilibrium(4500, 4600, 4550);
 * if (isAtEquilibrium(level)) {
 *   console.log('Price is at equilibrium - neutral zone');
 * }
 */
export function isAtEquilibrium(level: EquilibriumLevel | null): boolean {
  return level !== null && level.zone === 'EQUILIBRIUM';
}

/**
 * Extract swing range from HtfSwings for a specific timeframe
 *
 * Finds the most recent swing high and swing low for the given timeframe
 * and constructs a SwingRange object.
 *
 * @param swings - Array of SwingPoint from HtfSwings
 * @param timeframe - Target timeframe ('H1' or 'H4')
 * @returns SwingRange or null if insufficient swings
 *
 * @example
 * const swings = htfSwingsEngine.getSwings('H1');
 * const range = createSwingRange(swings, 'H1');
 * if (range) {
 *   const level = calculateEquilibriumFromRange(range, currentPrice);
 * }
 */
export function createSwingRange(
  swings: SwingPoint[],
  timeframe: HTF | 'M5' | 'M1'
): SwingRange | null {
  // Filter swings by timeframe
  const filtered = swings.filter(s => s.htf === timeframe);

  if (filtered.length === 0) {
    return null;
  }

  // Find most recent high and low
  const highs = filtered.filter(s => s.kind === 'HIGH');
  const lows = filtered.filter(s => s.kind === 'LOW');

  if (highs.length === 0 || lows.length === 0) {
    return null;
  }

  // Sort by timestamp descending (most recent first)
  highs.sort((a, b) => b.time.getTime() - a.time.getTime());
  lows.sort((a, b) => b.time.getTime() - a.time.getTime());

  const recentHigh = highs[0];
  const recentLow = lows[0];

  return {
    high: recentHigh.price,
    low: recentLow.price,
    timestamp: new Date(), // Current time
    timeframe: timeframe,
    source: 'COMPUTED',
  };
}
