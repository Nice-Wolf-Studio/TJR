/**
 * @fileoverview Input validation utilities.
 * @module @tjr/tjr-tools/utils/validation
 */

import type { TJRAnalysisInput } from '@tjr/contracts';
import type { MarketBar } from '@tjr/contracts';

/**
 * Validate TJR analysis input.
 */
export function validateInput(input: TJRAnalysisInput): void {
  if (!input.symbol || typeof input.symbol !== 'string') {
    throw new Error('Invalid symbol');
  }

  if (!input.timeframe || typeof input.timeframe !== 'string') {
    throw new Error('Invalid timeframe');
  }

  if (!Array.isArray(input.bars) || input.bars.length === 0) {
    throw new Error('Bars array is required and cannot be empty');
  }

  if (!input.analysisTimestamp || typeof input.analysisTimestamp !== 'string') {
    throw new Error('Invalid analysisTimestamp');
  }

  // Validate bars
  for (const bar of input.bars) {
    validateBar(bar);
  }
}

/**
 * Validate a single market bar.
 */
export function validateBar(bar: MarketBar): void {
  if (
    typeof bar.open !== 'number' ||
    typeof bar.high !== 'number' ||
    typeof bar.low !== 'number' ||
    typeof bar.close !== 'number' ||
    typeof bar.volume !== 'number'
  ) {
    throw new Error('Invalid bar data: all OHLCV values must be numbers');
  }

  if (bar.high < bar.low) {
    throw new Error('Invalid bar: high must be >= low');
  }

  if (bar.volume < 0) {
    throw new Error('Invalid bar: volume cannot be negative');
  }
}

/**
 * Check if there is sufficient data for analysis.
 */
export function hasSufficientData(bars: MarketBar[], minBars: number = 50): boolean {
  return bars.length >= minBars;
}