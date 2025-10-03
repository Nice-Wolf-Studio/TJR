# ADR-0209: TJR Confluences (Fair Value Gap & Order Block Detection)

**Status:** Accepted
**Date:** 2025-09-30
**Decision Makers:** PM Agent, Architect, Coder
**Issue:** #28

---

## Context

TJR (Trading Journal Research) methodology requires systematic detection of market confluences to identify high-probability trading setups. Two fundamental confluence types needed implementation:

1. **Fair Value Gaps (FVG)**: Price inefficiencies where market moved quickly, leaving gaps
2. **Order Blocks (OB)**: Institutional supply/demand zones marked by high volume and rejection

These patterns help traders identify where institutional orders may be resting and where price is likely to react.

---

## Decision

Create a new dedicated package `@tjr/tjr-tools` that provides:

1. **FVG Detector**: 3-bar pattern recognition for bullish/bearish gaps
2. **Order Block Detector**: Volume + rejection-based zone identification
3. **Confluence Scoring**: Weighted algorithm combining multiple factors
4. **Main Orchestrator**: `analyze()` function returning TJRConfluence results

### Architecture

```
@tjr/tjr-tools/
├── src/
│   ├── confluences/       # Pattern detectors
│   │   ├── fvg.ts         # Fair Value Gap detection
│   │   └── order-block.ts # Order Block detection
│   ├── scoring/           # Confluence scoring engine
│   │   ├── scorer.ts      # Weighted scoring algorithm
│   │   └── weights.ts     # Default weight configuration
│   ├── utils/             # Shared utilities
│   │   ├── price-utils.ts # ATR, volume MA, etc.
│   │   └── validation.ts  # Input validation
│   ├── types.ts           # Internal type definitions
│   ├── analyze.ts         # Main orchestrator
│   └── index.ts           # Public API exports
├── tests/                 # Test suite (7 tests)
├── __fixtures__/          # Golden fixtures for testing
└── package.json
```

###Scoring Algorithm

Weighted confluence score (0-100):

- **FVG factor (40%)**: Average strength of unfilled gaps
- **Order Block factor (30%)**: Average strength of unmitigated blocks
- **Overlap factor (20%)**: Percentage of zones that overlap
- **Recency factor (10%)**: Based on most recent zone formation

### Pattern Detection

**Fair Value Gap:**

- 3-bar pattern: gap between bar[i-1] and bar[i+1]
- Minimum gap size: 0.5 × ATR (configurable)
- Strength based on: gap size (70%), volume (30%)
- Tracks whether gap has been filled

**Order Block:**

- Last bearish bar before bullish move (demand) or vice versa (supply)
- Minimum volume: 1.5× average (configurable)
- Minimum rejection: 30% of bar range (configurable)
- Strength based on: volume (40%), rejection (30%), range (30%)
- Tracks whether block has been mitigated

---

## Consequences

### Positive

✅ **Systematic Detection**: Removes subjective pattern identification
✅ **Quantified Signals**: Numeric confluence scores enable automated decision-making
✅ **Pure Functions**: Deterministic, testable, no side effects
✅ **Type Safety**: Full TypeScript integration with @tjr/contracts
✅ **Extensible**: Easy to add new confluence types

### Negative

⚠️ **False Positives**: Patterns may appear in ranging markets
⚠️ **Tuning Required**: Thresholds and weights may need market-specific adjustment
⚠️ **Computational Cost**: Pattern detection is O(n) per bar

### Mitigations

- Conservative default thresholds (ATR-based sizing, volume ratios)
- Confluence scoring requires multiple factors for high scores
- Performance tested: ~45ms for typical datasets
- All parameters configurable via options

---

## Implementation Notes

- **Dependencies**: @tjr/contracts (workspace dependency)
- **Module System**: ES Modules (type: "module")
- **Testing**: 7 tests, 100% pass rate, determinism verified
- **Build**: TypeScript → ES2022
- **Exports**: Named exports via package index

---

## Future Enhancements

1. Additional confluence types (Support/Resistance, Fibonacci)
2. Multi-timeframe analysis
3. Volume profile integration
4. Machine learning-based strength scoring
5. Real-time streaming support

---

## References

- Issue: #28 [P2][F1] TJR-Tools confluences (FVG + Order Block)
- Package: `@tjr/tjr-tools` v0.1.0
- Tests: 7/7 passing
- Build: Successful with TypeScript strict mode
