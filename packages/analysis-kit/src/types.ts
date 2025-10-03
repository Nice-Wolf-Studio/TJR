/**
 * Core type definitions for analysis-kit package
 * All types are designed to work with pure functions (no I/O, deterministic)
 */

/**
 * Represents a single price bar (candlestick) with OHLC data
 */
export interface Bar {
  /** Bar timestamp in Unix epoch milliseconds (UTC) */
  timestamp: number;

  /** Opening price */
  open: number;

  /** Highest price during the period */
  high: number;

  /** Lowest price during the period */
  low: number;

  /** Closing price */
  close: number;

  /** Trading volume (optional) */
  volume?: number;
}

/**
 * Represents a time window with start and end dates
 */
export interface TimeWindow {
  /** Window start time (UTC) */
  start: Date;

  /** Window end time (UTC) */
  end: Date;
}

/**
 * Swing point types for market structure analysis
 */
export type SwingType = 'HH' | 'HL' | 'LH' | 'LL';

/**
 * Represents a swing point (pivot) in price action
 */
export interface SwingPoint {
  /** Index position in the source bar array */
  index: number;

  /** Timestamp of the swing point (Unix epoch milliseconds) */
  timestamp: number;

  /** Price at the swing point */
  price: number;

  /** Type of swing (Higher High, Higher Low, etc.) */
  type: SwingType;
}

/**
 * Market bias classification
 */
export type Bias = 'bullish' | 'bearish' | 'neutral';

/**
 * Result of bias analysis
 */
export interface BiasResult {
  /** Overall market bias */
  bias: Bias;

  /** Confidence score (0.0 to 1.0) */
  confidence: number;

  /** Human-readable explanation of the bias determination */
  reason: string;
}

/**
 * Session extremes extracted from RTH bars
 */
export interface SessionExtremes {
  /** Highest price during RTH */
  rthHigh: number;

  /** Lowest price during RTH */
  rthLow: number;

  /** Opening price at RTH start */
  rthOpen: number;

  /** Closing price at RTH end */
  rthClose: number;
}

/**
 * Day profile classification types
 * - P: Trend day (strong directional move)
 * - K: Range day (balanced, mean-reverting)
 * - D: Distribution/Breakout day (wide range, rotational)
 */
export type ProfileType = 'P' | 'K' | 'D';

/**
 * Day profile analysis result
 */
export interface DayProfile {
  /** Profile type classification */
  type: ProfileType;

  /** Descriptive characteristics of the profile */
  characteristics: string[];

  /** Volatility measure (normalized range) */
  volatility: number;
}
