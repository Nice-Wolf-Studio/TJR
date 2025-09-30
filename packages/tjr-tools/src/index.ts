/**
 * @fileoverview TJR-Tools package exports.
 *
 * This package provides confluence detection tools for TJR (Trading Journal Research)
 * methodology, including Fair Value Gap (FVG) and Order Block detection, plus risk
 * management capabilities.
 *
 * @module @tjr/tjr-tools
 */

export { analyze } from './analyze.js';
export type { TJRToolsResult } from './analyze.js';
export type { AnalyzeOptions, FVGZone, OrderBlock, FVGOptions, OrderBlockOptions, ConfluenceWeights } from './types.js';
export { detectFVGs, detectOrderBlocks } from './confluences/index.js';
export { calculateConfluence, DEFAULT_WEIGHTS } from './scoring/index.js';

// Risk management exports
export {
  calculateRisk,
  calculatePositionSize,
  calculateDailyStop,
  calculatePartialExits,
  calculateRiskRewardRatio,
  calculateTrailingStop,
  canTakeNewTrade,
  validateRiskConfig,
  mergeRiskConfig,
  DEFAULT_RISK_CONFIG,
} from './risk/index.js';
export type {
  RiskConfig,
  RiskCalculationInput,
  RiskManagementResult,
  PositionSizeResult,
  DailyStopResult,
  PartialExitLevel,
  TradeRecord,
} from './risk/index.js';