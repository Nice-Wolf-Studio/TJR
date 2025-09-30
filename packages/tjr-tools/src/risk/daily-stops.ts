/**
 * @fileoverview Daily stop loss tracking and enforcement.
 * @module @tjr/tjr-tools/risk/daily-stops
 */

import type { RiskConfig } from './risk-config.js';

/**
 * Trade record for daily stop calculations.
 */
export interface TradeRecord {
  /** ISO 8601 timestamp when trade was closed */
  timestamp: string;
  /** Realized profit/loss (negative for losses) */
  pnl: number;
  /** Trading fees paid */
  fees?: number;
  /** Trade ID for reference */
  id?: string;
}

/**
 * Daily stop state result.
 */
export interface DailyStopResult {
  /** Trading date in YYYY-MM-DD format (account timezone) */
  date: string;
  /** Cumulative realized loss for the day */
  realizedLoss: number;
  /** Risk from currently open positions */
  openRisk: number;
  /** Remaining risk capacity for new trades */
  remainingCapacity: number;
  /** Whether daily loss limit has been reached */
  isLimitReached: boolean;
  /** Number of consecutive losses */
  consecutiveLosses: number;
  /** ISO 8601 timestamp when limit resets (start of next day) */
  resetTime: string;
  /** Warnings about approaching or exceeding limits */
  warnings: string[];
}

/**
 * Calculate daily stop state.
 *
 * Determines current daily loss, remaining capacity, and whether new trades are allowed.
 * Uses timestamp-based calculations for determinism and testability.
 *
 * Algorithm:
 * 1. Convert current timestamp to date in account timezone
 * 2. Filter trades to those occurring on the same date
 * 3. Sum losses (and fees if configured)
 * 4. Compare against daily loss limit
 * 5. Calculate remaining capacity
 *
 * @param trades - Historical trade records (can include multiple days)
 * @param currentTimestamp - Current time (ISO 8601 UTC)
 * @param config - Risk configuration
 * @param openPositionRisk - Dollar risk from currently open positions (default: 0)
 * @returns Daily stop state
 *
 * @invariant result.realizedLoss >= 0 (always non-negative)
 * @invariant result.remainingCapacity >= 0
 * @invariant result.isLimitReached === (remainingCapacity <= 0)
 *
 * @example
 * ```typescript
 * const trades = [
 *   { timestamp: '2025-01-15T14:30:00Z', pnl: -100, fees: 2 },
 *   { timestamp: '2025-01-15T15:45:00Z', pnl: -50, fees: 1 },
 * ];
 * const result = calculateDailyStop(trades, '2025-01-15T16:00:00Z', config);
 * // result.realizedLoss = 153 (100 + 50 + 2 + 1)
 * ```
 */
export function calculateDailyStop(
  trades: TradeRecord[],
  currentTimestamp: string,
  config: RiskConfig,
  openPositionRisk: number = 0
): DailyStopResult {
  const warnings: string[] = [];

  // Validate inputs
  if (!Array.isArray(trades)) {
    throw new Error('Trades must be an array');
  }

  if (!currentTimestamp || typeof currentTimestamp !== 'string') {
    throw new Error('Current timestamp is required');
  }

  if (openPositionRisk < 0) {
    throw new Error('Open position risk cannot be negative');
  }

  // Parse current timestamp
  const currentDate = new Date(currentTimestamp);
  if (isNaN(currentDate.getTime())) {
    throw new Error('Invalid current timestamp format');
  }

  // Convert to account timezone and extract date
  const dateStr = formatDateInTimezone(currentDate, config.account.timezone);

  // Calculate maximum daily loss
  const balance = config.account.balance;
  let maxDailyLoss = balance * (config.dailyLimits.maxLossPercent / 100);

  // Apply absolute limit if specified
  if (config.dailyLimits.maxLossAmount !== undefined) {
    maxDailyLoss = Math.min(maxDailyLoss, config.dailyLimits.maxLossAmount);
  }

  // Filter trades to current day
  const todayTrades = trades.filter((trade) => {
    const tradeDate = new Date(trade.timestamp);
    if (isNaN(tradeDate.getTime())) {
      warnings.push(`Invalid trade timestamp: ${trade.timestamp}`);
      return false;
    }
    const tradeDateStr = formatDateInTimezone(tradeDate, config.account.timezone);
    return tradeDateStr === dateStr;
  });

  // Calculate realized loss for today
  let realizedLoss = 0;
  for (const trade of todayTrades) {
    // Only count losses (negative PnL)
    if (trade.pnl < 0) {
      realizedLoss += Math.abs(trade.pnl);
    }

    // Include fees if configured
    if (config.dailyLimits.includeFees && trade.fees !== undefined) {
      realizedLoss += trade.fees;
    }
  }

  // Calculate consecutive losses
  const consecutiveLosses = calculateConsecutiveLosses(trades, currentTimestamp, config.account.timezone);

  // Check consecutive loss limit
  const maxConsecutiveLosses = config.dailyLimits.maxConsecutiveLosses;
  let consecutiveLimitReached = false;
  if (maxConsecutiveLosses !== undefined && consecutiveLosses >= maxConsecutiveLosses) {
    consecutiveLimitReached = true;
    warnings.push(`Reached maximum consecutive losses (${consecutiveLosses}/${maxConsecutiveLosses})`);
  }

  // Calculate total risk (realized + open)
  const totalRisk = realizedLoss + openPositionRisk;

  // Calculate remaining capacity
  const remainingCapacity = Math.max(0, maxDailyLoss - totalRisk);

  // Determine if limit is reached
  const isLimitReached = totalRisk >= maxDailyLoss || consecutiveLimitReached;

  // Generate warnings
  if (remainingCapacity < maxDailyLoss * 0.2 && remainingCapacity > 0) {
    warnings.push(`Approaching daily loss limit: ${((totalRisk / maxDailyLoss) * 100).toFixed(1)}% used`);
  }

  if (isLimitReached && !consecutiveLimitReached) {
    warnings.push('Daily loss limit reached - no new trades allowed');
  }

  if (openPositionRisk > 0) {
    warnings.push(`Open position risk: $${openPositionRisk.toFixed(2)}`);
  }

  // Calculate reset time (start of next day in account timezone)
  const resetTime = calculateResetTime(currentDate, config.account.timezone);

  return {
    date: dateStr,
    realizedLoss,
    openRisk: openPositionRisk,
    remainingCapacity,
    isLimitReached,
    consecutiveLosses,
    resetTime,
    warnings,
  };
}

/**
 * Format date in a specific timezone as YYYY-MM-DD.
 *
 * Uses Intl.DateTimeFormat for timezone conversion.
 *
 * @param date - Date to format
 * @param timezone - IANA timezone (e.g., 'America/New_York')
 * @returns Date string in YYYY-MM-DD format
 */
function formatDateInTimezone(date: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const parts = formatter.formatToParts(date);
    const year = parts.find((p) => p.type === 'year')?.value || '';
    const month = parts.find((p) => p.type === 'month')?.value || '';
    const day = parts.find((p) => p.type === 'day')?.value || '';

    return `${year}-${month}-${day}`;
  } catch (error) {
    // Fallback to UTC if timezone is invalid
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * Calculate reset time (start of next trading day).
 *
 * @param currentDate - Current date/time
 * @param timezone - Account timezone
 * @returns ISO 8601 timestamp for next day at 00:00 in timezone
 */
function calculateResetTime(currentDate: Date, _timezone: string): string {
  try {
    // Get current date in timezone
    const dateStr = formatDateInTimezone(currentDate, _timezone);
    const parts = dateStr.split('-').map(Number);
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];

    if (!year || !month || !day) {
      throw new Error('Invalid date parts');
    }

    // Create date for next day at midnight in timezone
    const nextDay = new Date(year, month - 1, day + 1, 0, 0, 0, 0);

    // Format as ISO 8601
    return nextDay.toISOString();
  } catch (error) {
    // Fallback: add 24 hours to current time
    const next = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    return next.toISOString();
  }
}

/**
 * Calculate number of consecutive losses.
 *
 * Counts losses starting from most recent trade backwards until hitting a win.
 * Only considers closed trades (those with PnL).
 *
 * @param trades - All trade records
 * @param currentTimestamp - Current time
 * @param _timezone - Account timezone
 * @returns Number of consecutive losses
 */
function calculateConsecutiveLosses(trades: TradeRecord[], currentTimestamp: string, _timezone: string): number {
  if (trades.length === 0) {
    return 0;
  }

  // Sort trades by timestamp descending (most recent first)
  const sortedTrades = [...trades].sort((a, b) => {
    const dateA = new Date(a.timestamp).getTime();
    const dateB = new Date(b.timestamp).getTime();
    return dateB - dateA; // Descending
  });

  // Filter to only closed trades up to current time
  const currentTime = new Date(currentTimestamp).getTime();
  const closedTrades = sortedTrades.filter((trade) => {
    const tradeTime = new Date(trade.timestamp).getTime();
    return !isNaN(tradeTime) && tradeTime <= currentTime;
  });

  // Count consecutive losses from most recent
  let count = 0;
  for (const trade of closedTrades) {
    if (trade.pnl < 0) {
      count++;
    } else if (trade.pnl > 0) {
      // Hit a win, stop counting
      break;
    }
    // If pnl === 0, it's a breakeven trade - opinions vary on how to handle
    // We'll treat it as neither win nor loss and continue counting
  }

  return count;
}

/**
 * Check if a new trade is allowed given current daily stop state.
 *
 * Convenience function that evaluates multiple conditions.
 *
 * @param state - Daily stop state
 * @param newTradeRisk - Dollar risk for the proposed new trade
 * @returns True if trade is allowed
 */
export function canTakeNewTrade(state: DailyStopResult, newTradeRisk: number): boolean {
  if (state.isLimitReached) {
    return false;
  }

  if (newTradeRisk > state.remainingCapacity) {
    return false;
  }

  return true;
}