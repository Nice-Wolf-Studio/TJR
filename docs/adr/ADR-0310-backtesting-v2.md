# ADR-0310: Backtesting CLI v2 (Metrics & Reports)

## Status
Accepted

## Context

The existing `replay-run` CLI is a stub implementation that needs to be upgraded to provide comprehensive backtesting capabilities with real metrics computation. The system needs to:

1. **Run actual analysis modules** on historical data (analysis-kit, tjr-tools)
2. **Compute meaningful metrics** for evaluating trading strategies
3. **Output results in multiple formats** (JSON, CSV, text summary)
4. **Provide deterministic results** for regression testing and CI/CD
5. **Support multiple analysis modules** with consistent interface

Key requirements:
- Hit-rate metrics to measure signal accuracy
- Precision@K metrics for ranked predictions
- Latency metrics for performance benchmarking
- CSV output for data analysis and spreadsheets
- Deterministic text summaries for human review
- Integration with both analysis-kit and tjr-tools packages

## Decision

We implement **Backtesting CLI v2** with the following architecture:

### 1. Metrics Computation System

**Core Metrics Module** (`src/metrics/`):

#### Hit-Rate Metrics
- Measures success rate of trading signals
- For execution signals: `successful_trades / total_trades * 100`
- Tracks wins, losses, and breakeven trades
- Separate hit-rates for long and short trades

#### Precision@K Metrics
- Measures relevance of top-K ranked items
- For confluence zones: Are the highest-scored zones actually valid?
- Formula: `relevant_items_in_top_k / k * 100`
- Computed at K=[1, 3, 5, 10]

#### Latency Metrics
- Measures execution performance
- Tracks: min, max, mean, median, p95, p99
- Per-bar latency and total duration
- Useful for performance regression testing

#### Signal Counts
- FVGs detected (bullish/bearish)
- Order blocks detected (demand/supply)
- Execution triggers generated
- Confluence score distribution

### 2. Multi-Format Output

#### JSON Output (Default)
```json
{
  "success": true,
  "command": "replay-run",
  "timestamp": "2025-09-30T12:34:56.789Z",
  "data": {
    "fixture": "samples/day.json",
    "symbol": "ES",
    "barCount": 78,
    "modules": ["analysis-kit", "tjr-tools"],
    "metrics": {
      "hitRate": {
        "overall": 65.5,
        "long": 70.0,
        "short": 60.0,
        "totalSignals": 45,
        "successful": 29,
        "failed": 16
      },
      "precisionAtK": {
        "k1": 100.0,
        "k3": 66.7,
        "k5": 60.0,
        "k10": 50.0
      },
      "latency": {
        "min": 0.5,
        "max": 15.2,
        "mean": 3.4,
        "median": 2.8,
        "p95": 8.5,
        "p99": 12.1,
        "total": 265.2
      },
      "signals": {
        "fvgs": 12,
        "orderBlocks": 8,
        "executions": 5,
        "avgConfluence": 72.3
      }
    },
    "summary": "65.5% hit-rate | 5 executions | 265ms total"
  }
}
```

#### CSV Output
```csv
symbol,date,barCount,hitRate,totalSignals,successful,precisionK1,precisionK5,latencyMean,latencyP95
ES,2024-10-01,78,65.5,45,29,100.0,60.0,3.4,8.5
```

#### Text Summary (Deterministic)
```
=== Backtest Summary ===
Fixture: samples/day.json
Symbol: ES | Date: 2024-10-01 | Bars: 78
Modules: analysis-kit, tjr-tools

Hit-Rate: 65.5% (29/45 signals)
  Long:  70.0% (14/20)
  Short: 60.0% (15/25)

Precision@K:
  @1: 100.0% | @3: 66.7% | @5: 60.0% | @10: 50.0%

Latency (ms):
  Mean: 3.4 | P95: 8.5 | Total: 265.2

Signals:
  FVGs: 12 | Order Blocks: 8 | Executions: 5
  Avg Confluence: 72.3
```

### 3. Module Integration

**Supported Modules:**

#### analysis-kit
- Swing detection (HH, HL, LH, LL)
- Daily bias calculation
- Day profile classification
- Session extremes extraction

#### tjr-tools
- Fair Value Gap (FVG) detection
- Order Block detection
- Confluence scoring
- Execution trigger generation

**Module Interface:**
```typescript
interface ModuleResult {
  name: string;
  signals: Signal[];
  metrics: ModuleMetrics;
  latency: number;
}
```

### 4. Fixture Format

**Extended Bar Fixture** with expected outcomes:
```json
{
  "symbol": "ES",
  "date": "2024-10-01",
  "timeframe": "5m",
  "bars": [
    {
      "timestamp": "2024-10-01T09:30:00Z",
      "open": 5850.25,
      "high": 5855.50,
      "low": 5848.00,
      "close": 5852.75,
      "volume": 15234
    }
  ],
  "expected": {
    "fvgCount": 2,
    "orderBlockCount": 3,
    "executionCount": 1,
    "hitRate": 66.7
  }
}
```

## Alternatives Considered

### Alternative 1: Separate CSV Command
Create a separate `replay-csv` command for CSV output.

**Rejected because:**
- Duplicates logic and testing
- Harder to maintain consistency
- Users expect format flags, not separate commands
- Increases documentation burden

### Alternative 2: Streaming Metrics
Process bars in streaming fashion, emitting metrics incrementally.

**Rejected because:**
- More complex implementation
- Harder to test deterministically
- Most fixtures fit in memory
- Can be added later if needed

### Alternative 3: Embedded Expectations in Bars
Include expected results in each bar object.

**Rejected because:**
- Clutters fixture data
- Makes fixtures harder to generate
- Not all bars have expectations
- Top-level `expected` is cleaner

### Alternative 4: Separate Metrics Package
Create `@tjr/metrics` as standalone package.

**Rejected because:**
- Metrics are dev-tools specific
- Adds deployment complexity
- No external consumers planned
- Can be extracted later if needed

## Consequences

### Positive

1. **Comprehensive Testing**: Real metrics enable proper strategy validation
2. **Regression Detection**: Deterministic output catches unintended changes
3. **Performance Tracking**: Latency metrics identify performance regressions
4. **Data Analysis**: CSV export enables analysis in Excel/Python/R
5. **CI/CD Integration**: JSON output easily parsed by automation
6. **Multi-Module Support**: Consistent interface for adding new analysis modules
7. **Human-Readable**: Text summaries for quick manual review

### Negative

1. **Increased Complexity**: More code to maintain than stub version
2. **Module Dependencies**: Depends on analysis-kit and tjr-tools implementations
3. **Fixture Management**: Need to maintain expected outcomes in fixtures
4. **Breaking Changes**: May need to update fixtures when analysis logic changes

### Neutral

1. **CSV Format**: Simple flat structure, not hierarchical
2. **Determinism**: Requires careful handling of floating-point precision
3. **Module Selection**: Default to all modules or require explicit selection?

## Implementation Details

### Module Structure
```
packages/dev-scripts/
├── bin/
│   └── replay-run.ts      # Upgraded CLI
├── src/
│   ├── cli-utils.ts       # Existing utilities
│   ├── metrics/
│   │   ├── hit-rate.ts    # Hit-rate calculation
│   │   ├── precision.ts   # Precision@K calculation
│   │   ├── latency.ts     # Latency tracking
│   │   └── index.ts       # Metrics exports
│   └── formatters/
│       ├── csv.ts         # CSV output formatter
│       ├── summary.ts     # Text summary generator
│       └── index.ts       # Formatter exports
├── fixtures/
│   └── samples/
│       ├── day.json       # Full trading day
│       ├── swing.json     # Swing detection test
│       └── execution.json # Execution trigger test
└── tests/
    └── replay-run.test.js # Comprehensive tests
```

### Determinism Guarantees

1. **Floating-Point Precision**: Round to 1 decimal place for display
2. **Array Ordering**: Sort by timestamp, then by type
3. **Random Seeds**: No randomness in metrics computation
4. **Date Handling**: Use ISO 8601 strings consistently
5. **Module Order**: Process in alphabetical order

### Performance Targets

- < 5ms per bar for analysis-kit
- < 10ms per bar for tjr-tools
- < 100ms total for 78-bar day (5-minute bars, 6.5 hours)
- CSV export: < 10ms for 100 rows

## Risks and Mitigations

### Risk 1: Module API Changes
**Risk**: analysis-kit or tjr-tools API changes break replay-run.
**Mitigation**: Use type imports, comprehensive tests, version pinning.

### Risk 2: Non-Deterministic Results
**Risk**: Floating-point arithmetic leads to inconsistent results.
**Mitigation**: Round all displayed metrics, use integer counts where possible.

### Risk 3: Large Fixtures
**Risk**: Large fixtures (1000+ bars) cause memory issues.
**Mitigation**: Document limits, add streaming support if needed later.

### Risk 4: CSV Schema Changes
**Risk**: Adding metrics breaks existing CSV parsers.
**Mitigation**: Version CSV format, add new columns at end only.

## References

- Issue #39: [P3][G3-v2] Backtesting CLI v2 (metrics & reports)
- ADR-0054: Dev-scripts package design
- ADR-0208: TJR-Tools confluences
- ADR-0307: TJR-Tools execution
- `packages/dev-scripts/bin/backtest.ts` - Reference implementation
- `packages/dev-scripts/bin/replay-run.ts` - Stub to be upgraded

## Decision Makers

- Author: AI PM Agent (Nice Wolf Studio)
- Date: 2025-09-30
- Review: Pending PR approval

## Validation

### Acceptance Criteria

1. ✅ Hit-rate metrics computed for all fixtures
2. ✅ Precision@K metrics at K=[1,3,5,10]
3. ✅ Latency metrics with min/max/p95/p99
4. ✅ JSON output with full metric structure
5. ✅ CSV output with deterministic rows
6. ✅ Text summary with human-readable format
7. ✅ Support for --modules=analysis-kit,tjr-tools
8. ✅ Sample fixtures with expected outputs
9. ✅ Tests for metric invariants
10. ✅ Deterministic snapshot tests

### Validation Commands

```bash
# Run with analysis-kit
pnpm --filter @tjr/dev-scripts replay:run \
  --fixture fixtures/samples/day.json \
  --modules analysis-kit \
  --json > out-kit.json

# Run with tjr-tools
pnpm --filter @tjr/dev-scripts replay:run \
  --fixture fixtures/samples/day.json \
  --modules tjr-tools \
  --json > out-tools.json

# Run with both modules
pnpm --filter @tjr/dev-scripts replay:run \
  --fixture fixtures/samples/day.json \
  --modules analysis-kit,tjr-tools \
  --csv > out.csv

# Pretty output
pnpm --filter @tjr/dev-scripts replay:run \
  --fixture fixtures/samples/day.json \
  --modules tjr-tools \
  --pretty
```