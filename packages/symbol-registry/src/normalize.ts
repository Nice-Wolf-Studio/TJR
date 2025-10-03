/**
 * Symbol normalization
 * Converts vendor-specific symbol formats to canonical representation
 */

import { resolveAlias } from './aliases';
import type { NormalizedSymbol, FuturesRoot } from './types';

/**
 * Futures contract month codes (CME standard)
 * F=Jan, G=Feb, H=Mar, J=Apr, K=May, M=Jun, N=Jul, Q=Aug, U=Sep, V=Oct, X=Nov, Z=Dec
 */
const MONTH_CODES = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z'];

/**
 * Known continuous futures roots
 */
const KNOWN_FUTURES_ROOTS = new Set([
  'ES',
  'NQ',
  'YM',
  'RTY', // Equity indices
  'GC',
  'SI',
  'HG',
  'CL', // Commodities
  'ZB',
  'ZN',
  'ZF',
  'ZT', // Treasuries
  'VX', // Volatility
]);

/**
 * Normalize a raw symbol to canonical format
 *
 * @param raw - Raw symbol string (may be vendor-specific)
 * @returns Normalized symbol information
 *
 * @example
 * ```typescript
 * normalizeSymbol('ES=F')     // → { canonical: 'ES', type: 'continuous-future', root: 'ES' }
 * normalizeSymbol('ESH25')    // → { canonical: 'ESH25', type: 'future-contract', root: 'ES', contractMonth: 'H25' }
 * normalizeSymbol('AAPL')     // → { canonical: 'AAPL', type: 'stock' }
 * normalizeSymbol('ESH2025')  // → { canonical: 'ESH25', type: 'future-contract', root: 'ES', contractMonth: 'H25' }
 * ```
 */
export function normalizeSymbol(raw: string): NormalizedSymbol {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Symbol must be a non-empty string');
  }

  // First try alias resolution
  const aliased = resolveAlias(raw);
  const symbol = aliased ?? raw.trim().toUpperCase();

  if (!symbol) {
    throw new Error('Symbol cannot be empty after normalization');
  }

  // Check if it's a futures contract (ends with month code + year)
  const contractMatch = symbol.match(/^([A-Z]{1,4})(F|G|H|J|K|M|N|Q|U|V|X|Z)(\d{2,4})$/);
  if (contractMatch) {
    const root = contractMatch[1] as string;
    const monthCode = contractMatch[2] as string;
    let year = contractMatch[3] as string;

    // Normalize year to 2 digits
    if (year && year.length === 4) {
      year = year.slice(-2);
    }

    const contractMonth = `${monthCode}${year}`;
    const canonical = `${root}${contractMonth}`;

    return {
      canonical,
      type: 'future-contract',
      root,
      contractMonth,
    };
  }

  // Check if it's a known continuous futures root
  if (KNOWN_FUTURES_ROOTS.has(symbol)) {
    return {
      canonical: symbol,
      type: 'continuous-future',
      root: symbol,
    };
  }

  // Default to stock/unknown
  return {
    canonical: symbol,
    type: isLikelyStock(symbol) ? 'stock' : 'unknown',
  };
}

/**
 * Heuristic to determine if a symbol is likely a stock
 * (as opposed to an unknown futures root)
 *
 * @param symbol - Symbol to check
 * @returns True if likely a stock symbol
 */
function isLikelyStock(symbol: string): boolean {
  // Most stock symbols are 1-5 characters, alphanumeric
  // Futures roots are typically 1-3 characters, all letters
  if (symbol.length > 5) {
    return false;
  }

  // If contains numbers, likely a stock (e.g., BRK.B → BRKB)
  if (/\d/.test(symbol)) {
    return true;
  }

  // If 4+ letters, likely a stock
  if (symbol.length >= 4) {
    return true;
  }

  // 1-3 letters, no numbers → ambiguous, default to stock
  return true;
}

/**
 * Extract futures root from a contract code or continuous symbol
 *
 * @param symbol - Symbol to extract root from
 * @returns Futures root or null if not a futures symbol
 *
 * @example
 * ```typescript
 * extractFuturesRoot('ESH25')  // → 'ES'
 * extractFuturesRoot('ES')     // → 'ES'
 * extractFuturesRoot('AAPL')   // → null
 * ```
 */
export function extractFuturesRoot(symbol: string): FuturesRoot | null {
  const normalized = normalizeSymbol(symbol);

  if (normalized.type === 'continuous-future' || normalized.type === 'future-contract') {
    return normalized.root ?? null;
  }

  return null;
}

/**
 * Check if a symbol is a valid futures month code + year
 *
 * @param contractMonth - Contract month string (e.g., "H25")
 * @returns True if valid
 */
export function isValidContractMonth(contractMonth: string): boolean {
  if (!contractMonth || contractMonth.length < 2) {
    return false;
  }

  const monthCode = contractMonth[0] as string;
  return MONTH_CODES.includes(monthCode);
}

/**
 * Register a new futures root as known
 *
 * @param root - Futures root symbol
 */
export function registerFuturesRoot(root: FuturesRoot): void {
  if (!root || typeof root !== 'string') {
    throw new Error('Futures root must be a non-empty string');
  }
  KNOWN_FUTURES_ROOTS.add(root.trim().toUpperCase());
}

/**
 * Get all registered futures roots
 *
 * @returns Array of registered futures roots
 */
export function getKnownFuturesRoots(): FuturesRoot[] {
  return Array.from(KNOWN_FUTURES_ROOTS);
}
