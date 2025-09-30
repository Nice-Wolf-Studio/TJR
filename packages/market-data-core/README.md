# @tjr-suite/market-data-core

Pure utilities for timeframe math, bar aggregation, and data clipping.

## Overview

`@tjr-suite/market-data-core` provides deterministic, I/O-free functions for working with OHLCV (Open-High-Low-Close-Volume) bar data. All operations are performed in UTC to avoid DST-related bugs.

**Key Features:**

- **Timeframe normalization**: Convert vendor-specific notations (e.g., "1min", "60s") to canonical form ("1m")
- **Bar aggregation**: Aggregate bars from one timeframe to another (e.g., 1m → 5m, 1h → 4h)
- **Efficient clipping**: Extract subsets of bars by timestamp range using binary search
- **UTC-only**: No DST surprises, deterministic behavior across timezones

## Installation

```bash
pnpm add @tjr-suite/market-data-core
```

## Usage

### Timeframe Normalization

```typescript
import { normalizeTimeframe, toMillis } from "@tjr-suite/market-data-core";

// Normalize vendor-specific notations
normalizeTimeframe("1min");  // → "1m"
normalizeTimeframe("60s");   // → "1m"
normalizeTimeframe("D");     // → "1D"

// Convert to milliseconds
toMillis("1m");   // → 60000
toMillis("5m");   // → 300000
toMillis("1h");   // → 3600000
toMillis("1D");   // → 86400000
```

### Bar Aggregation

Aggregate bars from a source timeframe to a target timeframe:

```typescript
import { aggregateBars } from "@tjr-suite/market-data-core";

// Example: Aggregate ten 1-minute bars into two 5-minute bars
const bars1m = [
  { timestamp: 1633024800000, open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
  { timestamp: 1633024860000, open: 100.5, high: 102, low: 100, close: 101, volume: 1200 },
  // ... 8 more bars ...
];

const bars5m = aggregateBars(bars1m, "5m");
// Result: [
//   { timestamp: 1633024800000, open: 100, high: 102, low: 99, close: 101.5, volume: 5500 },
//   { timestamp: 1633025100000, open: 101.5, high: 103, low: 101, close: 102.8, volume: 6100 },
// ]
```

**OHLC Aggregation Rules:**

- **Open**: First bar's open
- **High**: Max of all highs
- **Low**: Min of all lows
- **Close**: Last bar's close
- **Volume**: Sum of all volumes

**Options:**

```typescript
// Include partial last bar (useful for live data)
const barsWithPartial = aggregateBars(bars1m, "5m", { includePartialLast: true });

// Enable validation (checks that bars are sorted, no duplicates)
const barsValidated = aggregateBars(bars1m, "5m", { validate: true });

// Warn on gaps in bar sequence
const barsWithWarnings = aggregateBars(bars1m, "5m", { warnOnGaps: true });
```

### Bar Clipping

Extract subsets of bars by timestamp range:

```typescript
import { clipBars } from "@tjr-suite/market-data-core";

// Clip to range [from, to)
const subset = clipBars(bars, from, to);

// Clip from timestamp onward
const fromTimestamp = clipBars(bars, from);

// Clip up to timestamp
const upToTimestamp = clipBars(bars, undefined, to);

// No clipping (returns all bars)
const allBars = clipBars(bars);
```

**Performance:**

Clipping uses binary search for O(log n + m) complexity, where n is the input size and m is the output size.

### Timestamp Alignment

Align timestamps to timeframe boundaries:

```typescript
import { alignTimestamp, isAligned } from "@tjr-suite/market-data-core";

const timestamp = 1633024859000; // 2021-09-30T14:40:59.000Z

// Align to 5-minute boundary (floor)
alignTimestamp(timestamp, "5m", "floor");  // → 1633024800000 (14:40:00)

// Align to 5-minute boundary (ceil)
alignTimestamp(timestamp, "5m", "ceil");   // → 1633025100000 (14:45:00)

// Check if aligned
isAligned(1633024800000, "5m");  // → true
isAligned(1633024859000, "5m");  // → false
```

## Supported Timeframes

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

## Design Principles

### 1. UTC-Only

All timestamps are in UTC (Unix epoch milliseconds). This ensures:

- **Determinism**: Same results regardless of server timezone
- **No DST bugs**: UTC never shifts (no "spring forward" or "fall back" issues)
- **International markets**: Works across all exchanges and timezones

**Provider adapters** are responsible for converting local times to UTC before calling these functions.

### 2. Pure Functions

All functions are pure (no I/O, no side effects). This makes them:

- **Testable**: Easy to write unit tests with fixed inputs/outputs
- **Composable**: Can be chained without worrying about state
- **Predictable**: Same input always produces same output

### 3. Performance

- **Binary search** for clipping (O(log n) instead of O(n))
- **Single-pass aggregation** (O(n) time complexity)
- **No sorting** (assumes input is pre-sorted)

## Examples

### Aggregate 1m → 10m

```typescript
import { aggregateBars } from "@tjr-suite/market-data-core";

const bars1m = [
  /* 10 one-minute bars from 14:00 to 14:09 */
];

const bars10m = aggregateBars(bars1m, "10m");
// Result: 1 ten-minute bar covering 14:00-14:10
```

**Visual:**

```
Input (1m bars):  |14:00|14:01|14:02|14:03|14:04|14:05|14:06|14:07|14:08|14:09|
                   └─────────────────────────────────────────────────────────┘
Output (10m bar):                    |14:00 - 14:10|
```

### Aggregate 1h → 4h

```typescript
import { aggregateBars } from "@tjr-suite/market-data-core";

const bars1h = [
  /* 6 one-hour bars from 00:00 to 05:00 */
];

const bars4h = aggregateBars(bars1h, "4h");
// Result: 1 four-hour bar (00:00-04:00), partial at 04:00-05:00 excluded
```

**Visual:**

```
Input (1h bars):   |00:00|01:00|02:00|03:00|04:00|05:00|
                    └───────────────────────┘  └────┘
Output (4h bar):           |00:00 - 04:00|    (partial excluded)
```

## Testing

The package includes comprehensive tests:

- **Golden test cases**: Known input/output pairs for aggregation
- **DST boundary fixtures**: Verify correct handling of daylight saving transitions
- **Property tests**: Volume conservation, monotonicity, OHLC invariants
- **Edge cases**: Empty input, single bar, gaps, partial bars

Run tests:

```bash
pnpm test
```

## Architecture Decision Records

See [ADR-0055: Market-Data-Core Timeframe & Aggregation](../../docs/adr/ADR-0055-market-data-core.md) for design rationale and alternatives considered.

## License

UNLICENSED (internal TJR Suite package)