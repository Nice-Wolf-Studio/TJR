/**
 * Error handling for TJR commands
 *
 * Provides friendly error messages and structured error codes for
 * TJR command failures.
 */

/**
 * TJR command error codes
 */
export enum TJRErrorCode {
  /** Invalid command arguments */
  INVALID_ARGS = 'INVALID_ARGS',
  /** Configuration error (load/save/validate) */
  CONFIG_ERROR = 'CONFIG_ERROR',
  /** Market data provider error */
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  /** Cache service error */
  CACHE_ERROR = 'CACHE_ERROR',
  /** TJR analysis error */
  ANALYSIS_ERROR = 'ANALYSIS_ERROR',
  /** Output formatting error */
  FORMAT_ERROR = 'FORMAT_ERROR',
  /** Configuration validation error */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** Missing required data */
  MISSING_DATA = 'MISSING_DATA',
  /** Internal command error */
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Friendly error messages for each error code
 */
export const ERROR_MESSAGES: Record<TJRErrorCode, string> = {
  [TJRErrorCode.INVALID_ARGS]: 'Invalid command arguments provided',
  [TJRErrorCode.CONFIG_ERROR]: 'Failed to load or save configuration',
  [TJRErrorCode.PROVIDER_ERROR]: 'Failed to fetch market data from provider',
  [TJRErrorCode.CACHE_ERROR]: 'Cache service error occurred',
  [TJRErrorCode.ANALYSIS_ERROR]: 'TJR analysis failed',
  [TJRErrorCode.FORMAT_ERROR]: 'Failed to format output',
  [TJRErrorCode.VALIDATION_ERROR]: 'Configuration validation failed',
  [TJRErrorCode.MISSING_DATA]: 'Required data not available',
  [TJRErrorCode.INTERNAL_ERROR]: 'Internal command error',
};

/**
 * TJR command error class
 *
 * Extends Error with structured error codes and context.
 */
export class TJRCommandError extends Error {
  code: TJRErrorCode;
  context?: Record<string, any>;
  cause?: Error;

  constructor(code: TJRErrorCode, message?: string, context?: Record<string, any>, cause?: Error) {
    const errorMessage = message || ERROR_MESSAGES[code];
    super(errorMessage);

    this.name = 'TJRCommandError';
    this.code = code;
    this.context = context;
    this.cause = cause;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, TJRCommandError);
  }

  /**
   * Format error for display
   */
  format(verbose: boolean = false): string {
    const lines: string[] = [];

    lines.push(`Error: ${this.message}`);
    lines.push(`Code: ${this.code}`);

    if (this.context && Object.keys(this.context).length > 0) {
      lines.push('Context:');
      for (const [key, value] of Object.entries(this.context)) {
        lines.push(`  ${key}: ${JSON.stringify(value)}`);
      }
    }

    if (verbose && this.cause) {
      lines.push('Caused by:');
      lines.push(`  ${this.cause.message}`);
      if (this.cause.stack) {
        lines.push(`  ${this.cause.stack}`);
      }
    }

    if (verbose && this.stack) {
      lines.push('Stack trace:');
      lines.push(this.stack);
    }

    return lines.join('\n');
  }

  /**
   * Convert error to JSON for structured logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      cause: this.cause
        ? {
            name: this.cause.name,
            message: this.cause.message,
          }
        : undefined,
    };
  }
}

/**
 * Create a friendly error message from any error
 */
export function formatCommandError(error: unknown, verbose: boolean = false): string {
  if (error instanceof TJRCommandError) {
    return error.format(verbose);
  }

  if (error instanceof Error) {
    const lines: string[] = [];
    lines.push(`Error: ${error.message}`);

    if (verbose && error.stack) {
      lines.push('Stack trace:');
      lines.push(error.stack);
    }

    return lines.join('\n');
  }

  return `Error: ${String(error)}`;
}

/**
 * Wrap an error with TJR command error context
 */
export function wrapError(
  error: unknown,
  code: TJRErrorCode,
  context?: Record<string, any>
): TJRCommandError {
  if (error instanceof TJRCommandError) {
    return error;
  }

  const cause = error instanceof Error ? error : new Error(String(error));
  return new TJRCommandError(code, ERROR_MESSAGES[code], context, cause);
}
