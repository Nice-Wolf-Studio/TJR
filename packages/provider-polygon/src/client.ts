/**
 * HTTP client stub for Polygon.io API.
 *
 * This module provides a stubbed HTTP client interface that will be
 * replaced with actual fixtures in tests. The implementation does NOT
 * make real HTTP requests.
 */

import type { Logger } from "@tjr/logger";
import type { PolygonAggregatesResponse } from "./types.js";
import { ApiError, RateLimitError } from "./errors.js";

/**
 * HTTP client configuration.
 */
export interface ClientConfig {
  /**
   * Polygon.io API key.
   */
  apiKey: string;

  /**
   * Base URL for Polygon.io API.
   * Defaults to https://api.polygon.io
   */
  baseUrl: string;

  /**
   * Request timeout in milliseconds.
   * Defaults to 30000 (30 seconds).
   */
  timeout: number;

  /**
   * Logger instance for debug and error logging.
   */
  logger?: Logger;
}

/**
 * HTTP client for Polygon.io API.
 *
 * This is a stub implementation that does NOT make actual HTTP requests.
 * In tests, this will be replaced with fixtures that return pre-recorded
 * responses.
 *
 * @internal
 */
export class PolygonClient {
  private readonly config: ClientConfig;

  /**
   * Creates a new PolygonClient.
   *
   * @param config - Client configuration
   */
  constructor(config: ClientConfig) {
    this.config = config;
  }

  /**
   * Fetches aggregates (bars) from Polygon.io API.
   *
   * STUB: This method does NOT make actual HTTP requests.
   * It will be replaced with fixtures in tests.
   *
   * @param symbol - Stock symbol (e.g., 'SPY')
   * @param multiplier - Timeframe multiplier (e.g., 5 for 5-minute bars)
   * @param timespan - Timespan unit ('minute', 'hour', 'day')
   * @param from - Start timestamp (Unix milliseconds)
   * @param to - End timestamp (Unix milliseconds)
   * @param limit - Maximum number of bars to return
   * @returns Promise resolving to aggregates response
   *
   * @throws RateLimitError if rate limit exceeded (429)
   * @throws ApiError for other HTTP errors
   *
   * @example
   * ```typescript
   * // Fetch 5-minute bars for SPY from Jan 1 to Jan 31
   * const response = await client.getAggregates(
   *   'SPY',
   *   5,
   *   'minute',
   *   Date.parse('2025-01-01'),
   *   Date.parse('2025-01-31'),
   *   10000
   * );
   * ```
   */
  async getAggregates(
    symbol: string,
    multiplier: number,
    timespan: string,
    from: number,
    to: number,
    limit?: number
  ): Promise<PolygonAggregatesResponse> {
    // Normalize symbol to uppercase
    const ticker = symbol.toUpperCase();

    // Build API URL
    const url = this.buildAggregatesUrl(ticker, multiplier, timespan, from, to, limit);

    // Log request (if logger available)
    this.config.logger?.debug("Polygon API request", {
      url,
      symbol: ticker,
      multiplier,
      timespan,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      limit,
    });

    // STUB: In actual implementation, this would make an HTTP request.
    // For now, return a stub response indicating the method was called.
    // In tests, this will be replaced with fixture data.
    throw new Error(
      `STUB: PolygonClient.getAggregates called for ${ticker}. ` +
      `This method does not make actual HTTP requests. ` +
      `Replace with fixtures in tests.`
    );
  }

  /**
   * Builds the Polygon.io aggregates API URL.
   *
   * @param ticker - Stock symbol (uppercase)
   * @param multiplier - Timeframe multiplier
   * @param timespan - Timespan unit
   * @param from - Start timestamp (Unix milliseconds)
   * @param to - End timestamp (Unix milliseconds)
   * @param limit - Optional limit
   * @returns Full API URL with query parameters
   *
   * @internal
   */
  private buildAggregatesUrl(
    ticker: string,
    multiplier: number,
    timespan: string,
    from: number,
    to: number,
    limit?: number
  ): string {
    // Format: /v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to}
    const path = `/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`;

    // Build query parameters
    const params = new URLSearchParams();
    params.set("adjusted", "true"); // Use split-adjusted prices
    params.set("sort", "asc"); // Sort by timestamp ascending
    if (limit !== undefined) {
      params.set("limit", String(limit));
    }
    params.set("apiKey", this.config.apiKey);

    return `${this.config.baseUrl}${path}?${params.toString()}`;
  }
}

/**
 * Creates a new Polygon HTTP client.
 *
 * @param config - Client configuration
 * @returns PolygonClient instance
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   apiKey: 'your-api-key',
 *   baseUrl: 'https://api.polygon.io',
 *   timeout: 30000,
 *   logger: createLogger({ level: 'info' })
 * });
 * ```
 */
export function createClient(config: ClientConfig): PolygonClient {
  return new PolygonClient(config);
}