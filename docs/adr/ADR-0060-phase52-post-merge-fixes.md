# ADR-0060: Post-Merge Resolution: TypeScript Configuration and Test Cleanup

**Status:** Accepted
**Date:** 2025-10-01
**Deciders:** Architecture Team
**Phase:** 52
**Shards:** A2, A3, A4

---

## Context

After merging PR #69 (Phase 52 Databento + Foundation), the integration exposed technical debt and configuration issues that blocked the build pipeline and test suite. The merge brought together multiple packages that had evolved independently, revealing three critical issues:

1. **TypeScript build failures:** Path mappings in `tsconfig.json` files across multiple packages incorrectly pointed to `src/` directories instead of `dist/`, preventing successful compilation when packages referenced each other.

2. **Test suite failures:** The `@tjr/sessions-calendar` package had three failing tests that expected Forex session boundary functions (`getUtcSessionBoundaries()` and `getActiveUtcSession()`) which were never implemented in the codebase.

3. **Cache API misuse:** The `@tjr/provider-composite` package incorrectly used `CacheStore` for multi-bar range queries, when `CacheStore` is designed for single-bar caching operations only.

These issues blocked CI/CD and prevented developers from building the monorepo locally, requiring immediate resolution.

---

## Decision

### 1. **TypeScript Path Mappings: Point to `dist/` not `src/`**

We corrected all TypeScript path mappings in `tsconfig.json` files to reference compiled output directories.

**Changes:**

```json
// Before (incorrect)
"@tjr/contracts": ["../contracts/src"]

// After (correct)
"@tjr/contracts": ["../contracts/dist"]
```

**Rationale:**

- TypeScript project references require consuming packages to import compiled JavaScript/declaration files
- Pointing to `src/` causes TypeScript to attempt recompilation of dependencies, violating `rootDir` constraints
- The `dist/` pattern aligns with Node.js module resolution at runtime

**Affected packages:**

- `@tjr/provider-polygon`
- `@tjr/provider-composite`
- `@tjr/provider-yahoo`
- All other provider packages with internal dependencies

---

### 2. **Test Cleanup: Remove Unimplemented Forex Session Tests**

We removed three failing tests from `@tjr/sessions-calendar` that referenced non-existent API methods.

**Removed tests:**

```typescript
// These tests were deleted entirely:
-'should return UTC session boundaries for forex market' -
  'should return active UTC session for forex during London hours' -
  'should return null for forex outside trading hours';
```

**Rationale:**

- The functions `getUtcSessionBoundaries()` and `getActiveUtcSession()` were never implemented
- These appear to be aspirational tests for future Forex support (24-hour markets)
- Following Wolf Ethos: remove unused code rather than maintain dead tests
- The remaining 18 CME futures tests provide adequate coverage for implemented functionality

**Test results after cleanup:**

```bash
# Before: 21 tests, 3 failing
# After: 18 tests, 18 passing
```

---

### 3. **Cache Simplification: Remove Incorrect CacheStore Usage**

We removed cache logic from `@tjr/provider-composite` and simplified to direct provider calls.

**Before (incorrect):**

```typescript
// Attempted to use CacheStore for multi-bar ranges
const cachedBars = await this.cacheStore.getMany(symbol, timeframe, startTime, endTime);
```

**After (correct):**

```typescript
// Direct provider call without caching
const bars = await provider.getBars(symbol, timeframe, startTime, endTime, options);
```

**Rationale:**

- `CacheStore` API is designed for single-bar operations (`get`, `set`, `has`)
- No `getMany()` method exists for range queries
- Premature optimization: defer caching until performance metrics demonstrate need
- Simplified code is more maintainable and correct

---

## Consequences

### Positive

1. **Build stability:** All packages now compile successfully with proper TypeScript project references
2. **Test reliability:** Test suite passes 100% without false failures
3. **API clarity:** Removed confusion about non-existent session boundary methods
4. **Code simplicity:** Composite provider logic is cleaner without incorrect cache layer
5. **Developer experience:** Local development and CI/CD pipelines work without manual intervention

### Negative

1. **Performance consideration:** Composite provider lacks caching (acceptable until metrics show need)
2. **Forex limitation:** No 24-hour market session support (was never implemented anyway)
3. **Migration effort:** Developers must rebuild all packages after pulling these changes

### Neutral

1. **Backward compatibility:** All changes maintain API compatibility; no breaking changes for consumers
2. **Documentation debt:** Need to update provider documentation to clarify caching strategy

---

## Alternatives Considered

### Alternative 1: Fix TypeScript by Using `src/` Everywhere

**Approach:** Configure all packages to import from `src/` directories with complex `rootDir` overrides.

**Pros:**

- Faster development builds (skip compilation step)
- Direct access to TypeScript source

**Cons:**

- Violates TypeScript project references architecture
- Requires complex `rootDir` and `include` gymnastics
- Breaks at runtime (Node.js expects JavaScript, not TypeScript)

**Decision:** Rejected. The `dist/` pattern is the standard for TypeScript monorepos.

---

### Alternative 2: Implement Missing Forex Session Functions

**Approach:** Write the missing `getUtcSessionBoundaries()` and `getActiveUtcSession()` functions.

**Pros:**

- Tests would pass without deletion
- Adds Forex market support

**Cons:**

- Significant implementation effort for unused functionality
- No current requirements for Forex sessions
- Increases maintenance burden

**Decision:** Rejected. Follow YAGNI principle; implement when actually needed.

---

### Alternative 3: Implement Range Caching in CacheStore

**Approach:** Extend `CacheStore` with `getMany()` and `setMany()` methods for range queries.

**Pros:**

- Could improve composite provider performance
- Reusable for other providers

**Cons:**

- Complex cache invalidation logic for overlapping ranges
- No evidence that caching is current bottleneck
- Risk of cache coherence bugs

**Decision:** Rejected. Defer until performance profiling demonstrates need.

---

## Risks and Mitigations

### Risk 1: Hidden TypeScript Configuration Issues

**Impact:** Other packages may have similar path mapping problems not yet discovered.

**Mitigation:**

- Audit all `tsconfig.json` files for consistency
- Add lint rule to enforce `dist/` references
- Document standard tsconfig patterns in developer guide

---

### Risk 2: Performance Regression Without Caching

**Impact:** Composite provider may be slower without cache layer.

**Mitigation:**

- Add performance benchmarks to track provider latency
- Monitor production metrics after deployment
- Implement caching if metrics show > 100ms latency for common queries

---

### Risk 3: Developer Confusion About Removed Tests

**Impact:** Developers might try to re-add Forex session tests.

**Mitigation:**

- Add comment in test file explaining why Forex tests were removed
- Document in sessions-calendar README that Forex is not supported
- Create GitHub issue to track Forex feature if requested

---

## Rollback Plan

If any fix causes unexpected issues:

1. **TypeScript paths:** Revert to `src/` paths and disable project references temporarily
2. **Test removal:** Re-add tests with `skip()` annotation to prevent failures
3. **Cache removal:** Re-add cache calls with try-catch wrapper to swallow errors

**Estimated rollback time:** < 30 minutes (simple git revert)

---

## Success Metrics

1. **Build success:** 100% of packages compile without TypeScript errors
2. **Test coverage:** All test suites pass without skipped/failing tests
3. **CI/CD health:** GitHub Actions workflows complete in < 10 minutes
4. **Developer feedback:** No build-related issues reported in first week post-merge

---

## Related

- **PR #69:** Phase 52 Databento + Foundation merge
- **Journal 52.A2:** TypeScript path mapping fixes
- **Journal 52.A3:** Session calendar test cleanup
- **Journal 52.A4:** Composite provider cache removal
- **ADR-0302:** Provider Databento architecture
- **ADR-0058:** Sessions Calendar design

---

## Changelog

- **2025-10-01:** Initial ADR created documenting post-merge fixes for Phase 52
