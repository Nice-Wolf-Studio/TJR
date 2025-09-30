# E2E Scenario Tests

End-to-end testing infrastructure for TJR Suite pipeline validation.

## Quick Start

```bash
# Run all scenarios
pnpm e2e

# Update snapshots
pnpm e2e:update

# Run specific scenario
pnpm e2e:scenario=01
```

## What's Tested

- Provider (fixture mode) → Composite → Cache → Analysis → TJR Tools → Execution
- Fair Value Gap detection
- Order Block identification
- Confluence scoring
- Execution zone generation
- Cache behavior (hit/miss)

## Scenarios

1. **scenario-01**: SPY trending up day (bullish)
2. **scenario-02**: QQQ ranging day (neutral)
3. **scenario-03**: Multi-timeframe analysis (5m + 1m)
4. **scenario-04**: Full execution pipeline with confluences
5. **scenario-05**: Cache behavior (cold start vs warm cache)

## Structure

```
e2e/
├── package.json          # Dependencies
├── runner.ts             # Test runner
├── specs/
│   ├── scenarios/        # Scenario definitions (JSON)
│   └── snapshots/        # Expected outputs (JSON)
└── README.md             # This file
```

## Documentation

See `/Users/jeremymiranda/Dev/TJR Project/9/tjr-suite/docs/testing/e2e.md` for comprehensive documentation.

## Performance

- Total runtime: ~3ms (all scenarios)
- Per-scenario: ~1ms
- Deterministic: 100% pass rate (no flakes)
- CI target: <2 minutes (well under target)