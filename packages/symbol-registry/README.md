# @tjr/symbol-registry

Canonical symbol registry with continuous futures mapping and rollover rules for the TJR Suite trading platform.

## Features

- **Symbol Normalization**: Convert vendor-specific symbol formats to canonical representation
- **Continuous Futures Resolution**: Map continuous symbols (e.g., `ES`, `NQ`) to specific contract codes
- **Rollover Rules**: Configurable rollover logic based on volume, open interest, or fixed days
- **Vendor Aliases**: Support for Yahoo Finance, IQFeed, TradingView, and other data providers
- **Type Safety**: Full TypeScript support with strongly-typed APIs

## Installation

```bash
pnpm add @tjr/symbol-registry
```

## Quick Start

```typescript
import { normalizeSymbol, resolveContinuous, resolveAlias } from '@tjr/symbol-registry';

// Normalize vendor-specific symbols
const normalized = normalizeSymbol('ES=F');
console.log(normalized.canonical); // → 'ES'
console.log(normalized.type); // → 'continuous-future'

// Resolve continuous futures to specific contracts
const contract = resolveContinuous('ES', new Date('2025-01-15'));
console.log(contract); // → 'ESH25' (March 2025 contract)

// Handle vendor aliases
const canonical = resolveAlias('@ES');
console.log(canonical); // → 'ES'
```

## API Reference

### Symbol Normalization

#### `normalizeSymbol(raw: string): NormalizedSymbol`

Normalize a raw symbol string to canonical format.

**Parameters:**

- `raw` - Raw symbol string (may be vendor-specific)

**Returns:** Object with:

- `canonical` - Canonical symbol representation
- `type` - Symbol type (`'stock'`, `'continuous-future'`, `'future-contract'`, or `'unknown'`)
- `root?` - Futures root if applicable
- `contractMonth?` - Contract month code if applicable

**Examples:**

```typescript
normalizeSymbol('ES=F'); // → { canonical: 'ES', type: 'continuous-future', root: 'ES' }
normalizeSymbol('ESH25'); // → { canonical: 'ESH25', type: 'future-contract', root: 'ES', contractMonth: 'H25' }
normalizeSymbol('AAPL'); // → { canonical: 'AAPL', type: 'stock' }
normalizeSymbol('ESH2025'); // → { canonical: 'ESH25', type: 'future-contract', root: 'ES', contractMonth: 'H25' }
```

#### `extractFuturesRoot(symbol: string): FuturesRoot | null`

Extract futures root from a contract code or continuous symbol.

```typescript
extractFuturesRoot('ESH25'); // → 'ES'
extractFuturesRoot('ES'); // → 'ES'
extractFuturesRoot('AAPL'); // → null
```

#### `isValidContractMonth(contractMonth: string): boolean`

Check if a string is a valid futures month code.

```typescript
isValidContractMonth('H25'); // → true
isValidContractMonth('X25'); // → false
```

### Continuous Futures Resolution

#### `resolveContinuous(root: FuturesRoot, date: Date): ContractCode`

Resolve a continuous futures symbol to a specific contract code based on rollover rules.

**Parameters:**

- `root` - Futures root symbol (e.g., `'ES'`, `'NQ'`)
- `date` - Reference date for resolution

**Returns:** Contract code (e.g., `'ESH25'`)

**Examples:**

```typescript
// Resolve ES front month on Jan 15, 2025
resolveContinuous('ES', new Date('2025-01-15')); // → 'ESH25' (March contract)

// After rollover date
resolveContinuous('ES', new Date('2025-03-10')); // → 'ESM25' (June contract)
```

#### `getFrontMonth(root: FuturesRoot, date?: Date): ContractCode`

Get the front month contract for a given date (defaults to current date).

```typescript
getFrontMonth('ES', new Date('2025-01-15')); // → 'ESH25'
getFrontMonth('ES'); // → Current front month
```

### Symbol Aliases

#### `resolveAlias(raw: string): CanonicalSymbol | null`

Resolve a vendor-specific symbol to its canonical form.

**Supported Formats:**

| Vendor Format | Canonical | Vendor             |
| ------------- | --------- | ------------------ |
| `ES=F`        | `ES`      | Yahoo Finance      |
| `@ES`         | `ES`      | IQFeed             |
| `/ES`         | `ES`      | TradingView        |
| `ESH2025`     | `ESH25`   | CME (4-digit year) |

```typescript
resolveAlias('ES=F'); // → 'ES' (Yahoo)
resolveAlias('@ES'); // → 'ES' (IQFeed)
resolveAlias('/ES'); // → 'ES' (TradingView)
resolveAlias('ES'); // → 'ES' (pass-through)
```

#### `registerAlias(vendorSymbol: string, canonical: CanonicalSymbol): void`

Register a custom alias mapping.

```typescript
registerAlias('SPX.XO', 'SPX');
resolveAlias('SPX.XO'); // → 'SPX'
```

## Rollover Rules

Rollover behavior is defined in `data/rollover-rules.json`. Each symbol can have its own rollover policy.

### Configuration Format

```json
{
  "ES": {
    "type": "fixed-days",
    "daysBeforeExpiration": 5,
    "expirationDay": "third-friday"
  },
  "VX": {
    "type": "fixed-days",
    "daysBeforeExpiration": 8,
    "expirationDay": "wednesday-before-third-friday"
  }
}
```

### Rollover Types

- **`fixed-days`**: Roll over N days before expiration (default: 5 days)
- **`volume`**: Roll over when new contract volume exceeds threshold (fallback to fixed-days if volume data unavailable)

### Expiration Day Specifications

- **`third-friday`**: Third Friday of the contract month (standard for equity index futures)
- **`wednesday-before-third-friday`**: Wednesday before third Friday (VIX futures)

## Supported Futures Roots

**Equity Indices:**

- `ES` - E-mini S&P 500
- `NQ` - E-mini NASDAQ 100
- `YM` - E-mini Dow
- `RTY` - E-mini Russell 2000

**Commodities:**

- `GC` - Gold
- `SI` - Silver
- `CL` - Crude Oil

**Treasuries:**

- `ZB` - 30-Year T-Bond
- `ZN` - 10-Year T-Note

**Volatility:**

- `VX` - VIX Futures

## Limitations

### Volume-Based Rollover

The current implementation uses **fixed-days** rollover as a fallback for volume-based rules, since real-time volume data is not yet integrated. This provides deterministic backtesting while the volume-based logic awaits market data integration.

### Expiration Date Calculation

The system uses simplified expiration rules and does not account for:

- Exchange holidays
- Early closures
- Special settlement dates

For production use, verify expiration dates against exchange calendars.

### Supported Contract Months

Currently assumes **quarterly contracts** (H, M, U, Z) for index futures. Monthly contracts (all 12 months) are not yet fully supported.

## Development

```bash
# Build
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Clean build artifacts
pnpm clean
```

## Architecture Decision Record

See [ADR-0056: Symbol Registry & Continuous Mapping](../../docs/adr/ADR-0056-symbol-registry.md) for design rationale and alternatives considered.

## License

UNLICENSED - Internal use only for TJR Suite.
