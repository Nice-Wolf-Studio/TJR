/**
 * @fileoverview Session-related types for TJR trading strategy.
 *
 * Defines types for trading session management, boundaries, and level tracking.
 * These types support the Session Levels Engine which tracks ASIA, LONDON, and NY
 * session highs and lows as key reference levels for TJR's trading methodology.
 *
 * Migrated from GladOSv2/src/strategy/types.ts
 * Commit: dee236c1e762db08cf7d6f34885eb4779f73600c
 * Date: 2025-09-22
 * Original Author: Nice Wolf Studio
 *
 * @module @tjr/contracts/sessions
 */

/**
 * Trading session identifier.
 *
 * TJR methodology tracks three major trading sessions:
 * - ASIA: Asian market hours (typically 18:00-03:00 ET)
 * - LONDON: London market hours (typically 03:00-09:30 ET)
 * - NY: New York market hours (typically 09:30-16:00 ET)
 */
export type SessionName = 'ASIA' | 'LONDON' | 'NY';

/**
 * Session boundary with absolute timestamps.
 *
 * Represents a materialized session with specific start and end times for a given
 * trading day. Created by converting relative SessionWindow configurations into
 * absolute Date objects with timezone awareness.
 *
 * @example
 * ```typescript
 * const asiaBoundary: SessionBoundary = {
 *   name: 'ASIA',
 *   start: new Date('2025-01-04T18:00:00-05:00'),
 *   end: new Date('2025-01-05T03:00:00-05:00')
 * };
 * ```
 */
export interface SessionBoundary {
  /** Session identifier */
  name: SessionName;
  /** Session start time (inclusive) */
  start: Date;
  /** Session end time (exclusive) */
  end: Date;
}

/**
 * Session window configuration with relative times.
 *
 * Defines a session template with local time strings that can be materialized
 * into SessionBoundary instances for specific trading dates. Times are specified
 * in HH:mm format and interpreted in the specified timezone.
 *
 * @example
 * ```typescript
 * const asiaWindow: SessionWindow = {
 *   name: 'ASIA',
 *   start: '18:00',
 *   end: '03:00',  // Next day
 *   timezone: 'America/New_York'
 * };
 * ```
 */
export interface SessionWindow {
  /** Session identifier */
  name: SessionName;
  /** Session start time in HH:mm format (local to timezone) */
  start: string;
  /** Session end time in HH:mm format (local to timezone, may cross midnight) */
  end: string;
  /** IANA timezone identifier (e.g., 'America/New_York', 'America/Chicago') */
  timezone: string;
}

/**
 * Symbol-specific session configuration.
 *
 * Defines the set of session windows for a specific trading symbol. Different
 * symbols may trade on different exchanges with different session times.
 *
 * @example
 * ```typescript
 * const esConfig: SymbolSessionsConfig = {
 *   symbol: 'ES',
 *   windows: [
 *     { name: 'ASIA', start: '18:00', end: '03:00', timezone: 'America/New_York' },
 *     { name: 'LONDON', start: '03:00', end: '09:30', timezone: 'America/New_York' },
 *     { name: 'NY', start: '09:30', end: '16:00', timezone: 'America/New_York' }
 *   ]
 * };
 * ```
 */
export interface SymbolSessionsConfig {
  /** Trading symbol (e.g., 'ES', 'NQ') */
  symbol: string;
  /** Array of session window configurations */
  windows: SessionWindow[];
}

/**
 * Session high/low levels output.
 *
 * Represents the tracked high and low price levels for a specific session,
 * along with the timestamps when those levels were reached. These levels are
 * key reference points in TJR's trading methodology.
 *
 * @example
 * ```typescript
 * const asiaLevels: SessionLevels = {
 *   symbol: 'ES',
 *   date: '2025-01-04',
 *   session: 'ASIA',
 *   high: 5875.50,
 *   low: 5850.25,
 *   highTime: new Date('2025-01-04T22:30:00-05:00'),
 *   lowTime: new Date('2025-01-04T20:15:00-05:00')
 * };
 * ```
 */
export interface SessionLevels {
  /** Trading symbol */
  symbol: string;
  /** Trading date in YYYY-MM-DD format (local exchange date) */
  date: string;
  /** Session identifier */
  session: SessionName;
  /** Session high price */
  high: number;
  /** Session low price */
  low: number;
  /** Timestamp when high was reached */
  highTime: Date;
  /** Timestamp when low was reached */
  lowTime: Date;
}

/**
 * Complete session snapshot for a trading day.
 *
 * Provides a complete view of all session boundaries and their tracked levels
 * for a specific symbol on a specific trading date. Used by the Session Levels
 * Engine to expose current state.
 *
 * @example
 * ```typescript
 * const snapshot: SessionLevelsSnapshot = {
 *   symbol: 'ES',
 *   boundaries: [asiaBoundary, londonBoundary, nyBoundary],
 *   levels: [asiaLevels, londonLevels, nyLevels]
 * };
 * ```
 */
export interface SessionLevelsSnapshot {
  /** Trading symbol */
  symbol: string;
  /** All session boundaries for the trading day */
  boundaries: SessionBoundary[];
  /** All session levels (may be incomplete if sessions haven't finished) */
  levels: SessionLevels[];
}
