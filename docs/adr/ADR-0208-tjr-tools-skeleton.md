# ADR-0208: TJR-Tools Skeleton & API

## Status
Accepted

## Context

The TJR Suite requires a core analysis package that implements The Judas Renko (TJR) trading methodology. This package will serve as the central analysis engine, processing market data to identify high-probability trading setups through confluence detection.

The implementation follows a phased approach:
1. **Phase 2.F0** (this ADR): Establish the API surface and package skeleton
2. **Phase 2.F1** (Issue #28): Implement actual confluence detection algorithms
3. **Phase 2.G1** (Issue #26): Integrate with the application layer
4. **Phase 2.G3** (Issue #29): Enable backtesting capabilities

This skeleton phase is critical for:
- Defining a stable API contract that downstream packages can code against
- Establishing the package structure and build configuration
- Enabling parallel development of dependent features
- Validating the monorepo integration patterns established in ADR-0051

## Decision

We will create the `@tjr/tjr-tools` package with the following characteristics:

### API Surface

The package exposes a single primary function:
```typescript
analyze(input: TJRAnalysisInput, config?: TJRConfig): TJRResult
```

This function:
- Accepts market data and analysis parameters
- Returns deterministic results for the same input
- Provides confluence scores and optional execution parameters
- Includes warnings about data quality or analysis limitations

### Package Structure

```
packages/tjr-tools/
├── src/
│   ├── index.ts           # Main exports
│   ├── analyze.ts          # Core analysis function
│   ├── config.ts           # Configuration types
│   └── confluences/        # Confluence detection modules
│       ├── fvg.ts          # Fair Value Gap (stub)
│       └── order-block.ts  # Order Block (stub)
├── tests/
│   └── analyze.test.ts     # Unit tests
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### Type Dependencies

The package depends on `@tjr/contracts` for canonical type definitions:
- `TJRAnalysisInput`: Input data structure
- `TJRResult`: Output data structure
- `TJRConfluence`: Confluence scoring details
- `TJRExecution`: Trade execution parameters
- `MarketBar`: OHLCV data structure
- `Timeframe`: Standard timeframe enum

### Configuration Options

The `TJRConfig` interface provides runtime configuration:
- Confluence thresholds
- Risk management parameters
- Feature toggles for different confluence types
- Debug mode flag

All configuration fields are optional with sensible defaults.

### Stub Implementation

For this skeleton phase, confluence detection returns deterministic empty results:
- All confluence factors return 0 confidence
- No execution parameters are generated
- Warnings indicate which features are not yet implemented

This allows:
- Full API testing without implementation complexity
- Downstream development to proceed with known output shapes
- Clear separation between API design and algorithm implementation

## Alternatives Considered

### Alternative 1: Full Implementation in Single Phase

We considered implementing the complete analysis logic in one phase.

**Rejected because:**
- Would delay downstream development by weeks
- Increases risk of API changes after integration
- Prevents parallel work on Issues #26, #28, and #29
- Makes code review more complex

### Alternative 2: Mock Package Without Real Structure

We considered creating a simple mock package without proper structure.

**Rejected because:**
- Would require significant refactoring when adding real implementation
- Doesn't validate build and test infrastructure
- Provides less confidence in the API design
- May miss integration issues early

### Alternative 3: Multiple Analysis Functions

We considered exposing separate functions for each confluence type.

**Rejected because:**
- Creates a more complex API surface
- Makes it harder to coordinate multiple confluences
- Increases coupling between packages
- Complicates configuration management

## Risks and Mitigations

### Risk 1: API Changes After Implementation

**Risk:** The API may need changes once real algorithms are implemented.

**Mitigation:**
- API designed based on established TJR methodology requirements
- Using TypeScript for compile-time validation
- Keeping the surface minimal and focused
- Version 0.x indicates pre-stable API

### Risk 2: Performance Constraints Not Discovered

**Risk:** Skeleton doesn't reveal performance characteristics.

**Mitigation:**
- Performance requirements documented in comments
- Benchmark tests to be added with implementation
- Async API considered but deferred (can add later if needed)
- Metadata includes `computeTimeMs` for monitoring

### Risk 3: Missing Confluence Types

**Risk:** Additional confluence factors may be needed.

**Mitigation:**
- Configuration uses feature toggles for easy addition
- Factor system is extensible (array of weighted factors)
- Weights are normalized automatically
- New factors can be added without breaking changes

## Consequences

### Positive

1. **Unblocks Parallel Development**: Issues #26, #28, and #29 can proceed immediately
2. **API Stability**: Downstream code can be written against stable interface
3. **Clear Separation**: API design separated from implementation complexity
4. **Test Infrastructure**: Establishes testing patterns for the package
5. **Documentation**: Forces early documentation of the API
6. **Integration Validation**: Confirms monorepo patterns work for new packages

### Negative

1. **Temporary Technical Debt**: Stub implementations must be replaced
2. **Potential Rework**: API might need adjustment after implementation
3. **Misleading Results**: Skeleton returns zeros which could confuse users
4. **Extra Effort**: Creating skeleton first adds overhead

### Neutral

1. **Two-Phase Delivery**: Feature not usable until Issue #28 completes
2. **Documentation Overhead**: Must document current limitations clearly
3. **Version Management**: Need clear versioning strategy for pre-1.0

## Implementation Notes

### Build and Test Commands

```bash
# From monorepo root
pnpm --filter @tjr/tjr-tools build
pnpm --filter @tjr/tjr-tools test
```

### Integration Points

1. **Issue #28**: Will replace stub confluences with real implementations
2. **Issue #26**: Will import and call `analyze()` from application layer
3. **Issue #29**: Will use results for backtesting validation

### Success Metrics

- [ ] Package builds without errors
- [ ] All tests pass
- [ ] Types are properly exported and consumable
- [ ] Documentation is complete and accurate
- [ ] Downstream packages can import and use the API

## References

- Issue #27: [P2][F0] TJR-Tools skeleton & API
- Issue #28: [P2][F1] TJR-Tools confluences (FVG + Order Block)
- Issue #26: [P2][G1] Minimal app wiring (wires bars-cache + analysis + display)
- Issue #29: [P2][G3] Backtesting-cli for hit-rate calc
- ADR-0051: Monorepo Bootstrap
- ADR-0052: Contracts Package

## Approval

- Author: Nice Wolf Studio
- Date: 2025-01-30
- Reviewers: TBD during PR review