/**
 * @fileoverview Order Block detection.
 *
 * Order Blocks are institutional supply/demand zones formed when large players enter the market.
 * Characteristics:
 * - Demand Block: Last bearish bar before strong bullish move
 * - Supply Block: Last bullish bar before strong bearish move
 * - High volume relative to average
 * - Strong rejection (large wicks)
 *
 * @module @tjr/tjr-tools/confluences/order-block
 */

import type { MarketBar } from '@tjr/contracts';
import type { OrderBlock, OrderBlockOptions } from '../types.js';
import { calculateVolumeMA, calculateRejection } from '../utils/price-utils.js';

const DEFAULT_OPTIONS: Required<OrderBlockOptions> = {
  minVolumeRatio: 1.5,
  minRejection: 0.3,
  checkMitigated: true,
};

/**
 * Detect Order Blocks in price data.
 */
export function detectOrderBlocks(bars: MarketBar[], options?: OrderBlockOptions): OrderBlock[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const blocks: OrderBlock[] = [];

  if (bars.length < 5) {
    return blocks;
  }

  const avgVolume = calculateVolumeMA(bars, 20);

  // Scan for potential order blocks
  for (let i = 2; i < bars.length - 2; i++) {
    const bar = bars[i];
    const next1 = bars[i + 1];
    const next2 = bars[i + 2];

    if (!bar || !next1 || !next2) continue;

    // Volume must be significant
    if (bar.volume < avgVolume * opts.minVolumeRatio) {
      continue;
    }

    // Check for rejection
    const rejection = calculateRejection(bar);
    if (rejection < opts.minRejection) {
      continue;
    }

    // Demand Block: Bearish bar followed by bullish move
    if (isBearish(bar) && isBullish(next1) && isBullish(next2)) {
      const mitigated = opts.checkMitigated
        ? isBlockMitigated(bars, i, bar.low, bar.high, 'demand')
        : false;

      const strength = calculateOrderBlockStrength(bar, avgVolume, rejection);

      blocks.push({
        type: 'demand',
        index: i,
        high: bar.high,
        low: bar.low,
        volume: bar.volume,
        strength,
        mitigated,
      });
    }

    // Supply Block: Bullish bar followed by bearish move
    if (isBullish(bar) && isBearish(next1) && isBearish(next2)) {
      const mitigated = opts.checkMitigated
        ? isBlockMitigated(bars, i, bar.low, bar.high, 'supply')
        : false;

      const strength = calculateOrderBlockStrength(bar, avgVolume, rejection);

      blocks.push({
        type: 'supply',
        index: i,
        high: bar.high,
        low: bar.low,
        volume: bar.volume,
        strength,
        mitigated,
      });
    }
  }

  return blocks;
}

/**
 * Check if a bar is bullish (close > open).
 */
function isBullish(bar: MarketBar): boolean {
  return bar.close > bar.open;
}

/**
 * Check if a bar is bearish (close < open).
 */
function isBearish(bar: MarketBar): boolean {
  return bar.close < bar.open;
}

/**
 * Check if an order block has been mitigated (price returned through it).
 */
function isBlockMitigated(
  bars: MarketBar[],
  blockIndex: number,
  low: number,
  high: number,
  type: 'demand' | 'supply'
): boolean {
  for (let i = blockIndex + 1; i < bars.length; i++) {
    const bar = bars[i];
    if (!bar) continue;

    if (type === 'demand') {
      // Demand block mitigated if price breaks below it
      if (bar.low < low) {
        return true;
      }
    } else {
      // Supply block mitigated if price breaks above it
      if (bar.high > high) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Calculate Order Block strength score (0-1).
 */
function calculateOrderBlockStrength(bar: MarketBar, avgVolume: number, rejection: number): number {
  // Volume score (higher volume = stronger)
  const volumeRatio = avgVolume > 0 ? bar.volume / avgVolume : 1;
  const volumeScore = Math.min(1, volumeRatio / 3); // Cap at 3x average

  // Rejection score (already 0-1)
  const rejectionScore = rejection;

  // Range score (larger range = more significant)
  const range = bar.high - bar.low;
  const rangeScore = Math.min(1, range / (bar.close * 0.02)); // Normalize to 2% of price

  // Weighted combination
  return volumeScore * 0.4 + rejectionScore * 0.3 + rangeScore * 0.3;
}
