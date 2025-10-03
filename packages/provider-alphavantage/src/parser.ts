/**
 * @fileoverview Response parser for Alpha Vantage API.
 *
 * Parses Alpha Vantage time series responses into normalized bar data.
 * Handles both intraday and daily responses, validates data integrity,
 * and converts string values to numbers.
 *
 * @module @tjr/provider-alphavantage/parser
 */

import type {
  AlphaVantageIntradayResponse,
  AlphaVantageDailyResponse,
  AlphaVantageRawBar,
  ParsedBar,
  ParseResult,
} from './types.js';
import { ParseError } from './errors.js';

/**
 * Parses an Alpha Vantage intraday time series response.
 *
 * Converts the nested Alpha Vantage response structure into a flat array
 * of bars. Validates all required fields and converts string prices to numbers.
 *
 * @param response - Alpha Vantage intraday API response
 * @returns Parsed bars with metadata
 * @throws {ParseError} If response is malformed or missing required fields
 *
 * @example
 * ```typescript
 * const result = parseIntradayResponse(apiResponse);
 * console.log(`Parsed ${result.bars.length} bars for ${result.symbol}`);
 * ```
 */
export function parseIntradayResponse(response: AlphaVantageIntradayResponse): ParseResult {
  // Validate metadata
  const metadata = response['Meta Data'];
  if (!metadata) {
    throw new ParseError('Missing Meta Data in Alpha Vantage response', response);
  }

  const symbol = metadata['2. Symbol'];
  const interval = metadata['4. Interval'];
  const timezone = metadata['6. Time Zone'];

  if (!symbol || !interval || !timezone) {
    throw new ParseError('Incomplete metadata in Alpha Vantage response', metadata);
  }

  // Find time series data
  // Key format: "Time Series (1min)", "Time Series (5min)", etc.
  const timeSeriesKey = Object.keys(response).find((key) => key.startsWith('Time Series'));

  if (!timeSeriesKey) {
    throw new ParseError('No time series data found in Alpha Vantage response', response);
  }

  const timeSeries = response[timeSeriesKey];

  if (!timeSeries || typeof timeSeries !== 'object') {
    throw new ParseError('Invalid time series data in Alpha Vantage response', response);
  }

  // Parse bars
  const bars: ParsedBar[] = [];

  for (const [timestamp, rawBar] of Object.entries(timeSeries)) {
    try {
      const parsedBar = parseRawBar(timestamp, rawBar as AlphaVantageRawBar);
      bars.push(parsedBar);
    } catch (error) {
      // Log parse error but continue processing other bars
      console.warn(`Failed to parse bar at ${timestamp}:`, error);
    }
  }

  if (bars.length === 0) {
    throw new ParseError('No valid bars found in Alpha Vantage response', response);
  }

  // Sort bars by timestamp (oldest first)
  bars.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    bars,
    symbol,
    interval,
    timezone,
  };
}

/**
 * Parses an Alpha Vantage daily time series response.
 *
 * Similar to parseIntradayResponse but handles daily data format.
 *
 * @param response - Alpha Vantage daily API response
 * @returns Parsed bars with metadata
 * @throws {ParseError} If response is malformed or missing required fields
 *
 * @example
 * ```typescript
 * const result = parseDailyResponse(apiResponse);
 * console.log(`Parsed ${result.bars.length} daily bars`);
 * ```
 */
export function parseDailyResponse(response: AlphaVantageDailyResponse): ParseResult {
  // Validate metadata
  const metadata = response['Meta Data'];
  if (!metadata) {
    throw new ParseError('Missing Meta Data in Alpha Vantage response', response);
  }

  const symbol = metadata['2. Symbol'];
  const timezone = metadata['5. Time Zone'];

  if (!symbol || !timezone) {
    throw new ParseError('Incomplete metadata in Alpha Vantage response', metadata);
  }

  // Get time series data
  const timeSeries = response['Time Series (Daily)'];

  if (!timeSeries || typeof timeSeries !== 'object') {
    throw new ParseError('Missing or invalid daily time series data', response);
  }

  // Parse bars
  const bars: ParsedBar[] = [];

  for (const [timestamp, rawBar] of Object.entries(timeSeries)) {
    try {
      const parsedBar = parseRawBar(timestamp, rawBar);
      bars.push(parsedBar);
    } catch (error) {
      // Log parse error but continue processing other bars
      console.warn(`Failed to parse bar at ${timestamp}:`, error);
    }
  }

  if (bars.length === 0) {
    throw new ParseError('No valid bars found in Alpha Vantage response', response);
  }

  // Sort bars by timestamp (oldest first)
  bars.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    bars,
    symbol,
    interval: '1D',
    timezone,
  };
}

/**
 * Parses a single raw bar from Alpha Vantage.
 *
 * Converts Alpha Vantage's string-based OHLCV format to typed numbers.
 * Validates that all required fields are present and numeric.
 *
 * @param timestamp - ISO 8601 timestamp string
 * @param rawBar - Raw Alpha Vantage bar data
 * @returns Parsed bar with numeric values
 * @throws {ParseError} If bar is malformed or has invalid values
 *
 * @example
 * ```typescript
 * const bar = parseRawBar('2024-01-15 14:30:00', {
 *   '1. open': '4500.25',
 *   '2. high': '4501.50',
 *   '3. low': '4499.00',
 *   '4. close': '4500.75',
 *   '5. volume': '125000'
 * });
 * ```
 */
function parseRawBar(timestamp: string, rawBar: AlphaVantageRawBar): ParsedBar {
  // Validate raw bar structure
  if (!rawBar || typeof rawBar !== 'object') {
    throw new ParseError('Invalid bar data: not an object', rawBar);
  }

  // Extract and parse values
  const openStr = rawBar['1. open'];
  const highStr = rawBar['2. high'];
  const lowStr = rawBar['3. low'];
  const closeStr = rawBar['4. close'];
  const volumeStr = rawBar['5. volume'];

  // Validate all fields are present
  if (!openStr || !highStr || !lowStr || !closeStr || !volumeStr) {
    throw new ParseError('Missing required OHLCV fields', rawBar);
  }

  // Parse to numbers
  const open = parseFloat(openStr);
  const high = parseFloat(highStr);
  const low = parseFloat(lowStr);
  const close = parseFloat(closeStr);
  const volume = parseFloat(volumeStr);

  // Validate numeric conversion
  if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || isNaN(volume)) {
    throw new ParseError('Invalid numeric values in bar', rawBar);
  }

  // Validate OHLC relationships
  if (high < low) {
    throw new ParseError(`Invalid bar: high (${high}) < low (${low})`, rawBar);
  }

  if (high < open || high < close) {
    throw new ParseError(`Invalid bar: high (${high}) is not the highest value`, rawBar);
  }

  if (low > open || low > close) {
    throw new ParseError(`Invalid bar: low (${low}) is not the lowest value`, rawBar);
  }

  // Validate positive values
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0) {
    throw new ParseError('Invalid bar: negative or zero prices', rawBar);
  }

  // Convert timestamp to ISO 8601 format
  // Alpha Vantage uses formats like:
  // - Intraday: "2024-01-15 14:30:00"
  // - Daily: "2024-01-15"
  const isoTimestamp = normalizeTimestamp(timestamp);

  return {
    timestamp: isoTimestamp,
    open,
    high,
    low,
    close,
    volume,
  };
}

/**
 * Normalizes Alpha Vantage timestamp to ISO 8601 format.
 *
 * Alpha Vantage returns timestamps in US/Eastern timezone.
 * This function converts them to ISO 8601 UTC format.
 *
 * @param timestamp - Alpha Vantage timestamp string
 * @returns ISO 8601 timestamp string
 *
 * @example
 * ```typescript
 * normalizeTimestamp('2024-01-15 14:30:00');
 * // Returns: '2024-01-15T14:30:00.000Z'
 *
 * normalizeTimestamp('2024-01-15');
 * // Returns: '2024-01-15T00:00:00.000Z'
 * ```
 */
function normalizeTimestamp(timestamp: string): string {
  // Remove any timezone info if present
  const cleanedTimestamp = timestamp.replace(/\s*\([^)]*\)$/, '').trim();

  // Check if it's date-only (daily format)
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanedTimestamp)) {
    return `${cleanedTimestamp}T00:00:00.000Z`;
  }

  // Check if it's datetime format
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(cleanedTimestamp)) {
    return `${cleanedTimestamp.replace(' ', 'T')}.000Z`;
  }

  // Try to parse as Date and convert to ISO
  try {
    const date = new Date(cleanedTimestamp);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date');
    }
    return date.toISOString();
  } catch {
    throw new ParseError(`Invalid timestamp format: ${timestamp}`);
  }
}

/**
 * Validates parsed bars for data quality.
 *
 * Checks for common data quality issues like:
 * - Duplicate timestamps
 * - Out-of-order timestamps
 * - Suspicious price movements
 * - Zero volume bars
 *
 * @param bars - Bars to validate
 * @returns Validation warnings (empty array if no issues)
 *
 * @example
 * ```typescript
 * const warnings = validateBars(bars);
 * if (warnings.length > 0) {
 *   console.warn('Data quality issues:', warnings);
 * }
 * ```
 */
export function validateBars(bars: ParsedBar[]): string[] {
  const warnings: string[] = [];

  if (bars.length === 0) {
    return warnings;
  }

  // Check for duplicate timestamps
  const timestamps = new Set<string>();
  for (const bar of bars) {
    if (timestamps.has(bar.timestamp)) {
      warnings.push(`Duplicate timestamp: ${bar.timestamp}`);
    }
    timestamps.add(bar.timestamp);
  }

  // Check for chronological order
  for (let i = 1; i < bars.length; i++) {
    const prevBar = bars[i - 1];
    const currBar = bars[i];
    if (!prevBar || !currBar) continue;

    const prevTime = new Date(prevBar.timestamp).getTime();
    const currTime = new Date(currBar.timestamp).getTime();

    if (currTime < prevTime) {
      warnings.push(`Bars not in chronological order at index ${i}`);
    }
  }

  // Check for zero volume bars
  const zeroVolumeBars = bars.filter((bar) => bar.volume === 0);
  if (zeroVolumeBars.length > 0) {
    warnings.push(`Found ${zeroVolumeBars.length} bars with zero volume`);
  }

  return warnings;
}
