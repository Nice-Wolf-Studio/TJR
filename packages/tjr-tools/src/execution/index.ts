/**
 * @fileoverview Execution module exports.
 *
 * @module @tjr/tjr-tools/execution
 */

export { checkConfirmation, determineDirection } from './confirmation.js';
export { checkEntryTrigger, getOptimalEntryPrice } from './entry.js';
export {
  calculateStopLoss,
  calculateTakeProfit,
  calculatePriceLevels,
  validatePriceLevels,
  type PriceLevels,
} from './price-levels.js';
export {
  calculatePositionSize,
  calculateConfidence,
  adjustPositionByConfidence,
  calculateExpectedDuration,
  generateExecutionNotes,
} from './position-sizing.js';
export {
  buildExecution,
  shouldGenerateExecution,
  extractActiveFactors,
} from './execution-builder.js';
export {
  DEFAULT_EXECUTION_CONFIG,
  AGGRESSIVE_CONFIG,
  CONSERVATIVE_CONFIG,
  mergeExecutionConfig,
} from './config.js';
