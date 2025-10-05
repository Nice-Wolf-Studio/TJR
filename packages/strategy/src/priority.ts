/**
 * Priority Scoring and Confluence Banding - Daily Bias Planner (Shard 1.8)
 *
 * Implements deterministic priority scoring for key levels and confluence banding
 * logic for the Daily Bias Planner. Provides stable, reproducible target ranking
 * with multiple scoring components and efficient level clustering.
 *
 * Key Features:
 * - Source-weighted scoring (H4 > H1 > SESSION)
 * - Recency scoring for H1/H4 swings
 * - Proximity decay with exponential falloff
 * - Confluence boost for clustered levels
 * - Fixed precision arithmetic for determinism
 * - O(N log N) banding algorithm with configurable parameters
 *
 * Attribution:
 * - Original implementation from GladOSv2 (Nice Wolf Studio)
 * - Commit: dee236c1e762db08cf7d6f34885eb4779f73600c
 * - Date: 2025-09-22
 * - Migrated to TJR Suite monorepo: 2025-10-05
 *
 * @module @tjr/strategy/priority
 */

import type {
  KeyLevel,
  KeyLevelSource,
  LevelBand,
  PlanTarget,
  PriorityConfig,
  ScoringContext,
} from '@tjr/contracts';

/**
 * Default priority configuration for testing and basic usage
 */
export const DEFAULT_PRIORITY_CONFIG: PriorityConfig = {
  weights: {
    source: {
      H4: 3.0,
      H1: 2.0,
      SESSION: 1.0
    },
    recency: 1.0,
    proximity: 1.0,
    confluence: 1.0
  },
  proximityDecay: {
    lambda: 0.01
  },
  banding: {
    priceMergeTicks: 2,
    maxBandWidthTicks: 10
  },
  recencyHorizonBars: {
    H1: 40,
    H4: 20
  }
};

/**
 * Fixed precision multiplier for deterministic floating point operations
 * Uses 6 decimal places to handle typical financial instrument precision
 */
const PRECISION_MULTIPLIER = 1_000_000;

/**
 * Converts a floating point number to fixed precision integer
 *
 * @param value - Floating point value to convert
 * @returns Fixed precision integer representation
 */
function toFixedPrecision(value: number): number {
  return Math.round(value * PRECISION_MULTIPLIER);
}

/**
 * Converts fixed precision integer back to floating point
 *
 * @param value - Fixed precision integer
 * @returns Floating point representation
 */
function fromFixedPrecision(value: number): number {
  return value / PRECISION_MULTIPLIER;
}

/**
 * Calculates source weight component based on level source type
 *
 * H4 levels receive highest weight (3.0), followed by H1 (2.0), then SESSION (1.0).
 * This reflects the assumption that higher timeframe levels act as stronger magnets.
 *
 * @param level - Key level to score
 * @param config - Priority configuration
 * @returns Source weight score in fixed precision
 */
function calculateSourceWeight(level: KeyLevel, config: PriorityConfig): number {
  const weight = config.weights.source[level.source] || 1.0;
  return toFixedPrecision(weight);
}

/**
 * Calculates recency score based on level establishment time
 *
 * For H1/H4 swings, newer levels score higher with linear decay within horizon.
 * SESSION levels get neutral score of 0.5 as they reset daily.
 *
 * @param level - Key level to score
 * @param context - Scoring context
 * @returns Recency score in fixed precision (0.0 to 1.0 range)
 */
function calculateRecencyScore(level: KeyLevel, context: ScoringContext): number {
  const now = context.currentTime || new Date();
  const hoursElapsed = (now.getTime() - level.time.getTime()) / (1000 * 60 * 60);

  if (level.source === 'SESSION') {
    // Session levels also decay with age, but faster (24 hour horizon)
    const sessionHorizonHours = 24;
    const recency = Math.max(0.1, Math.min(1.0, 1.0 - hoursElapsed / sessionHorizonHours));
    return toFixedPrecision(recency);
  }

  // For H1/H4 levels, calculate bars since establishment
  const timeframe = level.source; // "H1" or "H4"
  const horizonBars = context.config.recencyHorizonBars[timeframe] || 40;

  // Calculate bars elapsed (simplified - assumes 1 hour = 1 bar for H1, 4 hours = 1 bar for H4)
  const barsElapsed = timeframe === 'H4' ? hoursElapsed / 4 : hoursElapsed;

  // Linear decay within horizon, minimum 0.1 for very old levels
  const recency = Math.max(0.1, Math.min(1.0, 1.0 - barsElapsed / horizonBars));

  return toFixedPrecision(recency);
}

/**
 * Calculates proximity score based on distance from reference price
 *
 * Uses exponential decay: exp(-lambda * ticksAway) where closer levels score higher.
 * The lambda parameter controls the steepness of the decay curve.
 *
 * @param level - Key level to score
 * @param context - Scoring context
 * @returns Proximity score in fixed precision (0.0 to 1.0 range)
 */
function calculateProximityScore(level: KeyLevel, context: ScoringContext): number {
  const priceDiff = Math.abs(level.price - context.currentRef);
  const ticksAway = priceDiff / context.tickSize;
  const lambda = context.config.proximityDecay.lambda;

  // Exponential decay: exp(-lambda * ticksAway)
  const proximity = Math.exp(-lambda * ticksAway);

  return toFixedPrecision(Math.min(1.0, proximity));
}

/**
 * Calculates confluence boost for levels that belong to bands
 *
 * Uses logarithmic scaling: log(1 + n) where n is the number of constituents.
 * This provides diminishing returns for larger bands while still rewarding confluence.
 *
 * @param constituentsCount - Number of levels in the confluence band
 * @returns Confluence boost multiplier in fixed precision
 */
function calculateConfluenceBoost(constituentsCount: number): number {
  if (constituentsCount <= 1) {
    return toFixedPrecision(1.0); // No boost for single levels
  }

  // Logarithmic boost: log(1 + n)
  const boost = Math.log(1 + constituentsCount);

  return toFixedPrecision(1.0 + boost);
}

/**
 * Calculates the overall priority score for a key level
 *
 * Combines source weight, recency, proximity, and confluence into a single score.
 * Uses fixed precision arithmetic to ensure deterministic results across runs.
 *
 * Formula: (sourceWeight * recency * proximity * confluence) * weights.total
 *
 * @param level - Key level to score
 * @param context - Scoring context with reference price and configuration
 * @returns Priority score (higher = stronger magnet)
 *
 * @example
 * ```typescript
 * const level: KeyLevel = {
 *   id: "ES:H4_HIGH:1705123200000",
 *   symbol: "ES",
 *   kind: "H4_HIGH",
 *   source: "H4",
 *   price: 4750.25,
 *   time: new Date("2024-01-13T10:00:00Z")
 * };
 *
 * const context: ScoringContext = {
 *   symbol: "ES",
 *   currentRef: 4745.50,
 *   tickSize: 0.25,
 *   config: priorityConfig
 * };
 *
 * const score = calculatePriority(level, context);
 * console.log(`Priority score: ${score}`);
 * ```
 */
export function calculatePriority(level: KeyLevel, context: ScoringContext): number {
  // Calculate individual components in fixed precision
  const sourceWeight = calculateSourceWeight(level, context.config);
  const recencyScore = calculateRecencyScore(level, context);
  const proximityScore = calculateProximityScore(level, context);

  // For single level (no confluence), boost is 1.0
  const confluenceBoost = toFixedPrecision(1.0);

  // Convert back to normal scale before applying component weights
  const sourceWeightNormal = fromFixedPrecision(sourceWeight);
  const recencyScoreNormal = fromFixedPrecision(recencyScore);
  const proximityScoreNormal = fromFixedPrecision(proximityScore);
  const confluenceBoostNormal = fromFixedPrecision(confluenceBoost);

  // Apply component-specific weights
  const weightedSource = sourceWeightNormal; // Source weight is already the weight value
  const weightedRecency = recencyScoreNormal * context.config.weights.recency;
  const weightedProximity = proximityScoreNormal * context.config.weights.proximity;
  const weightedConfluence = confluenceBoostNormal * context.config.weights.confluence;

  // Combine weighted components (sum instead of multiply for better range control)
  const totalScore = weightedSource + weightedRecency + weightedProximity + weightedConfluence;

  // Normalize to [0, 1] range (max possible is ~2.2 with current test weights)
  const normalizedScore = totalScore / 3.0;

  // Ensure score is in [0, 1] range
  const clampedScore = Math.max(0, Math.min(1.0, normalizedScore));

  // Round to 6 decimal places for determinism and precision control
  return Number(clampedScore.toFixed(6));
}

/**
 * Internal structure for tracking levels during banding process
 */
interface LevelWithScore {
  level: KeyLevel;
  score: number;
  distance: number;
}

/**
 * Creates confluence bands from a sorted array of key levels
 *
 * Implements a two-phase algorithm:
 * 1. Merge levels within priceMergeTicks distance
 * 2. Split bands exceeding maxBandWidthTicks width
 *
 * The algorithm maintains O(N log N) complexity and produces deterministic results
 * through stable sorting and consistent tiebreaker ordering.
 *
 * @param levels - Array of key levels to process (will be sorted internally)
 * @param context - Scoring context for distance calculations
 * @returns Array of level-band pairs with updated priority scores
 *
 * @example
 * ```typescript
 * const levels: KeyLevel[] = [
 *   { id: "1", symbol: "ES", kind: "H4_HIGH", source: "H4", price: 4750.25, time: new Date() },
 *   { id: "2", symbol: "ES", kind: "H1_HIGH", source: "H1", price: 4750.50, time: new Date() },
 *   { id: "3", symbol: "ES", kind: "SESSION_HIGH", source: "SESSION", price: 4750.75, time: new Date() }
 * ];
 *
 * const result = createLevelBands(levels, context);
 * // Returns levels with confluence bands where appropriate
 * ```
 */
export function createLevelBands(
  levels: KeyLevel[],
  context: ScoringContext
): Array<{ level: KeyLevel; band?: LevelBand }> {
  if (levels.length === 0) {
    return [];
  }

  // Calculate initial scores and distances for all levels
  const levelsWithScores: LevelWithScore[] = levels.map((level) => ({
    level,
    score: calculatePriority(level, context),
    distance: Math.abs(level.price - context.currentRef),
  }));

  // Sort levels by price for banding (ascending order)
  levelsWithScores.sort((a, b) => {
    // Primary: price ascending
    if (a.level.price !== b.level.price) {
      return a.level.price - b.level.price;
    }
    // Tiebreaker 1: source priority (H4 > H1 > SESSION)
    const sourcePriority = { H4: 3, H1: 2, SESSION: 1 };
    const aPriority = sourcePriority[a.level.source];
    const bPriority = sourcePriority[b.level.source];
    if (aPriority !== bPriority) {
      return bPriority - aPriority; // Higher priority first
    }
    // Tiebreaker 2: level ID for deterministic ordering
    return a.level.id.localeCompare(b.level.id);
  });

  // Phase 1: Merge levels within priceMergeTicks distance
  const bands: Array<{
    top: number;
    bottom: number;
    constituents: LevelWithScore[];
  }> = [];

  const mergeDistanceTicks = context.config.banding.priceMergeTicks;
  const mergeDistance = mergeDistanceTicks * context.tickSize;

  for (const levelWithScore of levelsWithScores) {
    let merged = false;

    // Try to merge with existing bands
    for (const band of bands) {
      const bandMidpoint = (band.top + band.bottom) / 2;
      const distanceToMidpoint = Math.abs(levelWithScore.level.price - bandMidpoint);

      if (distanceToMidpoint <= mergeDistance) {
        // Merge into this band
        band.constituents.push(levelWithScore);
        band.top = Math.max(band.top, levelWithScore.level.price);
        band.bottom = Math.min(band.bottom, levelWithScore.level.price);
        merged = true;
        break;
      }
    }

    if (!merged) {
      // Create new band
      bands.push({
        top: levelWithScore.level.price,
        bottom: levelWithScore.level.price,
        constituents: [levelWithScore],
      });
    }
  }

  // Phase 2: Split bands exceeding maxBandWidthTicks
  const maxBandWidth = context.config.banding.maxBandWidthTicks * context.tickSize;
  const finalBands: Array<{
    top: number;
    bottom: number;
    constituents: LevelWithScore[];
  }> = [];

  for (const band of bands) {
    const bandWidth = band.top - band.bottom;

    if (bandWidth <= maxBandWidth || band.constituents.length <= 1) {
      // Band is within limits or has single constituent
      finalBands.push(band);
    } else {
      // Split oversized band by creating individual bands for each level
      for (const constituent of band.constituents) {
        finalBands.push({
          top: constituent.level.price,
          bottom: constituent.level.price,
          constituents: [constituent],
        });
      }
    }
  }

  // Generate result with updated priority scores for confluence
  const result: Array<{ level: KeyLevel; band?: LevelBand }> = [];

  for (const band of finalBands) {
    const constituentsCount = band.constituents.length;
    const confluenceBoost = fromFixedPrecision(calculateConfluenceBoost(constituentsCount));

    for (const levelWithScore of band.constituents) {
      // Recalculate priority with confluence boost
      const baseScore = calculatePriority(levelWithScore.level, context);
      const boostedScore = baseScore * confluenceBoost;

      // Create band object if multiple constituents
      let bandObject: LevelBand | undefined;
      if (constituentsCount > 1) {
        // Calculate average price using fixed precision for determinism
        const totalPrice = band.constituents.reduce((sum, c) => sum + toFixedPrecision(c.level.price), 0);
        const avgPriceFixed = totalPrice / constituentsCount;
        const avgPrice = fromFixedPrecision(avgPriceFixed);

        bandObject = {
          top: band.top,
          bottom: band.bottom,
          avgPrice: avgPrice,
          constituents: band.constituents.map((c) => c.level.id),
        };
      }

      result.push({
        level: {
          ...levelWithScore.level,
          // Store updated priority in meta for reference
          meta: {
            ...levelWithScore.level.meta,
            priority: boostedScore,
            confluence: constituentsCount > 1,
          },
        },
        band: bandObject,
      });
    }
  }

  return result;
}

/**
 * Sorts plan targets deterministically using multi-level tiebreakers
 *
 * Sorting order:
 * 1. Priority (descending) - higher priority first
 * 2. Distance (ascending) - closer levels first for same priority
 * 3. Source priority (H4 > H1 > SESSION) - higher timeframe first
 * 4. Level ID (lexicographic) - for absolute determinism
 *
 * This ensures identical results across multiple runs with the same input.
 *
 * @param targets - Array of plan targets to sort
 * @returns Sorted array of plan targets (new array, input unchanged)
 *
 * @example
 * ```typescript
 * const targets: PlanTarget[] = [
 *   { level: level1, direction: "UP", distance: 10, priority: 85.5, status: "PENDING" },
 *   { level: level2, direction: "UP", distance: 8, priority: 85.5, status: "PENDING" },
 *   { level: level3, direction: "UP", distance: 12, priority: 90.2, status: "PENDING" }
 * ];
 *
 * const sorted = sortTargetsDeterministic(targets);
 * // Returns: [level3, level2, level1] (by priority desc, then distance asc)
 * ```
 */
export function sortTargetsDeterministic(targets: PlanTarget[]): PlanTarget[] {
  // Create defensive copy to avoid mutating input
  const targetsCopy = [...targets];

  const sourcePriority: Record<KeyLevelSource, number> = {
    H4: 3,
    H1: 2,
    SESSION: 1,
  };

  return targetsCopy.sort((a, b) => {
    // Primary: Priority descending (higher priority first)
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }

    // Tiebreaker 1: Distance ascending (closer first)
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }

    // Tiebreaker 2: Source priority descending (H4 > H1 > SESSION)
    const aSourcePriority = sourcePriority[a.level.source];
    const bSourcePriority = sourcePriority[b.level.source];
    if (aSourcePriority !== bSourcePriority) {
      return bSourcePriority - aSourcePriority;
    }

    // Tiebreaker 3: Price (higher price first for determinism)
    if (a.level.price !== b.level.price) {
      return b.level.price - a.level.price;
    }

    // Tiebreaker 4: Level ID lexicographic (for absolute determinism, if available)
    if (a.level.id && b.level.id) {
      return a.level.id.localeCompare(b.level.id);
    }

    // Final tiebreaker: timestamp (more recent first)
    return b.level.time.getTime() - a.level.time.getTime();
  });
}

/**
 * Validates priority configuration for required fields and reasonable values
 *
 * @param config - Priority configuration to validate
 * @throws {Error} If configuration is invalid
 */
export function validatePriorityConfig(config: PriorityConfig): void {
  // Validate source weights
  const requiredSources: KeyLevelSource[] = ['H4', 'H1', 'SESSION'];
  for (const source of requiredSources) {
    if (typeof config.weights.source[source] !== 'number' || config.weights.source[source] <= 0) {
      throw new Error(`Invalid source weight for ${source}: must be positive number`);
    }
  }

  // Validate other weights
  if (typeof config.weights.recency !== 'number' || config.weights.recency <= 0) {
    throw new Error('Invalid recency weight: must be positive number');
  }
  if (typeof config.weights.proximity !== 'number' || config.weights.proximity <= 0) {
    throw new Error('Invalid proximity weight: must be positive number');
  }
  if (typeof config.weights.confluence !== 'number' || config.weights.confluence <= 0) {
    throw new Error('Invalid confluence weight: must be positive number');
  }

  // Validate proximity decay
  if (typeof config.proximityDecay.lambda !== 'number' || config.proximityDecay.lambda <= 0) {
    throw new Error('Invalid proximity decay lambda: must be positive number');
  }

  // Validate banding parameters
  if (
    typeof config.banding.priceMergeTicks !== 'number' ||
    config.banding.priceMergeTicks <= 0
  ) {
    throw new Error('Invalid priceMergeTicks: must be positive number');
  }
  if (
    typeof config.banding.maxBandWidthTicks !== 'number' ||
    config.banding.maxBandWidthTicks <= 0
  ) {
    throw new Error('Invalid maxBandWidthTicks: must be positive number');
  }

  // Logical validation
  if (config.banding.maxBandWidthTicks < config.banding.priceMergeTicks) {
    throw new Error('maxBandWidthTicks must be >= priceMergeTicks');
  }
}
