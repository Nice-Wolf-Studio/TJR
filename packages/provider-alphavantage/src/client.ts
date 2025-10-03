/**
 * @fileoverview HTTP client for Alpha Vantage API.
 *
 * Provides HTTP client functionality for fetching data from Alpha Vantage API
 * or loading from fixture files for testing. Supports both intraday and daily
 * time series endpoints with automatic error handling and timeout management.
 *
 * @module @tjr/provider-alphavantage/client
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Timeframe } from '@tjr/contracts';
import type {
  AlphaVantageIntradayResponse,
  AlphaVantageDailyResponse,
  AlphaVantageProviderOptions,
  FetchOptions,
} from './types.js';
import { mapAlphaVantageError, ApiError } from './errors.js';

/**
 * HTTP client for Alpha Vantage API.
 *
 * Handles HTTP requests to Alpha Vantage endpoints or loads fixture data
 * for testing. Automatically detects whether to use fixtures based on
 * the presence of a fixturePath in options.
 *
 * @internal
 */
export class AlphaVantageClient {
  private readonly apiKey?: string;
  private readonly fixturePath?: string;
  private readonly timeout: number;
  private readonly baseUrl: string = 'https://www.alphavantage.co/query';

  /**
   * Creates a new AlphaVantageClient.
   *
   * @param options - Client configuration options
   */
  constructor(options: AlphaVantageProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.fixturePath = options.fixturePath;
    this.timeout = options.timeout || 30000; // Default 30 seconds
  }

  /**
   * Fetches intraday time series data from Alpha Vantage.
   *
   * For intraday data, Alpha Vantage supports intervals: 1min, 5min, 60min.
   * TJR contracts support: 1m, 5m, 10m, 1h, 4h (10m and 4h require aggregation).
   * Returns the most recent 100 data points (compact) or full history (full).
   *
   * @param options - Fetch options (symbol, timeframe, outputSize)
   * @returns Promise resolving to intraday response
   * @throws {ApiError} If API request fails
   * @throws {RateLimitError} If rate limit exceeded
   *
   * @example
   * ```typescript
   * const client = new AlphaVantageClient({ apiKey: 'YOUR_KEY' });
   * const response = await client.fetchIntraday({
   *   symbol: 'ES',
   *   timeframe: '1' as Timeframe, // 1 minute
   *   outputSize: 'compact'
   * });
   * ```
   */
  async fetchIntraday(options: FetchOptions): Promise<AlphaVantageIntradayResponse> {
    // If fixture path is set, load from fixture instead of making HTTP request
    if (this.fixturePath) {
      return this.loadIntradayFixture(options.symbol, options.timeframe);
    }

    // Validate API key for live requests
    if (!this.apiKey) {
      throw new ApiError('Alpha Vantage API key is required for live requests');
    }

    // Map timeframe to Alpha Vantage interval format
    const interval = this.mapTimeframeToInterval(options.timeframe);

    // Build query parameters
    const params = new URLSearchParams({
      function: 'TIME_SERIES_INTRADAY',
      symbol: options.symbol,
      interval,
      apikey: this.apiKey,
      outputsize: options.outputSize || 'compact',
      datatype: 'json',
    });

    const url = `${this.baseUrl}?${params.toString()}`;

    try {
      const response = await this.fetchWithTimeout(url, this.timeout);
      return response as AlphaVantageIntradayResponse;
    } catch (error) {
      throw mapAlphaVantageError(error);
    }
  }

  /**
   * Fetches daily time series data from Alpha Vantage.
   *
   * Returns daily open, high, low, close, and volume data.
   * Compact returns the most recent 100 data points; full returns up to 20+ years.
   *
   * @param options - Fetch options (symbol, outputSize)
   * @returns Promise resolving to daily response
   * @throws {ApiError} If API request fails
   * @throws {RateLimitError} If rate limit exceeded
   *
   * @example
   * ```typescript
   * const client = new AlphaVantageClient({ apiKey: 'YOUR_KEY' });
   * const response = await client.fetchDaily({
   *   symbol: 'ES',
   *   timeframe: '1D' as Timeframe,
   *   outputSize: 'compact'
   * });
   * ```
   */
  async fetchDaily(options: FetchOptions): Promise<AlphaVantageDailyResponse> {
    // If fixture path is set, load from fixture instead of making HTTP request
    if (this.fixturePath) {
      return this.loadDailyFixture(options.symbol);
    }

    // Validate API key for live requests
    if (!this.apiKey) {
      throw new ApiError('Alpha Vantage API key is required for live requests');
    }

    // Build query parameters
    const params = new URLSearchParams({
      function: 'TIME_SERIES_DAILY',
      symbol: options.symbol,
      apikey: this.apiKey,
      outputsize: options.outputSize || 'compact',
      datatype: 'json',
    });

    const url = `${this.baseUrl}?${params.toString()}`;

    try {
      const response = await this.fetchWithTimeout(url, this.timeout);
      return response as AlphaVantageDailyResponse;
    } catch (error) {
      throw mapAlphaVantageError(error);
    }
  }

  /**
   * Makes HTTP request with timeout support.
   *
   * Uses fetch API with AbortController for timeout handling.
   * Validates response status and parses JSON.
   *
   * @param url - URL to fetch
   * @param timeout - Timeout in milliseconds
   * @returns Parsed JSON response
   * @throws {ApiError} If request fails or times out
   *
   * @internal
   */
  private async fetchWithTimeout(url: string, timeout: number): Promise<unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check HTTP status
      if (!response.ok) {
        const text = await response.text();
        let errorData: unknown;
        try {
          errorData = JSON.parse(text);
        } catch {
          errorData = text;
        }
        throw mapAlphaVantageError(errorData, response.status);
      }

      // Parse JSON response
      const data = await response.json();

      // Check for Alpha Vantage API errors in response body
      if (
        data &&
        typeof data === 'object' &&
        ('Error Message' in data || 'Note' in data || 'Information' in data)
      ) {
        throw mapAlphaVantageError(data);
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle fetch abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError(`Request timeout after ${timeout}ms`, undefined, { url, timeout });
      }

      // Re-throw mapped errors
      throw error;
    }
  }

  /**
   * Maps TJR Timeframe to Alpha Vantage interval format.
   *
   * Alpha Vantage supports: 1min, 5min, 60min
   * TJR timeframes are in minutes or special formats (e.g., '1D')
   *
   * @param timeframe - TJR timeframe
   * @returns Alpha Vantage interval string
   * @throws {Error} If timeframe cannot be mapped
   *
   * @internal
   */
  private mapTimeframeToInterval(timeframe: Timeframe): string {
    const mapping: Record<string, string> = {
      '1': '1min', // 1 minute
      '5': '5min', // 5 minutes
      '60': '60min', // 60 minutes (1 hour)
    };

    const interval = mapping[timeframe];
    if (!interval) {
      throw new Error(
        `Timeframe ${timeframe} cannot be mapped to Alpha Vantage interval. ` +
          `Supported: 1m, 5m, 60m`
      );
    }

    return interval;
  }

  /**
   * Loads intraday fixture data from file system.
   *
   * Used for testing to avoid making actual HTTP requests.
   * Fixture files follow naming convention: {symbol}-{interval}-sample.json
   *
   * @param symbol - Stock symbol
   * @param timeframe - Timeframe
   * @returns Parsed fixture data as AlphaVantageIntradayResponse
   * @throws {Error} If fixture file not found or invalid
   *
   * @internal
   */
  private loadIntradayFixture(symbol: string, timeframe: Timeframe): AlphaVantageIntradayResponse {
    if (!this.fixturePath) {
      throw new Error('Fixture path not configured');
    }

    // Map timeframe to fixture filename
    const fixtureMap: Record<string, string> = {
      '1': '1min',
      '5': '5min',
      '60': '60min',
    };

    const interval = fixtureMap[timeframe];
    if (!interval) {
      throw new Error(`No fixture mapping for timeframe: ${timeframe}`);
    }

    const fixturePath = join(this.fixturePath, `${symbol}-${interval}-sample.json`);

    try {
      const content = readFileSync(fixturePath, 'utf-8');
      return JSON.parse(content) as AlphaVantageIntradayResponse;
    } catch (error) {
      throw new Error(
        `Failed to load intraday fixture: ${fixturePath}. ` +
          `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Loads daily fixture data from file system.
   *
   * Used for testing to avoid making actual HTTP requests.
   * Fixture files follow naming convention: {symbol}-daily-sample.json
   *
   * @param symbol - Stock symbol
   * @returns Parsed fixture data as AlphaVantageDailyResponse
   * @throws {Error} If fixture file not found or invalid
   *
   * @internal
   */
  private loadDailyFixture(symbol: string): AlphaVantageDailyResponse {
    if (!this.fixturePath) {
      throw new Error('Fixture path not configured');
    }

    const fixturePath = join(this.fixturePath, `${symbol}-daily-sample.json`);

    try {
      const content = readFileSync(fixturePath, 'utf-8');
      return JSON.parse(content) as AlphaVantageDailyResponse;
    } catch (error) {
      throw new Error(
        `Failed to load daily fixture: ${fixturePath}. ` +
          `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Creates a new Alpha Vantage HTTP client.
 *
 * Factory function for creating AlphaVantageClient instances.
 *
 * @param options - Client configuration options
 * @returns AlphaVantageClient instance
 *
 * @example
 * ```typescript
 * // Create client for live API requests
 * const client = createClient({ apiKey: 'YOUR_KEY' });
 *
 * // Create client for fixture-based testing
 * const testClient = createClient({
 *   fixturePath: '/path/to/__fixtures__'
 * });
 * ```
 */
export function createClient(options: AlphaVantageProviderOptions = {}): AlphaVantageClient {
  return new AlphaVantageClient(options);
}
