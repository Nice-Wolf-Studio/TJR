/**
 * @fileoverview Market data types and provider contracts.
 *
 * Defines provider-agnostic interfaces for market data (OHLCV bars),
 * query parameters, and provider capabilities. All types are pure data
 * structures with no I/O or business logic.
 *
 * @module @tjr/contracts/market
 */

import type { Timeframe } from './timeframes.js';

/**
 * A single OHLCV (Open, High, Low, Close, Volume) bar with timestamp.
 *
 * Represents immutable market data for a specific time period.
 *
 * @invariant high >= low
 * @invariant high >= open && high >= close
 * @invariant low <= open && low <= close
 * @invariant volume >= 0
 * @invariant timestamp is valid ISO 8601 string
 *
 * @example
 * ```typescript
 * const bar: MarketBar = {
 *   timestamp: '2025-01-15T14:30:00.000Z',
 *   open: 100.50,
 *   high: 101.25,
 *   low: 100.00,
 *   close: 101.00,
 *   volume: 1500000
 * };
 * ```
 */
export interface MarketBar {
  /** ISO 8601 timestamp of bar open (UTC) */
  timestamp: string;

  /** Opening price for the period */
  open: number;

  /** Highest price during the period */
  high: number;

  /** Lowest price during the period */
  low: number;

  /** Closing price for the period */
  close: number;

  /** Trading volume during the period */
  volume: number;
}

/**
 * Parameters for requesting historical market bars from a provider.
 *
 * Standardized query interface for all data providers.
 *
 * @invariant from <= to (if to is specified)
 * @invariant limit > 0 (if specified)
 *
 * @example
 * ```typescript
 * const params: GetBarsParams = {
 *   symbol: 'SPY',
 *   timeframe: Timeframe.M5,
 *   from: '2025-01-01T00:00:00.000Z',
 *   to: '2025-01-31T23:59:59.999Z',
 *   limit: 1000
 * };
 * ```
 */
export interface GetBarsParams {
  /**
   * Symbol identifier (e.g., 'SPY', 'AAPL').
   * Format may vary by provider; normalization is caller's responsibility.
   */
  symbol: string;

  /** Timeframe for the bars */
  timeframe: Timeframe;

  /** Start of time range (ISO 8601, inclusive) */
  from: string;

  /**
   * End of time range (ISO 8601, inclusive).
   * If omitted, fetches until present or provider limit.
   */
  to?: string;

  /**
   * Maximum number of bars to return.
   * Actual count may be less if insufficient data available.
   */
  limit?: number;
}

/**
 * Describes a provider's supported features and limitations.
 *
 * Used for provider selection and query validation.
 *
 * @example
 * ```typescript
 * const alpacaCaps: ProviderCapabilities = {
 *   supportsTimeframes: [Timeframe.M1, Timeframe.M5, Timeframe.H1, Timeframe.D1],
 *   maxBarsPerRequest: 10000,
 *   requiresAuthentication: true,
 *   rateLimits: { requestsPerMinute: 200 }
 * };
 * ```
 */
export interface ProviderCapabilities {
  /** Array of supported timeframes */
  supportsTimeframes: Timeframe[];

  /** Maximum bars returnable in a single request */
  maxBarsPerRequest: number;

  /** Whether API keys/auth are required */
  requiresAuthentication: boolean;

  /** Rate limiting constraints */
  rateLimits: {
    /** Maximum requests per minute */
    requestsPerMinute: number;

    /** Optional: requests per day */
    requestsPerDay?: number;
  };

  /** Optional: Supports extended hours trading data */
  supportsExtendedHours?: boolean;

  /** Optional: Minimum historical data availability (ISO 8601 date) */
  historicalDataFrom?: string;
}

/**
 * Trading session boundaries and metadata.
 *
 * Defines market open/close times and session types (pre-market, regular, post-market).
 *
 * @invariant All times are in ISO 8601 format
 * @invariant preMarketOpen < regularOpen < regularClose < postMarketClose
 *
 * @example
 * ```typescript
 * const usSession: Session = {
 *   date: '2025-01-15',
 *   timezone: 'America/New_York',
 *   preMarketOpen: '04:00:00',
 *   regularOpen: '09:30:00',
 *   regularClose: '16:00:00',
 *   postMarketClose: '20:00:00',
 *   isHoliday: false
 * };
 * ```
 */
export interface Session {
  /** Date of the session (YYYY-MM-DD) */
  date: string;

  /** IANA timezone identifier (e.g., 'America/New_York') */
  timezone: string;

  /** Pre-market open time (HH:mm:ss) */
  preMarketOpen: string;

  /** Regular trading session open time (HH:mm:ss) */
  regularOpen: string;

  /** Regular trading session close time (HH:mm:ss) */
  regularClose: string;

  /** Post-market close time (HH:mm:ss) */
  postMarketClose: string;

  /** True if market is closed for holiday */
  isHoliday: boolean;

  /** Optional: Holiday name if applicable */
  holidayName?: string;
}
