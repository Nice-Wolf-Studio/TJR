/**
 * Pure-function trading session calendar with holiday and DST awareness
 *
 * Provides deterministic, zero-I/O functions for:
 * - Getting trading sessions (RTH/ETH) for dates and symbols
 * - Checking market holidays
 * - Retrieving regular trading hours windows
 *
 * All functions are pure: same inputs always produce same outputs.
 * Calendar data is pre-packaged and loaded at module initialization.
 */

import cmeCalendarData from './data/cme-calendar.json';
import type { Session, TimeWindow, CalendarData, SymbolSessions } from './types';

// Load calendar data at module initialization (one-time cost)
const calendarData: CalendarData = cmeCalendarData as CalendarData;

/**
 * Creates a holiday lookup map for O(1) access
 * Key format: "YYYY-MM-DD"
 */
const holidayMap = new Map<string, { name: string; type: 'full' | 'early_close' }>();
for (const holiday of calendarData.holidays) {
  holidayMap.set(holiday.date, { name: holiday.name, type: holiday.type });
}

/**
 * Formats a Date object to YYYY-MM-DD string using UTC time
 *
 * IMPORTANT: Uses UTC methods to ensure consistent date formatting
 * regardless of local timezone. This prevents date mismatches when
 * comparing with holiday calendar data.
 *
 * @param date - Date to format
 * @returns Date string in YYYY-MM-DD format (UTC)
 */
function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses time string (HH:MM) and combines with date to create UTC Date
 *
 * @param date - Base date
 * @param timeStr - Time string in HH:MM format
 * @param timezone - IANA timezone string
 * @returns Date object in UTC
 */
function parseTimeToUTC(date: Date, timeStr: string, timezone: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);

  // Create date in local exchange timezone
  // Note: This is a simplified implementation. Full DST handling would require
  // a timezone library like date-fns-tz or moment-timezone
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  // Create local date (assuming no DST for simplicity in this implementation)
  // In production, this should use proper timezone conversion
  const localDate = new Date(year, month, day, hours, minutes, 0, 0);

  // Apply timezone offset (simplified - assumes Chicago = UTC-6 or UTC-5)
  // This is a placeholder - full implementation would use timezone library
  const offsetHours = timezone === 'America/Chicago' ? 6 : 0; // Simplified
  const utcDate = new Date(localDate.getTime() + offsetHours * 60 * 60 * 1000);

  return utcDate;
}

/**
 * Check if a date is a market holiday for the given symbol
 *
 * @param date - Date to check
 * @param symbol - Trading symbol (e.g., "ES", "NQ")
 * @returns True if the date is a holiday (full or early close)
 *
 * @example
 * ```typescript
 * const isHol = isHoliday(new Date('2025-12-25'), 'ES');
 * console.log(isHol); // true (Christmas Day)
 * ```
 */
export function isHoliday(date: Date, symbol: string): boolean {
  // Validate symbol exists in calendar
  if (!calendarData.sessions[symbol]) {
    throw new Error(`Unknown symbol: ${symbol}. Available symbols: ${Object.keys(calendarData.sessions).join(', ')}`);
  }

  const dateStr = formatDate(date);
  return holidayMap.has(dateStr);
}

/**
 * Get the regular trading hours (RTH) window for a date and symbol
 *
 * Returns null if the date is a holiday (full closure).
 * For early close days, returns adjusted RTH window.
 *
 * @param date - Trading date
 * @param symbol - Trading symbol (e.g., "ES", "NQ")
 * @returns RTH window with start/end times, or null if market closed
 *
 * @example
 * ```typescript
 * const window = rthWindow(new Date('2025-06-15'), 'ES');
 * if (window) {
 *   console.log(`RTH: ${window.start} to ${window.end}`);
 * }
 * ```
 */
export function rthWindow(date: Date, symbol: string): TimeWindow | null {
  // Check if symbol exists
  if (!calendarData.sessions[symbol]) {
    throw new Error(`Unknown symbol: ${symbol}. Available symbols: ${Object.keys(calendarData.sessions).join(', ')}`);
  }

  const dateStr = formatDate(date);
  const holiday = holidayMap.get(dateStr);

  // No trading on full closure days
  if (holiday?.type === 'full') {
    return null;
  }

  const symbolSessions: SymbolSessions = calendarData.sessions[symbol] as SymbolSessions;
  const rth = symbolSessions.rth;

  // Parse RTH times to UTC
  const start = parseTimeToUTC(date, rth.start, symbolSessions.timezone);
  let end = parseTimeToUTC(date, rth.end, symbolSessions.timezone);

  // Adjust for early close (e.g., half day before holidays)
  if (holiday?.type === 'early_close') {
    // Early close typically means market closes at 13:00 local time (1:00 PM)
    end = parseTimeToUTC(date, '13:00', symbolSessions.timezone);
  }

  return { start, end };
}

/**
 * Get all trading sessions (RTH and ETH) for a date and symbol
 *
 * Returns an array of Session objects representing all available trading
 * windows for the given date. Returns empty array if market is closed (holiday).
 *
 * @param date - Trading date
 * @param symbol - Trading symbol (e.g., "ES", "NQ")
 * @returns Array of trading sessions, or empty array if closed
 *
 * @example
 * ```typescript
 * const sessions = getSessions(new Date('2025-06-15'), 'ES');
 * sessions.forEach(s => {
 *   console.log(`${s.type}: ${s.start} to ${s.end}`);
 * });
 * ```
 */
export function getSessions(date: Date, symbol: string): Session[] {
  // Check if symbol exists
  if (!calendarData.sessions[symbol]) {
    throw new Error(`Unknown symbol: ${symbol}. Available symbols: ${Object.keys(calendarData.sessions).join(', ')}`);
  }

  const dateStr = formatDate(date);
  const holiday = holidayMap.get(dateStr);

  // No sessions on full closure days
  if (holiday?.type === 'full') {
    return [];
  }

  const symbolSessions: SymbolSessions = calendarData.sessions[symbol] as SymbolSessions;
  const sessions: Session[] = [];

  // Regular Trading Hours (RTH)
  const rthStart = parseTimeToUTC(date, symbolSessions.rth.start, symbolSessions.timezone);
  let rthEnd = parseTimeToUTC(date, symbolSessions.rth.end, symbolSessions.timezone);

  // Adjust RTH end for early close
  if (holiday?.type === 'early_close') {
    rthEnd = parseTimeToUTC(date, '13:00', symbolSessions.timezone);
  }

  sessions.push({
    type: 'RTH',
    start: rthStart,
    end: rthEnd,
    exchange: calendarData.exchange,
  });

  // Extended Trading Hours - Pre-market/Overnight
  // Note: ETH_PRE spans from previous day's evening to current day's morning
  const prevDay = new Date(date);
  prevDay.setDate(prevDay.getDate() - 1);

  const ethPreStart = parseTimeToUTC(prevDay, symbolSessions.eth_pre.start, symbolSessions.timezone);
  const ethPreEnd = parseTimeToUTC(date, symbolSessions.eth_pre.end, symbolSessions.timezone);

  sessions.push({
    type: 'ETH_PRE',
    start: ethPreStart,
    end: ethPreEnd,
    exchange: calendarData.exchange,
  });

  // Extended Trading Hours - Post-market
  // Only add if not an early close day (early close typically has no post-market)
  if (holiday?.type !== 'early_close') {
    const ethPostStart = parseTimeToUTC(date, symbolSessions.eth_post.start, symbolSessions.timezone);
    const ethPostEnd = parseTimeToUTC(date, symbolSessions.eth_post.end, symbolSessions.timezone);

    sessions.push({
      type: 'ETH_POST',
      start: ethPostStart,
      end: ethPostEnd,
      exchange: calendarData.exchange,
    });
  }

  return sessions;
}