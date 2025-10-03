/**
 * @fileoverview Internal types for TJR-Tools package.
 * @module @tjr/tjr-tools/types
 */

import type { MarketBar } from '@tjr/contracts';
import type { RiskConfig, RiskCalculationInput } from './risk/index.js';

export type { MarketBar } from '@tjr/contracts';
export type {
  RiskConfig,
  RiskCalculationInput,
  RiskManagementResult,
  PartialExitLevel,
} from './risk/index.js';

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
 * Execution configuration for 5m confirmation and 1m entry.
 */
export interface ExecutionConfig {
  /** 5-minute confirmation thresholds */
  confirmation5m: {
    /** Minimum confluence score required (default: 70) */
    minConfluenceScore: number;
    /** Required confluence factors that must be present */
    requiredFactors?: string[];
    /** Maximum bars to look back for confirmation */
    lookbackBars?: number;
  };

  /** 1-minute entry thresholds */
  entry1m: {
    /** Minimum confluence score for entry (default: 60) */
    minConfluenceScore: number;
    /** Maximum bars after 5m confirmation to wait for 1m entry */
    maxBarsAfterConfirmation: number;
    /** Require price to be within zones for entry */
    requireZoneEntry?: boolean;
  };

  /** Risk management parameters */
  risk: {
    /** Maximum risk per trade as a fraction (default: 0.01 = 1%) */
    maxRiskPerTrade: number;
    /** Account size for position sizing (optional) */
    accountSize?: number;
    /** Default stop loss as percentage from entry (default: 0.015 = 1.5%) */
    defaultStopPercent: number;
    /** Default risk-reward ratio (default: 2.0) */
    defaultRiskReward: number;
  };

  /** Dry run mode - log but don't generate execution */
  dryRun?: boolean;
}

/**
 * Confirmation result from 5-minute timeframe.
 */
export interface ConfirmationResult {
  /** Whether confirmation criteria were met */
  confirmed: boolean;
  /** Timestamp of confirmation bar */
  timestamp?: string;
  /** Bar index where confirmation occurred */
  barIndex?: number;
  /** Confluence score at confirmation */
  confluenceScore?: number;
  /** Reasoning for confirmation or rejection */
  reason: string;
}

/**
 * Entry trigger result from 1-minute timeframe.
 */
export interface EntryTrigger {
  /** Whether entry criteria were met */
  triggered: boolean;
  /** Entry price */
  entryPrice?: number;
  /** Timestamp of entry bar */
  timestamp?: string;
  /** Bar index where entry triggered */
  barIndex?: number;
  /** Direction of trade */
  direction?: 'long' | 'short';
  /** Reasoning for entry or rejection */
  reason: string;
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
  /** Execution configuration for trade triggers */
  execution?: ExecutionConfig;
  /** 1-minute bars for entry timing (optional) */
  bars1m?: MarketBar[];
  /** Risk management configuration (optional) */
  risk?: RiskCalculationInput & { config: RiskConfig };
}
