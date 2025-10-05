/**
 * Session Boundary Utilities - Migrated from GladOSv2
 *
 * Original source: GladOSv2/src/services/time/sessions.ts
 * Commit: dee236c1e762db08cf7d6f34885eb4779f73600c
 * Date: 2025-09-22
 * Original author: Nice Wolf Studio
 *
 * Adapted for tjr-suite monorepo with the following changes:
 * - Import session types from @tjr/contracts
 * - Removed date-fns dependency (replaced parseISO with native Date)
 *
 * @packageDocumentation
 */

import type { SessionBoundary, SymbolSessionsConfig } from '@tjr/contracts';

/**
 * Symbol to timezone mapping for exchange-specific timezone resolution
 */
const SYMBOL_TIMEZONE_MAP: Record<string, string> = {
  // US Equities and ETFs
  'SPY': 'America/New_York',
  'QQQ': 'America/New_York',
  'IWM': 'America/New_York',
  'TSLA': 'America/New_York',
  'AAPL': 'America/New_York',
  'MSFT': 'America/New_York',
  'GOOGL': 'America/New_York',
  'AMZN': 'America/New_York',

  // US Futures
  'ES': 'America/Chicago',
  'NQ': 'America/Chicago',
  'YM': 'America/Chicago',
  'RTY': 'America/Chicago',
  'GC': 'America/Chicago',
  'SI': 'America/Chicago',
  'CL': 'America/Chicago',
  'NG': 'America/Chicago',

  // Forex (using major trading centers)
  'EURUSD': 'Europe/London',
  'GBPUSD': 'Europe/London',
  'USDJPY': 'Asia/Tokyo',
  'USDCHF': 'Europe/Zurich',
  'AUDUSD': 'Australia/Sydney',
  'USDCAD': 'America/Toronto',
  'NZDUSD': 'Pacific/Auckland',

  // European indices
  'DAX': 'Europe/Berlin',
  'FTSE': 'Europe/London',
  'CAC': 'Europe/Paris',

  // Asian indices
  'NIKKEI': 'Asia/Tokyo',
  'HSI': 'Asia/Hong_Kong',
  'ASX': 'Australia/Sydney'
};

/**
 * Gets the IANA timezone identifier for a given trading symbol.
 *
 * This function resolves the appropriate timezone for a symbol by checking:
 * 1. Direct symbol lookup in the symbol-to-timezone mapping
 * 2. Pattern matching for common symbol formats
 * 3. Falls back to New York timezone as default
 *
 * @param symbol - Trading symbol to resolve timezone for (e.g., "ES", "SPY", "EURUSD")
 * @returns IANA timezone identifier (e.g., "America/New_York", "Europe/London")
 *
 * @example
 * ```typescript
 * const timezone = getExchangeTimezone("ES"); // Returns "America/Chicago"
 * const defaultTz = getExchangeTimezone("UNKNOWN"); // Returns "America/New_York"
 * ```
 */
export function getExchangeTimezone(symbol: string): string {
  if (!symbol || typeof symbol !== 'string') {
    return 'America/New_York';
  }

  const upperSymbol = symbol.toUpperCase().trim();

  // Direct lookup
  if (SYMBOL_TIMEZONE_MAP[upperSymbol]) {
    return SYMBOL_TIMEZONE_MAP[upperSymbol]!;
  }

  // Pattern matching for common formats

  // Crypto symbols (check before forex - often contain "USD", "USDT", or start with BTC/ETH)
  if (upperSymbol.startsWith('BTC') || upperSymbol.startsWith('ETH') ||
      upperSymbol.endsWith('USDT') || upperSymbol.endsWith('BUSD')) {
    return 'UTC'; // Crypto markets are global, use UTC
  }

  // Futures symbols with month/year codes (e.g., "ESZ23", "NQH24")
  if (upperSymbol.match(/^[A-Z]{1,3}[FGHJKMNQUVXZ]\d{2}$/)) {
    const baseSymbol = upperSymbol.substring(0, upperSymbol.length - 3);
    if (SYMBOL_TIMEZONE_MAP[baseSymbol]) {
      return SYMBOL_TIMEZONE_MAP[baseSymbol]!;
    }
  }

  // Forex pairs (6 characters, e.g., "EURUSD", "GBPJPY")
  if (upperSymbol.length === 6 && upperSymbol.match(/^[A-Z]{6}$/)) {
    const baseCurrency = upperSymbol.substring(0, 3);

    // Determine timezone based on base currency
    switch (baseCurrency) {
      case 'EUR':
      case 'GBP':
      case 'CHF':
        return 'Europe/London';
      case 'JPY':
        return 'Asia/Tokyo';
      case 'AUD':
        return 'Australia/Sydney';
      case 'NZD':
        return 'Pacific/Auckland';
      case 'CAD':
        return 'America/Toronto';
      case 'USD':
      default:
        return 'America/New_York';
    }
  }

  // Default to New York timezone for US markets
  return 'America/New_York';
}

/**
 * Helper function to parse time string in HH:mm format
 */
function parseTimeString(timeStr: string): { hours: number; minutes: number } | null {
  if (!timeStr || typeof timeStr !== 'string') {
    return null;
  }

  const parts = timeStr.trim().split(':');
  if (parts.length !== 2) {
    return null;
  }

  const hours = parseInt(parts[0]!, 10);
  const minutes = parseInt(parts[1]!, 10);

  if (isNaN(hours) || isNaN(minutes) ||
      hours < 0 || hours > 23 ||
      minutes < 0 || minutes > 59) {
    return null;
  }

  return { hours, minutes };
}

/**
 * Creates a timezone-aware Date object for a specific date and time in the given timezone.
 * This function properly handles DST transitions using the browser's Intl API.
 *
 * The goal is to convert a "local time in a specific timezone" to a UTC Date object.
 * For example: "2024-01-15 18:00 America/Chicago" -> Date representing that moment in UTC
 */
function createTimezoneAwareDate(dateLocal: string, timeLocal: string, timezone: string): Date {
  // Parse the time components
  const timeObj = parseTimeString(timeLocal);
  if (!timeObj) {
    throw new Error(`Invalid time format: ${timeLocal}`);
  }

  // Strategy: Create a date string that represents the desired time,
  // then use Intl.DateTimeFormat to figure out what UTC time corresponds to it

  // Create a temporary date in UTC with the date/time components
  const year = parseInt(dateLocal.substring(0, 4), 10);
  const month = parseInt(dateLocal.substring(5, 7), 10) - 1; // JS months are 0-indexed
  const day = parseInt(dateLocal.substring(8, 10), 10);

  // Use Date.UTC to create a timestamp with these components in UTC
  // This is our "guess" - we'll adjust it based on the timezone
  const utcGuess = Date.UTC(year, month, day, timeObj.hours, timeObj.minutes, 0, 0);
  const guessDate = new Date(utcGuess);

  // Now find out what time this UTC guess appears as in the target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(guessDate);
  const formattedYear = parseInt(parts.find(p => p.type === 'year')!.value, 10);
  const formattedMonth = parseInt(parts.find(p => p.type === 'month')!.value, 10) - 1;
  const formattedDay = parseInt(parts.find(p => p.type === 'day')!.value, 10);
  const formattedHour = parseInt(parts.find(p => p.type === 'hour')!.value, 10);
  const formattedMinute = parseInt(parts.find(p => p.type === 'minute')!.value, 10);

  // Calculate the difference between what we wanted and what we got
  const wantedLocal = Date.UTC(year, month, day, timeObj.hours, timeObj.minutes, 0, 0);
  const gotLocal = Date.UTC(formattedYear, formattedMonth, formattedDay, formattedHour, formattedMinute, 0, 0);
  const offset = gotLocal - wantedLocal;

  // Adjust our guess by the offset to get the correct UTC time
  return new Date(utcGuess - offset);
}

/**
 * Materializes session boundaries for a specific date and symbol.
 *
 * This function converts session window configurations into concrete session boundaries
 * with absolute Date objects, properly handling:
 * - DST transitions using IANA timezone data
 * - Midnight-crossing sessions (where end time < start time)
 * - Multiple session windows (ASIA, LONDON, NY)
 *
 * The function returns session boundaries in chronological order for the specified date.
 * If a session crosses midnight, the end time will extend into the next day.
 *
 * @param dateLocal - Date string in "YYYY-MM-DD" format in the exchange timezone
 * @param symbol - Trading symbol to determine the appropriate timezone
 * @param cfg - Session configuration containing window definitions
 * @returns Array of session boundaries sorted chronologically
 *
 * @throws {Error} If dateLocal format is invalid or timezone resolution fails
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
 * const boundaries = materializeSessionBoundaries("2024-01-15", "ES", config);
 * // Returns 3 SessionBoundary objects with absolute Date times
 * ```
 */
export function materializeSessionBoundaries(
  dateLocal: string,
  symbol: string,
  cfg: SymbolSessionsConfig
): SessionBoundary[] {
  // Input validation
  if (!dateLocal || !dateLocal.match(/^\d{4}-\d{2}-\d{2}$/)) {
    throw new Error(`Invalid date format: ${dateLocal}. Expected YYYY-MM-DD format.`);
  }

  if (!symbol || typeof symbol !== 'string') {
    throw new Error(`Invalid symbol: ${symbol}. Must be a non-empty string.`);
  }

  if (!cfg || !cfg.windows || !Array.isArray(cfg.windows)) {
    throw new Error('Invalid configuration: missing or invalid windows array.');
  }

  const timezone = getExchangeTimezone(symbol);
  const boundaries: SessionBoundary[] = [];

  try {
    for (const window of cfg.windows) {
      if (!window.name || !window.start || !window.end) {
        console.warn(`Skipping invalid window configuration:`, window);
        continue;
      }

      // Parse start and end times
      const startTime = parseTimeString(window.start);
      const endTime = parseTimeString(window.end);

      if (!startTime || !endTime) {
        console.warn(`Skipping window with invalid time format: ${window.name}`);
        continue;
      }

      // Create timezone-aware dates using Intl.DateTimeFormat
      // This approach handles DST correctly for the given timezone
      const startDate = createTimezoneAwareDate(dateLocal, window.start, timezone);

      // Handle end time, which might be on the next day if session crosses midnight
      let endDateLocal = dateLocal;
      if (endTime.hours < startTime.hours ||
          (endTime.hours === startTime.hours && endTime.minutes <= startTime.minutes)) {
        // Session crosses midnight - end time is next day
        // Replace parseISO with native Date constructor
        const nextDay = new Date(dateLocal + 'T00:00:00');
        nextDay.setDate(nextDay.getDate() + 1);
        endDateLocal = nextDay.toISOString().split('T')[0]!;
      }

      const endDate = createTimezoneAwareDate(endDateLocal, window.end, timezone);

      boundaries.push({
        name: window.name,
        start: startDate,
        end: endDate
      });
    }

    // Sort boundaries chronologically by start time
    boundaries.sort((a, b) => a.start.getTime() - b.start.getTime());

    return boundaries;

  } catch (error) {
    throw new Error(`Failed to materialize session boundaries: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Checks if a given timestamp falls within a session boundary.
 *
 * This function determines whether a timestamp is within the time range
 * defined by a session boundary. The check is inclusive of the start time
 * and exclusive of the end time (start <= time < end).
 *
 * @param boundary - Session boundary to check against
 * @param t - Timestamp to test
 * @returns true if the timestamp is within the boundary, false otherwise
 *
 * @example
 * ```typescript
 * const boundary: SessionBoundary = {
 *   name: "NY",
 *   start: new Date("2024-01-15T14:30:00Z"), // 9:30 AM EST
 *   end: new Date("2024-01-15T21:00:00Z")    // 4:00 PM EST
 * };
 *
 * const timestamp = new Date("2024-01-15T16:00:00Z"); // 11:00 AM EST
 * const isWithinSession = isWithin(boundary, timestamp); // Returns true
 * ```
 */
export function isWithin(boundary: SessionBoundary, t: Date): boolean {
  // Input validation
  if (!boundary || !boundary.start || !boundary.end) {
    throw new Error('Invalid boundary: missing start or end time.');
  }

  if (!t || !(t instanceof Date) || isNaN(t.getTime())) {
    throw new Error('Invalid timestamp: must be a valid Date object.');
  }

  const timestamp = t.getTime();
  const startTime = boundary.start.getTime();
  const endTime = boundary.end.getTime();

  // Check if timestamp is within the boundary (inclusive start, exclusive end)
  return timestamp >= startTime && timestamp < endTime;
}
