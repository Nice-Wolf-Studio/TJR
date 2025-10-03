# @tjr/contracts

Canonical types, DTOs, and error classes for the TJR trading system monorepo.

## Overview

`@tjr/contracts` provides a dependency-free, pure TypeScript package containing:

- **Timeframe enums** (M1, M5, M10, H1, H4, D1) and utilities
- **Market data types** (OHLCV bars, query parameters, provider capabilities)
- **TJR analysis DTOs** (inputs, confluence scoring, execution parameters, results)
- **Error taxonomy** (structured errors for rate limiting, data gaps, symbol resolution)

All types are heavily documented with JSDoc, including invariants and usage examples.

## Installation

```bash
pnpm add @tjr/contracts
```

## Usage

### Timeframes

```typescript
import { Timeframe, parseTimeframe, getAllTimeframes } from '@tjr/contracts';

// Use enum values
const tf = Timeframe.M5;

// Parse from string
const parsed = parseTimeframe('5'); // Timeframe.M5

// Get all supported timeframes
const all = getAllTimeframes(); // [Timeframe.M1, ..., Timeframe.D1]
```

### Market Data

```typescript
import type { MarketBar, GetBarsParams, ProviderCapabilities } from '@tjr/contracts';
import { Timeframe } from '@tjr/contracts';

// Query parameters
const params: GetBarsParams = {
  symbol: 'SPY',
  timeframe: Timeframe.M5,
  from: '2025-01-01T00:00:00.000Z',
  to: '2025-01-31T23:59:59.999Z',
  limit: 1000,
};

// OHLCV bars
const bar: MarketBar = {
  timestamp: '2025-01-15T14:30:00.000Z',
  open: 100.5,
  high: 101.25,
  low: 100.0,
  close: 101.0,
  volume: 1500000,
};

// Provider capabilities
const caps: ProviderCapabilities = {
  supportsTimeframes: [Timeframe.M1, Timeframe.M5, Timeframe.H1, Timeframe.D1],
  maxBarsPerRequest: 10000,
  requiresAuthentication: true,
  rateLimits: { requestsPerMinute: 200 },
};
```

### TJR Analysis

```typescript
import type { TJRAnalysisInput, TJRResult, TJRConfluence, TJRExecution } from '@tjr/contracts';
import { hasExecution } from '@tjr/contracts';

// Input for analysis
const input: TJRAnalysisInput = {
  symbol: 'SPY',
  timeframe: Timeframe.M5,
  bars: [
    /* array of MarketBar */
  ],
  analysisTimestamp: new Date().toISOString(),
};

// Confluence scoring
const confluence: TJRConfluence = {
  score: 85,
  factors: [
    { name: 'Support/Resistance', weight: 0.3, value: 0.9 },
    { name: 'Trend Alignment', weight: 0.25, value: 0.8 },
    // ... more factors
  ],
};

// Execution parameters
const execution: TJRExecution = {
  entryPrice: 100.5,
  stopLoss: 99.0,
  takeProfit: 103.5,
  positionSize: 100,
  direction: 'long',
  riskRewardRatio: 2.0,
  confidence: 'high',
};

// Complete result
const result: TJRResult = {
  input,
  confluence,
  execution,
  warnings: [],
};

// Type-safe execution check
if (hasExecution(result)) {
  console.log(`Entry at ${result.execution.entryPrice}`);
}
```

### Error Handling

```typescript
import {
  TJRError,
  ProviderRateLimitError,
  InsufficientBarsError,
  SymbolResolutionError,
  isProviderRateLimitError,
  isInsufficientBarsError,
} from '@tjr/contracts';

try {
  // Provider call that may fail
  const bars = await provider.getBars(params);

  if (bars.length < 50) {
    throw new InsufficientBarsError('Need at least 50 bars for TJR analysis', {
      required: 50,
      received: bars.length,
      symbol: 'SPY',
      timeframe: Timeframe.M5,
    });
  }
} catch (err) {
  if (isProviderRateLimitError(err)) {
    // Retry with backoff
    const retryAfter = err.data?.retryAfter ?? 60;
    console.log(`Rate limited, retry after ${retryAfter}s`);
  } else if (isInsufficientBarsError(err)) {
    // Handle data gap
    console.error(`Only got ${err.data?.received}/${err.data?.required} bars`);
  }
}
```

## Design Principles

- ✅ **Zero dependencies**: No runtime or external dependencies
- ✅ **No I/O**: Pure data structures only
- ✅ **Tree-shakeable**: Use only what you need
- ✅ **Type-safe**: Full TypeScript coverage with strict mode
- ✅ **Well-documented**: Comprehensive JSDoc with invariants and examples
- ✅ **Serializable**: All types are JSON-compatible

## Versioning

This package follows semantic versioning:

- **MAJOR**: Breaking changes to existing types (field removal, type changes, renames)
- **MINOR**: Backward-compatible additions (new optional fields, new types)
- **PATCH**: Non-code changes (docs, internal refactoring)

Until 1.0.0, MINOR versions may include breaking changes.

## Architecture

See [ADR-0052: Contracts Package and Error Taxonomy](../../docs/adr/ADR-0052-contracts-and-errors.md) for architectural decisions.

## Contributing

This is a private monorepo package. All changes must:

1. Maintain backward compatibility (or bump MAJOR version)
2. Include comprehensive JSDoc
3. Add tests for new functionality
4. Update this README with examples

## License

UNLICENSED - Private package for TJR trading system.
