/**
 * @fileoverview Parser utilities for Yahoo Finance data.
 *
 * Converts raw Yahoo Finance API responses into standardized MarketBar format
 * defined in @tjr/contracts.
 *
 * @module @tjr/provider-yahoo/parser
 */

import type { MarketBar } from '@tjr/contracts';
import type { YahooRawBar } from './types.js';

/**
 * Parses a single raw Yahoo Finance bar into MarketBar format.
 *
 * Converts Yahoo's date string format to ISO 8601 timestamp and validates
 * OHLCV data integrity.
 *
 * @param raw - Raw bar data from Yahoo Finance
 * @returns Parsed MarketBar conforming to @tjr/contracts
 * @throws {Error} If bar data is invalid (missing fields, invalid prices, etc.)
 *
 * @example
 * ```typescript
 * const raw = {
 *   symbol: 'ES',
 *   date: '2024-01-15T14:30:00.000Z',
 *   open: 4750.00,
 *   high: 4752.25,
 *   low: 4749.50,
 *   close: 4751.75,
 *   volume: 1250
 * };
 * const bar = parseYahooBar(raw);
 * // bar.timestamp === '2024-01-15T14:30:00.000Z'
 * ```
 */
export function parseYahooBar(raw: YahooRawBar): MarketBar {
  // Validate required fields
  if (!raw.date) {
    throw new Error('Yahoo bar missing required field: date');
  }
  if (
    typeof raw.open !== 'number' ||
    typeof raw.high !== 'number' ||
    typeof raw.low !== 'number' ||
    typeof raw.close !== 'number'
  ) {
    throw new Error('Yahoo bar has invalid OHLC data');
  }
  if (typeof raw.volume !== 'number' || raw.volume < 0) {
    throw new Error('Yahoo bar has invalid volume');
  }

  // Validate OHLC invariants
  if (raw.high < raw.low) {
    throw new Error(`Invalid bar: high (${raw.high}) < low (${raw.low})`);
  }
  if (raw.high < raw.open || raw.high < raw.close) {
    throw new Error(`Invalid bar: high (${raw.high}) < open/close`);
  }
  if (raw.low > raw.open || raw.low > raw.close) {
    throw new Error(`Invalid bar: low (${raw.low}) > open/close`);
  }

  // Parse timestamp - Yahoo provides ISO 8601 format
  const timestamp = raw.date;

  // Validate timestamp format
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }

  return {
    timestamp,
    open: raw.open,
    high: raw.high,
    low: raw.low,
    close: raw.close,
    volume: raw.volume,
  };
}

/**
 * Result of parsing Yahoo Finance bars.
 */
export interface ParseResult {
  bars: MarketBar[];
  errors: Array<{ bar: YahooRawBar; error: Error }>;
}

/**
 * Parses an array of raw Yahoo Finance bars into MarketBar array.
 *
 * Processes all bars and collects any parse errors for caller handling.
 * Does not log to console (library code should not pollute consumer logs).
 *
 * @param rawBars - Array of raw bars from Yahoo Finance
 * @returns Parse result containing bars and errors
 *
 * @example
 * ```typescript
 * const rawBars = loadFixture('ES-1m-sample.json');
 * const { bars, errors } = parseYahooBars(rawBars);
 * console.log(`Parsed ${bars.length} bars with ${errors.length} errors`);
 * ```
 */
export function parseYahooBars(rawBars: YahooRawBar[]): ParseResult {
  const parsed: MarketBar[] = [];
  const errors: Array<{ bar: YahooRawBar; error: Error }> = [];

  for (const raw of rawBars) {
    try {
      parsed.push(parseYahooBar(raw));
    } catch (error) {
      errors.push({ bar: raw, error: error as Error });
    }
  }

  return { bars: parsed, errors };
}
