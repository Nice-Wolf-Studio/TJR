/**
 * @fileoverview Price calculation utilities.
 * @module @tjr/tjr-tools/utils/price-utils
 */

import type { MarketBar } from '@tjr/contracts';

/**
 * Calculate Average True Range (ATR) for the last N periods.
 */
export function calculateATR(bars: MarketBar[], period: number = 14): number {
  if (bars.length < period) {
    return 0;
  }

  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const current = bars[i];
    const previous = i > 0 ? bars[i - 1] : bars[i];
    if (!current || !previous) continue;
    const tr = getTrueRange(current, previous);
    sum += tr;
  }

  return sum / period;
}

/**
 * Get True Range for a bar.
 */
function getTrueRange(current: MarketBar, previous: MarketBar): number {
  const highLow = current.high - current.low;
  const highClose = Math.abs(current.high - previous.close);
  const lowClose = Math.abs(current.low - previous.close);
  return Math.max(highLow, highClose, lowClose);
}

/**
 * Calculate simple moving average of volume.
 */
export function calculateVolumeMA(bars: MarketBar[], period: number = 20): number {
  if (bars.length < period) {
    return bars.reduce((sum, bar) => sum + bar.volume, 0) / bars.length;
  }

  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const bar = bars[i];
    if (!bar) continue;
    sum += bar.volume;
  }

  return sum / period;
}

/**
 * Calculate price rejection (wick size relative to range).
 */
export function calculateRejection(bar: MarketBar): number {
  const range = bar.high - bar.low;
  if (range === 0) return 0;

  const upperWick = bar.high - Math.max(bar.open, bar.close);
  const lowerWick = Math.min(bar.open, bar.close) - bar.low;

  return Math.max(upperWick, lowerWick) / range;
}

/**
 * Check if two price zones overlap.
 */
export function zonesOverlap(
  zone1: { high: number; low: number },
  zone2: { high: number; low: number }
): boolean {
  return !(zone1.high < zone2.low || zone1.low > zone2.high);
}

/**
 * Normalize a value to 0-1 range.
 */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}
