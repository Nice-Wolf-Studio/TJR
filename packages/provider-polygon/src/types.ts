/**
 * Type definitions for Polygon.io provider adapter.
 *
 * This module defines the configuration and options types used by the
 * Polygon.io market data provider adapter.
 */

import type { Logger } from '@tjr/logger';
import type { Timeframe } from '@tjr/contracts';

/**
 * Configuration for creating a Polygon.io provider instance.
 *
 * @example
 * ```typescript
 * const config: PolygonProviderConfig = {
 *   apiKey: 'your-api-key-here',
 *   baseUrl: 'https://api.polygon.io', // optional
 *   timeout: 30000, // optional
 *   logger: createLogger({ level: 'info' }) // optional
 * };
 * ```
 */
export interface PolygonProviderConfig {
  /**
   * Polygon.io API key.
   * Required for all requests.
   * Obtain from https://polygon.io/dashboard/api-keys
   */
  apiKey: string;

  /**
   * Base URL for Polygon.io API.
   * Defaults to https://api.polygon.io
   * Override for testing or alternative endpoints.
   */
  baseUrl?: string;

  /**
   * Request timeout in milliseconds.
   * Defaults to 30000 (30 seconds).
   */
  timeout?: number;

  /**
   * Logger instance for debug and error logging.
   * If not provided, logging will be disabled.
   */
  logger?: Logger;
}

/**
 * Options for fetching historical bars from Polygon.io.
 *
 * @example
 * ```typescript
 * const options: GetBarsOptions = {
 *   symbol: 'SPY',
 *   timeframe: '5m',
 *   from: new Date('2025-01-01'),
 *   to: new Date('2025-01-31'),
 *   limit: 1000
 * };
 * ```
 */
export interface GetBarsOptions {
  /**
   * Stock symbol (e.g., 'SPY', 'AAPL').
   * Case-insensitive; will be converted to uppercase.
   */
  symbol: string;

  /**
   * Desired timeframe for the bars.
   * Supported: 1m, 5m, 10m, 15m, 30m, 1h, 2h, 4h, 1D
   */
  timeframe: Timeframe;

  /**
   * Start date/time for the data range (inclusive).
   * Will be converted to Unix milliseconds for API request.
   */
  from: Date;

  /**
   * End date/time for the data range (inclusive).
   * Will be converted to Unix milliseconds for API request.
   */
  to: Date;

  /**
   * Maximum number of bars to return.
   * If not specified, returns all available bars in range.
   * Note: Polygon API has a max of 50,000 bars per request.
   */
  limit?: number;
}

/**
 * Raw response from Polygon.io aggregates API.
 * Internal type used for parsing.
 *
 * @internal
 */
export interface PolygonAggregatesResponse {
  /**
   * API response status (e.g., 'OK', 'ERROR').
   */
  status: string;

  /**
   * Symbol ticker.
   */
  ticker: string;

  /**
   * Number of aggregates returned.
   */
  resultsCount: number;

  /**
   * Query count (used for pagination).
   */
  queryCount: number;

  /**
   * Adjusted flag (whether prices are split-adjusted).
   */
  adjusted: boolean;

  /**
   * Array of aggregate bars.
   */
  results?: PolygonAggregate[];

  /**
   * Error message (present if status !== 'OK').
   */
  error?: string;

  /**
   * Request ID for debugging.
   */
  request_id?: string;
}

/**
 * Single aggregate bar from Polygon.io API response.
 * Internal type used for parsing.
 *
 * @internal
 */
export interface PolygonAggregate {
  /**
   * Opening price.
   */
  o: number;

  /**
   * Highest price.
   */
  h: number;

  /**
   * Lowest price.
   */
  l: number;

  /**
   * Closing price.
   */
  c: number;

  /**
   * Trading volume.
   */
  v: number;

  /**
   * Volume-weighted average price.
   */
  vw: number;

  /**
   * Unix timestamp in milliseconds.
   */
  t: number;

  /**
   * Number of transactions.
   */
  n: number;
}

/**
 * Provider interface that must be implemented.
 * Matches the contract expected by @tjr/contracts.
 */
export interface Provider {
  /**
   * Fetches historical bars for a given symbol and timeframe.
   *
   * @param options - Bar fetch options
   * @returns Promise resolving to array of bars
   */
  getBars: (options: GetBarsOptions) => Promise<import('@tjr-suite/market-data-core').Bar[]>;

  /**
   * Returns the provider's capabilities.
   *
   * @returns Provider capabilities object
   */
  capabilities: () => import('@tjr/contracts').ProviderCapabilities;
}
