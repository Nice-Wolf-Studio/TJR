# PR #1: Premium/Discount Calculator - Summary

**Status:** Ready for Implementation
**Priority:** CRITICAL
**Estimated Effort:** 8-12 hours (2-3 days)

---

## Quick Overview

Implement equilibrium calculator to determine if current price is in premium (above 50%) or discount (below 50%) zone relative to HTF swing range. This is TJR's primary bias decision tool.

**Key Deliverable:** Pure function module that calculates equilibrium and classifies price zones.

---

## Files to Create

```
packages/contracts/src/equilibrium.ts        # TypeScript types/interfaces (120 lines)
packages/strategy/src/equilibrium.ts         # Implementation (250 lines)
packages/strategy/tests/equilibrium.test.ts  # Unit tests (400 lines)
```

**Total New Code:** ~770 lines

---

## Files to Modify

```
packages/contracts/src/index.ts              # Add equilibrium type exports (6 lines)
packages/strategy/src/index.ts               # Add equilibrium function exports (6 lines)
```

**Total Modified Code:** ~12 lines

---

## Effort Breakdown

| Task | Hours | Complexity | Risk |
|------|-------|------------|------|
| 1. Define TypeScript contracts | 2h | Low | Low |
| 2. Implement core calculator | 3h | Medium | Low |
| 3. Implement helper functions | 1h | Low | Low |
| 4. Implement swing range helper | 1h | Low | Low |
| 5. Write comprehensive tests | 3-4h | Medium | Low |
| 6. Integration and export | 1h | Low | Low |
| **Total** | **8-12h** | **Low-Medium** | **Low** |

---

## Key Functions

### Core API

```typescript
// Main calculator
calculateEquilibrium(
  low: number,
  high: number,
  currentPrice: number,
  config?: Partial<EquilibriumConfig>
): EquilibriumLevel | null

// Helper functions
isPremium(level: EquilibriumLevel): boolean
isDiscount(level: EquilibriumLevel): boolean
isAtEquilibrium(level: EquilibriumLevel): boolean

// Swing range extractor
createSwingRange(
  swings: SwingPoint[],
  timeframe: HTF | 'M5' | 'M1'
): SwingRange | null
```

---

## TypeScript Interfaces

### Input Types

```typescript
interface SwingRange {
  low: number;
  high: number;
  lowTime: Date;
  highTime: Date;
  timeframe: HTF | 'M5' | 'M1';
}

interface EquilibriumConfig {
  equilibriumThreshold: number;  // Default: 2.0
  minRangeSize: number;          // Default: 5.0
  epsilon: number;               // Default: 1e-9
}
```

### Output Types

```typescript
type EquilibriumZone = 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';

interface EquilibriumLevel {
  range: SwingRange;
  equilibrium: number;
  currentPrice: number;
  zone: EquilibriumZone;
  distanceFromEQ: number;
  distanceInPoints: number;
  percentOfRange: number;
  timestamp: Date;
}
```

---

## Test Coverage

**Target:** ≥95%

**Test Categories:**
1. Basic equilibrium calculation (3 cases)
2. Threshold boundaries (4 cases)
3. Edge cases (5 cases)
4. Floating-point precision (2 cases)
5. Helper functions (3 cases)
6. Swing range creation (5 cases)

**Total Test Cases:** ~22 unit tests

---

## Dependencies

### Internal
- ✅ `@tjr/contracts` - SwingPoint type (exists)
- ✅ `@tjr/strategy` - HtfSwings class (exists)

### External
- ✅ None (zero new npm dependencies)

### Blockers
- ❌ None

---

## Success Metrics

- [ ] All 22+ test cases pass
- [ ] Test coverage ≥95%
- [ ] TypeScript strict mode compliance
- [ ] Zero circular dependencies
- [ ] Builds without errors
- [ ] Exported from main package indices

---

## Edge Cases Handled

1. **Zero range** (`high === low`) → Return null
2. **Inverted range** (`high < low`) → Return null
3. **Tiny range** (`range < minRangeSize`) → Return null
4. **Extreme premium** (`currentPrice > high`) → Still classify
5. **Extreme discount** (`currentPrice < low`) → Still classify
6. **Floating-point precision** → Use epsilon (1e-9) for comparisons
7. **Empty swings** → Return null from `createSwingRange()`
8. **Missing high or low** → Return null from `createSwingRange()`

---

## Performance

**Time Complexity:**
- `calculateEquilibrium()`: O(1)
- `createSwingRange()`: O(n) where n = number of swings

**Space Complexity:**
- O(1) for all functions

**Benchmarks:** Not required (simple calculations, no bottleneck)

---

## Integration Points

### Used By (Future PRs)
- PR #2: Fair Value Gap (FVG) Detection
- PR #6: Entry Signal Generator (confluence scoring)
- PR #7: Multi-Timeframe Coordinator

### Uses
- Existing: `SwingPoint` from `@tjr/contracts`
- Existing: `HtfSwings` from `@tjr/strategy`

---

## Documentation

### Code Documentation
- ✅ JSDoc for all public functions
- ✅ JSDoc for all interfaces/types
- ✅ Inline comments for complex logic
- ✅ Usage examples in JSDoc

### Planning Documentation
- ✅ [Implementation Plan](./PR-001-PREMIUM-DISCOUNT-IMPLEMENTATION-PLAN.md)
- ✅ [GitHub Issue Template](./PR-001-GITHUB-ISSUE-TEMPLATE.md)
- ✅ This summary document

### Journal
- 🔜 Create fragment in `docs/journal/_fragments/phase-53/001-premium-discount.md`

---

## Acceptance Criteria Checklist

### Functional
- [ ] Calculate equilibrium (50% level) from swing high/low
- [ ] Classify current price as PREMIUM, DISCOUNT, or EQUILIBRIUM
- [ ] Calculate distance from equilibrium (percentage and points)
- [ ] Calculate percent of range (0-100 scale)
- [ ] Handle edge cases gracefully
- [ ] Support configurable threshold (default 2%)
- [ ] Support minimum range size (default 5 points)
- [ ] Helper to extract swing range from SwingPoint[]

### Non-Functional
- [ ] Pure functions (deterministic, no side effects)
- [ ] TypeScript strict mode compliance
- [ ] Test coverage ≥95%
- [ ] Floating-point safe (epsilon comparisons)
- [ ] Performance: O(1) for core calculation
- [ ] Comprehensive JSDoc comments
- [ ] Exported from main package

### Testing
- [ ] All test cases pass
- [ ] Edge cases covered
- [ ] Floating-point precision validated
- [ ] Golden fixtures for determinism
- [ ] Helper functions tested independently

---

## Risk Mitigation

| Risk | Mitigation Strategy |
|------|---------------------|
| Floating-point errors | Use epsilon (1e-9) for all comparisons |
| Edge cases | Return null for invalid inputs, test all boundaries |
| Integration issues | Use existing SwingPoint interface, no breaking changes |
| Performance | Simple O(1) calculations, no optimization needed |

---

## Implementation Sequence

### Day 1 (4-5 hours)
1. ✅ Define TypeScript contracts
2. ✅ Implement core calculator
3. ✅ Basic unit tests

### Day 2 (4-5 hours)
4. ✅ Implement helpers
5. ✅ Implement swing range extractor
6. ✅ Comprehensive tests (edge cases, fixtures)

### Day 3 (1-2 hours)
7. ✅ Integration and export
8. ✅ Final validation
9. ✅ Create journal fragment
10. ✅ Create PR

---

## Next Steps

1. **Assign Developer:** Identify who will implement this PR
2. **Create GitHub Issue:** Use template in `PR-001-GITHUB-ISSUE-TEMPLATE.md`
3. **Begin Task 1:** Define TypeScript contracts
4. **Follow Plan:** Reference `PR-001-PREMIUM-DISCOUNT-IMPLEMENTATION-PLAN.md`

---

## Related Documentation

- [Implementation Plan](./PR-001-PREMIUM-DISCOUNT-IMPLEMENTATION-PLAN.md) - Full technical details
- [GitHub Issue Template](./PR-001-GITHUB-ISSUE-TEMPLATE.md) - Ready-to-use issue
- [TJR Strategy Gap Analysis](../TJR_STRATEGY_GAP_ANALYSIS.md) - Context and requirements

---

**Summary Created:** 2025-10-05
**Created By:** PM Agent (Claude Code)
**Status:** Ready for implementation
