/**
 * @fileoverview Fair Value Gap (FVG) confluence detection stub.
 *
 * Placeholder implementation for FVG detection logic.
 * Will be implemented in Issue #28.
 *
 * @module @tjr/tjr-tools/confluences/fvg
 */

import type { MarketBar } from '@tjr/contracts';

/**
 * FVG detection result.
 */
export interface FVGResult {
  /** Whether an FVG was detected */
  detected: boolean;

  /** Confidence score (0-1) */
  confidence: number;

  /** Description of the FVG if detected */
  description?: string;
}

/**
 * Detects Fair Value Gaps in price action.
 *
 * STUB: Always returns no detection.
 * Full implementation in Issue #28.
 *
 * @param bars - Market bars for analysis
 * @returns FVG detection result
 */
export function detectFVG(_bars: MarketBar[]): FVGResult {
  // Stub implementation - always returns no detection
  return {
    detected: false,
    confidence: 0,
    description: 'FVG detection not yet implemented'
  };
}