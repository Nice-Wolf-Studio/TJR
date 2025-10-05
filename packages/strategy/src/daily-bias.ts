/**
 * Daily Bias Planner - Core Implementation (Shard 1.8)
 *
 * Implements the main Daily Bias Planner that ranks key levels into prioritized targets.
 * Follows a deterministic 6-phase algorithm to produce consistent, reproducible plans.
 *
 * Key Features:
 * - Deterministic ranking algorithm with stable sorting
 * - Confluence banding for clustered levels
 * - Source-weighted priority scoring (H4 > H1 > SESSION)
 * - Proximity and recency factors
 * - Immutable plan generation with runtime status updates
 * - O(N log N) complexity for typical inputs (N ≤ 40)
 *
 * Attribution:
 * - Original implementation from GladOSv2 (Nice Wolf Studio)
 * - Commit: dee236c1e762db08cf7d6f34885eb4779f73600c
 * - Date: 2025-09-22
 * - Migrated to TJR Suite monorepo: 2025-10-05
 *
 * @module @tjr/strategy/daily-bias
 */

import type {
  KeyLevel,
  LevelKind,
  Plan,
  PlanDirection,
  PlanTarget,
  PlanTargetStatus,
  SessionLevels,
  PriorityConfig,
  ScoringContext,
} from '@tjr/contracts';

import {
  calculatePriority,
  createLevelBands,
  sortTargetsDeterministic,
  validatePriorityConfig,
} from './priority.js';

/**
 * Configuration options for DailyBiasPlanner initialization
 */
export interface DailyBiasOptions {
  /** Trading symbol identifier (e.g., "ES", "NQ") */
  symbol: string;
  /** Trading date in YYYY-MM-DD format in exchange timezone */
  dateLocal: string;
  /** Symbol tick size for price calculations */
  tickSize: number;
  /** Priority configuration from planner.json */
  cfg: PriorityConfig;
  /** Reference price for target ranking (e.g., previous close) */
  referencePrice: number;
}

/**
 * Main Daily Bias Planner class
 *
 * Creates prioritized target plans from session levels and HTF swings using a
 * deterministic ranking algorithm. Plans are immutable after build() except
 * for status updates via markLevelStatus().
 */
export class DailyBiasPlanner {
  private readonly options: DailyBiasOptions;
  private readonly context: ScoringContext;
  private sessionLevels: KeyLevel[] = [];
  private htfSwings: KeyLevel[] = [];
  private plan: Plan | null = null;

  /**
   * Creates a new Daily Bias Planner instance
   *
   * @param opts - Configuration options
   * @throws {Error} If configuration is invalid
   *
   * @example
   * ```typescript
   * const planner = new DailyBiasPlanner({
   *   symbol: "ES",
   *   dateLocal: "2024-01-15",
   *   tickSize: 0.25,
   *   cfg: priorityConfig,
   *   referencePrice: 4745.50
   * });
   * ```
   */
  constructor(opts: DailyBiasOptions) {
    // Validate configuration
    validatePriorityConfig(opts.cfg);

    if (!opts.symbol || opts.symbol.trim().length === 0) {
      throw new Error('Symbol is required and cannot be empty');
    }

    if (!opts.dateLocal || !/^\d{4}-\d{2}-\d{2}$/.test(opts.dateLocal)) {
      throw new Error('dateLocal must be in YYYY-MM-DD format');
    }

    if (typeof opts.tickSize !== 'number' || opts.tickSize <= 0) {
      throw new Error('tickSize must be a positive number');
    }

    if (typeof opts.referencePrice !== 'number' || !isFinite(opts.referencePrice)) {
      throw new Error('referencePrice must be a finite number');
    }

    this.options = { ...opts };

    // Create scoring context
    this.context = {
      symbol: opts.symbol,
      currentRef: opts.referencePrice,
      tickSize: opts.tickSize,
      config: opts.cfg,
    };
  }

  /**
   * Sets session levels from Shard 1.1 output
   *
   * Converts SessionLevels to KeyLevel format for processing.
   * Each session contributes both high and low levels.
   *
   * @param levels - Array of session levels from session boundary tracking
   *
   * @example
   * ```typescript
   * const sessionLevels: SessionLevels[] = [
   *   {
   *     symbol: "ES",
   *     date: "2024-01-15",
   *     session: "ASIA",
   *     high: 4750.25,
   *     low: 4745.50,
   *     highTime: new Date("2024-01-15T08:30:00Z"),
   *     lowTime: new Date("2024-01-15T06:15:00Z")
   *   }
   * ];
   *
   * planner.setSessionLevels(sessionLevels);
   * ```
   */
  setSessionLevels(levels: SessionLevels[]): void {
    this.sessionLevels = convertSessionLevels(levels);
    this.plan = null; // Invalidate existing plan
  }

  /**
   * Sets HTF swing levels from Shard 1.2 output
   *
   * Accepts confirmed H1 and H4 swing highs/lows.
   * These levels have higher priority weights than session levels.
   *
   * @param swings - Array of confirmed HTF swing levels
   *
   * @example
   * ```typescript
   * const htfSwings: KeyLevel[] = [
   *   {
   *     id: "ES:H4_HIGH:1705123200000",
   *     symbol: "ES",
   *     kind: "H4_HIGH",
   *     source: "H4",
   *     price: 4755.75,
   *     time: new Date("2024-01-13T10:00:00Z")
   *   }
   * ];
   *
   * planner.setHtfSwings(htfSwings);
   * ```
   */
  setHtfSwings(swings: KeyLevel[]): void {
    validateInputs([], swings);
    this.htfSwings = [...swings];
    this.plan = null; // Invalidate existing plan
  }

  /**
   * Builds the daily bias plan using the 6-phase algorithm
   *
   * Algorithm phases:
   * 1. Collect candidates from session levels and HTF swings
   * 2. Split by direction relative to reference price
   * 3. Apply confluence banding within each direction
   * 4. Calculate priority scores for all levels
   * 5. Sort deterministically (priority desc, distance asc)
   * 6. Apply per-side target limits
   *
   * @returns Immutable Plan object with ranked targets
   * @throws {Error} If no input levels provided or other validation fails
   *
   * @example
   * ```typescript
   * planner.setSessionLevels(sessionLevels);
   * planner.setHtfSwings(htfSwings);
   *
   * const plan = planner.build();
   * console.log(`Generated plan with ${plan.upTargets.length} up targets`);
   * ```
   */
  build(): Plan {
    // Phase 1: Collect all candidates
    const candidates = collectCandidates(this.sessionLevels, this.htfSwings, this.options.cfg);

    if (candidates.length === 0) {
      throw new Error('No candidates available for plan generation');
    }

    // Phase 2: Split by direction relative to reference price
    const { upLevels, downLevels } = splitByDirection(candidates, this.context.currentRef);

    // Phase 3 & 4: Apply confluence banding and calculate priorities for each direction
    const upTargets = createPlanTargets(upLevels, 'UP', this.context);
    const downTargets = createPlanTargets(downLevels, 'DOWN', this.context);

    // Phase 5: Sort targets deterministically
    const sortedUpTargets = sortTargetsDeterministic(upTargets);
    const sortedDownTargets = sortTargetsDeterministic(downTargets);

    // Phase 6: Apply per-side limits
    const maxTargetsPerSide = this.options.cfg.limits?.maxTargetsPerSide || 8;
    const limitedUpTargets = sortedUpTargets.slice(0, maxTargetsPerSide);
    const limitedDownTargets = sortedDownTargets.slice(0, maxTargetsPerSide);

    // Create immutable plan
    this.plan = {
      id: `${this.options.symbol}:${this.options.dateLocal}`,
      symbol: this.options.symbol,
      dateLocal: this.options.dateLocal,
      currentRef: this.context.currentRef,
      createdAt: new Date(),
      upTargets: limitedUpTargets,
      downTargets: limitedDownTargets,
      rules: [
        'Daily Bias Planner v1.8 - Deterministic target ranking',
        'Priority: H4 > H1 > SESSION with recency and proximity factors',
        'Confluence banding merges levels within 4 ticks',
        `Maximum ${maxTargetsPerSide} targets per side`,
        'Targets sorted by priority desc, distance asc, source priority desc',
      ],
      meta: {
        tz: this.options.cfg.timezoneBySymbol?.[this.options.symbol] || 'UTC',
        tickSize: this.options.tickSize,
        sourceBars: `Session: ${this.sessionLevels.length}, HTF: ${this.htfSwings.length}`,
      },
    };

    return this.plan;
  }

  /**
   * Updates the status of a specific level in the plan
   *
   * Performs idempotent status updates on plan targets. Only allows status
   * changes on existing plans - does not trigger plan regeneration.
   *
   * @param levelId - Stable level identifier
   * @param status - New status to assign
   *
   * @example
   * ```typescript
   * // Mark a level as hit when price reaches it
   * planner.markLevelStatus("ES:H4_HIGH:1705123200000", "HIT");
   *
   * // Later mark as consumed when position taken
   * planner.markLevelStatus("ES:H4_HIGH:1705123200000", "CONSUMED");
   * ```
   */
  markLevelStatus(levelId: string, status: PlanTargetStatus): void {
    if (!this.plan) {
      console.warn(`Cannot mark level status: no plan exists. Call build() first.`);
      return;
    }

    let found = false;

    // Update in upTargets
    for (const target of this.plan.upTargets) {
      if (target.level.id === levelId) {
        target.status = status;
        found = true;
      }
    }

    // Update in downTargets
    for (const target of this.plan.downTargets) {
      if (target.level.id === levelId) {
        target.status = status;
        found = true;
      }
    }

    if (!found) {
      console.warn(`Level ID "${levelId}" not found in current plan`);
    }
  }
}

/**
 * Converts SessionLevels array to KeyLevel format
 *
 * Each session contributes both high and low levels with appropriate kinds.
 * Generates stable IDs based on symbol, session, kind, and timestamp.
 *
 * @param sessionLevels - Array of session levels from Shard 1.1
 * @returns Array of KeyLevel objects
 */
function convertSessionLevels(sessionLevels: SessionLevels[]): KeyLevel[] {
  const keyLevels: KeyLevel[] = [];

  for (const session of sessionLevels) {
    // Create high level
    const highId = `${session.symbol}:SESSION_HIGH:${session.session}:${session.highTime.getTime()}`;
    keyLevels.push({
      id: highId,
      symbol: session.symbol,
      kind: 'SESSION_HIGH' as LevelKind,
      source: 'SESSION',
      price: session.high,
      time: session.highTime,
      meta: {
        session: session.session,
        date: session.date,
      },
    });

    // Create low level
    const lowId = `${session.symbol}:SESSION_LOW:${session.session}:${session.lowTime.getTime()}`;
    keyLevels.push({
      id: lowId,
      symbol: session.symbol,
      kind: 'SESSION_LOW' as LevelKind,
      source: 'SESSION',
      price: session.low,
      time: session.lowTime,
      meta: {
        session: session.session,
        date: session.date,
      },
    });
  }

  return keyLevels;
}

/**
 * Collects and validates all candidate levels for planning
 *
 * Combines session levels and HTF swings with basic validation.
 * Applies per-source limits if configured.
 *
 * @param sessionLevels - Converted session levels
 * @param htfSwings - HTF swing levels from Shard 1.2
 * @param config - Priority configuration
 * @returns Combined array of candidate levels
 */
function collectCandidates(
  sessionLevels: KeyLevel[],
  htfSwings: KeyLevel[],
  config: PriorityConfig
): KeyLevel[] {
  validateInputs(sessionLevels, htfSwings);

  const candidates: KeyLevel[] = [];

  // Add session levels with optional limiting
  const maxLevelsPerSource = config.limits?.maxLevelsPerSource || Number.MAX_SAFE_INTEGER;
  const limitedSessionLevels = sessionLevels.slice(0, maxLevelsPerSource);
  candidates.push(...limitedSessionLevels);

  // Add HTF swings with optional limiting
  const limitedHtfSwings = htfSwings.slice(0, maxLevelsPerSource);
  candidates.push(...limitedHtfSwings);

  return candidates;
}

/**
 * Splits levels by direction relative to reference price
 *
 * Levels above reference go to upLevels, levels below go to downLevels.
 * Levels exactly at reference are excluded to avoid division by zero issues.
 *
 * @param levels - Array of key levels to split
 * @param currentRef - Reference price for direction determination
 * @returns Object with upLevels and downLevels arrays
 */
function splitByDirection(
  levels: KeyLevel[],
  currentRef: number
): { upLevels: KeyLevel[]; downLevels: KeyLevel[] } {
  const upLevels: KeyLevel[] = [];
  const downLevels: KeyLevel[] = [];

  for (const level of levels) {
    if (level.price > currentRef) {
      upLevels.push(level);
    } else if (level.price < currentRef) {
      downLevels.push(level);
    }
    // Levels exactly at reference are excluded
  }

  return { upLevels, downLevels };
}

/**
 * Creates plan targets from levels with confluence banding and priority scoring
 *
 * Applies the full confluence banding algorithm and generates PlanTarget objects
 * with calculated priorities and distances.
 *
 * @param levels - Array of levels in the same direction
 * @param direction - Direction relative to reference (UP or DOWN)
 * @param context - Scoring context for calculations
 * @returns Array of PlanTarget objects
 */
function createPlanTargets(
  levels: KeyLevel[],
  direction: PlanDirection,
  context: ScoringContext
): PlanTarget[] {
  if (levels.length === 0) {
    return [];
  }

  // Apply confluence banding
  const levelBandPairs = createLevelBands(levels, context);

  // Convert to PlanTarget objects
  const targets: PlanTarget[] = levelBandPairs.map(({ level, band }) => {
    const distance = Math.abs(level.price - context.currentRef);
    const priority = calculatePriority(level, context);

    return {
      level,
      direction,
      distance,
      priority,
      band,
      status: 'PENDING' as PlanTargetStatus,
    };
  });

  return targets;
}

/**
 * Validates input levels for basic requirements
 *
 * Checks that HTF swings have valid source types and required fields.
 * Logs warnings for suspicious data but doesn't throw errors.
 *
 * @param _sessionLevels - Session levels array (currently not validated)
 * @param htfSwings - HTF swing levels array
 */
function validateInputs(_sessionLevels: KeyLevel[], htfSwings: KeyLevel[]): void {
  // Validate HTF swings have correct source types
  for (const swing of htfSwings) {
    if (swing.source !== 'H1' && swing.source !== 'H4') {
      console.warn(`Invalid HTF swing source: ${swing.source}. Expected H1 or H4.`);
    }

    if (!swing.id || swing.id.trim().length === 0) {
      console.warn(`HTF swing missing valid ID: ${JSON.stringify(swing)}`);
    }

    if (typeof swing.price !== 'number' || !isFinite(swing.price)) {
      console.warn(`HTF swing has invalid price: ${swing.price}`);
    }
  }

  // Future: Could add more validation for session levels
}

// Export for testing and external use
export { convertSessionLevels, collectCandidates, splitByDirection, createPlanTargets, validateInputs };
