/**
 * @fileoverview Swing detection types for HTF (Higher Timeframe) swing analysis.
 *
 * Defines types for H1/H4 swing high/low detection, including configuration,
 * swing points, swing series, and performance metrics.
 *
 * @module @tjr/contracts/swings
 */

/**
 * Higher timeframe enumeration for swing detection
 */
export type HTF = "H1" | "H4";

/**
 * Base timeframe enumeration for aggregation
 */
export type BaseTF = "M1" | "M5" | "M15" | "M30";

/**
 * OHLC bar interface for swing detection - verbose format
 */
export interface OhlcBarVerbose {
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
  /** Volume */
  volume?: number;
}

/**
 * OHLC bar interface for swing detection - shorthand format
 */
export interface OhlcBarShorthand {
  /** Timestamp in unix milliseconds or Date */
  t: number | Date;
  /** Opening price */
  o: number;
  /** High price */
  h: number;
  /** Low price */
  l: number;
  /** Closing price */
  c: number;
  /** Volume */
  v?: number;
}

/**
 * OHLC bar - supports both verbose and shorthand formats
 */
export type OhlcBar = OhlcBarVerbose | OhlcBarShorthand;

/**
 * Represents a detected swing point (high or low)
 */
export interface SwingPoint {
  /** Unique identifier: `${htf}:${timestamp}` */
  id: string;
  /** Higher timeframe where swing was detected */
  htf: HTF;
  /** Type of swing point */
  kind: "HIGH" | "LOW";
  /** Price level of the swing */
  price: number;
  /** Timestamp when swing occurred (verbose) */
  time: Date;
  /** Timestamp when swing occurred (alias for backward compatibility) */
  timestamp?: Date;
  /** Number of bars to the left that must be lower (for HIGH) or higher (for LOW) */
  left: number;
  /** Number of bars to the right that must be lower (for HIGH) or higher (for LOW) */
  right: number;
  /** Number of confirmation bars required after pattern */
  confirm: number;
  /** Whether the swing point is confirmed (has enough confirmation bars) */
  confirmed: boolean;
  /** Index of the source bar that created this swing */
  sourceBarIndex: number;
}

/**
 * Configuration for swing detection algorithm
 */
export interface SwingConfig {
  /** Number of bars to the left that must be lower (HIGH) or higher (LOW) */
  left: number;
  /** Number of bars to the right that must be lower (HIGH) or higher (LOW) */
  right: number;
  /** Number of confirmation bars required after pattern detection */
  confirm: number;
  /** Maximum number of recent swing points to keep in memory */
  keepRecent: number;
}

/**
 * Series of swing points for a specific timeframe
 */
export interface SwingSeries {
  /** Higher timeframe */
  htf: HTF;
  /** Confirmed swing highs */
  highs: SwingPoint[];
  /** Confirmed swing lows */
  lows: SwingPoint[];
  /** Pending swing high (not yet confirmed) */
  pendingHigh?: SwingPoint;
  /** Pending swing low (not yet confirmed) */
  pendingLow?: SwingPoint;
}

/**
 * Complete snapshot of swing analysis for a symbol
 */
export interface HtfSwingsSnapshot {
  /** Trading symbol */
  symbol: string;
  /** Date of analysis (YYYY-MM-DD format) */
  date: string;
  /** H1 timeframe swing analysis */
  h1: SwingSeries;
  /** H4 timeframe swing analysis */
  h4: SwingSeries;
}

/**
 * Ring buffer interface for efficient O(1) bar storage with bounded memory
 */
export interface RingBuffer<T> {
  /** Add item to buffer */
  push(item: T): void;
  /** Get item at index (0 = most recent) */
  get(index: number): T | undefined;
  /** Get current size */
  size(): number;
  /** Check if buffer is full */
  isFull(): boolean;
  /** Clear all items */
  clear(): void;
}

/**
 * Configuration for HtfSwings class
 */
export interface HtfSwingsConfig {
  /** Trading symbol */
  symbol: string;
  /** Swing detection configurations per timeframe */
  config: {
    H1: SwingConfig;
    H4: SwingConfig;
  };
  /** Whether to aggregate from base timeframe */
  aggregate?: boolean;
  /** Base timeframe for aggregation */
  baseTf?: BaseTF;
}

/**
 * Performance metrics for swing detection
 */
export interface SwingMetrics {
  /** Processing time in milliseconds */
  processingTime: number;
  /** Number of bars processed */
  barsProcessed: number;
  /** Memory usage in bytes */
  memoryUsage: number;
  /** Number of swing points detected */
  swingPointsDetected: number;
  /** Timestamp of metrics collection */
  timestamp: number;
}

/**
 * Default swing configurations for H1 and H4 timeframes
 */
export const DEFAULT_SWING_CONFIG: Record<HTF, SwingConfig> = {
  H1: {
    left: 2,
    right: 2,
    confirm: 1,
    keepRecent: 100
  },
  H4: {
    left: 2,
    right: 2,
    confirm: 1,
    keepRecent: 50
  }
};
