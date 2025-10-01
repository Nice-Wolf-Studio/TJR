# ADR-0203: Composite Provider Selection Policy

**Status:** Accepted
**Date:** 2025-09-30
**Deciders:** Architecture Team
**Phase:** 2
**Shard:** B4

---

## Context

The market-data-core package needs a deterministic, reproducible mechanism for selecting data providers based on:
- Provider capabilities (supported timeframes, asset classes, historical depth)
- Data freshness requirements (real-time vs. delayed vs. end-of-day)
- Priority/cost tradeoffs (prefer cheaper providers when equivalent)
- Override mechanisms (force specific provider for testing or compliance)

Without a formal selection policy, we face:
- **Non-deterministic behavior:** Different provider selection across runs
- **Debugging difficulty:** Unclear why a particular provider was chosen
- **Cost inefficiency:** Using expensive providers when cheaper alternatives suffice
- **Testing fragility:** Cannot reproduce provider selection in tests

---

## Decision

### 1. **Capabilities-Based Selection**

Provider capabilities are defined in a static `capabilities.json` file containing:
- `providerId`: Unique identifier (e.g., "yahoo", "polygon", "binance")
- `timeframes`: Supported timeframes (subset of canonical timeframes)
- `assetClasses`: Supported asset classes (e.g., "stocks", "crypto", "forex")
- `maxLookbackDays`: Maximum historical data availability
- `priority`: Numeric priority (lower = higher priority, used as tie-breaker)
- `freshnessSeconds`: Typical data staleness (0 = real-time, 900 = 15min delay)

**Rationale:**
- **Declarative:** Capabilities are configuration, not code
- **Centralized:** Single source of truth for provider metadata
- **Versionable:** Changes tracked in git, auditable
- **Testable:** Easy to snapshot-test provider selection outcomes

---

### 2. **Deterministic Selection Algorithm**

The `selectProvider()` function implements a 4-step selection process:

1. **Capability filtering:** Exclude providers that don't support required timeframe, asset class, or lookback period
2. **Freshness filtering:** Exclude providers exceeding `maxStalenessSec` threshold (if specified)
3. **Preference override:** If `preferProviderId` is specified and capable, select it immediately
4. **Priority selection:** Select the capable provider with lowest priority value

**Algorithm guarantees:**
- **Deterministic:** Same inputs → same output (no randomness, no system state)
- **Explainable:** Returns selection reason as human-readable string
- **Auditable:** Logs excluded providers with exclusion reasons

**Example:**
```typescript
const result = selectProvider(providers, {
  timeframe: "5m",
  assetClass: "stocks",
  lookbackDays: 30,
  maxStalenessSec: 60
});

// result.providerId = "polygon"
// result.reason = "Selected polygon: supports 5m timeframe, stocks asset class, 30d lookback, freshness 0s <= 60s max, priority 5"
```

---

### 3. **Freshness TTL Enforcement**

Callers can specify `maxStalenessSec` to enforce data freshness requirements:
- **Real-time use cases:** `maxStalenessSec: 5` (exclude delayed providers)
- **Backtesting:** `maxStalenessSec: undefined` (freshness irrelevant)
- **Intraday analysis:** `maxStalenessSec: 900` (15-minute delay acceptable)

Providers with `freshnessSeconds > maxStalenessSec` are excluded from selection.

**Rationale:**
- **Use-case driven:** Different workflows have different freshness needs
- **Cost optimization:** Avoid expensive real-time providers for batch jobs
- **Compliance:** Enforce freshness SLAs for production systems

---

### 4. **Priority Override Mechanism**

Callers can specify `preferProviderId` to force a specific provider (if capable):
- **Testing:** Force deterministic provider in tests
- **Cost control:** Prefer free provider when experimenting
- **Compliance:** Force specific provider for regulatory reasons

If the preferred provider is not capable, the algorithm falls back to priority selection and logs why the preference was ignored.

**Rationale:**
- **Flexibility:** Supports edge cases without complicating core algorithm
- **Safety:** Preference only applied if provider is actually capable
- **Transparency:** Logs when preference is ignored and why

---

### 5. **Comprehensive Logging**

The selection result includes:
- `providerId`: Selected provider (or `null` if none capable)
- `reason`: Human-readable selection rationale
- `excluded`: Array of excluded providers with exclusion reasons

This enables:
- **Debugging:** Understand why a particular provider was/wasn't chosen
- **Auditing:** Compliance teams can trace provider selection decisions
- **Monitoring:** Alert on unexpected provider selections

**Example log output:**
```
Selected polygon: supports 5m timeframe, stocks asset class, 30d lookback, freshness 0s <= 60s max, priority 5

Excluded providers:
- yahoo: freshness 900s exceeds max staleness 60s
- alpaca: does not support 5m timeframe
```

---

## Consequences

### Positive

- **Deterministic:** Provider selection is reproducible across environments
- **Transparent:** Selection rationale is always logged
- **Testable:** Easy to write snapshot tests for provider selection matrix
- **Flexible:** Supports both automatic selection and manual override
- **Cost-efficient:** Selects cheapest capable provider by default

### Negative

- **Static capabilities:** Provider capabilities must be manually updated in JSON
- **No runtime discovery:** Cannot auto-detect new providers or capability changes
- **Simple priority model:** No support for complex cost/latency tradeoffs

### Mitigations

- **Capabilities validation:** Future ADR will add JSON schema validation
- **Provider adapters:** Future phases will implement actual provider integrations
- **Advanced policies:** Phase 3+ can add weighted scoring, latency thresholds, etc.

---

## Alternatives Considered

### Alternative 1: Runtime Provider Discovery

**Description:** Query providers at runtime to discover capabilities.

**Rejected because:**
- Adds network I/O and latency to selection
- Makes selection non-deterministic (capabilities may change between calls)
- Complicates testing (requires mocking provider APIs)

---

### Alternative 2: Weighted Scoring Model

**Description:** Assign weights to multiple factors (cost, latency, coverage) and compute score.

**Rejected for Phase 2 because:**
- Over-engineered for current needs (simple priority suffices)
- Harder to explain and debug (numeric scores less transparent than rules)
- Can be added later if priority model proves insufficient

---

### Alternative 3: External Configuration Service

**Description:** Store capabilities in database or remote config service.

**Rejected for Phase 2 because:**
- Adds operational complexity (database dependency)
- Makes offline development harder
- Can be migrated to later without API changes

---

## References

- Issue: #22 [P2][B4] Composite selection policy
- Implementation: `packages/market-data-core/src/composite.ts`
- Capabilities: `packages/market-data-core/capabilities.json`
- Tests: `packages/market-data-core/tests/composite.test.js`
- Related ADRs:
  - ADR-0055: Market Data Core (defines Bar, Timeframe types)
  - ADR-0200: Provider Adapter Interface (future)
  - ADR-0201: Caching Strategy (future)

---

## Acceptance Criteria

- [x] `selectProvider()` function implemented with deterministic algorithm
- [x] Capabilities defined in `capabilities.json` for 5+ providers
- [x] Freshness TTL enforcement via `maxStalenessSec` parameter
- [x] Priority override via `preferProviderId` parameter
- [x] Selection result includes `reason` and `excluded` for transparency
- [ ] Snapshot tests covering provider selection matrix
- [ ] Build and tests pass (`pnpm build && pnpm test`)
- [ ] Integration with dev-scripts `check:bars` validation

---

## Decision Outcome

**Accepted** - The composite provider selection policy is approved for Phase 2.B4.

This ADR establishes the foundation for multi-provider market data fetching. Future phases will add:
- Provider adapter implementations (Yahoo, Polygon, Binance, etc.)
- Caching layer with TTL-based invalidation
- Fallback/retry logic for provider failures
- Cost tracking and optimization

The deterministic selection algorithm ensures reproducible behavior in tests, backtests, and production systems.
