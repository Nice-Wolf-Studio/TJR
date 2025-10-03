/**
 * @fileoverview Partial exit level calculator.
 * @module @tjr/tjr-tools/risk/partial-exits
 */

import type { RiskConfig } from './risk-config.js';

/**
 * Partial exit level.
 */
export interface PartialExitLevel {
  /** Exit price level */
  price: number;
  /** Number of shares/contracts to exit */
  quantity: number;
  /** Risk multiple (e.g., 1.0 = 1R, 2.0 = 2R) */
  rMultiple: number;
  /** Cumulative exit percentage up to this level */
  cumulative: number;
  /** Description/reason for this exit */
  description: string;
}

/**
 * Calculate partial exit levels.
 *
 * Generates exit prices based on configured strategy:
 * - R-multiple: Exit at 1R, 2R, 3R, etc. (risk-based)
 * - Percentage: Exit at fixed percentage gains
 * - Fibonacci: Exit at Fibonacci extension levels
 * - Custom: User-defined exit levels
 *
 * @param entryPrice - Trade entry price
 * @param stopLoss - Stop loss price
 * @param direction - Trade direction ('long' or 'short')
 * @param positionSize - Total position size (shares/contracts)
 * @param config - Risk configuration
 * @returns Array of partial exit levels
 *
 * @invariant Total exit quantities equal position size
 * @invariant Exit prices progress in direction of profit
 * @invariant Cumulative percentages progress from 0 to 100
 *
 * @example
 * ```typescript
 * // Long trade: entry $100, stop $98, risk = $2 per share
 * const exits = calculatePartialExits(100, 98, 'long', 100, config);
 * // 1R exit at $102 (33% = 33 shares)
 * // 2R exit at $104 (33% = 33 shares)
 * // 3R exit at $106 (34% = 34 shares)
 * ```
 */
export function calculatePartialExits(
  entryPrice: number,
  stopLoss: number,
  direction: 'long' | 'short',
  positionSize: number,
  config: RiskConfig
): PartialExitLevel[] {
  // Validate inputs
  if (entryPrice <= 0 || stopLoss <= 0) {
    throw new Error('Entry price and stop loss must be positive');
  }

  if (entryPrice === stopLoss) {
    throw new Error('Entry price and stop loss cannot be equal');
  }

  if (positionSize <= 0) {
    throw new Error('Position size must be positive');
  }

  if (!['long', 'short'].includes(direction)) {
    throw new Error('Direction must be "long" or "short"');
  }

  // Calculate risk distance (1R)
  const riskDistance = Math.abs(entryPrice - stopLoss);

  // Validate direction consistency
  if (direction === 'long' && stopLoss >= entryPrice) {
    throw new Error('For long trades, stop loss must be below entry price');
  }
  if (direction === 'short' && stopLoss <= entryPrice) {
    throw new Error('For short trades, stop loss must be above entry price');
  }

  // Generate exits based on strategy
  const strategy = config.partialExits.strategy;
  let exits: PartialExitLevel[] = [];

  switch (strategy) {
    case 'r-multiple':
      exits = calculateRMultipleExits(entryPrice, riskDistance, direction, positionSize, config);
      break;
    case 'percentage':
      exits = calculatePercentageExits(entryPrice, direction, positionSize, config);
      break;
    case 'fibonacci':
      exits = calculateFibonacciExits(entryPrice, riskDistance, direction, positionSize, config);
      break;
    case 'custom':
      exits = calculateCustomExits(entryPrice, riskDistance, direction, positionSize, config);
      break;
    default:
      throw new Error(`Unknown partial exit strategy: ${strategy}`);
  }

  // Validate total quantities
  const totalQuantity = exits.reduce((sum, exit) => sum + exit.quantity, 0);
  if (Math.abs(totalQuantity - positionSize) > 0.01) {
    // Allow small rounding differences
    throw new Error(
      `Exit quantities (${totalQuantity}) do not equal position size (${positionSize})`
    );
  }

  // Sort exits by price (ascending for longs, descending for shorts)
  exits.sort((a, b) => {
    return direction === 'long' ? a.price - b.price : b.price - a.price;
  });

  // Calculate cumulative percentages
  let cumulative = 0;
  for (const exit of exits) {
    const percentage = (exit.quantity / positionSize) * 100;
    cumulative += percentage;
    exit.cumulative = Math.round(cumulative * 100) / 100; // Round to 2 decimal places
  }

  return exits;
}

/**
 * Calculate R-multiple based exits.
 *
 * Exit at 1R, 2R, 3R, etc. where R = initial risk distance.
 *
 * @param entryPrice - Entry price
 * @param riskDistance - Risk distance (1R)
 * @param direction - Trade direction
 * @param positionSize - Position size
 * @param config - Risk configuration
 * @returns Partial exit levels
 */
function calculateRMultipleExits(
  entryPrice: number,
  riskDistance: number,
  direction: 'long' | 'short',
  positionSize: number,
  config: RiskConfig
): PartialExitLevel[] {
  const exits: PartialExitLevel[] = [];
  const levels = config.partialExits.levels;

  for (const level of levels) {
    const rMultiple = level.trigger;
    const exitPercent = level.exitPercent;

    // Calculate exit price
    let exitPrice: number;
    if (direction === 'long') {
      exitPrice = entryPrice + rMultiple * riskDistance;
    } else {
      exitPrice = entryPrice - rMultiple * riskDistance;
    }

    // Calculate quantity to exit
    const quantity = Math.floor((positionSize * exitPercent) / 100);

    exits.push({
      price: exitPrice,
      quantity,
      rMultiple,
      cumulative: 0, // Will be calculated later
      description: `Exit ${exitPercent}% at ${rMultiple}R`,
    });
  }

  // Adjust last exit to account for rounding
  if (exits.length > 0) {
    const totalAllocated = exits.slice(0, -1).reduce((sum, exit) => sum + exit.quantity, 0);
    const lastExit = exits[exits.length - 1];
    if (lastExit) {
      lastExit.quantity = positionSize - totalAllocated;
    }
  }

  return exits;
}

/**
 * Calculate percentage-based exits.
 *
 * Exit at fixed percentage gains (e.g., 2%, 5%, 10%).
 *
 * @param entryPrice - Entry price
 * @param direction - Trade direction
 * @param positionSize - Position size
 * @param config - Risk configuration
 * @returns Partial exit levels
 */
function calculatePercentageExits(
  entryPrice: number,
  direction: 'long' | 'short',
  positionSize: number,
  config: RiskConfig
): PartialExitLevel[] {
  const exits: PartialExitLevel[] = [];
  const levels = config.partialExits.levels;

  for (const level of levels) {
    const percentGain = level.trigger; // Interpreted as percentage gain
    const exitPercent = level.exitPercent;

    // Calculate exit price
    let exitPrice: number;
    if (direction === 'long') {
      exitPrice = entryPrice * (1 + percentGain / 100);
    } else {
      exitPrice = entryPrice * (1 - percentGain / 100);
    }

    // Calculate quantity
    const quantity = Math.floor((positionSize * exitPercent) / 100);

    // Calculate R-multiple (for display purposes)
    const rMultiple = percentGain / 100;

    exits.push({
      price: exitPrice,
      quantity,
      rMultiple,
      cumulative: 0,
      description: `Exit ${exitPercent}% at ${percentGain}% gain`,
    });
  }

  // Adjust last exit for rounding
  if (exits.length > 0) {
    const totalAllocated = exits.slice(0, -1).reduce((sum, exit) => sum + exit.quantity, 0);
    const lastExit = exits[exits.length - 1];
    if (lastExit) {
      lastExit.quantity = positionSize - totalAllocated;
    }
  }

  return exits;
}

/**
 * Calculate Fibonacci extension based exits.
 *
 * Exit at Fibonacci levels: 1.272, 1.618, 2.618, etc.
 * Levels are multiples of the risk distance.
 *
 * @param entryPrice - Entry price
 * @param riskDistance - Risk distance
 * @param direction - Trade direction
 * @param positionSize - Position size
 * @param config - Risk configuration
 * @returns Partial exit levels
 */
function calculateFibonacciExits(
  entryPrice: number,
  riskDistance: number,
  direction: 'long' | 'short',
  positionSize: number,
  config: RiskConfig
): PartialExitLevel[] {
  // Fibonacci extension ratios
  const FIB_RATIOS = [1.272, 1.618, 2.618, 4.236];

  const exits: PartialExitLevel[] = [];
  const levels = config.partialExits.levels;

  // Use configured exit percentages with Fibonacci price levels
  for (let i = 0; i < Math.min(levels.length, FIB_RATIOS.length); i++) {
    const fibRatio = FIB_RATIOS[i];
    const exitPercent = levels[i]?.exitPercent;

    if (!fibRatio || !exitPercent) {
      continue;
    }

    // Calculate exit price using Fibonacci ratio
    let exitPrice: number;
    if (direction === 'long') {
      exitPrice = entryPrice + fibRatio * riskDistance;
    } else {
      exitPrice = entryPrice - fibRatio * riskDistance;
    }

    const quantity = Math.floor((positionSize * exitPercent) / 100);

    exits.push({
      price: exitPrice,
      quantity,
      rMultiple: fibRatio,
      cumulative: 0,
      description: `Exit ${exitPercent}% at Fib ${fibRatio.toFixed(3)}`,
    });
  }

  // Adjust last exit for rounding
  if (exits.length > 0) {
    const totalAllocated = exits.slice(0, -1).reduce((sum, exit) => sum + exit.quantity, 0);
    const lastExit = exits[exits.length - 1];
    if (lastExit) {
      lastExit.quantity = positionSize - totalAllocated;
    }
  }

  return exits;
}

/**
 * Calculate custom exits.
 *
 * User defines both price levels (as R-multiples) and exit percentages.
 *
 * @param entryPrice - Entry price
 * @param riskDistance - Risk distance
 * @param direction - Trade direction
 * @param positionSize - Position size
 * @param config - Risk configuration
 * @returns Partial exit levels
 */
function calculateCustomExits(
  entryPrice: number,
  riskDistance: number,
  direction: 'long' | 'short',
  positionSize: number,
  config: RiskConfig
): PartialExitLevel[] {
  // For custom strategy, use the trigger as R-multiple
  // This is essentially the same as R-multiple strategy but allows
  // arbitrary trigger values
  return calculateRMultipleExits(entryPrice, riskDistance, direction, positionSize, config);
}

/**
 * Calculate trailing stop price.
 *
 * Helper function to determine when to activate and where to place a trailing stop.
 *
 * @param entryPrice - Entry price
 * @param stopLoss - Initial stop loss
 * @param currentPrice - Current market price
 * @param direction - Trade direction
 * @param config - Risk configuration
 * @returns Trailing stop price or null if not yet activated
 */
export function calculateTrailingStop(
  entryPrice: number,
  stopLoss: number,
  currentPrice: number,
  direction: 'long' | 'short',
  config: RiskConfig
): number | null {
  const trailConfig = config.partialExits.trailStop;
  if (!trailConfig) {
    return null;
  }

  const riskDistance = Math.abs(entryPrice - stopLoss);
  const activationLevel = trailConfig.activate;
  const trailDistance = trailConfig.distance * riskDistance;

  // Check if trailing stop should be activated
  if (direction === 'long') {
    const activationPrice = entryPrice + activationLevel * riskDistance;
    if (currentPrice >= activationPrice) {
      // Trailing stop is active, place it below current price
      return currentPrice - trailDistance;
    }
  } else {
    const activationPrice = entryPrice - activationLevel * riskDistance;
    if (currentPrice <= activationPrice) {
      // Trailing stop is active, place it above current price
      return currentPrice + trailDistance;
    }
  }

  return null;
}
