/**
 * @fileoverview Alpha Vantage data provider implementation.
 *
 * Implements the provider contract from @tjr/contracts for Alpha Vantage.
 * Supports intraday (1m, 5m, 10m, 60m, 4h) and daily (1D) timeframes,
 * with automatic aggregation for non-native timeframes using @tjr-suite/market-data-core.
 *
 * Alpha Vantage API provides free and premium market data with rate limits:
 * - Free tier: 5 requests per minute, 500 requests per day
 * - Premium tiers: Higher limits and additional features
 *
 * @module @tjr/provider-alphavantage
 * @example
 * ```typescript
 * import { AlphaVantageProvider } from '@tjr/provider-alphavantage';
 * import { Timeframe } from '@tjr/contracts';
 *
 * const provider = new AlphaVantageProvider({ apiKey: 'YOUR_KEY' });
 * const bars = await provider.getBars({
 *   symbol: 'AAPL',
 *   timeframe: Timeframe.M5,
 *   from: '2024-01-15T14:00:00.000Z',
 *   to: '2024-01-15T15:00:00.000Z'
 * });
 * ```
 */

import { join } from 'node:path';
import type { GetBarsParams, MarketBar, ProviderCapabilities, Timeframe } from '@tjr/contracts';
import { isValidTimeframe } from '@tjr/contracts';
import { aggregateBars, type Bar as CoreBar } from '@tjr-suite/market-data-core';
import { AlphaVantageClient } from './client.js';
import { parseIntradayResponse, parseDailyResponse } from './parser.js';
import type { AlphaVantageProviderOptions } from './types.js';

/**
 * Market-data-core timeframe format.
 *
 * @internal
 */
type MarketDataCoreTimeframe = '1m' | '5m' | '10m' | '1h' | '4h' | '1D';

/**
 * Alpha Vantage data provider.
 *
 * Provides historical market data from Alpha Vantage API. Supports both
 * live API requests (with API key) and fixture-based testing (with fixturePath).
 *
 * Native timeframes: 1m, 5m, 60m (1h), 1D
 * Aggregated timeframes: 10m (from 5m), 4h (from 1h)
 *
 * @example
 * ```typescript
 * // Live API usage
 * const provider = new AlphaVantageProvider({ apiKey: 'YOUR_KEY' });
 *
 * // Fixture-based testing
 * const testProvider = new AlphaVantageProvider({
 *   fixturePath: '/path/to/__fixtures__'
 * });
 * ```
 */
export class AlphaVantageProvider {
  private readonly client: AlphaVantageClient;
  private readonly options: AlphaVantageProviderOptions;

  /**
   * Creates a new Alpha Vantage provider.
   *
   * @param options - Provider configuration options
   *
   * @example
   * ```typescript
   * // With API key for live requests
   * const provider = new AlphaVantageProvider({
   *   apiKey: 'YOUR_KEY',
   *   timeout: 30000
   * });
   *
   * // With fixtures for testing
   * const provider = new AlphaVantageProvider({
   *   fixturePath: '/path/to/__fixtures__'
   * });
   * ```
   */
  constructor(options: AlphaVantageProviderOptions = {}) {
    // Determine fixture path if not provided
    // At runtime, this will be in dist/ so fixtures are at ../__fixtures__
    if (!options.fixturePath && !options.apiKey) {
      options.fixturePath = join(__dirname, '..', '__fixtures__');
    }

    this.options = options;
    this.client = new AlphaVantageClient(options);
  }

  /**
   * Returns provider capabilities descriptor.
   *
   * Describes Alpha Vantage's supported features, timeframes, and rate limits.
   * Reflects free tier limitations; premium tiers have higher limits.
   *
   * @returns Provider capabilities
   *
   * @example
   * ```typescript
   * const provider = new AlphaVantageProvider({ apiKey: 'YOUR_KEY' });
   * const caps = provider.capabilities();
   * console.log('Supported timeframes:', caps.supportsTimeframes);
   * console.log('Rate limit:', caps.rateLimits);
   * ```
   */
  capabilities(): ProviderCapabilities {
    return {
      // Native: 1m, 5m, 60m (1h), 1D
      // Aggregated: 10m (from 5m), 4h (from 1h)
      supportsTimeframes: [
        '1' as Timeframe, // 1 minute
        '5' as Timeframe, // 5 minutes
        '10' as Timeframe, // 10 minutes (aggregated from 5m)
        '60' as Timeframe, // 60 minutes (1 hour)
        '240' as Timeframe, // 240 minutes (4 hours, aggregated from 1h)
        '1D' as Timeframe, // 1 day
      ],
      maxBarsPerRequest: 100, // Compact output size (default)
      requiresAuthentication: true,
      rateLimits: {
        requestsPerMinute: 5, // Free tier: 5 requests per minute
        requestsPerDay: 500, // Free tier: 500 requests per day
      },
      supportsExtendedHours: false,
      historicalDataFrom: '2000-01-01T00:00:00.000Z', // Alpha Vantage provides ~20 years of data
    };
  }

  /**
   * Fetches historical bars from Alpha Vantage.
   *
   * Supports both intraday and daily timeframes. For non-native timeframes
   * (10m, 4h), automatically aggregates from smaller native timeframes using
   * @tjr-suite/market-data-core.
   *
   * Intraday timeframes (1m, 5m, 60m):
   * - Use TIME_SERIES_INTRADAY endpoint
   * - Data in US/Eastern timezone
   * - Compact: 100 most recent bars
   * - Full: Full intraday history (premium)
   *
   * Daily timeframe (1D):
   * - Use TIME_SERIES_DAILY endpoint
   * - Compact: 100 most recent days
   * - Full: 20+ years of history
   *
   * @param params - Query parameters (symbol, timeframe, from, to, limit)
   * @returns Array of market bars sorted by timestamp (oldest first)
   * @throws {Error} If parameters are invalid
   * @throws {ApiError} If API request fails
   * @throws {RateLimitError} If rate limit exceeded
   * @throws {ParseError} If response cannot be parsed
   *
   * @example
   * ```typescript
   * const provider = new AlphaVantageProvider({ apiKey: 'YOUR_KEY' });
   *
   * // Fetch 5-minute bars
   * const bars = await provider.getBars({
   *   symbol: 'AAPL',
   *   timeframe: Timeframe.M5,
   *   from: '2024-01-15T14:00:00.000Z',
   *   to: '2024-01-15T15:00:00.000Z'
   * });
   *
   * // Fetch daily bars with limit
   * const dailyBars = await provider.getBars({
   *   symbol: 'AAPL',
   *   timeframe: Timeframe.D1,
   *   from: '2024-01-01T00:00:00.000Z',
   *   limit: 30
   * });
   * ```
   */
  async getBars(params: GetBarsParams): Promise<MarketBar[]> {
    // Validate parameters
    this.validateParams(params);

    // Determine if we need aggregation and source timeframe
    const { needsAggregation, sourceTimeframe, isDaily } = this.analyzeTimeframe(params.timeframe);

    // Fetch data from Alpha Vantage (or fixtures)
    let parsedBars: MarketBar[];

    if (isDaily) {
      // Fetch daily data
      const response = await this.client.fetchDaily({
        symbol: params.symbol,
        timeframe: sourceTimeframe,
        outputSize: 'compact', // Default to compact for 100 bars
      });

      const parseResult = parseDailyResponse(response);
      parsedBars = parseResult.bars.map((bar) => ({
        timestamp: bar.timestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      }));
    } else {
      // Fetch intraday data
      const response = await this.client.fetchIntraday({
        symbol: params.symbol,
        timeframe: sourceTimeframe,
        outputSize: 'compact', // Default to compact for 100 bars
      });

      const parseResult = parseIntradayResponse(response);
      parsedBars = parseResult.bars.map((bar) => ({
        timestamp: bar.timestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      }));
    }

    // Filter by date range if specified
    let filteredBars = this.filterByDateRange(parsedBars, params.from, params.to);

    // Aggregate if needed
    if (needsAggregation) {
      filteredBars = this.aggregateBars(filteredBars, params.timeframe);
    }

    // Apply limit if specified
    if (params.limit && params.limit > 0) {
      filteredBars = filteredBars.slice(0, params.limit);
    }

    return filteredBars;
  }

  /**
   * Validates getBars parameters.
   *
   * Checks that all required parameters are present and valid:
   * - symbol: non-empty string
   * - timeframe: valid Timeframe enum value
   * - from: ISO 8601 date string
   * - to: optional ISO 8601 date string
   * - limit: optional positive number
   *
   * @param params - Parameters to validate
   * @throws {Error} If parameters are invalid
   *
   * @internal
   */
  private validateParams(params: GetBarsParams): void {
    if (!params.symbol || typeof params.symbol !== 'string') {
      throw new Error('Invalid symbol: must be a non-empty string');
    }

    if (!isValidTimeframe(params.timeframe)) {
      throw new Error(`Invalid timeframe: ${params.timeframe}`);
    }

    if (!params.from || typeof params.from !== 'string') {
      throw new Error('Invalid from date: must be an ISO 8601 string');
    }

    if (params.to && typeof params.to !== 'string') {
      throw new Error('Invalid to date: must be an ISO 8601 string');
    }

    if (params.limit !== undefined && (typeof params.limit !== 'number' || params.limit <= 0)) {
      throw new Error('Invalid limit: must be a positive number');
    }

    // Validate date range
    if (params.to) {
      const fromDate = new Date(params.from);
      const toDate = new Date(params.to);
      if (fromDate > toDate) {
        throw new Error('Invalid date range: from must be <= to');
      }
    }
  }

  /**
   * Analyzes timeframe to determine if aggregation is needed.
   *
   * Alpha Vantage natively supports: 1m, 5m, 60m (1h), 1D
   * Other timeframes require aggregation from a smaller native timeframe:
   * - 10m -> aggregate from 5m
   * - 4h (240m) -> aggregate from 1h (60m)
   *
   * @param timeframe - Target timeframe
   * @returns Aggregation analysis (needsAggregation, sourceTimeframe, isDaily)
   * @throws {Error} If timeframe is unsupported
   *
   * @internal
   */
  private analyzeTimeframe(timeframe: Timeframe): {
    needsAggregation: boolean;
    sourceTimeframe: Timeframe;
    isDaily: boolean;
  } {
    // Daily timeframe
    if (timeframe === ('1D' as Timeframe)) {
      return {
        needsAggregation: false,
        sourceTimeframe: timeframe,
        isDaily: true,
      };
    }

    // Native intraday timeframes
    const nativeTimeframes: Timeframe[] = [
      '1' as Timeframe, // 1 minute
      '5' as Timeframe, // 5 minutes
      '60' as Timeframe, // 60 minutes (1 hour)
    ];

    if (nativeTimeframes.includes(timeframe)) {
      return {
        needsAggregation: false,
        sourceTimeframe: timeframe,
        isDaily: false,
      };
    }

    // Determine source timeframe for aggregation
    let sourceTimeframe: Timeframe;
    switch (timeframe) {
      case '10' as Timeframe: // 10 minutes
        sourceTimeframe = '5' as Timeframe; // Aggregate from 5m
        break;
      case '240' as Timeframe: // 4 hours
        sourceTimeframe = '60' as Timeframe; // Aggregate from 1h
        break;
      default:
        throw new Error(
          `Unsupported timeframe: ${timeframe}. ` + `Supported: 1m, 5m, 10m, 60m, 4h, 1D`
        );
    }

    return {
      needsAggregation: true,
      sourceTimeframe,
      isDaily: false,
    };
  }

  /**
   * Filters bars by date range.
   *
   * Returns bars within the specified date range (inclusive).
   * If 'to' is not specified, includes all bars from 'from' onward.
   *
   * @param bars - Bars to filter
   * @param from - Start date (ISO 8601, inclusive)
   * @param to - End date (ISO 8601, inclusive, optional)
   * @returns Filtered bars
   *
   * @internal
   */
  private filterByDateRange(bars: MarketBar[], from: string, to?: string): MarketBar[] {
    const fromDate = new Date(from);
    const toDate = to ? new Date(to) : new Date('9999-12-31T23:59:59.999Z');

    return bars.filter((bar) => {
      const barDate = new Date(bar.timestamp);
      return barDate >= fromDate && barDate <= toDate;
    });
  }

  /**
   * Aggregates bars to target timeframe using @tjr-suite/market-data-core.
   *
   * Converts MarketBar format to market-data-core Bar format (timestamp string -> number),
   * performs aggregation, then converts back to MarketBar format.
   *
   * Supported aggregations:
   * - 10m from 5m bars
   * - 4h from 1h bars
   *
   * @param bars - Source bars to aggregate
   * @param targetTimeframe - Target timeframe
   * @returns Aggregated bars
   * @throws {Error} If timeframe cannot be mapped for aggregation
   *
   * @internal
   */
  private aggregateBars(bars: MarketBar[], targetTimeframe: Timeframe): MarketBar[] {
    // Convert MarketBar to CoreBar format (timestamp string -> number)
    const coreBars: CoreBar[] = bars.map((bar) => ({
      timestamp: new Date(bar.timestamp).getTime(),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    }));

    // Map timeframe to market-data-core format
    const coreTimeframe = this.toMarketDataCoreTimeframe(targetTimeframe);

    // Perform aggregation
    const aggregated = aggregateBars(coreBars, coreTimeframe);

    // Convert back to MarketBar format (timestamp number -> string)
    return aggregated.map((bar) => ({
      timestamp: new Date(bar.timestamp).toISOString(),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    }));
  }

  /**
   * Maps TJR Timeframe enum to market-data-core timeframe format.
   *
   * market-data-core uses string literals: '1m', '5m', '10m', '1h', '4h', '1D'
   * TJR uses numeric minutes or special formats: '1', '5', '10', '60', '240', '1D'
   *
   * @param tf - TJR Timeframe
   * @returns market-data-core timeframe string
   * @throws {Error} If timeframe cannot be mapped
   *
   * @internal
   */
  private toMarketDataCoreTimeframe(tf: Timeframe): MarketDataCoreTimeframe {
    const mapping: Record<string, MarketDataCoreTimeframe> = {
      '1': '1m', // 1 minute
      '5': '5m', // 5 minutes
      '10': '10m', // 10 minutes
      '60': '1h', // 60 minutes (1 hour)
      '240': '4h', // 240 minutes (4 hours)
      '1D': '1D', // 1 day
    };

    const result = mapping[tf];
    if (!result) {
      throw new Error(
        `Cannot map timeframe ${tf} for aggregation. ` + `Supported: 1m, 5m, 10m, 1h, 4h, 1D`
      );
    }
    return result;
  }
}

// Export types
export type { AlphaVantageProviderOptions } from './types.js';
export type { ParsedBar, ParseResult } from './types.js';

// Export parser utilities
export { parseIntradayResponse, parseDailyResponse } from './parser.js';

// Export error classes
export {
  AlphaVantageError,
  RateLimitError,
  ApiError,
  ParseError,
  AuthenticationError,
  SymbolNotFoundError,
  PremiumFeatureError,
  mapAlphaVantageError,
  isRetryableError,
  getRetryDelay,
} from './errors.js';
