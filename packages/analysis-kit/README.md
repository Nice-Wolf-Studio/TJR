# @tjr/analysis-kit

Pure-function analytics for market structure, bias, sessions, and profiles.

## Overview

`@tjr/analysis-kit` provides deterministic, pure analytics functions for trading analysis with **zero I/O operations**. All functions are:

- **Pure:** Same inputs always produce same outputs
- **Deterministic:** No wall-clock access, no random numbers, no network calls
- **Type-safe:** Full TypeScript support with strict types
- **Testable:** Comprehensive fixtures and property tests

## Installation

```bash
pnpm add @tjr/analysis-kit
```

## Features

### 1. Market Structure Analysis (`detectSwings`)

Identifies swing points (Higher Highs, Higher Lows, Lower Highs, Lower Lows) in price data.

```typescript
import { detectSwings } from '@tjr/analysis-kit';

const bars = [
  { timestamp: 1000, open: 100, high: 105, low: 99, close: 104 },
  { timestamp: 2000, open: 104, high: 110, low: 103, close: 108 },
  // ... more bars
];

const swings = detectSwings(bars, 5); // lookback = 5
// Returns: [
//   { index: 3, timestamp: 1234, price: 110, type: 'HH' },
//   { index: 5, timestamp: 5678, price: 102, type: 'HL' },
//   ...
// ]
```

**Swing Detection Visualization:**

```
Price
  ^
110|           * HH (Higher High)
105|       *       *
100|   *               * HL (Higher Low)
 95|                       *
  +--------------------------------> Time
```

**Algorithm:**

1. Find pivot highs (local maxima over lookback window)
2. Find pivot lows (local minima over lookback window)
3. Classify each pivot by comparing to previous pivot of same type
4. Return chronologically sorted swing points

**Edge cases:**

- First/last `lookback` bars cannot be pivots (insufficient context)
- First pivot of each type is not classified (no reference)
- Equal pivots treated as continuation

---

### 2. Daily Bias Analysis (`calculateDailyBias`)

Calculates market bias (bullish/bearish/neutral) based on price action relative to session extremes.

```typescript
import { calculateDailyBias } from '@tjr/analysis-kit';

const bars = [
  /* ... */
];
const sessionExtremes = {
  rthOpen: 100,
  rthClose: 108,
  rthHigh: 110,
  rthLow: 99,
};

const bias = calculateDailyBias(bars, sessionExtremes);
// Returns: {
//   bias: 'bullish',
//   confidence: 0.85,
//   reason: 'Close (108) is 82% through RTH range, above open (100)'
// }
```

**Bias Logic:**

```
RTH Range:
High 110 |-----------------------| 100%
         |                       |
         |         [X] Close 108 | 82% (Upper zone → Bullish)
         |                       |
Mid  105 |-----------·-----------| 50%
         |                       |
         |                       |
         |     Open 100          |
Low   99 |-----------------------| 0%
```

**Classification:**

- **Bullish:** Close > open AND close in upper 40% of range
- **Bearish:** Close < open AND close in lower 40% of range
- **Neutral:** Mixed signals or close near midpoint

**Confidence:**

- High (0.75-1.0): Strong directional signals
- Medium (0.5-0.75): Moderate signals
- Low (0.25-0.5): Weak or conflicting signals

---

### 3. Session Extremes (`extractSessionExtremes`)

Extracts OHLC values for a specific trading session (RTH only).

```typescript
import { extractSessionExtremes } from '@tjr/analysis-kit';

const bars = [
  /* ... */
];
const rthWindow = {
  start: new Date('2025-01-15T09:30:00Z'),
  end: new Date('2025-01-15T16:00:00Z'),
};

const extremes = extractSessionExtremes(bars, rthWindow);
// Returns: {
//   rthOpen: 100,
//   rthClose: 108,
//   rthHigh: 110,
//   rthLow: 99,
// }
```

**Algorithm:**

1. Filter bars within time window `[start, end)`
2. Extract open (first bar's open) and close (last bar's close)
3. Find high (max of all highs) and low (min of all lows)

**Edge cases:**

- No bars in window: Returns `null`
- Single bar: Uses that bar's OHLC

---

### 4. Day Profile Classification (`classifyDayProfile`)

Classifies daily price action into profile types.

```typescript
import { classifyDayProfile } from '@tjr/analysis-kit';

const bars = [
  /* ... */
];
const sessionExtremes = {
  /* ... */
};

const profile = classifyDayProfile(bars, sessionExtremes);
// Returns: {
//   type: 'P',  // Trend day
//   characteristics: ['strong directional move', 'bullish trend', 'close near high'],
//   volatility: 0.85,
// }
```

**Profile Types:**

| Type  | Name         | Description                                  | Characteristics                               |
| ----- | ------------ | -------------------------------------------- | --------------------------------------------- |
| **P** | Trend Day    | Strong directional move, limited retracement | Large range (>70% ATR), close near extreme    |
| **K** | Range Day    | Balanced, mean-reverting, narrow range       | Small range (<30% ATR), close near middle     |
| **D** | Distribution | Wide range, rotational, failed breakout      | Large range, close in middle (not at extreme) |

**Trend Day (P) Visualization:**

```
Price
  ^
110|                           [Close]
105|                       *
100|                   *
 95|               *
 90|           *
 85|       *
 80| [Open]
  +---------------------------------------> Time
     RTH Start                    RTH End
```

**Range Day (K) Visualization:**

```
Price
  ^
110|       *       *       *
105|   *       *       *       [Close]
100| [Open] *       *       *
 95|       *       *
  +---------------------------------------> Time
     Mean-reverting, narrow range
```

**Distribution Day (D) Visualization:**

```
Price
  ^
110|           *
105|       *       *       [Close]
100| [Open]           *       *
 95|                           *
 90|                       *
  +---------------------------------------> Time
     Wide range, close in middle
```

---

## API Reference

### Types

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
  end: Date; // UTC
}

interface SwingPoint {
  index: number;
  timestamp: number;
  price: number;
  type: 'HH' | 'HL' | 'LH' | 'LL';
}

interface BiasResult {
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 0.0 to 1.0
  reason: string;
}

interface SessionExtremes {
  rthOpen: number;
  rthClose: number;
  rthHigh: number;
  rthLow: number;
}

interface DayProfile {
  type: 'P' | 'K' | 'D';
  characteristics: string[];
  volatility: number;
}
```

### Functions

#### `detectSwings(bars: Bar[], lookback: number): SwingPoint[]`

Detects swing points using lookback window.

**Parameters:**

- `bars` - Array of price bars (chronologically ordered)
- `lookback` - Number of bars on each side for pivot identification (typically 3-10)

**Returns:** Array of swing points with HH/HL/LH/LL classifications

**Throws:** Error if bars not chronologically ordered or invalid OHLC

---

#### `calculateDailyBias(bars: Bar[], sessionExtremes: SessionExtremes): BiasResult`

Calculates market bias from bar data and session extremes.

**Parameters:**

- `bars` - Array of price bars
- `sessionExtremes` - RTH OHLC values

**Returns:** Bias classification with confidence and reasoning

---

#### `extractSessionExtremes(bars: Bar[], rthWindow: TimeWindow): SessionExtremes | null`

Extracts RTH OHLC from bars within time window.

**Parameters:**

- `bars` - Array of price bars
- `rthWindow` - Time window defining RTH session

**Returns:** Session extremes or `null` if no bars in window

**Throws:** Error if time window is invalid

---

#### `classifyDayProfile(bars: Bar[], sessionExtremes: SessionExtremes): DayProfile`

Classifies day profile from bar data.

**Parameters:**

- `bars` - Array of price bars
- `sessionExtremes` - RTH OHLC values

**Returns:** Profile classification with characteristics and volatility

---

## Purity Guarantees

This package guarantees:

1. **No I/O operations:** No file system, network, or database access
2. **No wall-clock reads:** No `Date.now()`, `performance.now()`, etc.
3. **Deterministic:** Same inputs always produce same outputs
4. **No mutations:** Input parameters are never modified
5. **No side effects:** Functions have no observable effects beyond return value

## Testing

The package includes comprehensive tests:

- **Golden fixtures:** JSON files with expected outputs
- **Property tests:** Verify repeatability (determinism)
- **Edge case coverage:** Empty arrays, single bars, equal prices, etc.

Run tests:

```bash
pnpm test
```

## Performance

All functions are optimized for performance:

- `detectSwings`: O(n × lookback) where n = number of bars
- `calculateDailyBias`: O(1)
- `extractSessionExtremes`: O(n)
- `classifyDayProfile`: O(n)

Benchmarked on 10K bar dataset: < 10ms per function

## Limitations

Current limitations (Phase 51):

1. **Single timeframe:** Operates on provided bars only (no multi-timeframe fusion)
2. **No volume profile:** Omits volume-weighted metrics (TPO, VWAP)
3. **No order flow:** Omits microstructure (bid/ask imbalance, delta)

Future versions may expand capabilities.

## License

UNLICENSED

## References

- [ADR-0059: Analysis Kit](../../docs/adr/ADR-0059-analysis-kit.md)
- [Market Profile Theory (CBOT)](https://en.wikipedia.org/wiki/Market_profile)
- [Swing Trading Basics](https://www.investopedia.com/terms/s/swingtrading.asp)
