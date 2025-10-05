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

// Session types
export type {
  SessionName,
  SessionBoundary,
  SessionWindow,
  SymbolSessionsConfig,
  SessionLevels,
  SessionLevelsSnapshot,
} from './sessions.js';

// Swing detection types
export type {
  HTF,
  BaseTF,
  OhlcBar,
  OhlcBarVerbose,
  OhlcBarShorthand,
  SwingPoint,
  SwingConfig,
  SwingSeries,
  HtfSwingsSnapshot,
  RingBuffer,
  HtfSwingsConfig,
  SwingMetrics,
} from './swings.js';

export { DEFAULT_SWING_CONFIG } from './swings.js';

// BOS (Break of Structure) types
export type {
  BarData,
  PivotPoint,
  PivotCandidate,
  LtfPivotState,
  ILtfPivotTracker,
  BosWindow,
  BosSignal,
  BosEngineState,
  IBosReversalEngine,
  PivotConfig,
  WindowConfig,
  SignalConfig,
  PerformanceConfig,
  BosConfig,
  BosPerformanceMetrics,
} from './bos.js';

export { DEFAULT_BOS_CONFIG, BosError } from './bos.js';

// Daily Bias Planning types
export type {
  KeyLevelSource,
  LevelKind,
  KeyLevel,
  PlanDirection,
  PlanTargetStatus,
  LevelBand,
  PlanTarget,
  Plan,
  PriorityConfig,
  ScoringContext,
} from './bias.js';

// Equilibrium analysis types
export type {
  SwingRange,
  EquilibriumConfig,
  EquilibriumZone,
  EquilibriumLevel,
} from './equilibrium.js';
