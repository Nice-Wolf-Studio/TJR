/**
 * @fileoverview Break of Structure (BOS) detection types for TJR trading system.
 *
 * Defines types for LTF pivot tracking and BOS reversal detection, including
 * bar data, pivot points, BOS windows, signals, and configuration.
 *
 * Original Attribution:
 * - Source: GladOSv2 repository
 * - Commit: dee236c1e762db08cf7d6f34885eb4779f73600c
 * - Date: 2025-09-22
 * - Author: Nice Wolf Studio
 *
 * @module @tjr/contracts/bos
 */

/**
 * OHLCV bar data structure for LTF (Lower Time Frame) analysis
 */
export interface BarData {
  /** Trading symbol (e.g., "ES", "NQ") */
  symbol: string;
  /** Timestamp in unix milliseconds */
  timestamp: number;
  /** Opening price */
  open: number;
  /** High price */
  high: number;
  /** Low price */
  low: number;
  /** Closing price */
  close: number;
  /** Trading volume */
  volume: number;
}

/**
 * Detected pivot point with confirmation status
 */
export interface PivotPoint {
  /** Timestamp when pivot occurred */
  timestamp: number;
  /** Price level of the pivot */
  price: number;
  /** Type of pivot point */
  type: 'high' | 'low';
  /** Number of left bars used for detection */
  leftBars: number;
  /** Number of right bars used for confirmation */
  rightBars: number;
  /** Strength score (0-100) */
  strength: number;
  /** Whether the pivot is confirmed */
  confirmed?: boolean;
}

/**
 * Pivot candidate for confirmation tracking (internal use)
 */
export interface PivotCandidate {
  /** Timestamp when candidate was detected */
  timestamp: number;
  /** Price level of the candidate */
  price: number;
  /** Type of pivot point */
  type: 'high' | 'low';
  /** Number of left bars validated */
  leftBars: number;
  /** Number of right bars needed for confirmation */
  rightBarsNeeded: number;
}

/**
 * State snapshot of LTF Pivot Tracker
 */
export interface LtfPivotState {
  /** Trading symbol */
  symbol: string;
  /** Historical bars buffer */
  bars: BarData[];
  /** Confirmed pivot points */
  pivots: PivotPoint[];
  /** Pending pivot candidates */
  candidates: PivotCandidate[];
  /** Last update timestamp */
  lastUpdated: number;
}

/**
 * Interface for LTF Pivot Tracker implementation
 */
export interface ILtfPivotTracker {
  /** Process new bar and detect pivot points */
  onBar(bar: BarData): PivotPoint[];
  /** Get current tracker state */
  getState(): LtfPivotState;
  /** Get recent confirmed pivots */
  getRecentPivots(count?: number): PivotPoint[];
  /** Reset tracker state */
  reset(): void;
}

/**
 * Active BOS window tracking potential structure breaks
 */
export interface BosWindow {
  /** Unique window identifier */
  id: string;
  /** Timestamp when window was opened */
  openedAt: number;
  /** Timestamp when window expires */
  expiresAt: number;
  /** Trading symbol */
  symbol: string;
  /** Reference pivot being monitored */
  referencePivot: PivotPoint;
  /** Window status */
  status: 'active' | 'triggered' | 'expired';
  /** Expected break direction */
  direction: 'bullish' | 'bearish';
  /** Trigger price level */
  triggerPrice: number;
  /** Use strict inequality for break detection */
  strictInequality: boolean;
}

/**
 * Break of Structure signal representing a confirmed structural break
 */
export interface BosSignal {
  /** Timestamp when BOS was detected */
  timestamp: number;
  /** Trading symbol */
  symbol: string;
  /** Signal type */
  type: 'BOS_BULLISH' | 'BOS_BEARISH';
  /** Price level where break occurred */
  triggerPrice: number;
  /** Pivot point that was broken */
  brokenPivot: PivotPoint;
  /** Window that triggered this signal */
  windowId: string;
  /** Signal confidence score (0-100) */
  confidence: number;
  /** Signal strength score (0-100) */
  strength: number;
  /** Bar that triggered the signal */
  triggerBar: BarData;
}

/**
 * BOS Engine state snapshot
 */
export interface BosEngineState {
  /** Currently active windows */
  activeWindows: BosWindow[];
  /** Recent pivot points */
  recentPivots: PivotPoint[];
  /** Generated signals */
  signals: BosSignal[];
  /** Last processing timestamp */
  lastProcessedAt: number;
  /** Engine statistics */
  stats: {
    totalWindowsOpened: number;
    totalSignals: number;
    totalBarsProcessed: number;
    uptimeMs: number;
    startTime: number;
  };
}

/**
 * Interface for BOS Reversal Engine implementation
 */
export interface IBosReversalEngine {
  /** Open a new BOS detection window */
  openWindow(
    referencePivot: PivotPoint,
    durationMs?: number,
    direction?: 'bullish' | 'bearish'
  ): BosWindow | null;
  /** Process new bar data */
  onBar(bar: BarData): BosSignal[];
  /** Get current engine state */
  getState(): BosEngineState;
  /** Close specific window */
  closeWindow(windowId: string): boolean;
  /** Cleanup expired windows */
  cleanup(): number;
  /** Get performance metrics */
  getPerformanceMetrics(): BosPerformanceMetrics;
}

/**
 * Configuration for pivot detection
 */
export interface PivotConfig {
  /** Minimum number of left bars for pivot detection */
  minLeftBars: number;
  /** Minimum number of right bars for pivot confirmation */
  minRightBars: number;
  /** Maximum lookback period in bars */
  maxLookback: number;
}

/**
 * Configuration for BOS window management
 */
export interface WindowConfig {
  /** Maximum number of windows per symbol */
  maxWindowsPerSymbol: number;
  /** Default window duration in milliseconds */
  defaultDurationMs: number;
  /** Cleanup interval in milliseconds */
  cleanupIntervalMs: number;
}

/**
 * Configuration for BOS signal generation
 */
export interface SignalConfig {
  /** Minimum confidence score for valid signals */
  minConfidence: number;
  /** Cooldown period between signals in milliseconds */
  cooldownMs: number;
  /** Use strict inequality for break detection */
  strictInequality: boolean;
}

/**
 * Configuration for BOS performance optimization
 */
export interface PerformanceConfig {
  /** Enable performance monitoring */
  enableMetrics: boolean;
  /** Maximum signals to keep in memory */
  maxSignalsHistory: number;
  /** Enable window performance tracking */
  enableWindowTracking: boolean;
}

/**
 * Complete BOS configuration
 */
export interface BosConfig {
  /** Pivot detection configuration */
  pivots: PivotConfig;
  /** Window management configuration */
  windows: WindowConfig;
  /** Signal generation configuration */
  signals: SignalConfig;
  /** Performance optimization configuration */
  performance: PerformanceConfig;
}

/**
 * Default BOS configuration
 */
export const DEFAULT_BOS_CONFIG: BosConfig = {
  pivots: {
    minLeftBars: 2,
    minRightBars: 2,
    maxLookback: 100
  },
  windows: {
    maxWindowsPerSymbol: 10,
    defaultDurationMs: 24 * 60 * 60 * 1000, // 24 hours
    cleanupIntervalMs: 60 * 1000 // 1 minute
  },
  signals: {
    minConfidence: 50,
    cooldownMs: 5 * 60 * 1000, // 5 minutes
    strictInequality: false
  },
  performance: {
    enableMetrics: true,
    maxSignalsHistory: 1000,
    enableWindowTracking: true
  }
};

/**
 * BOS performance metrics
 */
export interface BosPerformanceMetrics {
  /** Average processing time per bar in milliseconds */
  avgProcessingTimeMs: number;
  /** Estimated memory usage in bytes */
  memoryUsageBytes: number;
  /** Cache hit ratio (0-1) */
  cacheHitRatio: number;
  /** Number of active windows */
  activeWindowsCount: number;
  /** Signals generated per minute */
  signalsPerMinute: number;
  /** Timestamp when metrics were measured */
  measurementTimestamp: number;
}

/**
 * Custom error class for BOS operations
 */
export class BosError extends Error {
  constructor(
    public code: 'INVALID_PIVOT' | 'INVALID_CONFIG' | 'WINDOW_LIMIT_EXCEEDED' | 'UNKNOWN',
    message: string
  ) {
    super(message);
    this.name = 'BosError';
    Object.setPrototypeOf(this, BosError.prototype);
  }
}
