/**
 * Session Levels Engine - Migrated from GladOSv2
 *
 * Original source: GladOSv2/src/strategy/levels/session-levels.ts
 * Commit: dee236c1e762db08cf7d6f34885eb4779f73600c
 * Date: 2025-09-22
 * Original author: Nice Wolf Studio
 *
 * Adapted for tjr-suite monorepo with the following changes:
 * - Import paths updated for @tjr/contracts types
 * - Session boundary utilities will be ported separately
 *
 * @packageDocumentation
 */

/**
 * SessionLevelsEngine - Core Session Highs/Lows Engine for GladOSv2 Shard 1.1
 *
 * Efficiently tracks rolling high/low levels across trading sessions (ASIA, LONDON, NY)
 * with O(1) bar processing and bounded memory usage. Handles timezone-aware session
 * boundaries with DST support and provides idempotent bar processing.
 *
 * Key Features:
 * - O(1) performance per bar update
 * - Memory bounded to single trading date
 * - Timezone-aware session boundary calculation
 * - Idempotent bar processing with deduplication
 * - Proper handling of midnight-crossing sessions
 * - Event system ready architecture
 */

// Import session types from @tjr/contracts
import type {
  SessionName,
  SessionBoundary,
  SymbolSessionsConfig,
  SessionLevels,
  SessionLevelsSnapshot,
} from '@tjr/contracts';

// Import session utilities
import { materializeSessionBoundaries, isWithin } from './session-utils.js';

/**
 * Represents a bar of market data for processing
 */
export interface MarketBar {
  /** Bar timestamp */
  t: Date;
  /** Opening price */
  o: number;
  /** High price */
  h: number;
  /** Low price */
  l: number;
  /** Closing price */
  c: number;
}

/**
 * Internal session state for tracking levels
 */
interface SessionState {
  /** Session boundary information */
  boundary: SessionBoundary;
  /** Current session high (NaN if no bars processed) */
  high: number;
  /** Current session low (NaN if no bars processed) */
  low: number;
  /** Timestamp when high was reached (null if no bars) */
  highTime: Date | null;
  /** Timestamp when low was reached (null if no bars) */
  lowTime: Date | null;
  /** Whether any bars have been processed for this session */
  hasData: boolean;
}

/**
 * SessionLevelsEngine - Core implementation for tracking session highs and lows
 *
 * This engine processes market bars incrementally and maintains rolling high/low
 * levels for each trading session. It provides O(1) performance per bar and
 * bounded memory usage, making it suitable for real-time trading applications.
 *
 * @example
 * ```typescript
 * const config: SymbolSessionsConfig = {
 *   symbol: "ES",
 *   windows: [
 *     { name: "ASIA", start: "18:00", end: "03:00", timezone: "America/Chicago" },
 *     { name: "LONDON", start: "03:00", end: "09:30", timezone: "America/Chicago" },
 *     { name: "NY", start: "09:30", end: "16:00", timezone: "America/Chicago" }
 *   ]
 * };
 *
 * const engine = new SessionLevelsEngine({ symbol: "ES", cfg: config });
 * const snapshot = engine.startDate("2024-01-15");
 *
 * // Process bars incrementally
 * engine.onBar({ t: new Date("2024-01-15T20:00:00Z"), o: 4500, h: 4510, l: 4495, c: 4505 });
 * engine.onBar({ t: new Date("2024-01-15T21:00:00Z"), o: 4505, h: 4520, l: 4500, c: 4515 });
 *
 * // Get current levels
 * const currentSnapshot = engine.getSnapshot();
 * ```
 */
export class SessionLevelsEngine {
  private readonly symbol: string;
  private readonly cfg: SymbolSessionsConfig;

  /** Current trading date in YYYY-MM-DD format */
  private currentDate: string | null = null;

  /** Session boundaries for current date */
  private boundaries: SessionBoundary[] = [];

  /** Session states mapped by session name */
  private sessionStates: Map<SessionName, SessionState> = new Map();

  /** Set of processed bar timestamps for deduplication */
  private processedTimestamps: Set<number> = new Set();

  /** Last processed timestamp for out-of-order detection */
  private lastProcessedTime: number = 0;

  /** Warning flags to prevent duplicate logging */
  private warningFlags: Set<string> = new Set();

  /**
   * Creates a new SessionLevelsEngine instance
   *
   * @param opts - Configuration options
   * @param opts.symbol - Trading symbol (e.g., "ES", "NQ")
   * @param opts.cfg - Session windows configuration
   *
   * @throws {Error} If symbol is invalid or configuration is missing
   */
  constructor(opts: { symbol: string; cfg: SymbolSessionsConfig }) {
    if (!opts.symbol || typeof opts.symbol !== 'string') {
      throw new Error('Invalid symbol: must be a non-empty string');
    }

    if (!opts.cfg || !opts.cfg.windows || !Array.isArray(opts.cfg.windows)) {
      throw new Error('Invalid configuration: missing or invalid windows array');
    }

    this.symbol = opts.symbol.trim();
    this.cfg = opts.cfg;
  }

  /**
   * Starts a new trading date and pre-computes session boundaries
   *
   * This method materializes absolute session boundaries for the given date,
   * initializes session states with empty levels, and returns the initial snapshot.
   * All previous date state is cleared.
   *
   * @param dateLocal - Trading date in YYYY-MM-DD format in exchange timezone
   * @returns Initial session snapshot with boundaries and empty levels
   *
   * @throws {Error} If date format is invalid or boundary calculation fails
   *
   * @example
   * ```typescript
   * const snapshot = engine.startDate("2024-01-15");
   * // Returns snapshot with 3 boundaries and levels with NaN high/low values
   * ```
   */
  startDate(dateLocal: string): SessionLevelsSnapshot {
    // Validate input date format
    if (!dateLocal || !dateLocal.match(/^\d{4}-\d{2}-\d{2}$/)) {
      throw new Error(`Invalid date format: ${dateLocal}. Expected YYYY-MM-DD format.`);
    }

    try {
      // Clear previous state
      this.currentDate = dateLocal;
      this.boundaries = [];
      this.sessionStates.clear();
      this.processedTimestamps.clear();
      this.lastProcessedTime = 0;
      this.warningFlags.clear();

      // Materialize session boundaries for this date
      this.boundaries = materializeSessionBoundaries(dateLocal, this.symbol, this.cfg);

      // Initialize session states
      for (const boundary of this.boundaries) {
        this.sessionStates.set(boundary.name, {
          boundary,
          high: NaN,
          low: NaN,
          highTime: null,
          lowTime: null,
          hasData: false
        });
      }

      // Check for overlapping boundaries and log warning once
      this.validateBoundaries();

      return this.createSnapshot();

    } catch (error) {
      throw new Error(`Failed to start date ${dateLocal}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Processes a market bar incrementally with O(1) performance
   *
   * Updates session high/low levels for the session containing the bar timestamp.
   * Provides idempotent processing through deduplication and rejects out-of-order
   * bars that are older than the last processed timestamp.
   *
   * @param bar - Market bar data with timestamp and OHLC prices
   *
   * @throws {Error} If no date is started, bar is invalid, or timestamp is out-of-order
   *
   * @example
   * ```typescript
   * // Process a bar during ASIA session
   * engine.onBar({
   *   t: new Date("2024-01-15T20:00:00Z"),
   *   o: 4500, h: 4510, l: 4495, c: 4505
   * });
   * ```
   */
  onBar(bar: MarketBar): void {
    // Validate preconditions
    if (!this.currentDate) {
      throw new Error('No date started. Call startDate() first.');
    }

    if (!bar || !bar.t || !(bar.t instanceof Date) || isNaN(bar.t.getTime())) {
      throw new Error('Invalid bar: missing or invalid timestamp');
    }

    if (typeof bar.h !== 'number' || typeof bar.l !== 'number' || isNaN(bar.h) || isNaN(bar.l)) {
      throw new Error('Invalid bar: high and low must be valid numbers');
    }

    const timestamp = bar.t.getTime();

    // Deduplicate bars by timestamp (idempotent processing)
    if (this.processedTimestamps.has(timestamp)) {
      return; // Already processed this bar
    }

    // Reject out-of-order bars older than last processed timestamp
    if (timestamp < this.lastProcessedTime) {
      throw new Error(`Out-of-order bar detected. Bar timestamp ${bar.t.toISOString()} is older than last processed ${new Date(this.lastProcessedTime).toISOString()}`);
    }

    // Update last processed time
    this.lastProcessedTime = timestamp;
    this.processedTimestamps.add(timestamp);

    // Find which session boundary this bar belongs to
    const targetSession = this.findSessionForBar(bar);

    if (!targetSession) {
      // Bar falls outside all session boundaries - this is normal for gaps between sessions
      return;
    }

    // Update session levels
    this.updateSessionLevels(targetSession, bar);
  }

  /**
   * Returns current session levels snapshot for active sessions
   *
   * Creates a complete snapshot containing session boundaries and current
   * high/low levels. Sessions without data will have NaN values for high/low
   * and null timestamps.
   *
   * @returns Current session levels snapshot
   *
   * @throws {Error} If no date is started
   *
   * @example
   * ```typescript
   * const snapshot = engine.getSnapshot();
   * console.log(`NY session high: ${snapshot.levels[2].high}`);
   * ```
   */
  getSnapshot(): SessionLevelsSnapshot {
    if (!this.currentDate) {
      throw new Error('No date started. Call startDate() first.');
    }

    return this.createSnapshot();
  }

  /**
   * Finalizes current date and rolls to next trading date
   *
   * This method finalizes the current date's session levels, emits the final
   * snapshot, clears all state, and prepares for the next trading date.
   * The caller should follow with startDate(nextDate) to continue processing.
   *
   * @returns Final session levels snapshot for the completed date
   *
   * @throws {Error} If no date is started
   *
   * @example
   * ```typescript
   * const finalSnapshot = engine.endDate();
   * // Process final snapshot, then start next date
   * engine.startDate("2024-01-16");
   * ```
   */
  endDate(): SessionLevelsSnapshot {
    if (!this.currentDate) {
      throw new Error('No date started. Call startDate() first.');
    }

    // Create final snapshot before clearing state
    const finalSnapshot = this.createSnapshot();

    // Clear all state
    this.currentDate = null;
    this.boundaries = [];
    this.sessionStates.clear();
    this.processedTimestamps.clear();
    this.lastProcessedTime = 0;
    this.warningFlags.clear();

    return finalSnapshot;
  }

  /**
   * Finds the session boundary that contains the given bar timestamp
   *
   * @param bar - Market bar to check
   * @returns Session state if bar falls within a session boundary, null otherwise
   */
  private findSessionForBar(bar: MarketBar): SessionState | null {
    // Check each boundary to see if the bar falls within it
    // Earlier boundaries take precedence for overlapping windows
    const sessionStates = Array.from(this.sessionStates.values());
    for (const sessionState of sessionStates) {
      if (isWithin(sessionState.boundary, bar.t)) {
        return sessionState;
      }
    }

    return null; // Bar falls outside all session boundaries
  }

  /**
   * Updates session high/low levels with the new bar data
   *
   * @param sessionState - Session state to update
   * @param bar - Market bar data
   */
  private updateSessionLevels(sessionState: SessionState, bar: MarketBar): void {
    // If this is the first bar for the session, initialize high/low
    if (!sessionState.hasData) {
      sessionState.high = bar.h;
      sessionState.low = bar.l;
      sessionState.highTime = new Date(bar.t);
      sessionState.lowTime = new Date(bar.t);
      sessionState.hasData = true;
      return;
    }

    // Update high if bar high is greater than current high
    if (bar.h > sessionState.high) {
      sessionState.high = bar.h;
      sessionState.highTime = new Date(bar.t);
    } else if (bar.h === sessionState.high && sessionState.highTime) {
      // Equal highs: keep earliest timestamp
      if (bar.t.getTime() < sessionState.highTime.getTime()) {
        sessionState.highTime = new Date(bar.t);
      }
    }

    // Update low if bar low is less than current low
    if (bar.l < sessionState.low) {
      sessionState.low = bar.l;
      sessionState.lowTime = new Date(bar.t);
    } else if (bar.l === sessionState.low && sessionState.lowTime) {
      // Equal lows: keep earliest timestamp
      if (bar.t.getTime() < sessionState.lowTime.getTime()) {
        sessionState.lowTime = new Date(bar.t);
      }
    }
  }

  /**
   * Creates a session levels snapshot from current state
   *
   * @returns Complete session snapshot
   */
  private createSnapshot(): SessionLevelsSnapshot {
    const levels: SessionLevels[] = [];

    // Convert Map entries to array for iteration compatibility
    const sessionEntries = Array.from(this.sessionStates.entries());
    for (const [sessionName, sessionState] of sessionEntries) {
      levels.push({
        symbol: this.symbol,
        date: this.currentDate!,
        session: sessionName,
        high: sessionState.high,
        low: sessionState.low,
        highTime: sessionState.highTime || new Date(0), // Use epoch if null
        lowTime: sessionState.lowTime || new Date(0)    // Use epoch if null
      });
    }

    // Sort levels by session boundary start time to maintain consistent order
    levels.sort((a, b) => {
      const boundaryA = this.sessionStates.get(a.session)?.boundary;
      const boundaryB = this.sessionStates.get(b.session)?.boundary;
      if (!boundaryA || !boundaryB) return 0;
      return boundaryA.start.getTime() - boundaryB.start.getTime();
    });

    return {
      symbol: this.symbol,
      boundaries: [...this.boundaries], // Create defensive copy
      levels
    };
  }

  /**
   * Validates session boundaries for overlaps and logs warnings
   */
  private validateBoundaries(): void {
    const sortedBoundaries = [...this.boundaries].sort((a, b) => a.start.getTime() - b.start.getTime());

    for (let i = 0; i < sortedBoundaries.length - 1; i++) {
      const current = sortedBoundaries[i]!;
      const next = sortedBoundaries[i + 1]!;

      // Check if current session end time overlaps with next session start time
      if (current.end.getTime() > next.start.getTime()) {
        const warningKey = `overlap-${current.name}-${next.name}`;
        if (!this.warningFlags.has(warningKey)) {
          console.warn(
            `Session overlap detected: ${current.name} (ends ${current.end.toISOString()}) ` +
            `overlaps with ${next.name} (starts ${next.start.toISOString()}). ` +
            `Earlier boundary takes precedence.`
          );
          this.warningFlags.add(warningKey);
        }
      }
    }
  }
}
