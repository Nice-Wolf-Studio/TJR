/**
 * @fileoverview Price level calculations for stop loss and take profit.
 *
 * Calculates optimal stop loss and take profit levels based on zones,
 * risk parameters, and market structure.
 *
 * @module @tjr/tjr-tools/execution/price-levels
 */

import type { MarketBar } from '@tjr/contracts';
import type { ExecutionConfig, FVGZone, OrderBlock } from '../types.js';

/**
 * Price levels for trade execution.
 */
export interface PriceLevels {
  /** Entry price */
  entry: number;
  /** Stop loss price */
  stopLoss: number;
  /** Take profit price */
  takeProfit: number;
  /** Risk amount (entry - stop for longs, stop - entry for shorts) */
  riskAmount: number;
  /** Reward amount (TP - entry for longs, entry - TP for shorts) */
  rewardAmount: number;
  /** Risk-reward ratio */
  riskRewardRatio: number;
}

/**
 * Calculate stop loss price based on zones and risk config.
 *
 * Uses zone boundaries when available, otherwise falls back to percentage-based stop.
 *
 * @param entryPrice - Entry price for the trade
 * @param direction - Trade direction (long or short)
 * @param bars - Recent market bars for structure analysis
 * @param fvgZones - Active FVG zones
 * @param orderBlocks - Active order blocks
 * @param config - Execution configuration
 * @returns Stop loss price
 */
export function calculateStopLoss(
  entryPrice: number,
  direction: 'long' | 'short',
  bars: MarketBar[],
  fvgZones: FVGZone[],
  orderBlocks: OrderBlock[],
  config: ExecutionConfig
): number {
  const { defaultStopPercent } = config.risk;

  // First, try to use zone-based stops
  const zoneStop = getZoneBasedStop(entryPrice, direction, fvgZones, orderBlocks);

  // Then check for structure-based stops
  const structureStop = getStructureBasedStop(entryPrice, direction, bars);

  // Calculate default percentage-based stop
  const percentStop = direction === 'long'
    ? entryPrice * (1 - defaultStopPercent)
    : entryPrice * (1 + defaultStopPercent);

  // Choose the most conservative stop (closest to entry)
  let stopLoss: number;

  if (direction === 'long') {
    // For longs, use the highest stop (closest to entry, most conservative)
    stopLoss = Math.max(
      zoneStop ?? 0,
      structureStop ?? 0,
      percentStop
    );
    // But not above entry
    stopLoss = Math.min(stopLoss, entryPrice * 0.995);
  } else {
    // For shorts, use the lowest stop (closest to entry, most conservative)
    stopLoss = Math.min(
      zoneStop ?? Infinity,
      structureStop ?? Infinity,
      percentStop
    );
    // But not below entry
    stopLoss = Math.max(stopLoss, entryPrice * 1.005);
  }

  return stopLoss;
}

/**
 * Calculate take profit price based on risk-reward ratio.
 *
 * @param entryPrice - Entry price for the trade
 * @param stopLoss - Stop loss price
 * @param direction - Trade direction
 * @param config - Execution configuration
 * @returns Take profit price
 */
export function calculateTakeProfit(
  entryPrice: number,
  stopLoss: number,
  direction: 'long' | 'short',
  config: ExecutionConfig
): number {
  const { defaultRiskReward } = config.risk;

  // Calculate risk amount
  const riskAmount = Math.abs(entryPrice - stopLoss);

  // Calculate reward based on risk-reward ratio
  const rewardAmount = riskAmount * defaultRiskReward;

  // Calculate take profit
  if (direction === 'long') {
    return entryPrice + rewardAmount;
  } else {
    return entryPrice - rewardAmount;
  }
}

/**
 * Get zone-based stop loss level.
 *
 * @param entryPrice - Entry price
 * @param direction - Trade direction
 * @param fvgZones - FVG zones
 * @param orderBlocks - Order blocks
 * @returns Stop loss price based on zones, or null if no suitable zone
 */
function getZoneBasedStop(
  entryPrice: number,
  direction: 'long' | 'short',
  fvgZones: FVGZone[],
  orderBlocks: OrderBlock[]
): number | null {
  const activeFVGs = fvgZones.filter(z => !z.filled);
  const activeBlocks = orderBlocks.filter(b => !b.mitigated);

  if (direction === 'long') {
    // For longs, place stop below demand zones or bullish FVGs
    let lowestZone = Infinity;

    for (const zone of activeFVGs) {
      if (zone.type === 'bullish' && zone.low < entryPrice) {
        lowestZone = Math.min(lowestZone, zone.low);
      }
    }

    for (const block of activeBlocks) {
      if (block.type === 'demand' && block.low < entryPrice) {
        lowestZone = Math.min(lowestZone, block.low);
      }
    }

    // Place stop slightly below the zone
    return lowestZone < Infinity ? lowestZone * 0.998 : null;
  } else {
    // For shorts, place stop above supply zones or bearish FVGs
    let highestZone = 0;

    for (const zone of activeFVGs) {
      if (zone.type === 'bearish' && zone.high > entryPrice) {
        highestZone = Math.max(highestZone, zone.high);
      }
    }

    for (const block of activeBlocks) {
      if (block.type === 'supply' && block.high > entryPrice) {
        highestZone = Math.max(highestZone, block.high);
      }
    }

    // Place stop slightly above the zone
    return highestZone > 0 ? highestZone * 1.002 : null;
  }
}

/**
 * Get structure-based stop loss level.
 *
 * @param entryPrice - Entry price
 * @param direction - Trade direction
 * @param bars - Recent market bars
 * @returns Stop loss price based on market structure, or null
 */
function getStructureBasedStop(
  entryPrice: number,
  direction: 'long' | 'short',
  bars: MarketBar[]
): number | null {
  if (bars.length < 10) {
    return null;
  }

  // Look at recent 10 bars for structure
  const recentBars = bars.slice(-10);

  if (direction === 'long') {
    // Find recent swing low
    let swingLow = Infinity;
    for (let i = 1; i < recentBars.length - 1; i++) {
      const prev = recentBars[i - 1];
      const curr = recentBars[i];
      const next = recentBars[i + 1];

      if (curr && prev && next) {
        // Swing low: lower than both neighbors
        if (curr.low < prev.low && curr.low < next.low) {
          swingLow = Math.min(swingLow, curr.low);
        }
      }
    }

    return swingLow < Infinity && swingLow < entryPrice ? swingLow * 0.998 : null;
  } else {
    // Find recent swing high
    let swingHigh = 0;
    for (let i = 1; i < recentBars.length - 1; i++) {
      const prev = recentBars[i - 1];
      const curr = recentBars[i];
      const next = recentBars[i + 1];

      if (curr && prev && next) {
        // Swing high: higher than both neighbors
        if (curr.high > prev.high && curr.high > next.high) {
          swingHigh = Math.max(swingHigh, curr.high);
        }
      }
    }

    return swingHigh > 0 && swingHigh > entryPrice ? swingHigh * 1.002 : null;
  }
}

/**
 * Calculate all price levels for trade execution.
 *
 * @param entryPrice - Entry price
 * @param direction - Trade direction
 * @param bars - Market bars
 * @param fvgZones - FVG zones
 * @param orderBlocks - Order blocks
 * @param config - Execution configuration
 * @returns Complete price levels
 */
export function calculatePriceLevels(
  entryPrice: number,
  direction: 'long' | 'short',
  bars: MarketBar[],
  fvgZones: FVGZone[],
  orderBlocks: OrderBlock[],
  config: ExecutionConfig
): PriceLevels {
  const stopLoss = calculateStopLoss(
    entryPrice,
    direction,
    bars,
    fvgZones,
    orderBlocks,
    config
  );

  const takeProfit = calculateTakeProfit(
    entryPrice,
    stopLoss,
    direction,
    config
  );

  const riskAmount = Math.abs(entryPrice - stopLoss);
  const rewardAmount = Math.abs(takeProfit - entryPrice);
  const riskRewardRatio = rewardAmount / riskAmount;

  return {
    entry: entryPrice,
    stopLoss,
    takeProfit,
    riskAmount,
    rewardAmount,
    riskRewardRatio,
  };
}

/**
 * Validate price levels for sanity.
 *
 * @param levels - Price levels to validate
 * @param direction - Trade direction
 * @returns True if levels are valid
 */
export function validatePriceLevels(
  levels: PriceLevels,
  direction: 'long' | 'short'
): boolean {
  const { entry, stopLoss, takeProfit } = levels;

  if (direction === 'long') {
    // For longs: stop < entry < target
    return stopLoss < entry && entry < takeProfit;
  } else {
    // For shorts: target < entry < stop
    return takeProfit < entry && entry < stopLoss;
  }
}