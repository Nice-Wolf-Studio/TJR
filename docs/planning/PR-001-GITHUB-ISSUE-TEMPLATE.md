# Premium/Discount Calculator Implementation

**Labels:** `enhancement`, `phase-53`, `pr-1-premium-discount`, `critical`
**Milestone:** Phase 53 - TJR Strategy Foundation
**Assignee:** TBD
**Estimate:** 8-12 hours

---

## Overview

Implement premium/discount zone calculator to determine if current price is above or below equilibrium relative to HTF swing range. This is TJR's primary bias decision tool.

**Reference:** [TJR Strategy Gap Analysis - Premium/Discount Analysis](../TJR_STRATEGY_GAP_ANALYSIS.md#1-premiumdiscount-analysis-missing)

---

## Problem Statement

Currently, the TJR Suite can detect HTF swings (highs/lows) but cannot determine if price is in **premium** (above equilibrium) or **discount** (below equilibrium) zones. This calculation is critical for:

1. **Bias decisions:** When in premium, expect reversal toward equilibrium
2. **Entry signals:** Retrace into equilibrium is a continuation confluence
3. **Target setting:** Equilibrium level as take-profit target

**From TJR's Strategy:**
> "we can mark out our equilibrium. Price pushes above equilibrium. Awesome. We can now scale down into the one minute time frame."
>
> "we can take equilibrium from this low up to this high. What do we see? This 5minute candle retraces into equilibrium."

---

## Proposed Solution

Create a pure function module that:

1. Calculates **equilibrium** (50% level) from swing high/low
2. Classifies current price as **PREMIUM**, **DISCOUNT**, or **EQUILIBRIUM**
3. Calculates distance from equilibrium (percentage and points)
4. Provides helper functions (`isPremium()`, `isDiscount()`, etc.)
5. Extracts swing ranges from `SwingPoint[]` arrays

---

## Acceptance Criteria

### Functional Requirements

- [ ] Calculate equilibrium (50% level) from swing high/low
- [ ] Classify current price as PREMIUM, DISCOUNT, or EQUILIBRIUM
- [ ] Calculate distance from equilibrium (percentage and points)
- [ ] Calculate percent of range (0-100 scale)
- [ ] Handle edge cases gracefully (return null for invalid ranges)
- [ ] Support configurable equilibrium threshold (default 2%)
- [ ] Support minimum range size filter (default 5 points)
- [ ] Helper function to extract swing range from SwingPoint[]

### Non-Functional Requirements

- [ ] Pure functions (deterministic, no side effects)
- [ ] TypeScript strict mode compliance
- [ ] Test coverage ≥95%
- [ ] Floating-point safe (epsilon comparisons)
- [ ] Performance: O(1) for equilibrium calculation
- [ ] Comprehensive JSDoc comments
- [ ] Exported from `@tjr/strategy` package

### Test Requirements

- [ ] All test cases pass (100%)
- [ ] Edge cases covered (zero range, inverted, extremes)
- [ ] Floating-point precision validated
- [ ] Golden fixtures for deterministic validation
- [ ] Helper functions tested independently

---

## Implementation Tasks

### Task 1: Define TypeScript Contracts (2 hours)
**Files:** `packages/contracts/src/equilibrium.ts`

**Deliverables:**
- [ ] `EquilibriumZone` type (`'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM'`)
- [ ] `SwingRange` interface (low, high, timestamps, timeframe)
- [ ] `EquilibriumLevel` interface (full calculation result)
- [ ] `EquilibriumConfig` interface (threshold, minRangeSize, epsilon)
- [ ] `DEFAULT_EQUILIBRIUM_CONFIG` constant
- [ ] All types exported in `packages/contracts/src/index.ts`
- [ ] Builds without TypeScript errors

---

### Task 2: Implement Core Calculator (3 hours)
**Files:** `packages/strategy/src/equilibrium.ts`

**Deliverables:**
- [ ] `calculateEquilibrium()` function implemented
- [ ] Validates input (non-null, valid range)
- [ ] Handles edge cases (equal high/low, inverted range)
- [ ] Returns null for ranges below minimum size
- [ ] Uses epsilon for floating-point comparisons
- [ ] Pure function (deterministic, no side effects)
- [ ] Properly calculates percentOfRange (0-100 scale)
- [ ] Zone classification correct (PREMIUM/DISCOUNT/EQUILIBRIUM)

**Function Signature:**
```typescript
export function calculateEquilibrium(
  low: number,
  high: number,
  currentPrice: number,
  config?: Partial<EquilibriumConfig>
): EquilibriumLevel | null;
```

**Edge Cases to Handle:**
1. `high === low` → Return null (zero range)
2. `high < low` → Return null (inverted range)
3. `range < minRangeSize` → Return null (range too small)
4. `currentPrice > high` → Still classify (extreme premium)
5. `currentPrice < low` → Still classify (extreme discount)

---

### Task 3: Implement Helper Functions (1 hour)
**Files:** `packages/strategy/src/equilibrium.ts`

**Deliverables:**
- [ ] `isPremium(level: EquilibriumLevel): boolean`
- [ ] `isDiscount(level: EquilibriumLevel): boolean`
- [ ] `isAtEquilibrium(level: EquilibriumLevel): boolean`
- [ ] Type guards return boolean
- [ ] Exported from module

---

### Task 4: Implement Swing Range Helper (1 hour)
**Files:** `packages/strategy/src/equilibrium.ts`

**Deliverables:**
- [ ] `createSwingRange()` accepts SwingPoint[] and returns SwingRange
- [ ] Finds most recent swing high and low
- [ ] Returns null if insufficient swings (need at least 1 high + 1 low)
- [ ] Handles empty swing array

**Function Signature:**
```typescript
export function createSwingRange(
  swings: SwingPoint[],
  timeframe: HTF | 'M5' | 'M1'
): SwingRange | null;
```

---

### Task 5: Write Comprehensive Tests (3-4 hours)
**Files:** `packages/strategy/tests/equilibrium.test.ts`

**Deliverables:**
- [ ] Test coverage ≥95%
- [ ] All tests pass
- [ ] Tests use Jest (matching existing strategy tests)
- [ ] Deterministic golden fixtures
- [ ] Edge case tests
- [ ] Floating-point precision tests
- [ ] Helper function tests

**Test Cases:**

1. **Basic Equilibrium Calculation**
   - Range: low=5000, high=5100, current=5050 → EQUILIBRIUM (50%)
   - Range: low=5000, high=5100, current=5075 → PREMIUM (75%)
   - Range: low=5000, high=5100, current=5025 → DISCOUNT (25%)

2. **Threshold Boundaries**
   - current=5052 (52%) → PREMIUM (outside threshold)
   - current=5051 (51%) → EQUILIBRIUM (within threshold)
   - current=5049 (49%) → EQUILIBRIUM (within threshold)
   - current=5048 (48%) → DISCOUNT (outside threshold)

3. **Edge Cases**
   - Equal high/low (range=0) → null
   - Inverted range (high < low) → null
   - Range below minimum (4 points) → null
   - Current price above high → PREMIUM with >100% percentOfRange
   - Current price below low → DISCOUNT with <0% percentOfRange

---

### Task 6: Integration and Export (1 hour)
**Files:** `packages/strategy/src/index.ts`, `packages/contracts/src/index.ts`

**Deliverables:**
- [ ] All types exported from `@tjr/contracts`
- [ ] All functions exported from `@tjr/strategy`
- [ ] Package builds successfully
- [ ] No circular dependencies
- [ ] Can import: `import { calculateEquilibrium } from '@tjr/strategy'`

---

## Technical Details

### API Design

**Input:**
```typescript
import { calculateEquilibrium } from '@tjr/strategy';

const equilibrium = calculateEquilibrium(
  5000.0,  // swing low
  5100.0,  // swing high
  5075.0   // current price
);
```

**Output:**
```typescript
{
  range: {
    low: 5000.0,
    high: 5100.0,
    lowTime: Date(...),
    highTime: Date(...),
    timeframe: 'H1'
  },
  equilibrium: 5050.0,
  currentPrice: 5075.0,
  zone: 'PREMIUM',
  distanceFromEQ: 25.0,
  distanceInPoints: 25.0,
  percentOfRange: 75.0,
  timestamp: Date(...)
}
```

**Helper Usage:**
```typescript
if (isPremium(equilibrium)) {
  console.log('Price in premium - expect reversal down');
}

if (isDiscount(equilibrium)) {
  console.log('Price in discount - can continue up');
}

if (isAtEquilibrium(equilibrium)) {
  console.log('Price at equilibrium - wait for direction');
}
```

**Swing Range Helper:**
```typescript
import { createSwingRange } from '@tjr/strategy';

const swings = htfSwingsEngine.getSwings(); // SwingPoint[]
const range = createSwingRange(swings, 'H1');

if (range) {
  const eq = calculateEquilibrium(range.low, range.high, currentPrice);
}
```

---

### File Structure

```
packages/
├── contracts/
│   └── src/
│       ├── equilibrium.ts          # NEW - Types/interfaces
│       └── index.ts                # MODIFIED - Export equilibrium types
└── strategy/
    ├── src/
    │   ├── equilibrium.ts          # NEW - Implementation
    │   └── index.ts                # MODIFIED - Export equilibrium functions
    └── tests/
        └── equilibrium.test.ts     # NEW - Unit tests
```

---

## Dependencies

### Internal
- ✅ `@tjr/contracts` - SwingPoint type (already exists)
- ✅ `@tjr/strategy` - HtfSwings class (already exists)

### External
- ✅ None (zero new dependencies)

### Blockers
- ❌ None

---

## Testing Strategy

**Unit Tests:** Jest (`packages/strategy/tests/equilibrium.test.ts`)
- Core calculation tests
- Zone classification tests
- Edge case tests
- Helper function tests
- Swing range extraction tests
- Golden fixtures for deterministic validation

**Integration Tests:** (Future PR)
- Integration with HtfSwings class
- Multi-timeframe equilibrium calculations

**Coverage Target:** ≥95%

---

## Performance Considerations

**Time Complexity:**
- `calculateEquilibrium()`: O(1) - simple arithmetic
- `createSwingRange()`: O(n) - filters/sorts swings (n = swing count)

**Space Complexity:**
- O(1) - no data structures allocated

**Benchmarks:** Not required (simple calculations)

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Floating-point precision errors | Medium | Low | Use epsilon comparisons (1e-9) |
| Edge case not handled | High | Low | Comprehensive edge case tests |
| Integration issues | Medium | Low | Use existing SwingPoint interface |

---

## Implementation Sequence

**Day 1 (4-5 hours):**
1. Task 1: Define TypeScript contracts (2h)
2. Task 2: Implement core calculator (3h)

**Day 2 (4-5 hours):**
3. Task 3: Implement helpers (1h)
4. Task 4: Implement swing range helper (1h)
5. Task 5: Write tests (3h)

**Day 3 (1-2 hours):**
6. Task 6: Integration and export (1h)
7. Final testing and validation (1h)

**Total:** 8-12 hours over 2-3 days

---

## Definition of Done

- [ ] All TypeScript contracts defined and exported
- [ ] Core `calculateEquilibrium()` implemented and tested
- [ ] Helper functions implemented and tested
- [ ] Swing range helper implemented and tested
- [ ] Test coverage ≥95%
- [ ] All tests passing
- [ ] Builds without errors
- [ ] Exported from main package indices
- [ ] Journal fragment created in `docs/journal/_fragments/phase-53/`
- [ ] Code reviewed
- [ ] PR created and approved

---

## Related Issues

### Enables
- PR #2: Fair Value Gap (FVG) Detection
- PR #3: SMT Divergence Detector
- PR #6: Entry Signal Generator

### References
- [TJR Strategy Gap Analysis](../TJR_STRATEGY_GAP_ANALYSIS.md)
- [Implementation Plan](./PR-001-PREMIUM-DISCOUNT-IMPLEMENTATION-PLAN.md)

---

## Additional Context

### TJR Strategy Quotes

**From `simple_strategy.txt`:**
> "continuation confluence and that comes in the form of order blocks, breaker blocks, equilibrium, and fair value gaps."

> "we can mark out our equilibrium. Price pushes above equilibrium. Awesome. We can now scale down into the one minute time frame."

> "we can take equilibrium from this low up to this high. What do we see? This 5minute candle retraces into equilibrium."

### Wolf Agents Ethos

- **Smallest viable change:** Single-purpose PR (only equilibrium, no FVG/SMT)
- **Reversible:** Pure functions with no state (easy to rollback)
- **Evidence-first:** ≥95% test coverage with golden fixtures
- **Additive:** Extends existing SwingPoint interface, no breaking changes
- **Operability:** Comprehensive JSDoc for debugging

---

**Issue Created:** 2025-10-05
**Created By:** PM Agent (Claude Code)
**Next Steps:** Assign developer, begin Task 1
