# @tjr/tjr-tools

TJR analysis tools with confluence detection and trade execution planning.

## Installation

This package is part of the TJR Suite monorepo and is not published to npm.

```bash
# From monorepo root
pnpm install
```

## API Reference

### `analyze(input: TJRAnalysisInput, config?: TJRConfig): TJRResult`

Main analysis function that processes market data and generates confluence scores.

#### Parameters

- `input`: Market data and analysis parameters
  - `symbol`: Trading symbol (e.g., 'SPY')
  - `timeframe`: Analysis timeframe from @tjr/contracts
  - `bars`: Array of market bars (OHLCV data)
  - `analysisTimestamp`: ISO 8601 timestamp of analysis

- `config`: Optional configuration overrides
  - `confluenceThreshold`: Minimum score for execution (default: 75)
  - `maxRisk`: Maximum risk per trade fraction (default: 0.01)
  - `enableFVG`: Enable Fair Value Gap detection (default: true)
  - `enableOrderBlock`: Enable Order Block detection (default: true)
  - And more...

#### Returns

`TJRResult` object containing:
- `input`: Original input data (for audit trail)
- `confluence`: Confluence score and factor breakdown
- `execution`: Optional trade execution parameters
- `warnings`: Data quality or analysis warnings
- `metadata`: Analysis version and timing information

## Usage Examples

### Basic Analysis

```typescript
import { analyze } from '@tjr/tjr-tools';
import { Timeframe } from '@tjr/contracts';

const result = analyze({
  symbol: 'SPY',
  timeframe: Timeframe.M5,
  bars: marketBars,
  analysisTimestamp: new Date().toISOString()
});

console.log(`Confluence score: ${result.confluence.score}`);
```

### With Custom Configuration

```typescript
import { analyze } from '@tjr/tjr-tools';
import type { TJRConfig } from '@tjr/tjr-tools';

const config: TJRConfig = {
  confluenceThreshold: 80,
  maxRisk: 0.02,
  enableVolumeProfile: false
};

const result = analyze(input, config);
```

## Confluence Factors

The analysis considers multiple confluence factors:

1. **Fair Value Gap (FVG)** - Price inefficiencies in market structure
2. **Order Blocks** - Institutional supply/demand zones
3. **Trend Alignment** - Direction and strength of prevailing trend
4. **Support/Resistance** - Key price levels
5. **Volume Profile** - Volume distribution analysis

Each factor contributes a weighted score to the overall confluence.

## Current Limitations

This is a skeleton implementation (v0.1.0) with the following limitations:

- Confluence detection returns stub values (always 0)
- No execution parameters are generated
- Full implementation pending in Issue #28

## Development

```bash
# Build the package
pnpm --filter @tjr/tjr-tools build

# Run tests
pnpm --filter @tjr/tjr-tools test

# Watch mode for development
pnpm --filter @tjr/tjr-tools test:watch
```

## Dependencies

- `@tjr/contracts`: Type definitions and DTOs
- TypeScript 5.3+
- Node.js 20+

## Future Work

- [ ] Implement FVG detection algorithm (Issue #28)
- [ ] Implement Order Block detection (Issue #28)
- [ ] Add trend analysis
- [ ] Add support/resistance detection
- [ ] Add volume profile analysis
- [ ] Generate execution parameters when confluence threshold met

## License

UNLICENSED - Private package