# ADR-0052: Contracts Package and Error Taxonomy

**Status:** Accepted
**Date:** 2025-09-29
**Context:** Phase 51 - TJR Suite Monorepo Foundation

## Context and Problem Statement

The TJR Suite monorepo requires shared type definitions, DTOs, and error classes that will be consumed across multiple packages (providers, backtesting engine, TJR analysis logic). Without a centralized contracts package, we risk:

- Type duplication and drift across packages
- Inconsistent error handling patterns
- Tight coupling between packages
- Circular dependency issues
- Unclear API boundaries

How should we organize and maintain shared contracts for maximum reusability and stability?

## Decision Drivers

- **Type Safety**: Strong TypeScript guarantees across package boundaries
- **Versioning**: Clear semver contract changes for consumers
- **Zero Dependencies**: No runtime or external dependencies to minimize coupling
- **Documentation**: Self-documenting types via comprehensive JSDoc
- **Error Handling**: Structured, serializable errors with rich context
- **Performance**: Zero I/O, pure data structures

## Considered Options

1. **Centralized @tjr/contracts package** (CHOSEN)
2. Each package defines its own types
3. Shared types in a `common` or `utils` package
4. Protocol Buffers or similar schema definition

## Decision Outcome

**Chosen option: Centralized @tjr/contracts package**

Create `packages/contracts/` as a standalone, dependency-free package exporting:

- Market data types (bars, symbols, timeframes)
- TJR analysis DTOs (input, confluence, execution, results)
- Structured error classes with rich context
- Enumerations and helper utilities

### Positive Consequences

- Single source of truth for types across the monorepo
- Clear API contracts enforced at compile time
- Easy to version and track breaking changes
- Minimal bundle impact (tree-shakeable, type-only in many cases)
- Testable in isolation

### Negative Consequences

- Requires discipline to avoid scope creep
- Breaking changes affect all consumers
- May require coordination for version bumps

## Package Structure

```
packages/contracts/
├── src/
│   ├── timeframes.ts    # Timeframe enum + helpers
│   ├── market.ts        # Market data DTOs
│   ├── tjr.ts          # TJR analysis DTOs
│   ├── errors.ts        # Error hierarchy
│   └── index.ts         # Barrel exports
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

## Type Design Decisions

### Timeframes (`src/timeframes.ts`)

**Enum Definition:**

```typescript
enum Timeframe {
  M1 = '1',
  M5 = '5',
  M10 = '10',
  H1 = '60',
  H4 = '240',
  D1 = '1D',
}
```

**Rationale:**

- Covers common intraday (M1, M5, M10) and swing (H1, H4, D1) timeframes
- String values match provider API conventions (minutes or 'D')
- Limited set prevents over-engineering for unused timeframes
- Helper functions for conversion, validation, and comparison

### Market Data (`src/market.ts`)

**Core Types:**

1. **`MarketBar`**: OHLCV + timestamp
   - Immutable data structure
   - Validated ranges (high >= low, close within range)
   - ISO 8601 timestamp strings

2. **`GetBarsParams`**: Standard query interface
   - `symbol: string`
   - `timeframe: Timeframe`
   - `from: string` (ISO timestamp)
   - `to?: string`
   - `limit?: number`

3. **`ProviderCapabilities`**: Feature flags per provider
   - `supportsTimeframes: Timeframe[]`
   - `maxBarsPerRequest: number`
   - `requiresAuthentication: boolean`
   - `rateLimits: { requestsPerMinute: number }`

4. **`Session`**: Trading session metadata
   - Pre-market, regular, post-market boundaries
   - Timezone handling

**Rationale:**

- Provider-agnostic abstractions
- Clear contracts for backtesting and live data
- Extensible without breaking changes (optional fields)

### TJR Analysis (`src/tjr.ts`)

**DTOs:**

1. **`TJRAnalysisInput`**:
   - `symbol: string`
   - `timeframe: Timeframe`
   - `bars: MarketBar[]`
   - `analysisTimestamp: string`

2. **`TJRConfluence`**:
   - `score: number` (0-100)
   - `factors: Array<{ name: string; weight: number; value: number }>`
   - Detailed confluence breakdown

3. **`TJRExecution`**:
   - `entryPrice: number`
   - `stopLoss: number`
   - `takeProfit: number`
   - `positionSize: number`
   - `direction: 'long' | 'short'`

4. **`TJRResult`**:
   - `input: TJRAnalysisInput`
   - `confluence: TJRConfluence`
   - `execution?: TJRExecution` (optional if no trade)
   - `warnings: string[]`

**Rationale:**

- Captures full TJR methodology flow
- Auditable (includes input snapshot)
- Serializable for storage and replay
- Warnings for partial/degraded analysis

### Error Hierarchy (`src/errors.ts`)

**Base Class:**

```typescript
class TJRError extends Error {
  code: string;
  data?: Record<string, unknown>;
  timestamp: string;
}
```

**Specialized Errors:**

1. **`ProviderRateLimitError extends TJRError`**
   - `code: 'PROVIDER_RATE_LIMIT'`
   - `data: { provider: string; retryAfter?: number }`

2. **`InsufficientBarsError extends TJRError`**
   - `code: 'INSUFFICIENT_BARS'`
   - `data: { required: number; received: number; symbol: string; timeframe: Timeframe }`

3. **`SymbolResolutionError extends TJRError`**
   - `code: 'SYMBOL_RESOLUTION'`
   - `data: { symbol: string; provider: string; suggestion?: string }`

**Rationale:**

- Machine-readable error codes
- Rich context for debugging and retry logic
- Serializable for logging and alerting
- Timestamp for correlation

## Versioning and Semver Policy

### Rules:

- **MAJOR** (X.0.0): Breaking changes to existing types
  - Removing fields
  - Changing field types incompatibly
  - Renaming exports

- **MINOR** (0.X.0): Backward-compatible additions
  - New optional fields
  - New types/enums
  - New helper functions

- **PATCH** (0.0.X): Non-code changes
  - JSDoc improvements
  - README updates
  - Internal refactoring preserving API

### Stability Guarantee:

Until 1.0.0, treat MINOR as potentially breaking. After 1.0.0, strict semver adherence required.

## Constraints and Non-Goals

### MUST NOT:

- ❌ Perform I/O (network, file system, database)
- ❌ Include external runtime dependencies
- ❌ Contain business logic (only data structures)
- ❌ Depend on other @tjr packages

### MUST:

- ✅ Pure TypeScript types and classes
- ✅ Comprehensive JSDoc on all exports
- ✅ Zero runtime overhead for type-only imports
- ✅ Tree-shakeable exports

## Testing Strategy

1. **Type-Level Tests**: Use `tsd` or TypeScript compiler tests
   - Assert type assignability
   - Catch breaking changes

2. **Runtime Tests**:
   - Error serialization (JSON.stringify/parse)
   - Timeframe helper functions
   - Validation utilities

3. **Documentation Tests**:
   - Example code in JSDoc must compile
   - README examples validated

## Cross-Package Usage Patterns

### Provider Package:

```typescript
import { MarketBar, GetBarsParams, ProviderRateLimitError } from '@tjr/contracts';

class AlpacaProvider {
  async getBars(params: GetBarsParams): Promise<MarketBar[]> {
    // Implementation
  }
}
```

### Backtesting Engine:

```typescript
import { TJRAnalysisInput, TJRResult, Timeframe } from '@tjr/contracts';

function backtest(results: TJRResult[]) {
  // Use typed results
}
```

### TJR Analysis:

```typescript
import { TJRConfluence, TJRExecution, InsufficientBarsError } from '@tjr/contracts';

function analyze(input: TJRAnalysisInput): TJRResult {
  if (input.bars.length < 50) {
    throw new InsufficientBarsError('Need 50+ bars', { required: 50, received: input.bars.length });
  }
  // Analysis logic
}
```

## Migration and Rollout

1. **Phase 51.A2**: Establish `@tjr/contracts` package
2. **Phase 51.A3+**: Providers consume contracts
3. **Phase 51.B+**: Backtesting and analysis consume contracts
4. **Post-1.0.0**: Stricter semver enforcement

## References

- [Semver Specification](https://semver.org/)
- [TypeScript Handbook: Modules](https://www.typescriptlang.org/docs/handbook/modules.html)
- TJR Trading Methodology (internal docs)

## Decision Log

- **2025-09-29**: Initial ADR approved for Phase 51.A2
