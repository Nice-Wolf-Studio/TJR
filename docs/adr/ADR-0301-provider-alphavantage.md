# ADR-0301: Alpha Vantage Data Provider

**Status:** Accepted
**Date:** 2025-09-30
**Phase:** 3
**Shard:** B3c

---

## Context

TJR Suite requires reliable historical market data from multiple sources to ensure data availability and cross-validation capabilities. While Yahoo Finance provides our primary data source (ADR-0201), Alpha Vantage offers a complementary service with official API documentation, enterprise support, and different rate-limiting characteristics. This ADR documents the implementation of the Alpha Vantage data provider adapter.

### Requirements

1. **Contract Compliance:** Must implement the provider contract defined in `@tjr/contracts` (`GetBarsParams`, `MarketBar`, `ProviderCapabilities`)
2. **Multiple Timeframes:** Support intraday (1m, 5m, 60m/1h) and daily (1D) data that align with TJR contracts (M1, M5, M10, H1, H4, D1)
3. **Testing Without API Calls:** Enable deterministic testing without external HTTP dependencies using golden fixtures
4. **Error Handling:** Map Alpha Vantage errors to standardized `@tjr/contracts` error types
5. **Rate Limit Awareness:** Respect Alpha Vantage's rate limits (5 req/min, 500 req/day for free tier)
6. **Extensibility:** Design for future HTTP implementation without breaking public API

### Challenges

- Alpha Vantage API has strict rate limits (5 requests/minute on free tier)
- API returns data in Alpha Vantage-specific format that differs from our contracts
- TJR contracts only support specific timeframes (M1, M5, M10, H1, H4, D1), but Alpha Vantage natively supports additional intervals
- Need to aggregate non-native timeframes (10m from 5m, 4h from 1h)
- Must handle API errors gracefully and map them to contract error types

---

## Decision

### 1. Provider Architecture

We implemented `AlphaVantageProvider` as a class-based adapter conforming to the implicit provider interface defined by `@tjr/contracts`. The provider operates in **fixture mode** for testing (loading data from JSON files) and will support live API requests when an API key is provided.

**Key Design Principles:**

- **Fixture-First:** Default to loading fixtures if no API key provided, enabling offline development and deterministic tests
- **Strict Alignment:** Only support timeframes defined in `@tjr/contracts` Timeframe enum (M1, M5, M10, H1, H4, D1)
- **Native + Aggregation:** Fetch native timeframes (1min, 5min, 60min, daily) from Alpha Vantage; aggregate for 10m and 4h
- **Comprehensive Error Mapping:** Map all Alpha Vantage API errors to contract error types

**Key Methods:**

```typescript
class AlphaVantageProvider {
  // Returns provider metadata (supported timeframes, rate limits, etc.)
  capabilities(): ProviderCapabilities;

  // Fetches historical bars for a symbol/timeframe/date range
  async getBars(params: GetBarsParams): Promise<MarketBar[]>;
}
```

### 2. Supported Timeframes

**Contract Alignment:**

Alpha Vantage was strictly aligned to `@tjr/contracts` Timeframe enum, which defines:
- M1 = '1' (1 minute)
- M5 = '5' (5 minutes)
- M10 = '10' (10 minutes)
- H1 = '60' (60 minutes / 1 hour)
- H4 = '240' (240 minutes / 4 hours)
- D1 = '1D' (daily)

**Alpha Vantage Native Timeframes:**

- `1min` - Mapped to Timeframe.M1 ('1')
- `5min` - Mapped to Timeframe.M5 ('5')
- `60min` - Mapped to Timeframe.H1 ('60')
- Daily - Mapped to Timeframe.D1 ('1D')

**Aggregated Timeframes (computed using @tjr-suite/market-data-core):**

- `10m` (Timeframe.M10 = '10') - Aggregated from 5min bars
- `4h` (Timeframe.H4 = '240') - Aggregated from 60min bars

**Timeframes Removed During Implementation:**

Alpha Vantage natively supports 15min and 30min intervals, but these were **intentionally excluded** because the TJR contracts Timeframe enum does not include M15 or M30 values. This decision ensures:
1. Strict contract compliance across all providers
2. Consistent timeframe support across the system
3. No "provider-specific" timeframes that could break downstream code

### 3. Data Format

**Alpha Vantage Raw Format (Intraday):**

```json
{
  "Meta Data": {
    "1. Information": "Intraday (5min) open, high, low, close prices and volume",
    "2. Symbol": "ES",
    "3. Last Refreshed": "2024-01-15 15:00:00",
    "4. Interval": "5min",
    "5. Output Size": "Compact",
    "6. Time Zone": "US/Eastern"
  },
  "Time Series (5min)": {
    "2024-01-15 15:00:00": {
      "1. open": "4765.00",
      "2. high": "4767.75",
      "3. low": "4764.50",
      "4. close": "4767.50",
      "5. volume": "28950"
    }
  }
}
```

**Alpha Vantage Raw Format (Daily):**

```json
{
  "Meta Data": {
    "1. Information": "Daily Prices (open, high, low, close) and Volumes",
    "2. Symbol": "ES",
    "3. Last Refreshed": "2024-01-15",
    "4. Output Size": "Compact",
    "5. Time Zone": "US/Eastern"
  },
  "Time Series (Daily)": {
    "2024-01-15": {
      "1. open": "4725.50",
      "2. high": "4770.25",
      "3. low": "4724.00",
      "4. close": "4769.50",
      "5. volume": "235080"
    }
  }
}
```

**Parsed Format (MarketBar from @tjr/contracts):**

```typescript
interface MarketBar {
  timestamp: string;       // ISO 8601 timestamp in UTC
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
```

**Parsing and Validation:**

The `parseIntradayResponse()` and `parseDailyResponse()` functions perform:

1. **Response Structure Validation:** Ensures required keys exist
2. **Bar Parsing:** Extracts OHLCV data from Alpha Vantage's numeric key format
3. **Type Coercion:** Converts string values to numbers
4. **OHLC Invariants:**
   - `high >= low`
   - `high >= open` and `high >= close`
   - `low <= open` and `low <= close`
5. **Timestamp Conversion:** Converts Eastern Time timestamps to UTC ISO 8601
6. **Volume Validation:** Ensures volume is non-negative
7. **Sorting:** Returns bars sorted by timestamp (oldest first) for aggregation

### 4. Error Handling

**Custom Error Classes:**

```typescript
class AlphaVantageError extends Error { }
class RateLimitError extends AlphaVantageError { }
class ApiError extends AlphaVantageError { }
class ParseError extends AlphaVantageError { }
class AuthenticationError extends AlphaVantageError { }
class SymbolNotFoundError extends AlphaVantageError { }
class PremiumFeatureError extends AlphaVantageError { }
```

**Error Mapping:**

The `mapAlphaVantageError()` function maps Alpha Vantage API responses to contract errors:

- **"Invalid API call"** → `ApiError`
- **"Thank you for using Alpha Vantage! Our standard API call frequency is..."** → `RateLimitError`
- **"the parameter apikey is invalid or missing"** → `AuthenticationError`
- **"Invalid API call. Please retry or visit..."** → `SymbolNotFoundError` or `ApiError`
- **"Note" field present** → `RateLimitError`
- **"Information" field with premium message** → `PremiumFeatureError`

### 5. Testing Strategy

**Fixture-Based Testing:**

We adopted the same golden fixture approach as the Yahoo provider:

- **Reproducibility:** Tests always see the same data
- **Speed:** No network I/O during test runs (avg 8ms for 45 tests)
- **Coverage:** Test edge cases (aggregation, filtering, limits, errors)
- **Offline Development:** No API keys or internet required

**Fixture Files (4 total):**

```
packages/provider-alphavantage/__fixtures__/
├── ES-1min-sample.json   (1min intraday data)
├── ES-5min-sample.json   (5min intraday data)
├── ES-60min-sample.json  (60min intraday data with 8 bars for 4h aggregation)
└── ES-daily-sample.json  (daily data)
```

**Test Coverage (45 tests, all passing):**

1. **Capabilities Suite:** Validates provider metadata and supported timeframes
2. **getBars Suite (Intraday):** Tests 1min, 5min, 60min bar fetching
3. **getBars Suite (Daily):** Tests daily bar fetching
4. **Aggregation Suite:** Tests 5m→10m and 1h→4h aggregation
5. **Filtering and Limits Suite:** Tests date range filtering and limit parameter
6. **Parser Suite:** Tests response parsing, validation, error handling
7. **Error Handling Suite:** Tests custom error classes and mapping

### 6. HTTP Client Implementation

**AlphaVantageClient Class:**

```typescript
class AlphaVantageClient {
  async fetchIntraday(options: FetchOptions): Promise<AlphaVantageIntradayResponse>;
  async fetchDaily(options: FetchOptions): Promise<AlphaVantageDailyResponse>;
}
```

**Key Features:**

- **Dual Mode:** Supports both fixture loading (for tests) and HTTP requests (for live API)
- **Timeout Handling:** Uses AbortController for configurable request timeouts (default 30s)
- **Automatic Error Detection:** Checks HTTP status codes and Alpha Vantage error fields in response
- **Rate Limit Awareness:** Error mapper identifies rate limit errors with retry guidance

**API Endpoints:**

- Intraday: `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol={symbol}&interval={interval}&apikey={key}`
- Daily: `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol={symbol}&apikey={key}`

---

## Alternatives Considered

### Alternative 1: Support All Native Alpha Vantage Timeframes (Including 15min, 30min)

**Approach:** Allow provider to support 15min and 30min timeframes even though contracts don't define them.

**Pros:**
- Takes full advantage of Alpha Vantage's native capabilities
- No need to aggregate for additional timeframes

**Cons:**
- **Contract Violation:** Creates provider-specific timeframes not in `@tjr/contracts`
- **Inconsistency:** Other providers wouldn't support M15/M30, breaking portability
- **Type Safety:** Timeframe enum wouldn't include M15/M30 values
- **Test Failures:** Tests would reference undefined enum values

**Decision:** Rejected. Strict contract compliance is more important than utilizing all native provider capabilities. If M15/M30 are needed in the future, they should be added to the contracts first, then all providers can implement them.

---

### Alternative 2: Use Different Aggregation Library

**Alternatives:**
- Custom aggregation logic in provider
- Use `technicalindicators` npm package
- Use `pandas-js` for aggregation

**Pros (Custom Logic):**
- Full control over aggregation algorithm
- No external dependencies

**Cons (Custom Logic):**
- Code duplication across providers
- More complex testing requirements
- Higher maintenance burden

**Decision:** Rejected. We use `@tjr-suite/market-data-core` for aggregation because:
1. **Reusability:** All providers benefit from the same aggregation logic
2. **Testing:** Aggregation is tested independently in market-data-core
3. **Consistency:** Ensures identical OHLCV calculations across providers
4. **Separation of Concerns:** Provider focuses on data fetching, not aggregation math

---

### Alternative 3: Skip Fixture Testing, Use Live API Only

**Approach:** Implement HTTP client first, test against live Alpha Vantage API.

**Pros:**
- More realistic testing
- Validates API assumptions immediately

**Cons:**
- **Non-Deterministic Tests:** Data changes over time
- **Rate Limits:** Free tier only allows 5 req/min, 500 req/day
- **Development Friction:** Requires API key and internet for local development
- **CI/CD Issues:** Tests would hit rate limits in CI pipeline

**Decision:** Rejected. Fixture-first approach provides:
- **Reliable CI:** Tests run in milliseconds without rate limits
- **Offline Development:** No API key needed for implementation
- **Deterministic Behavior:** Same input always produces same output

---

## Consequences

### Positive

1. **Contract Compliance:** Provider strictly adheres to `@tjr/contracts`, ensuring portability
2. **Deterministic Testing:** 45 tests run in ~8ms without network calls or rate limits
3. **Reusable Aggregation:** Delegates to `market-data-core`, reducing code duplication
4. **Comprehensive Error Handling:** All Alpha Vantage error states are mapped to contract errors
5. **Dual Mode Support:** Works with fixtures for testing and HTTP for production
6. **Rate Limit Awareness:** Error messages include retry guidance
7. **Well-Documented:** Extensive JSDoc comments and inline documentation

### Negative

1. **Limited Timeframe Support:** Does not support 15min/30min despite Alpha Vantage offering them natively
2. **Fixture Maintenance:** Fixtures must be updated if Alpha Vantage changes response format
3. **Rate Limit Constraints:** Free tier limits (5 req/min, 500 req/day) may impact production usage
4. **Symbol Coverage:** Fixtures only include ES; testing other symbols requires additional fixtures
5. **US/Eastern Timezone:** Alpha Vantage uses Eastern time; must convert to UTC for contracts

### Mitigation Strategies

- **Limited Timeframes:** If M15/M30 are needed, add them to `@tjr/contracts` first, then implement across all providers
- **Fixture Staleness:** Document fixture generation process; automate in future with `pnpm generate-fixtures` script
- **Rate Limits:** Document rate limits in capabilities(); consider caching layer in future phases
- **Symbol Coverage:** Add more fixtures as needed (equities, futures, forex)
- **Timezone Conversion:** Parser handles timezone conversion; extensively tested in parser suite

---

## Implementation Details

### Package Structure

```
packages/provider-alphavantage/
├── package.json              # Dependencies: @tjr/contracts, @tjr-suite/market-data-core
├── tsconfig.json             # Extends base config, ES modules
├── src/
│   ├── index.ts              # Main provider class and public exports
│   ├── types.ts              # AlphaVantageRawBar, ProviderOptions, etc.
│   ├── errors.ts             # Custom error classes and mapping
│   ├── parser.ts             # Response parsing and validation
│   └── client.ts             # HTTP client with fixture fallback
├── __fixtures__/
│   ├── ES-1min-sample.json   # Intraday 1min data
│   ├── ES-5min-sample.json   # Intraday 5min data
│   ├── ES-60min-sample.json  # Intraday 60min data (8 bars)
│   └── ES-daily-sample.json  # Daily data
└── tests/
    └── alphavantage-provider.test.ts # 45 tests (Vitest)
```

### Test Coverage Summary

- **Total Tests:** 45 (all passing)
- **Test Execution:** ~8ms total runtime
- **Test Suites:** 7 (capabilities, intraday, daily, aggregation, filtering, parser, errors)
- **Fixtures:** 4 JSON files covering all native timeframes

### Dependencies

- `@tjr/contracts` (workspace:*) - Provider interface contracts, Timeframe enum
- `@tjr-suite/market-data-core` (workspace:*) - `aggregateBars()` function
- `vitest` (dev) - Test runner
- `typescript` (dev) - Compilation

### Key Files

1. **`src/index.ts`** (459 lines):
   - `AlphaVantageProvider` class with `capabilities()` and `getBars()` methods
   - Private methods: `validateParams()`, `analyzeTimeframe()`, `filterByDateRange()`, `aggregateBars()`, `toMarketDataCoreTimeframe()`
   - Extensive JSDoc documentation

2. **`src/client.ts`** (345 lines):
   - `AlphaVantageClient` class with HTTP and fixture support
   - Methods: `fetchIntraday()`, `fetchDaily()`, `fetchWithTimeout()`
   - Timeout handling with AbortController

3. **`src/parser.ts`** (178 lines):
   - `parseIntradayResponse()`, `parseDailyResponse()` functions
   - Bar validation and OHLC invariant checking

4. **`src/errors.ts`** (123 lines):
   - 6 custom error classes extending AlphaVantageError
   - `mapAlphaVantageError()` for comprehensive error mapping

5. **`tests/alphavantage-provider.test.ts`** (387 lines):
   - 45 tests covering all provider functionality

---

## References

- **Issue:** [#30] Add Alpha Vantage provider
- **Contracts:** `@tjr/contracts` - `GetBarsParams`, `MarketBar`, `ProviderCapabilities`, `Timeframe`
- **Aggregation:** `@tjr-suite/market-data-core` - `aggregateBars()` function
- **Alpha Vantage API:** https://www.alphavantage.co/documentation/
- **Related ADRs:**
  - ADR-0201: Yahoo Finance Data Provider
  - ADR-0202: Polygon.io Data Provider (planned)

---

## Changelog

- **2025-09-30:** Initial implementation (Phase 3, Shard B3c)
  - Fixture-based provider with 4 native timeframes (1m, 5m, 60m, 1D)
  - Aggregation support for 10m and 4h using market-data-core
  - Removed 15min/30min support to align with TJR contracts
  - 45 passing tests with comprehensive error handling
  - Dual-mode client (fixtures + HTTP) with timeout support
  - Complete Alpha Vantage error mapping to contract errors