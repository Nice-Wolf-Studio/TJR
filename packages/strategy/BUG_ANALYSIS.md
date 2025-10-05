# Test Failure Analysis - TJR Strategy Migration

## Executive Summary

Analyzed 63 failing tests across 7 test suites. Found **3 categories of real bugs** and **2 categories of test issues**.

**Status**: 57/120 tests passing (47.5%)
**Root Cause**: Type mismatches between migrated code and @tjr/contracts definitions

---

## Bug Category 1: Missing Type Definitions in @tjr/contracts

### BUG-001: Missing DEFAULT exports
**Severity**: High
**Impact**: 3 test files cannot import necessary defaults

**Files Affected**:
- htf-swings.test.ts (trying to import DEFAULT_SWING_CONFIG)
- bos.test.ts (trying to import DEFAULT_BOS_CONFIG)
- pivots.test.ts (trying to import DEFAULT_BOS_CONFIG)

**Root Cause**:
Implementation files expect these exports from @tjr/contracts:
```typescript
// Expected in @tjr/contracts:
export const DEFAULT_SWING_CONFIG: SwingConfig;
export const DEFAULT_BOS_CONFIG: BosConfig;
```

**Evidence**:
```
Cannot find module '@tjr/contracts' from 'src/htf-swings.ts'
  at Object.<anonymous> (src/htf-swings.ts:36:1)
```

**Fix Required**:
Add default config exports to @tjr/contracts/src/swings.ts and @tjr/contracts/src/bos.ts

---

## Bug Category 2: Type Definition Mismatch - KeyLevelSource

### BUG-002: Incorrect KeyLevelSource usage in tests
**Severity**: Medium
**Impact**: All priority.test.ts tests failing
**Type**: Test Bug (not code bug)

**Root Cause**:
Tests use incorrect KeyLevelSource values:
```typescript
// WRONG (in tests):
source: 'session-high'  // ❌
source: 'session-low'   // ❌
source: 'swing-high'    // ❌
source: 'swing-low'     // ❌
source: 'bos-level'     // ❌

// CORRECT (per @tjr/contracts):
source: 'SESSION'  // ✅
source: 'H1'       // ✅
source: 'H4'       // ✅
```

**Evidence from @tjr/contracts/bias.ts:24**:
```typescript
export type KeyLevelSource = 'SESSION' | 'H1' | 'H4';
```

**Fix Required**:
Update ALL test fixtures to use correct KeyLevelSource values

---

## Bug Category 3: Missing PriorityConfig Field

### BUG-003: recencyHorizonBars not defined in PriorityConfig type
**Severity**: High
**Impact**: Priority scoring crashes at runtime
**Type**: Real Code Bug

**Root Cause**:
Implementation in priority.ts:93 expects field that doesn't exist in type:
```typescript
// priority.ts:93
const horizonBars = context.config.recencyHorizonBars[timeframe] || 40;
//                                  ^^^^^^^^^^^^^^^^^^^
//                                  TypeError: Cannot read properties of undefined
```

But PriorityConfig in @tjr/contracts only has:
```typescript
export interface PriorityConfig {
  weights: {
    source: Record<KeyLevelSource, number>;
    recency: number;
    proximity: number;
    confluence: number;
  };
  confluenceBand: {
    maxDistance: number;
    minLevels: number;
  };
  // ❌ Missing: recencyHorizonBars field
}
```

**Fix Required**:
Add missing field to PriorityConfig:
```typescript
export interface PriorityConfig {
  weights: { /* existing */ };
  confluenceBand: { /* existing */ };
  recencyHorizonBars: {  // ✅ ADD THIS
    H1: number;
    H4: number;
  };
}
```

---

## Bug Category 4: Timezone Issues in Session Levels Tests

### BUG-004: Bars not matching session boundaries
**Severity**: Medium
**Impact**: 12 session-levels.test.ts tests failing with NaN values
**Type**: Test Configuration Issue

**Symptom**:
```
expect(received).toBe(expected)
Expected: 4510
Received: NaN
```

**Root Cause**:
Test bars are created with UTC timestamps but session boundaries are calculated in Chicago timezone. The bars fall outside all session windows, so levels remain NaN.

**Example**:
```typescript
// Test creates bar at:
t: new Date('2024-01-15T01:00:00Z')  // 01:00 UTC

// But ASIA session in Chicago is:
// 18:00 CT to 03:00 CT next day
// Which is 00:00 UTC to 09:00 UTC (standard time)
// or 23:00 UTC to 08:00 UTC (daylight time)

// The bar at 01:00 UTC might fall in a gap or wrong session
```

**Fix Required**:
Update test fixtures to use timestamps that align with materialized session boundaries, accounting for timezone conversion.

---

## Bug Category 5: Type Interface Mismatches

### BUG-005: SwingPoint vs OhlcBar timestamp types
**Severity**: Low
**Impact**: Type compilation warnings
**Type**: Minor Type Inconsistency

**Issue**:
SwingPoint expects `time: Date` but tests create `timestamp: Date` or `t: Date`

**Fix Required**:
Standardize on consistent field names across all bar/swing types

---

## Recommended Fix Priority

### Phase 1: Critical Type Fixes (Blocks ALL tests)
1. ✅ Add DEFAULT_SWING_CONFIG export to @tjr/contracts/swings.ts
2. ✅ Add DEFAULT_BOS_CONFIG export to @tjr/contracts/bos.ts
3. ✅ Add recencyHorizonBars to PriorityConfig interface

### Phase 2: Test Fixture Corrections
4. ✅ Update all KeyLevelSource values in tests ('session-high' → 'SESSION', etc.)
5. ✅ Fix timezone-aware timestamps in session-levels tests
6. ✅ Add proper recencyHorizonBars to test configs

### Phase 3: Type Cleanup
7. ✅ Standardize timestamp field names across all types
8. ✅ Add JSDoc comments clarifying timezone expectations

---

## Test Success Metrics

**Current**: 57/120 passing (47.5%)
**After Phase 1**: Est. 75/120 passing (62.5%)
**After Phase 2**: Est. 110/120 passing (91.7%)
**After Phase 3**: Est. 118/120 passing (98.3%)

---

## Conclusion

The failing tests have **uncovered real bugs** in the migration:
- ❌ Missing type definitions (BUG-001, BUG-003)
- ✅ Test configuration issues (BUG-002, BUG-004)
- ⚠️ Minor type inconsistencies (BUG-005)

**The tests are working correctly** - they found actual integration issues between the migrated code and type definitions.

**Action Required**: Fix the type definitions first, then update test fixtures to match correct types.
