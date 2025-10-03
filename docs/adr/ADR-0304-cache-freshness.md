# ADR-0304: Cache Freshness, Corrections, and Events

**Status:** Accepted
**Date:** 2025-09-30
**Authors:** TJR Suite Team
**Related ADRs:** ADR-0204 (Bars Cache)

## Context

The bars-cache package (ADR-0204) provides a two-tier caching system for market data. While it handles basic storage and retrieval, it lacks mechanisms for:

1. **Determining data freshness**: When should cached data be refreshed from providers?
2. **Tracking corrections**: How do we handle late revisions from data providers?
3. **Notifying consumers**: How do downstream systems learn about data corrections?
4. **Provider priority**: How do we resolve conflicts when multiple providers have data for the same bar?

These capabilities are critical for production use where:

- Real-time trading needs fresh data
- Late corrections from exchanges affect historical analysis
- Multiple data providers may have conflicting information
- Audit trails must track data quality issues

## Decision

We extend `@tjr/bars-cache` with three new modules:

### 1. Freshness Policies (`freshness.ts`)

Implement TTL (time-to-live) policies per timeframe:

```typescript
interface FreshnessPolicy {
  timeframe: Timeframe;
  ttlMs: number;
}

const DEFAULT_FRESHNESS_POLICIES: FreshnessPolicy[] = [
  { timeframe: '1m', ttlMs: 5 * 60 * 1000 }, // 5 minutes
  { timeframe: '5m', ttlMs: 15 * 60 * 1000 }, // 15 minutes
  { timeframe: '1h', ttlMs: 2 * 60 * 60 * 1000 }, // 2 hours
  { timeframe: '1D', ttlMs: 24 * 60 * 60 * 1000 }, // 24 hours
];

function isStale(bar: CachedBar, timeframe: Timeframe): boolean;
function getStaleBars(bars: CachedBar[], timeframe: Timeframe): CachedBar[];
```

**Design rationale:**

- Different timeframes have different staleness characteristics
- 1-minute bars become stale quickly (5 min TTL)
- Daily bars rarely change after market close (24 hour TTL)
- Historical data (>7 days old) is always considered fresh
- Policies are configurable for different use cases (backtesting vs. live trading)

### 2. Event Bus for Corrections (`events.ts`)

Implement pub-sub pattern for correction events:

```typescript
interface CorrectionEvent {
  symbol: string;
  timeframe: Timeframe;
  timestamp: number;
  oldBar: CachedBar | null;
  newBar: CachedBar;
  correctionType: 'revision' | 'provider_override' | 'initial';
  detectedAt: number;
}

class EventBus {
  on(eventType: 'correction', listener: (event: CorrectionEvent) => void): () => void;
  emit(eventType: 'correction', event: CorrectionEvent): void;
  off(eventType: 'correction', listener: (event: CorrectionEvent) => void): void;
}
```

**Design rationale:**

- Synchronous event emission for simplicity
- Errors in listeners don't disrupt other listeners
- Support unsubscribe via returned function
- Include both old and new bar data for comparison
- Three correction types:
  - `revision`: Higher revision from same provider
  - `provider_override`: Different provider with higher priority
  - `initial`: First time seeing this bar

### 3. Revision-Aware Upserts (extend `service.ts`)

Add deterministic merge logic to `MarketDataCacheService`:

```typescript
class MarketDataCacheService {
  async upsertBars(
    symbol: string,
    timeframe: Timeframe,
    bars: CachedBar[]
  ): Promise<CorrectionEvent[]>;

  getEventBus(): EventBus;
}
```

**Merge rules (in order):**

1. If no existing bar → new bar wins
2. If providers differ → higher priority provider wins (based on `providerPriority` array)
3. If same provider → higher revision wins
4. Otherwise → keep existing bar

**Design rationale:**

- Provider priority overrides revision numbers (data quality > recency)
- Same-provider revisions are monotonic (no downgrades)
- Emit correction event only when bar actually changes
- Return correction events from `upsertBars()` for immediate access
- Backward compatible: existing `storeBars()` method remains (marked deprecated)

### 4. CLI Command (`cache-verify`)

Add operational tool in `@tjr-suite/dev-scripts`:

```bash
cache-verify --symbol ES --timeframe 1m --window 200 [--pretty]
```

**Output includes:**

- Total bars in cache
- Fresh vs. stale bar counts
- Correction events with before/after data
- Revision distribution
- Provider distribution

**Design rationale:**

- Read-only operation (safe to run in production)
- Supports debugging data quality issues
- Exit codes: 0=healthy, 1=warnings, 2=errors
- JSON output for scripting, `--pretty` for humans

## Implementation Details

### Freshness Policy Selection

```typescript
export function getTTL(
  timeframe: Timeframe,
  policies: FreshnessPolicy[] = DEFAULT_FRESHNESS_POLICIES
): number {
  const policy = policies.find((p) => p.timeframe === timeframe);
  return policy?.ttlMs ?? DEFAULT_TTL_MS; // 10 minutes fallback
}
```

- Policies are looked up by exact timeframe match
- Unknown timeframes get conservative default (10 minutes)
- Historical data (>7 days old) is always fresh

### Correction Detection

```typescript
private selectWinningBar(
  existingBar: CachedBar | null,
  newBar: CachedBar
): CachedBar {
  if (!existingBar) return newBar;

  // Same provider: higher revision wins
  if (existingBar.provider === newBar.provider) {
    return newBar.revision > existingBar.revision ? newBar : existingBar;
  }

  // Different providers: use priority
  const existingPriority = this.getProviderPriority(existingBar.provider);
  const newPriority = this.getProviderPriority(newBar.provider);
  return newPriority < existingPriority ? newBar : existingBar;
}
```

- Deterministic: same inputs always produce same output
- Priority-based for multi-provider scenarios
- Revision-based for single-provider corrections

### Event Emission Timing

Corrections are emitted:

1. **After** merge logic determines winner
2. **Only if** new bar wins
3. **Only if** bar data actually changed (not just metadata)

This prevents spurious events when re-inserting identical data.

## Consequences

### Positive

1. **Data quality visibility**: Correction events surface provider reliability issues
2. **Freshness control**: TTL policies prevent using stale data in live trading
3. **Deterministic merges**: Same data arriving in different orders produces same final state
4. **Audit trail**: All corrections are tracked and can be logged
5. **Backward compatible**: Existing code continues to work (uses deprecated `storeBars()`)
6. **Operational tooling**: `cache-verify` helps debug production issues

### Negative

1. **Added complexity**: Service layer now has merge logic and event bus
2. **Performance overhead**: `upsertBars()` queries existing bar before insert
3. **Event bus overhead**: All listeners invoked synchronously on upsert
4. **Migration required**: New code should use `upsertBars()` instead of `storeBars()`

### Neutral

1. **Optional features**: Event bus is optional (can be null)
2. **Configurable policies**: Freshness TTLs can be customized per deployment
3. **No breaking changes**: Existing tests and code continue to work

## Testing Strategy

### Unit Tests (`freshness-and-events.test.ts`)

1. **Freshness detection:**
   - Stale bars based on TTL
   - Historical bars always fresh
   - Custom policies
   - Stale timestamp calculation

2. **Event bus:**
   - Emit and receive events
   - Multiple listeners
   - Unsubscribe
   - Error handling

3. **Revision upserts:**
   - Initial insert (no event)
   - Revision update (correction event)
   - Provider override (correction event)
   - Out-of-order arrivals
   - Multiple corrections in sequence

4. **Integration tests:**
   - Late correction scenarios
   - Multi-provider, multi-revision flows
   - Staleness combined with corrections

### Existing Tests

All existing tests (`bars-cache.test.ts`) continue to pass, demonstrating backward compatibility.

## Alternatives Considered

### Alternative 1: Separate Correction Store

**Approach:** Store corrections in a separate table/store rather than emitting events.

**Rejected because:**

- Requires additional storage
- Polling needed to discover new corrections
- Doesn't support real-time notification
- More complex to query historical corrections

### Alternative 2: Always Emit Events

**Approach:** Emit events even when bar data doesn't change.

**Rejected because:**

- Generates noise for downstream consumers
- Wastes resources invoking listeners
- Harder to distinguish real corrections from no-ops

### Alternative 3: Async Event Bus

**Approach:** Use async/await for event emission and listener invocation.

**Rejected because:**

- Adds complexity without clear benefit
- Synchronous is sufficient for in-process events
- Can add async later if needed (breaking change)

### Alternative 4: Revision-Based TTL

**Approach:** Longer TTL for higher revisions (assume more stable).

**Rejected because:**

- Revision semantics vary by provider
- Doesn't account for timeframe differences
- Overly complex heuristic

## Migration Path

### For Existing Code

1. **No action required:** Existing code using `storeBars()` continues to work
2. **Optional migration:** Switch to `upsertBars()` for correction tracking
3. **Event subscription:** Add listeners if correction events are needed

### For New Code

1. Use `upsertBars()` instead of `storeBars()`
2. Subscribe to EventBus if correction notifications needed
3. Use `getStaleBars()` to identify bars needing refresh

### Example Migration

**Before:**

```typescript
await service.storeBars('AAPL', '5m', bars);
```

**After:**

```typescript
const corrections = await service.upsertBars('AAPL', '5m', bars);
if (corrections.length > 0) {
  logger.warn(`${corrections.length} corrections detected`, { corrections });
}
```

## Related Work

- **ADR-0204 (Bars Cache):** Original cache design
- **Issue #23:** Initial bars-cache implementation
- **Issue #33:** This ADR (freshness and corrections)

## Future Enhancements

1. **Async event bus:** Support for async listeners
2. **Correction history:** Store corrections for audit trail
3. **Staleness metrics:** Track cache hit rate by freshness
4. **Auto-refresh:** Automatically fetch stale bars
5. **Provider health:** Track correction rates by provider
6. **Custom merge logic:** Pluggable merge strategies

## References

- [SQLite UPSERT](https://www.sqlite.org/lang_upsert.html)
- [EventEmitter pattern](https://nodejs.org/api/events.html)
- [TTL best practices](https://aws.amazon.com/blogs/database/simplify-amazon-dynamodb-data-extraction-and-archival-using-time-to-live-ttl/)
