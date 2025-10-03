/**
 * @fileoverview Global error handlers for uncaught exceptions and unhandled rejections
 * Ensures all errors are logged before process termination.
 */

import type { Logger } from './types.js';

/**
 * Timeout in milliseconds to wait for logger flush before forceful exit.
 * Gives Winston transports time to write pending log entries.
 */
const FLUSH_TIMEOUT_MS = 3000;

/**
 * Tracks whether global handlers have been attached to prevent duplicate registration.
 */
let handlersAttached = false;

/**
 * Attaches global error handlers to the Node.js process.
 * Captures uncaught exceptions and unhandled promise rejections,
 * logs them with full stack traces, then terminates the process gracefully.
 *
 * **Important:** This function follows a fail-fast philosophy:
 * - Errors are logged for observability
 * - Process exits with code 1 after logging
 * - No attempt is made to recover or continue execution
 *
 * This prevents the application from running in a corrupted state after
 * an unhandled error, which could lead to data corruption or undefined behavior.
 *
 * @param logger - Logger instance to use for error logging
 *
 * @example
 * ```typescript
 * import { createLogger, attachGlobalHandlers } from '@tjr/logger';
 *
 * const logger = createLogger({ level: 'info' });
 * attachGlobalHandlers(logger);
 *
 * // Now all unhandled errors will be logged before exit
 * setTimeout(() => {
 *   throw new Error('Oops!'); // Will be caught and logged
 * }, 100);
 * ```
 *
 * @example
 * ```typescript
 * // Unhandled promise rejection
 * Promise.reject(new Error('Async error')); // Will be caught and logged
 * ```
 */
export function attachGlobalHandlers(logger: Logger): void {
  // Prevent duplicate handler registration
  if (handlersAttached) {
    logger.warn('Global error handlers already attached, skipping');
    return;
  }

  /**
   * Handler for uncaught exceptions.
   * Triggered when an error is thrown but not caught by any try-catch block.
   *
   * Example triggers:
   * - throw new Error('Unhandled error')
   * - setTimeout(() => { throw new Error('Async error') }, 100)
   * - Synchronous code that throws without a catch handler
   */
  const uncaughtExceptionHandler = (error: Error) => {
    logger.error('Uncaught exception detected - process will exit', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      event: 'uncaughtException',
      fatal: true,
    });

    // Give logger time to flush, then force exit
    gracefulExit(logger, 1);
  };

  /**
   * Handler for unhandled promise rejections.
   * Triggered when a Promise is rejected but has no .catch() handler.
   *
   * Example triggers:
   * - Promise.reject(new Error('Unhandled rejection'))
   * - async function that throws without try-catch
   * - Rejected promise without .catch() or await in try-catch
   *
   * @param reason - The rejection reason (usually an Error, but can be any value)
   * @param promise - The promise that was rejected
   */
  const unhandledRejectionHandler = (reason: unknown, promise: Promise<unknown>) => {
    // Handle both Error objects and primitive rejection reasons
    const errorInfo =
      reason instanceof Error
        ? {
            name: reason.name,
            message: reason.message,
            stack: reason.stack,
          }
        : {
            message: String(reason),
            value: reason,
          };

    logger.error('Unhandled promise rejection detected - process will exit', {
      error: errorInfo,
      event: 'unhandledRejection',
      fatal: true,
      promise: String(promise), // Convert promise to string for logging
    });

    // Give logger time to flush, then force exit
    gracefulExit(logger, 1);
  };

  /**
   * Handler for process warnings (optional, informational only).
   * Node.js emits warnings for deprecations, MaxListenersExceeded, etc.
   * We log these at 'warn' level but do NOT exit the process.
   */
  const warningHandler = (warning: Error) => {
    logger.warn('Process warning emitted', {
      warning: {
        name: warning.name,
        message: warning.message,
        stack: warning.stack,
      },
      event: 'warning',
    });
  };

  // Attach handlers to process events
  process.on('uncaughtException', uncaughtExceptionHandler);
  process.on('unhandledRejection', unhandledRejectionHandler);
  process.on('warning', warningHandler);

  handlersAttached = true;

  logger.info('Global error handlers attached', {
    handlers: ['uncaughtException', 'unhandledRejection', 'warning'],
  });
}

/**
 * Gracefully exits the process after giving the logger time to flush.
 *
 * Flow:
 * 1. Start flush timeout timer
 * 2. If logger finishes flushing within timeout, exit immediately
 * 3. If timeout expires, force exit anyway
 *
 * @param logger - Logger instance to flush
 * @param exitCode - Process exit code (0 = success, 1 = error)
 */
function gracefulExit(logger: Logger, exitCode: number): void {
  // Set a timeout to force exit if flush takes too long
  const timeoutId = setTimeout(() => {
    console.error(`[Logger] Flush timeout expired (${FLUSH_TIMEOUT_MS}ms), forcing exit`);
    process.exit(exitCode);
  }, FLUSH_TIMEOUT_MS);

  // Attempt to flush all transports
  logger.on('finish', () => {
    clearTimeout(timeoutId);
    process.exit(exitCode);
  });

  // End the logger (triggers flush)
  logger.end();

  // Fallback: if logger doesn't emit 'finish' event, timeout will catch it
}
