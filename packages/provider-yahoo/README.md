# @tjr/provider-yahoo

Yahoo Finance data provider adapter for TJR Suite.

## Overview

Provides historical market data from Yahoo Finance for backtesting and analysis. Current implementation uses golden fixtures for deterministic testing (no HTTP calls yet).

## Installation

```bash
# Within tjr-suite monorepo
pnpm install
```

## Quick Start

```typescript
import { YahooProvider } from '@tjr/provider-yahoo';
import { Timeframe } from '@tjr/contracts';

const provider = new YahooProvider();

// Fetch 1-minute bars
const bars = await provider.getBars({
  symbol: 'ES',
  timeframe: Timeframe.M1,
  from: '2024-01-15T14:30:00.000Z',
  to: '2024-01-15T16:00:00.000Z',
});

// Fetch aggregated 10-minute bars (aggregated from 1m)
const bars10m = await provider.getBars({
  symbol: 'ES',
  timeframe: Timeframe.M10,
  from: '2024-01-15T14:30:00.000Z',
  to: '2024-01-15T16:00:00.000Z',
});

// Get provider capabilities
const caps = provider.capabilities();
console.log(caps.supportedTimeframes); // ['1m', '5m', '10m', '1h', '4h', '1D']
```

## Supported Timeframes

**Native** (from fixtures):

- 1m, 5m, 1h, 1D

**Aggregated** (via @tjr-suite/market-data-core):

- 10m (from 1m)
- 4h (from 1h)

## Current Limitations

⚠️ **Fixture-based testing only** - No real HTTP calls to Yahoo Finance API yet

- Uses golden fixtures in `__fixtures__/` directory
- Deterministic outputs for testing
- No network calls, no rate limits
- Real HTTP implementation planned for Phase 2.B3b

## API

### `YahooProvider.getBars(params: GetBarsParams): Promise<MarketBar[]>`

Fetch historical market bars.

**Parameters:**

- `symbol` - Symbol to fetch (e.g., 'ES', 'SPY')
- `timeframe` - Bar timeframe (1m, 5m, 10m, 1h, 4h, 1D)
- `from?` - Start timestamp (ISO 8601)
- `to?` - End timestamp (ISO 8601)
- `limit?` - Maximum number of bars to return

**Returns:** Array of MarketBar objects

**Throws:** Error if params invalid or data unavailable

### `YahooProvider.capabilities(): ProviderCapabilities`

Get provider metadata and capabilities.

**Returns:** Provider capabilities descriptor

## Dependencies

- `@tjr/contracts` - Market data type definitions
- `@tjr-suite/market-data-core` - Bar aggregation utilities

## Documentation

- **Architecture**: [ADR-0201](../../docs/adr/ADR-0201-provider-yahoo.md)
- **Implementation**: [Journal 2.B3a](../../docs/journal/_fragments/2/2.B3a-provider-yahoo.md)

## Testing

```bash
# Run tests
pnpm --filter @tjr/provider-yahoo test

# Build package
pnpm --filter @tjr/provider-yahoo build

# Type check
pnpm --filter @tjr/provider-yahoo typecheck
```

## License

UNLICENSED - Internal use only
