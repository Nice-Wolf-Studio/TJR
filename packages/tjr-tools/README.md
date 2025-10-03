# @tjr/tjr-tools

> TJR confluence detection and trade execution tools for systematic trading

## Overview

`@tjr/tjr-tools` provides comprehensive trading analysis for the TJR (Trading Journal Research) methodology:

### Confluence Detection

- **Fair Value Gaps (FVG)**: Price inefficiencies created by rapid market moves
- **Order Blocks**: Institutional supply/demand zones marked by high volume and rejection
- **Zone Overlap**: Confluence of multiple technical factors
- **Weighted Scoring**: Calculates probability of successful trades

### Trade Execution (New in v0.2.0)

- **Two-Stage Execution**: 5-minute confirmation + 1-minute entry
- **Multi-Timeframe Analysis**: Combines higher timeframe setup with lower timeframe entry
- **Risk Management**: Automatic stop loss and take profit calculation
- **Position Sizing**: Risk-based position size with confidence adjustment
- **Configuration Presets**: Conservative, default, and aggressive modes

## Installation

```bash
pnpm add @tjr/tjr-tools
```

## Usage

### Basic Confluence Analysis

```typescript
import { analyze } from '@tjr/tjr-tools';

const result = analyze({
  symbol: 'SPY',
  timeframe: 'M5',
  bars: bars5m,
  analysisTimestamp: '2025-01-15T15:00:00Z',
});

console.log(`Confluence Score: ${result.confluence.score}`);
console.log(`Detected ${result.fvgZones.length} FVGs`);
console.log(`Detected ${result.orderBlocks.length} Order Blocks`);
```

### With Trade Execution

```typescript
import { analyze, DEFAULT_EXECUTION_CONFIG } from '@tjr/tjr-tools';

const result = analyze(
  {
    symbol: 'SPY',
    timeframe: 'M5',
    bars: bars5m,
    analysisTimestamp: '2025-01-15T15:00:00Z',
  },
  {
    execution: DEFAULT_EXECUTION_CONFIG,
    bars1m: bars1m, // 1-minute bars for entry timing
  }
);

if (result.execution) {
  console.log(`Direction: ${result.execution.direction}`);
  console.log(`Entry: ${result.execution.entryPrice}`);
  console.log(`Stop Loss: ${result.execution.stopLoss}`);
  console.log(`Take Profit: ${result.execution.takeProfit}`);
  console.log(`Position Size: ${result.execution.positionSize}`);
  console.log(`Risk/Reward: ${result.execution.riskRewardRatio}`);
  console.log(`Confidence: ${result.execution.confidence}`);
}
```

### Using Configuration Presets

```typescript
import { analyze, CONSERVATIVE_CONFIG, AGGRESSIVE_CONFIG } from '@tjr/tjr-tools';

// Conservative trading (lower risk, higher threshold)
const conservativeResult = analyze(input, {
  execution: CONSERVATIVE_CONFIG,
  bars1m: bars1m,
});

// Aggressive trading (higher risk, lower threshold)
const aggressiveResult = analyze(input, {
  execution: AGGRESSIVE_CONFIG,
  bars1m: bars1m,
});
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

## Execution Configuration

### Default Configuration

```typescript
{
  confirmation5m: {
    minConfluenceScore: 70,
    requiredFactors: ['Fair Value Gaps', 'Order Blocks'],
    lookbackBars: 20
  },
  entry1m: {
    minConfluenceScore: 60,
    maxBarsAfterConfirmation: 5,
    requireZoneEntry: true
  },
  risk: {
    maxRiskPerTrade: 0.01,     // 1% risk per trade
    defaultStopPercent: 0.015,  // 1.5% stop loss
    defaultRiskReward: 2.0      // 1:2 risk-reward ratio
  },
  dryRun: false
}
```

### Configuration Options

| Parameter                           | Description                             | Default                             |
| ----------------------------------- | --------------------------------------- | ----------------------------------- |
| `confirmation5m.minConfluenceScore` | Minimum score for 5m confirmation       | 70                                  |
| `confirmation5m.requiredFactors`    | Factors that must be present            | ['Fair Value Gaps', 'Order Blocks'] |
| `confirmation5m.lookbackBars`       | Bars to look back for confirmation      | 20                                  |
| `entry1m.minConfluenceScore`        | Minimum score for 1m entry              | 60                                  |
| `entry1m.maxBarsAfterConfirmation`  | Max bars between confirmation and entry | 5                                   |
| `entry1m.requireZoneEntry`          | Entry must be within FVG/Order Block    | true                                |
| `risk.maxRiskPerTrade`              | Maximum risk as fraction of account     | 0.01                                |
| `risk.accountSize`                  | Account size for position sizing        | optional                            |
| `risk.defaultStopPercent`           | Default stop loss percentage            | 0.015                               |
| `risk.defaultRiskReward`            | Target risk-reward ratio                | 2.0                                 |
| `dryRun`                            | Test mode without generating execution  | false                               |

## Features

### Confluence Detection

- ✅ Fair Value Gap detection (bullish & bearish)
- ✅ Order Block detection (demand & supply)
- ✅ Weighted confluence scoring
- ✅ Zone overlap analysis
- ✅ Recency-based prioritization

### Trade Execution

- ✅ Two-stage execution (5m confirmation + 1m entry)
- ✅ Multi-timeframe analysis support
- ✅ Zone-based stop loss placement
- ✅ Structure-based stop loss (swing highs/lows)
- ✅ Risk-based position sizing
- ✅ Confidence level calculation
- ✅ Configuration presets (conservative/default/aggressive)

### Technical

- ✅ Pure functions (no side effects)
- ✅ Fully typed with TypeScript
- ✅ Deterministic results
- ✅ Comprehensive JSDoc documentation
- ✅ No runtime dependencies

## License

UNLICENSED - Internal use only
