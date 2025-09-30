/**
 * @fileoverview Main logger factory for TJR Suite
 * Creates configured Winston logger instances with structured logging,
 * PII redaction, and flexible transport options.
 */

import winston, { format } from 'winston';
import type { LoggerConfig, Logger } from './types.js';
import { redactPII, standardFields, prettyPrint } from './formats.js';

/**
 * Creates a configured logger instance with structured logging and PII redaction.
 *
 * Features:
 * - Structured logging with standard fields (timestamp, level, message)
 * - Automatic PII redaction for sensitive fields (passwords, tokens, etc.)
 * - Multiple transports (console, file)
 * - Environment-aware formatting (JSON in prod, pretty-print in dev)
 * - Child logger support for contextual logging
 *
 * @param config - Logger configuration options
 * @returns Configured Winston logger instance
 *
 * @example
 * ```typescript
 * // Basic usage
 * const logger = createLogger({
 *   level: 'info',
 *   json: true,
 * });
 *
 * logger.info('Application started', { version: '1.0.0' });
 * ```
 *
 * @example
 * ```typescript
 * // With file transport and child logger
 * const logger = createLogger({
 *   level: 'debug',
 *   json: false,
 *   filePath: './logs/app.log',
 * });
 *
 * const dbLogger = logger.child({ component: 'database' });
 * dbLogger.info('Connection established', { host: 'localhost', port: 5432 });
 * ```
 *
 * @example
 * ```typescript
 * // Trading-specific context
 * const tradeLogger = logger.child({
 *   component: 'trading-engine',
 *   symbol: 'AAPL',
 *   timeframe: '1h'
 * });
 *
 * tradeLogger.info('Signal generated', {
 *   request_id: 'req-abc-123',
 *   signal_type: 'BUY',
 *   confidence: 0.87
 * });
 * ```
 */
export function createLogger(config: LoggerConfig): Logger {
  const {
    level,
    json = process.env['NODE_ENV'] === 'production',
    filePath,
    console: enableConsole = true,
  } = config;

  // Build format chain
  // Order is important: redact PII first, then apply standard fields, then output format
  const logFormat = format.combine(
    // Step 1: Redact sensitive fields (must be first!)
    redactPII(),

    // Step 2: Add standard fields (timestamp, errors)
    standardFields,

    // Step 3: Apply output format (JSON or pretty-print)
    json ? format.json() : prettyPrint
  );

  // Build transports array
  const transports: winston.transport[] = [];

  // Console transport (if enabled)
  if (enableConsole) {
    transports.push(
      new winston.transports.Console({
        level,
        format: logFormat,
      })
    );
  }

  // File transport (if configured)
  if (filePath) {
    transports.push(
      new winston.transports.File({
        filename: filePath,
        level,
        format: logFormat,
        // Handle file errors gracefully
        handleExceptions: false,
        handleRejections: false,
      })
    );
  }

  // Create Winston logger instance
  const logger = winston.createLogger({
    level,
    format: logFormat,
    transports,
    // Exit on error: false prevents Winston from exiting on uncaught exception
    // We handle this explicitly in errorHandler.ts
    exitOnError: false,
  });

  return logger;
}

/**
 * Creates a child logger with additional context fields.
 * Child loggers inherit all configuration from the parent logger
 * and automatically include context fields in every log entry.
 *
 * This is a convenience re-export of Winston's child() method with
 * proper typing for TJR-specific fields.
 *
 * @param logger - Parent logger instance
 * @param context - Context fields to include in all logs
 * @returns Child logger with inherited configuration
 *
 * @example
 * ```typescript
 * const logger = createLogger({ level: 'info' });
 *
 * // Create component-specific logger
 * const apiLogger = createChildLogger(logger, { component: 'api' });
 * apiLogger.info('Request received'); // Automatically includes component=api
 *
 * // Create request-scoped logger
 * const reqLogger = createChildLogger(logger, {
 *   component: 'api',
 *   request_id: 'req-xyz-789'
 * });
 * reqLogger.info('Processing request'); // Includes component and request_id
 * ```
 */
export function createChildLogger(
  logger: Logger,
  context: Record<string, unknown>
): Logger {
  return logger.child(context);
}