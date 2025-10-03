/**
 * @fileoverview 5-minute timeframe confirmation logic.
 *
 * Implements confirmation criteria based on confluence scores and required factors.
 * The 5-minute timeframe provides the initial setup confirmation before looking
 * for a 1-minute entry trigger.
 *
 * @module @tjr/tjr-tools/execution/confirmation
 */

import type { MarketBar, TJRConfluence } from '@tjr/contracts';
import type { ExecutionConfig, ConfirmationResult, FVGZone, OrderBlock } from '../types.js';

/**
 * Check for 5-minute confirmation based on confluence and configuration.
 *
 * Scans recent bars looking for confluence that meets the confirmation criteria.
 * Returns the first bar (most recent) that meets all requirements.
 *
 * @param bars - Market bars (5-minute timeframe)
 * @param confluence - Current confluence analysis
 * @param fvgZones - Detected FVG zones
 * @param orderBlocks - Detected order blocks
 * @param config - Execution configuration
 * @returns Confirmation result with timestamp and reasoning
 */
export function checkConfirmation(
  bars: MarketBar[],
  confluence: TJRConfluence,
  fvgZones: FVGZone[],
  orderBlocks: OrderBlock[],
  config: ExecutionConfig
): ConfirmationResult {
  const { confirmation5m } = config;
  const lookback = confirmation5m.lookbackBars || 20;

  // Check basic score threshold
  if (confluence.score < confirmation5m.minConfluenceScore) {
    return {
      confirmed: false,
      reason: `Confluence score ${confluence.score} below minimum ${confirmation5m.minConfluenceScore}`,
    };
  }

  // Check required factors if specified
  if (confirmation5m.requiredFactors && confirmation5m.requiredFactors.length > 0) {
    const presentFactors = confluence.factors.filter((f) => f.value > 0).map((f) => f.name);

    const missingFactors = confirmation5m.requiredFactors.filter(
      (required) => !presentFactors.includes(required)
    );

    if (missingFactors.length > 0) {
      return {
        confirmed: false,
        reason: `Missing required factors: ${missingFactors.join(', ')}`,
      };
    }
  }

  // Look for confirmation within lookback period
  const startIndex = Math.max(0, bars.length - lookback);

  for (let i = bars.length - 1; i >= startIndex; i--) {
    const bar = bars[i];
    if (!bar) continue;

    // Check if this bar aligns with any active zones
    const hasActiveZone = checkBarInZones(bar, i, fvgZones, orderBlocks);

    if (hasActiveZone) {
      // Found confirmation
      const factorSummary = confluence.factors
        .filter((f) => f.value > 0)
        .map((f) => `${f.name}(${(f.value * 100).toFixed(0)}%)`)
        .join(', ');

      return {
        confirmed: true,
        timestamp: bar.timestamp,
        barIndex: i,
        confluenceScore: confluence.score,
        reason: `Confirmation at score ${confluence.score} with factors: ${factorSummary}`,
      };
    }
  }

  return {
    confirmed: false,
    reason: `No confirmation found within ${lookback} bars despite score ${confluence.score}`,
  };
}

/**
 * Check if a bar intersects with active FVG zones or order blocks.
 *
 * @param bar - Market bar to check
 * @param barIndex - Index of the bar
 * @param fvgZones - FVG zones to check against
 * @param orderBlocks - Order blocks to check against
 * @returns True if bar is within any active zone
 */
function checkBarInZones(
  bar: MarketBar,
  barIndex: number,
  fvgZones: FVGZone[],
  orderBlocks: OrderBlock[]
): boolean {
  // Check FVG zones
  const activeFVGs = fvgZones.filter((z) => !z.filled && z.startIndex <= barIndex);
  for (const zone of activeFVGs) {
    // Check if bar price range overlaps with zone
    if (bar.low <= zone.high && bar.high >= zone.low) {
      return true;
    }
  }

  // Check order blocks
  const activeBlocks = orderBlocks.filter((b) => !b.mitigated && b.index <= barIndex);
  for (const block of activeBlocks) {
    // Check if bar price range overlaps with block
    if (bar.low <= block.high && bar.high >= block.low) {
      return true;
    }
  }

  return false;
}

/**
 * Determine trade direction based on zones and price action.
 *
 * @param bars - Market bars
 * @param confirmationIndex - Bar index where confirmation occurred
 * @param fvgZones - FVG zones
 * @param orderBlocks - Order blocks
 * @returns Trade direction or null if unclear
 */
export function determineDirection(
  bars: MarketBar[],
  confirmationIndex: number,
  fvgZones: FVGZone[],
  orderBlocks: OrderBlock[]
): 'long' | 'short' | null {
  const bar = bars[confirmationIndex];
  if (!bar) return null;

  let bullishSignals = 0;
  let bearishSignals = 0;

  // Check FVG direction bias
  const relevantFVGs = fvgZones.filter((z) => !z.filled && z.startIndex <= confirmationIndex);
  for (const zone of relevantFVGs) {
    if (zone.type === 'bullish') bullishSignals++;
    if (zone.type === 'bearish') bearishSignals++;
  }

  // Check order block direction bias
  const relevantBlocks = orderBlocks.filter((b) => !b.mitigated && b.index <= confirmationIndex);
  for (const block of relevantBlocks) {
    if (block.type === 'demand') bullishSignals++;
    if (block.type === 'supply') bearishSignals++;
  }

  // Price action bias - check recent trend
  if (confirmationIndex >= 3) {
    const prev = bars[confirmationIndex - 3];
    if (prev && bar.close > prev.close * 1.001) {
      bullishSignals++; // Upward momentum
    } else if (prev && bar.close < prev.close * 0.999) {
      bearishSignals++; // Downward momentum
    }
  }

  // Determine direction based on signal balance
  if (bullishSignals > bearishSignals) {
    return 'long';
  } else if (bearishSignals > bullishSignals) {
    return 'short';
  }

  // If tied, use most recent zone direction
  const mostRecentZone = [...relevantFVGs, ...relevantBlocks].sort((a, b) => {
    const aIndex = 'startIndex' in a ? a.startIndex : a.index;
    const bIndex = 'startIndex' in b ? b.startIndex : b.index;
    return bIndex - aIndex;
  })[0];

  if (mostRecentZone) {
    if ('type' in mostRecentZone) {
      return mostRecentZone.type === 'bullish' || mostRecentZone.type === 'demand'
        ? 'long'
        : 'short';
    }
  }

  return null;
}
