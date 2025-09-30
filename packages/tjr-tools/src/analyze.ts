/**
 * @fileoverview Main analysis orchestrator for TJR-Tools.
 * @module @tjr/tjr-tools/analyze
 */

import type { TJRAnalysisInput, TJRConfluence, TJRResult } from '@tjr/contracts';
import type { AnalyzeOptions, FVGZone, OrderBlock } from './types.js';
import { validateInput } from './utils/validation.js';
import { detectFVGs } from './confluences/fvg.js';
import { detectOrderBlocks } from './confluences/order-block.js';
import { calculateConfluence } from './scoring/scorer.js';
import { DEFAULT_WEIGHTS } from './scoring/weights.js';
import {
  checkConfirmation,
  determineDirection,
  checkEntryTrigger,
  calculatePriceLevels,
  buildExecution,
  shouldGenerateExecution,
  extractActiveFactors,
  mergeExecutionConfig,
} from './execution/index.js';
import { calculateRisk, type RiskManagementResult } from './risk/index.js';

/**
 * Result from TJR-Tools analysis (extends TJRResult with details).
 */
export interface TJRToolsResult extends TJRResult {
  /** Detected FVG zones */
  fvgZones: FVGZone[];
  /** Detected Order Blocks */
  orderBlocks: OrderBlock[];
  /** Risk management analysis (optional) */
  riskManagement?: RiskManagementResult;
}

/**
 * Analyze market data for TJR confluences and potential execution.
 *
 * Detects Fair Value Gaps and Order Blocks, calculates weighted confluence scores,
 * and optionally generates trade execution parameters based on 5m confirmation
 * and 1m entry criteria.
 *
 * @param input - Market data and analysis context (5-minute timeframe)
 * @param options - Detection, scoring, and execution options
 * @returns Analysis result with confluence, zones, and optional execution
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

  const confluence: TJRConfluence = {
    score,
    factors,
  };

  // Calculate risk management if requested
  let riskManagement: RiskManagementResult | undefined;
  if (opts.risk) {
    try {
      riskManagement = calculateRisk(opts.risk, opts.risk.config);
    } catch (error) {
      // Risk calculation is optional, don't fail entire analysis
      console.warn('Risk calculation failed:', error);
    }
  }

  // Initialize result
  let result: TJRToolsResult = {
    input,
    confluence,
    warnings: [],
    fvgZones,
    orderBlocks,
    riskManagement,
  };

  // Check for execution if configured
  if (opts.execution) {
    const execConfig = mergeExecutionConfig(opts.execution);

    // Check 5-minute confirmation
    const confirmation = checkConfirmation(
      input.bars,
      confluence,
      fvgZones,
      orderBlocks,
      execConfig
    );

    if (confirmation.confirmed) {
      // Determine trade direction
      const direction = determineDirection(
        input.bars,
        confirmation.barIndex!,
        fvgZones,
        orderBlocks
      );

      if (direction && opts.bars1m) {
        // Check 1-minute entry trigger
        const entry = checkEntryTrigger(
          opts.bars1m,
          confluence,
          confirmation,
          fvgZones,
          orderBlocks,
          execConfig,
          direction
        );

        // Generate execution if all conditions met
        if (shouldGenerateExecution(confirmation, entry, execConfig)) {
          const levels = calculatePriceLevels(
            entry.entryPrice!,
            direction,
            input.bars,
            fvgZones,
            orderBlocks,
            execConfig
          );

          const activeFactors = extractActiveFactors(fvgZones, orderBlocks, score);

          const execution = buildExecution(
            input,
            levels,
            confirmation,
            entry,
            score,
            activeFactors,
            execConfig
          );

          result.execution = execution;
        } else if (!entry.triggered) {
          result.warnings.push(`No 1-minute entry: ${entry.reason}`);
        }
      } else if (!opts.bars1m) {
        result.warnings.push('1-minute bars required for entry trigger');
      } else {
        result.warnings.push('Unable to determine trade direction from confirmation');
      }
    } else {
      result.warnings.push(`No 5-minute confirmation: ${confirmation.reason}`);
    }
  }

  // Add metadata
  result.metadata = {
    analysisVersion: '0.2.0', // Updated for execution support
    computeTimeMs: 0, // Would be calculated if timing
  };

  return result;
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