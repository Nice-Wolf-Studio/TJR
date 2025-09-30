/**
 * @fileoverview Yahoo Finance provider-specific types.
 *
 * Defines types for Yahoo Finance API responses and internal provider state.
 *
 * @module @tjr/provider-yahoo/types
 */

/**
 * Raw bar data from Yahoo Finance API response.
 *
 * Yahoo Finance returns data in this format before parsing into MarketBar.
 */
export interface YahooRawBar {
  /** Symbol identifier (e.g., 'ES', 'SPY') */
  symbol: string;

  /** ISO 8601 timestamp string */
  date: string;

  /** Opening price */
  open: number;

  /** Highest price */
  high: number;

  /** Lowest price */
  low: number;

  /** Closing price */
  close: number;

  /** Trading volume */
  volume: number;
}

/**
 * Options for YahooProvider configuration.
 */
export interface YahooProviderOptions {
  /**
   * Base URL for Yahoo Finance API (for future HTTP implementation).
   * Currently unused as we load from fixtures.
   */
  baseUrl?: string;

  /**
   * API key for Yahoo Finance (for future authentication).
   * Currently unused as we load from fixtures.
   */
  apiKey?: string;

  /**
   * Path to fixture directory for testing.
   * Defaults to '../__fixtures__' relative to provider module.
   */
  fixturePath?: string;
}