/**
 * @fileoverview Equilibrium analysis types for Premium/Discount calculation.
 *
 * Defines types for calculating equilibrium (50% level) of swing ranges and
 * classifying current price as premium, discount, or equilibrium zone.
 *
 * @module @tjr/contracts/equilibrium
 */

import type { HTF } from './swings.js';

/**
 * Represents a swing range between a high and low point
 */
export interface SwingRange {
  /**
   * Swing high price
   */
  high: number;

  /**
   * Swing low price
   */
  low: number;

  /**
   * Timestamp when the swing range was established
   */
  timestamp: Date;

  /**
   * Timeframe of the swing range
   */
  timeframe: HTF | 'M5' | 'M1';

  /**
   * Source of the swing range
   * - COMPUTED: Calculated from swing detection algorithm
   * - PROVIDED: User-provided or imported range
   */
  source: 'COMPUTED' | 'PROVIDED';
}

/**
 * Configuration options for equilibrium calculation
 */
export interface EquilibriumConfig {
  /**
   * Threshold percentage for "at equilibrium" classification
   *
   * Price is considered at equilibrium if within this percentage
   * of the 50% level. Value is in decimal form (0.02 = 2%).
   *
   * @default 0.02 (2%)
   */
  threshold?: number;

  /**
   * Minimum range size (in points) to calculate equilibrium
   *
   * Ranges smaller than this return null to avoid meaningless
   * calculations on noise ranges.
   *
   * @default 5
   */
  minRangeSize?: number;

  /**
   * Round result to decimal places
   *
   * Controls precision of calculated equilibrium levels and
   * distance metrics.
   *
   * @default 6
   */
  precision?: number;
}

/**
 * Zone classification for price relative to equilibrium
 *
 * - PREMIUM: Price is above equilibrium (bullish zone)
 * - DISCOUNT: Price is below equilibrium (bearish zone)
 * - EQUILIBRIUM: Price is at/near equilibrium (neutral zone)
 */
export type EquilibriumZone = 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';

/**
 * Complete equilibrium analysis result
 */
export interface EquilibriumLevel {
  /**
   * Swing range used for calculation
   */
  range: SwingRange;

  /**
   * Calculated equilibrium level (50% of range)
   *
   * Formula: low + ((high - low) / 2)
   */
  equilibrium: number;

  /**
   * Current price being analyzed
   */
  currentPrice: number;

  /**
   * Zone classification based on price position
   */
  zone: EquilibriumZone;

  /**
   * Distance from equilibrium as percentage (0-1 scale)
   *
   * - Positive values indicate premium (above equilibrium)
   * - Negative values indicate discount (below equilibrium)
   * - Values near zero indicate at equilibrium
   *
   * Formula: (currentPrice - equilibrium) / (high - low)
   */
  distancePercent: number;

  /**
   * Absolute distance in points from equilibrium
   *
   * Always positive regardless of direction.
   */
  distancePoints: number;

  /**
   * Timestamp of calculation
   */
  timestamp: Date;
}
