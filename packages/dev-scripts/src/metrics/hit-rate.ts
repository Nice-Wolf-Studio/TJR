/**
 * Hit-rate metrics calculation
 *
 * Computes success rate of trading signals by comparing actual outcomes
 * against expected results. A successful signal reaches its take-profit
 * before hitting stop-loss.
 *
 * @module @tjr/dev-scripts/metrics/hit-rate
 */

import type { HitRateMetrics, TradingSignal } from './types';

/**
 * Calculate hit-rate metrics from trading signals
 *
 * Hit-rate = (successful_signals / total_signals) * 100
 *
 * Broken down by:
 * - Overall hit-rate across all signals
 * - Long trade hit-rate
 * - Short trade hit-rate
 *
 * @param signals - Array of trading signals with outcomes
 * @returns Hit-rate metrics object
 *
 * @example
 * const signals = [
 *   { direction: 'long', entry: 100, stopLoss: 98, takeProfit: 104, successful: true },
 *   { direction: 'long', entry: 105, stopLoss: 103, takeProfit: 109, successful: false },
 *   { direction: 'short', entry: 110, stopLoss: 112, takeProfit: 106, successful: true },
 * ];
 * const metrics = calculateHitRate(signals);
 * // => { overall: 66.7, long: 50.0, short: 100.0, totalSignals: 3, successful: 2, failed: 1 }
 */
export function calculateHitRate(signals: TradingSignal[]): HitRateMetrics {
  if (signals.length === 0) {
    return {
      overall: 0,
      long: 0,
      short: 0,
      totalSignals: 0,
      successful: 0,
      failed: 0,
    };
  }

  // Count overall success/failure
  const successful = signals.filter((s) => s.successful === true).length;
  const failed = signals.filter((s) => s.successful === false).length;
  const overall = (successful / signals.length) * 100;

  // Count long trades
  const longSignals = signals.filter((s) => s.direction === 'long');
  const longSuccessful = longSignals.filter((s) => s.successful === true).length;
  const longHitRate = longSignals.length > 0 ? (longSuccessful / longSignals.length) * 100 : 0;

  // Count short trades
  const shortSignals = signals.filter((s) => s.direction === 'short');
  const shortSuccessful = shortSignals.filter((s) => s.successful === true).length;
  const shortHitRate = shortSignals.length > 0 ? (shortSuccessful / shortSignals.length) * 100 : 0;

  return {
    overall: round1(overall),
    long: round1(longHitRate),
    short: round1(shortHitRate),
    totalSignals: signals.length,
    successful,
    failed,
  };
}

/**
 * Evaluate whether a trading signal was successful
 *
 * Checks if take-profit was reached before stop-loss by scanning
 * subsequent bars. Updates the signal's `successful` field.
 *
 * @param signal - Trading signal to evaluate
 * @param bars - Market bars after the signal
 * @returns Whether the signal was successful
 *
 * @example
 * const signal = { direction: 'long', entry: 100, stopLoss: 98, takeProfit: 104 };
 * const bars = [
 *   { high: 102, low: 99 },
 *   { high: 105, low: 100 }, // TP hit here
 * ];
 * const success = evaluateSignal(signal, bars);
 * // => true
 */
export function evaluateSignal(
  signal: TradingSignal,
  bars: Array<{ high: number; low: number }>
): boolean {
  if (signal.direction === 'long') {
    // For long trades: TP above entry, SL below entry
    // Check if any bar hits TP or SL first
    for (const bar of bars) {
      // Take profit hit?
      if (bar.high >= signal.takeProfit) {
        signal.successful = true;
        return true;
      }
      // Stop loss hit?
      if (bar.low <= signal.stopLoss) {
        signal.successful = false;
        return false;
      }
    }
  } else {
    // For short trades: TP below entry, SL above entry
    for (const bar of bars) {
      // Take profit hit?
      if (bar.low <= signal.takeProfit) {
        signal.successful = true;
        return true;
      }
      // Stop loss hit?
      if (bar.high >= signal.stopLoss) {
        signal.successful = false;
        return false;
      }
    }
  }

  // No conclusion - trade still open
  signal.successful = undefined;
  return false;
}

/**
 * Round number to 1 decimal place for display
 */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
