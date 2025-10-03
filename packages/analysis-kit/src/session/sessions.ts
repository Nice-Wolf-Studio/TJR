/**
 * Session extremes extraction
 * Extracts high/low/open/close values for specific trading sessions (RTH only)
 */

import type { Bar, SessionExtremes, TimeWindow } from '../types.js';

/**
 * Extract session extremes from bars within a time window
 *
 * This function filters bars to only those within the RTH time window,
 * then calculates the high, low, open, and close for that session.
 *
 * **Algorithm:**
 * 1. Filter bars to only those within [start, end) time window
 * 2. Find open (first bar's open), close (last bar's close)
 * 3. Find high (max of all highs), low (min of all lows)
 *
 * **Edge cases:**
 * - No bars in window: Returns null
 * - Single bar in window: Uses that bar's OHLC
 * - Time window bounds: Inclusive start, exclusive end (standard convention)
 *
 * @param bars - Array of price bars (must be chronologically ordered)
 * @param rthWindow - Time window defining RTH session (UTC)
 * @returns Session extremes or null if no bars in window
 *
 * @example
 * ```typescript
 * const bars = [
 *   { timestamp: 1000, open: 100, high: 105, low: 99, close: 104 },
 *   { timestamp: 2000, open: 104, high: 110, low: 103, close: 108 },
 *   { timestamp: 3000, open: 108, high: 109, low: 107, close: 108 },
 * ];
 *
 * const rthWindow = {
 *   start: new Date(1000),
 *   end: new Date(3000),
 * };
 *
 * const extremes = extractSessionExtremes(bars, rthWindow);
 * // Returns { rthOpen: 100, rthClose: 108, rthHigh: 110, rthLow: 99 }
 * ```
 */
export function extractSessionExtremes(bars: Bar[], rthWindow: TimeWindow): SessionExtremes | null {
  // Validate inputs
  if (bars.length === 0) {
    return null;
  }

  const startMs = rthWindow.start.getTime();
  const endMs = rthWindow.end.getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error('Invalid time window: start and end must be valid dates');
  }

  if (startMs >= endMs) {
    throw new Error(`Invalid time window: start (${startMs}) must be before end (${endMs})`);
  }

  // Filter bars within time window [start, end)
  const sessionBars = bars.filter((bar) => {
    return bar.timestamp >= startMs && bar.timestamp < endMs;
  });

  if (sessionBars.length === 0) {
    return null;
  }

  // Extract open (first bar) and close (last bar)
  const firstBar = sessionBars[0];
  const lastBar = sessionBars[sessionBars.length - 1];

  if (!firstBar || !lastBar) {
    return null;
  }

  const rthOpen = firstBar.open;
  const rthClose = lastBar.close;

  // Find high and low across all session bars
  let rthHigh = -Infinity;
  let rthLow = Infinity;

  for (const bar of sessionBars) {
    if (bar.high > rthHigh) {
      rthHigh = bar.high;
    }
    if (bar.low < rthLow) {
      rthLow = bar.low;
    }
  }

  // Validate results
  if (!Number.isFinite(rthHigh) || !Number.isFinite(rthLow)) {
    throw new Error('Invalid bar data: high or low values are not finite');
  }

  return {
    rthOpen,
    rthClose,
    rthHigh,
    rthLow,
  };
}
