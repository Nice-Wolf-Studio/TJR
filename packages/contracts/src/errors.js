"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SymbolResolutionError = exports.InsufficientBarsError = exports.ProviderRateLimitError = exports.TJRError = void 0;
exports.isTJRError = isTJRError;
exports.isProviderRateLimitError = isProviderRateLimitError;
exports.isInsufficientBarsError = isInsufficientBarsError;
exports.isSymbolResolutionError = isSymbolResolutionError;
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
class TJRError extends Error {
    /**
     * Machine-readable error code (e.g., 'PROVIDER_RATE_LIMIT').
     * Use for error categorization and handling logic.
     */
    code;
    /**
     * Structured error data for debugging and retry logic.
     * Format varies by error type.
     */
    data;
    /**
     * ISO 8601 timestamp when error was created.
     */
    timestamp;
    /**
     * Creates a new TJRError.
     *
     * @param code - Error code constant
     * @param message - Human-readable error message
     * @param data - Optional structured context data
     */
    constructor(code, message, data) {
        super(message);
        this.name = 'TJRError';
        this.code = code;
        this.data = data;
        this.timestamp = new Date().toISOString();
        // Maintains proper stack trace for where error was thrown (V8 only)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
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
    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            data: this.data,
            timestamp: this.timestamp,
            stack: this.stack
        };
    }
}
exports.TJRError = TJRError;
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
class ProviderRateLimitError extends TJRError {
    /**
     * Creates a new ProviderRateLimitError.
     *
     * @param message - Human-readable description
     * @param data - Context data
     * @param data.provider - Provider name (e.g., 'alpaca', 'tradier')
     * @param data.retryAfter - Optional: seconds to wait before retry
     * @param data.limitType - Optional: type of limit hit (e.g., 'requests_per_minute')
     */
    constructor(message, data) {
        super('PROVIDER_RATE_LIMIT', message, data);
        this.name = 'ProviderRateLimitError';
    }
}
exports.ProviderRateLimitError = ProviderRateLimitError;
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
class InsufficientBarsError extends TJRError {
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
    constructor(message, data) {
        super('INSUFFICIENT_BARS', message, data);
        this.name = 'InsufficientBarsError';
    }
}
exports.InsufficientBarsError = InsufficientBarsError;
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
class SymbolResolutionError extends TJRError {
    /**
     * Creates a new SymbolResolutionError.
     *
     * @param message - Human-readable description
     * @param data - Context data
     * @param data.symbol - Symbol that failed to resolve
     * @param data.provider - Provider where resolution failed
     * @param data.suggestion - Optional: suggested correct symbol
     */
    constructor(message, data) {
        super('SYMBOL_RESOLUTION', message, data);
        this.name = 'SymbolResolutionError';
    }
}
exports.SymbolResolutionError = SymbolResolutionError;
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
function isTJRError(error) {
    return error instanceof TJRError;
}
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
function isProviderRateLimitError(error) {
    return error instanceof ProviderRateLimitError;
}
/**
 * Type guard to check if an error is an InsufficientBarsError.
 *
 * @param error - Error to check
 * @returns True if error is an InsufficientBarsError
 */
function isInsufficientBarsError(error) {
    return error instanceof InsufficientBarsError;
}
/**
 * Type guard to check if an error is a SymbolResolutionError.
 *
 * @param error - Error to check
 * @returns True if error is a SymbolResolutionError
 */
function isSymbolResolutionError(error) {
    return error instanceof SymbolResolutionError;
}
//# sourceMappingURL=errors.js.map