/**
 * Parsing utilities for Polygon.io API responses.
 *
 * This module provides functions to convert Polygon.io API responses into
 * the canonical Bar format used by @tjr-suite/market-data-core.
 */

import type { Bar } from "@tjr-suite/market-data-core";
import type { PolygonAggregatesResponse, PolygonAggregate } from "./types.js";
import { ParseError } from "./errors.js";

/**
 * Parses Polygon.io aggregates API response into Bar array.
 *
 * This function handles both intraday (minute/hour) and daily timeframes.
 * It validates the response structure and converts Polygon's compact format
 * to the canonical OHLCV Bar type.
 *
 * @param response - Raw response from Polygon.io aggregates API
 * @returns Array of parsed bars sorted by timestamp ascending
 *
 * @throws ParseError if response is malformed or missing required fields
 *
 * @example
 * ```typescript
 * const response: PolygonAggregatesResponse = {
 *   status: 'OK',
 *   ticker: 'SPY',
 *   resultsCount: 2,
 *   queryCount: 2,
 *   adjusted: true,
 *   results: [
 *     { t: 1640995200000, o: 475.5, h: 476.2, l: 475.1, c: 476.0, v: 1000000, vw: 475.8, n: 500 },
 *     { t: 1640995500000, o: 476.0, h: 476.5, l: 475.8, c: 476.3, v: 1200000, vw: 476.1, n: 600 }
 *   ]
 * };
 *
 * const bars = parseAggregatesResponse(response);
 * // Returns:
 * // [
 * //   { timestamp: 1640995200000, open: 475.5, high: 476.2, low: 475.1, close: 476.0, volume: 1000000 },
 * //   { timestamp: 1640995500000, open: 476.0, high: 476.5, low: 475.8, close: 476.3, volume: 1200000 }
 * // ]
 * ```
 */
export function parseAggregatesResponse(response: PolygonAggregatesResponse): Bar[] {
  // Validate response status
  if (response.status !== "OK") {
    throw new ParseError(`Polygon API returned error status: ${response.status}`, {
      responseBody: JSON.stringify(response),
      field: "status",
      expectedType: "OK",
      actualType: response.status,
      error: response.error,
    });
  }

  // Validate results array exists
  if (!response.results) {
    throw new ParseError("Missing required field: results", {
      responseBody: JSON.stringify(response),
      field: "results",
      expectedType: "array",
      actualType: typeof response.results,
    });
  }

  // Validate results is an array
  if (!Array.isArray(response.results)) {
    throw new ParseError("Field 'results' must be an array", {
      responseBody: JSON.stringify(response),
      field: "results",
      expectedType: "array",
      actualType: typeof response.results,
    });
  }

  // Parse each aggregate into a Bar
  const bars: Bar[] = [];
  for (let i = 0; i < response.results.length; i++) {
    const aggregate = response.results[i];
    if (!aggregate) {
      continue; // Skip undefined entries
    }

    try {
      const bar = parseAggregate(aggregate);
      bars.push(bar);
    } catch (error) {
      throw new ParseError(`Failed to parse aggregate at index ${i}`, {
        responseBody: JSON.stringify(response),
        field: `results[${i}]`,
        aggregate: JSON.stringify(aggregate),
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Sort bars by timestamp ascending (should already be sorted, but ensure)
  bars.sort((a, b) => a.timestamp - b.timestamp);

  return bars;
}

/**
 * Parses a single Polygon aggregate into a Bar.
 *
 * This function validates that all required fields are present and converts
 * Polygon's compact field names (o, h, l, c, v, t) to the canonical Bar format.
 *
 * @param aggregate - Single aggregate from Polygon API
 * @returns Parsed Bar
 *
 * @throws ParseError if aggregate is missing required fields or has invalid values
 *
 * @example
 * ```typescript
 * const aggregate: PolygonAggregate = {
 *   t: 1640995200000,
 *   o: 475.5,
 *   h: 476.2,
 *   l: 475.1,
 *   c: 476.0,
 *   v: 1000000,
 *   vw: 475.8,
 *   n: 500
 * };
 *
 * const bar = parseAggregate(aggregate);
 * // Returns: { timestamp: 1640995200000, open: 475.5, high: 476.2, low: 475.1, close: 476.0, volume: 1000000 }
 * ```
 */
export function parseAggregate(aggregate: PolygonAggregate): Bar {
  // Validate required fields are present
  const requiredFields: Array<keyof PolygonAggregate> = ["t", "o", "h", "l", "c", "v"];
  for (const field of requiredFields) {
    if (aggregate[field] === undefined || aggregate[field] === null) {
      throw new ParseError(`Missing required field: ${field}`, {
        aggregate: JSON.stringify(aggregate),
        field,
        expectedType: "number",
        actualType: typeof aggregate[field],
      });
    }
  }

  // Validate field types
  if (typeof aggregate.t !== "number") {
    throw new ParseError("Field 't' (timestamp) must be a number", {
      aggregate: JSON.stringify(aggregate),
      field: "t",
      expectedType: "number",
      actualType: typeof aggregate.t,
    });
  }

  if (typeof aggregate.o !== "number") {
    throw new ParseError("Field 'o' (open) must be a number", {
      aggregate: JSON.stringify(aggregate),
      field: "o",
      expectedType: "number",
      actualType: typeof aggregate.o,
    });
  }

  if (typeof aggregate.h !== "number") {
    throw new ParseError("Field 'h' (high) must be a number", {
      aggregate: JSON.stringify(aggregate),
      field: "h",
      expectedType: "number",
      actualType: typeof aggregate.h,
    });
  }

  if (typeof aggregate.l !== "number") {
    throw new ParseError("Field 'l' (low) must be a number", {
      aggregate: JSON.stringify(aggregate),
      field: "l",
      expectedType: "number",
      actualType: typeof aggregate.l,
    });
  }

  if (typeof aggregate.c !== "number") {
    throw new ParseError("Field 'c' (close) must be a number", {
      aggregate: JSON.stringify(aggregate),
      field: "c",
      expectedType: "number",
      actualType: typeof aggregate.c,
    });
  }

  if (typeof aggregate.v !== "number") {
    throw new ParseError("Field 'v' (volume) must be a number", {
      aggregate: JSON.stringify(aggregate),
      field: "v",
      expectedType: "number",
      actualType: typeof aggregate.v,
    });
  }

  // Validate OHLC invariants
  if (aggregate.h < aggregate.l) {
    throw new ParseError("High price must be >= low price", {
      aggregate: JSON.stringify(aggregate),
      field: "h,l",
      high: aggregate.h,
      low: aggregate.l,
    });
  }

  if (aggregate.h < aggregate.o || aggregate.h < aggregate.c) {
    throw new ParseError("High price must be >= open and close", {
      aggregate: JSON.stringify(aggregate),
      field: "h,o,c",
      high: aggregate.h,
      open: aggregate.o,
      close: aggregate.c,
    });
  }

  if (aggregate.l > aggregate.o || aggregate.l > aggregate.c) {
    throw new ParseError("Low price must be <= open and close", {
      aggregate: JSON.stringify(aggregate),
      field: "l,o,c",
      low: aggregate.l,
      open: aggregate.o,
      close: aggregate.c,
    });
  }

  // Validate volume is non-negative
  if (aggregate.v < 0) {
    throw new ParseError("Volume must be non-negative", {
      aggregate: JSON.stringify(aggregate),
      field: "v",
      volume: aggregate.v,
    });
  }

  // Convert to canonical Bar format
  return {
    timestamp: aggregate.t,
    open: aggregate.o,
    high: aggregate.h,
    low: aggregate.l,
    close: aggregate.c,
    volume: aggregate.v,
  };
}

/**
 * Parses intraday (minute/hour) data from Polygon.io.
 *
 * This is an alias for parseAggregatesResponse, provided for semantic clarity
 * when working with intraday timeframes.
 *
 * @param response - Raw response from Polygon.io aggregates API
 * @returns Array of parsed bars sorted by timestamp ascending
 *
 * @example
 * ```typescript
 * // Fetch 5-minute bars
 * const response = await client.getAggregates('SPY', 5, 'minute', from, to);
 * const bars = parseIntraday(response);
 * ```
 */
export function parseIntraday(response: PolygonAggregatesResponse): Bar[] {
  return parseAggregatesResponse(response);
}

/**
 * Parses daily data from Polygon.io.
 *
 * This is an alias for parseAggregatesResponse, provided for semantic clarity
 * when working with daily timeframes.
 *
 * @param response - Raw response from Polygon.io aggregates API
 * @returns Array of parsed bars sorted by timestamp ascending
 *
 * @example
 * ```typescript
 * // Fetch daily bars
 * const response = await client.getAggregates('SPY', 1, 'day', from, to);
 * const bars = parseDaily(response);
 * ```
 */
export function parseDaily(response: PolygonAggregatesResponse): Bar[] {
  return parseAggregatesResponse(response);
}