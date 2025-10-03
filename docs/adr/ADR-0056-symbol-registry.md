# ADR-0056: Symbol Registry & Continuous Mapping

**Status:** Accepted
**Date:** 2025-09-29
**Deciders:** Architecture Team
**Phase:** 51
**Shard:** B2

---

## Context

Trading systems require consistent symbol representation across:

- Multiple data vendors (each with different symbol formats)
- Continuous futures contracts (e.g., ES1!, NQ1!) that roll over quarterly
- Historical and real-time data feeds
- Order routing and execution systems

Without a canonical symbol registry, we face:

- Symbol format inconsistencies across systems
- Manual tracking of futures rollover dates
- Data discontinuities at contract expiration
- Complex vendor-specific symbol mapping logic scattered throughout codebase
- Inability to reconstruct continuous price series across rollover dates

---

## Decision

### 1. **Canonical Symbol Format**

We will establish a **canonical symbol representation** for all instruments.

**Rationale:**

- **Consistency:** Single source of truth for symbol representation
- **Normalization:** Vendor symbols map to canonical format on ingestion
- **Simplicity:** Business logic operates on canonical symbols only
- **Extensibility:** New vendors map to existing canonical symbols

**Examples:**

- `ES` = E-mini S&P 500 (continuous front month)
- `ESH25` = E-mini S&P 500 March 2025 contract
- `NQ` = E-mini NASDAQ 100 (continuous front month)
- `AAPL` = Apple Inc. stock

---

### 2. **Symbol Normalization**

Function `normalizeSymbol(raw: string): CanonicalSymbol` standardizes vendor-specific formats.

**Rationale:**

- **Vendor abstraction:** Handles differences in symbol conventions
- **Validation:** Rejects malformed or unknown symbols
- **Type safety:** Returns strongly-typed canonical representation

**Mapping examples:**

| Vendor Format       | Canonical |
| ------------------- | --------- |
| `ES=F` (Yahoo)      | `ES`      |
| `@ES` (IQFeed)      | `ES`      |
| `/ES` (TradingView) | `ES`      |
| `ESH2025` (CME)     | `ESH25`   |

---

### 3. **Continuous Futures Resolution**

Function `resolveContinuous(root: string, date: Date): ContractCode` resolves continuous symbols to specific contracts.

**Rationale:**

- **Historical accuracy:** Reconstruct which contract was "front month" at any date
- **Rollover handling:** Deterministic contract switching based on rules
- **Backtesting support:** Time-travel to historical contract selections

**Rollover policy:**

- **Trigger:** Volume/open interest crossover OR fixed days before expiration
- **Priority:** Volume threshold takes precedence (e.g., when new contract exceeds 60% of total volume)
- **Fallback:** 5 business days before expiration if volume data unavailable

**Implementation:**

- `rollover-rules.json` defines per-symbol policies
- Default policy: volume-based with 5-day fallback
- Override mechanism for special cases (e.g., VIX futures)

---

### 4. **Symbol Aliases**

Module `aliases.ts` provides bidirectional symbol mapping.

**Rationale:**

- **Backward compatibility:** Support legacy symbol formats
- **Vendor ingestion:** Map vendor symbols to canonical without complex logic
- **User flexibility:** Accept common symbol variations

**Examples:**

```typescript
ES → ES         // Canonical
ES=F → ES       // Yahoo Finance
@ES → ES        // IQFeed
/ES → ES        // TradingView
```

---

### 5. **Rollover Configuration**

JSON configuration file `data/rollover-rules.json` defines rollover behavior per symbol.

**Rationale:**

- **Declarative:** Non-code changes to rollover policy
- **Auditable:** Version-controlled rollover rule changes
- **Flexible:** Per-symbol customization (e.g., VIX vs. ES)

**Structure:**

```json
{
  "ES": {
    "type": "volume",
    "threshold": 0.6,
    "fallbackDays": 5,
    "expirationDay": "third-friday"
  },
  "VX": {
    "type": "fixed-days",
    "daysBeforeExpiration": 8,
    "expirationDay": "wednesday-before-third-friday"
  }
}
```

---

## Alternatives Considered

### Vendor-Specific Symbol Handling

**Pros:**

- No normalization overhead
- Direct pass-through to data feeds

**Cons:**

- Vendor lock-in (business logic tied to vendor formats)
- Complex switching between data providers
- Inconsistent symbol handling across codebase

**Decision:** Rejected. Abstraction layer worth the normalization cost.

---

### Real-Time Rollover Detection

**Pros:**

- Always uses actual market volume/OI data
- No pre-configured rules needed

**Cons:**

- Requires real-time data feeds (cost + complexity)
- Non-deterministic for backtesting (historical rollover dates must be stored)
- Latency in detecting rollover (could miss data)

**Decision:** Rejected for primary strategy. Supported as validation mechanism only.

---

### Hard-Coded Rollover Dates

**Pros:**

- Simple implementation
- Fast lookups

**Cons:**

- Manual maintenance required
- Brittle (changes require code deploy)
- No policy flexibility (fixed vs. volume-based)

**Decision:** Rejected. Configuration-driven approach more maintainable.

---

## Risks and Mitigations

### Risk 1: Incorrect rollover dates cause data discontinuities

**Impact:** Trading strategies receive stitched price series with artificial gaps
**Mitigation:**

- Comprehensive test fixtures covering known historical rollover dates
- Validation against vendor-provided continuous contracts (e.g., `ES1!` from IQFeed)
- Alert system for volume/OI anomalies at rollover boundaries

---

### Risk 2: Symbol normalization rejects valid vendor symbols

**Impact:** Data ingestion failures for legitimate symbols
**Mitigation:**

- Extensive vendor symbol mapping in aliases.ts
- Logging of rejected symbols for manual review
- Graceful degradation (pass-through mode for unknown symbols with warning)

---

### Risk 3: New futures contracts not in configuration

**Impact:** Continuous resolution fails for newly listed instruments
**Mitigation:**

- Default rollover policy applied to unrecognized roots
- Monitoring alerts for unknown symbols
- Quarterly review of CME contract listings

---

### Risk 4: Configuration drift from actual market behavior

**Impact:** Volume thresholds or expiration rules become outdated
**Mitigation:**

- Annual review of rollover-rules.json against actual market data
- Version control tracks all configuration changes with rationale
- ADR updates document rule changes (e.g., ADR-00XX: VIX rollover adjustment)

---

## Rollback Plan

If canonical symbol system proves unworkable:

1. **Vendor pass-through mode:** Add flag to disable normalization
2. **Direct symbol storage:** Store vendor symbols as-is in database
3. **Downstream adaptation:** Market-data consumers handle vendor formats directly
4. **Deprecation period:** 2 sprints to migrate existing canonical symbol references

**Estimated effort:** 1 week (mostly downstream consumer updates)

---

## Success Metrics

1. **Normalization coverage:** 100% of ingested symbols resolve to canonical format
2. **Rollover accuracy:** 95%+ agreement with vendor continuous contracts (e.g., `ES1!` from IQFeed)
3. **Backtest continuity:** Zero artificial gaps in continuous series across 10+ years of historical data
4. **Performance:** Symbol normalization < 1μs per call (cached lookups)

---

## References

- [CME Futures Contract Specifications](https://www.cmegroup.com/trading/equity-index/us-index/e-mini-sandp500_contract_specifications.html)
- [IQFeed Symbol Guide](http://www.iqfeed.net/symbolguide/)
- [Futures Rollover Best Practices (QuantConnect)](https://www.quantconnect.com/docs/v2/writing-algorithms/reality-modeling/futures-contracts/continuous-contracts)

---

## Changelog

- **2025-09-29:** Initial ADR created (Phase 51, Shard B2)
