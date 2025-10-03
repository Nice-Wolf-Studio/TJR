/**
 * @fileoverview TJR analysis input/output DTOs.
 *
 * Defines data transfer objects for TJR (Trading Journal Research) methodology:
 * - Analysis inputs (symbol, bars, context)
 * - Confluence scoring and factor breakdown
 * - Execution parameters (entry, stops, targets)
 * - Complete analysis results
 *
 * @module @tjr/contracts/tjr
 */

import type { MarketBar } from './market.js';
import type { Timeframe } from './timeframes.js';

/**
 * Input data for TJR analysis.
 *
 * Encapsulates all necessary context for performing TJR confluence analysis
 * and generating trade execution parameters.
 *
 * @invariant bars.length > 0
 * @invariant bars are sorted by timestamp ascending
 * @invariant analysisTimestamp >= last bar timestamp
 *
 * @example
 * ```typescript
 * const input: TJRAnalysisInput = {
 *   symbol: 'SPY',
 *   timeframe: Timeframe.M5,
 *   bars: [
 *     { timestamp: '2025-01-15T14:30:00Z', open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
 *     // ... more bars
 *   ],
 *   analysisTimestamp: '2025-01-15T15:00:00.000Z'
 * };
 * ```
 */
export interface TJRAnalysisInput {
  /** Symbol being analyzed */
  symbol: string;

  /** Timeframe of the bars */
  timeframe: Timeframe;

  /**
   * Historical bars for analysis (must be in ascending timestamp order).
   * Minimum count depends on TJR requirements (typically 50+ for reliable analysis).
   */
  bars: MarketBar[];

  /** Timestamp when analysis was requested (ISO 8601 UTC) */
  analysisTimestamp: string;
}

/**
 * Confluence score and contributing factors.
 *
 * Quantifies alignment of multiple technical indicators/patterns.
 * Higher scores indicate stronger setups.
 *
 * @invariant score is between 0 and 100 (inclusive)
 * @invariant factors.length > 0
 * @invariant sum of factors[].weight should equal 1.0 (100%)
 * @invariant each factor.value is between 0 and 1
 *
 * @example
 * ```typescript
 * const confluence: TJRConfluence = {
 *   score: 85,
 *   factors: [
 *     { name: 'Support/Resistance', weight: 0.3, value: 0.9 },
 *     { name: 'Trend Alignment', weight: 0.25, value: 0.8 },
 *     { name: 'Volume Profile', weight: 0.2, value: 0.85 },
 *     { name: 'Fibonacci Levels', weight: 0.15, value: 0.7 },
 *     { name: 'Moving Averages', weight: 0.1, value: 0.95 }
 *   ]
 * };
 * ```
 */
export interface TJRConfluence {
  /**
   * Overall confluence score (0-100).
   * Weighted average of all factors scaled to percentage.
   */
  score: number;

  /**
   * Individual confluence factors with their contributions.
   */
  factors: Array<{
    /** Factor name/identifier */
    name: string;

    /** Weight in overall score (0-1, should sum to 1.0 across all factors) */
    weight: number;

    /**
     * Factor value/strength (0-1).
     * 0 = no confluence, 1 = perfect confluence
     */
    value: number;

    /** Optional: Human-readable description */
    description?: string;
  }>;
}

/**
 * Trade execution parameters derived from TJR analysis.
 *
 * Specifies exact prices and position sizing for trade entry/exit.
 *
 * @invariant direction is 'long' or 'short'
 * @invariant For longs: entryPrice < takeProfit && stopLoss < entryPrice
 * @invariant For shorts: entryPrice > takeProfit && stopLoss > entryPrice
 * @invariant positionSize > 0
 * @invariant riskRewardRatio > 0
 *
 * @example
 * ```typescript
 * const execution: TJRExecution = {
 *   entryPrice: 100.50,
 *   stopLoss: 99.00,
 *   takeProfit: 103.50,
 *   positionSize: 100,
 *   direction: 'long',
 *   riskRewardRatio: 2.0,
 *   confidence: 'high'
 * };
 * ```
 */
export interface TJRExecution {
  /** Price at which to enter the trade */
  entryPrice: number;

  /** Stop-loss price (risk management) */
  stopLoss: number;

  /** Take-profit target price */
  takeProfit: number;

  /** Number of shares/contracts/units to trade */
  positionSize: number;

  /** Trade direction */
  direction: 'long' | 'short';

  /**
   * Risk-reward ratio (reward / risk).
   * Example: 2.0 means $2 potential profit for every $1 risked.
   */
  riskRewardRatio: number;

  /**
   * Confidence level for this trade.
   * Derived from confluence score and market conditions.
   */
  confidence: 'low' | 'medium' | 'high';

  /** Optional: Expected trade duration */
  expectedDuration?: string;

  /** Optional: Additional notes/reasoning */
  notes?: string;
}

/**
 * Complete TJR analysis result.
 *
 * Combines input snapshot, confluence analysis, and optional execution plan.
 * Fully serializable for logging, storage, and replay.
 *
 * @invariant input is always present
 * @invariant confluence is always present
 * @invariant execution is present only if trade is recommended
 * @invariant warnings.length >= 0
 *
 * @example
 * ```typescript
 * const result: TJRResult = {
 *   input: { symbol: 'SPY', timeframe: Timeframe.M5, bars: [...], analysisTimestamp: '...' },
 *   confluence: { score: 85, factors: [...] },
 *   execution: { entryPrice: 100.5, stopLoss: 99, takeProfit: 103.5, ... },
 *   warnings: [],
 *   metadata: {
 *     analysisVersion: '1.0.0',
 *     computeTimeMs: 45
 *   }
 * };
 * ```
 */
export interface TJRResult {
  /** Input data snapshot (for audit trail) */
  input: TJRAnalysisInput;

  /** Confluence analysis results */
  confluence: TJRConfluence;

  /**
   * Execution parameters (if trade is recommended).
   * Omitted if confluence score below threshold or no valid setup.
   */
  execution?: TJRExecution;

  /**
   * Warnings about data quality, missing indicators, or analysis limitations.
   * Empty array if no warnings.
   */
  warnings: string[];

  /**
   * Optional metadata about the analysis.
   */
  metadata?: {
    /** Version of TJR analysis engine */
    analysisVersion?: string;

    /** Time taken to compute (milliseconds) */
    computeTimeMs?: number;

    /** Additional context */
    [key: string]: unknown;
  };
}

/**
 * Type guard to check if a TJRResult includes execution parameters.
 *
 * @param result - TJR analysis result
 * @returns True if result has execution plan
 *
 * @example
 * ```typescript
 * if (hasExecution(result)) {
 *   console.log(`Entry: ${result.execution.entryPrice}`);
 * }
 * ```
 */
export function hasExecution(result: TJRResult): result is TJRResult & { execution: TJRExecution } {
  return result.execution !== undefined;
}
