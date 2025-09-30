/**
 * Day profile classification (version 1)
 * Classifies daily price action into profile types: Trend (P), Range (K), Distribution (D)
 */

import type { Bar, DayProfile, ProfileType, SessionExtremes } from '../types.js';

/**
 * Epsilon value for floating-point comparisons
 */
const PRICE_EPSILON = 1e-9;

/**
 * Profile classification thresholds
 */
const THRESHOLDS = {
  TREND_RANGE_RATIO: 0.7,    // Range/ATR ratio for trend day (large range)
  RANGE_DAY_RATIO: 0.3,       // Range/ATR ratio for range day (small range)
  DIRECTIONAL_THRESHOLD: 0.6, // Close position in range for trend identification
};

/**
 * Calculate Average True Range (ATR) from recent bars
 * Uses simple average of true ranges over the provided bars
 *
 * @param bars - Array of bars to calculate ATR from
 * @returns ATR value
 */
function calculateATR(bars: Bar[]): number {
  if (bars.length === 0) {
    return 0;
  }

  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (!bar) continue;

    const trueHigh = bar.high;
    const trueLow = bar.low;
    const trueRange = trueHigh - trueLow;

    sum += trueRange;
  }

  return sum / bars.length;
}

/**
 * Calculate where close is positioned within the range
 *
 * @param close - Close price
 * @param low - Range low
 * @param high - Range high
 * @returns Position (0.0 = at low, 1.0 = at high)
 */
function calculateClosePosition(close: number, low: number, high: number): number {
  const range = high - low;

  if (range < PRICE_EPSILON) {
    return 0.5; // Neutral if no range
  }

  return (close - low) / range;
}

/**
 * Classify day profile from bar data and session extremes
 *
 * **Profile types:**
 * - **P (Trend Day):** Strong directional move with limited retracement
 *   - Large range (> 70% of ATR)
 *   - Close near high (bullish trend) or near low (bearish trend)
 *   - Characteristics: "strong directional move", "limited retracement"
 *
 * - **K (Range Day):** Balanced, mean-reverting, narrow range
 *   - Small range (< 30% of ATR) relative to recent volatility
 *   - Close near middle of range
 *   - Characteristics: "narrow range", "balanced", "mean-reverting"
 *
 * - **D (Distribution/Breakout Day):** Wide range with rotational price action
 *   - Large range but close not at extreme (mid-range close)
 *   - Indicates distribution or failed breakout
 *   - Characteristics: "wide range", "rotational", "distribution"
 *
 * **Algorithm:**
 * 1. Calculate ATR from recent bars (volatility baseline)
 * 2. Calculate normalized range (high-low / ATR)
 * 3. Calculate close position within range
 * 4. Apply classification rules based on range and close position
 *
 * **Edge cases:**
 * - Empty bars: Returns 'K' (range day) with zero volatility
 * - Zero ATR: Uses absolute range for classification
 * - Single bar: Uses that bar's range
 *
 * @param bars - Array of price bars (chronologically ordered)
 * @param sessionExtremes - RTH high/low/open/close values
 * @returns Day profile classification with characteristics
 *
 * @example
 * ```typescript
 * const bars = [
 *   { timestamp: 1000, open: 100, high: 105, low: 99, close: 104 },
 *   { timestamp: 2000, open: 104, high: 110, low: 103, close: 109 },
 * ];
 *
 * const sessionExtremes = {
 *   rthOpen: 100,
 *   rthClose: 109,
 *   rthHigh: 110,
 *   rthLow: 99,
 * };
 *
 * const profile = classifyDayProfile(bars, sessionExtremes);
 * // Returns { type: 'P', characteristics: ['strong directional move', ...], volatility: 0.85 }
 * ```
 */
export function classifyDayProfile(bars: Bar[], sessionExtremes: SessionExtremes): DayProfile {
  // Handle empty bars
  if (bars.length === 0) {
    return {
      type: 'K',
      characteristics: ['insufficient data'],
      volatility: 0,
    };
  }

  const { rthClose, rthHigh, rthLow } = sessionExtremes;

  // Calculate volatility baseline (ATR)
  const atr = calculateATR(bars);

  // Calculate session range
  const sessionRange = rthHigh - rthLow;

  // Calculate normalized volatility (range relative to ATR)
  let normalizedRange = 0;
  if (atr > PRICE_EPSILON) {
    normalizedRange = sessionRange / atr;
  } else {
    // If ATR is zero (all bars have same OHLC), use absolute range
    normalizedRange = sessionRange > PRICE_EPSILON ? 1.0 : 0;
  }

  // Calculate where close is within the range
  const closePosition = calculateClosePosition(rthClose, rthLow, rthHigh);

  // Classify profile
  let profileType: ProfileType;
  const characteristics: string[] = [];

  if (normalizedRange > THRESHOLDS.TREND_RANGE_RATIO) {
    // Large range day - could be trend or distribution
    if (closePosition >= THRESHOLDS.DIRECTIONAL_THRESHOLD) {
      // Trend day - close near high (bullish)
      profileType = 'P';
      characteristics.push('strong directional move');
      characteristics.push('bullish trend');
      characteristics.push('close near high');
    } else if (closePosition <= (1 - THRESHOLDS.DIRECTIONAL_THRESHOLD)) {
      // Trend day - close near low (bearish)
      profileType = 'P';
      characteristics.push('strong directional move');
      characteristics.push('bearish trend');
      characteristics.push('close near low');
    } else {
      // Distribution day - large range but close in middle
      profileType = 'D';
      characteristics.push('wide range');
      characteristics.push('rotational');
      characteristics.push('distribution');
      characteristics.push('close near middle');
    }
  } else if (normalizedRange < THRESHOLDS.RANGE_DAY_RATIO) {
    // Small range day
    profileType = 'K';
    characteristics.push('narrow range');
    characteristics.push('balanced');
    characteristics.push('mean-reverting');
  } else {
    // Medium range - default to distribution
    profileType = 'D';
    characteristics.push('moderate range');
    characteristics.push('mixed signals');

    if (closePosition >= 0.6) {
      characteristics.push('closed upper half');
    } else if (closePosition <= 0.4) {
      characteristics.push('closed lower half');
    } else {
      characteristics.push('closed near middle');
    }
  }

  return {
    type: profileType,
    characteristics,
    volatility: normalizedRange,
  };
}