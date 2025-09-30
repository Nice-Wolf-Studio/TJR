/**
 * @fileoverview Position sizing calculator with Kelly Criterion support.
 * @module @tjr/tjr-tools/risk/position-sizing
 */

import type { RiskConfig } from './risk-config.js';

/**
 * Position size calculation result.
 */
export interface PositionSizeResult {
  /** Number of shares/contracts to trade */
  shares: number;
  /** Dollar amount at risk */
  dollarRisk: number;
  /** Risk as percentage of account */
  percentRisk: number;
  /** Position sizing method used */
  method: 'fixed' | 'kelly';
  /** Warnings about constraints or edge cases */
  warnings: string[];
}

/**
 * Calculate position size based on risk parameters.
 *
 * Uses either fixed percentage or Kelly Criterion method depending on configuration.
 * Automatically applies safety constraints and handles edge cases.
 *
 * Algorithm:
 * - Fixed: positionSize = (balance * riskPercent) / stopDistance
 * - Kelly: positionSize = (balance * riskPercent * kellyFraction) / stopDistance
 *   where kellyFraction = min(winRate * avgWin / avgLoss - lossRate, maxKelly)
 *
 * @param entryPrice - Intended entry price for the trade
 * @param stopLoss - Stop loss price
 * @param config - Risk configuration
 * @returns Position size calculation result
 *
 * @invariant result.shares >= 0
 * @invariant result.dollarRisk <= balance * maxRiskPercent
 * @invariant result.percentRisk <= maxRiskPercent
 *
 * @example
 * ```typescript
 * const result = calculatePositionSize(100, 98, config);
 * // entry: $100, stop: $98, risk per share: $2
 * // With 1% risk on $10,000 account: $100 risk / $2 = 50 shares
 * ```
 */
export function calculatePositionSize(
  entryPrice: number,
  stopLoss: number,
  config: RiskConfig
): PositionSizeResult {
  const warnings: string[] = [];

  // Validate inputs
  if (entryPrice <= 0) {
    throw new Error('Entry price must be positive');
  }
  if (stopLoss <= 0) {
    throw new Error('Stop loss must be positive');
  }

  const balance = config.account.balance;
  const maxRiskPercent = config.perTrade.maxRiskPercent / 100; // Convert to decimal

  // Calculate stop loss distance (risk per share)
  const stopDistance = Math.abs(entryPrice - stopLoss);

  if (stopDistance === 0) {
    return {
      shares: 0,
      dollarRisk: 0,
      percentRisk: 0,
      method: 'fixed',
      warnings: ['Stop distance is zero, cannot calculate position size'],
    };
  }

  // Calculate maximum dollar risk
  let maxDollarRisk = balance * maxRiskPercent;

  // Apply absolute risk limit if specified
  if (config.perTrade.maxRiskAmount !== undefined) {
    maxDollarRisk = Math.min(maxDollarRisk, config.perTrade.maxRiskAmount);
    if (config.perTrade.maxRiskAmount < balance * maxRiskPercent) {
      warnings.push('Absolute risk limit is more restrictive than percentage limit');
    }
  }

  // Calculate base position size
  let positionSize: number;
  let method: 'fixed' | 'kelly' = 'fixed';

  if (config.perTrade.useKelly && canUseKelly(config)) {
    // Kelly Criterion position sizing
    const kellyFraction = calculateKellyFraction(config);
    const kellyAdjustedRisk = maxDollarRisk * kellyFraction;
    positionSize = kellyAdjustedRisk / stopDistance;
    method = 'kelly';
    warnings.push(`Using Kelly Criterion with fraction ${kellyFraction.toFixed(4)}`);
  } else {
    // Fixed percentage position sizing
    positionSize = maxDollarRisk / stopDistance;
    if (config.perTrade.useKelly && !canUseKelly(config)) {
      warnings.push('Kelly Criterion requested but insufficient data, using fixed percentage');
    }
  }

  // Apply position size constraints
  positionSize = applyConstraints(positionSize, entryPrice, balance, config, warnings);

  // Calculate actual dollar risk and percentage
  const actualDollarRisk = positionSize * stopDistance;
  const actualPercentRisk = (actualDollarRisk / balance) * 100;

  // Final validation
  if (positionSize < config.constraints.minPositionSize) {
    warnings.push(`Position size ${positionSize} below minimum ${config.constraints.minPositionSize}`);
    if (config.constraints.minPositionSize > 0) {
      warnings.push('Trade may not be viable with current risk parameters');
    }
  }

  return {
    shares: Math.max(0, positionSize),
    dollarRisk: actualDollarRisk,
    percentRisk: actualPercentRisk,
    method,
    warnings,
  };
}

/**
 * Check if Kelly Criterion can be used.
 *
 * Requires win rate, average win, and average loss to be provided.
 *
 * @param config - Risk configuration
 * @returns True if Kelly Criterion can be used
 */
function canUseKelly(config: RiskConfig): boolean {
  return (
    config.perTrade.winRate !== undefined &&
    config.perTrade.avgWin !== undefined &&
    config.perTrade.avgLoss !== undefined &&
    config.perTrade.winRate > 0 &&
    config.perTrade.avgWin > 0 &&
    config.perTrade.avgLoss > 0
  );
}

/**
 * Calculate Kelly Criterion fraction.
 *
 * Formula: f* = (p * b - q) / b
 * where:
 *   p = win rate
 *   q = loss rate (1 - p)
 *   b = avgWin / avgLoss (win/loss ratio)
 *   f* = optimal fraction of capital to risk
 *
 * Applied with safety factor (kellyFraction) to reduce risk of ruin.
 *
 * @param config - Risk configuration
 * @returns Kelly fraction (0-1)
 */
function calculateKellyFraction(config: RiskConfig): number {
  const p = config.perTrade.winRate!;
  const q = 1 - p;
  const b = config.perTrade.avgWin! / config.perTrade.avgLoss!;

  // Kelly formula
  let kellyOptimal = (p * b - q) / b;

  // Ensure non-negative
  kellyOptimal = Math.max(0, kellyOptimal);

  // Apply safety factor (default 0.25 = quarter Kelly)
  const safetyFactor = config.perTrade.kellyFraction || 0.25;
  const kellyFraction = kellyOptimal * safetyFactor;

  // Cap at 0.25 to prevent over-betting (even with safety factor)
  const MAX_KELLY = 0.25;
  return Math.min(kellyFraction, MAX_KELLY);
}

/**
 * Apply position size constraints.
 *
 * - Respect minimum position size
 * - Respect maximum position as percentage of account
 * - Round to lot sizes if configured
 * - Ensure position value doesn't exceed account balance
 *
 * @param positionSize - Calculated position size
 * @param entryPrice - Entry price
 * @param balance - Account balance
 * @param config - Risk configuration
 * @param warnings - Array to append warnings to
 * @returns Constrained position size
 */
function applyConstraints(
  positionSize: number,
  entryPrice: number,
  balance: number,
  config: RiskConfig,
  warnings: string[]
): number {
  let constrained = positionSize;

  // Apply maximum position value constraint
  const maxPositionValue = balance * (config.constraints.maxPositionPercent / 100);
  const maxShares = maxPositionValue / entryPrice;

  if (constrained > maxShares) {
    constrained = maxShares;
    warnings.push(`Position size limited by max position percentage (${config.constraints.maxPositionPercent}%)`);
  }

  // Ensure we don't exceed account balance
  const totalCost = constrained * entryPrice;
  if (totalCost > balance) {
    constrained = Math.floor(balance / entryPrice);
    warnings.push('Position size limited by account balance');
  }

  // Round to lot sizes
  if (config.constraints.roundLots && config.constraints.lotSize) {
    const lotSize = config.constraints.lotSize;
    constrained = Math.floor(constrained / lotSize) * lotSize;
  } else {
    // Round to whole shares
    constrained = Math.floor(constrained);
  }

  // Apply minimum constraint
  if (constrained < config.constraints.minPositionSize) {
    if (constrained > 0) {
      warnings.push(`Position size ${constrained} below minimum ${config.constraints.minPositionSize}`);
    }
    // Don't force minimum - let caller decide
  }

  return Math.max(0, constrained);
}

/**
 * Calculate risk-reward ratio for a position.
 *
 * Helper function to determine if a trade meets minimum R:R requirements.
 *
 * @param entryPrice - Entry price
 * @param stopLoss - Stop loss price
 * @param takeProfit - Take profit price
 * @returns Risk-reward ratio (profit potential / risk)
 *
 * @example
 * ```typescript
 * const rr = calculateRiskRewardRatio(100, 98, 106);
 * // Risk: $2, Reward: $6, R:R = 3.0
 * ```
 */
export function calculateRiskRewardRatio(
  entryPrice: number,
  stopLoss: number,
  takeProfit: number
): number {
  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(takeProfit - entryPrice);

  if (risk === 0) {
    return 0;
  }

  return reward / risk;
}