/**
 * Daily bias calculation (version 1)
 * Determines market bias (bullish/bearish/neutral) based on price action
 * relative to session extremes and recent structure
 */

import type { Bar, BiasResult, SessionExtremes } from '../types.js';

/**
 * Epsilon value for floating-point price comparisons
 */
const PRICE_EPSILON = 1e-9;

/**
 * Confidence thresholds for bias classification
 */
const CONFIDENCE = {
  HIGH: 0.75,
  MEDIUM: 0.5,
  LOW: 0.25,
};

/**
 * Calculate the range percentage: how far current price is from low relative to total range
 *
 * @param current - Current price
 * @param low - Range low
 * @param high - Range high
 * @returns Percentage (0.0 = at low, 1.0 = at high)
 */
function calculateRangePosition(current: number, low: number, high: number): number {
  const range = high - low;

  // Handle zero range (all prices equal)
  if (range < PRICE_EPSILON) {
    return 0.5; // Neutral position
  }

  const position = (current - low) / range;

  // Clamp to [0, 1] in case current is outside the range
  return Math.max(0, Math.min(1, position));
}

/**
 * Calculate daily bias from bar data and session extremes
 *
 * **Algorithm:**
 * 1. **Macro context:** Compare current close to RTH open (directional move)
 * 2. **Micro context:** Analyze position within RTH range (high/low relative)
 * 3. **Momentum:** Check if close is near high (bullish) or near low (bearish)
 * 4. **Confidence:** Combine signals to produce 0-1 confidence score
 *
 * **Bias logic:**
 * - **Bullish:** Close > open AND close in upper 40% of range → High confidence
 * - **Bearish:** Close < open AND close in lower 40% of range → High confidence
 * - **Neutral:** Mixed signals or close near midpoint → Low/medium confidence
 *
 * **Edge cases:**
 * - Empty bars array: Returns neutral with zero confidence
 * - Single bar: Uses that bar's close vs open
 * - Zero range (all prices equal): Returns neutral
 *
 * @param bars - Array of price bars (chronologically ordered)
 * @param sessionExtremes - RTH high/low/open/close values
 * @returns Bias result with classification, confidence, and reasoning
 *
 * @example
 * ```typescript
 * const bars = [
 *   { timestamp: 1000, open: 100, high: 105, low: 99, close: 104 },
 *   { timestamp: 2000, open: 104, high: 110, low: 103, close: 108 },
 * ];
 *
 * const sessionExtremes = {
 *   rthOpen: 100,
 *   rthClose: 108,
 *   rthHigh: 110,
 *   rthLow: 99,
 * };
 *
 * const bias = calculateDailyBias(bars, sessionExtremes);
 * // Returns { bias: 'bullish', confidence: 0.8, reason: '...' }
 * ```
 */
export function calculateDailyBias(bars: Bar[], sessionExtremes: SessionExtremes): BiasResult {
  // Handle empty bars
  if (bars.length === 0) {
    return {
      bias: 'neutral',
      confidence: 0,
      reason: 'No bar data provided',
    };
  }

  const { rthOpen, rthClose, rthHigh, rthLow } = sessionExtremes;

  // Validate session extremes
  if (!Number.isFinite(rthOpen) || !Number.isFinite(rthClose) ||
      !Number.isFinite(rthHigh) || !Number.isFinite(rthLow)) {
    return {
      bias: 'neutral',
      confidence: 0,
      reason: 'Invalid session extremes data',
    };
  }

  // 1. Macro directional move: open to close
  const macroMove = rthClose - rthOpen;
  const macroDirection = macroMove > PRICE_EPSILON ? 'bullish' :
                        macroMove < -PRICE_EPSILON ? 'bearish' : 'neutral';

  // 2. Micro position: where is close within the RTH range?
  const rangePosition = calculateRangePosition(rthClose, rthLow, rthHigh);

  // 3. Determine bias and confidence
  let bias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let confidence = 0;
  let reason = '';

  if (macroDirection === 'bullish' && rangePosition >= 0.6) {
    // Strong bullish: closed above open AND in upper 40% of range
    bias = 'bullish';
    confidence = CONFIDENCE.HIGH + (rangePosition - 0.6) * 0.25; // 0.75-1.0
    reason = `Close (${rthClose.toFixed(2)}) is ${((rangePosition * 100).toFixed(0))}% through RTH range, above open (${rthOpen.toFixed(2)})`;
  } else if (macroDirection === 'bearish' && rangePosition <= 0.4) {
    // Strong bearish: closed below open AND in lower 40% of range
    bias = 'bearish';
    confidence = CONFIDENCE.HIGH + (0.4 - rangePosition) * 0.25; // 0.75-1.0
    reason = `Close (${rthClose.toFixed(2)}) is ${((rangePosition * 100).toFixed(0))}% through RTH range, below open (${rthOpen.toFixed(2)})`;
  } else if (macroDirection === 'bullish' && rangePosition >= 0.5) {
    // Medium bullish: closed above open AND above midpoint
    bias = 'bullish';
    confidence = CONFIDENCE.MEDIUM + (rangePosition - 0.5) * 0.25; // 0.5-0.75
    reason = `Close (${rthClose.toFixed(2)}) above open (${rthOpen.toFixed(2)}) and above range midpoint`;
  } else if (macroDirection === 'bearish' && rangePosition <= 0.5) {
    // Medium bearish: closed below open AND below midpoint
    bias = 'bearish';
    confidence = CONFIDENCE.MEDIUM + (0.5 - rangePosition) * 0.25; // 0.5-0.75
    reason = `Close (${rthClose.toFixed(2)}) below open (${rthOpen.toFixed(2)}) and below range midpoint`;
  } else if (macroDirection === 'bullish') {
    // Weak bullish: closed above open but in lower half of range
    bias = 'bullish';
    confidence = CONFIDENCE.LOW + (rangePosition) * 0.25; // 0.25-0.5
    reason = `Close (${rthClose.toFixed(2)}) above open (${rthOpen.toFixed(2)}) but in lower half of range`;
  } else if (macroDirection === 'bearish') {
    // Weak bearish: closed below open but in upper half of range
    bias = 'bearish';
    confidence = CONFIDENCE.LOW + (1 - rangePosition) * 0.25; // 0.25-0.5
    reason = `Close (${rthClose.toFixed(2)}) below open (${rthOpen.toFixed(2)}) but in upper half of range`;
  } else {
    // Neutral: flat close or mixed signals
    bias = 'neutral';
    confidence = CONFIDENCE.LOW;
    reason = `Close (${rthClose.toFixed(2)}) unchanged from open (${rthOpen.toFixed(2)}) or mixed signals`;
  }

  // Clamp confidence to [0, 1]
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    bias,
    confidence,
    reason,
  };
}