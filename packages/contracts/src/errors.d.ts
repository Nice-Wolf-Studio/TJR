/**
 * @fileoverview Error taxonomy for TJR trading system.
 *
 * Defines a hierarchy of structured error classes with machine-readable codes
 * and rich contextual data for debugging, alerting, and retry logic.
 *
 * All errors extend TJRError base class and include:
 * - Unique error code (string constant)
 * - Structured data payload
 * - ISO timestamp
 *
 * @module @tjr/contracts/errors
 */
import type { Timeframe } from './timeframes.js';
/**
 * Base error class for all TJR system errors.
 *
 * Extends native Error with structured fields for machine processing.
 *
 * @invariant code is non-empty string
 * @invariant timestamp is valid ISO 8601 string
 *
 * @example
 * ```typescript
 * throw new TJRError(
 *   'CUSTOM_ERROR',
 *   'Something went wrong',
 *   { context: 'value' }
 * );
 * ```
 */
export declare class TJRError extends Error {
    /**
     * Machine-readable error code (e.g., 'PROVIDER_RATE_LIMIT').
     * Use for error categorization and handling logic.
     */
    readonly code: string;
    /**
     * Structured error data for debugging and retry logic.
     * Format varies by error type.
     */
    readonly data?: Record<string, unknown>;
    /**
     * ISO 8601 timestamp when error was created.
     */
    readonly timestamp: string;
    /**
     * Creates a new TJRError.
     *
     * @param code - Error code constant
     * @param message - Human-readable error message
     * @param data - Optional structured context data
     */
    constructor(code: string, message: string, data?: Record<string, unknown>);
    /**
     * Serializes error to JSON-safe object.
     *
     * @returns Plain object representation
     *
     * @example
     * ```typescript
     * const err = new TJRError('TEST', 'Test error');
     * JSON.stringify(err.toJSON());
     * ```
     */
    toJSON(): Record<string, unknown>;
}
/**
 * Thrown when a data provider's rate limit is exceeded.
 *
 * Indicates temporary throttling; caller should implement exponential backoff.
 *
 * @example
 * ```typescript
 * throw new ProviderRateLimitError(
 *   'Alpaca API rate limit exceeded',
 *   { provider: 'alpaca', retryAfter: 60 }
 * );
 * ```
 */
export declare class ProviderRateLimitError extends TJRError {
    /**
     * Creates a new ProviderRateLimitError.
     *
     * @param message - Human-readable description
     * @param data - Context data
     * @param data.provider - Provider name (e.g., 'alpaca', 'tradier')
     * @param data.retryAfter - Optional: seconds to wait before retry
     * @param data.limitType - Optional: type of limit hit (e.g., 'requests_per_minute')
     */
    constructor(message: string, data: {
        provider: string;
        retryAfter?: number;
        limitType?: string;
        [key: string]: unknown;
    });
}
/**
 * Thrown when insufficient historical bars are available for analysis.
 *
 * Indicates data gap or lookback period too short for TJR requirements.
 *
 * @example
 * ```typescript
 * throw new InsufficientBarsError(
 *   'Need at least 50 bars for TJR analysis',
 *   {
 *     required: 50,
 *     received: 30,
 *     symbol: 'SPY',
 *     timeframe: Timeframe.M5
 *   }
 * );
 * ```
 */
export declare class InsufficientBarsError extends TJRError {
    /**
     * Creates a new InsufficientBarsError.
     *
     * @param message - Human-readable description
     * @param data - Context data
     * @param data.required - Minimum bars required
     * @param data.received - Actual bars received
     * @param data.symbol - Symbol being queried
     * @param data.timeframe - Timeframe being queried
     */
    constructor(message: string, data: {
        required: number;
        received: number;
        symbol: string;
        timeframe: Timeframe;
        [key: string]: unknown;
    });
}
/**
 * Thrown when a symbol cannot be resolved by a provider.
 *
 * May indicate typo, delisted symbol, or provider-specific naming.
 *
 * @example
 * ```typescript
 * throw new SymbolResolutionError(
 *   'Symbol "SPYY" not found',
 *   {
 *     symbol: 'SPYY',
 *     provider: 'alpaca',
 *     suggestion: 'SPY'
 *   }
 * );
 * ```
 */
export declare class SymbolResolutionError extends TJRError {
    /**
     * Creates a new SymbolResolutionError.
     *
     * @param message - Human-readable description
     * @param data - Context data
     * @param data.symbol - Symbol that failed to resolve
     * @param data.provider - Provider where resolution failed
     * @param data.suggestion - Optional: suggested correct symbol
     */
    constructor(message: string, data: {
        symbol: string;
        provider: string;
        suggestion?: string;
        [key: string]: unknown;
    });
}
/**
 * Type guard to check if an error is a TJRError.
 *
 * @param error - Error to check
 * @returns True if error is a TJRError instance
 *
 * @example
 * ```typescript
 * try {
 *   // ... code
 * } catch (err) {
 *   if (isTJRError(err)) {
 *     console.error(`TJR Error [${err.code}]:`, err.message);
 *   }
 * }
 * ```
 */
export declare function isTJRError(error: unknown): error is TJRError;
/**
 * Type guard to check if an error is a ProviderRateLimitError.
 *
 * @param error - Error to check
 * @returns True if error is a ProviderRateLimitError
 *
 * @example
 * ```typescript
 * catch (err) {
 *   if (isProviderRateLimitError(err)) {
 *     await sleep(err.data.retryAfter * 1000);
 *     return retry();
 *   }
 * }
 * ```
 */
export declare function isProviderRateLimitError(error: unknown): error is ProviderRateLimitError;
/**
 * Type guard to check if an error is an InsufficientBarsError.
 *
 * @param error - Error to check
 * @returns True if error is an InsufficientBarsError
 */
export declare function isInsufficientBarsError(error: unknown): error is InsufficientBarsError;
/**
 * Type guard to check if an error is a SymbolResolutionError.
 *
 * @param error - Error to check
 * @returns True if error is a SymbolResolutionError
 */
export declare function isSymbolResolutionError(error: unknown): error is SymbolResolutionError;
//# sourceMappingURL=errors.d.ts.map