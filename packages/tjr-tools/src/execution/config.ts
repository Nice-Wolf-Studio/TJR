/**
 * @fileoverview Default configuration for execution logic.
 * @module @tjr/tjr-tools/execution/config
 */

import type { ExecutionConfig } from '../types.js';

/**
 * Default execution configuration.
 * Conservative thresholds to minimize false positives.
 */
export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  confirmation5m: {
    minConfluenceScore: 70,
    requiredFactors: ['Fair Value Gaps', 'Order Blocks'],
    lookbackBars: 20,
  },
  entry1m: {
    minConfluenceScore: 60,
    maxBarsAfterConfirmation: 5,
    requireZoneEntry: true,
  },
  risk: {
    maxRiskPerTrade: 0.01, // 1% risk per trade
    defaultStopPercent: 0.015, // 1.5% stop loss
    defaultRiskReward: 2.0, // 1:2 risk-reward ratio
  },
  dryRun: false,
};

/**
 * Aggressive configuration for higher frequency trading.
 * Lower thresholds, more trades, higher risk.
 */
export const AGGRESSIVE_CONFIG: Partial<ExecutionConfig> = {
  confirmation5m: {
    minConfluenceScore: 60,
    lookbackBars: 15,
  },
  entry1m: {
    minConfluenceScore: 50,
    maxBarsAfterConfirmation: 10,
    requireZoneEntry: false,
  },
  risk: {
    maxRiskPerTrade: 0.02, // 2% risk per trade
    defaultStopPercent: 0.02, // 2% stop loss
    defaultRiskReward: 1.5, // 1:1.5 risk-reward ratio
  },
};

/**
 * Conservative configuration for lower frequency, higher quality setups.
 * Higher thresholds, fewer trades, lower risk.
 */
export const CONSERVATIVE_CONFIG: Partial<ExecutionConfig> = {
  confirmation5m: {
    minConfluenceScore: 80,
    requiredFactors: ['Fair Value Gaps', 'Order Blocks', 'Zone Overlap'],
    lookbackBars: 30,
  },
  entry1m: {
    minConfluenceScore: 70,
    maxBarsAfterConfirmation: 3,
    requireZoneEntry: true,
  },
  risk: {
    maxRiskPerTrade: 0.005, // 0.5% risk per trade
    defaultStopPercent: 0.01, // 1% stop loss
    defaultRiskReward: 3.0, // 1:3 risk-reward ratio
  },
};

/**
 * Merge user config with defaults.
 *
 * @param userConfig - User-provided partial configuration
 * @returns Complete execution configuration
 */
export function mergeExecutionConfig(userConfig?: Partial<ExecutionConfig>): ExecutionConfig {
  if (!userConfig) {
    return DEFAULT_EXECUTION_CONFIG;
  }

  return {
    confirmation5m: {
      ...DEFAULT_EXECUTION_CONFIG.confirmation5m,
      ...userConfig.confirmation5m,
    },
    entry1m: {
      ...DEFAULT_EXECUTION_CONFIG.entry1m,
      ...userConfig.entry1m,
    },
    risk: {
      ...DEFAULT_EXECUTION_CONFIG.risk,
      ...userConfig.risk,
    },
    dryRun: userConfig.dryRun ?? DEFAULT_EXECUTION_CONFIG.dryRun,
  };
}
