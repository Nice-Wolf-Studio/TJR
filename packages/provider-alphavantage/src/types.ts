/**
 * @fileoverview Type definitions for Alpha Vantage provider.
 *
 * Defines interfaces for Alpha Vantage API responses, configuration,
 * and internal data structures.
 *
 * @module @tjr/provider-alphavantage/types
 */

import type { Timeframe } from '@tjr/contracts';

/**
 * Alpha Vantage provider configuration options.
 *
 * @property apiKey - Alpha Vantage API key (optional for fixture mode)
 * @property fixturePath - Path to fixture files for testing (optional)
 * @property timeout - HTTP request timeout in milliseconds (default: 30000)
 */
export interface AlphaVantageProviderOptions {
  apiKey?: string;
  fixturePath?: string;
  timeout?: number;
}

/**
 * Alpha Vantage raw time series data point.
 *
 * Represents a single bar from the Alpha Vantage API response.
 * All price values are strings that need to be parsed to numbers.
 *
 * @property '1. open' - Opening price
 * @property '2. high' - High price
 * @property '3. low' - Low price
 * @property '4. close' - Closing price
 * @property '5. volume' - Trading volume
 */
export interface AlphaVantageRawBar {
  '1. open': string;
  '2. high': string;
  '3. low': string;
  '4. close': string;
  '5. volume': string;
}

/**
 * Alpha Vantage intraday time series response.
 *
 * Response format for TIME_SERIES_INTRADAY endpoint.
 *
 * @property 'Meta Data' - Metadata about the time series
 * @property 'Time Series (1min)' - Time series data (key varies by interval)
 */
export interface AlphaVantageIntradayResponse {
  'Meta Data': {
    '1. Information': string;
    '2. Symbol': string;
    '3. Last Refreshed': string;
    '4. Interval': string;
    '5. Output Size': string;
    '6. Time Zone': string;
  };
  [key: string]: any; // Time Series (1min), Time Series (5min), etc.
}

/**
 * Alpha Vantage daily time series response.
 *
 * Response format for TIME_SERIES_DAILY endpoint.
 *
 * @property 'Meta Data' - Metadata about the time series
 * @property 'Time Series (Daily)' - Daily time series data
 */
export interface AlphaVantageDailyResponse {
  'Meta Data': {
    '1. Information': string;
    '2. Symbol': string;
    '3. Last Refreshed': string;
    '4. Output Size': string;
    '5. Time Zone': string;
  };
  'Time Series (Daily)': {
    [timestamp: string]: AlphaVantageRawBar;
  };
}

/**
 * Alpha Vantage error response.
 *
 * Error responses from the Alpha Vantage API.
 *
 * @property 'Error Message' - Error description
 * @property 'Note' - Additional information (e.g., rate limit message)
 * @property 'Information' - Premium feature notification
 */
export interface AlphaVantageErrorResponse {
  'Error Message'?: string;
  'Note'?: string;
  'Information'?: string;
}

/**
 * Internal parsed bar format (before conversion to MarketBar).
 *
 * @property timestamp - Bar timestamp as ISO 8601 string
 * @property open - Opening price
 * @property high - High price
 * @property low - Low price
 * @property close - Closing price
 * @property volume - Trading volume
 */
export interface ParsedBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Parse result from Alpha Vantage response.
 *
 * @property bars - Array of parsed bars
 * @property symbol - Symbol from metadata
 * @property interval - Interval from metadata
 * @property timezone - Timezone from metadata
 */
export interface ParseResult {
  bars: ParsedBar[];
  symbol: string;
  interval: string;
  timezone: string;
}

/**
 * Fetch options for Alpha Vantage API.
 *
 * @property symbol - Stock/ETF symbol
 * @property timeframe - Target timeframe
 * @property outputSize - 'compact' (100 bars) or 'full' (full history)
 */
export interface FetchOptions {
  symbol: string;
  timeframe: Timeframe;
  outputSize?: 'compact' | 'full';
}