/**
 * @fileoverview Type definitions for TJR Logger
 * Provides strongly-typed interfaces for logger configuration and usage.
 */

import type { Logger as WinstonLogger } from 'winston';

/**
 * Log level determines the minimum severity of messages that will be logged.
 * - 'error': Critical errors that require immediate attention
 * - 'warn': Warning conditions that should be reviewed
 * - 'info': Informational messages about normal operations
 * - 'debug': Detailed debugging information for development
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Configuration options for creating a logger instance.
 *
 * @example
 * ```typescript
 * const config: LoggerConfig = {
 *   level: 'info',
 *   json: process.env.NODE_ENV === 'production',
 *   filePath: './logs/app.log'
 * };
 * ```
 */
export interface LoggerConfig {
  /**
   * Minimum log level to output.
   * Messages below this level will be filtered out.
   * @default 'info'
   */
  level: LogLevel;

  /**
   * Whether to output logs in JSON format.
   * - true: Machine-readable JSON (recommended for production)
   * - false: Human-readable pretty-print (recommended for development)
   * @default true in production, false in development
   */
  json?: boolean;

  /**
   * Optional file path for file transport.
   * If provided, logs will be written to this file in addition to console.
   * @example './logs/app.log'
   */
  filePath?: string;

  /**
   * Whether to enable console output.
   * Set to false to disable console logging (e.g., when only file logging is needed).
   * @default true
   */
  console?: boolean;
}

/**
 * Structured log entry with standard fields.
 * Additional custom fields can be added via the index signature.
 */
export interface LogEntry {
  /** Log severity level */
  level: LogLevel;

  /** Human-readable log message */
  message: string;

  /** ISO 8601 timestamp */
  timestamp: string;

  /** Trading symbol (e.g., "AAPL", "BTCUSD") */
  symbol?: string;

  /** Chart timeframe (e.g., "1h", "1d", "5m") */
  timeframe?: string;

  /** Request correlation ID for distributed tracing */
  request_id?: string;

  /** Component or module name (typically from child logger) */
  component?: string;

  /** Data provider name (e.g., "yahoo", "polygon", "alphavantage") */
  provider?: string;

  /** Timestamp of data or operation (ISO 8601 format) */
  asOf?: string;

  /** Operation duration in milliseconds */
  duration_ms?: number;

  /** Operation result (e.g., "success", "error", "partial") */
  result?: string;

  /** Operation name or type */
  operation?: string;

  /** Error code or type (when result is error) */
  error_code?: string;

  /** Number of items processed */
  count?: number;

  /** Cache hit or miss indicator */
  cache?: 'hit' | 'miss';

  /** Allow additional custom fields */
  [key: string]: unknown;
}

/**
 * Child logger context fields.
 * These fields will be automatically included in all logs from the child logger.
 *
 * @example
 * ```typescript
 * const dbLogger = logger.child({ component: 'database', module: 'postgres' });
 * dbLogger.info('Connected'); // Automatically includes component and module fields
 * ```
 */
export interface ChildLoggerContext {
  /** Component identifier (e.g., 'database', 'api', 'worker') */
  component?: string;

  /** Trading symbol context */
  symbol?: string;

  /** Timeframe context */
  timeframe?: string;

  /** Request ID context */
  request_id?: string;

  /** Provider context */
  provider?: string;

  /** Operation context */
  operation?: string;

  /** Allow any additional context fields */
  [key: string]: unknown;
}

/**
 * Re-export Winston's Logger type for convenience.
 * This is the main logger interface with methods like info(), warn(), error(), debug().
 */
export type Logger = WinstonLogger;