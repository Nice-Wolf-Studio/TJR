# ADR-0210: Backtesting CLI (v1)

**Status:** Accepted
**Date:** 2025-09-30
**Deciders:** PM Team
**Phase:** 2
**Shard:** G3

---

## Context

The TJR Suite needs a command-line tool for running analysis modules on historical bar data to validate:

- Analysis correctness and regression testing
- Performance benchmarking
- Metrics calculation (swing counts, bias, profile classification)

Without a backtesting CLI, developers must:

- Manually write test scripts for each analysis
- Lack standardized metrics output format
- Cannot easily compare analysis results across code changes

---

## Decision

### 1. **New Command: backtest**

Create a dedicated `backtest` CLI command in `@tjr-suite/dev-scripts` that:

- Loads historical bar fixtures (JSON format)
- Runs specified analysis modules (currently analysis-kit)
- Outputs deterministic metrics in JSON format
- Provides reproducible results for CI/CD integration

**Command signature:**

```bash
backtest --fixture=path.json --modules=analysis-kit [--json | --csv] [--pretty]
```

### 2. **Fixture Format**

Bar fixtures are JSON files with this structure:

```json
{
  "symbol": "ES",
  "date": "2024-10-01",
  "timeframe": "5m",
  "bars": [
    { "timestamp": 1234567890000, "open": 100, "high": 105, "low": 99, "close": 104, "volume": 15000 },
    ...
  ]
}
```

**Rationale:**

- Self-contained: All metadata (symbol, date, timeframe) included
- Standard format: Uses Bar type from analysis-kit
- Git-friendly: JSON text format, easy to diff

### 3. **Metrics Output**

The backtest command outputs these metrics for analysis-kit:

- **Swings**: Total count, HH/HL/LH/LL breakdown, swing points
- **Bias**: Bullish/bearish/neutral, confidence score
- **Profile**: Day type (trend_day, range_day, etc.), direction
- **Session extremes**: RTH open/close/high/low

**Output format:**

```json
{
  "success": true,
  "command": "backtest",
  "timestamp": "2025-09-30T12:34:56.789Z",
  "data": {
    "fixture": "examples/backtest-day.json",
    "symbol": "ES",
    "date": "2024-10-01",
    "barCount": 78,
    "modules": ["analysis-kit"],
    "metrics": {
      "swings": { "total": 12, "higherHighs": 4, ... },
      "bias": { "value": "bullish", "confidence": 0.75 },
      "profile": { "type": "trend_day", "direction": "up" }
    },
    "duration": "45ms"
  }
}
```

### 4. **Module System**

The `--modules` parameter supports:

- `analysis-kit`: Run all analysis-kit functions
- Future: `tjr-tools` when implemented (FVG, Order Blocks, etc.)
- Future: `all` to run all available modules

**Extensibility:**

- New modules can be added by extending the `runAnalysis()` function
- Each module outputs its own metrics structure
- Modules are independent and can be run in any combination

---

## Consequences

### Positive

- **Reproducible testing**: Same fixture always produces same metrics
- **CI/CD ready**: JSON output can be parsed and validated in pipelines
- **Fast iteration**: Developers can quickly validate analysis changes
- **Regression prevention**: Metrics can be snapshot-tested

### Negative

- **Limited to analysis-kit**: tjr-tools not yet implemented
- **No CSV output yet**: JSON only in v1
- **No filtering**: Runs all functions in a module (cannot select specific analyses)

### Mitigations

- **Extensibility**: Module system designed for easy addition of tjr-tools
- **CSV support**: Can be added in future version
- **Filtering**: Can add `--functions` parameter in future version

---

## Alternatives Considered

### Alternative 1: Extend replay-run.ts

**Description:** Add bar analysis mode to existing replay-run command.

**Rejected because:**

- replay-run is for text parsing (different use case)
- Mixing two different fixture formats would complicate logic
- Separate command provides clearer purpose

### Alternative 2: Python Script

**Description:** Write backtest script in Python for data science integration.

**Rejected because:**

- TypeScript maintains consistency with codebase
- Easier to import analysis-kit directly
- No additional language/runtime dependencies

---

## References

- Issue: #29 [P2][G3] Backtesting CLI (v1)
- Implementation: `packages/dev-scripts/bin/backtest.ts`
- Example fixture: `packages/dev-scripts/examples/backtest-day.json`
- Related ADRs:
  - ADR-0054: Dev-scripts toolkit
  - ADR-0059: Analysis-kit
  - ADR-0200: TJR-Tools (future)

---

## Acceptance Criteria

- [x] `backtest` command implemented
- [x] Loads bar fixtures from JSON
- [x] Runs analysis-kit functions (swings, bias, profile, sessions)
- [x] Outputs metrics in JSON format
- [x] Deterministic and reproducible results
- [x] Example fixture provided
- [ ] CSV output support (future)
- [ ] Integration tests (future)

---

## Decision Outcome

**Accepted** - The backtesting CLI (v1) is approved for Phase 2.G3.

This provides a foundation for automated analysis validation. Future versions will add:

- tjr-tools integration (FVG, Order Blocks)
- CSV output format
- Function-level filtering
- Performance profiling
- Comparative metrics across fixtures
