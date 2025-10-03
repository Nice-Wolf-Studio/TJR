/**
 * @fileoverview Fair Value Gap (FVG) detection.
 *
 * A Fair Value Gap occurs when there is a 3-bar pattern showing a price inefficiency:
 * - Bullish FVG: Gap between bar[i-1].high and bar[i+1].low (middle bar moves up quickly)
 * - Bearish FVG: Gap between bar[i-1].low and bar[i+1].high (middle bar moves down quickly)
 *
 * @module @tjr/tjr-tools/confluences/fvg
 */

import type { MarketBar } from '@tjr/contracts';
import type { FVGZone, FVGOptions } from '../types.js';
import { calculateATR } from '../utils/price-utils.js';

const DEFAULT_OPTIONS: Required<FVGOptions> = {
  minGapSizeATR: 0.5,
  checkFilled: true,
};

/**
 * Detect Fair Value Gaps in price data.
 */
export function detectFVGs(bars: MarketBar[], options?: FVGOptions): FVGZone[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const zones: FVGZone[] = [];

  if (bars.length < 3) {
    return zones;
  }

  const atr = calculateATR(bars, 14);
  const minGapSize = atr * opts.minGapSizeATR;

  // Scan for 3-bar FVG patterns
  for (let i = 1; i < bars.length - 1; i++) {
    const prev = bars[i - 1];
    const current = bars[i];
    const next = bars[i + 1];

    if (!prev || !current || !next) continue;

    // Bullish FVG: gap between prev.high and next.low
    if (prev.high < next.low) {
      const gapSize = next.low - prev.high;
      if (gapSize >= minGapSize) {
        const filled = opts.checkFilled
          ? isGapFilled(bars, i + 1, prev.high, next.low, 'bullish')
          : false;
        const strength = calculateFVGStrength(gapSize, atr, current.volume, bars);

        zones.push({
          type: 'bullish',
          startIndex: i - 1,
          high: next.low,
          low: prev.high,
          size: gapSize,
          strength,
          filled,
        });
      }
    }

    // Bearish FVG: gap between prev.low and next.high
    if (prev.low > next.high) {
      const gapSize = prev.low - next.high;
      if (gapSize >= minGapSize) {
        const filled = opts.checkFilled
          ? isGapFilled(bars, i + 1, next.high, prev.low, 'bearish')
          : false;
        const strength = calculateFVGStrength(gapSize, atr, current.volume, bars);

        zones.push({
          type: 'bearish',
          startIndex: i - 1,
          high: prev.low,
          low: next.high,
          size: gapSize,
          strength,
          filled,
        });
      }
    }
  }

  return zones;
}

/**
 * Check if a gap has been filled by subsequent price action.
 */
function isGapFilled(
  bars: MarketBar[],
  startIndex: number,
  low: number,
  high: number,
  type: 'bullish' | 'bearish'
): boolean {
  for (let i = startIndex + 1; i < bars.length; i++) {
    const bar = bars[i];
    if (!bar) continue;

    if (type === 'bullish') {
      // Bullish gap is filled if price comes back down into the gap
      if (bar.low <= low) {
        return true;
      }
    } else {
      // Bearish gap is filled if price comes back up into the gap
      if (bar.high >= high) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Calculate FVG strength score (0-1).
 */
function calculateFVGStrength(
  gapSize: number,
  atr: number,
  volume: number,
  bars: MarketBar[]
): number {
  if (atr === 0) return 0;

  // Normalize gap size relative to ATR (larger gaps = stronger)
  const sizeScore = Math.min(1, gapSize / (atr * 2));

  // Volume score (compare to recent average)
  const recentVolumes = bars.slice(-20).map((b) => b.volume);
  const avgVolume = recentVolumes.reduce((sum, v) => sum + v, 0) / recentVolumes.length;
  const volumeScore = avgVolume > 0 ? Math.min(1, volume / avgVolume) : 0.5;

  // Weighted combination
  return sizeScore * 0.7 + volumeScore * 0.3;
}
