/**
 * @fileoverview Confluence scoring engine.
 * @module @tjr/tjr-tools/scoring/scorer
 */

import type { FVGZone, OrderBlock, ConfluenceWeights } from '../types.js';
import { zonesOverlap } from '../utils/price-utils.js';
import { DEFAULT_WEIGHTS } from './weights.js';

/**
 * Calculate overall confluence score from detected patterns.
 */
export function calculateConfluence(
  fvgZones: FVGZone[],
  orderBlocks: OrderBlock[],
  weights: Partial<ConfluenceWeights> = {},
  barsCount: number = 0
): number {
  const w = { ...DEFAULT_WEIGHTS, ...weights };

  // FVG factor: average strength of unfilled FVGs
  const unfilledFVGs = fvgZones.filter((z) => !z.filled);
  const fvgFactor =
    unfilledFVGs.length > 0
      ? unfilledFVGs.reduce((sum, z) => sum + z.strength, 0) / unfilledFVGs.length
      : 0;

  // Order Block factor: average strength of unmitigated blocks
  const unmitigatedBlocks = orderBlocks.filter((b) => !b.mitigated);
  const obFactor =
    unmitigatedBlocks.length > 0
      ? unmitigatedBlocks.reduce((sum, b) => sum + b.strength, 0) / unmitigatedBlocks.length
      : 0;

  // Overlap factor: percentage of zones that overlap
  const overlapFactor = calculateOverlapFactor(unfilledFVGs, unmitigatedBlocks);

  // Recency factor: based on most recent zone formation
  const recencyFactor = calculateRecencyFactor(fvgZones, orderBlocks, barsCount);

  // Weighted sum, scaled to 0-100
  const score =
    (fvgFactor * w.fvg +
      obFactor * w.orderBlock +
      overlapFactor * w.overlap +
      recencyFactor * w.recency) *
    100;

  return Math.round(score * 100) / 100; // Round to 2 decimals
}

/**
 * Calculate overlap factor (0-1).
 */
function calculateOverlapFactor(fvgs: FVGZone[], orderBlocks: OrderBlock[]): number {
  if (fvgs.length === 0 || orderBlocks.length === 0) {
    return 0;
  }

  let overlapCount = 0;
  for (const fvg of fvgs) {
    for (const ob of orderBlocks) {
      if (zonesOverlap(fvg, ob)) {
        overlapCount++;
        break; // Count each FVG only once
      }
    }
  }

  return overlapCount / fvgs.length;
}

/**
 * Calculate recency factor (0-1) based on most recent zone.
 */
function calculateRecencyFactor(
  fvgs: FVGZone[],
  orderBlocks: OrderBlock[],
  barsCount: number
): number {
  if (barsCount === 0 || (fvgs.length === 0 && orderBlocks.length === 0)) {
    return 0;
  }

  const mostRecentFVG = fvgs.length > 0 ? Math.max(...fvgs.map((z) => z.startIndex)) : -1;
  const mostRecentOB = orderBlocks.length > 0 ? Math.max(...orderBlocks.map((b) => b.index)) : -1;
  const mostRecentIndex = Math.max(mostRecentFVG, mostRecentOB);

  // More recent = higher score
  const barsAgo = barsCount - mostRecentIndex;
  const recencyScore = Math.max(0, 1 - barsAgo / barsCount);

  return recencyScore;
}
