/**
 * @fileoverview Daily Bias Planning Types
 *
 * Defines types for key level identification, target ranking, and plan generation
 * used by the Daily Bias Planner (Shard 1.8).
 *
 * Attribution:
 * - Original implementation from GladOSv2 (Nice Wolf Studio)
 * - Commit: dee236c1e762db08cf7d6f34885eb4779f73600c
 * - Date: 2025-09-22
 * - Migrated to TJR Suite monorepo: 2025-10-05
 *
 * @module @tjr/contracts/bias
 */

/**
 * Source types for key levels used in daily bias planning
 *
 * Represents the timeframe or analysis that identified the level:
 * - SESSION: Session highs/lows from Asian, London, or NY sessions
 * - H1: Swing points from 1-hour timeframe analysis
 * - H4: Swing points from 4-hour timeframe analysis
 */
export type KeyLevelSource = 'SESSION' | 'H1' | 'H4';

/**
 * Specific kinds of key levels based on source and high/low type
 *
 * Combines the source timeframe with the level direction for precise
 * level categorization and weighting in priority calculations.
 */
export type LevelKind =
  | 'SESSION_HIGH'
  | 'SESSION_LOW'
  | 'H1_HIGH'
  | 'H1_LOW'
  | 'H4_HIGH'
  | 'H4_LOW';

/**
 * Represents a key level that can act as a magnet for price action
 *
 * Key levels are identified from session boundaries (Shard 1.1) and
 * HTF swing extremes (Shard 1.2). They serve as potential targets
 * for price action and are ranked by the Daily Bias Planner.
 */
export interface KeyLevel {
  /**
   * Stable identifier across the day
   *
   * Format: `${symbol}:${kind}:${epochMs}` or `${symbol}:${kind}:${session}:${epochMs}` for session levels
   * Ensures deterministic level tracking and status updates.
   */
  id: string;

  /**
   * Trading symbol identifier (e.g., "ES", "NQ")
   */
  symbol: string;

  /**
   * Specific type of level
   *
   * Determines source weighting in priority calculations.
   */
  kind: LevelKind;

  /**
   * Source category for weighting purposes
   *
   * H4 levels receive highest weight (3.0), followed by H1 (2.0), then SESSION (1.0).
   */
  source: KeyLevelSource;

  /**
   * Price level in symbol's native units
   */
  price: number;

  /**
   * Timestamp when level was established
   *
   * For session levels: session boundary close time
   * For swing levels: swing point confirmation time
   */
  time: Date;

  /**
   * Optional metadata for additional information
   *
   * May include session name, date, priority score, confluence status, etc.
   */
  meta?: Record<string, unknown>;
}

/**
 * Direction relative to reference price at planning time
 *
 * Determines which target array (up or down) a level belongs to.
 */
export type PlanDirection = 'UP' | 'DOWN';

/**
 * Status tracking for targets during trading session
 *
 * Lifecycle:
 * - PENDING: Target not yet reached
 * - HIT: Price has touched the level
 * - CONSUMED: Trade taken at this level
 * - INVALIDATED: Level no longer valid (e.g., price moved beyond)
 */
export type PlanTargetStatus = 'PENDING' | 'HIT' | 'CONSUMED' | 'INVALIDATED';

/**
 * Represents a confluence band when multiple levels cluster together
 *
 * Levels within priceMergeTicks distance are merged into bands,
 * which receive confluence boost in priority scoring.
 */
export interface LevelBand {
  /**
   * Top of the price band (highest level price in the band)
   */
  top: number;

  /**
   * Bottom of the price band (lowest level price in the band)
   */
  bottom: number;

  /**
   * Average price of all levels in the band
   *
   * Calculated as the mean of all constituent level prices using
   * fixed-precision arithmetic for determinism.
   */
  avgPrice: number;

  /**
   * Level IDs that were merged into this band
   *
   * Used to track which levels contribute to the confluence boost.
   */
  constituents: string[];
}

/**
 * A ranked target in the daily bias plan
 *
 * Represents a single level after priority scoring, confluence banding,
 * and deterministic sorting. Contains all information needed for trade
 * execution decisions.
 */
export interface PlanTarget {
  /**
   * The key level being targeted
   */
  level: KeyLevel;

  /**
   * Direction relative to reference price
   *
   * UP for levels above reference, DOWN for levels below.
   */
  direction: PlanDirection;

  /**
   * Absolute distance from reference price
   *
   * Used as secondary sort key (ascending) after priority.
   */
  distance: number;

  /**
   * Computed priority score (higher = stronger magnet)
   *
   * Combines source weight, recency, proximity, and confluence factors.
   */
  priority: number;

  /**
   * Optional confluence band if level was merged with others
   *
   * Present only when 2+ levels clustered within priceMergeTicks.
   */
  band?: LevelBand;

  /**
   * Current status during trading session
   *
   * Updated via markLevelStatus() when price action occurs.
   */
  status: PlanTargetStatus;
}

/**
 * Complete daily bias plan for a symbol
 *
 * Created once per trading date and marked immutable except for status updates.
 * Contains ranked targets in both directions relative to reference price.
 */
export interface Plan {
  /**
   * Unique plan identifier: `${symbol}:${yyyy-mm-dd}`
   */
  id: string;

  /**
   * Trading symbol identifier
   */
  symbol: string;

  /**
   * Local trading date in YYYY-MM-DD format (exchange timezone)
   */
  dateLocal: string;

  /**
   * Reference price used for target ranking
   *
   * Typically previous day close or current price at plan creation.
   */
  currentRef: number;

  /**
   * Plan creation timestamp in exchange timezone
   */
  createdAt: Date;

  /**
   * Ordered targets above reference price
   *
   * Sorted by priority desc, distance asc, source priority desc, level ID asc.
   */
  upTargets: PlanTarget[];

  /**
   * Ordered targets below reference price
   *
   * Sorted by priority desc, distance asc, source priority desc, level ID asc.
   */
  downTargets: PlanTarget[];

  /**
   * Fixed strategy rules text for audit trail
   *
   * Documents the planner version, priority weights, and sorting logic.
   */
  rules: string[];

  /**
   * Optional metadata
   */
  meta?: {
    /**
     * Exchange timezone (e.g., "America/New_York" for ES/NQ)
     */
    tz: string;

    /**
     * Symbol tick size for price calculations
     */
    tickSize: number;

    /**
     * Source bar information for debugging
     */
    sourceBars?: string;
  };
}

/**
 * Configuration interface for priority scoring and banding
 *
 * Controls the behavior of the priority scoring algorithm and
 * confluence banding logic in the Daily Bias Planner.
 */
export interface PriorityConfig {
  /**
   * Weight multipliers for different scoring components
   */
  weights: {
    /**
     * Source weights: H4 (3.0) > H1 (2.0) > SESSION (1.0)
     *
     * Controls relative importance of different timeframe levels.
     */
    source: Record<KeyLevelSource, number>;

    /**
     * Recency weight multiplier
     *
     * Controls importance of how recently the level was established.
     */
    recency: number;

    /**
     * Proximity weight multiplier
     *
     * Controls importance of distance from reference price.
     */
    proximity: number;

    /**
     * Confluence weight multiplier
     *
     * Controls boost applied when levels cluster together.
     */
    confluence: number;
  };

  /**
   * Proximity decay configuration
   */
  proximityDecay: {
    /**
     * Lambda parameter for exponential decay: exp(-lambda * ticksAway)
     *
     * Higher values cause faster decay for distant levels.
     */
    lambda: number;
  };

  /**
   * Recency horizon in bars for different timeframes
   *
   * Maps timeframe (e.g., "H1", "H4") to number of bars for recency decay.
   */
  recencyHorizonBars: Record<string, number>;

  /**
   * Confluence banding configuration
   */
  banding: {
    /**
     * Distance in ticks to merge levels into bands
     *
     * Levels within this distance are merged into confluence bands.
     */
    priceMergeTicks: number;

    /**
     * Maximum width in ticks before splitting bands
     *
     * Bands exceeding this width are split back into individual levels.
     */
    maxBandWidthTicks: number;
  };

  /**
   * Target and level limits
   */
  limits?: {
    /**
     * Maximum targets per side (up/down)
     *
     * Typical value: 8 (top 8 targets per direction)
     */
    maxTargetsPerSide: number;

    /**
     * Maximum levels per source type
     *
     * Limits input from each source before processing.
     */
    maxLevelsPerSource: number;
  };

  /**
   * Symbol tick sizes
   *
   * Maps symbol to tick size for price calculations.
   */
  tickSize?: Record<string, number>;

  /**
   * Timezone mapping by symbol
   *
   * Maps symbol to exchange timezone (e.g., "ES" -> "America/New_York")
   */
  timezoneBySymbol?: Record<string, string>;
}

/**
 * Context information required for scoring calculations
 *
 * Bundles together the parameters needed by priority scoring functions
 * to avoid passing many individual arguments.
 */
export interface ScoringContext {
  /**
   * Trading symbol identifier
   */
  symbol: string;

  /**
   * Reference price for distance calculations
   */
  currentRef: number;

  /**
   * Symbol tick size for price calculations
   */
  tickSize: number;

  /**
   * Priority configuration
   */
  config: PriorityConfig;

  /**
   * Current timestamp for recency calculations (deterministic)
   * If not provided, Date.now() will be used (non-deterministic)
   */
  currentTime?: Date;
}
