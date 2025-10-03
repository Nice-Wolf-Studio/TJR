/**
 * @fileoverview Position sizing calculations based on risk management.
 *
 * Calculates optimal position size based on account size, risk parameters,
 * and stop loss distance.
 *
 * @module @tjr/tjr-tools/execution/position-sizing
 */

import type { ExecutionConfig } from '../types.js';
import type { PriceLevels } from './price-levels.js';

/**
 * Calculate position size based on risk parameters.
 *
 * If account size is provided, calculates actual position size in units.
 * Otherwise returns a normalized value (1.0 for full position).
 *
 * @param levels - Price levels including entry and stop
 * @param config - Execution configuration
 * @returns Position size in units or normalized value
 */
export function calculatePositionSize(levels: PriceLevels, config: ExecutionConfig): number {
  const { maxRiskPerTrade, accountSize } = config.risk;

  // If no account size provided, return normalized position
  if (!accountSize || accountSize <= 0) {
    return 1.0;
  }

  // Calculate maximum dollar risk
  const maxRiskDollars = accountSize * maxRiskPerTrade;

  // Calculate risk per unit (share/contract)
  const riskPerUnit = levels.riskAmount;

  if (riskPerUnit <= 0) {
    return 0; // Invalid risk, no position
  }

  // Calculate position size
  const positionSize = Math.floor(maxRiskDollars / riskPerUnit);

  // Apply reasonable limits
  return Math.max(0, Math.min(positionSize, 10000));
}

/**
 * Calculate confidence level based on confluence score.
 *
 * Maps confluence scores to confidence levels for execution.
 *
 * @param confluenceScore - Confluence score (0-100)
 * @returns Confidence level
 */
export function calculateConfidence(confluenceScore: number): 'low' | 'medium' | 'high' {
  if (confluenceScore >= 80) {
    return 'high';
  } else if (confluenceScore >= 65) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * Adjust position size based on confidence level.
 *
 * Higher confidence = larger position size (within risk limits).
 * Lower confidence = smaller position size.
 *
 * @param baseSize - Base position size from risk calculation
 * @param confidence - Confidence level
 * @returns Adjusted position size
 */
export function adjustPositionByConfidence(
  baseSize: number,
  confidence: 'low' | 'medium' | 'high'
): number {
  const multipliers = {
    high: 1.0, // Full position
    medium: 0.75, // 75% of full position
    low: 0.5, // 50% of full position
  };

  return Math.floor(baseSize * multipliers[confidence]);
}

/**
 * Calculate expected trade duration based on timeframes.
 *
 * Estimates how long a trade might run based on the analysis timeframes.
 *
 * @param confirmation5m - Whether trade has 5m confirmation
 * @param entry1m - Whether trade has 1m entry
 * @returns Expected duration string
 */
export function calculateExpectedDuration(confirmation5m: boolean, entry1m: boolean): string {
  if (confirmation5m && entry1m) {
    // Both timeframes aligned, likely shorter-term trade
    return '15-60 minutes';
  } else if (confirmation5m) {
    // Only 5m confirmation, medium-term trade
    return '1-4 hours';
  } else {
    // No strong confirmation, unclear duration
    return 'Unknown';
  }
}

/**
 * Generate notes/reasoning for the execution.
 *
 * @param levels - Price levels
 * @param confidence - Confidence level
 * @param confluenceFactors - Active confluence factors
 * @returns Human-readable notes about the trade
 */
export function generateExecutionNotes(
  levels: PriceLevels,
  confidence: 'low' | 'medium' | 'high',
  confluenceFactors: string[]
): string {
  const riskRewardFormatted = levels.riskRewardRatio.toFixed(1);
  const factorsText =
    confluenceFactors.length > 0 ? confluenceFactors.join(', ') : 'No specific factors';

  return (
    `${confidence} confidence setup with ${riskRewardFormatted}:1 R:R. ` +
    `Active factors: ${factorsText}. ` +
    `Risk: ${((levels.riskAmount / levels.entry) * 100).toFixed(1)}% from entry.`
  );
}
