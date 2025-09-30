# ADR-0308: TJR Risk Management Module

**Status:** Accepted
**Date:** 2025-09-30
**Decision Makers:** PM Agent, Architect, Coder
**Issue:** #37

---

## Context

The TJR suite currently provides confluence detection (FVG + Order Block) through `@tjr/tjr-tools`, but lacks risk management capabilities essential for trade execution. Professional trading requires systematic position sizing, daily loss limits, and partial exit strategies to protect capital and maximize returns.

Key requirements:
- Calculate position size based on account risk parameters
- Track and enforce daily stop limits to prevent excessive losses
- Determine partial exit levels for scaling out of positions
- Maintain deterministic, pure function architecture
- Integrate seamlessly with existing `analyze()` function

---

## Decision

Extend `@tjr/tjr-tools` with a risk management module that:

1. **Position Sizing**: Kelly Criterion-based algorithm with safety constraints
2. **Daily Stop Tracking**: Cumulative loss tracking with timestamp-based determinism
3. **Partial Exits**: R-multiple and percentage-based exit level calculation
4. **Configuration-Driven**: All risk parameters externalized
5. **Integration**: Risk calculations appended to existing TJRToolsResult

### Module Structure

```
@tjr/tjr-tools/src/
├── risk/                           # Risk management module
│   ├── position-sizing.ts         # Position size calculator
│   ├── daily-stops.ts            # Daily loss limit tracker
│   ├── partial-exits.ts          # Exit level calculator
│   ├── risk-config.ts            # Configuration types/defaults
│   └── index.ts                   # Module exports
├── types.ts                       # Extended with RiskManagement types
└── analyze.ts                     # Extended with risk calculation
```

### Core Algorithms

#### 1. Position Sizing Algorithm

```typescript
// Kelly Criterion with safety factor
positionSize = (accountBalance × riskPerTrade × kellyFraction) / stopLossDistance

Where:
- kellyFraction = min(winRate × avgWin / avgLoss - lossRate, maxKelly)
- maxKelly = 0.25 (safety constraint)
- Fallback to fixed percentage if insufficient history
```

#### 2. Daily Stop Tracking

```typescript
interface DailyStopState {
  date: string;              // YYYY-MM-DD in account timezone
  realizedLoss: number;      // Cumulative loss for the day
  openRisk: number;          // Risk from open positions
  remainingCapacity: number; // Available risk budget
  isLimitReached: boolean;  // Trading allowed flag
}

// Deterministic calculation based on timestamp
dailyStopState = calculateDailyStop(
  trades,          // Historical trades with timestamps
  currentTime,     // Analysis timestamp
  dailyLimit,      // Max daily loss
  accountTimezone  // For day boundary calculation
)
```

#### 3. Partial Exit Strategy

```typescript
interface PartialExitLevel {
  price: number;           // Exit price
  quantity: number;        // Shares/contracts to exit
  rMultiple: number;       // Risk multiple (1R, 2R, etc.)
  reason: string;          // Exit rationale
}

// R-multiple based exits (default)
exits = [
  { rMultiple: 1.0, percentage: 33 },  // Take 1/3 at 1R
  { rMultiple: 2.0, percentage: 33 },  // Take 1/3 at 2R
  { rMultiple: 3.0, percentage: 34 }   // Take final 1/3 at 3R
]

// Alternative: Fibonacci-based or custom levels
```

### Configuration Schema

```typescript
interface RiskConfig {
  account: {
    balance: number;              // Current account balance
    currency: 'USD' | 'EUR' | 'GBP';
    timezone: string;             // IANA timezone for daily stops
  };

  perTrade: {
    maxRiskPercent: number;       // Max risk per trade (default: 1%)
    maxRiskAmount?: number;       // Absolute max risk in currency
    kellyFraction?: number;       // Kelly safety factor (default: 0.25)
    useKelly: boolean;            // Enable Kelly sizing (default: false)
  };

  dailyLimits: {
    maxLossPercent: number;       // Max daily loss % (default: 3%)
    maxLossAmount?: number;       // Absolute max daily loss
    maxConsecutiveLosses?: number;// Stop after N losses (optional)
    includeFees: boolean;         // Include fees in loss calc
  };

  partialExits: {
    strategy: 'r-multiple' | 'percentage' | 'fibonacci' | 'custom';
    levels: Array<{
      trigger: number;            // Price or R-multiple
      exitPercent: number;        // Position % to exit
    }>;
    trailStop?: {
      activate: number;           // Activation level (R-multiple)
      distance: number;           // Trail distance (ATR or %)
    };
  };

  constraints: {
    minPositionSize: number;      // Minimum viable position
    maxPositionPercent: number;   // Max % of account in one position
    roundLots: boolean;           // Round to lot sizes
    lotSize?: number;             // Standard lot size
  };
}
```

### Integration with analyze()

```typescript
// Extended TJRToolsResult
export interface TJRToolsResult {
  // Existing fields
  confluence: TJRConfluence;
  fvgZones: FVGZone[];
  orderBlocks: OrderBlock[];

  // New risk management fields
  riskManagement?: {
    positionSize: {
      shares: number;             // Calculated position size
      dollarRisk: number;         // Dollar amount at risk
      percentRisk: number;        // Percentage of account
      method: 'fixed' | 'kelly';  // Sizing method used
    };

    dailyStop: {
      currentLoss: number;        // Today's loss so far
      remainingCapacity: number;  // Available risk budget
      isLimitReached: boolean;    // Trading allowed
      resetTime: string;          // Next reset (ISO 8601)
    };

    partialExits: Array<{
      price: number;              // Exit price level
      quantity: number;           // Shares to exit
      rMultiple: number;          // Risk multiple
      cumulative: number;         // Cumulative exit %
    }>;

    warnings: string[];           // Risk-specific warnings
  };
}

// Extended analyze() signature
export function analyze(
  input: TJRAnalysisInput,
  options?: AnalyzeOptions & { risk?: RiskConfig }
): TJRToolsResult
```

---

## Consequences

### Positive

✅ **Capital Protection**: Systematic risk limits prevent catastrophic losses
✅ **Optimal Sizing**: Kelly Criterion maximizes long-term growth
✅ **Profit Optimization**: Partial exits capture gains while maintaining exposure
✅ **Deterministic**: Pure functions ensure reproducible calculations
✅ **Configurable**: Flexible parameters for different trading styles
✅ **Non-Breaking**: Optional extension to existing API

### Negative

⚠️ **Complexity**: Risk calculations add computational overhead
⚠️ **Configuration Burden**: Many parameters to understand and set
⚠️ **Historical Data**: Kelly sizing requires win/loss statistics
⚠️ **Time Zone Handling**: Daily stops require careful timezone management

### Mitigations

- Provide sensible defaults for all configuration parameters
- Fall back to fixed percentage sizing when history insufficient
- Cache expensive calculations (ATR, moving averages)
- Validate all risk parameters to prevent dangerous configurations
- Include comprehensive warnings for edge cases

---

## Implementation Notes

### Phase 1: Core Risk Functions
1. Implement position sizing with fixed percentage method
2. Add daily stop tracking with basic limits
3. Create R-multiple partial exit calculator
4. Unit tests for each pure function

### Phase 2: Advanced Features
1. Kelly Criterion position sizing
2. Fibonacci and custom exit strategies
3. Trailing stop activation
4. Integration tests with analyze()

### Phase 3: Optimization
1. Performance profiling and optimization
2. Caching layer for repeated calculations
3. Batch processing for multiple symbols
4. Documentation and examples

### Testing Strategy

```typescript
// Test categories
1. Unit Tests:
   - Position sizing edge cases (min/max constraints)
   - Daily stop calculations across day boundaries
   - Partial exit level calculations
   - Configuration validation

2. Integration Tests:
   - analyze() with risk config
   - Multiple timeframes
   - Edge cases (no bars, single bar, etc.)

3. Property-Based Tests:
   - Position size never exceeds max risk
   - Daily losses never exceed limit
   - Partial exits sum to 100%
```

---

## Trade-offs

### Chosen Approach vs Alternatives

**Position Sizing:**
- ✅ Kelly Criterion: Mathematically optimal for long-term growth
- ❌ Fixed Fractional: Simpler but suboptimal
- ❌ Martingale: Dangerous, increases risk after losses

**Daily Stops:**
- ✅ Timestamp-based: Deterministic and testable
- ❌ Wall-clock based: Non-deterministic, hard to test
- ❌ Trade-count based: Ignores time dimension

**Partial Exits:**
- ✅ R-multiple: Intuitive risk-based framework
- ❌ Fixed prices: Not adaptive to volatility
- ❌ Time-based: Ignores price action

---

## Future Enhancements

1. **Portfolio Risk**: Multi-position correlation and exposure limits
2. **Dynamic Sizing**: Volatility-adjusted position sizing
3. **Risk Parity**: Equal risk allocation across positions
4. **Monte Carlo**: Simulation-based risk analysis
5. **ML Integration**: Pattern-based risk adjustment
6. **Real-time Monitoring**: WebSocket-based risk alerts

---

## References

- Issue: #37 [P3][F3] TJR Risk Management Module
- Package: `@tjr/tjr-tools` v0.2.0 (extending v0.1.0)
- Dependencies: @tjr/contracts (workspace)
- Kelly Criterion: https://en.wikipedia.org/wiki/Kelly_criterion
- R-Multiples: Van Tharp's "Trade Your Way to Financial Freedom"