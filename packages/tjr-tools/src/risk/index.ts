/**
 * @fileoverview Risk management module exports.
 * @module @tjr/tjr-tools/risk
 */

// Main risk calculator
export { calculateRisk } from './risk-calculator.js';
export type { RiskCalculationInput, RiskManagementResult } from './risk-calculator.js';

// Configuration
export { validateRiskConfig, mergeRiskConfig, DEFAULT_RISK_CONFIG } from './risk-config.js';
export type { RiskConfig } from './risk-config.js';

// Position sizing
export { calculatePositionSize, calculateRiskRewardRatio } from './position-sizing.js';
export type { PositionSizeResult } from './position-sizing.js';

// Daily stops
export { calculateDailyStop, canTakeNewTrade } from './daily-stops.js';
export type { DailyStopResult, TradeRecord } from './daily-stops.js';

// Partial exits
export { calculatePartialExits, calculateTrailingStop } from './partial-exits.js';
export type { PartialExitLevel } from './partial-exits.js';