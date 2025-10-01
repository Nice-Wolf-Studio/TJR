"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasExecution = hasExecution;
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
function hasExecution(result) {
    return result.execution !== undefined;
}
//# sourceMappingURL=tjr.js.map