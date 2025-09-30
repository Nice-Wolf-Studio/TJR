/**
 * Error classes for Polygon.io provider adapter.
 *
 * This module defines custom error types for handling various failure
 * scenarios when interacting with the Polygon.io API.
 */

import { TJRError, ProviderRateLimitError as BaseRateLimitError } from "@tjr/contracts";

/**
 * Thrown when Polygon.io API returns a 429 (Too Many Requests) response.
 *
 * This error indicates that the rate limit has been exceeded. The caller
 * should implement exponential backoff and retry after the specified delay.
 *
 * @extends ProviderRateLimitError from @tjr/contracts
 *
 * @example
 * ```typescript
 * throw new RateLimitError({
 *   retryAfter: 60,
 *   limitType: 'requests_per_minute',
 *   requestUrl: 'https://api.polygon.io/v2/aggs/ticker/SPY/range/1/minute/...'
 * });
 * ```
 */
export class RateLimitError extends BaseRateLimitError {
  /**
   * Creates a new RateLimitError.
   *
   * @param data - Error context data
   * @param data.retryAfter - Seconds to wait before retrying
   * @param data.limitType - Type of rate limit exceeded
   * @param data.requestUrl - URL that triggered the rate limit
   */
  constructor(data: {
    retryAfter?: number;
    limitType?: string;
    requestUrl?: string;
    [key: string]: unknown;
  }) {
    super("Polygon.io rate limit exceeded", {
      provider: "polygon",
      ...data,
    });
    this.name = "RateLimitError";
  }
}

/**
 * Thrown when Polygon.io API returns an HTTP error (non-2xx response).
 *
 * This includes 4xx client errors (invalid request, auth failure, etc.)
 * and 5xx server errors.
 *
 * @example
 * ```typescript
 * throw new ApiError('Invalid API key', {
 *   statusCode: 401,
 *   statusText: 'Unauthorized',
 *   requestUrl: 'https://api.polygon.io/v2/aggs/...',
 *   responseBody: '{"error": "Invalid API key"}'
 * });
 * ```
 */
export class ApiError extends TJRError {
  /**
   * HTTP status code (e.g., 400, 401, 500).
   */
  readonly statusCode?: number;

  /**
   * HTTP status text (e.g., 'Bad Request', 'Unauthorized').
   */
  readonly statusText?: string;

  /**
   * Creates a new ApiError.
   *
   * @param message - Human-readable error message
   * @param data - Error context data
   * @param data.statusCode - HTTP status code
   * @param data.statusText - HTTP status text
   * @param data.requestUrl - URL that failed
   * @param data.responseBody - Raw response body
   */
  constructor(
    message: string,
    data: {
      statusCode?: number;
      statusText?: string;
      requestUrl?: string;
      responseBody?: string;
      [key: string]: unknown;
    }
  ) {
    super("POLYGON_API_ERROR", message, data);
    this.name = "ApiError";
    this.statusCode = data.statusCode;
    this.statusText = data.statusText;
  }
}

/**
 * Thrown when Polygon.io API response cannot be parsed.
 *
 * This indicates malformed JSON, missing required fields, or unexpected
 * data types in the response.
 *
 * @example
 * ```typescript
 * throw new ParseError('Missing required field: results', {
 *   responseBody: '{"status": "OK", "ticker": "SPY"}',
 *   field: 'results',
 *   expectedType: 'array'
 * });
 * ```
 */
export class ParseError extends TJRError {
  /**
   * Creates a new ParseError.
   *
   * @param message - Human-readable error message
   * @param data - Error context data
   * @param data.responseBody - Raw response body that failed to parse
   * @param data.field - Field that caused the error
   * @param data.expectedType - Expected data type
   * @param data.actualType - Actual data type received
   */
  constructor(
    message: string,
    data?: {
      responseBody?: string;
      field?: string;
      expectedType?: string;
      actualType?: string;
      [key: string]: unknown;
    }
  ) {
    super("POLYGON_PARSE_ERROR", message, data);
    this.name = "ParseError";
  }
}

/**
 * Type guard to check if an error is a RateLimitError.
 *
 * @param error - Error to check
 * @returns True if error is a RateLimitError
 *
 * @example
 * ```typescript
 * try {
 *   await provider.getBars(options);
 * } catch (err) {
 *   if (isRateLimitError(err)) {
 *     const retryAfter = err.data?.retryAfter as number;
 *     await sleep(retryAfter * 1000);
 *     return retry();
 *   }
 *   throw err;
 * }
 * ```
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

/**
 * Type guard to check if an error is an ApiError.
 *
 * @param error - Error to check
 * @returns True if error is an ApiError
 *
 * @example
 * ```typescript
 * catch (err) {
 *   if (isApiError(err) && err.statusCode === 401) {
 *     throw new Error('Invalid Polygon.io API key');
 *   }
 * }
 * ```
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Type guard to check if an error is a ParseError.
 *
 * @param error - Error to check
 * @returns True if error is a ParseError
 *
 * @example
 * ```typescript
 * catch (err) {
 *   if (isParseError(err)) {
 *     logger.error('Failed to parse Polygon response', { error: err });
 *   }
 * }
 * ```
 */
export function isParseError(error: unknown): error is ParseError {
  return error instanceof ParseError;
}