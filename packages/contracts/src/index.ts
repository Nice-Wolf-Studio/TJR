/**
 * @fileoverview Main entry point for @tjr/contracts package.
 *
 * Exports all types, interfaces, classes, and utilities for TJR trading system.
 *
 * @module @tjr/contracts
 */

// Timeframes
export {
  Timeframe,
  isValidTimeframe,
  timeframeToMinutes,
  getTimeframeLabel,
  compareTimeframes,
  parseTimeframe,
  getAllTimeframes,
} from './timeframes.js';

// Market data types
export type { MarketBar, GetBarsParams, ProviderCapabilities, Session } from './market.js';

// TJR analysis types
export type { TJRAnalysisInput, TJRConfluence, TJRExecution, TJRResult } from './tjr.js';

export { hasExecution } from './tjr.js';

// Error classes and guards
export {
  TJRError,
  ProviderRateLimitError,
  InsufficientBarsError,
  SymbolResolutionError,
  isTJRError,
  isProviderRateLimitError,
  isInsufficientBarsError,
  isSymbolResolutionError,
} from './errors.js';
