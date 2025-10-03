/**
 * @fileoverview 1-minute timeframe entry trigger logic.
 *
 * Implements entry criteria after 5-minute confirmation has been established.
 * The 1-minute timeframe provides precise entry timing within the confirmed setup.
 *
 * @module @tjr/tjr-tools/execution/entry
 */

import type { MarketBar, TJRConfluence } from '@tjr/contracts';
import type {
  ExecutionConfig,
  EntryTrigger,
  ConfirmationResult,
  FVGZone,
  OrderBlock,
} from '../types.js';

/**
 * Check for 1-minute entry trigger after 5-minute confirmation.
 *
 * Looks for entry opportunities on the 1-minute timeframe within the allowed
 * time window after confirmation. Entry must meet minimum confluence and
 * optionally be within active zones.
 *
 * @param bars1m - Market bars (1-minute timeframe)
 * @param confluence - Current confluence analysis
 * @param confirmation - 5-minute confirmation result
 * @param fvgZones - Detected FVG zones
 * @param orderBlocks - Detected order blocks
 * @param config - Execution configuration
 * @param direction - Trade direction from confirmation
 * @returns Entry trigger result with price and reasoning
 */
export function checkEntryTrigger(
  bars1m: MarketBar[],
  confluence: TJRConfluence,
  confirmation: ConfirmationResult,
  fvgZones: FVGZone[],
  orderBlocks: OrderBlock[],
  config: ExecutionConfig,
  direction: 'long' | 'short'
): EntryTrigger {
  const { entry1m } = config;

  // Confirmation must be valid
  if (!confirmation.confirmed || !confirmation.timestamp) {
    return {
      triggered: false,
      reason: 'No valid 5-minute confirmation',
    };
  }

  // Check confluence threshold for entry
  if (confluence.score < entry1m.minConfluenceScore) {
    return {
      triggered: false,
      reason: `1-minute confluence score ${confluence.score} below minimum ${entry1m.minConfluenceScore}`,
    };
  }

  // Find confirmation timestamp in 1-minute bars
  const confirmationTime = new Date(confirmation.timestamp).getTime();
  let confirmationIndex1m = -1;

  for (let i = bars1m.length - 1; i >= 0; i--) {
    const barTime = new Date(bars1m[i]!.timestamp).getTime();
    if (barTime <= confirmationTime) {
      confirmationIndex1m = i;
      break;
    }
  }

  if (confirmationIndex1m < 0) {
    return {
      triggered: false,
      reason: 'Confirmation timestamp not found in 1-minute bars',
    };
  }

  // Look for entry within allowed window after confirmation
  const maxBarsAfter = entry1m.maxBarsAfterConfirmation;
  const startIndex = confirmationIndex1m + 1;
  const endIndex = Math.min(startIndex + maxBarsAfter, bars1m.length);

  for (let i = startIndex; i < endIndex; i++) {
    const bar = bars1m[i];
    if (!bar) continue;

    // Check zone requirement if enabled
    if (entry1m.requireZoneEntry) {
      const inZone = checkBarInZones(bar, fvgZones, orderBlocks, direction);
      if (!inZone) {
        continue; // Skip bars not in zones
      }
    }

    // Check for entry signal based on direction
    const entryPrice = getEntryPrice(bar, direction);
    const hasSignal = checkEntrySignal(bar, bars1m[i - 1], direction);

    if (hasSignal && entryPrice > 0) {
      const barsAfter = i - confirmationIndex1m;
      return {
        triggered: true,
        entryPrice,
        timestamp: bar.timestamp,
        barIndex: i,
        direction,
        reason: `Entry triggered ${barsAfter} bar(s) after confirmation at ${entryPrice.toFixed(2)}`,
      };
    }
  }

  return {
    triggered: false,
    reason: `No entry signal within ${maxBarsAfter} bars after confirmation`,
  };
}

/**
 * Check if a bar is within zones appropriate for the trade direction.
 *
 * @param bar - Market bar to check
 * @param fvgZones - FVG zones
 * @param orderBlocks - Order blocks
 * @param direction - Trade direction
 * @returns True if bar is in appropriate zone
 */
function checkBarInZones(
  bar: MarketBar,
  fvgZones: FVGZone[],
  orderBlocks: OrderBlock[],
  direction: 'long' | 'short'
): boolean {
  // Check FVG zones
  const activeFVGs = fvgZones.filter((z) => !z.filled);
  for (const zone of activeFVGs) {
    // For long trades, look for bullish FVGs
    // For short trades, look for bearish FVGs
    if (
      (direction === 'long' && zone.type === 'bullish') ||
      (direction === 'short' && zone.type === 'bearish')
    ) {
      if (bar.low <= zone.high && bar.high >= zone.low) {
        return true;
      }
    }
  }

  // Check order blocks
  const activeBlocks = orderBlocks.filter((b) => !b.mitigated);
  for (const block of activeBlocks) {
    // For long trades, look for demand blocks
    // For short trades, look for supply blocks
    if (
      (direction === 'long' && block.type === 'demand') ||
      (direction === 'short' && block.type === 'supply')
    ) {
      if (bar.low <= block.high && bar.high >= block.low) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check for entry signal based on price action.
 *
 * @param currentBar - Current 1-minute bar
 * @param previousBar - Previous 1-minute bar
 * @param direction - Trade direction
 * @returns True if entry signal is present
 */
function checkEntrySignal(
  currentBar: MarketBar,
  previousBar: MarketBar | undefined,
  direction: 'long' | 'short'
): boolean {
  if (!previousBar) {
    return false;
  }

  if (direction === 'long') {
    // Bullish entry signals:
    // 1. Higher low than previous bar
    // 2. Close above previous high (breakout)
    // 3. Bullish bar (close > open)
    return (
      currentBar.low > previousBar.low &&
      currentBar.close > previousBar.high &&
      currentBar.close > currentBar.open
    );
  } else {
    // Bearish entry signals:
    // 1. Lower high than previous bar
    // 2. Close below previous low (breakdown)
    // 3. Bearish bar (close < open)
    return (
      currentBar.high < previousBar.high &&
      currentBar.close < previousBar.low &&
      currentBar.close < currentBar.open
    );
  }
}

/**
 * Determine entry price based on bar and direction.
 *
 * @param bar - Market bar
 * @param direction - Trade direction
 * @returns Entry price
 */
function getEntryPrice(bar: MarketBar, direction: 'long' | 'short'): number {
  if (direction === 'long') {
    // For long entries, use the higher of close or next bar's expected open
    // This simulates a market order at the close or a stop entry above
    return bar.close;
  } else {
    // For short entries, use the lower of close or next bar's expected open
    // This simulates a market order at the close or a stop entry below
    return bar.close;
  }
}

/**
 * Calculate optimal entry price within a zone.
 *
 * @param bar - Current bar
 * @param zones - Active zones (FVG or order blocks)
 * @param direction - Trade direction
 * @returns Optimal entry price within zone
 */
export function getOptimalEntryPrice(
  bar: MarketBar,
  zones: Array<FVGZone | OrderBlock>,
  direction: 'long' | 'short'
): number {
  if (zones.length === 0) {
    return getEntryPrice(bar, direction);
  }

  // Find the best zone level for entry
  const zoneLevels = zones.map((z) => ({
    high: z.high,
    low: z.low,
    mid: (z.high + z.low) / 2,
  }));

  if (direction === 'long') {
    // For longs, enter near the bottom of the zone for better R:R
    const lowestZone = zoneLevels.reduce((min, z) => (z.low < min.low ? z : min));
    return Math.max(bar.low, lowestZone.low);
  } else {
    // For shorts, enter near the top of the zone for better R:R
    const highestZone = zoneLevels.reduce((max, z) => (z.high > max.high ? z : max));
    return Math.min(bar.high, highestZone.high);
  }
}
