/**
 * @fileoverview Internal types for TJR-Tools package.
 * @module @tjr/tjr-tools/types
 */

export type { MarketBar } from '@tjr/contracts';

/**
 * Fair Value Gap (FVG) zone detected in price action.
 */
export interface FVGZone {
  /** Type of FVG */
  type: 'bullish' | 'bearish';
  /** Starting bar index */
  startIndex: number;
  /** Upper bound of the gap */
  high: number;
  /** Lower bound of the gap */
  low: number;
  /** Gap size in price */
  size: number;
  /** Strength score (0-1) */
  strength: number;
  /** Whether the gap has been filled by subsequent price action */
  filled: boolean;
}

/**
 * Order Block zone detected in price action.
 */
export interface OrderBlock {
  /** Type of order block */
  type: 'demand' | 'supply';
  /** Bar index where the block formed */
  index: number;
  /** Upper bound of the block (high of the bar) */
  high: number;
  /** Lower bound of the block (low of the bar) */
  low: number;
  /** Volume at the block */
  volume: number;
  /** Strength score (0-1) */
  strength: number;
  /** Whether the block has been mitigated by price returning */
  mitigated: boolean;
}

/**
 * Options for FVG detection.
 */
export interface FVGOptions {
  /** Minimum gap size as percentage of ATR (default: 0.5) */
  minGapSizeATR?: number;
  /** Whether to check if gaps are filled (default: true) */
  checkFilled?: boolean;
}

/**
 * Options for Order Block detection.
 */
export interface OrderBlockOptions {
  /** Minimum volume ratio vs average (default: 1.5) */
  minVolumeRatio?: number;
  /** Minimum rejection wick size (default: 0.3 of range) */
  minRejection?: number;
  /** Whether to check if blocks are mitigated (default: true) */
  checkMitigated?: boolean;
}

/**
 * Confluence weights for scoring.
 */
export interface ConfluenceWeights {
  /** Weight for FVG factor (default: 0.4) */
  fvg: number;
  /** Weight for Order Block factor (default: 0.3) */
  orderBlock: number;
  /** Weight for overlap factor (default: 0.2) */
  overlap: number;
  /** Weight for recency factor (default: 0.1) */
  recency: number;
}

/**
 * Analysis options.
 */
export interface AnalyzeOptions {
  /** FVG detection options */
  fvg?: FVGOptions;
  /** Order Block detection options */
  orderBlock?: OrderBlockOptions;
  /** Confluence weights */
  weights?: Partial<ConfluenceWeights>;
  /** Enable FVG detection (default: true) */
  enableFVG?: boolean;
  /** Enable Order Block detection (default: true) */
  enableOrderBlock?: boolean;
}