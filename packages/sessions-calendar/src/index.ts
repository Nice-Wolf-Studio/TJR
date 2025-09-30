/**
 * @tjr/sessions-calendar
 *
 * Pure-function trading session calendar with holiday and DST awareness.
 *
 * This package provides deterministic, zero-I/O functions for working with
 * trading sessions (RTH/ETH) across different symbols and exchanges.
 *
 * Key features:
 * - Holiday awareness (full closures and early closes)
 * - DST-aware session times
 * - Pure functions (no I/O, same inputs → same outputs)
 * - Pre-packaged CME calendar data for tests
 *
 * @example
 * ```typescript
 * import { getSessions, isHoliday, rthWindow } from '@tjr/sessions-calendar';
 *
 * // Check if a date is a holiday
 * const isHol = isHoliday(new Date('2025-12-25'), 'ES');
 * console.log(isHol); // true (Christmas)
 *
 * // Get regular trading hours
 * const window = rthWindow(new Date('2025-06-15'), 'ES');
 * console.log(window); // { start: Date, end: Date }
 *
 * // Get all sessions (RTH + ETH)
 * const sessions = getSessions(new Date('2025-06-15'), 'ES');
 * sessions.forEach(s => console.log(s.type, s.start, s.end));
 * ```
 */

export { getSessions, isHoliday, rthWindow } from './calendar';
export type { Session, TimeWindow, Holiday, CalendarData } from './types';