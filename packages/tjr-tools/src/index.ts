/**
 * @fileoverview TJR-Tools package exports.
 *
 * This package provides confluence detection tools for TJR (Trading Journal Research)
 * methodology, including Fair Value Gap (FVG) and Order Block detection, plus execution
 * trigger logic for 5m confirmation and 1m entry, and risk management capabilities.
 *
 * @module @tjr/tjr-tools
 */

// Main analysis function
export { analyze } from './analyze.js';
export type { TJRToolsResult } from './analyze.js';

// Types
export type {
  AnalyzeOptions,
  FVGZone,
  OrderBlock,
  FVGOptions,
  OrderBlockOptions,
  ConfluenceWeights,
  ExecutionConfig,
  ConfirmationResult,
  EntryTrigger,
} from './types.js';

// Confluence detection
export { detectFVGs, detectOrderBlocks } from './confluences/index.js';
export { calculateConfluence, DEFAULT_WEIGHTS } from './scoring/index.js';

// Execution modules
export {
  checkConfirmation,
  checkEntryTrigger,
  calculatePriceLevels,
  calculatePositionSize as calculateExecutionPositionSize,
  DEFAULT_EXECUTION_CONFIG,
  AGGRESSIVE_CONFIG,
  CONSERVATIVE_CONFIG,
  type PriceLevels,
} from './execution/index.js';

// Risk management exports
export {
  calculateRisk,
  calculatePositionSize as calculateRiskPositionSize,
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
