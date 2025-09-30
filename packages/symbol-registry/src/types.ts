/**
 * Core types for symbol registry and continuous futures mapping
 */

/**
 * Canonical symbol representation
 * Examples: "ES", "NQ", "AAPL", "ESH25"
 */
export type CanonicalSymbol = string;

/**
 * Specific futures contract code
 * Examples: "ESH25" (ES March 2025), "NQM24" (NQ June 2024)
 */
export type ContractCode = string;

/**
 * Futures contract root symbol
 * Examples: "ES", "NQ", "VX"
 */
export type FuturesRoot = string;

/**
 * Rollover rule type
 */
export type RolloverType = 'volume' | 'fixed-days';

/**
 * Expiration day specification
 */
export type ExpirationDay =
  | 'third-friday'
  | 'wednesday-before-third-friday'
  | string;

/**
 * Rollover rule configuration for a specific symbol
 */
export interface RolloverRule {
  /** Type of rollover rule */
  type: RolloverType;

  /** Volume threshold for volume-based rollover (0.0 to 1.0) */
  threshold?: number;

  /** Fallback days before expiration if volume data unavailable */
  fallbackDays?: number;

  /** Days before expiration for fixed-days rollover */
  daysBeforeExpiration?: number;

  /** Expiration day specification */
  expirationDay: ExpirationDay;
}

/**
 * Rollover rules configuration map
 */
export interface RolloverRules {
  [root: string]: RolloverRule;
}

/**
 * Symbol normalization result
 */
export interface NormalizedSymbol {
  /** Canonical symbol */
  canonical: CanonicalSymbol;

  /** Symbol type */
  type: 'stock' | 'continuous-future' | 'future-contract' | 'unknown';

  /** Futures root if applicable */
  root?: FuturesRoot;

  /** Contract month code if applicable (e.g., "H25" for March 2025) */
  contractMonth?: string;
}