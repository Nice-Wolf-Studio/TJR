/**
 * @fileoverview Public API exports for @tjr/logger
 * Structured logging and error handling for TJR Suite
 */

// Core logger creation
export { createLogger, createChildLogger } from './createLogger.js';

// Global error handlers
export { attachGlobalHandlers } from './errorHandler.js';

// Type exports
export type {
  Logger,
  LoggerConfig,
  LogLevel,
  LogEntry,
  ChildLoggerContext,
} from './types.js';