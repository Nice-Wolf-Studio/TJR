# ADR-0055: Market-Data-Core Timeframe & Aggregation

**Status:** Accepted
**Date:** 2025-09-29
**Deciders:** Architecture Team
**Phase:** 51
**Shard:** B1

---

## Context

The TJR Suite needs to handle market data (OHLCV bars) across multiple timeframes for technical analysis and backtesting. Key challenges:

- **Timeframe normalization:** Trading venues use inconsistent notation (1m, 60s, 1min)
- **Bar aggregation:** Convert 1-minute bars to higher timeframes (5m, 15m, 1h, 4h, 1D)
- **Time alignment:** Bars must align to UTC boundaries or trading session boundaries
- **DST handling:** Market hours shift during daylight saving transitions
- **Partial bars:** Decide whether to include incomplete bars in aggregated datasets
- **Clipping:** Extract subsets of bars by timestamp range without full iteration

Without a canonical timeframe library:

- Each provider adapter implements its own aggregation logic (duplication, bugs)
- Backtest engines produce inconsistent results due to off-by-one timestamp errors
- DST transitions cause silent data corruption (missing or duplicate bars)
- No shared test fixtures for edge cases (leap seconds, market holidays)

---

## Decision

### 1. **Canonical Timeframe Set**

Define a strict set of supported timeframes with normalized representation:

**Supported Timeframes:**

| Notation | Milliseconds | Notes |
|----------|--------------|-------|
| `1m` | 60,000 | Most common base timeframe |
| `5m` | 300,000 | Standard intraday chart |
| `10m` | 600,000 | Common for scalping strategies |
| `15m` | 900,000 | Popular day-trading timeframe |
| `30m` | 1,800,000 | Pre-market/after-hours boundary |
| `1h` | 3,600,000 | Hourly bar (standard) |
| `2h` | 7,200,000 | Useful for swing trading |
| `4h` | 14,400,000 | Major support/resistance timeframe |
| `1D` | 86,400,000 | Daily bar (UTC 00:00 aligned) |

**Normalization Rules:**

```typescript
// Input: "1min", "60s", "1m" → Output: "1m"
// Input: "4h", "240m" → Output: "4h"
function normalizeTimeframe(input: string): Timeframe {
  // Convert all inputs to milliseconds, then lookup canonical name
  const ms = parseToMillis(input);
  const canonical = TIMEFRAME_MAP.get(ms);
  if (!canonical) {
    throw new Error(`Unsupported timeframe: ${input} (${ms}ms)`);
  }
  return canonical;
}
```

**Why This Set:**

- Covers 95% of trading strategies (retail and institutional)
- Each timeframe is an integer multiple of smaller ones (clean aggregation)
- Daily bars use UTC 00:00 (independent of exchange timezone)

---

### 2. **Bar Alignment and Anchoring**

**Principle:** All bars must align to fixed UTC boundaries.

**Alignment Rules:**

| Timeframe | Boundary | Example |
|-----------|----------|---------|
| 1m | Every minute `:00.000` | 14:32:00.000 UTC |
| 5m | Every 5 minutes `:00.000`, `:05.000`, ... | 14:35:00.000 UTC |
| 1h | Top of the hour `:00:00.000` | 14:00:00.000 UTC |
| 4h | 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC | 16:00:00.000 UTC |
| 1D | 00:00:00.000 UTC | 2025-09-29T00:00:00.000Z |

**Implementation:**

```typescript
/**
 * Aligns a timestamp to the nearest timeframe boundary.
 *
 * @param timestamp - Unix epoch milliseconds
 * @param timeframe - Canonical timeframe (e.g., "5m", "1h")
 * @param direction - "floor" (round down) or "ceil" (round up)
 * @returns Aligned timestamp
 *
 * Examples:
 *   alignTimestamp(1633024859000, "5m", "floor") → 1633024800000 (14:40:00)
 *   alignTimestamp(1633024859000, "1h", "floor") → 1633024800000 (14:00:00)
 *   alignTimestamp(1633024859000, "1D", "floor") → 1632960000000 (00:00:00 UTC)
 */
function alignTimestamp(
  timestamp: number,
  timeframe: Timeframe,
  direction: "floor" | "ceil"
): number {
  const tfMs = toMillis(timeframe);
  if (direction === "floor") {
    return Math.floor(timestamp / tfMs) * tfMs;
  } else {
    return Math.ceil(timestamp / tfMs) * tfMs;
  }
}
```

**Why UTC Anchoring:**

- **Determinism:** Same aggregation results regardless of server timezone
- **Simplicity:** No need to track exchange-specific session times
- **Testability:** Easy to write golden test cases with fixed timestamps

**Session-Aligned Bars (Future Extension):**

- Phase 51 uses UTC only
- Phase 52+ may add `alignToSession(timestamp, exchangeId)` for futures/forex
- Exchange session boundaries stored in separate config (not in timeframe logic)

---

### 3. **DST Policy: Always Use UTC**

**Principle:** The core library operates exclusively in UTC. DST adjustments are handled at the API boundary (provider adapters).

**Rationale:**

- **Consistency:** Bars always have the same timestamp regardless of local timezone
- **No DST bugs:** UTC never shifts (no "spring forward" or "fall back" issues)
- **International markets:** Many exchanges operate in timezones without DST

**Provider Adapter Responsibility:**

When fetching bars from providers that use local time (e.g., US equity markets):

1. Convert local timestamps → UTC before passing to core library
2. Document timezone assumptions in adapter (e.g., "NYSE times converted assuming America/New_York")
3. Handle DST transitions explicitly (e.g., skip the missing hour in spring, duplicate the repeated hour in fall)

**Example (Polygon.io adapter):**

```typescript
// Provider returns bars in America/New_York time
const rawBars = await polygon.getBars("AAPL", "1m");

// Convert to UTC before aggregating
const utcBars = rawBars.map(bar => ({
  ...bar,
  timestamp: luxon.DateTime.fromMillis(bar.timestamp, { zone: "America/New_York" }).toUTC().toMillis(),
}));

// Now safe to aggregate with market-data-core
const aggregated = aggregateBars(utcBars, "5m");
```

**DST Edge Case: 2025-03-09 02:00 EST → EDT (Spring Forward)**

- Input: Bars at 01:59 EST, 03:00 EDT (02:xx does not exist)
- Core library: Expects continuous UTC timestamps (no gap)
- Adapter: Must interpolate or mark as missing data

**Testing:**

- Include DST boundary fixtures in test suite (March 2025, November 2025)
- Verify no duplicate timestamps or missing bars in aggregated output

---

### 4. **Bar Aggregation Algorithm**

**Function Signature:**

```typescript
/**
 * Aggregates bars from a source timeframe to a target timeframe.
 *
 * @param bars - Array of OHLCV bars (must be sorted by timestamp ascending)
 * @param targetTimeframe - Desired output timeframe (must be >= source timeframe)
 * @returns Array of aggregated bars
 *
 * Invariants:
 *   - Output bars are aligned to targetTimeframe boundaries
 *   - OHLC semantics preserved: O=first, H=max, L=min, C=last
 *   - Volume is summed across source bars
 *   - Partial bars at the end are excluded by default (see includePartialLast)
 *
 * Examples:
 *   aggregateBars([1m bars], "5m") → 5-minute bars
 *   aggregateBars([1h bars], "4h") → 4-hour bars
 *   aggregateBars([1m bars], "1D") → daily bars (aligned to UTC 00:00)
 */
function aggregateBars(
  bars: Bar[],
  targetTimeframe: Timeframe,
  options?: { includePartialLast?: boolean }
): Bar[] {
  // Algorithm:
  // 1. Align first bar timestamp to target boundary (floor)
  // 2. Group bars by aligned boundary
  // 3. For each group:
  //    - O = open of first bar
  //    - H = max(high of all bars)
  //    - L = min(low of all bars)
  //    - C = close of last bar
  //    - V = sum(volume of all bars)
  // 4. Exclude last group if it doesn't span full target timeframe
  //    (unless includePartialLast=true)
}
```

**OHLC Aggregation Rules:**

| Field | Aggregation | Notes |
|-------|-------------|-------|
| **Open** | First bar's open | Bar that starts the period |
| **High** | Max of all highs | Highest price in period |
| **Low** | Min of all lows | Lowest price in period |
| **Close** | Last bar's close | Bar that ends the period |
| **Volume** | Sum of all volumes | Total traded volume |

**Partial Bar Handling:**

```typescript
// Example: Aggregating 1m bars to 5m, last bar incomplete
const bars = [
  { timestamp: ts("14:00"), o: 100, h: 101, l: 99, c: 100.5, v: 1000 },
  { timestamp: ts("14:01"), o: 100.5, h: 102, l: 100, c: 101, v: 1200 },
  // ... 3 more bars ...
  { timestamp: ts("14:05"), o: 101, h: 101.5, l: 100.5, c: 101, v: 900 },
  { timestamp: ts("14:06"), o: 101, h: 101.2, l: 100.8, c: 101.1, v: 800 },
  // Only 2 bars in last 5m period (incomplete)
];

// Default: exclude partial last bar
const agg1 = aggregateBars(bars, "5m"); // Returns only 14:00-14:05 bar

// Include partial: useful for live data
const agg2 = aggregateBars(bars, "5m", { includePartialLast: true });
// Returns 14:00-14:05 bar + partial 14:05-14:10 bar (only 14:05, 14:06)
```

**Validation:**

- Throw error if bars are not sorted ascending by timestamp
- Throw error if target timeframe is smaller than source timeframe (cannot disaggregate)
- Log warning if gaps detected (missing bars in expected sequence)

---

### 5. **Bar Clipping**

**Function Signature:**

```typescript
/**
 * Clips bars to a timestamp range.
 *
 * @param bars - Array of OHLCV bars
 * @param from - Start timestamp (inclusive, optional)
 * @param to - End timestamp (exclusive, optional)
 * @param options - Additional clipping options
 * @returns Filtered array of bars
 *
 * Behavior:
 *   - If from is omitted, starts from first bar
 *   - If to is omitted, ends at last bar
 *   - If includePartialLast=false (default), excludes bars that start before 'to' but extend beyond it
 *
 * Examples:
 *   clipBars(bars, ts("14:00"), ts("15:00")) → All bars in [14:00, 15:00)
 *   clipBars(bars, undefined, ts("15:00")) → All bars before 15:00
 *   clipBars(bars, ts("14:00"), undefined) → All bars from 14:00 onward
 */
function clipBars(
  bars: Bar[],
  from?: number,
  to?: number,
  options?: { includePartialLast?: boolean }
): Bar[] {
  // Binary search for efficient clipping (assumes sorted bars)
}
```

**Use Cases:**

- Backtesting: Clip historical bars to specific date range
- Chart rendering: Extract visible subset without full iteration
- Data validation: Verify completeness of a specific time window

---

### 6. **Type Definitions**

```typescript
/**
 * Canonical timeframe representation.
 */
export type Timeframe = "1m" | "5m" | "10m" | "15m" | "30m" | "1h" | "2h" | "4h" | "1D";

/**
 * OHLCV bar structure.
 *
 * Invariants:
 *   - timestamp is Unix epoch milliseconds (UTC)
 *   - timestamp is aligned to timeframe boundary
 *   - open, high, low, close are positive numbers
 *   - low <= open, close <= high
 *   - volume >= 0
 */
export interface Bar {
  timestamp: number;  // Unix epoch milliseconds (UTC)
  open: number;       // Opening price
  high: number;       // Highest price
  low: number;        // Lowest price
  close: number;      // Closing price
  volume: number;     // Traded volume
}
```

---

### 7. **Error Handling**

**Strict Validation:**

```typescript
// Unsupported timeframe
aggregateBars(bars, "3m");  // Error: Unsupported timeframe: 3m

// Unsorted input
aggregateBars([bar2, bar1], "5m");  // Error: Bars must be sorted ascending by timestamp

// Invalid aggregation direction
aggregateBars(fiveMinBars, "1m");  // Error: Cannot disaggregate from 5m to 1m
```

**Soft Warnings (Logged, Not Thrown):**

```typescript
// Gap detected in bar sequence
const bars = [
  { timestamp: ts("14:00"), ... },
  { timestamp: ts("14:01"), ... },
  // Missing 14:02
  { timestamp: ts("14:03"), ... },
];
aggregateBars(bars, "5m");
// Logs: "Warning: Gap detected at 14:02 (expected continuous 1m bars)"
```

---

### 8. **Testing Strategy**

**Property Tests:**

- **Monotonicity:** Output timestamps are strictly increasing
- **Boundary alignment:** All output bars align to target timeframe boundaries
- **OHLC invariants:** H >= max(O, C), L <= min(O, C)
- **Volume conservation:** Sum of output volumes = sum of input volumes

**Golden Test Cases:**

| Input | Target TF | Expected Output |
|-------|-----------|-----------------|
| 10× 1m bars (14:00-14:09) | 5m | 2× 5m bars (14:00, 14:05) |
| 10× 1m bars (14:00-14:09) | 10m | 1× 10m bar (14:00) |
| 6× 60m bars (00:00-05:00) | 4h | 1× 4h bar (00:00), partial at 04:00 (excluded) |
| 1440× 1m bars (full day) | 1D | 1× daily bar (00:00 UTC) |

**DST Boundary Fixtures:**

- **2025-03-09 02:00 EST → EDT:** Verify no duplicate timestamps
- **2025-11-02 01:00 EDT → EST:** Verify no missing bars

**Edge Cases:**

- Empty input array → empty output
- Single bar input → single bar output (if aligned)
- Bars with zero volume → included in output (volume=0 preserved)

---

### 9. **Package Structure**

```
packages/market-data-core/
├── src/
│   ├── timeframe.ts       # Timeframe normalization, toMillis, alignment
│   ├── aggregate.ts       # aggregateBars implementation
│   ├── clip.ts            # clipBars implementation
│   ├── types.ts           # Bar, Timeframe type definitions
│   └── index.ts           # Barrel export
├── tests/
│   ├── timeframe.test.ts  # Normalization, alignment tests
│   ├── aggregate.test.ts  # Golden cases, property tests
│   ├── clip.test.ts       # Clipping edge cases
│   └── dst-fixtures.ts    # DST boundary test data
├── package.json
├── tsconfig.json
└── README.md              # Usage examples, design docs
```

---

## Alternatives Considered

### 1. Session-Aligned Bars Instead of UTC

**Pros:**

- More intuitive for US equity traders (9:30 AM ET open)
- Matches exchange trading hours

**Cons:**

- Requires tracking exchange timezone for every symbol
- DST transitions create ambiguous timestamps
- Harder to test (session times vary by exchange and year)

**Decision:** Rejected for Phase 51. UTC-only keeps the core library simple. Session alignment can be added in Phase 52 as an opt-in feature.

---

### 2. Support All Timeframes (Arbitrary Seconds)

**Pros:**

- Maximum flexibility (e.g., 7m bars for custom strategies)

**Cons:**

- No standard test fixtures (infinite edge cases)
- Alignment rules become complex (what's the "top of the hour" for 7m?)
- Provider adapters would need to support arbitrary TFs (most don't)

**Decision:** Rejected. Canonical set covers 95% of use cases. Arbitrary TFs can be added later if demand exists.

---

### 3. Include Partial Bars by Default

**Pros:**

- Useful for live data (show current incomplete bar)

**Cons:**

- Confusing for backtesting (partial bars at end invalidate results)
- Inconsistent behavior (sometimes last bar is complete, sometimes not)

**Decision:** Rejected. Default to excluding partial bars (deterministic output). Opt-in via `includePartialLast=true` for live use cases.

---

## Risks and Mitigations

### Risk 1: DST Transitions Cause Silent Failures

**Impact:** Bars near DST boundaries have incorrect timestamps, breaking backtest results

**Mitigation:**

- Comprehensive DST test fixtures (2025-03-09, 2025-11-02)
- Document provider adapter responsibility for timezone conversion
- Future: Add `validateBarSequence()` utility to detect anomalies

---

### Risk 2: Canonical Timeframe Set Misses Common Use Cases

**Impact:** Developers work around library by pre-aggregating data

**Mitigation:**

- Review with trading desk stakeholders before locking TF set
- Monitor GitHub issues for requests (add new TFs in minor version bumps)

---

### Risk 3: Performance Issues with Large Datasets

**Impact:** Aggregating 1 year of 1m bars (525,600 bars) is too slow

**Mitigation:**

- Use binary search for clipping (O(log n) instead of O(n))
- Benchmark with realistic datasets (1M+ bars)
- Future: Add streaming API for incremental aggregation

---

## Rollback Plan

If market-data-core becomes unmaintainable:

1. **Inline into adapters:** Copy aggregation logic into each provider adapter
2. **Remove package:** Delete `packages/market-data-core/`, remove from workspace
3. **Vendor external library:** Adopt mature library like `technicalindicators` (if available)

**Estimated effort:** 2-4 hours (minimal dependency surface in Phase 51)

---

## Success Metrics

1. **Correctness:** All property tests pass (OHLC invariants, monotonicity)
2. **Coverage:** 100% line coverage for core functions (aggregate, clip, align)
3. **Performance:** Aggregate 1M 1m bars → 5m in <500ms (local machine)
4. **Adoption:** Used by at least 2 provider adapters (Polygon, Alpaca) by end of Phase 51

---

## References

- [ISO 8601 Duration Format](https://en.wikipedia.org/wiki/ISO_8601#Durations)
- [OHLC Chart Conventions](https://en.wikipedia.org/wiki/Open-high-low-close_chart)
- [TradingView Timeframe Notation](https://www.tradingview.com/chart/)
- [TA-Lib Bar Aggregation](https://github.com/TA-Lib/ta-lib)

---

## Changelog

- **2025-09-29:** Initial ADR created (Phase 51, Shard B1)