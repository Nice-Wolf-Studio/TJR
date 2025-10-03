# ADR-0201: Yahoo Finance Data Provider

**Status:** Accepted
**Date:** 2025-09-30
**Phase:** 2
**Shard:** B3a

---

## Context

TJR Suite requires reliable historical market data for backtesting trading strategies and performing statistical analysis. Yahoo Finance provides free, publicly accessible market data across multiple asset classes (equities, futures, forex, cryptocurrencies) with reasonable historical depth and data quality. This ADR documents the implementation of the Yahoo Finance data provider adapter that integrates Yahoo Finance data into the TJR Suite architecture.

### Requirements

1. **Contract Compliance:** Must implement the provider contract defined in `@tjr/contracts` (`GetBarsParams`, `MarketBar`, `ProviderCapabilities`)
2. **Multiple Timeframes:** Support intraday (1m, 5m, 10m), hourly (1h, 4h), and daily (1D) data
3. **Testing Without API Calls:** Enable deterministic testing without external HTTP dependencies during development
4. **Data Quality:** Validate OHLC invariants (high ≥ low, high ≥ open/close, low ≤ open/close) and reject malformed data
5. **Extensibility:** Design for future HTTP implementation without breaking changes to public API

### Challenges

- Yahoo Finance does not officially support all timeframes we need (e.g., 10m, 4h are not native)
- Yahoo Finance has no official API documentation; data format may change without notice
- Need to test provider logic without hitting rate limits or requiring internet connectivity
- Must handle invalid data gracefully (missing fields, negative volume, OHLC violations)

---

## Decision

### 1. Provider Architecture

We implemented `YahooProvider` as a class-based adapter conforming to the implicit provider interface defined by `@tjr/contracts`. The provider currently operates in **fixture mode** for testing, loading data from JSON files instead of making HTTP requests. This approach enables:

- Deterministic test outcomes (no network variability)
- Fast test execution (no HTTP latency)
- Comprehensive error case testing (can craft invalid fixtures)
- Development without API credentials

**Future Phases:** The provider will be extended to fetch data from Yahoo Finance's HTTP API (likely through `yahoo-finance2` npm package or direct HTTP requests to `query1.finance.yahoo.com`).

**Key Methods:**

```typescript
class YahooProvider {
  // Returns provider metadata (supported timeframes, rate limits, etc.)
  capabilities(): ProviderCapabilities;

  // Fetches historical bars for a symbol/timeframe/date range
  async getBars(params: GetBarsParams): Promise<MarketBar[]>;
}
```

### 2. Supported Timeframes

**Native Timeframes (loaded directly from Yahoo Finance):**

- `1m` (1 minute) - Mapped to Timeframe enum value `'1'`
- `5m` (5 minutes) - Mapped to Timeframe enum value `'5'`
- `1h` (1 hour) - Mapped to Timeframe enum value `'60'`
- `1D` (1 day) - Mapped to Timeframe enum value `'1D'`

**Aggregated Timeframes (computed from native data):**

- `10m` (10 minutes) - Aggregated from 1m bars using `@tjr-suite/market-data-core`
- `4h` (4 hours) - Aggregated from 1h bars using `@tjr-suite/market-data-core`

**Aggregation Strategy:**

The provider automatically determines when aggregation is needed:

1. Parse requested timeframe (e.g., `Timeframe.M10`)
2. Check if timeframe is natively supported
3. If not, select the appropriate source timeframe (10m → 1m, 4h → 1h)
4. Load source data from fixture (or future: fetch from API)
5. Call `aggregateBars(bars, targetTimeframe)` from `@tjr-suite/market-data-core`
6. Return aggregated bars

This design offloads complex aggregation logic to a dedicated package (`market-data-core`) that can be reused across all providers, ensuring consistent OHLCV calculations.

### 3. Data Format

**Yahoo Finance Raw Format (JSON):**

```typescript
interface YahooRawBar {
  symbol: string; // 'ES', 'SPY', etc.
  date: string; // ISO 8601 timestamp: '2024-01-15T14:30:00.000Z'
  open: number; // Opening price
  high: number; // Highest price
  low: number; // Lowest price
  close: number; // Closing price
  volume: number; // Trading volume
}
```

**Parsed Format (MarketBar from @tjr/contracts):**

```typescript
interface MarketBar {
  timestamp: string; // ISO 8601 timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
```

**Parsing and Validation:**

The `parseYahooBar()` function performs comprehensive validation:

1. **Required Fields:** Ensures `date`, `open`, `high`, `low`, `close`, `volume` are present
2. **Type Validation:** Confirms all OHLC values are numbers, volume is non-negative number
3. **OHLC Invariants:**
   - `high >= low` (basic sanity check)
   - `high >= open` and `high >= close` (high is the maximum)
   - `low <= open` and `low <= close` (low is the minimum)
4. **Timestamp Validation:** Confirms date string is valid ISO 8601 format
5. **Error Handling:** Throws descriptive errors for invalid data; `parseYahooBars()` logs warnings and skips invalid bars

This strict validation prevents downstream corruption from malformed market data.

### 4. Testing Strategy

**Fixture-Based Testing:**

We adopted a **golden fixture** approach where real-world data samples are stored in `__fixtures__/` as JSON files. This enables:

- **Reproducibility:** Tests always see the same data
- **Speed:** No network I/O during test runs
- **Coverage:** Can test edge cases (gaps in data, market holidays, etc.)
- **Offline Development:** No API keys or internet required

**Fixture Files (4 total):**

```
packages/provider-yahoo/__fixtures__/
├── ES-1m-sample.json   (21 bars from 2024-01-15 14:30-15:04)
├── ES-5m-sample.json   (4 bars from 2024-01-15 14:30-15:00)
├── ES-1h-sample.json   (7 bars from 2024-01-15 09:00-15:00)
└── ES-1d-sample.json   (8 bars from 2024-01-08 to 2024-01-15)
```

Each fixture contains realistic E-mini S&P 500 (ES) futures data with typical price movements and volume patterns.

**Test Coverage (17 tests across 3 suites):**

1. **Capabilities Suite (1 test):** Validates provider metadata
2. **getBars Suite (12 tests):**
   - Fetching native timeframes (1m, 5m, 1h, 1D)
   - Aggregation correctness (10m, 4h)
   - Date range filtering
   - Limit parameter handling
   - Error cases (invalid symbol, timeframe, date range)
3. **Parser Suite (4 tests):**
   - Valid bar parsing
   - Missing field detection
   - OHLC invariant violations
   - Invalid timestamp handling

**Why No HTTP Calls Yet:**

We intentionally deferred HTTP implementation to Phase 2.B3b for several reasons:

- **Testing First:** Fixture-based testing validates business logic without network concerns
- **API Instability:** Yahoo Finance lacks official API docs; fixtures insulate us from breaking changes
- **Rate Limits:** Can develop/test extensively without hitting Yahoo's rate limits
- **Separation of Concerns:** HTTP layer is orthogonal to parsing/aggregation logic

The current fixture-based implementation is production-ready for **replay testing** scenarios where pre-fetched data is sufficient.

---

## Alternatives Considered

### Alternative 1: Direct HTTP Implementation First

**Approach:** Implement HTTP fetching to Yahoo Finance API immediately, skip fixtures.

**Pros:**

- "More realistic" testing against live data
- Validates API contract assumptions early

**Cons:**

- Tests become non-deterministic (data changes over time)
- Requires internet connectivity for development
- Rate limiting complicates rapid test iteration
- Harder to test error cases (need to trigger actual API failures)

**Decision:** Rejected. Fixture-based approach provides better developer experience and test reliability. HTTP layer will be added in Phase 2.B3b once core logic is proven.

---

### Alternative 2: Different Data Provider (Alpha Vantage, IEX Cloud, Polygon.io)

**Alpha Vantage:**

- **Pros:** Official API, generous free tier (500 calls/day)
- **Cons:** Slow rate limits (5 calls/minute), delayed data on free tier

**IEX Cloud:**

- **Pros:** Well-documented REST API, excellent data quality
- **Cons:** Requires paid subscription for historical intraday data

**Polygon.io:**

- **Pros:** Fast, reliable, real-time and historical data
- **Cons:** Expensive ($199+/month for stock data)

**Decision:** Yahoo Finance chosen for Phase 2 because:

1. **Cost:** Free for historical data (critical for early development)
2. **Coverage:** Broad symbol universe (stocks, futures, forex, crypto)
3. **Availability:** No registration/API key required for basic access
4. **Community:** Large user base means scraping techniques are well-documented

**Future Consideration:** TJR Suite may support multiple providers via adapter pattern. Yahoo serves as the initial reference implementation; premium providers (Polygon, IEX) can be added later as alternatives.

---

### Alternative 3: Database-First Approach (Cache All Data Locally)

**Approach:** Fetch data once from Yahoo, store in SQLite/PostgreSQL, serve from local DB.

**Pros:**

- Eliminates repeated API calls
- Faster queries for backtesting (indexed database queries)
- Enables gap detection and automated backfills

**Cons:**

- Adds complexity (database schema, migrations, sync logic)
- Storage overhead (gigabytes for comprehensive historical data)
- Stale data problem (need cron jobs to update cache)

**Decision:** Rejected for initial implementation. Provider should be a **thin adapter**, not a caching layer. Caching/persistence is a cross-cutting concern best handled by:

- A dedicated caching layer (future Phase 3+)
- Or, user-space storage (backtesting engine saves fetched data)

---

## Consequences

### Positive

1. **Rapid Iteration:** Developers can run tests in milliseconds without network I/O
2. **Deterministic Tests:** Fixtures eliminate flaky tests caused by API changes or rate limits
3. **OHLC Quality Assurance:** Strict parser validation catches bad data before it contaminates analysis
4. **Aggregation Reusability:** Delegation to `market-data-core` means other providers (Alpaca, Interactive Brokers) get aggregation "for free"
5. **Extensibility:** Clear separation between fixture loading and future HTTP logic; `loadFixture()` can be swapped with `fetchFromAPI()` without changing public interface
6. **Documentation:** `YahooRawBar` type serves as de-facto spec for Yahoo Finance data format

### Negative

1. **Not Yet Production-Ready for Live Data:** Current implementation cannot fetch fresh data; requires Phase 2.B3b HTTP work
2. **Fixture Maintenance:** If Yahoo changes data format, fixtures must be manually updated
3. **Limited Symbol Coverage:** Fixtures only include ES (E-mini S&P 500); testing other symbols requires adding more fixtures
4. **No Error Recovery:** Parser fails fast on invalid data; may want more graceful degradation (e.g., skip bad bars and continue)
5. **Yahoo Finance Reliability:** Yahoo is a free service with no SLA; may have outages or data quality issues

### Mitigation Strategies

- **Fixture Staleness:** Automate fixture generation (future: `pnpm generate-fixtures` script that fetches fresh data)
- **Limited Coverage:** Add fixtures for diverse symbols (equities: SPY, QQQ; crypto: BTC-USD) as test cases expand
- **Yahoo Dependency Risk:** Architecture supports multiple providers; Yahoo is _a_ provider, not _the_ provider

---

## Implementation Details

### Package Structure

```
packages/provider-yahoo/
├── package.json              # Dependencies: @tjr/contracts, @tjr-suite/market-data-core
├── tsconfig.json             # Extends root tsconfig.base.json
├── src/
│   ├── index.ts              # Public exports (YahooProvider, types)
│   ├── types.ts              # YahooRawBar, YahooProviderOptions interfaces
│   ├── parser.ts             # parseYahooBar, parseYahooBars functions
│   └── yahoo-provider.ts     # YahooProvider class implementation
├── __fixtures__/
│   ├── ES-1m-sample.json     # 21 bars (1-minute)
│   ├── ES-5m-sample.json     # 4 bars (5-minute)
│   ├── ES-1h-sample.json     # 7 bars (1-hour)
│   └── ES-1d-sample.json     # 8 bars (daily)
└── tests/
    └── yahoo-provider.test.ts # 17 tests (Vitest)
```

### Test Coverage Summary

- **Total Tests:** 17 (all passing)
- **Test Suites:** 3 (capabilities, getBars, parser)
- **Code Coverage:** Not measured yet (future: add `vitest --coverage`)

### Dependencies

- `@tjr/contracts` (workspace:\*) - Provider interface contracts, Timeframe enum
- `@tjr-suite/market-data-core` (workspace:\*) - `aggregateBars()` function
- `vitest` (dev) - Test runner
- `typescript` (dev) - Compilation

### Key Files

1. **`src/yahoo-provider.ts`** (285 lines):
   - `YahooProvider` class with `capabilities()` and `getBars()` methods
   - Private methods: `validateParams()`, `analyzeTimeframe()`, `loadFixture()`, `filterByDateRange()`, `aggregateBars()`
   - Heavy JSDoc comments explaining each method

2. **`src/parser.ts`** (109 lines):
   - `parseYahooBar()`: Single bar validation and transformation
   - `parseYahooBars()`: Batch parsing with error tolerance

3. **`tests/yahoo-provider.test.ts`** (267 lines):
   - Comprehensive test coverage including happy paths and error cases

---

## References

- **Issue:** [#20] Add Yahoo Finance provider
- **Contracts:** `@tjr/contracts` - `GetBarsParams`, `MarketBar`, `ProviderCapabilities`, `Timeframe`
- **Aggregation:** `@tjr-suite/market-data-core` - `aggregateBars()` function
- **Yahoo Finance (Unofficial):** `https://query1.finance.yahoo.com/v8/finance/chart/` (API endpoint, no official docs)
- **Related ADRs:** None yet (first data provider implementation)

---

## Changelog

- **2025-09-30:** Initial implementation (Phase 2, Shard B3a)
  - Fixture-based provider with 4 timeframes (1m, 5m, 1h, 1D)
  - Aggregation support for 10m and 4h
  - 17 passing tests
  - Comprehensive OHLC validation
