/**
 * @fileoverview Main risk calculator orchestrator.
 * @module @tjr/tjr-tools/risk/risk-calculator
 */

import type { RiskConfig } from './risk-config.js';
import type { TradeRecord } from './daily-stops.js';
import { calculatePositionSize, type PositionSizeResult } from './position-sizing.js';
import { calculateDailyStop, type DailyStopResult } from './daily-stops.js';
import { calculatePartialExits, type PartialExitLevel } from './partial-exits.js';

/**
 * Risk calculation input.
 */
export interface RiskCalculationInput {
  /** Symbol being analyzed */
  symbol: string;
  /** Entry price for the trade */
  entryPrice: number;
  /** Stop loss price */
  stopLoss: number;
  /** Take profit price (optional, used for R:R calculation) */
  takeProfit?: number;
  /** Trade direction */
  direction: 'long' | 'short';
  /** Current timestamp (ISO 8601 UTC) */
  currentTimestamp: string;
  /** Historical trade records (optional, for daily stops) */
  tradeHistory?: TradeRecord[];
  /** Dollar risk from currently open positions (optional) */
  openPositionRisk?: number;
}

/**
 * Complete risk management analysis result.
 */
export interface RiskManagementResult {
  /** Position sizing analysis */
  positionSize: {
    /** Number of shares/contracts to trade */
    shares: number;
    /** Dollar amount at risk */
    dollarRisk: number;
    /** Risk as percentage of account */
    percentRisk: number;
    /** Position sizing method used */
    method: 'fixed' | 'kelly';
    /** Position value at entry */
    positionValue: number;
    /** Position value as percentage of account */
    positionPercent: number;
  };

  /** Daily stop loss tracking */
  dailyStop: {
    /** Today's realized loss */
    currentLoss: number;
    /** Remaining risk capacity */
    remainingCapacity: number;
    /** Whether daily limit is reached */
    isLimitReached: boolean;
    /** Number of consecutive losses */
    consecutiveLosses: number;
    /** ISO 8601 timestamp when limit resets */
    resetTime: string;
  };

  /** Partial exit levels */
  partialExits: PartialExitLevel[];

  /** Risk-reward ratio (if take profit provided) */
  riskRewardRatio?: number;

  /** Overall recommendation */
  recommendation: {
    /** Whether this trade is recommended */
    canTrade: boolean;
    /** Confidence level */
    confidence: 'low' | 'medium' | 'high';
    /** Reasons for recommendation or rejection */
    reasons: string[];
  };

  /** Warnings about risk parameters or constraints */
  warnings: string[];
}

/**
 * Calculate complete risk management analysis.
 *
 * Orchestrates all risk calculations:
 * 1. Position sizing (fixed or Kelly Criterion)
 * 2. Daily stop tracking (loss limits)
 * 3. Partial exit levels (profit taking)
 * 4. Overall trade recommendation
 *
 * @param input - Risk calculation input
 * @param config - Risk configuration
 * @returns Complete risk management result
 *
 * @example
 * ```typescript
 * const result = calculateRisk({
 *   symbol: 'SPY',
 *   entryPrice: 450.00,
 *   stopLoss: 448.00,
 *   takeProfit: 456.00,
 *   direction: 'long',
 *   currentTimestamp: '2025-01-15T14:30:00Z',
 * }, config);
 *
 * console.log(`Position size: ${result.positionSize.shares} shares`);
 * console.log(`Dollar risk: $${result.positionSize.dollarRisk}`);
 * console.log(`Can trade: ${result.recommendation.canTrade}`);
 * ```
 */
export function calculateRisk(input: RiskCalculationInput, config: RiskConfig): RiskManagementResult {
  const warnings: string[] = [];

  // Validate input
  validateRiskInput(input);

  // Calculate position size
  const positionSizeResult = calculatePositionSize(input.entryPrice, input.stopLoss, config);
  warnings.push(...positionSizeResult.warnings);

  // Calculate position value
  const positionValue = positionSizeResult.shares * input.entryPrice;
  const positionPercent = (positionValue / config.account.balance) * 100;

  // Calculate daily stop state
  const tradeHistory = input.tradeHistory || [];
  const openRisk = input.openPositionRisk || 0;
  const dailyStopResult = calculateDailyStop(tradeHistory, input.currentTimestamp, config, openRisk);
  warnings.push(...dailyStopResult.warnings);

  // Calculate partial exits
  let partialExits: PartialExitLevel[] = [];
  if (positionSizeResult.shares > 0) {
    try {
      partialExits = calculatePartialExits(
        input.entryPrice,
        input.stopLoss,
        input.direction,
        positionSizeResult.shares,
        config
      );
    } catch (error) {
      warnings.push(`Partial exits calculation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Calculate risk-reward ratio if take profit provided
  let riskRewardRatio: number | undefined;
  if (input.takeProfit !== undefined) {
    const risk = Math.abs(input.entryPrice - input.stopLoss);
    const reward = Math.abs(input.takeProfit - input.entryPrice);
    riskRewardRatio = risk > 0 ? reward / risk : 0;

    // Validate direction consistency
    if (input.direction === 'long' && input.takeProfit <= input.entryPrice) {
      warnings.push('Take profit should be above entry price for long trades');
    }
    if (input.direction === 'short' && input.takeProfit >= input.entryPrice) {
      warnings.push('Take profit should be below entry price for short trades');
    }
  }

  // Generate trade recommendation
  const recommendation = generateRecommendation(
    positionSizeResult,
    dailyStopResult,
    riskRewardRatio,
    config
  );

  return {
    positionSize: {
      shares: positionSizeResult.shares,
      dollarRisk: positionSizeResult.dollarRisk,
      percentRisk: positionSizeResult.percentRisk,
      method: positionSizeResult.method,
      positionValue,
      positionPercent,
    },
    dailyStop: {
      currentLoss: dailyStopResult.realizedLoss,
      remainingCapacity: dailyStopResult.remainingCapacity,
      isLimitReached: dailyStopResult.isLimitReached,
      consecutiveLosses: dailyStopResult.consecutiveLosses,
      resetTime: dailyStopResult.resetTime,
    },
    partialExits,
    riskRewardRatio,
    recommendation,
    warnings,
  };
}

/**
 * Validate risk calculation input.
 *
 * @param input - Input to validate
 * @throws Error if input is invalid
 */
function validateRiskInput(input: RiskCalculationInput): void {
  if (!input.symbol || typeof input.symbol !== 'string') {
    throw new Error('Symbol is required');
  }

  if (typeof input.entryPrice !== 'number' || input.entryPrice <= 0) {
    throw new Error('Entry price must be a positive number');
  }

  if (typeof input.stopLoss !== 'number' || input.stopLoss <= 0) {
    throw new Error('Stop loss must be a positive number');
  }

  if (input.entryPrice === input.stopLoss) {
    throw new Error('Entry price and stop loss cannot be equal');
  }

  if (!['long', 'short'].includes(input.direction)) {
    throw new Error('Direction must be "long" or "short"');
  }

  // Validate direction consistency
  if (input.direction === 'long' && input.stopLoss >= input.entryPrice) {
    throw new Error('For long trades, stop loss must be below entry price');
  }

  if (input.direction === 'short' && input.stopLoss <= input.entryPrice) {
    throw new Error('For short trades, stop loss must be above entry price');
  }

  if (!input.currentTimestamp || typeof input.currentTimestamp !== 'string') {
    throw new Error('Current timestamp is required');
  }

  const timestamp = new Date(input.currentTimestamp);
  if (isNaN(timestamp.getTime())) {
    throw new Error('Invalid timestamp format');
  }

  if (input.openPositionRisk !== undefined && input.openPositionRisk < 0) {
    throw new Error('Open position risk cannot be negative');
  }

  if (input.takeProfit !== undefined && input.takeProfit <= 0) {
    throw new Error('Take profit must be positive');
  }
}

/**
 * Generate trade recommendation.
 *
 * Evaluates multiple factors to determine if trade should be taken:
 * - Position size viability
 * - Daily loss limits
 * - Risk-reward ratio
 * - Overall risk profile
 *
 * @param positionSize - Position size result
 * @param dailyStop - Daily stop result
 * @param riskRewardRatio - Risk-reward ratio (optional)
 * @param config - Risk configuration
 * @returns Trade recommendation
 */
function generateRecommendation(
  positionSize: PositionSizeResult,
  dailyStop: DailyStopResult,
  riskRewardRatio: number | undefined,
  config: RiskConfig
): RiskManagementResult['recommendation'] {
  const reasons: string[] = [];
  let canTrade = true;
  let confidence: 'low' | 'medium' | 'high' = 'medium';

  // Check if position size is viable
  if (positionSize.shares < config.constraints.minPositionSize) {
    canTrade = false;
    reasons.push(`Position size (${positionSize.shares}) below minimum (${config.constraints.minPositionSize})`);
  }

  if (positionSize.shares === 0) {
    canTrade = false;
    reasons.push('Position size is zero - trade not viable');
  }

  // Check daily stop limits
  if (dailyStop.isLimitReached) {
    canTrade = false;
    reasons.push('Daily loss limit reached');
  }

  // Check if new trade risk fits within remaining capacity
  if (positionSize.dollarRisk > dailyStop.remainingCapacity) {
    canTrade = false;
    reasons.push(
      `Trade risk ($${positionSize.dollarRisk.toFixed(2)}) exceeds remaining daily capacity ($${dailyStop.remainingCapacity.toFixed(2)})`
    );
  }

  // Evaluate risk-reward ratio
  if (riskRewardRatio !== undefined) {
    if (riskRewardRatio < 1.0) {
      confidence = 'low';
      reasons.push(`Risk-reward ratio (${riskRewardRatio.toFixed(2)}) is less than 1:1`);
    } else if (riskRewardRatio >= 2.0) {
      // Good R:R boosts confidence
      if (confidence === 'medium') {
        confidence = 'high';
      }
      reasons.push(`Favorable risk-reward ratio: ${riskRewardRatio.toFixed(2)}:1`);
    } else {
      reasons.push(`Risk-reward ratio: ${riskRewardRatio.toFixed(2)}:1`);
    }
  }

  // Check consecutive losses
  if (dailyStop.consecutiveLosses >= 3) {
    confidence = 'low';
    reasons.push(`${dailyStop.consecutiveLosses} consecutive losses - consider reducing risk`);
  }

  // Check daily capacity usage
  const capacityUsed =
    ((config.account.balance * (config.dailyLimits.maxLossPercent / 100) - dailyStop.remainingCapacity) /
      (config.account.balance * (config.dailyLimits.maxLossPercent / 100))) *
    100;

  if (capacityUsed > 50 && capacityUsed < 80) {
    confidence = 'low';
    reasons.push(`${capacityUsed.toFixed(0)}% of daily risk capacity used`);
  }

  // Position sizing method feedback
  if (positionSize.method === 'kelly') {
    reasons.push('Using Kelly Criterion position sizing');
  } else {
    reasons.push('Using fixed percentage position sizing');
  }

  // Add positive confirmation if trade can proceed
  if (canTrade) {
    reasons.push(`Trade approved: ${positionSize.shares} shares at $${positionSize.dollarRisk.toFixed(2)} risk`);
  }

  return {
    canTrade,
    confidence,
    reasons,
  };
}