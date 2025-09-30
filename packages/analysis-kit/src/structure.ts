/**
 * Market structure analysis - swing point detection
 * Pure functions for identifying Higher Highs, Higher Lows, Lower Highs, Lower Lows
 */

import type { Bar, SwingPoint, SwingType } from './types.js';

/**
 * Epsilon value for floating-point price comparisons
 * Two prices are considered equal if they differ by less than this amount
 */
const PRICE_EPSILON = 1e-9;

/**
 * Validate that bar data is properly ordered chronologically
 *
 * @param bars - Array of price bars
 * @throws Error if bars are not in chronological order
 */
function validateBarsOrdering(bars: Bar[]): void {
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1];
    const curr = bars[i];

    if (!prev || !curr) {
      throw new Error(`Invalid bar data: missing bar at index ${prev ? i : i - 1}`);
    }

    if (curr.timestamp <= prev.timestamp) {
      throw new Error(
        `Bars must be in chronological order: bar[${i}].timestamp (${curr.timestamp}) ` +
        `<= bar[${i - 1}].timestamp (${prev.timestamp})`
      );
    }
  }
}

/**
 * Validate that bar OHLC values are consistent
 *
 * @param bar - Price bar to validate
 * @param index - Index in array (for error messages)
 * @throws Error if bar has invalid OHLC relationships
 */
function validateBarPrices(bar: Bar, index: number): void {
  // Check for NaN or Infinity
  const prices = [bar.open, bar.high, bar.low, bar.close];
  for (const price of prices) {
    if (!Number.isFinite(price)) {
      throw new Error(`Invalid price at bar[${index}]: ${price}`);
    }
  }

  // High must be >= open, close
  if (bar.high < bar.open - PRICE_EPSILON || bar.high < bar.close - PRICE_EPSILON) {
    throw new Error(
      `Invalid bar[${index}]: high (${bar.high}) must be >= open (${bar.open}) and close (${bar.close})`
    );
  }

  // Low must be <= open, close
  if (bar.low > bar.open + PRICE_EPSILON || bar.low > bar.close + PRICE_EPSILON) {
    throw new Error(
      `Invalid bar[${index}]: low (${bar.low}) must be <= open (${bar.open}) and close (${bar.close})`
    );
  }
}

/**
 * Find local pivot highs in the bar array
 * A pivot high is a bar whose high is greater than or equal to the highs
 * of `lookback` bars on both sides
 *
 * @param bars - Array of price bars
 * @param lookback - Number of bars to check on each side
 * @returns Array of indices where pivot highs occur
 */
function findPivotHighs(bars: Bar[], lookback: number): number[] {
  const pivots: number[] = [];

  // Cannot identify pivots at edges (insufficient context)
  for (let i = lookback; i < bars.length - lookback; i++) {
    const centerBar = bars[i];
    if (!centerBar) continue;

    const centerHigh = centerBar.high;
    let isPivot = true;

    // Check lookback bars on the left
    for (let j = i - lookback; j < i; j++) {
      const bar = bars[j];
      if (!bar) continue;

      if (bar.high > centerHigh + PRICE_EPSILON) {
        isPivot = false;
        break;
      }
    }

    if (!isPivot) continue;

    // Check lookback bars on the right
    for (let j = i + 1; j <= i + lookback; j++) {
      const bar = bars[j];
      if (!bar) continue;

      if (bar.high > centerHigh + PRICE_EPSILON) {
        isPivot = false;
        break;
      }
    }

    if (isPivot) {
      pivots.push(i);
    }
  }

  return pivots;
}

/**
 * Find local pivot lows in the bar array
 * A pivot low is a bar whose low is less than or equal to the lows
 * of `lookback` bars on both sides
 *
 * @param bars - Array of price bars
 * @param lookback - Number of bars to check on each side
 * @returns Array of indices where pivot lows occur
 */
function findPivotLows(bars: Bar[], lookback: number): number[] {
  const pivots: number[] = [];

  // Cannot identify pivots at edges (insufficient context)
  for (let i = lookback; i < bars.length - lookback; i++) {
    const centerBar = bars[i];
    if (!centerBar) continue;

    const centerLow = centerBar.low;
    let isPivot = true;

    // Check lookback bars on the left
    for (let j = i - lookback; j < i; j++) {
      const bar = bars[j];
      if (!bar) continue;

      if (bar.low < centerLow - PRICE_EPSILON) {
        isPivot = false;
        break;
      }
    }

    if (!isPivot) continue;

    // Check lookback bars on the right
    for (let j = i + 1; j <= i + lookback; j++) {
      const bar = bars[j];
      if (!bar) continue;

      if (bar.low < centerLow - PRICE_EPSILON) {
        isPivot = false;
        break;
      }
    }

    if (isPivot) {
      pivots.push(i);
    }
  }

  return pivots;
}

/**
 * Classify swing type based on current and previous pivot
 *
 * @param currentPrice - Current pivot price
 * @param currentType - Current pivot type ('high' or 'low')
 * @param prevPrice - Previous pivot price (same type)
 * @returns Swing classification (HH, HL, LH, LL) or null if cannot classify
 */
function classifySwing(
  currentPrice: number,
  currentType: 'high' | 'low',
  prevPrice: number | null
): SwingType | null {
  if (prevPrice === null) {
    // Cannot classify first pivot (no reference point)
    return null;
  }

  if (currentType === 'high') {
    // Comparing highs: Higher High or Lower High
    if (currentPrice > prevPrice + PRICE_EPSILON) {
      return 'HH';
    } else if (currentPrice < prevPrice - PRICE_EPSILON) {
      return 'LH';
    } else {
      // Equal highs - treat as continuation (use previous classification)
      // For simplicity, classify equal highs as HH (continuation of trend)
      return 'HH';
    }
  } else {
    // Comparing lows: Higher Low or Lower Low
    if (currentPrice > prevPrice + PRICE_EPSILON) {
      return 'HL';
    } else if (currentPrice < prevPrice - PRICE_EPSILON) {
      return 'LL';
    } else {
      // Equal lows - treat as continuation (use previous classification)
      // For simplicity, classify equal lows as HL (continuation of trend)
      return 'HL';
    }
  }
}

/**
 * Detect swing points (higher highs, higher lows, lower highs, lower lows) in price data
 *
 * This function identifies pivots using a lookback window, then classifies each pivot
 * relative to the previous pivot of the same type (high vs low).
 *
 * **Edge case handling:**
 * - First/last `lookback` bars cannot be pivots (insufficient context)
 * - First pivot of each type (high/low) is not classified (no reference)
 * - Equal pivots are treated as continuation of previous trend
 * - Empty array or insufficient data returns empty result
 *
 * **Algorithm:**
 * 1. Find all pivot highs (local maxima over lookback window)
 * 2. Find all pivot lows (local minima over lookback window)
 * 3. Classify each pivot by comparing to previous pivot of same type
 * 4. Return chronologically sorted array of classified swing points
 *
 * @param bars - Array of price bars (must be chronologically ordered)
 * @param lookback - Number of bars on each side for pivot identification (typically 3-10)
 * @returns Array of swing points with classifications
 * @throws Error if bars are not chronologically ordered or have invalid OHLC values
 *
 * @example
 * ```typescript
 * const bars = [
 *   { timestamp: 1000, open: 100, high: 105, low: 99, close: 104 },
 *   { timestamp: 2000, open: 104, high: 106, low: 103, close: 105 },
 *   { timestamp: 3000, open: 105, high: 110, low: 104, close: 108 },  // Pivot high
 *   { timestamp: 4000, open: 108, high: 109, low: 106, close: 107 },
 *   { timestamp: 5000, open: 107, high: 108, low: 102, close: 103 },
 *   { timestamp: 6000, open: 103, high: 104, low: 100, close: 101 },  // Pivot low
 * ];
 *
 * const swings = detectSwings(bars, 2);
 * // Returns swing points with HH, HL classifications
 * ```
 */
export function detectSwings(bars: Bar[], lookback: number): SwingPoint[] {
  // Validate inputs
  if (bars.length === 0) {
    return [];
  }

  if (lookback < 1) {
    throw new Error('Lookback must be at least 1');
  }

  if (bars.length < lookback * 2 + 1) {
    // Not enough bars to identify any pivots
    return [];
  }

  // Validate bar data
  validateBarsOrdering(bars);
  bars.forEach((bar, i) => validateBarPrices(bar, i));

  // Find pivot indices
  const pivotHighIndices = findPivotHighs(bars, lookback);
  const pivotLowIndices = findPivotLows(bars, lookback);

  const swingPoints: SwingPoint[] = [];

  // Process pivot highs
  let prevHigh: number | null = null;
  for (const index of pivotHighIndices) {
    const bar = bars[index];
    if (!bar) continue;

    const swingType = classifySwing(bar.high, 'high', prevHigh);

    if (swingType !== null) {
      swingPoints.push({
        index,
        timestamp: bar.timestamp,
        price: bar.high,
        type: swingType,
      });
    }

    prevHigh = bar.high;
  }

  // Process pivot lows
  let prevLow: number | null = null;
  for (const index of pivotLowIndices) {
    const bar = bars[index];
    if (!bar) continue;

    const swingType = classifySwing(bar.low, 'low', prevLow);

    if (swingType !== null) {
      swingPoints.push({
        index,
        timestamp: bar.timestamp,
        price: bar.low,
        type: swingType,
      });
    }

    prevLow = bar.low;
  }

  // Sort by timestamp (chronological order)
  swingPoints.sort((a, b) => a.timestamp - b.timestamp);

  return swingPoints;
}