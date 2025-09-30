# ADR-0059: Analysis Kit

**Status:** Accepted
**Date:** 2025-09-29
**Deciders:** Architecture Team
**Phase:** 51
**Shard:** D1

---

## Context

The TJR Suite requires deterministic, pure analytics functions for market analysis, including structure identification, bias calculation, session extremes, and day profile classification. Key requirements include:

- **Pure functions only:** No I/O operations, no wall-clock access, no external dependencies at runtime
- **Deterministic:** Same inputs always produce same outputs
- **Type-safe:** Leverages TypeScript and `@tjr/contracts` types
- **Testable:** Reproducible outputs with golden fixtures and property tests
- **Numeric stability:** Robust handling of edge cases (gaps, equal values, missing data)

Without this package, we face:
- Analytics logic scattered across different modules
- Non-deterministic behavior from impure functions
- Inconsistent market structure interpretation
- Difficulty testing trading strategies with reproducible scenarios

---

## Decision

### 1. **Architecture: Pure Analytics Functions**

We will implement `@tjr/analysis-kit` as a collection of pure, deterministic analytics functions with zero I/O.

**Rationale:**
- **Predictability:** Same inputs always produce same outputs
- **Composability:** Functions can be chained and combined safely
- **Testability:** Easy to verify correctness with fixtures
- **Performance:** No I/O overhead, suitable for backtesting large datasets

**Purity guarantees:**
- No file system access
- No network calls
- No `Date.now()` or wall-clock reads
- No random number generation without explicit seed
- No mutations of input parameters

---

### 2. **Module Structure**

The package is organized into four core modules:

#### **Structure Analysis (`src/structure.ts`)**
Identifies swing points (Higher Highs, Higher Lows, Lower Highs, Lower Lows) in price data.

```typescript
interface SwingPoint {
  index: number;
  timestamp: number;
  price: number;
  type: 'HH' | 'HL' | 'LH' | 'LL';
}

// Detect swing points using lookback window
function detectSwings(bars: Bar[], lookback: number): SwingPoint[]
```

**Key behaviors:**
- **Lookback window:** Configurable periods (e.g., 5 bars) for pivot identification
- **Edge case handling:** First/last bars never flagged as pivots (insufficient context)
- **Equal prices:** Multiple bars at same high/low treated as single pivot (use first occurrence)

---

#### **Bias Analysis (`src/bias/daily-bias-v1.ts`)**
Calculates market bias (bullish/bearish/neutral) based on price action relative to key levels.

```typescript
interface BiasResult {
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 0.0 to 1.0
  reason: string;
}

// Calculate daily bias from bar data and session extremes
function calculateDailyBias(bars: Bar[], sessionExtremes: SessionExtremes): BiasResult
```

**Key behaviors:**
- **Macro awareness:** Considers multi-day trend (higher timeframe context)
- **Micro signals:** Recent price action within current session
- **Threshold-based:** Confidence score based on distance from key levels
- **Pure function:** No hidden state, all inputs explicit

---

#### **Session Extremes (`src/session/sessions.ts`)**
Extracts high/low extremes for specific trading sessions (RTH only) from bar data.

```typescript
interface SessionExtremes {
  rthHigh: number;
  rthLow: number;
  rthOpen: number;
  rthClose: number;
}

// Extract RTH extremes from bars within a time window
function extractSessionExtremes(bars: Bar[], rthWindow: TimeWindow): SessionExtremes
```

**Key behaviors:**
- **Time filtering:** Only bars within RTH window considered
- **Missing data handling:** Returns null if insufficient data
- **Timestamp requirements:** Bars must have valid timestamps (Unix epoch)

---

#### **Day Profile (`src/profile/day-profile-v1.ts`)**
Classifies daily price action into profile types (Trend, Range, Breakout).

```typescript
type ProfileType = 'P' | 'K' | 'D';

interface DayProfile {
  type: ProfileType;
  characteristics: string[];
  volatility: number;
}

// Classify day profile from bar data
function classifyDayProfile(bars: Bar[], sessionExtremes: SessionExtremes): DayProfile
```

**Profile types:**
- **P (Trend Day):** Strong directional move, limited retracement
- **K (Range Day):** Balanced, mean-reverting, narrow range
- **D (Breakout/Distribution Day):** Wide range, rotational, multi-directional

**Key behaviors:**
- **Range analysis:** High-low spread relative to recent average
- **Directional bias:** Open-close relationship and intraday structure
- **Volume awareness (optional):** If volume data present, incorporate into classification

---

### 3. **Input/Output Types**

All functions consume standardized types from `@tjr/contracts` (or inline definitions):

```typescript
interface Bar {
  timestamp: number; // Unix epoch milliseconds (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number; // Optional
}

interface TimeWindow {
  start: Date; // UTC
  end: Date;   // UTC
}
```

**Assumptions:**
1. **Timestamp ordering:** Bars are chronologically sorted (function validates)
2. **Price consistency:** `high >= open/close` and `low <= open/close`
3. **No missing bars:** Gaps in data handled gracefully (returns null or empty array)

---

### 4. **Numeric Stability Policy**

**Floating-point edge cases:**
- **Epsilon comparisons:** Use `Math.abs(a - b) < 1e-9` for equality checks on prices
- **Division by zero:** Explicitly check denominators, return null or default value
- **NaN handling:** Validate inputs; reject or sanitize NaN/Infinity values

**Example:**
```typescript
function isSamePrice(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}
```

**Rationale:**
- **Robustness:** Prevents crashes from edge-case data
- **Consistency:** Same behavior across different JS engines (Node.js, browsers)
- **Testability:** Edge cases covered in fixtures

---

### 5. **Fixture Policy**

**Approach:**
- **Golden fixtures:** JSON files with synthetic bar data + expected outputs
- **Deterministic:** Same fixture always produces same result
- **Coverage:** Edge cases (gaps, equal values, single bar, empty array)

**Fixture structure:**
```json
{
  "name": "uptrend-with-higher-highs",
  "input": {
    "bars": [
      {"timestamp": 1609459200000, "open": 100, "high": 105, "low": 99, "close": 104},
      {"timestamp": 1609545600000, "open": 104, "high": 110, "low": 103, "close": 108}
    ],
    "lookback": 5
  },
  "expected": {
    "swings": [
      {"index": 1, "timestamp": 1609545600000, "price": 110, "type": "HH"}
    ]
  }
}
```

**Test validation:**
- **Assertion:** Output matches `expected` exactly (deep equality)
- **Property tests:** Run same input 100 times, verify identical output (repeatability)

---

### 6. **Limitations (Initial Release)**

1. **No volume profile:** Omits volume-weighted metrics (TPO, VWAP)
2. **Single timeframe:** Operates on provided bars only (no multi-timeframe fusion)
3. **No order flow:** Omits microstructure (bid/ask imbalance, delta)
4. **English-only:** Documentation and error messages in English only

These are acceptable tradeoffs for Phase 51. Future shards can expand capabilities.

---

## Alternatives Considered

### Use External Analytics Library (e.g., `talib`, `technicalindicators`)
**Pros:**
- Battle-tested algorithms
- Comprehensive indicator library

**Cons:**
- Heavy dependencies (native bindings for `talib`)
- Generic indicators don't match TJR-specific methodology
- Impure functions (some mutate input arrays)

**Decision:** Rejected. Build lightweight, TJR-specific analytics with purity guarantees.

---

### Include I/O (e.g., fetch bars from database)
**Pros:**
- Convenience for callers

**Cons:**
- Breaks purity and testability
- Adds dependencies and error handling complexity
- Couples analytics to data layer

**Decision:** Rejected. Analytics functions are pure; caller provides data.

---

### Embed ML models for bias prediction
**Pros:**
- Potentially more accurate bias detection

**Cons:**
- Non-deterministic (model updates change behavior)
- Large bundle size (model weights)
- Requires training data and pipeline

**Decision:** Rejected. Use rule-based logic for now; ML can be separate package later.

---

## Risks and Mitigations

### Risk 1: Incorrect swing detection on edge cases
**Impact:** False signals lead to bad trading decisions
**Mitigation:**
- Comprehensive fixture suite (50+ scenarios)
- Property tests (repeatability, monotonicity)
- Manual review against charting software (TradingView, ThinkerSwim)

---

### Risk 2: Numeric instability with large price values
**Impact:** Precision loss on very large or very small prices
**Mitigation:**
- Use epsilon-based comparisons
- Document supported price ranges (tested: 0.01 to 1,000,000)
- Log warnings for extreme values

---

### Risk 3: Performance degradation with large datasets
**Impact:** Slow backtests when analyzing thousands of bars
**Mitigation:**
- Benchmark suite: Measure performance with 10K, 100K bar datasets
- Optimize hot paths (avoid repeated array scans)
- Document complexity: `O(n)` for most functions

---

### Risk 4: Divergence from industry-standard definitions
**Impact:** Confusion if TJR definitions differ from common usage
**Mitigation:**
- Inline comments explaining methodology
- Reference diagrams in README
- Version suffix (`-v1`) allows future changes without breaking

---

## Rollback Plan

If the pure-function approach proves unworkable:

1. **Add optional I/O adapter:** Separate `@tjr/analysis-kit-db` package wraps pure functions with database access
2. **Preserve pure core:** Existing functions remain unchanged
3. **Incremental migration:** Consumers opt-in to I/O layer per-function

**Estimated effort:** 1-2 days to add opt-in I/O adapter

---

## Success Metrics

1. **Determinism:** 100% of property tests pass (1000 runs per function)
2. **Coverage:** 50+ fixtures covering edge cases (gaps, equal values, empty arrays)
3. **Performance:** < 10ms per function for 10K bar dataset (measured via benchmark suite)
4. **Zero I/O:** No file reads, network calls, or wall-clock access at runtime (verified via sandbox tests)

---

## References

- [Market Profile Theory (CBOT)](https://en.wikipedia.org/wiki/Market_profile)
- [Swing Trading Basics](https://www.investopedia.com/terms/s/swingtrading.asp)
- [IEEE 754 Floating Point](https://en.wikipedia.org/wiki/IEEE_754)
- `@tjr/sessions-calendar` package (ADR-0058)

---

## Changelog

- **2025-09-29:** Initial ADR created (Phase 51, Shard D1)
