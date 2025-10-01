/**
 * @fileoverview Public API exports for @tjr/logger
 * Structured logging and error handling for TJR Suite
 */

// Core logger creation
export { createLogger, createChildLogger } from './createLogger.js';

// Global error handlers
export { attachGlobalHandlers } from './errorHandler.js';

// Request context management
export {
  generateRequestId,
  getRequestContext,
  getRequestId,
  withRequestContext,
  withRequestContextSync,
  setRequestContext,
} from './request-context.js';

// Performance timing utilities
export {
  startTimer,
  measureSync,
  measureAsync,
  TimerManager,
} from './perf-timer.js';

// Standardized log fields and validation
export {
  containsPII,
  isSensitiveFieldName,
  validateLogFields,
  redactPII,
  formatDuration,
  formatTimestamp,
  sanitizeLogFields,
  createLogFields,
  validateRequiredFields,
} from './log-fields.js';

// Middleware for request ID injection
export {
  requestIdMiddleware,
  withDiscordRequestContext,
  withRequestContextWrapper,
  withCLIRequestContext,
  withJobRequestContext,
} from './middleware.js';

// Type exports
export type {
  Logger,
  LoggerConfig,
  LogLevel,
  LogEntry,
  ChildLoggerContext,
} from './types.js';

export type { RequestContext } from './request-context.js';
export type { PerfTimer } from './perf-timer.js';
export type { StandardLogFields } from './log-fields.js';
