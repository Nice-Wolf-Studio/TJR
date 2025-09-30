/**
 * @fileoverview Order Block confluence detection stub.
 *
 * Placeholder implementation for Order Block detection logic.
 * Will be implemented in Issue #28.
 *
 * @module @tjr/tjr-tools/confluences/order-block
 */

import type { MarketBar } from '@tjr/contracts';

/**
 * Order Block detection result.
 */
export interface OrderBlockResult {
  /** Whether an order block was detected */
  detected: boolean;

  /** Confidence score (0-1) */
  confidence: number;

  /** Price level of the order block */
  level?: number;

  /** Type of order block */
  type?: 'bullish' | 'bearish';

  /** Description of the order block if detected */
  description?: string;
}

/**
 * Detects Order Blocks in price action.
 *
 * STUB: Always returns no detection.
 * Full implementation in Issue #28.
 *
 * @param bars - Market bars for analysis
 * @returns Order Block detection result
 */
export function detectOrderBlock(_bars: MarketBar[]): OrderBlockResult {
  // Stub implementation - always returns no detection
  return {
    detected: false,
    confidence: 0,
    description: 'Order Block detection not yet implemented'
  };
}