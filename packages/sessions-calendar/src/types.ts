/**
 * Type definitions for sessions-calendar package
 */

/**
 * Represents a trading session with start/end times and exchange information
 */
export interface Session {
  /** Type of trading session */
  type: 'RTH' | 'ETH_PRE' | 'ETH_POST';

  /** Session start time (UTC) */
  start: Date;

  /** Session end time (UTC) */
  end: Date;

  /** Exchange where the session occurs */
  exchange: string;
}

/**
 * Represents a time window with start and end dates
 */
export interface TimeWindow {
  /** Window start time (UTC) */
  start: Date;

  /** Window end time (UTC) */
  end: Date;
}

/**
 * Holiday record from calendar data
 */
export interface Holiday {
  /** Holiday date in YYYY-MM-DD format */
  date: string;

  /** Holiday name */
  name: string;

  /** Holiday type (full closure or early close) */
  type: 'full' | 'early_close';
}

/**
 * Session definition from calendar data
 */
export interface SessionDef {
  /** Start time in HH:MM format (local exchange time) */
  start: string;

  /** End time in HH:MM format (local exchange time) */
  end: string;

  /** Description of the session */
  description: string;
}

/**
 * Symbol session configuration
 */
export interface SymbolSessions {
  /** Symbol name (e.g., "E-mini S&P 500") */
  name: string;

  /** IANA timezone for the exchange */
  timezone: string;

  /** Regular Trading Hours definition */
  rth: SessionDef;

  /** Extended Trading Hours - Pre-market/Overnight */
  eth_pre: SessionDef;

  /** Extended Trading Hours - Post-market */
  eth_post: SessionDef;
}

/**
 * Calendar data structure
 */
export interface CalendarData {
  /** Exchange name */
  exchange: string;

  /** Calendar valid from date (YYYY-MM-DD) */
  validFrom: string;

  /** Calendar valid to date (YYYY-MM-DD) */
  validTo: string;

  /** List of holidays */
  holidays: Holiday[];

  /** DST transition dates */
  dstTransitions: Array<{
    year: number;
    spring: string;
    fall: string;
  }>;

  /** Session definitions by symbol */
  sessions: Record<string, SymbolSessions>;
}
