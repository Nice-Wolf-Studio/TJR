# @tjr/tjr-tools

> TJR confluence detection tools for Fair Value Gaps and Order Blocks

## Overview

`@tjr/tjr-tools` provides confluence detection functionality for the TJR (Trading Journal Research) methodology. It analyzes market data to identify:

- **Fair Value Gaps (FVG)**: Price inefficiencies created by rapid market moves
- **Order Blocks**: Institutional supply/demand zones marked by high volume and rejection

The package calculates weighted confluence scores to help identify high-probability trading setups.

## Installation

```bash
pnpm add @tjr/tjr-tools
```

## Usage

```typescript
import { analyze } from '@tjr/tjr-tools';

const result = analyze({
  symbol: 'SPY',
  timeframe: 'M5',
  bars: [ /* MarketBar[] */ ],
  analysisTimestamp: '2025-01-15T15:00:00Z',
});

console.log(`Confluence Score: ${result.confluence.score}`);
console.log(`Detected ${result.fvgZones.length} FVGs`);
console.log(`Detected ${result.orderBlocks.length} Order Blocks`);
```

## API

### `analyze(input, options?)`

Main analysis function that detects confluences and calculates scores.

**Parameters:**
- `input: TJRAnalysisInput` - Market data and context
- `options?: AnalyzeOptions` - Detection and scoring options

**Returns:** `TJRToolsResult` with confluence score, factors, and detected zones

### `detectFVGs(bars, options?)`

Detect Fair Value Gaps in price data.

### `detectOrderBlocks(bars, options?)`

Detect Order Blocks in price data.

## Features

- ✅ Fair Value Gap detection (bullish & bearish)
- ✅ Order Block detection (demand & supply)
- ✅ Weighted confluence scoring
- ✅ Zone overlap analysis
- ✅ Recency-based prioritization
- ✅ Pure functions (no side effects)
- ✅ Fully typed with TypeScript
- ✅ Comprehensive test coverage

## License

UNLICENSED - Internal use only