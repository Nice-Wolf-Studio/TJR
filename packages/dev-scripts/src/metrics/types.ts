/**
 * Type definitions for metrics computation
 * @module @tjr/dev-scripts/metrics/types
 */

/**
 * Hit-rate metrics for trading signals
 */
export interface HitRateMetrics {
  /** Overall hit-rate percentage */
  overall: number;
  /** Long trade hit-rate percentage */
  long: number;
  /** Short trade hit-rate percentage */
  short: number;
  /** Total number of signals */
  totalSignals: number;
  /** Number of successful signals */
  successful: number;
  /** Number of failed signals */
  failed: number;
}

/**
 * Precision@K metrics for ranked predictions
 */
export interface PrecisionAtKMetrics {
  /** Precision at K=1 */
  k1: number;
  /** Precision at K=3 */
  k3: number;
  /** Precision at K=5 */
  k5: number;
  /** Precision at K=10 */
  k10: number;
}

/**
 * Latency metrics for performance benchmarking
 */
export interface LatencyMetrics {
  /** Minimum latency in milliseconds */
  min: number;
  /** Maximum latency in milliseconds */
  max: number;
  /** Mean latency in milliseconds */
  mean: number;
  /** Median latency in milliseconds */
  median: number;
  /** 95th percentile latency in milliseconds */
  p95: number;
  /** 99th percentile latency in milliseconds */
  p99: number;
  /** Total duration in milliseconds */
  total: number;
}

/**
 * Signal count metrics
 */
export interface SignalMetrics {
  /** Number of FVGs detected */
  fvgs?: number;
  /** Number of Order Blocks detected */
  orderBlocks?: number;
  /** Number of execution triggers */
  executions?: number;
  /** Average confluence score */
  avgConfluence?: number;
  /** Number of swing points */
  swings?: number;
}

/**
 * Complete metrics for backtesting
 */
export interface BacktestMetrics {
  /** Hit-rate metrics */
  hitRate?: HitRateMetrics;
  /** Precision@K metrics */
  precisionAtK?: PrecisionAtKMetrics;
  /** Latency metrics */
  latency: LatencyMetrics;
  /** Signal count metrics */
  signals: SignalMetrics;
}

/**
 * Trading signal for hit-rate calculation
 */
export interface TradingSignal {
  /** Direction of the trade */
  direction: 'long' | 'short';
  /** Entry price */
  entry: number;
  /** Stop loss price */
  stopLoss: number;
  /** Take profit price */
  takeProfit: number;
  /** Whether the trade was successful */
  successful?: boolean;
}

/**
 * Ranked item for precision@K calculation
 */
export interface RankedItem {
  /** Score or rank of the item */
  score: number;
  /** Whether the item is relevant/valid */
  relevant: boolean;
}
