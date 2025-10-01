/**
 * @tjr/provider-polygon
 *
 * Polygon.io market data provider adapter for TJR Suite.
 *
 * This package provides a standardized interface for fetching historical
 * OHLCV bars from Polygon.io. It handles:
 * - Timeframe normalization and aggregation
 * - Rate limit handling
 * - Response parsing and validation
 * - Error handling with structured error types
 *
 * Key features:
 * - Supports all standard timeframes (1m, 5m, 10m, 15m, 30m, 1h, 2h, 4h, 1D)
 * - Aggregates 10m and 4h bars from native Polygon timeframes
 * - Graceful rate limit handling with retry guidance
 * - Comprehensive JSDoc documentation
 *
 * @example
 * ```typescript
 * import { createPolygonProvider } from "@tjr/provider-polygon";
 * import { createLogger } from "@tjr/logger";
 *
 * const provider = createPolygonProvider({
 *   apiKey: 'your-polygon-api-key',
 *   logger: createLogger({ level: 'info' })
 * });
 *
 * const bars = await provider.getBars({
 *   symbol: 'SPY',
 *   timeframe: '5m',
 *   from: new Date('2025-01-01'),
 *   to: new Date('2025-01-31')
 * });
 *
 * const capabilities = provider.capabilities();
 * console.log('Supported timeframes:', capabilities.supportsTimeframes);
 * ```
 *
 * @packageDocumentation
 */

import type { Bar } from "@tjr-suite/market-data-core";
import type { ProviderCapabilities } from "@tjr/contracts";
import { Timeframe } from "@tjr/contracts";
import type {
  PolygonProviderConfig,
  GetBarsOptions,
  Provider,
} from "./types.js";
import { createClient, PolygonClient } from "./client.js";
import { parseAggregatesResponse } from "./parse.js";
import {
  getSourceTimeframe,
  toPolygonParams,
  aggregateToTimeframe,
  POLYGON_SUPPORTED_TIMEFRAMES,
} from "./aggregate.js";

/**
 * Creates a new Polygon.io provider instance.
 *
 * The provider implements the standard Provider interface for fetching
 * historical market data and reporting capabilities.
 *
 * @param config - Provider configuration
 * @returns Provider instance with getBars() and capabilities() methods
 *
 * @throws Error if config is missing required fields
 *
 * @example
 * ```typescript
 * import { createPolygonProvider } from "@tjr/provider-polygon";
 * import { createLogger } from "@tjr/logger";
 *
 * const provider = createPolygonProvider({
 *   apiKey: process.env.POLYGON_API_KEY!,
 *   baseUrl: 'https://api.polygon.io', // optional
 *   timeout: 30000, // optional (default: 30s)
 *   logger: createLogger({ level: 'debug' }) // optional
 * });
 *
 * // Fetch 5-minute bars
 * const bars = await provider.getBars({
 *   symbol: 'SPY',
 *   timeframe: '5m',
 *   from: new Date('2025-01-01'),
 *   to: new Date('2025-01-31'),
 *   limit: 10000
 * });
 *
 * // Check capabilities
 * const caps = provider.capabilities();
 * console.log('Max bars per request:', caps.maxBarsPerRequest);
 * console.log('Rate limit:', caps.rateLimits.requestsPerMinute, 'req/min');
 * ```
 */
export function createPolygonProvider(config: PolygonProviderConfig): Provider {
  // Validate required config
  if (!config.apiKey) {
    throw new Error("PolygonProviderConfig.apiKey is required");
  }

  // Create HTTP client
  const client = createClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl || "https://api.polygon.io",
    timeout: config.timeout || 30000,
    logger: config.logger,
  });

  // Return provider interface
  return {
    /**
     * Fetches historical bars for a given symbol and timeframe.
     *
     * This method handles:
     * 1. Determining source timeframe (native or requires aggregation)
     * 2. Converting timeframe to Polygon API parameters
     * 3. Fetching bars from Polygon API
     * 4. Parsing and validating response
     * 5. Aggregating to target timeframe if needed
     *
     * @param options - Bar fetch options
     * @returns Promise resolving to array of bars sorted by timestamp ascending
     *
     * @throws RateLimitError if rate limit exceeded (429)
     * @throws ApiError for HTTP errors (4xx, 5xx)
     * @throws ParseError if response is malformed
     *
     * @example
     * ```typescript
     * // Fetch native 5m bars (no aggregation)
     * const bars5m = await provider.getBars({
     *   symbol: 'SPY',
     *   timeframe: '5m',
     *   from: new Date('2025-01-01'),
     *   to: new Date('2025-01-31')
     * });
     *
     * // Fetch 10m bars (aggregated from 5m)
     * const bars10m = await provider.getBars({
     *   symbol: 'AAPL',
     *   timeframe: '10m',
     *   from: new Date('2025-01-01'),
     *   to: new Date('2025-01-31'),
     *   limit: 5000
     * });
     *
     * // Fetch 4h bars (aggregated from 1h)
     * const bars4h = await provider.getBars({
     *   symbol: 'TSLA',
     *   timeframe: '4h',
     *   from: new Date('2025-01-01'),
     *   to: new Date('2025-01-31')
     * });
     * ```
     */
    getBars: async (options: GetBarsOptions): Promise<Bar[]> => {
      const { symbol, timeframe, from, to, limit } = options;

      // Log request
      config.logger?.info("Fetching bars from Polygon", {
        symbol,
        timeframe,
        from: from.toISOString(),
        to: to.toISOString(),
        limit,
      });

      // Determine source timeframe (may differ from target if aggregation needed)
      const sourceTimeframe = getSourceTimeframe(timeframe);

      // Convert source timeframe to Polygon API parameters
      const { multiplier, timespan } = toPolygonParams(sourceTimeframe);

      // Convert dates to Unix milliseconds
      const fromMs = from.getTime();
      const toMs = to.getTime();

      // Fetch aggregates from Polygon API
      const response = await client.getAggregates(
        symbol,
        multiplier,
        timespan,
        fromMs,
        toMs,
        limit
      );

      // Parse response into Bar array
      const sourceBars = parseAggregatesResponse(response);

      // Log source bars count
      config.logger?.debug("Received source bars", {
        symbol,
        sourceTimeframe,
        count: sourceBars.length,
      });

      // Aggregate to target timeframe if needed
      const bars = aggregateToTimeframe(sourceBars, timeframe);

      // Log final bars count
      config.logger?.info("Bars fetched successfully", {
        symbol,
        timeframe,
        count: bars.length,
        firstTimestamp: bars[0]?.timestamp
          ? new Date(bars[0].timestamp).toISOString()
          : null,
        lastTimestamp: bars[bars.length - 1]?.timestamp
          ? new Date(bars[bars.length - 1].timestamp).toISOString()
          : null,
      });

      return bars;
    },

    /**
     * Returns the provider's capabilities.
     *
     * This information is used for:
     * - Provider selection (which timeframes are supported?)
     * - Query validation (is limit within max?)
     * - Rate limit handling (how many requests can we make?)
     *
     * @returns Provider capabilities object
     *
     * @example
     * ```typescript
     * const caps = provider.capabilities();
     *
     * // Check supported timeframes
     * if (caps.supportsTimeframes.includes('10m')) {
     *   console.log('10m timeframe is supported');
     * }
     *
     * // Check rate limits
     * console.log(`Rate limit: ${caps.rateLimits.requestsPerMinute} req/min`);
     *
     * // Check max bars per request
     * if (myLimit > caps.maxBarsPerRequest) {
     *   throw new Error('Limit exceeds provider maximum');
     * }
     * ```
     */
    capabilities: (): ProviderCapabilities => {
      return {
        // All timeframes supported (native + aggregated)
        supportsTimeframes: POLYGON_SUPPORTED_TIMEFRAMES,

        // Polygon API allows up to 50,000 bars per request
        maxBarsPerRequest: 50000,

        // Authentication required (API key)
        requiresAuthentication: true,

        // Rate limits (from Polygon.io docs)
        // Free tier: 5 requests per minute
        // Starter tier: 100 requests per minute
        // Developer tier: 200 requests per minute
        // Advanced tier: Unlimited
        //
        // We report conservative limits for free tier.
        // Users with paid plans can override via custom rate limiting.
        rateLimits: {
          requestsPerMinute: 5, // Free tier
          requestsPerDay: undefined, // No daily limit
        },

        // Polygon supports extended hours data
        supportsExtendedHours: true,

        // Historical data availability varies by plan
        // Free tier: 2 years
        // Paid tiers: Unlimited
        // We report conservative value for free tier
        historicalDataFrom: new Date(
          Date.now() - 2 * 365 * 24 * 60 * 60 * 1000
        ).toISOString(),
      };
    },
  };
}

// Re-export public types and utilities
export type {
  PolygonProviderConfig,
  GetBarsOptions,
  Provider,
} from "./types.js";

export {
  RateLimitError,
  ApiError,
  ParseError,
  isRateLimitError,
  isApiError,
  isParseError,
} from "./errors.js";

export {
  parseAggregatesResponse,
  parseAggregate,
  parseIntraday,
  parseDaily,
} from "./parse.js";

export {
  POLYGON_NATIVE_TIMEFRAMES,
  POLYGON_AGGREGATED_TIMEFRAMES,
  POLYGON_SUPPORTED_TIMEFRAMES,
  requiresAggregation,
  getSourceTimeframe,
  toPolygonParams,
  aggregateToTimeframe,
  estimateAggregatedCount,
} from "./aggregate.js";