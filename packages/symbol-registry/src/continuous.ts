/**
 * Continuous futures contract resolution
 * Resolves continuous symbols (e.g., ES, NQ) to specific contracts based on rollover rules
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import type { ContractCode, FuturesRoot, RolloverRules, RolloverRule } from './types';

// Get the directory of the current module (CommonJS)
const __dirname = __filename ? dirname(__filename) : '.';

/**
 * Futures contract month codes (CME standard)
 * F=Jan, G=Feb, H=Mar, J=Apr, K=May, M=Jun, N=Jul, Q=Aug, U=Sep, V=Oct, X=Nov, Z=Dec
 */
const MONTH_TO_INDEX: Record<string, number> = {
  F: 0, G: 1, H: 2, J: 3, K: 4, M: 5,
  N: 6, Q: 7, U: 8, V: 9, X: 10, Z: 11,
};

/**
 * Quarterly contract months (most index futures)
 * H=Mar, M=Jun, U=Sep, Z=Dec
 */
const QUARTERLY_MONTHS = ['H', 'M', 'U', 'Z'];

/**
 * Cached rollover rules
 */
let cachedRules: RolloverRules | null = null;

/**
 * Default rollover rule for unknown symbols
 */
const DEFAULT_RULE: RolloverRule = {
  type: 'fixed-days',
  daysBeforeExpiration: 5,
  expirationDay: 'third-friday',
};

/**
 * Load rollover rules from JSON config
 *
 * @returns Rollover rules configuration
 */
function loadRolloverRules(): RolloverRules {
  if (cachedRules) {
    return cachedRules;
  }

  try {
    const configPath = join(__dirname, '..', 'data', 'rollover-rules.json');
    const data = readFileSync(configPath, 'utf-8');
    cachedRules = JSON.parse(data) as RolloverRules;
    return cachedRules;
  } catch (error: unknown) {
    // If config doesn't exist or fails to load, return empty rules
    // (will fall back to default rule)
    // eslint-disable-next-line no-console
    console.warn('Failed to load rollover-rules.json, using default rules:', error);
    cachedRules = {};
    return cachedRules;
  }
}

/**
 * Get rollover rule for a specific futures root
 *
 * @param root - Futures root symbol
 * @returns Rollover rule or default if not found
 */
function getRolloverRule(root: FuturesRoot): RolloverRule {
  const rules = loadRolloverRules();
  return rules[root] ?? DEFAULT_RULE;
}

/**
 * Calculate the Nth weekday of a month
 *
 * @param year - Year
 * @param month - Month (0-11)
 * @param weekday - Target weekday (0=Sunday, 5=Friday)
 * @param occurrence - Which occurrence (1=first, 3=third)
 * @returns Date of the Nth weekday
 */
function getNthWeekdayOfMonth(year: number, month: number, weekday: number, occurrence: number): Date {
  const date = new Date(year, month, 1);
  let count = 0;

  while (date.getMonth() === month) {
    if (date.getDay() === weekday) {
      count++;
      if (count === occurrence) {
        return date;
      }
    }
    date.setDate(date.getDate() + 1);
  }

  throw new Error(`Could not find ${occurrence}th occurrence of weekday ${weekday} in ${year}-${month + 1}`);
}

/**
 * Calculate expiration date based on expiration day rule
 *
 * @param contractMonth - Contract month code (e.g., "H")
 * @param contractYear - Contract year (2-digit, e.g., "25")
 * @param expirationDay - Expiration day specification
 * @returns Expiration date
 */
function calculateExpirationDate(
  contractMonth: string,
  contractYear: string,
  expirationDay: string
): Date {
  const monthIndex = MONTH_TO_INDEX[contractMonth];
  if (monthIndex === undefined) {
    throw new Error(`Invalid contract month: ${contractMonth}`);
  }

  const yearNum = parseInt(contractYear, 10);
  if (isNaN(yearNum)) {
    throw new Error(`Invalid contract year: ${contractYear}`);
  }
  const year = 2000 + yearNum;

  if (expirationDay === 'third-friday') {
    return getNthWeekdayOfMonth(year, monthIndex, 5, 3); // 5 = Friday
  }

  if (expirationDay === 'wednesday-before-third-friday') {
    const thirdFriday = getNthWeekdayOfMonth(year, monthIndex, 5, 3);
    const wednesday = new Date(thirdFriday);
    wednesday.setDate(thirdFriday.getDate() - 2); // Friday - 2 = Wednesday
    return wednesday;
  }

  // Default to third Friday if unknown
  // eslint-disable-next-line no-console
  console.warn(`Unknown expiration day: ${expirationDay}, defaulting to third-friday`);
  return getNthWeekdayOfMonth(year, monthIndex, 5, 3);
}


/**
 * Resolve a continuous futures symbol to a specific contract code
 *
 * @param root - Futures root symbol (e.g., "ES", "NQ")
 * @param date - Reference date for resolution
 * @returns Contract code (e.g., "ESH25")
 *
 * @example
 * ```typescript
 * // Resolve ES front month on Jan 15, 2025
 * resolveContinuous('ES', new Date('2025-01-15'))  // → 'ESH25' (March contract)
 *
 * // After rollover date
 * resolveContinuous('ES', new Date('2025-03-10'))  // → 'ESM25' (June contract)
 * ```
 */
export function resolveContinuous(root: FuturesRoot, date: Date): ContractCode {
  if (!root || typeof root !== 'string') {
    throw new Error('Futures root must be a non-empty string');
  }

  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Date must be a valid Date object');
  }

  const rule = getRolloverRule(root);

  // Determine which contract is front month at the given date
  // Strategy: Find the next expiration date, then apply rollover logic

  const year = date.getFullYear();
  const twoDigitYear = String(year).slice(-2);
  const currentMonth = date.getMonth();

  // For quarterly contracts (ES, NQ, etc.), find next quarterly month
  const candidateMonths = QUARTERLY_MONTHS;

  // Find the nearest future contract that hasn't expired yet
  let frontMonthCode: string | null = null;
  let frontMonthYear = twoDigitYear;

  for (const monthCode of candidateMonths) {
    const monthIndex = MONTH_TO_INDEX[monthCode];
    if (monthIndex === undefined) {
      continue;
    }

    // Try current year first
    if (monthIndex >= currentMonth) {
      const expirationDate = calculateExpirationDate(monthCode, twoDigitYear, rule.expirationDay);
      const rolloverDate = getRolloverDate(expirationDate, rule);

      if (date < rolloverDate) {
        // This is the front month
        frontMonthCode = monthCode;
        frontMonthYear = twoDigitYear;
        break;
      }
    }
  }

  // If no contract found in current year, wrap to next year
  if (!frontMonthCode) {
    const nextYear = String(year + 1).slice(-2);
    frontMonthCode = candidateMonths[0] as string;
    frontMonthYear = nextYear;
  }

  return `${root}${frontMonthCode}${frontMonthYear}`;
}

/**
 * Calculate rollover date based on rule
 *
 * @param expirationDate - Contract expiration date
 * @param rule - Rollover rule
 * @returns Date when rollover should occur
 */
function getRolloverDate(expirationDate: Date, rule: RolloverRule): Date {
  if (rule.type === 'fixed-days') {
    const daysBeforeExpiration = rule.daysBeforeExpiration ?? 5;
    const rolloverDate = new Date(expirationDate);

    // Subtract business days (simplified: just subtract days, don't account for weekends/holidays)
    rolloverDate.setDate(rolloverDate.getDate() - daysBeforeExpiration);

    return rolloverDate;
  }

  if (rule.type === 'volume') {
    // For volume-based rollover, we'd need actual volume data
    // As a fallback, use fixed-days logic
    const fallbackDays = rule.fallbackDays ?? 5;
    const rolloverDate = new Date(expirationDate);
    rolloverDate.setDate(rolloverDate.getDate() - fallbackDays);
    return rolloverDate;
  }

  // Default fallback
  const rolloverDate = new Date(expirationDate);
  rolloverDate.setDate(rolloverDate.getDate() - 5);
  return rolloverDate;
}

/**
 * Get the front month contract for a given date (alias for resolveContinuous)
 *
 * @param root - Futures root symbol
 * @param date - Reference date
 * @returns Front month contract code
 */
export function getFrontMonth(root: FuturesRoot, date: Date = new Date()): ContractCode {
  return resolveContinuous(root, date);
}

/**
 * Clear the rollover rules cache (useful for testing)
 */
export function clearRolloverRulesCache(): void {
  cachedRules = null;
}