# ADR-0302: Databento Provider with Large-Window Chunking

**Status:** Accepted
**Date:** 2025-09-30
**Deciders:** Architecture Team
**Phase:** 3
**Shard:** B3d

---

## Context

The TJR Suite requires a market data provider implementation for Databento that can:

- Fetch historical bar data for multiple asset classes
- Handle large window requests (500+ days) without timeouts
- Integrate with market-data-core for aggregation
- Work in CI environments without network calls (fixture-based)

Without a Databento provider, the suite cannot:

- Access Databento's extensive historical data
- Backtest strategies over multi-year periods
- Test chunking logic for large window requests

---

## Decision

### 1. **Provider Architecture**

Create `@tjr/provider-databento` package with:

- `getBars(options)` - Fetch bars with chunking support
- `capabilities()` - Return provider metadata
- `aggregateToTimeframe(bars, timeframe)` - Aggregate bars via market-data-core

**Package structure:**

```
packages/provider-databento/
├── src/
│   ├── databento.ts       # Core implementation
│   ├── types.ts          # Type definitions
│   └── index.ts          # Public API
├── tests/
│   └── databento.test.js # Comprehensive tests
└── package.json
```

### 2. **Large-Window Chunking**

Implement intelligent chunking to handle requests > maxDaysPerChunk:

**Algorithm:**

```typescript
function calculateChunks(from: number, to: number, maxDaysPerChunk: number) {
  const totalMs = to - from;
  const chunkMs = maxDaysPerChunk * 24 * 60 * 60 * 1000;

  if (totalMs <= chunkMs) return [{ from, to }];

  // Split into contiguous chunks
  const chunks = [];
  let chunkStart = from;
  while (chunkStart < to) {
    const chunkEnd = Math.min(chunkStart + chunkMs, to);
    chunks.push({ from: chunkStart, to: chunkEnd });
    chunkStart = chunkEnd;
  }
  return chunks;
}
```

**Rationale:**

- **Avoids timeouts:** Large requests split into manageable chunks
- **Contiguous:** Chunks cover entire range without gaps
- **Configurable:** `maxDaysPerChunk` tunable per use case
- **Transparent:** Metadata reports chunks used

### 3. **Fixture-Based Implementation (Phase 3.B3d)**

For Phase 3.B3d, use synthetic fixture data instead of real API calls:

**Rationale:**

- **CI-safe:** No network calls, deterministic tests
- **Fast iteration:** No API rate limits or costs during development
- **Deterministic:** Same inputs produce predictable outputs

**Future migration:**

- Phase 4: Replace `fetchChunk()` with real Databento API calls
- Keep chunking logic unchanged
- Add API key management and error handling

### 4. **Integration with market-data-core**

Use market-data-core's `aggregateBars()` for timeframe conversion:

```typescript
export function aggregateToTimeframe(bars: Bar[], targetTimeframe: Timeframe): Bar[] {
  return aggregateBars(bars, targetTimeframe);
}
```

**Rationale:**

- **DRY:** Reuse existing aggregation logic
- **Tested:** market-data-core has comprehensive tests
- **Consistent:** All providers use same aggregation

### 5. **Error Handling**

Strict error mapping for invalid inputs:

- Invalid time range (from >= to): Throw immediately
- Unknown timeframe: TypeScript catches at compile time
- API errors (future): Map to standard error codes

---

## Consequences

### Positive

- **Handles large windows:** 500+ day requests work without timeouts
- **CI-safe:** Fixtures enable deterministic testing
- **Extensible:** Easy to add real API calls in Phase 4
- **Reuses market-data-core:** Aggregation logic shared
- **Well-tested:** 20+ test cases cover chunking, capabilities, errors

### Negative

- **Fixture-only in Phase 3.B3d:** No real Databento integration yet
- **Synthetic data:** Tests use Math.random() (not fully deterministic)
- **No caching:** Each request fetches data (future optimization)

### Mitigations

- **Phase 4 migration:** Replace fetchChunk() with real API
- **Deterministic fixtures:** Future: Use pre-generated JSON fixtures
- **Caching layer:** Future ADR for caching strategy

---

## Alternatives Considered

### Alternative 1: No Chunking (Single Request)

**Description:** Fetch entire window in one request.

**Rejected because:**

- Databento API likely has size limits
- Large requests prone to timeouts
- Wastes bandwidth if only subset needed

### Alternative 2: Client-Side Chunking by Caller

**Description:** Make caller responsible for chunking logic.

**Rejected because:**

- Duplicates logic across consumers
- Error-prone (easy to miss edge cases)
- Less convenient API

### Alternative 3: Real API Calls in Phase 3

**Description:** Implement Databento API integration immediately.

**Rejected for Phase 3 because:**

- Requires API keys and credentials
- Network calls slow down CI
- Non-deterministic (API changes affect tests)
- Harder to test edge cases

---

## References

- Issue: #31 [P3][B3d] Provider: Databento
- Implementation: `packages/provider-databento/`
- Related ADRs:
  - ADR-0055: Market Data Core (Bar, Timeframe types)
  - ADR-0203: Composite Provider Selection
  - ADR-0400: Caching Strategy (future)

---

## Acceptance Criteria

- [x] `@tjr/provider-databento` package created
- [x] `getBars()` with chunking for large windows
- [x] `capabilities()` returns provider metadata
- [x] `aggregateToTimeframe()` uses market-data-core
- [x] Chunking logic tested (single/multiple chunks, edge cases)
- [x] Chunk boundary invariants verified
- [x] Capabilities snapshot tested
- [x] Deterministic results (fixture-based)
- [x] No network calls in CI
- [ ] Integration with dev-scripts check:bars (future)

---

## Decision Outcome

**Accepted** - Databento provider with large-window chunking approved for Phase 3.B3d.

This establishes the foundation for multi-provider support. Future phases will:

- Replace fixtures with real Databento API calls
- Add caching layer for performance
- Implement rate limiting and retry logic
- Add authentication and key management
