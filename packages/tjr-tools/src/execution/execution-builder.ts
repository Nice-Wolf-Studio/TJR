/**
 * @fileoverview Builds TJRExecution DTO from analysis results.
 *
 * Assembles all execution components into the final TJRExecution object.
 *
 * @module @tjr/tjr-tools/execution/execution-builder
 */

import type { TJRExecution, TJRAnalysisInput } from '@tjr/contracts';
import type { ExecutionConfig, ConfirmationResult, EntryTrigger, FVGZone, OrderBlock } from '../types.js';
import type { PriceLevels } from './price-levels.js';
import {
  calculatePositionSize,
  calculateConfidence,
  adjustPositionByConfidence,
  calculateExpectedDuration,
  generateExecutionNotes,
} from './position-sizing.js';

/**
 * Build TJRExecution DTO from analysis components.
 *
 * @param _input - Original analysis input (unused but kept for future use)
 * @param levels - Calculated price levels
 * @param confirmation - 5m confirmation result
 * @param entry - 1m entry trigger
 * @param confluenceScore - Overall confluence score
 * @param activeFactors - List of active confluence factors
 * @param config - Execution configuration
 * @returns Complete TJRExecution DTO
 */
export function buildExecution(
  _input: TJRAnalysisInput,
  levels: PriceLevels,
  confirmation: ConfirmationResult,
  entry: EntryTrigger,
  confluenceScore: number,
  activeFactors: string[],
  config: ExecutionConfig
): TJRExecution {
  // Calculate confidence level
  const confidence = calculateConfidence(confluenceScore);

  // Calculate base position size
  const basePositionSize = calculatePositionSize(levels, config);

  // Adjust position based on confidence
  const positionSize = adjustPositionByConfidence(basePositionSize, confidence);

  // Calculate expected duration
  const expectedDuration = calculateExpectedDuration(
    confirmation.confirmed,
    entry.triggered
  );

  // Generate execution notes
  const notes = generateExecutionNotes(levels, confidence, activeFactors);

  // Build the execution DTO
  const execution: TJRExecution = {
    entryPrice: levels.entry,
    stopLoss: levels.stopLoss,
    takeProfit: levels.takeProfit,
    positionSize,
    direction: entry.direction!,
    riskRewardRatio: levels.riskRewardRatio,
    confidence,
    expectedDuration,
    notes,
  };

  return execution;
}

/**
 * Check if execution should be generated based on config and results.
 *
 * @param confirmation - 5m confirmation result
 * @param entry - 1m entry trigger
 * @param config - Execution configuration
 * @returns True if execution should be generated
 */
export function shouldGenerateExecution(
  confirmation: ConfirmationResult,
  entry: EntryTrigger,
  config: ExecutionConfig
): boolean {
  // Don't generate in dry run mode
  if (config.dryRun) {
    return false;
  }

  // Both confirmation and entry must be triggered
  if (!confirmation.confirmed || !entry.triggered) {
    return false;
  }

  // Entry must have valid price and direction
  if (!entry.entryPrice || !entry.direction) {
    return false;
  }

  return true;
}

/**
 * Extract active confluence factors for execution notes.
 *
 * @param fvgZones - FVG zones
 * @param orderBlocks - Order blocks
 * @param confluenceScore - Overall confluence score
 * @returns List of active factor names
 */
export function extractActiveFactors(
  fvgZones: FVGZone[],
  orderBlocks: OrderBlock[],
  confluenceScore: number
): string[] {
  const factors: string[] = [];

  // Check for active FVGs
  const activeFVGs = fvgZones.filter(z => !z.filled);
  if (activeFVGs.length > 0) {
    const avgStrength = activeFVGs.reduce((sum, z) => sum + z.strength, 0) / activeFVGs.length;
    if (avgStrength > 0.3) {
      factors.push('FVG');
    }
  }

  // Check for active order blocks
  const activeBlocks = orderBlocks.filter(b => !b.mitigated);
  if (activeBlocks.length > 0) {
    const avgStrength = activeBlocks.reduce((sum, b) => sum + b.strength, 0) / activeBlocks.length;
    if (avgStrength > 0.3) {
      factors.push('Order Block');
    }
  }

  // Check for zone overlap
  if (activeFVGs.length > 0 && activeBlocks.length > 0) {
    for (const fvg of activeFVGs) {
      for (const block of activeBlocks) {
        if (fvg.low <= block.high && fvg.high >= block.low) {
          factors.push('Zone Overlap');
          break;
        }
      }
      if (factors.includes('Zone Overlap')) break;
    }
  }

  // Add confluence score level
  if (confluenceScore >= 80) {
    factors.push('High Confluence');
  } else if (confluenceScore >= 65) {
    factors.push('Medium Confluence');
  }

  return factors;
}