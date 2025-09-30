/**
 * @fileoverview Main analysis orchestrator for TJR-Tools.
 * @module @tjr/tjr-tools/analyze
 */

import type { TJRAnalysisInput, TJRConfluence } from '@tjr/contracts';
import type { AnalyzeOptions, FVGZone, OrderBlock } from './types.js';
import { validateInput } from './utils/validation.js';
import { detectFVGs } from './confluences/fvg.js';
import { detectOrderBlocks } from './confluences/order-block.js';
import { calculateConfluence } from './scoring/scorer.js';
import { DEFAULT_WEIGHTS } from './scoring/weights.js';

/**
 * Result from TJR-Tools analysis (extends TJRConfluence with details).
 */
export interface TJRToolsResult {
  /** Confluence score and factors */
  confluence: TJRConfluence;
  /** Detected FVG zones */
  fvgZones: FVGZone[];
  /** Detected Order Blocks */
  orderBlocks: OrderBlock[];
}

/**
 * Analyze market data for TJR confluences.
 *
 * Detects Fair Value Gaps and Order Blocks, then calculates a weighted
 * confluence score indicating trade setup strength.
 *
 * @param input - Market data and analysis context
 * @param options - Detection and scoring options
 * @returns Analysis result with confluence score and detected patterns
 */
export function analyze(input: TJRAnalysisInput, options?: AnalyzeOptions): TJRToolsResult {
  // Validate input
  validateInput(input);

  const opts = options || {};
  const weights = { ...DEFAULT_WEIGHTS, ...opts.weights };

  // Run detectors
  const fvgZones = opts.enableFVG !== false ? detectFVGs(input.bars, opts.fvg) : [];
  const orderBlocks = opts.enableOrderBlock !== false ? detectOrderBlocks(input.bars, opts.orderBlock) : [];

  // Calculate confluence score
  const score = calculateConfluence(fvgZones, orderBlocks, weights, input.bars.length);

  // Build confluence factors
  const factors = buildConfluenceFactors(fvgZones, orderBlocks, weights, input.bars.length);

  return {
    confluence: {
      score,
      factors,
    },
    fvgZones,
    orderBlocks,
  };
}

/**
 * Build detailed confluence factors array.
 */
function buildConfluenceFactors(
  fvgZones: FVGZone[],
  orderBlocks: OrderBlock[],
  weights: typeof DEFAULT_WEIGHTS,
  barsCount: number
) {
  const factors = [];

  // FVG factor
  const unfilledFVGs = fvgZones.filter(z => !z.filled);
  const fvgValue = unfilledFVGs.length > 0
    ? unfilledFVGs.reduce((sum, z) => sum + z.strength, 0) / unfilledFVGs.length
    : 0;

  factors.push({
    name: 'Fair Value Gaps',
    weight: weights.fvg,
    value: fvgValue,
    description: `${unfilledFVGs.length} unfilled FVG(s) detected`,
  });

  // Order Block factor
  const unmitigatedBlocks = orderBlocks.filter(b => !b.mitigated);
  const obValue = unmitigatedBlocks.length > 0
    ? unmitigatedBlocks.reduce((sum, b) => sum + b.strength, 0) / unmitigatedBlocks.length
    : 0;

  factors.push({
    name: 'Order Blocks',
    weight: weights.orderBlock,
    value: obValue,
    description: `${unmitigatedBlocks.length} unmitigated block(s) detected`,
  });

  // Overlap factor
  let overlapCount = 0;
  if (unfilledFVGs.length > 0 && unmitigatedBlocks.length > 0) {
    for (const fvg of unfilledFVGs) {
      for (const ob of unmitigatedBlocks) {
        if (fvg.low <= ob.high && fvg.high >= ob.low) {
          overlapCount++;
          break;
        }
      }
    }
  }
  const overlapValue = unfilledFVGs.length > 0 ? overlapCount / unfilledFVGs.length : 0;

  factors.push({
    name: 'Zone Overlap',
    weight: weights.overlap,
    value: overlapValue,
    description: `${overlapCount} overlapping zone(s)`,
  });

  // Recency factor
  const mostRecentFVG = fvgZones.length > 0 ? Math.max(...fvgZones.map(z => z.startIndex)) : -1;
  const mostRecentOB = orderBlocks.length > 0 ? Math.max(...orderBlocks.map(b => b.index)) : -1;
  const mostRecentIndex = Math.max(mostRecentFVG, mostRecentOB);
  const barsAgo = mostRecentIndex >= 0 ? barsCount - mostRecentIndex : barsCount;
  const recencyValue = barsCount > 0 ? Math.max(0, 1 - barsAgo / barsCount) : 0;

  factors.push({
    name: 'Recency',
    weight: weights.recency,
    value: recencyValue,
    description: `Most recent zone ${barsAgo} bar(s) ago`,
  });

  return factors;
}