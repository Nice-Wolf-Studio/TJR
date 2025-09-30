/**
 * @fileoverview Main entry point for @tjr/tjr-tools package.
 *
 * Exports the core analyze function, configuration types, and confluence utilities.
 *
 * @module @tjr/tjr-tools
 */

// Main analysis function
export { analyze } from './analyze.js';

// Configuration
export type { TJRConfig } from './config.js';
export { DEFAULT_CONFIG, mergeConfig } from './config.js';

// Confluence detection (stubs for now)
export { detectFVG } from './confluences/fvg.js';
export type { FVGResult } from './confluences/fvg.js';

export { detectOrderBlock } from './confluences/order-block.js';
export type { OrderBlockResult } from './confluences/order-block.js';

// Re-export commonly used types from contracts for convenience
export type {
  TJRAnalysisInput,
  TJRConfluence,
  TJRExecution,
  TJRResult
} from '@tjr/contracts';