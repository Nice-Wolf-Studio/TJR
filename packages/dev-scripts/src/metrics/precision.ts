/**
 * Precision@K metrics calculation
 *
 * Measures the relevance of top-K ranked items. Useful for evaluating
 * confluence scoring systems where we want to know if the highest-scored
 * zones are actually the most relevant.
 *
 * @module @tjr/dev-scripts/metrics/precision
 */

import type { PrecisionAtKMetrics, RankedItem } from './types';

/**
 * Calculate precision@K metrics for ranked items
 *
 * Precision@K = (relevant_items_in_top_k / k) * 100
 *
 * Computed at K=[1, 3, 5, 10] for standard evaluation.
 *
 * @param items - Array of ranked items sorted by score (highest first)
 * @returns Precision@K metrics object
 *
 * @example
 * const items = [
 *   { score: 95, relevant: true },  // Rank 1
 *   { score: 85, relevant: true },  // Rank 2
 *   { score: 75, relevant: false }, // Rank 3
 *   { score: 65, relevant: true },  // Rank 4
 *   { score: 55, relevant: false }, // Rank 5
 * ];
 * const metrics = calculatePrecisionAtK(items);
 * // => { k1: 100.0, k3: 66.7, k5: 60.0, k10: 0 (not enough items) }
 */
export function calculatePrecisionAtK(items: RankedItem[]): PrecisionAtKMetrics {
  // Sort by score descending (highest first)
  const sorted = [...items].sort((a, b) => b.score - a.score);

  return {
    k1: precisionAt(sorted, 1),
    k3: precisionAt(sorted, 3),
    k5: precisionAt(sorted, 5),
    k10: precisionAt(sorted, 10),
  };
}

/**
 * Calculate precision at a specific K value
 *
 * @param items - Sorted array of ranked items
 * @param k - Number of top items to consider
 * @returns Precision percentage at K
 */
function precisionAt(items: RankedItem[], k: number): number {
  // If we don't have K items, return 0
  if (items.length < k) {
    return 0;
  }

  // Count relevant items in top-K
  const topK = items.slice(0, k);
  const relevantCount = topK.filter(item => item.relevant).length;

  const precision = (relevantCount / k) * 100;
  return round1(precision);
}

/**
 * Round number to 1 decimal place for display
 */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}