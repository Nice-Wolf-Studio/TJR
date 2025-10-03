/**
 * @fileoverview Error handling for Alpha Vantage provider.
 *
 * Defines custom error classes and error mapping logic for Alpha Vantage
 * API errors. Maps provider-specific errors to standardized @tjr/contracts
 * error types.
 *
 * @module @tjr/provider-alphavantage/errors
 */

import type { AlphaVantageErrorResponse } from './types.js';

/**
 * Base error class for Alpha Vantage provider errors.
 *
 * All Alpha Vantage-specific errors extend this class.
 */
export class AlphaVantageError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'AlphaVantageError';
    Object.setPrototypeOf(this, AlphaVantageError.prototype);
  }
}

/**
 * Rate limit exceeded error.
 *
 * Thrown when Alpha Vantage API rate limits are exceeded.
 * Free tier: 5 requests per minute, 500 requests per day.
 */
export class RateLimitError extends AlphaVantageError {
  constructor(
    message: string = 'Alpha Vantage API rate limit exceeded',
    public readonly retryAfter?: number
  ) {
    super(message, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * API error for general Alpha Vantage API failures.
 *
 * Thrown for HTTP errors, invalid responses, or API-level errors.
 */
export class ApiError extends AlphaVantageError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly response?: unknown
  ) {
    super(message, 'API_ERROR');
    this.name = 'ApiError';
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Parse error for malformed API responses.
 *
 * Thrown when the Alpha Vantage response cannot be parsed or is
 * missing required fields.
 */
export class ParseError extends AlphaVantageError {
  constructor(
    message: string,
    public readonly response?: unknown
  ) {
    super(message, 'PARSE_ERROR');
    this.name = 'ParseError';
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

/**
 * Authentication error for invalid API keys.
 *
 * Thrown when the provided API key is invalid or missing.
 */
export class AuthenticationError extends AlphaVantageError {
  constructor(message: string = 'Invalid Alpha Vantage API key') {
    super(message, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Symbol not found error.
 *
 * Thrown when the requested symbol is not found or invalid.
 */
export class SymbolNotFoundError extends AlphaVantageError {
  constructor(
    public readonly symbol: string,
    message?: string
  ) {
    super(message || `Symbol not found: ${symbol}`, 'SYMBOL_NOT_FOUND');
    this.name = 'SymbolNotFoundError';
    Object.setPrototypeOf(this, SymbolNotFoundError.prototype);
  }
}

/**
 * Premium feature error.
 *
 * Thrown when attempting to use a premium feature with a free API key.
 */
export class PremiumFeatureError extends AlphaVantageError {
  constructor(message: string = 'This feature requires a premium Alpha Vantage subscription') {
    super(message, 'PREMIUM_FEATURE_REQUIRED');
    this.name = 'PremiumFeatureError';
    Object.setPrototypeOf(this, PremiumFeatureError.prototype);
  }
}

/**
 * Maps Alpha Vantage error responses to typed error objects.
 *
 * Examines the error response and determines the appropriate error type
 * based on error message patterns and API response structure.
 *
 * @param response - Alpha Vantage error response or generic error
 * @param statusCode - HTTP status code (if available)
 * @returns Typed error object
 *
 * @example
 * ```typescript
 * try {
 *   const data = await fetch(url);
 * } catch (error) {
 *   throw mapAlphaVantageError(error, 429);
 * }
 * ```
 */
export function mapAlphaVantageError(
  response: AlphaVantageErrorResponse | unknown,
  statusCode?: number
): AlphaVantageError {
  // Type guard for error response
  if (!response || typeof response !== 'object') {
    return new ApiError('Unknown Alpha Vantage error', statusCode, response);
  }

  const errorResponse = response as AlphaVantageErrorResponse;

  // Check for rate limit (Note field or HTTP 429)
  if (errorResponse.Note || statusCode === 429) {
    const message = errorResponse.Note || 'Rate limit exceeded';

    // Parse retry-after from message if present
    // e.g., "Thank you for using Alpha Vantage! Our standard API call frequency is 5 calls per minute and 500 calls per day."
    let retryAfter: number | undefined;
    if (message.includes('5 calls per minute')) {
      retryAfter = 60; // Retry after 60 seconds
    }

    return new RateLimitError(message, retryAfter);
  }

  // Check for error message
  if (errorResponse['Error Message']) {
    const errorMsg = errorResponse['Error Message'];

    // Invalid API key
    if (
      errorMsg.toLowerCase().includes('invalid api') ||
      errorMsg.toLowerCase().includes('api key')
    ) {
      return new AuthenticationError(errorMsg);
    }

    // Symbol not found
    if (
      errorMsg.toLowerCase().includes('invalid symbol') ||
      errorMsg.toLowerCase().includes('not found')
    ) {
      // Try to extract symbol from error message
      const symbolMatch = errorMsg.match(/symbol[:\s]+([A-Z0-9]+)/i);
      const symbol = symbolMatch?.[1] ?? 'unknown';
      return new SymbolNotFoundError(symbol, errorMsg);
    }

    return new ApiError(errorMsg, statusCode, response);
  }

  // Check for premium feature notice
  if (errorResponse.Information) {
    const info = errorResponse.Information;
    if (info.toLowerCase().includes('premium') || info.toLowerCase().includes('upgrade')) {
      return new PremiumFeatureError(info);
    }
  }

  // HTTP error codes
  if (statusCode) {
    switch (statusCode) {
      case 401:
      case 403:
        return new AuthenticationError('Authentication failed');
      case 404:
        return new ApiError('Endpoint not found', statusCode, response);
      case 429:
        return new RateLimitError('Rate limit exceeded', 60);
      case 500:
      case 502:
      case 503:
      case 504:
        return new ApiError('Alpha Vantage service unavailable', statusCode, response);
      default:
        return new ApiError(`HTTP error ${statusCode}`, statusCode, response);
    }
  }

  // Generic error
  return new ApiError('Unknown Alpha Vantage error', statusCode, response);
}

/**
 * Checks if an error is a retryable error.
 *
 * Determines whether an error can be retried (e.g., rate limit, service
 * unavailable) or is permanent (e.g., invalid API key, symbol not found).
 *
 * @param error - Error to check
 * @returns true if error is retryable
 *
 * @example
 * ```typescript
 * if (isRetryableError(error)) {
 *   await delay(60000);
 *   return retry();
 * }
 * ```
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof RateLimitError) {
    return true;
  }

  if (error instanceof ApiError) {
    const retryableStatusCodes = [429, 500, 502, 503, 504];
    return error.statusCode !== undefined && retryableStatusCodes.includes(error.statusCode);
  }

  return false;
}

/**
 * Gets suggested retry delay in milliseconds for retryable errors.
 *
 * @param error - Error to get retry delay for
 * @returns Retry delay in milliseconds, or undefined if not retryable
 *
 * @example
 * ```typescript
 * const delay = getRetryDelay(error);
 * if (delay) {
 *   await sleep(delay);
 *   return retry();
 * }
 * ```
 */
export function getRetryDelay(error: Error): number | undefined {
  if (error instanceof RateLimitError && error.retryAfter) {
    return error.retryAfter * 1000; // Convert seconds to milliseconds
  }

  if (error instanceof ApiError) {
    switch (error.statusCode) {
      case 429:
        return 60000; // 60 seconds for rate limit
      case 500:
      case 502:
      case 503:
      case 504:
        return 5000; // 5 seconds for server errors
      default:
        return undefined;
    }
  }

  return undefined;
}
