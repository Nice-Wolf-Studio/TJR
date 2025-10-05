# ADR-0318: TJR Algorithmic Trading Strategy Implementation Architecture

**Status:** Proposed

**Date:** 2025-01-04

**Deciders:** Development Team

**Tags:** #architecture #trading-strategy #algorithmic-trading #tjr-methodology

---

## Context

After analyzing TJR's educational transcripts (live trading sessions, strategy explanations, and methodology breakdowns), we need to assess the gap between the current codebase capabilities and the requirements for algorithmically implementing TJR's trading strategy.

### Current State

The TJR Suite codebase currently provides:
- ✅ Market data access via Databento MCP (ES/NQ futures, real-time quotes, historical bars)
- ✅ Infrastructure (Discord bot, Supabase storage, AI integration, HTTP API)
- ✅ Data persistence (query logging, market data cache)
- ❌ **Zero algorithmic implementation of TJR's trading concepts** (~95% of trading logic missing)

### TJR's Complete Trading Methodology

Based on transcript analysis, TJR's strategy comprises 10 core components:

#### 1. **Key Level Identification**
- **Requirements:** 1-hour/4-hour highs and lows, session-based levels (Asia 18:00 ET, London 03:00 ET, NY 09:30 ET), data highs/lows from news candles
- **Gap:** No session detection, no swing high/low identification across timeframes
- **Needed:** Session classifier, swing point detection algorithm

#### 2. **Liquidity Sweep Detection**
- **Requirements:** Identify sweeps above highs (buy liquidity grab → potential reversal down) and sweeps below lows (sell liquidity grab → potential reversal up)
- **Gap:** No wick penetration detection, no liquidity pool identification
- **Needed:** Wick analysis, sweep classification, liquidity pool tracker

#### 3. **Smart Money Theory (SMT) / Intermarket Analysis**
- **Requirements:** ES vs NASDAQ divergence analysis, leading index identification (when one makes higher high while other doesn't = bearish SMT)
- **Current Capability:** ✅ Databento provides both ES and NQ data
- **Needed:** Correlation engine, divergence detection algorithms, synchronization tracker

#### 4. **Fair Value Gaps (FVG)**
- **Requirements:**
  - Three-candlestick pattern with gap between first candle's high wick and third candle's low wick (bullish FVG)
  - Imbalance detection (lack of sell orders in price range)
  - Continuation confluences (filling FVG continues trend)
  - Inverse FVGs (disrespecting FVG = trend change signal)
- **Gap:** No candlestick pattern recognition, no gap tracking/invalidation
- **Needed:** Pattern matcher, FVG state tracker, inverse FVG detector

#### 5. **Order Flow Analysis**
- **Requirements:**
  - Bullish order flow = higher highs + higher lows
  - Bearish order flow = lower lows + lower highs
  - Disrespecting order flow: break of structure, inverse FVG, 79% Fibonacci extension
  - Respecting order flow: filling FVGs, order blocks, equilibrium, breaker blocks
- **Gap:** No swing structure detection, no trend classification, no order flow state management
- **Needed:** Order flow state machine, trend classifier, confluence validator

#### 6. **Break of Structure (BOS)**
- **Requirements:**
  - Bullish BOS = candle close above most recent high
  - Bearish BOS = candle close below most recent low
  - 5-minute BOS = confirmation confluence
  - 1-minute BOS = execution signal
- **Gap:** No structure break validation
- **Needed:** Swing point detector, close validation against key levels

#### 7. **Premium/Discount Analysis**
- **Requirements:**
  - Equilibrium = 50% level from swing low to swing high
  - Above equilibrium = premium (look for shorts even in uptrend)
  - Below equilibrium = discount (look for longs)
  - Used to flip bias when at extremes
- **Gap:** No Fibonacci calculation, no zone classification
- **Needed:** Equilibrium calculator, premium/discount zone classifier

#### 8. **Multi-Timeframe Execution Model**
- **Requirements:**
  - 4-hour/1-hour: Daily bias (identify extension vs retrace phase)
  - 5-minute: Order flow direction, confirmation confluences (BOS, inverse FVG, 79% extension)
  - 5-minute: Continuation confluences (FVG, order blocks, equilibrium, breaker blocks)
  - 1-minute: Execution timeframe, final entry confirmation
- **Current Capability:** ✅ Databento provides all timeframes
- **Needed:** Timeframe coordination logic, cascade orchestration from higher to lower timeframes

#### 9. **Targeting System**
- **Requirements:**
  - Target opposite key levels (long → target highs, short → target lows)
  - Target liquidity pools in trade direction
  - Partial profit-taking at incremental levels
- **Gap:** No dynamic target calculation, no risk/reward management
- **Needed:** Target generator, position management logic

#### 10. **Daily Bias Determination**
- **Requirements:**
  - Identify extension vs retrace phase of high-timeframe trend
  - Extension + sweep = expect retrace to equilibrium
  - Retrace to discount + BOS = expect continuation/extension
  - Track range lows to range highs, monitor equilibrium fills
- **Gap:** No trend phase classifier, no bias state machine
- **Needed:** Bias calculator, trend phase detector

---

## Decision

We will implement TJR's algorithmic trading strategy in **six phased releases** over 22-32 weeks (5.5-8 months), prioritizing foundational capabilities before advanced pattern recognition and execution logic.

### Architecture Principles

1. **Evidence-first validation:** Every component validated against TJR's actual trades from transcripts
2. **Incremental deployment:** Each phase delivers testable, standalone functionality
3. **Conservative defaults:** Strict confluence requirements to prevent false signals
4. **Performance-critical design:** Real-time multi-timeframe, multi-symbol processing

### Phased Implementation Roadmap

#### **Phase 1: Foundation (4-6 weeks)**
Build core market structure analysis capabilities.

**Deliverables:**
1. Swing high/low detection algorithm (fractal or pivot-based)
2. Break of structure identification
3. Order flow classification (bullish/bearish/ranging state machine)
4. Session detection (Asia/London/NY time-based classifier)
5. Premium/discount zone calculator (Fibonacci equilibrium)

**Technical Components:**
- `@tjr/market-structure` package
  - `SwingDetector` class (fractal algorithm, configurable lookback periods)
  - `BreakOfStructureDetector` class (close validation against swing levels)
  - `OrderFlowClassifier` class (state machine: bullish/bearish/consolidation)
  - `SessionDetector` class (timezone-aware session classification)
  - `PremiumDiscountCalculator` class (Fibonacci equilibrium calculation)

**Validation:** Compare swing detection and BOS identification against TJR's 09/30/2025 trade transcript.

#### **Phase 2: Pattern Recognition (4-6 weeks)**
Implement TJR's core pattern detection.

**Deliverables:**
1. Fair Value Gap detector (3-candlestick pattern with wick gap validation)
2. Inverse FVG detector (FVG invalidation tracking)
3. Liquidity sweep identifier (wick penetration above/below key levels)
4. Key level tracker (hourly/4-hour/session/data highs and lows)
5. Relative equal highs/lows detector (level clustering with tolerance)

**Technical Components:**
- `@tjr/pattern-recognition` package
  - `FairValueGapDetector` class (3-candle pattern matcher, wick gap calculator)
  - `InverseFVGDetector` class (FVG state tracker, invalidation events)
  - `LiquiditySweepDetector` class (wick penetration analysis, sweep classifier)
  - `KeyLevelTracker` class (persistent level storage, timeframe-specific levels)
  - `RelativeEqualLevelDetector` class (clustering algorithm with configurable tolerance)

**Validation:** Detect FVGs and liquidity sweeps from 09/30/2025 transcript, verify alignment with TJR's calls.

#### **Phase 3: Multi-Symbol Analysis (3-4 weeks)**
Add ES vs NASDAQ correlation logic.

**Deliverables:**
1. SMT divergence detector (ES vs NQ higher high/low comparison)
2. Leading/lagging index identifier (which index made new extreme first)
3. Synchronization tracker (timing of sweeps, BOS across symbols)
4. Correlation score calculator

**Technical Components:**
- `@tjr/multi-symbol` package
  - `SMTDivergenceDetector` class (multi-symbol swing comparison)
  - `LeadingIndexIdentifier` class (synchronization analysis)
  - `SymbolSynchronizer` class (timestamp alignment, event correlation)
  - `CorrelationCalculator` class (rolling correlation, divergence metrics)

**Validation:** Identify SMT divergences from transcripts, compare against TJR's commentary on leading/lagging indexes.

#### **Phase 4: Daily Bias Engine (4-6 weeks)**
Build the decision-making core.

**Deliverables:**
1. Trend phase classifier (extension vs retrace identification)
2. Bias calculator (long/short/neutral determination)
3. Confluence scoring system (weighted scoring for multiple confirmations)
4. Target level generator (dynamic targets based on key levels and liquidity pools)
5. Risk/reward calculator

**Technical Components:**
- `@tjr/bias-engine` package
  - `TrendPhaseClassifier` class (extension/retrace phase detector)
  - `BiasCalculator` class (multi-timeframe bias aggregation)
  - `ConfluenceScorer` class (weighted scoring: BOS, FVG, SMT, premium/discount)
  - `TargetGenerator` class (dynamic target calculation from key levels)
  - `RiskRewardCalculator` class (position sizing, R:R validation)

**Validation:** Reconstruct daily bias for each day in transcripts, compare against TJR's stated bias.

#### **Phase 5: Execution Logic (3-4 weeks)**
Implement entry/exit coordination.

**Deliverables:**
1. 5-minute confirmation detector (BOS, inverse FVG, 79% Fibonacci extension)
2. 5-minute continuation detector (FVG fills, order blocks, equilibrium)
3. 1-minute execution trigger (final entry confirmation)
4. Entry/exit signal generator
5. Position management logic (partial profit-taking, stop-loss adjustment)

**Technical Components:**
- `@tjr/execution` package
  - `ConfirmationDetector` class (5-minute confluence aggregator)
  - `ContinuationDetector` class (5-minute respect-of-order-flow tracker)
  - `ExecutionTrigger` class (1-minute entry signal generator)
  - `SignalGenerator` class (complete entry/exit signal with metadata)
  - `PositionManager` class (partial exits, trailing stops, profit targets)

**Validation:** Generate entry signals for trades in transcripts, compare entry timing and target levels against TJR's actual executions.

#### **Phase 6: Backtesting & Validation (4-6 weeks)**
Validate against TJR's actual performance.

**Deliverables:**
1. Historical data replay system (tick-by-tick simulation)
2. Signal accuracy measurement (true positive/false positive rates)
3. Performance metrics (win rate, average R:R, max drawdown, Sharpe ratio)
4. Transcript trade comparison (09/26, 09/29, 09/30/2025 sessions)
5. Parameter tuning (optimize swing detection periods, FVG tolerances, confluence weights)

**Technical Components:**
- `@tjr/backtesting` package
  - `ReplayEngine` class (historical data simulator)
  - `AccuracyMeasurer` class (signal validation against ground truth)
  - `PerformanceAnalyzer` class (comprehensive trading metrics)
  - `TranscriptValidator` class (compare algorithm signals to TJR's calls)
  - `ParameterOptimizer` class (grid search, walk-forward validation)

**Validation:** Achieve >70% alignment with TJR's trade decisions from transcripts before production deployment.

---

## Consequences

### Positive

1. **Algorithmic replication of TJR's methodology:** Enables automated strategy execution aligned with proven trading principles
2. **Validation-driven development:** Transcripts provide ground truth for continuous validation
3. **Phased risk mitigation:** Each phase delivers testable functionality before proceeding to next layer
4. **Scalable architecture:** Modular packages enable independent testing and future enhancements
5. **Educational value:** AI can explain TJR's strategy using actual algorithmic implementation

### Negative

1. **Significant time investment:** 5.5-8 months of focused development required
2. **Subjectivity challenges:** Some of TJR's decisions based on discretion/experience (hard to codify)
3. **Parameter sensitivity:** Small changes in thresholds (swing detection, FVG tolerance) could drastically alter signals
4. **Overfitting risk:** Optimizing to past transcripts may not guarantee forward performance
5. **Real-time performance requirements:** Multi-timeframe, multi-symbol processing must execute within milliseconds

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| **Subjectivity in discretionary decisions** | Use conservative defaults, validate against multiple transcript sessions, implement manual override capability |
| **Parameter overfitting** | Walk-forward testing, out-of-sample validation, grid search with cross-validation |
| **Real-time performance degradation** | Performance profiling from Phase 1, optimize critical paths (swing detection, FVG matching), consider caching strategies |
| **Transcript data insufficient for validation** | Supplement with additional TJR content, implement A/B testing framework for continuous learning |

---

## Implementation Notes

### Team Requirements
- 2-3 developers (1 senior lead + 1-2 mid-level)
- 1 QA/tester with trading knowledge
- Access to TJR's educational content for ongoing validation

### Technology Stack
- TypeScript (strict mode, project references for incremental builds)
- Node.js test runner for unit tests
- Databento MCP for market data
- Supabase for persistent storage (key levels, FVG states, historical signals)
- Discord bot for signal notifications

### Success Criteria
- Phase 1-2: >80% accuracy in swing detection and FVG identification vs. transcripts
- Phase 3: >70% accuracy in SMT divergence detection
- Phase 4: Daily bias aligns with TJR's stated bias >75% of days
- Phase 5: Entry signals within ±2 minutes of TJR's actual entries >60% of time
- Phase 6: Overall strategy win rate >55%, average R:R >1.5, max drawdown <15%

---

## Related ADRs
- ADR-0051: Monorepo bootstrap (TypeScript project references, pnpm workspaces)
- ADR-0052: Contracts package and error taxonomy
- ADR-0059: Analysis kit pure functions and fixture testing
- ADR-0315: Market data caching layer with SQLite/PostgreSQL

---

## References
- TJR Educational Transcripts:
  - `docs/TJR Transcripts/2025-09-30 TJR Trade.txt` (live trading session with SMT, FVG, liquidity sweeps)
  - `docs/TJR Transcripts/fair value gaps.txt` (FVG methodology explanation)
  - `docs/TJR Transcripts/2024 daily bias.txt` (premium/discount, equilibrium-based bias)
  - `docs/TJR Transcripts/order flow.txt` (order flow classification, disrespecting/respecting confluences)
  - `docs/TJR Transcripts/liquidity.txt` (liquidity sweep identification)

- CLAUDE.md Section: "TJR Educational Transcripts" (lines 54-66)
