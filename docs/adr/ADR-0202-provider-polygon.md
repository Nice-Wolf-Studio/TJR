# ADR-0202: Provider: Polygon.io Market Data Adapter

**Status:** Accepted
**Date:** 2025-09-30
**Deciders:** Architecture Team
**Phase:** 2
**Shard:** B3b
**Issue:** #21 [P2][B3b] Provider: Polygon

---

## Context

The TJR Suite requires access to real-world market data for backtesting, analysis, and trading operations. While the system architecture defines a provider abstraction layer, we need concrete implementations that fetch historical and real-time OHLCV bars from external data sources.

Key requirements:

- **Historical OHLCV data:** Fetch bars for any symbol and timeframe
- **Multiple timeframes:** Support both daily and intraday bars (1m, 5m, 10m, 1h, 4h, 1D)
- **Timeframe aggregation:** Convert provider's native bars to canonical timeframes
- **Rate limiting:** Handle API quotas gracefully without crashes
- **Testing:** Deterministic tests using golden fixtures (no network calls in CI)
- **Error handling:** Graceful degradation for API failures, network issues, rate limits
- **Capabilities reporting:** Expose provider constraints (rate limits, supported timeframes, symbols)

Challenges:

- **Provider diversity:** Different APIs use inconsistent formats, timeframe notation, and timestamp conventions
- **Rate limits:** Free-tier APIs impose strict quotas (5 requests/minute for Polygon.io)
- **Timezone handling:** Polygon returns US equity bars in America/New_York time (requires UTC conversion)
- **Data gaps:** Markets close on weekends/holidays (missing bars are normal, not errors)
- **Testing complexity:** Network-dependent tests are slow, flaky, and leak credentials

Without a well-designed provider adapter:

- Backtests produce inconsistent results due to data format differences
- Rate limit violations cause test failures and API bans
- Credential leaks in test fixtures compromise security
- Slow tests block CI/CD pipelines (network round-trips)

---

## Decision

### 1. **Why Polygon.io**

We will implement Polygon.io as the first market data provider.

**Rationale:**

- **Free tier available:** 5 API requests/minute (sufficient for development and testing)
- **Comprehensive data:** US equities, options, crypto, forex (expanding coverage)
- **Good API design:** RESTful, well-documented, consistent JSON responses
- **Reliability:** 99.9% uptime, established company with paying customers
- **Developer-friendly:** Simple authentication (API key), clear error messages

**Alternatives considered:**

- **Alpha Vantage:** Free tier limited to 5 requests/day (too restrictive for CI)
- **Yahoo Finance (unofficial):** No official API, prone to breaking changes, rate limits unclear
- **IEX Cloud:** Requires credit card for free tier, pricing complexity

**Decision:** Polygon.io offers the best balance of free-tier access, reliability, and API quality.

---

### 2. **Authentication Strategy**

**API Key via Environment Variable:**

```typescript
const apiKey = process.env.POLYGON_API_KEY;
if (!apiKey) {
  throw new Error('POLYGON_API_KEY environment variable is required');
}
```

**Rationale:**

- **Security:** API key never hardcoded in source code
- **Flexibility:** Different keys for dev, staging, production environments
- **Standard practice:** Follows 12-factor app principles

**Credential Storage:**

- **Development:** Stored in `.env` file (gitignored)
- **CI/CD:** Stored as encrypted secrets in GitHub Actions/secrets manager
- **Production:** Injected via environment variables (Docker, Kubernetes, etc.)

**Error Handling:**

- Missing API key: Throw immediately at adapter initialization (fail-fast)
- Invalid API key: Provider returns 401, adapter logs error and re-throws
- Expired key: Same as invalid (provider handles expiration)

---

### 3. **Rate Limit Handling**

**Strategy: Exponential Backoff with Jitter**

```typescript
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url);

    if (response.status === 429) {
      // Rate limited
      if (attempt === maxRetries) {
        throw new RateLimitError('Polygon API rate limit exceeded after retries');
      }

      const backoffMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);
      logger.warn('Rate limited, retrying', { attempt, backoffMs });
      await sleep(backoffMs);
      continue;
    }

    return response;
  }
}
```

**Rationale:**

- **Exponential backoff:** Reduces retry frequency after failures
- **Jitter:** Prevents thundering herd (multiple clients retrying simultaneously)
- **Max backoff cap:** 10 seconds prevents indefinite blocking
- **Retry limit:** 3 attempts balances resilience with fast failure

**Rate Limit Metadata:**

Provider exposes rate limit information via capabilities:

```typescript
interface ProviderCapabilities {
  rateLimit: {
    requestsPerMinute: number;  // e.g., 5 for free tier
    burstLimit?: number;         // e.g., 10 for burst allowance
  };
}
```

**Future Enhancement (Phase 3):**

- Implement client-side request queuing to proactively avoid rate limits
- Track request timestamps, delay requests if approaching quota
- Not implemented in Phase 2 (YAGNI - retry strategy sufficient for now)

---

### 4. **Data Transformation Pipeline**

**Polygon Format → Canonical Bar Type**

**Polygon Response (Daily Bars):**

```json
{
  "results": [
    {
      "T": "AAPL",
      "t": 1632960000000,
      "o": 142.0,
      "h": 143.5,
      "l": 141.8,
      "c": 143.2,
      "v": 95000000
    }
  ]
}
```

**Polygon Response (Intraday Bars):**

```json
{
  "results": [
    {
      "T": "AAPL",
      "t": 1633024800000,
      "o": 142.0,
      "h": 143.5,
      "l": 141.8,
      "c": 143.2,
      "v": 1200000
    }
  ]
}
```

**Transformation Logic:**

```typescript
function parsePolygonBar(raw: PolygonBar): Bar {
  return {
    timestamp: raw.t,  // Already in Unix epoch milliseconds (UTC)
    open: raw.o,
    high: raw.h,
    low: raw.l,
    close: raw.c,
    volume: raw.v,
  };
}
```

**Field Mapping:**

| Polygon Field | Canonical Field | Notes |
|---------------|-----------------|-------|
| `T` | (symbol, not in Bar) | Used for validation, not stored in Bar |
| `t` | `timestamp` | Unix epoch milliseconds (UTC) |
| `o` | `open` | Opening price |
| `h` | `high` | Highest price |
| `l` | `low` | Lowest price |
| `c` | `close` | Closing price |
| `v` | `volume` | Traded volume |

**Timezone Handling:**

- **Polygon daily bars:** Already in UTC (timestamp = market open at 00:00 UTC)
- **Polygon intraday bars:** Returned in America/New_York time
- **Conversion:** Adapter converts NY time → UTC before returning bars

```typescript
// For intraday bars only
import { DateTime } from 'luxon';

const utcTimestamp = DateTime
  .fromMillis(raw.t, { zone: 'America/New_York' })
  .toUTC()
  .toMillis();
```

**Validation:**

- Reject bars where `low > high` (data corruption)
- Reject bars with negative prices or volume
- Log warning if `open` or `close` outside `[low, high]` range (likely bad data)

---

### 5. **Timeframe Aggregation**

**Approach: Delegate to `@tjr-suite/market-data-core`**

Polygon.io supports native timeframes:

- **Daily:** 1D
- **Intraday:** 1m, 5m, 15m, 30m, 1h

For non-native timeframes (10m, 4h), the adapter:

1. Fetches the smallest available native timeframe that divides evenly
2. Aggregates using `market-data-core.aggregateBars()`

**Example: Fetching 10m bars**

```typescript
async getBars(symbol: string, timeframe: '10m', from: Date, to: Date): Promise<Bar[]> {
  // Polygon doesn't support 10m natively, fetch 1m bars
  const oneMinuteBars = await this.fetchPolygonBars(symbol, '1m', from, to);

  // Aggregate 1m → 10m using market-data-core
  const aggregated = aggregateBars(oneMinuteBars, '10m');

  return aggregated;
}
```

**Example: Fetching 4h bars**

```typescript
async getBars(symbol: string, timeframe: '4h', from: Date, to: Date): Promise<Bar[]> {
  // Fetch 1h bars (4h = 4 × 1h)
  const oneHourBars = await this.fetchPolygonBars(symbol, '1h', from, to);

  // Aggregate 1h → 4h
  const aggregated = aggregateBars(oneHourBars, '4h');

  return aggregated;
}
```

**Rationale:**

- **Code reuse:** Aggregation logic is shared across all providers
- **Correctness:** market-data-core handles edge cases (DST, partial bars, alignment)
- **Testing:** Aggregation logic tested once, not per-provider

**Performance Consideration:**

- Fetching 1m bars for long date ranges (1 year) may require multiple API requests (pagination)
- For 4h bars, fetching 1h bars reduces API quota usage by 4x
- Trade-off: Slightly more computation (aggregation) for reduced API usage

---

### 6. **Caching Strategy**

**Principle: No Caching in Provider Layer**

The provider adapter is **stateless** and does not cache bars.

**Rationale:**

- **Separation of concerns:** Caching is the responsibility of the `bars-cache` layer
- **Simplicity:** Provider adapter has single responsibility (fetch and transform)
- **Flexibility:** Caching strategy (in-memory, Redis, filesystem) decided by higher layer
- **Testability:** Stateless adapter is easier to test (no cache invalidation logic)

**Caching Layers (Future):**

```
┌─────────────────┐
│  Backtest Engine │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Bars Cache      │  ← In-memory LRU cache (Phase 3)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Provider Adapter│  ← Stateless, no caching (Phase 2)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Polygon.io API  │
└─────────────────┘
```

**Phase 2 Scope:**

- Provider adapter only (no cache layer)
- Repeated requests for same bars will hit Polygon API (acceptable for development)

**Phase 3 Enhancement:**

- Add `@tjr-suite/bars-cache` package with LRU cache
- Cache keyed by `(symbol, timeframe, from, to)`
- TTL: 24 hours for historical bars (immutable), 1 minute for recent bars (may update)

---

### 7. **Error Handling**

**Error Categories:**

| Error Type | HTTP Status | Handling |
|------------|-------------|----------|
| **Authentication** | 401 | Throw `AuthenticationError`, log API key issue |
| **Rate Limit** | 429 | Retry with exponential backoff (max 3 attempts) |
| **Invalid Symbol** | 404 | Throw `SymbolNotFoundError`, log symbol |
| **Network Failure** | - | Retry once, then throw `NetworkError` |
| **Server Error** | 500-599 | Log, throw `ProviderError` (no retry, likely Polygon outage) |
| **Invalid Response** | 200 (malformed JSON) | Throw `DataFormatError`, log raw response |

**Error Classes:**

```typescript
// From @tjr-suite/contracts
class ProviderError extends Error {
  constructor(public provider: string, message: string, public cause?: Error) {
    super(`[${provider}] ${message}`);
  }
}

class RateLimitError extends ProviderError {}
class AuthenticationError extends ProviderError {}
class SymbolNotFoundError extends ProviderError {}
class NetworkError extends ProviderError {}
class DataFormatError extends ProviderError {}
```

**Logging Strategy:**

```typescript
// On error
logger.error('Failed to fetch bars', {
  component: 'provider-polygon',
  symbol,
  timeframe,
  from: from.toISOString(),
  to: to.toISOString(),
  error: err.message,
  stack: err.stack,
});
```

**Graceful Degradation:**

- Missing bars (weekends, holidays): Return empty array, log info (not error)
- Partial data (Polygon returns fewer bars than expected): Return available bars, log warning

---

### 8. **Testing Strategy**

**Principle: Deterministic, Fixture-Backed Tests (No Live Network Calls in CI)**

**Golden Fixtures:**

Store real Polygon API responses as JSON files in `__fixtures__/`:

```
packages/provider-polygon/
├── __fixtures__/
│   ├── AAPL-1D-2025-01-01-to-2025-01-31.json       # Daily bars
│   ├── AAPL-1m-2025-01-15-09-30-to-10-30.json      # Intraday bars
│   ├── TSLA-5m-2025-01-20-10-00-to-12-00.json      # 5-minute bars
│   ├── error-401-invalid-api-key.json              # Auth error response
│   ├── error-429-rate-limit.json                   # Rate limit response
│   └── error-404-symbol-not-found.json             # Invalid symbol
```

**Test Structure:**

```typescript
// tests/polygon.test.ts
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PolygonProvider } from '../src/index.js';
import aaplDailyFixture from '../__fixtures__/AAPL-1D-2025-01-01-to-2025-01-31.json';

// Mock fetch to return fixture data
global.fetch = async (url: string) => {
  if (url.includes('AAPL') && url.includes('day')) {
    return {
      ok: true,
      status: 200,
      json: async () => aaplDailyFixture,
    };
  }
  throw new Error(`Unmocked URL: ${url}`);
};

test('getBars: daily bars for AAPL', async () => {
  const provider = new PolygonProvider({ apiKey: 'test-key' });
  const bars = await provider.getBars('AAPL', '1D', new Date('2025-01-01'), new Date('2025-01-31'));

  assert.equal(bars.length, 21);  // 21 trading days in January 2025
  assert.equal(bars[0].open, 142.0);
  assert.equal(bars[0].high, 143.5);
  // ... more assertions
});
```

**Fixture Generation:**

- Fixtures captured from real Polygon API responses (one-time setup)
- Committed to git (version-controlled test data)
- Updated manually if Polygon changes response format (rare)

**Testing Coverage:**

- **Happy path:** Valid symbols, supported timeframes, typical date ranges
- **Edge cases:** Weekend dates, market holidays, partial days
- **Error cases:** 401 (auth), 429 (rate limit), 404 (symbol), 500 (server error)
- **Aggregation:** 10m and 4h bars (verify market-data-core integration)

**Why No Live Network Tests in CI:**

- **Speed:** Fixture tests run in <100ms, network tests take 5-10 seconds
- **Reliability:** No flakiness from network issues or Polygon outages
- **Security:** No API key leakage in CI logs
- **Cost:** Avoids consuming API quota during CI runs

**Manual Integration Test (Local Only):**

```bash
# Run with real API key (developer's local machine)
export POLYGON_API_KEY="your-real-key"
npm run test:integration  # Hits live Polygon API

# Output: Validates fixtures are still accurate
```

---

### 9. **Provider Capabilities API**

**Interface:**

```typescript
interface IMarketDataProvider {
  getBars(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<Bar[]>;
  capabilities(): ProviderCapabilities;
}

interface ProviderCapabilities {
  name: string;
  supportsRealtime: boolean;
  supportedTimeframes: Timeframe[];
  rateLimit: {
    requestsPerMinute: number;
    burstLimit?: number;
  };
  symbolTypes: ('stock' | 'crypto' | 'forex' | 'option')[];
  maxHistoricalYears?: number;
}
```

**Polygon Implementation:**

```typescript
capabilities(): ProviderCapabilities {
  return {
    name: 'Polygon.io',
    supportsRealtime: false,  // Phase 2: historical only
    supportedTimeframes: ['1m', '5m', '10m', '15m', '30m', '1h', '4h', '1D'],
    rateLimit: {
      requestsPerMinute: 5,   // Free tier limit
    },
    symbolTypes: ['stock', 'crypto'],  // Phase 2: US equities + crypto
    maxHistoricalYears: 2,  // Free tier: 2 years of history
  };
}
```

**Use Cases:**

- **UI:** Display provider constraints to users ("Polygon free tier: 5 req/min")
- **Rate limiting:** Higher layers can implement request queuing based on limits
- **Validation:** Reject requests for unsupported timeframes/symbols early

---

### 10. **Package Structure**

```
packages/provider-polygon/
├── __fixtures__/
│   ├── AAPL-1D-2025-01-01-to-2025-01-31.json
│   ├── error-401-invalid-api-key.json
│   └── ...
├── src/
│   ├── PolygonProvider.ts     # Main adapter class
│   ├── types.ts               # Polygon API response types
│   ├── transform.ts           # parsePolygonBar, timezone conversion
│   ├── retry.ts               # fetchWithRetry, rate limit handling
│   └── index.ts               # Public exports
├── tests/
│   ├── polygon.test.ts        # Main getBars tests (fixture-backed)
│   ├── transform.test.ts      # Data transformation unit tests
│   └── retry.test.ts          # Rate limit/retry logic tests
├── package.json
├── tsconfig.json
└── README.md
```

---

### 11. **Implementation Phases**

**Phase 2 (Current):**

- Implement `getBars()` for historical data only
- Support daily (1D) and intraday (1m, 5m, 10m, 1h, 4h) timeframes
- Rate limit handling (exponential backoff)
- Golden fixture tests (no network in CI)
- Error handling (auth, rate limit, network, data format)

**Phase 3 (Future):**

- Add realtime/streaming support (WebSocket API)
- Expand symbol types (options, forex)
- Client-side request queuing (proactive rate limiting)
- Bars cache layer integration

**Phase 4+ (Future):**

- Support for Polygon premium tier (higher rate limits)
- Advanced features (trade ticks, quotes, aggregates)

---

## Alternatives Considered

### 1. Implement Caching in Provider Adapter

**Pros:**

- Reduces API calls, faster repeated requests
- Simpler architecture (no separate cache layer)

**Cons:**

- Violates single responsibility principle (provider does fetching + caching)
- Harder to test (must mock cache behavior)
- Less flexible (caching strategy hardcoded per provider)

**Decision:** Rejected. Caching belongs in a separate layer (`bars-cache`).

---

### 2. Use Polygon WebSocket API for Historical Data

**Pros:**

- Single connection for multiple requests (reduced overhead)
- Potential for lower latency

**Cons:**

- WebSocket API designed for realtime, not historical bulk fetches
- More complex error handling (connection management)
- Harder to test (WebSocket mocking is complex)

**Decision:** Rejected for Phase 2. Use REST API for historical data, WebSocket for realtime (Phase 3).

---

### 3. Support Arbitrary Timeframes (e.g., 7m, 3h)

**Pros:**

- Maximum flexibility for custom strategies

**Cons:**

- Polygon doesn't support arbitrary timeframes natively
- Would require fetching 1m bars for all cases (high API usage)
- Aggregation complexity (non-standard boundaries)

**Decision:** Rejected. Stick to canonical timeframe set from market-data-core (1m, 5m, 10m, 15m, 30m, 1h, 2h, 4h, 1D).

---

### 4. Implement Pagination Internally (Hide from Caller)

**Pros:**

- Simpler API for consumers (no pagination logic)

**Cons:**

- Large date ranges may trigger many API requests (rate limit risk)
- Harder to provide progress feedback to caller
- Memory overhead (must load all pages before returning)

**Decision:** Accepted for Phase 2 (YAGNI). Pagination handled internally, provider returns all bars. Future enhancement: Add streaming API for incremental results.

---

## Risks and Mitigations

### Risk 1: Polygon API Changes Break Adapter

**Impact:** Response format change causes DataFormatError, adapter stops working

**Mitigation:**

- Golden fixtures serve as regression tests (detect format changes immediately)
- Monitor Polygon changelog for breaking changes
- Version adapter in lockstep with Polygon API version (query param: `apiVersion=v2`)
- Estimated fix time: 2-4 hours (update types + transform logic)

---

### Risk 2: Rate Limit Violations During Testing

**Impact:** Manual integration tests exhaust API quota, block development

**Mitigation:**

- CI uses fixtures only (no rate limit risk)
- Local integration tests run explicitly (`npm run test:integration`)
- Document rate limit in README ("5 req/min, use sparingly")
- Consider setting up dedicated test account for integration tests

---

### Risk 3: Timezone Conversion Errors (DST Transitions)

**Impact:** Bars near DST boundaries have incorrect timestamps

**Mitigation:**

- Include DST boundary fixtures (March 2025, November 2025)
- Validate timestamp continuity in tests (no gaps or duplicates)
- Use Luxon for timezone conversion (handles DST automatically)
- Test with multiple years of data (catch edge cases)

---

### Risk 4: Fixture Data Becomes Stale

**Impact:** Tests pass with fixtures, but fail with live API (format drift)

**Mitigation:**

- Run manual integration test monthly (`npm run test:integration`)
- Compare live results with fixtures, update if discrepancies found
- Document fixture generation process in README
- CI can run integration tests on weekly schedule (separate job, not blocking)

---

## Success Metrics

1. **Correctness:** All property tests pass (OHLC invariants, timestamp monotonicity)
2. **Test Coverage:** 100% line coverage for adapter code, 90%+ for edge cases
3. **Performance:** Fetch 1 year of daily bars in <2 seconds (including aggregation)
4. **Reliability:** Zero rate limit errors in CI (fixtures only)
5. **Adoption:** Used by at least 1 backtest engine or analysis script by end of Phase 2

---

## Consequences

### Positive

- **Data access:** Enables real-world backtesting with US equity data
- **Testing quality:** Deterministic tests improve reliability, catch regressions
- **Code reuse:** Aggregation logic shared with future providers (Alpaca, IEX)
- **Security:** No credentials in source code or CI logs

### Negative

- **Maintenance:** Fixtures must be updated if Polygon changes response format
- **Coverage:** Free tier limited to 2 years history, 5 req/min (may need paid tier later)
- **Provider lock-in:** Adapter specific to Polygon (but abstracted behind interface)

### Neutral

- **Additional dependency:** Luxon for timezone conversion (minimal overhead, well-maintained)
- **Testing overhead:** Must maintain fixtures alongside code (one-time cost)

---

## References

- [Polygon.io API Documentation](https://polygon.io/docs/stocks)
- [ADR-0055: Market-Data-Core Timeframe & Aggregation](/Users/jeremymiranda/Dev/TJR Project/5/tjr-suite/docs/adr/ADR-0055-market-data-core.md)
- [ADR-0053: Logger and Error Handler](/Users/jeremymiranda/Dev/TJR Project/5/tjr-suite/docs/adr/ADR-0053-logger-and-error-handler.md)
- [12-Factor App: Config](https://12factor.net/config)
- [Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)

---

## Changelog

- **2025-09-30:** Initial ADR created (Phase 2, Shard B3b)