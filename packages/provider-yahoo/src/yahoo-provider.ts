/**
 * @fileoverview Yahoo Finance data provider implementation.
 *
 * Implements the provider contract from @tjr/contracts for Yahoo Finance.
 * Currently loads data from fixtures for testing; HTTP implementation planned.
 *
 * @module @tjr/provider-yahoo
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { GetBarsParams, MarketBar, ProviderCapabilities, Timeframe } from '@tjr/contracts';
import { parseTimeframe, isValidTimeframe } from '@tjr/contracts';
import { aggregateBars, type Bar as CoreBar } from '@tjr-suite/market-data-core';
import { parseYahooBars } from './parser.js';
import type { YahooRawBar, YahooProviderOptions } from './types.js';

type MarketDataCoreTimeframe = '1m' | '5m' | '10m' | '1h' | '4h' | '1D';

/**
 * Map Timeframe enum to market-data-core timeframe format
 */
function toMarketDataCoreTimeframe(tf: Timeframe): MarketDataCoreTimeframe {
  const mapping: Record<string, MarketDataCoreTimeframe> = {
    '1': '1m',
    '5': '5m',
    '10': '10m',
    '60': '1h',
    '240': '4h',
    '1D': '1D'
  };

  const result = mapping[tf];
  if (!result) {
    throw new Error(`Cannot map timeframe ${tf} for aggregation`);
  }
  return result;
}

/**
 * Yahoo Finance data provider.
 *
 * Provides historical market data from Yahoo Finance. Currently loads from
 * fixtures for testing; future versions will fetch from Yahoo Finance API.
 */
export class YahooProvider {
  private readonly options: YahooProviderOptions;
  private readonly fixturePath: string;

  /**
   * Creates a new Yahoo Finance provider.
   *
   * @param options - Provider configuration options
   */
  constructor(options: YahooProviderOptions = {}) {
    this.options = options;

    // Determine fixture path
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    this.fixturePath = options.fixturePath || join(moduleDir, '..', '__fixtures__');
  }

  /**
   * Returns provider capabilities descriptor.
   *
   * Describes Yahoo Finance's supported features, timeframes, and rate limits.
   *
   * @returns Provider capabilities
   */
  capabilities(): ProviderCapabilities {
    return {
      supportsTimeframes: ['1' as Timeframe, '5' as Timeframe, '10' as Timeframe, '60' as Timeframe, '240' as Timeframe, '1D' as Timeframe],
      maxBarsPerRequest: 10000,
      requiresAuthentication: false,
      rateLimits: {
        requestsPerMinute: 60,
        requestsPerDay: 2000
      },
      supportsExtendedHours: false,
      historicalDataFrom: '2000-01-01T00:00:00.000Z'
    };
  }

  /**
   * Fetches historical bars from Yahoo Finance.
   *
   * Currently loads from fixture files for testing. Future versions will
   * make HTTP requests to Yahoo Finance API.
   *
   * Supports automatic aggregation for non-native timeframes (e.g., 10m, 4h)
   * using @tjr-suite/market-data-core.
   *
   * @param params - Query parameters (symbol, timeframe, from, to, limit)
   * @returns Array of market bars
   * @throws {Error} If symbol or timeframe is invalid
   *
   * @example
   * ```typescript
   * const provider = new YahooProvider();
   * const bars = await provider.getBars({
   *   symbol: 'ES',
   *   timeframe: Timeframe.M5,
   *   from: '2024-01-15T14:00:00.000Z',
   *   to: '2024-01-15T15:00:00.000Z'
   * });
   * ```
   */
  async getBars(params: GetBarsParams): Promise<MarketBar[]> {
    // Validate parameters
    this.validateParams(params);

    // Determine if we need aggregation
    const { needsAggregation, sourceTimeframe } = this.analyzeTimeframe(params.timeframe);

    // Load bars from fixture
    const rawBars = this.loadFixture(params.symbol, sourceTimeframe);

    // Parse raw data
    const { bars: parsedBars } = parseYahooBars(rawBars);

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
   * @param params - Parameters to validate
   * @throws {Error} If parameters are invalid
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
   * Yahoo Finance natively supports: 1m, 5m, 1h, 1D
   * Other timeframes require aggregation from a smaller native timeframe.
   *
   * @param timeframe - Target timeframe
   * @returns Aggregation info (needsAggregation, sourceTimeframe)
   */
  private analyzeTimeframe(timeframe: Timeframe): { needsAggregation: boolean; sourceTimeframe: Timeframe } {
    const nativeTimeframes: Timeframe[] = ['1' as Timeframe, '5' as Timeframe, '60' as Timeframe, '1D' as Timeframe];

    if (nativeTimeframes.includes(timeframe)) {
      return { needsAggregation: false, sourceTimeframe: timeframe };
    }

    // Determine source timeframe for aggregation
    // 10m -> aggregate from 1m
    // 240m (4h) -> aggregate from 60m (1h)
    let sourceTimeframe: Timeframe;
    switch (timeframe) {
      case '10' as Timeframe: // M10
        sourceTimeframe = '1' as Timeframe; // M1
        break;
      case '240' as Timeframe: // H4
        sourceTimeframe = '60' as Timeframe; // H1
        break;
      default:
        throw new Error(`Unsupported timeframe: ${timeframe}`);
    }

    return { needsAggregation: true, sourceTimeframe };
  }

  /**
   * Loads fixture data for a given symbol and timeframe.
   *
   * @param symbol - Symbol to load
   * @param timeframe - Timeframe to load
   * @returns Array of raw bars from fixture
   * @throws {Error} If fixture file not found
   */
  private loadFixture(symbol: string, timeframe: Timeframe): YahooRawBar[] {
    // Map timeframe to fixture filename
    const timeframeMap: Record<string, string> = {
      '1': '1m',
      '5': '5m',
      '10': '1m', // Will aggregate from 1m
      '60': '1h',
      '240': '1h', // Will aggregate from 1h
      '1D': '1d'
    };

    const tfLabel = timeframeMap[timeframe];
    if (!tfLabel) {
      throw new Error(`No fixture mapping for timeframe: ${timeframe}`);
    }

    const fixturePath = join(this.fixturePath, `${symbol}-${tfLabel}-sample.json`);

    try {
      const content = readFileSync(fixturePath, 'utf-8');
      return JSON.parse(content) as YahooRawBar[];
    } catch (error) {
      throw new Error(`Failed to load fixture: ${fixturePath}. Error: ${error}`);
    }
  }

  /**
   * Filters bars by date range.
   *
   * @param bars - Bars to filter
   * @param from - Start date (ISO 8601, inclusive)
   * @param to - End date (ISO 8601, inclusive, optional)
   * @returns Filtered bars
   */
  private filterByDateRange(bars: MarketBar[], from: string, to?: string): MarketBar[] {
    const fromDate = new Date(from);
    const toDate = to ? new Date(to) : new Date('9999-12-31T23:59:59.999Z');

    return bars.filter(bar => {
      const barDate = new Date(bar.timestamp);
      return barDate >= fromDate && barDate <= toDate;
    });
  }

  /**
   * Aggregates bars to target timeframe using market-data-core.
   *
   * @param bars - Source bars
   * @param targetTimeframe - Target timeframe
   * @returns Aggregated bars
   */
  private aggregateBars(bars: MarketBar[], targetTimeframe: Timeframe): MarketBar[] {
    // Convert MarketBar to CoreBar format (timestamp string -> number)
    const coreBars: CoreBar[] = bars.map(bar => ({
      timestamp: new Date(bar.timestamp).getTime(),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume
    }));

    // Map timeframe using type-safe function
    const coreTimeframe = toMarketDataCoreTimeframe(targetTimeframe);
    const aggregated = aggregateBars(coreBars, coreTimeframe);

    // Convert back to MarketBar format (timestamp number -> string)
    return aggregated.map(bar => ({
      timestamp: new Date(bar.timestamp).toISOString(),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume
    }));
  }
}