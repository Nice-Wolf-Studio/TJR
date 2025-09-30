# ADR-0058: Sessions Calendar

**Status:** Accepted
**Date:** 2025-09-29
**Deciders:** Architecture Team
**Phase:** 51
**Shard:** C2

---

## Context

The TJR Suite requires deterministic, pure-function access to trading session windows (RTH/ETH) for various symbols across different exchanges. Key requirements include:

- **Holiday awareness:** Identify market closures (full and partial)
- **DST handling:** Correctly adjust session times during daylight saving transitions
- **Symbol-specific sessions:** Different symbols trade on different exchanges with different hours
- **Zero I/O:** Pure functions with no network calls, file reads, or external dependencies at runtime
- **Testability:** Reproducible outputs for any date/symbol combination

Without this package, we face:
- Non-deterministic behavior from external API calls in critical data processing
- Inconsistent holiday/session handling across different modules
- Complex DST edge cases scattered throughout the codebase
- Difficulty testing date-sensitive logic

---

## Decision

### 1. **Architecture: Pure Functions with Pre-Packaged Data**

We will implement `@tjr/sessions-calendar` as a pure, deterministic module with no I/O operations.

**Rationale:**
- **Predictability:** Same inputs always produce same outputs
- **Performance:** No network latency or file system overhead
- **Testability:** Easy to verify correctness with matrix tests
- **Simplicity:** No caching, retries, or error handling for I/O failures

**Data strategy:**
- Static JSON files embedded in package at build time
- Sample CME calendar data sufficient for tests
- Future: Extended datasets via separate data packages

---

### 2. **API Surface**

```typescript
// Get all trading sessions for a date/symbol
getSessions(date: Date, symbol: string): Session[]

// Check if date is a market holiday
isHoliday(date: Date, symbol: string): boolean

// Get regular trading hours window
rthWindow(date: Date, symbol: string): { start: Date; end: Date }
```

**Types:**
```typescript
interface Session {
  type: 'RTH' | 'ETH_PRE' | 'ETH_POST';
  start: Date;
  end: Date;
  exchange: string;
}
```

**Rationale:**
- **Simple:** Three core functions cover most use cases
- **Type-safe:** Leverages TypeScript for compile-time checks
- **Timezone-aware:** Returns Date objects in UTC, caller converts as needed

---

### 3. **Calendar Data Sources**

Initial implementation uses **CME Group** calendar data:
- Regular Trading Hours (RTH): 9:30 AM - 4:00 PM ET for equity futures
- Extended Trading Hours (ETH): Pre-market and post-market sessions
- Holidays: CME official holiday calendar (New Year's Day, Good Friday, Thanksgiving, Christmas, etc.)

**Data format (JSON):**
```json
{
  "exchange": "CME",
  "holidays": [
    { "date": "2025-01-01", "name": "New Year's Day", "type": "full" },
    { "date": "2025-07-03", "name": "Independence Day (Observed)", "type": "early_close" }
  ],
  "sessions": {
    "ES": {
      "rth": { "start": "09:30", "end": "16:00", "timezone": "America/New_York" },
      "eth_pre": { "start": "08:00", "end": "09:30", "timezone": "America/New_York" },
      "eth_post": { "start": "16:00", "end": "20:00", "timezone": "America/New_York" }
    }
  }
}
```

**Assumptions:**
1. **Symbol mapping:** Symbols map to exchanges (e.g., ES → CME, SPY → NYSE)
2. **Timezone consistency:** All times stored in exchange local time, converted to UTC at runtime
3. **Calendar completeness:** Covers 2025-2027; stale data returns empty sessions with warning comment

---

### 4. **DST Handling Policy**

**Rule:** Use IANA timezone database (`America/New_York`, `America/Chicago`) via `Intl.DateTimeFormat` or `date-fns-tz`.

**Behavior:**
- **Spring forward (lose 1 hour):** If session spans the gap (2:00-3:00 AM), truncate start to 3:00 AM
- **Fall back (gain 1 hour):** If session spans the repeat (1:00-2:00 AM), use first occurrence
- **RTH sessions (9:30-16:00 ET):** Unaffected by DST transitions (occur during stable hours)

**Rationale:**
- **Correctness:** IANA database is authoritative for historical and future DST rules
- **No manual offsets:** Avoid hardcoding UTC-4/UTC-5; library handles transitions
- **Edge case clarity:** Explicit policy for gap/overlap scenarios

---

### 5. **Limitations (Initial Release)**

1. **Limited coverage:** Only CME ES futures calendar; no NYSE, NASDAQ, Forex, or crypto
2. **No intraday changes:** Cannot represent real-time schedule changes (e.g., early close due to weather)
3. **Static data:** Requires package update for future years; no dynamic fetching
4. **No regional exchanges:** No support for LSE, TSE, HKEx, etc.

These are acceptable tradeoffs for Phase 51 (initial implementation). Future shards can expand coverage.

---

## Alternatives Considered

### Dynamic Fetch from External APIs
**Pros:**
- Always up-to-date
- No package updates needed

**Cons:**
- Non-deterministic (API downtime, rate limits)
- Adds network dependency and error handling
- Slower (latency + caching complexity)
- Harder to test (requires mocking or recording)

**Decision:** Rejected. Purity and determinism are more valuable than freshness for this use case.

---

### Embed Full Multi-Year Calendars
**Pros:**
- No data staleness issues for years

**Cons:**
- Large package size (holidays + sessions for all symbols/exchanges)
- Most users only need current year + next year
- Maintenance burden (updating 10+ exchange calendars)

**Decision:** Rejected. Start small with CME sample; expand via separate data packages later.

---

### Use Third-Party Library (e.g., `trading-calendars`)
**Pros:**
- Already maintained
- Comprehensive coverage

**Cons:**
- Python-only (no TypeScript port with active maintenance)
- Includes I/O (file reads, pandas dependencies)
- Opinionated schema (hard to extend)

**Decision:** Rejected. Build minimal TypeScript-native solution aligned with our purity requirement.

---

## Risks and Mitigations

### Risk 1: Stale calendar data breaks production
**Impact:** Wrong trading hours after data expires (e.g., using 2025 calendar in 2028)
**Mitigation:**
- Add data version metadata (`validFrom`, `validTo`)
- Emit warnings when querying dates outside valid range
- CI check: Fail build if data expiry within 90 days

---

### Risk 2: DST bugs near transitions
**Impact:** Incorrect session times on DST change days (rare but critical)
**Mitigation:**
- Comprehensive matrix tests: All DST transitions 2024-2027
- Use well-tested library (`date-fns-tz`) instead of manual UTC math
- Document edge cases in code comments

---

### Risk 3: Symbol→Exchange mapping errors
**Impact:** Wrong calendar applied to symbol (e.g., ES using NYSE hours)
**Mitigation:**
- Explicit mapping table in code (symbol → exchange)
- Return error if symbol unmapped (fail fast)
- Tests verify known symbols (ES, NQ, etc.)

---

### Risk 4: Performance degradation with large calendars
**Impact:** Slow queries if calendar data grows to thousands of entries
**Mitigation:**
- Index holidays by year-month for O(1) lookup
- Keep sessions map flat (symbol → hours) instead of nested loops
- Benchmark: Sub-1ms queries for 10-year calendar

---

## Rollback Plan

If the static data approach proves unworkable:

1. **Add dynamic fetch layer:** Wrap pure functions with optional external API client (e.g., `@tjr/sessions-calendar-fetch`)
2. **Preserve pure core:** Keep existing functions unchanged; dynamic layer uses them as fallback
3. **Incremental migration:** Consumers opt-in to dynamic fetching per-function

**Estimated effort:** 1-2 days to add opt-in fetch layer

---

## Success Metrics

1. **Determinism:** 100% of tests produce same output across runs (no flakiness)
2. **Coverage:** All DST transitions 2024-2027 tested (24 transitions × 3 sessions = 72 test cases)
3. **Performance:** < 1ms per query for `getSessions()` (measured via benchmark suite)
4. **Zero I/O:** No file reads, network calls, or env var access at runtime (verified via sandbox tests)

---

## References

- [CME Group Holiday Calendar](https://www.cmegroup.com/tools-information/holiday-calendar.html)
- [IANA Time Zone Database](https://www.iana.org/time-zones)
- [date-fns-tz Documentation](https://github.com/marnusw/date-fns-tz)
- [Trading Hours Standards (ISO 10383 MIC)](https://www.iso20022.org/market-identifier-codes)

---

## Changelog

- **2025-09-29:** Initial ADR created (Phase 51, Shard C2)