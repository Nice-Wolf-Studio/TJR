# ADR-0307: TJR Execution - 5m Confirmation + 1m Entry

## Status

Accepted

## Context

The TJR Suite requires execution logic to generate actionable trade parameters (`TJRExecution` DTO) from confluence analysis. The challenge is determining when and how to trigger trades based on technical setups while managing risk appropriately.

Key requirements:

- Generate precise entry, stop loss, and take profit levels
- Support multi-timeframe analysis for better timing
- Provide configurable thresholds for different trading styles
- Calculate position sizes based on risk management rules
- Maintain deterministic, testable logic

The execution system must bridge the gap between confluence detection (Issue #28) and actual trade placement, providing clear, actionable parameters that downstream systems can execute.

## Decision

We implement a **two-stage execution approach** using multiple timeframes:

### 1. Five-Minute Confirmation Stage

The 5-minute timeframe provides the primary setup confirmation:

- Confluence score must exceed configurable threshold (default: 70)
- Required factors can be specified (e.g., both FVG and Order Block present)
- Looks back up to N bars for valid confirmation (default: 20)
- Determines trade direction based on zone types and price action

### 2. One-Minute Entry Stage

The 1-minute timeframe provides precise entry timing:

- Must occur within N bars of 5m confirmation (default: 5)
- Can require price to be within active zones
- Uses price action signals for entry (breakouts/breakdowns)
- Provides optimal entry price within zones

### 3. Price Level Calculation

Stop loss placement uses a hierarchy:

1. **Zone-based**: Below demand zones (long) or above supply zones (short)
2. **Structure-based**: Beyond recent swing highs/lows
3. **Percentage-based**: Default fallback (1.5% from entry)

Take profit uses risk-reward ratio (default: 2.0).

### 4. Position Sizing

Position size calculation based on:

- Maximum risk per trade (default: 1% of account)
- Account size (optional - returns normalized value if not provided)
- Confidence level adjustment (high=100%, medium=75%, low=50%)

### 5. Configuration System

Three preset configurations:

- **Conservative**: Higher thresholds, lower risk (0.5% risk, 80+ score)
- **Default**: Balanced approach (1% risk, 70+ score)
- **Aggressive**: Lower thresholds, higher risk (2% risk, 60+ score)

## Alternatives Considered

### Alternative 1: Single Timeframe Execution

Use only the 5-minute timeframe for both confirmation and entry.

**Rejected because:**

- Less precise entry points
- Higher slippage on entries
- Missed opportunities for better risk-reward
- Can't distinguish between setup and trigger

### Alternative 2: Fixed Thresholds

Hard-code execution thresholds rather than making them configurable.

**Rejected because:**

- Different symbols require different thresholds
- Market conditions change over time
- Prevents strategy optimization
- Limits user flexibility

### Alternative 3: Separate Analysis Passes

Run analyze() twice - once for 5m, once for 1m.

**Rejected because:**

- Inefficient - duplicates confluence detection
- Complex coordination between passes
- Harder to maintain state between calls
- API becomes more complex

### Alternative 4: Async Execution Monitoring

Make execution logic async to wait for entry conditions.

**Rejected because:**

- Breaks pure function paradigm
- Introduces timing complexities
- Harder to test deterministically
- Not suitable for backtesting

## Consequences

### Positive

1. **Clear Separation of Concerns**: Confirmation vs entry logic separated
2. **Flexible Configuration**: Supports different trading styles
3. **Risk Management**: Built-in position sizing and stop placement
4. **Testable**: Pure functions enable comprehensive testing
5. **Multi-Timeframe**: Better entry precision with 1m timing
6. **Zone Integration**: Leverages FVG and Order Block detection
7. **Extensible**: Easy to add new confirmation criteria

### Negative

1. **Requires Multiple Bar Arrays**: Need both 5m and 1m data
2. **Increased Complexity**: Two-stage logic more complex than single
3. **Configuration Surface**: Many parameters to tune
4. **No Partial Fills**: Assumes all-or-nothing position entry

### Neutral

1. **Account Size Optional**: Works with or without account context
2. **Direction Detection**: Automated but may need override option
3. **Fixed R:R**: Uses configured ratio rather than dynamic targets

## Implementation Details

### Module Structure

```
src/execution/
├── config.ts           # Configuration and presets
├── confirmation.ts     # 5m confirmation logic
├── entry.ts           # 1m entry logic
├── price-levels.ts    # Stop loss and take profit
├── position-sizing.ts # Position and confidence
├── execution-builder.ts # DTO assembly
└── index.ts          # Exports
```

### API Integration

The `analyze()` function accepts optional `ExecutionConfig` and `bars1m`:

```typescript
analyze(input, {
  execution: config,
  bars1m: oneMinuteBars,
});
```

### Type Safety

All types properly defined in `types.ts` with full JSDoc documentation.
No `any` types used except where explicitly prefixed with underscore for unused parameters.

## Risks and Mitigations

### Risk 1: Timeframe Synchronization

**Risk**: 5m and 1m bars might not align properly.
**Mitigation**: Use timestamps for coordination, validate time ranges.

### Risk 2: Zone Invalidation

**Risk**: Zones might be invalidated between confirmation and entry.
**Mitigation**: Recheck zone validity at entry time.

### Risk 3: Configuration Overfitting

**Risk**: Users might overfit configurations to historical data.
**Mitigation**: Provide sensible defaults, document best practices.

### Risk 4: Missing 1-Minute Data

**Risk**: 1m bars might not be available.
**Mitigation**: Gracefully degrade to 5m-only execution with warning.

## References

- Issue #36: [P3][F2] TJR execution: 5m confirmation + 1m entry
- Issue #28: TJR-Tools confluences (provides zones)
- Issue #27: TJR-Tools skeleton (base implementation)
- PR #56: Implementation pull request
- TJRExecution DTO: Defined in @tjr/contracts

## Decision Makers

- Author: Nice Wolf Studio
- Date: 2024-09-30
- Review: Pending PR approval
