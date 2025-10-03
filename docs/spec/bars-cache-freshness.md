# Specification: Bars Cache Freshness and Corrections

**Version:** 1.0
**Date:** 2025-09-30
**Status:** Active
**Related:** ADR-0304, Issue #33

## Overview

This specification defines the behavior of cache freshness detection, correction tracking, and event emission for the `@tjr/bars-cache` package. It covers:

1. TTL policies for determining data staleness
2. Revision-aware upsert semantics
3. Correction event emission
4. Provider priority resolution
5. CLI verification tools

## 1. Freshness Policies

### 1.1 TTL Definition

Each timeframe has a Time-To-Live (TTL) that defines how long cached data remains fresh.

**Default TTL Policies:**

| Timeframe | TTL        | Rationale                              |
| --------- | ---------- | -------------------------------------- |
| 1m        | 5 minutes  | High-frequency bars update quickly     |
| 5m        | 15 minutes | Medium-frequency bars                  |
| 10m       | 20 minutes | Medium-frequency bars                  |
| 15m       | 30 minutes | Medium-frequency bars                  |
| 30m       | 1 hour     | Low-frequency bars                     |
| 1h        | 2 hours    | Hourly bars rarely corrected           |
| 2h        | 4 hours    | Multi-hour bars                        |
| 4h        | 6 hours    | Multi-hour bars                        |
| 1D        | 24 hours   | Daily bars finalize after market close |
| Unknown   | 10 minutes | Conservative default                   |

### 1.2 Staleness Detection

A cached bar is considered **stale** if:

```typescript
function isStale(bar: CachedBar, timeframe: Timeframe): boolean {
  // Historical data (>7 days old) is always fresh
  if (now - bar.timestamp > 7 * 24 * 60 * 60 * 1000) {
    return false;
  }

  // Otherwise, check TTL
  const ttl = getTTL(timeframe);
  return now - bar.fetchedAt > ttl;
}
```

**Special cases:**

1. **Historical data:** Bars older than 7 days are always fresh
   - **Rationale:** Historical data is finalized and won't change
   - **Example:** A 1-minute bar from last month won't be corrected

2. **Missing TTL:** Unknown timeframes use 10-minute default
   - **Rationale:** Conservative approach prevents stale data
   - **Example:** Custom "3h" timeframe gets 10-minute TTL

### 1.3 Staleness API

```typescript
// Check single bar
isStale(bar: CachedBar, timeframe: Timeframe): boolean

// Get TTL for timeframe
getTTL(timeframe: Timeframe): number

// Filter stale bars from array
getStaleBars(bars: CachedBar[], timeframe: Timeframe): CachedBar[]

// Calculate when bar becomes stale
getStaleTimestamp(bar: CachedBar, timeframe: Timeframe): number
```

## 2. Revision Semantics

### 2.1 Revision Numbers

Each cached bar has a monotonic `revision` field:

- **Initial data:** `revision = 1`
- **First correction:** `revision = 2`
- **Second correction:** `revision = 3`
- etc.

**Invariants:**

1. Revisions are monotonic increasing per (symbol, timeframe, timestamp, provider)
2. Revisions never decrease
3. Different providers have independent revision sequences

### 2.2 Upsert Behavior

The `upsertBars()` method implements deterministic merge logic:

```typescript
async upsertBars(
  symbol: string,
  timeframe: Timeframe,
  bars: CachedBar[]
): Promise<CorrectionEvent[]>
```

**For each incoming bar:**

1. **Query existing bar** for same (symbol, timeframe, timestamp)
2. **Apply merge rules** (see section 2.3)
3. **Emit correction event** if bar changed
4. **Store winning bar** to cache
5. **Return correction events**

### 2.3 Merge Rules

Rules are evaluated in order. First match wins.

| Condition                                            | Winner       | Correction Type     |
| ---------------------------------------------------- | ------------ | ------------------- |
| No existing bar                                      | New bar      | `initial`           |
| Same provider, new.revision > existing.revision      | New bar      | `revision`          |
| Same provider, new.revision ≤ existing.revision      | Existing bar | (no event)          |
| Different provider, new priority > existing priority | New bar      | `provider_override` |
| Different provider, new priority ≤ existing priority | Existing bar | (no event)          |

**Provider Priority:**

Priority is determined by position in `providerPriority` array:

```typescript
providerPriority = ['polygon', 'yahoo', 'alpaca'];
```

- **polygon:** priority = 0 (highest)
- **yahoo:** priority = 1
- **alpaca:** priority = 2
- **unknown:** priority = MAX_SAFE_INTEGER (lowest)

**Example scenarios:**

```typescript
// Scenario 1: Initial insert
existing = null
incoming = { provider: 'polygon', revision: 1, close: 100.5 }
→ winner = incoming, event = 'initial'

// Scenario 2: Revision update
existing = { provider: 'polygon', revision: 1, close: 100.5 }
incoming = { provider: 'polygon', revision: 2, close: 100.8 }
→ winner = incoming, event = 'revision'

// Scenario 3: Provider override
existing = { provider: 'yahoo', revision: 1, close: 100.5 }
incoming = { provider: 'polygon', revision: 1, close: 100.8 }
→ winner = incoming, event = 'provider_override'

// Scenario 4: Stale revision (ignored)
existing = { provider: 'polygon', revision: 2, close: 100.8 }
incoming = { provider: 'polygon', revision: 1, close: 100.5 }
→ winner = existing, no event

// Scenario 5: Lower priority provider (ignored)
existing = { provider: 'polygon', revision: 1, close: 100.8 }
incoming = { provider: 'yahoo', revision: 3, close: 100.5 }
→ winner = existing, no event
```

### 2.4 Change Detection

A correction event is only emitted if bar data **actually changed**:

```typescript
function hasBarChanged(oldBar: CachedBar, newBar: CachedBar): boolean {
  return (
    oldBar.open !== newBar.open ||
    oldBar.high !== newBar.high ||
    oldBar.low !== newBar.low ||
    oldBar.close !== newBar.close ||
    oldBar.volume !== newBar.volume ||
    oldBar.provider !== newBar.provider ||
    oldBar.revision !== newBar.revision
  );
}
```

**Rationale:** Prevents spurious events when re-inserting identical data.

## 3. Correction Events

### 3.1 Event Structure

```typescript
interface CorrectionEvent {
  symbol: string; // e.g., 'ES', 'AAPL'
  timeframe: Timeframe; // e.g., '1m', '5m'
  timestamp: number; // Bar timestamp (Unix ms)
  oldBar: CachedBar | null; // Previous bar (null for initial)
  newBar: CachedBar; // New bar
  correctionType: 'revision' | 'provider_override' | 'initial';
  detectedAt: number; // When correction was detected (Unix ms)
}
```

### 3.2 Event Emission Timing

Events are emitted:

1. **Synchronously** during `upsertBars()` call
2. **After** merge logic determines winner
3. **Before** returning from `upsertBars()`
4. **Only if** new bar wins
5. **Only if** bar data changed

### 3.3 EventBus API

```typescript
class EventBus {
  // Subscribe to events
  on(eventType: 'correction', listener: CorrectionEventListener): () => void;

  // Unsubscribe from events
  off(eventType: 'correction', listener: CorrectionEventListener): void;

  // Emit event to all listeners
  emit(eventType: 'correction', event: CorrectionEvent): void;

  // Get listener count
  listenerCount(eventType: 'correction'): number;

  // Remove all listeners
  removeAllListeners(): void;
}
```

### 3.4 Error Handling

Listener errors are **swallowed** to prevent disrupting other listeners:

```typescript
for (const listener of listeners) {
  try {
    listener(event);
  } catch (error) {
    // Swallow error, continue with next listener
  }
}
```

**Rationale:**

- One bad listener shouldn't break others
- Upsert operation should always succeed
- Listeners are responsible for their own error handling

## 4. CLI Verification

### 4.1 Command Syntax

```bash
cache-verify --symbol <SYMBOL> --timeframe <TF> --window <N> [--pretty]
```

**Required flags:**

- `--symbol`: Symbol to verify (e.g., ES, AAPL, BTC-USD)
- `--timeframe`: Timeframe to verify (e.g., 1m, 5m, 1h, 1D)
- `--window`: Number of recent bars to check

**Optional flags:**

- `--pretty`: Format output with colors and indentation
- `--help`: Show help message

### 4.2 Output Format

**JSON structure:**

```json
{
  "success": true,
  "command": "cache-verify",
  "timestamp": "2025-09-30T12:34:56.789Z",
  "data": {
    "symbol": "ES",
    "timeframe": "1m",
    "window": 200,
    "totalBars": 198,
    "freshBars": 180,
    "staleBars": 18,
    "corrections": [
      {
        "timestamp": 1633024800000,
        "timestampISO": "2021-09-30T14:00:00.000Z",
        "type": "revision",
        "before": {
          "open": 4500.0,
          "high": 4505.0,
          "low": 4495.0,
          "close": 4502.5,
          "volume": 1000,
          "provider": "polygon",
          "revision": 1
        },
        "after": {
          "open": 4500.0,
          "high": 4505.0,
          "low": 4495.0,
          "close": 4503.0,
          "volume": 1050,
          "provider": "polygon",
          "revision": 2
        },
        "detectedAt": "2025-09-30T12:30:00.000Z"
      }
    ],
    "revisionCounts": {
      "1": 190,
      "2": 8
    },
    "providerCounts": {
      "polygon": 198
    }
  },
  "warnings": ["18 stale bars need refreshing", "1 corrections detected"]
}
```

### 4.3 Exit Codes

| Code | Meaning            | Example                                |
| ---- | ------------------ | -------------------------------------- |
| 0    | Success, no issues | All bars fresh, no corrections         |
| 1    | Warnings           | Stale bars detected, corrections found |
| 2    | Errors             | Cache unavailable, missing data        |

### 4.4 Environment Variables

- `CACHE_DB_PATH`: Database path (default: `data/cache.db`)

## 5. Invariants and Guarantees

### 5.1 Determinism

**Guarantee:** Same data arriving in any order produces same final state.

**Proof:**

- Merge rules are deterministic (no randomness, no timestamps)
- Provider priority is fixed configuration
- Revision numbers are monotonic per provider
- Latest revision from highest-priority provider always wins

**Example:**

```typescript
// Order 1: Yahoo first, then Polygon
await service.upsertBars('AAPL', '5m', [yahooBar]);
await service.upsertBars('AAPL', '5m', [polygonBar]);
// Final: polygonBar (higher priority)

// Order 2: Polygon first, then Yahoo
await service.upsertBars('AAPL', '5m', [polygonBar]);
await service.upsertBars('AAPL', '5m', [yahooBar]);
// Final: polygonBar (higher priority)
```

### 5.2 Monotonicity

**Guarantee:** Revisions from same provider never decrease.

**Enforcement:**

- `selectWinningBar()` only accepts `new.revision > existing.revision`
- Lower revisions are silently ignored
- No error is thrown (idempotent upserts)

### 5.3 Event Consistency

**Guarantee:** Exactly one correction event per actual bar change.

**Enforcement:**

- Events only emitted when `newBar` wins
- Events only emitted when data changed (`hasBarChanged()`)

Events are emitted for:

- Initial inserts (`correctionType: 'initial'`)
- Revision updates (`correctionType: 'revision'`)
- Provider overrides (`correctionType: 'provider_override'`)

### 5.4 Backward Compatibility

**Guarantee:** Existing code using `storeBars()` continues to work.

**Mechanism:**

- `storeBars()` method remains functional (marked `@deprecated`)
- No events are emitted by `storeBars()`
- Tests using `storeBars()` continue to pass

## 6. Performance Considerations

### 6.1 Upsert Cost

Each `upsertBars()` call:

1. **Database read:** Query existing bar (if not in memory)
   - Cost: O(1) with proper indexing
   - Index on: (symbol, timeframe, timestamp)

2. **Merge logic:** Select winning bar
   - Cost: O(1)

3. **Event emission:** Invoke all listeners
   - Cost: O(L) where L = number of listeners
   - Synchronous: blocks upsert until all listeners complete

4. **Database write:** Store winning bar
   - Cost: O(1) with proper indexing

**Total:** O(1) + O(L)

### 6.2 Scalability

**Memory cache:**

- LRU eviction prevents unbounded growth
- Default: 10,000 bars (~1-2 MB)

**Database cache:**

- SQLite handles millions of bars efficiently
- Proper indexing critical for performance

**Event bus:**

- In-process synchronous events
- Not suitable for distributed systems
- Consider external message queue for scale

### 6.3 Optimization Opportunities

1. **Batch upserts:** Process multiple bars in single transaction
2. **Memory cache first:** Check memory before database
3. **Lazy event emission:** Batch events and emit periodically
4. **Async listeners:** Allow non-blocking event handlers

## 7. Edge Cases

### 7.1 Concurrent Upserts

**Scenario:** Two threads upsert same bar simultaneously.

**Behavior:**

- SQLite UPSERT is atomic
- Last writer wins at database level
- Memory cache may be stale briefly
- No data corruption

**Mitigation:**

- Use connection pooling with proper locking
- Consider advisory locks for critical sections

### 7.2 Out-of-Order Arrivals

**Scenario:** Bars arrive out of order (e.g., revision 2 before revision 1).

**Behavior:**

- Merge rules handle any arrival order
- Final state is deterministic
- May emit multiple correction events
- Eventually converges to correct state

**Example:**

```typescript
// Revision 2 arrives first
await service.upsertBars('AAPL', '5m', [
  { timestamp: T, revision: 2, close: 100.8, provider: 'polygon' },
]);
// State: revision 2, close 100.8

// Revision 1 arrives late (ignored)
await service.upsertBars('AAPL', '5m', [
  { timestamp: T, revision: 1, close: 100.5, provider: 'polygon' },
]);
// State: revision 2, close 100.8 (unchanged)
```

### 7.3 Provider Priority Changes

**Scenario:** Provider priority configuration changes between restarts.

**Behavior:**

- Cached data from old priority remains
- New upserts use new priority
- Gradual convergence to new priority order
- No immediate re-processing of cache

**Mitigation:**

- Keep provider priority stable
- If changing, consider cache invalidation
- Document priority changes in config

### 7.4 Very Large Corrections

**Scenario:** Provider issues correction for 1 million bars.

**Behavior:**

- `upsertBars()` processes sequentially
- One event per changed bar
- All listeners invoked for each event
- May take significant time

**Mitigation:**

- Batch upserts in transactions
- Rate-limit event emission
- Consider async processing
- Use queue for large correction sets

## 8. Testing Requirements

### 8.1 Unit Tests

- ✅ TTL calculation per timeframe
- ✅ Staleness detection with various ages
- ✅ Historical data always fresh
- ✅ Custom TTL policies
- ✅ Event emission and subscription
- ✅ Multiple listeners
- ✅ Listener errors don't propagate
- ✅ Revision-based merge
- ✅ Provider priority merge
- ✅ Out-of-order arrivals
- ✅ No event for unchanged data

### 8.2 Integration Tests

- ✅ Late correction scenario (revision 1 → revision 2)
- ✅ Provider override (yahoo → polygon)
- ✅ Multi-provider, multi-revision flows
- ✅ Staleness combined with corrections
- ✅ SQLite persistence of revisions
- ✅ Memory + database cache coordination

### 8.3 Edge Case Tests

- ✅ Concurrent upserts (manual testing)
- ✅ Very high revision numbers
- ✅ Unknown providers
- ✅ Empty correction events
- ✅ Listener unsubscribe during emission

## 9. Future Enhancements

### 9.1 Short-term (Next Release)

- **Correction history table:** Store all corrections for audit
- **Staleness metrics:** Track cache hit rate by freshness
- **Provider health dashboard:** Visualize correction rates

### 9.2 Medium-term (Next Quarter)

- **Auto-refresh:** Automatically fetch stale bars
- **Async event bus:** Support for async listeners
- **Distributed events:** Use message queue for scale

### 9.3 Long-term (Future)

- **Custom merge logic:** Pluggable merge strategies
- **ML-based TTL:** Learn optimal TTL from usage patterns
- **Real-time corrections:** Stream corrections from providers

## 10. References

- **ADR-0204:** Bars Cache (original design)
- **ADR-0304:** Cache Freshness (this spec)
- **Issue #23:** Bars Cache implementation
- **Issue #33:** Freshness and corrections
- [SQLite UPSERT](https://www.sqlite.org/lang_upsert.html)
- [EventEmitter pattern](https://nodejs.org/api/events.html)
