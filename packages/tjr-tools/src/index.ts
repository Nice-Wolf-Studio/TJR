/**
 * @fileoverview TJR-Tools package exports.
 *
 * This package provides confluence detection tools for TJR (Trading Journal Research)
 * methodology, including Fair Value Gap (FVG) and Order Block detection.
 *
 * @module @tjr/tjr-tools
 */

export { analyze } from './analyze.js';
export type { TJRToolsResult } from './analyze.js';
export type { AnalyzeOptions, FVGZone, OrderBlock, FVGOptions, OrderBlockOptions, ConfluenceWeights } from './types.js';
export { detectFVGs, detectOrderBlocks } from './confluences/index.js';
export { calculateConfluence, DEFAULT_WEIGHTS } from './scoring/index.js';