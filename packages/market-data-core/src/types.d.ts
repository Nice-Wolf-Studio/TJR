/**
 * Core type definitions for market data structures.
 *
 * This module defines the canonical types used throughout the market-data-core
 * package. All types are designed to be simple, serializable, and independent
 * of any specific data provider.
 */
/**
 * Canonical timeframe representation.
 *
 * These timeframes represent the standard intervals used in financial markets:
 * - 1m, 5m, 10m, 15m, 30m: Intraday timeframes for day trading and scalping
 * - 1h, 2h, 4h: Intermediate timeframes for swing trading
 * - 1D: Daily timeframe for position trading and long-term analysis
 *
 * All timeframes are expressed in their most compact notation (e.g., "1m"
 * instead of "1min" or "60s"). This ensures consistency across the codebase.
 *
 * Note: Only these canonical timeframes are supported. Arbitrary intervals
 * (e.g., "7m", "3h") are not supported in Phase 51.
 */
export type Timeframe = "1m" | "5m" | "10m" | "15m" | "30m" | "1h" | "2h" | "4h" | "1D";
/**
 * OHLCV (Open-High-Low-Close-Volume) bar structure.
 *
 * Represents a single bar of aggregated market data. This structure is used
 * for candlestick charts, technical analysis, and backtesting.
 *
 * Invariants (enforced by provider adapters, not validated by this library):
 * - timestamp is Unix epoch milliseconds (UTC)
 * - timestamp is aligned to timeframe boundary (e.g., 5m bars start at :00, :05, :10, etc.)
 * - open, high, low, close are positive numbers (> 0)
 * - low <= open, close <= high (standard OHLC semantics)
 * - high >= max(open, close)
 * - low <= min(open, close)
 * - volume >= 0 (can be zero for illiquid instruments)
 *
 * Example:
 * ```typescript
 * const bar: Bar = {
 *   timestamp: 1633024800000, // 2021-09-30T14:00:00.000Z
 *   open: 100.5,
 *   high: 101.2,
 *   low: 100.1,
 *   close: 100.8,
 *   volume: 15000
 * };
 * ```
 */
export interface Bar {
    /**
     * Unix epoch timestamp in milliseconds (UTC).
     *
     * This timestamp represents the START of the bar period. For example, a
     * 5-minute bar with timestamp 14:00:00.000 covers the period from 14:00:00.000
     * (inclusive) to 14:05:00.000 (exclusive).
     *
     * All timestamps must be in UTC to avoid DST-related bugs and ensure
     * deterministic behavior across different server timezones.
     */
    timestamp: number;
    /**
     * Opening price (first trade in the bar period).
     */
    open: number;
    /**
     * Highest price during the bar period.
     */
    high: number;
    /**
     * Lowest price during the bar period.
     */
    low: number;
    /**
     * Closing price (last trade in the bar period).
     */
    close: number;
    /**
     * Total traded volume during the bar period.
     *
     * Units depend on the instrument (shares for stocks, contracts for futures,
     * base currency for crypto). Volume can be zero for illiquid instruments
     * or during pre-market/after-hours sessions.
     */
    volume: number;
}
//# sourceMappingURL=types.d.ts.map