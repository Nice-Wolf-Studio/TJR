# PR #1: Premium/Discount Calculator - Implementation Plan

**Phase:** 53
**Shard:** 53.1
**Priority:** CRITICAL - Foundation for bias decision-making
**Status:** Planning
**Estimated Effort:** 8-12 hours

---

## Executive Summary

Implement premium/discount zone calculator to determine if current price is above or below equilibrium relative to HTF swing range. This is TJR's primary bias decision tool - when price is in premium (above 50% equilibrium), traders expect reversal toward equilibrium; when in discount (below 50%), price can continue higher.

**Key Insight from TJR Strategy:**
- Draw Fibonacci from low to high on uptrend
- Equilibrium = 50% level (midpoint)
- Above equilibrium = PREMIUM zone (expect reversal down)
- Below equilibrium = DISCOUNT zone (can continue up)
- Premium zone triggers bias flip to target equilibrium

---

## Research Summary

### TJR Transcript Analysis

**From `simple_strategy.txt` (Lines 110-187):**

```
"continuation confluence and that comes in the form of order blocks,
breaker blocks, equilibrium, and fair value gaps."

"we can mark out our equilibrium. Price pushes above equilibrium. Awesome.
We can now scale down into the one minute time frame."

"we can take equilibrium from this low up to this high. What do we see?
This 5minute candle retraces into equilibrium."
```

**Key Findings:**
1. Equilibrium is calculated from swing low to swing high
2. Used as a **continuation confluence** (retrace target)
3. Applied on 5-minute timeframe after key level interaction
4. Price pushing above/below equilibrium triggers scaling down to 1-minute
5. Retrace INTO equilibrium is an entry signal

### Existing Codebase Analysis

**Available Components:**
- ✅ `SwingPoint` type (`packages/contracts/src/swings.ts`) - Has HTF swing highs/lows
- ✅ `HtfSwings` class (`packages/strategy/src/htf-swings.ts`) - Detects H1/H4 swings
- ✅ `KeyLevel` type (`packages/contracts/src/bias.ts`) - Has price levels with metadata
- ✅ Session management infrastructure already exists

**Gap:** No equilibrium calculation or premium/discount zone detection

### Edge Cases Identified

1. **Sideways/Ranging Markets:** No clear swing high/low - need minimum range threshold
2. **Multiple Timeframes:** Which swing range to use (5m, H1, H4)?
3. **Swing Updates:** What happens when new swing high/low is detected?
4. **Equal Highs/Lows:** Which swing point to use as reference?
5. **Initial State:** No swings detected yet - return null or default?
6. **Precision:** Floating-point comparison for 50% level

---

## Scope Definition

### Files to Create

```
packages/contracts/src/equilibrium.ts        # TypeScript types/interfaces
packages/strategy/src/equilibrium.ts         # Implementation
packages/strategy/tests/equilibrium.test.ts  # Unit tests
```

### Files to Modify

```
packages/contracts/src/index.ts              # Export equilibrium types
packages/strategy/src/index.ts               # Export equilibrium functions
```

### TypeScript Contracts (New Types)

**File: `packages/contracts/src/equilibrium.ts`**

```typescript
/**
 * @fileoverview Equilibrium and Premium/Discount zone types
 *
 * Defines types for calculating equilibrium (50% level) between swing high/low
 * and determining if current price is in premium or discount zone.
 *
 * @module @tjr/contracts/equilibrium
 */

import type { HTF } from './swings.js';

/**
 * Zone classification relative to equilibrium
 *
 * PREMIUM: Price is above equilibrium (above 50%) - expect reversal down
 * DISCOUNT: Price is below equilibrium (below 50%) - can continue up
 * EQUILIBRIUM: Price is at/near equilibrium (within threshold)
 */
export type EquilibriumZone = 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';

/**
 * Swing range used for equilibrium calculation
 */
export interface SwingRange {
  /** Swing low price */
  low: number;
  /** Swing high price */
  high: number;
  /** Timestamp of swing low */
  lowTime: Date;
  /** Timestamp of swing high */
  highTime: Date;
  /** Timeframe where swings were detected */
  timeframe: HTF | 'M5' | 'M1';
}

/**
 * Equilibrium calculation result
 */
export interface EquilibriumLevel {
  /** Swing range used for calculation */
  range: SwingRange;
  /** Equilibrium price (50% level) */
  equilibrium: number;
  /** Current price used for zone calculation */
  currentPrice: number;
  /** Zone classification */
  zone: EquilibriumZone;
  /** Distance from equilibrium as percentage of range (0-100) */
  distanceFromEQ: number;
  /** Distance from equilibrium in price points */
  distanceInPoints: number;
  /** Percentage of range from low (0 = at low, 50 = at EQ, 100 = at high) */
  percentOfRange: number;
  /** Timestamp of calculation */
  timestamp: Date;
}

/**
 * Configuration for equilibrium calculation
 */
export interface EquilibriumConfig {
  /**
   * Threshold for EQUILIBRIUM zone (percentage points from 50%)
   * Default: 2.0 (48%-52% is considered AT equilibrium)
   */
  equilibriumThreshold: number;

  /**
   * Minimum range size (in points) to calculate equilibrium
   * Prevents calculation on tiny ranges (sideways markets)
   * Default: 5.0 points
   */
  minRangeSize: number;

  /**
   * Precision for floating-point comparison (epsilon)
   * Default: 1e-9
   */
  epsilon: number;
}

/**
 * Default equilibrium configuration
 */
export const DEFAULT_EQUILIBRIUM_CONFIG: EquilibriumConfig = {
  equilibriumThreshold: 2.0,
  minRangeSize: 5.0,
  epsilon: 1e-9,
};
```

---

## Implementation Plan

### Task Breakdown (Ordered by Dependency)

#### Task 1: Define TypeScript Contracts (2 hours)
**Risk Level:** Low
**Files:** `packages/contracts/src/equilibrium.ts`
**Dependencies:** None

**Acceptance Criteria:**
- [ ] All types exported in `equilibrium.ts`
- [ ] JSDoc comments for all interfaces/types
- [ ] Default config constant defined
- [ ] Exported in `packages/contracts/src/index.ts`
- [ ] Builds without TypeScript errors
- [ ] No circular dependencies

**Deliverables:**
- TypeScript interface definitions
- Default configuration constant
- Export in main index

---

#### Task 2: Implement Core Equilibrium Calculator (3 hours)
**Risk Level:** Medium
**Files:** `packages/strategy/src/equilibrium.ts`
**Dependencies:** Task 1 (contracts)

**Acceptance Criteria:**
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
/**
 * Calculate equilibrium and zone classification for a swing range
 *
 * @param low - Swing low price
 * @param high - Swing high price
 * @param currentPrice - Current market price
 * @param config - Optional configuration (uses defaults if omitted)
 * @returns Equilibrium level with zone classification, or null if range invalid
 */
export function calculateEquilibrium(
  low: number,
  high: number,
  currentPrice: number,
  config?: Partial<EquilibriumConfig>
): EquilibriumLevel | null;
```

**Implementation Notes:**
- Validate: `high > low` (reject inverted ranges)
- Calculate range: `range = high - low`
- Check minimum: `if (range < minRangeSize) return null`
- Calculate equilibrium: `eq = low + (range * 0.5)`
- Calculate percentOfRange: `percent = ((currentPrice - low) / range) * 100`
- Classify zone:
  - If `Math.abs(percentOfRange - 50) <= equilibriumThreshold`: EQUILIBRIUM
  - Else if `percentOfRange > 50`: PREMIUM
  - Else: DISCOUNT
- Calculate distances:
  - `distanceFromEQ = Math.abs(currentPrice - eq)`
  - `distanceInPoints = distanceFromEQ`

**Edge Cases:**
1. `high === low`: Return null (zero range)
2. `currentPrice > high`: Still classify (can be in extreme premium)
3. `currentPrice < low`: Still classify (can be in extreme discount)
4. `range < minRangeSize`: Return null (range too small)
5. Floating-point precision: Use epsilon for equality checks

---

#### Task 3: Implement Helper Functions (1 hour)
**Risk Level:** Low
**Files:** `packages/strategy/src/equilibrium.ts`
**Dependencies:** Task 2

**Acceptance Criteria:**
- [ ] `isPremium()` helper implemented
- [ ] `isDiscount()` helper implemented
- [ ] `isAtEquilibrium()` helper implemented
- [ ] Type guards return boolean
- [ ] Exported from module

**Function Signatures:**
```typescript
/**
 * Check if price is in premium zone
 */
export function isPremium(level: EquilibriumLevel): boolean;

/**
 * Check if price is in discount zone
 */
export function isDiscount(level: EquilibriumLevel): boolean;

/**
 * Check if price is at equilibrium (within threshold)
 */
export function isAtEquilibrium(level: EquilibriumLevel): boolean;
```

---

#### Task 4: Implement Swing Range Helper (1 hour)
**Risk Level:** Low
**Files:** `packages/strategy/src/equilibrium.ts`
**Dependencies:** Task 2

**Acceptance Criteria:**
- [ ] `createSwingRange()` helper accepts SwingPoint[] and returns SwingRange
- [ ] Finds most recent swing high and low
- [ ] Returns null if insufficient swings (need at least 1 high + 1 low)
- [ ] Handles empty swing array

**Function Signature:**
```typescript
import type { SwingPoint } from '@tjr/contracts';

/**
 * Create swing range from most recent swing high and low
 *
 * @param swings - Array of swing points (highs and lows)
 * @param timeframe - Timeframe identifier for metadata
 * @returns Swing range, or null if insufficient swings
 */
export function createSwingRange(
  swings: SwingPoint[],
  timeframe: HTF | 'M5' | 'M1'
): SwingRange | null;
```

**Implementation:**
- Filter swings into highs and lows
- Find most recent high: `swings.filter(s => s.kind === 'HIGH').sort((a,b) => b.time - a.time)[0]`
- Find most recent low: `swings.filter(s => s.kind === 'LOW').sort((a,b) => b.time - a.time)[0]`
- Return null if missing high or low
- Return SwingRange object

---

#### Task 5: Write Comprehensive Tests (3-4 hours)
**Risk Level:** Medium
**Files:** `packages/strategy/tests/equilibrium.test.ts`
**Dependencies:** Tasks 2, 3, 4

**Acceptance Criteria:**
- [ ] Test coverage ≥95%
- [ ] All tests pass
- [ ] Tests use Jest (matching existing strategy tests)
- [ ] Deterministic golden fixtures for equilibrium calculations
- [ ] Edge case tests (zero range, inverted range, extreme prices)
- [ ] Floating-point precision tests
- [ ] Helper function tests (isPremium, isDiscount, etc.)

**Test Cases:**

1. **Basic Equilibrium Calculation**
   - Range: low=5000, high=5100, current=5050 → EQUILIBRIUM (50%)
   - Range: low=5000, high=5100, current=5075 → PREMIUM (75%)
   - Range: low=5000, high=5100, current=5025 → DISCOUNT (25%)

2. **Threshold Boundaries**
   - current=5052 (52%) → PREMIUM (just outside threshold)
   - current=5051 (51%) → EQUILIBRIUM (within 2% threshold)
   - current=5049 (49%) → EQUILIBRIUM (within 2% threshold)
   - current=5048 (48%) → DISCOUNT (just outside threshold)

3. **Edge Cases**
   - Equal high/low (range=0) → null
   - Inverted range (high < low) → null
   - Range below minimum (4 points) → null
   - Current price above high → PREMIUM with >100% percentOfRange
   - Current price below low → DISCOUNT with <0% percentOfRange

4. **Floating-Point Precision**
   - Equilibrium at 5050.0000001 vs 5050.0 → equal within epsilon
   - Distance calculations don't accumulate rounding errors

5. **Helper Functions**
   - `isPremium()` returns true only for PREMIUM zone
   - `isDiscount()` returns true only for DISCOUNT zone
   - `isAtEquilibrium()` returns true only for EQUILIBRIUM zone

6. **Swing Range Creation**
   - Empty swing array → null
   - Only highs, no lows → null
   - Only lows, no highs → null
   - Multiple highs/lows → uses most recent of each
   - Swings from different timeframes → filters correctly

**Golden Fixtures:**
```json
{
  "name": "equilibrium_basic",
  "input": {
    "low": 5000.0,
    "high": 5100.0,
    "currentPrice": 5050.0
  },
  "expected": {
    "equilibrium": 5050.0,
    "zone": "EQUILIBRIUM",
    "percentOfRange": 50.0,
    "distanceFromEQ": 0.0
  }
}
```

---

#### Task 6: Integration and Export (1 hour)
**Risk Level:** Low
**Files:** `packages/strategy/src/index.ts`, `packages/contracts/src/index.ts`
**Dependencies:** All previous tasks

**Acceptance Criteria:**
- [ ] All types exported from `@tjr/contracts`
- [ ] All functions exported from `@tjr/strategy`
- [ ] Package builds successfully
- [ ] No circular dependencies
- [ ] Can import in other packages: `import { calculateEquilibrium } from '@tjr/strategy'`

**Changes:**

`packages/contracts/src/index.ts`:
```typescript
// Equilibrium types
export type {
  EquilibriumZone,
  SwingRange,
  EquilibriumLevel,
  EquilibriumConfig,
} from './equilibrium.js';

export { DEFAULT_EQUILIBRIUM_CONFIG } from './equilibrium.js';
```

`packages/strategy/src/index.ts`:
```typescript
// Equilibrium calculator
export {
  calculateEquilibrium,
  isPremium,
  isDiscount,
  isAtEquilibrium,
  createSwingRange,
} from './equilibrium.js';
```

---

## Acceptance Criteria (Overall)

### Functional Requirements

- ✅ **F1:** Calculate equilibrium (50% level) from swing high/low
- ✅ **F2:** Classify current price as PREMIUM, DISCOUNT, or EQUILIBRIUM
- ✅ **F3:** Calculate distance from equilibrium (percentage and points)
- ✅ **F4:** Calculate percent of range (0-100 scale)
- ✅ **F5:** Handle edge cases gracefully (return null for invalid ranges)
- ✅ **F6:** Support configurable equilibrium threshold (default 2%)
- ✅ **F7:** Support minimum range size filter (default 5 points)
- ✅ **F8:** Helper function to extract swing range from SwingPoint[]

### Non-Functional Requirements

- ✅ **NF1:** Pure functions (deterministic, no side effects)
- ✅ **NF2:** TypeScript strict mode compliance
- ✅ **NF3:** Test coverage ≥95%
- ✅ **NF4:** Floating-point safe (epsilon comparisons)
- ✅ **NF5:** Performance: O(1) for equilibrium calculation
- ✅ **NF6:** Performance: O(n) for swing range extraction (n = swing count)
- ✅ **NF7:** Comprehensive JSDoc comments
- ✅ **NF8:** Exported from main package index

### Test Requirements

- ✅ **T1:** All test cases pass (100%)
- ✅ **T2:** Edge cases covered (zero range, inverted, extremes)
- ✅ **T3:** Floating-point precision validated
- ✅ **T4:** Golden fixtures for deterministic validation
- ✅ **T5:** Helper functions tested independently

---

## Dependencies

### Internal Dependencies

- ✅ `@tjr/contracts` (SwingPoint type exists)
- ✅ `@tjr/strategy` (HtfSwings class exists)

### External Dependencies

- ✅ None (zero new dependencies)

### Blockers

- ❌ None identified

---

## Testing Strategy

### Unit Tests (Jest)

**Location:** `packages/strategy/tests/equilibrium.test.ts`

**Coverage Target:** ≥95%

**Test Groups:**
1. Core calculation (`calculateEquilibrium()`)
2. Zone classification (PREMIUM/DISCOUNT/EQUILIBRIUM)
3. Edge cases (invalid ranges, extremes)
4. Helper functions (isPremium, isDiscount, etc.)
5. Swing range extraction (`createSwingRange()`)
6. Configuration merging (partial config override)

**Fixtures:**
- Use golden JSON fixtures for deterministic validation
- Store in `packages/strategy/tests/fixtures/equilibrium/`
- Include edge cases and boundary conditions

### Integration Tests

**Scenario:** Calculate equilibrium from live HtfSwings output

```typescript
// Example integration test (in future PR)
const swings = htfSwingsEngine.getSwings();
const range = createSwingRange(swings, 'H1');
const eq = calculateEquilibrium(range.low, range.high, currentPrice);
expect(eq).toBeDefined();
expect(eq.zone).toBe('PREMIUM');
```

---

## Performance Considerations

### Time Complexity

- `calculateEquilibrium()`: O(1) - simple arithmetic
- `createSwingRange()`: O(n) - filters and sorts swings (n = swing count)
- Helper functions: O(1) - simple property checks

### Space Complexity

- O(1) - no data structures allocated, only primitive calculations

### Benchmarks

**Not required for this PR** (simple calculations, no performance bottleneck)

---

## Documentation Requirements

### Code Documentation

- ✅ JSDoc for all public functions
- ✅ JSDoc for all interfaces/types
- ✅ Inline comments for complex logic
- ✅ Usage examples in function JSDoc

### External Documentation

**None required** - this is an internal library component

---

## Risk Assessment

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Floating-point precision errors | Medium | Low | Use epsilon comparisons (1e-9) |
| Edge case not handled | High | Low | Comprehensive edge case tests |
| Performance degradation | Low | Very Low | Simple O(1) calculations |
| Integration issues with HtfSwings | Medium | Low | Use existing SwingPoint interface |

### Mitigation Strategies

1. **Floating-Point:** Always use epsilon for equality checks
2. **Edge Cases:** Return null for invalid inputs (fail gracefully)
3. **Testing:** ≥95% coverage with golden fixtures
4. **Integration:** Stick to existing contracts (no breaking changes)

---

## Implementation Sequence

### Day 1 (4-5 hours)
1. Task 1: Define TypeScript contracts (2h)
2. Task 2: Implement core calculator (3h)

### Day 2 (4-5 hours)
3. Task 3: Implement helpers (1h)
4. Task 4: Implement swing range helper (1h)
5. Task 5: Write tests (3h)

### Day 3 (1-2 hours)
6. Task 6: Integration and export (1h)
7. Final testing and validation (1h)

**Total Estimated Time:** 8-12 hours over 2-3 days

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
- [ ] ADR created (if architectural decision needed)
- [ ] Journal fragment created in `docs/journal/_fragments/phase-53/`
- [ ] Code reviewed (self-review minimum)
- [ ] PR created with description and test results

---

## Future Enhancements (Out of Scope)

These are intentionally excluded from PR #1:

1. **Multi-Timeframe Equilibrium:** Calculate equilibrium across multiple timeframes simultaneously
2. **Fibonacci Levels:** Add 23.6%, 38.2%, 61.8%, 79% levels (covered in separate PR)
3. **Equilibrium Retrace Detector:** Detect when price retraces INTO equilibrium (entry signal)
4. **Historical Equilibrium Tracking:** Store historical equilibrium levels over time
5. **Equilibrium Zone Visualization:** Chart overlays (UI component, not in scope)

---

## Related Work

### Depends On
- ✅ Existing: `@tjr/contracts` SwingPoint type
- ✅ Existing: `@tjr/strategy` HtfSwings class

### Enables
- 🔜 PR #2: Fair Value Gap (FVG) Detection
- 🔜 PR #3: SMT Divergence Detector
- 🔜 PR #6: Entry Signal Generator (uses equilibrium in confluence scoring)

---

## References

### TJR Strategy Documents
- `docs/TJR_STRATEGY_GAP_ANALYSIS.md` - Section: "Premium/Discount Analysis"
- `docs/TJR Transcripts/simple_strategy.txt` - Lines 110-187, 240-250

### Codebase
- `packages/contracts/src/swings.ts` - SwingPoint interface
- `packages/strategy/src/htf-swings.ts` - HTF swing detection
- `packages/contracts/src/bias.ts` - KeyLevel interface (reference)

### Wolf Agents
- Phase Lifecycle: Intake → Research → Implementation → Review → Merge
- Ethos: Smallest viable, reversible change
- Evidence-first: Test coverage ≥95%

---

**Plan Version:** 1.0
**Created:** 2025-10-05
**Author:** PM Agent (Claude Code)
**Next Review:** After Task 2 completion (core calculator)
