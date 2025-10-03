# ADR-0314: End-to-End Testing with Fixture Scenarios

**Status:** Accepted
**Date:** 2025-09-30
**Deciders:** Architecture Team, QA Team
**Phase:** 3
**Shard:** Q1
**Issue:** #43

---

## Context

The TJR Suite comprises multiple packages working together in a complex pipeline:

```
Provider → Composite → Cache → Analysis → TJR Tools → Execution → Risk
```

While unit tests validate individual components, we lack validation that these components work together correctly as a complete system. We need:

- **End-to-end validation** of the entire pipeline
- **Fast feedback** for CI/CD (target: <2 minutes)
- **Deterministic tests** with no flaky failures
- **No external dependencies** (no live API calls)
- **Regression detection** when code changes
- **Clear failure diagnostics** when tests break

Without E2E tests, we risk:

- Integration bugs between packages going undetected
- Pipeline regressions from seemingly isolated changes
- Unpredictable behavior in production
- Difficulty reproducing and debugging issues
- Long feedback cycles during development

---

## Decision

We will implement **end-to-end scenario tests using deterministic fixture data** with snapshot validation.

### 1. Fixture-Based Testing

**Decision:** Use deterministic fixture data instead of live API calls

**Implementation:**

- Generate fixture bars using seeded random number generators
- Provide different patterns: trending, ranging, volatile
- Support multiple symbols (SPY, QQQ, IWM) and timeframes (1m, 5m)
- Ensure fixtures produce identical outputs on every run

**Example Fixture:**

```typescript
function generateFixtureBars(config: {
  symbol: string;
  date: Date;
  type: 'trend-up' | 'trend-down' | 'ranging';
}): MarketBar[] {
  const seed = `${config.symbol}-${config.date.toISOString()}`;
  const rand = seededRandom(seed);
  // Generate deterministic bars...
}
```

**Benefits:**

- No API costs or rate limits
- No network dependencies (100% reliable)
- Fast execution (<1 second per scenario)
- Reproducible across environments
- Can test edge cases not easily found in live data

**Trade-offs:**

- Doesn't test actual provider integrations (use smoke tests for that)
- Fixtures may not capture all real-world patterns
- Requires maintenance to keep fixtures realistic

---

### 2. Snapshot Testing

**Decision:** Use snapshot files to validate expected outputs

**Implementation:**

- Store expected outputs as JSON files in `e2e/specs/snapshots/`
- Compare test outputs against snapshots
- Fail tests if outputs diverge from snapshots
- Provide easy way to update snapshots when intentional changes occur

**Snapshot Structure:**

```json
{
  "bars": [
    /* 78 bars */
  ],
  "fvgs": [
    /* detected Fair Value Gaps */
  ],
  "orderBlocks": [
    /* detected Order Blocks */
  ],
  "confluences": [
    /* confluence scoring */
  ],
  "executionZones": [
    /* generated zones */
  ],
  "metadata": {
    "scenario": "scenario-01",
    "generated": "2025-09-30T00:00:00Z"
  }
}
```

**Benefits:**

- Easy to see what changed (git diff)
- Comprehensive regression testing
- Documents expected behavior
- Quick to verify correctness

**Trade-offs:**

- Snapshots can become stale if not maintained
- Large snapshot files in git
- Requires discipline to review diffs before updating

---

### 3. Scenario-Based Testing

**Decision:** Define discrete scenarios covering different market conditions

**Scenario Types:**

1. **Trending markets:** Strong directional moves (bullish/bearish)
2. **Ranging markets:** Consolidation, choppy price action
3. **Multi-timeframe:** Alignment across 5m and 1m charts
4. **Full pipeline:** Provider through execution zones
5. **Cache behavior:** Cold start vs warm cache

**Scenario Definition:**

```json
{
  "id": "scenario-01",
  "name": "SPY Trending Up Day",
  "fixture": {
    "symbol": "SPY",
    "date": "2025-09-29",
    "timeframe": "5m",
    "type": "trend-up"
  },
  "expectedOutputs": {
    "barCount": 78,
    "hasFairValueGaps": true,
    "minFvgCount": 2,
    "hasOrderBlocks": true,
    "trend": "bullish"
  },
  "pipeline": {
    "steps": [
      "provider-fixture",
      "composite-bars",
      "cache-store",
      "analysis-kit",
      "tjr-tools-confluences",
      "execution-zones"
    ]
  }
}
```

**Benefits:**

- Clear documentation of what each test validates
- Easy to add new scenarios
- Focused testing of specific behaviors
- Simple to debug failures

**Trade-offs:**

- Requires manual scenario creation
- May miss combinations not explicitly tested
- Scenario maintenance overhead

---

### 4. CI Integration

**Decision:** Run E2E tests on every PR and push to main/phase branches

**GitHub Actions Workflow:**

```yaml
name: E2E Fixtures

on:
  push:
    branches: [main, 'phase-**']
  pull_request:
    branches: [main]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm e2e
```

**Performance Targets:**

- **Total runtime:** <2 minutes (all scenarios)
- **Per-scenario:** <5 seconds
- **Parallelization:** Run scenarios concurrently (future optimization)

**Benefits:**

- Fast feedback on PRs
- Prevents integration regressions
- No flaky tests (deterministic fixtures)
- Clear pass/fail reporting

**Trade-offs:**

- Adds ~2 minutes to CI runtime
- Requires snapshot maintenance
- May need tuning for performance

---

## Alternatives Considered

### Alternative 1: Integration Tests with Test Doubles

**Approach:** Mock individual packages and test integrations with test doubles

**Pros:**

- Fine-grained control over test conditions
- Can test error scenarios easily
- Faster than E2E tests

**Cons:**

- Doesn't validate real component interactions
- Mocks can diverge from real implementations
- High maintenance burden (mocks per package)
- Doesn't catch integration bugs

**Decision:** Rejected. Mocks don't provide confidence that the real system works.

---

### Alternative 2: E2E Tests with Live APIs

**Approach:** Run E2E tests against live provider APIs

**Pros:**

- Tests real provider integrations
- Validates actual API responses
- Catches provider-specific issues

**Cons:**

- Slow (network latency, rate limits)
- Flaky (network issues, API changes)
- Expensive (API costs)
- Unreliable in CI (requires API keys)
- Non-deterministic (market data changes)

**Decision:** Rejected for E2E tests. Use smoke tests for live API validation.

---

### Alternative 3: Property-Based Testing

**Approach:** Generate random inputs and validate properties hold

**Pros:**

- Finds edge cases automatically
- Validates invariants across all inputs
- Good for algorithm testing

**Cons:**

- Non-deterministic (can't snapshot)
- Harder to debug failures
- Slower (needs many iterations)
- Doesn't validate specific real-world scenarios

**Decision:** Rejected. Use property tests for algorithms, fixtures for E2E.

---

### Alternative 4: Manual QA Testing Only

**Approach:** Rely on human testers to validate pipeline

**Pros:**

- Can test UI/UX aspects
- Flexible and adaptive
- Catches usability issues

**Cons:**

- Slow feedback (hours/days)
- Inconsistent coverage
- Expensive (human time)
- Not automated (can't run in CI)
- Doesn't prevent regressions

**Decision:** Rejected. Manual QA complements, doesn't replace automated E2E tests.

---

## Implementation Details

### Directory Structure

```
tjr-suite/
├── e2e/
│   ├── package.json              # E2E test dependencies
│   ├── runner.ts                 # Test runner script
│   ├── specs/
│   │   ├── scenarios/            # Scenario definitions (JSON)
│   │   │   ├── scenario-01-spy-trending-up.json
│   │   │   ├── scenario-02-qqq-ranging.json
│   │   │   ├── scenario-03-multi-timeframe.json
│   │   │   ├── scenario-04-full-execution.json
│   │   │   └── scenario-05-cache-behavior.json
│   │   └── snapshots/            # Expected outputs (JSON)
│   │       ├── scenario-01.json
│   │       ├── scenario-02.json
│   │       ├── scenario-03.json
│   │       ├── scenario-04.json
│   │       └── scenario-05.json
├── .github/workflows/
│   └── e2e-fixtures.yml          # CI workflow
└── docs/
    ├── testing/
    │   └── e2e.md                # User documentation
    └── adr/
        └── ADR-0314-e2e-tests.md # This document
```

---

### Test Runner Flow

```typescript
// 1. Load scenario definition
const scenario = loadScenario(scenarioId);

// 2. Generate fixture data (deterministic)
const bars = generateFixtureBars(scenario.fixture);

// 3. Execute pipeline steps
const outputs = await executePipeline(scenario, bars);

// 4. Validate expected outputs
const validationErrors = validateOutputs(scenario, outputs);

// 5. Compare with snapshot
const snapshotErrors = compareSnapshot(scenarioId, outputs);

// 6. Report results
return {
  passed: validationErrors.length === 0 && snapshotErrors.length === 0,
  errors: [...validationErrors, ...snapshotErrors],
};
```

---

### Scenario Validation

Each scenario validates:

1. **Bar count:** Correct number of bars generated
2. **FVG detection:** Fair Value Gaps present and above minimum count
3. **Order Block detection:** Order Blocks identified correctly
4. **Confluence scoring:** Confluences detected when expected
5. **Execution zones:** Zones generated with proper risk levels
6. **Trend bias:** Correct trend direction identified
7. **Snapshot match:** Outputs match expected snapshot

---

### Snapshot Management

**Creating snapshots:**

```bash
# Generate snapshots for all scenarios
pnpm e2e:update

# Generate snapshot for specific scenario
cd e2e && pnpm e2e:scenario=01 --update-snapshots
```

**Reviewing changes:**

```bash
# See what changed
git diff e2e/specs/snapshots/

# If correct, commit
git add e2e/specs/snapshots/
git commit -m "test: update E2E snapshots after FVG algorithm improvement"
```

**Snapshot update policy:**

- Always review diffs before committing
- Document why snapshots changed in commit message
- Never update snapshots to hide failing tests
- Ensure outputs are correct, not just different

---

## Risks and Mitigations

### Risk 1: Snapshots become stale

**Impact:** Tests pass with incorrect outputs

**Mitigations:**

- Regular review of snapshots (quarterly)
- Document snapshot update procedures
- Require explanation in commit messages
- Automated snapshot validation (JSON format, required fields)

---

### Risk 2: Fixtures don't represent real data

**Impact:** Tests pass but real data fails

**Mitigations:**

- Use realistic price movements in fixtures
- Generate fixtures from historical data patterns
- Supplement with smoke tests using live APIs
- Periodic validation of fixture realism

---

### Risk 3: Test runtime grows over time

**Impact:** CI becomes slow, developer feedback delayed

**Mitigations:**

- Monitor test duration in CI
- Set timeout limits (10 minutes max)
- Optimize slow scenarios
- Parallelize scenario execution (future)
- Remove redundant scenarios

---

### Risk 4: Snapshot maintenance burden

**Impact:** Snapshots fall out of sync with code

**Mitigations:**

- Clear documentation on when/how to update
- Automated checks for missing snapshots
- Tooling to simplify snapshot management
- Regular snapshot audits

---

## Success Metrics

1. **CI runtime:** <2 minutes for all E2E scenarios
2. **Scenario coverage:** 5+ scenarios covering key pipeline paths
3. **Determinism:** 100% pass rate on repeated runs (no flakes)
4. **Regression detection:** Catches integration bugs before merge
5. **Developer adoption:** Team runs E2E tests locally before pushing

---

## Future Work

### Phase 4: Scenario Expansion

Add scenarios for:

- Volatile markets (large price swings)
- Gap-up/gap-down days
- Low-volume periods
- News events (simulated spikes)
- Multi-symbol analysis

---

### Phase 5: Performance Optimization

- Parallelize scenario execution (run 5 scenarios in parallel)
- Cache fixture generation results
- Optimize validation logic
- Target <1 minute total CI runtime

---

### Phase 6: Advanced Validations

- Validate specific execution zone properties
- Check risk-reward ratios
- Verify confluence component alignment
- Test session boundary handling
- Validate profile generation

---

### Phase 7: Visualization

- Generate charts from scenario outputs
- Visual comparison of snapshots
- Interactive scenario explorer
- Output diff visualization

---

## References

- Issue: #43 [P3][Q1] End-to-end scenario tests (fixtures CI job)
- CI Workflow: `.github/workflows/e2e-fixtures.yml`
- Documentation: `docs/testing/e2e.md`
- Test Runner: `e2e/runner.ts`
- Fixture Generator: `packages/app/src/fixtures/index.ts`
- Related ADRs:
  - ADR-0051: Monorepo Bootstrap
  - ADR-0303: Provider Smoke Tests
  - ADR-0204: Bars Cache

---

## Changelog

- **2025-09-30:** Initial E2E testing framework
  - 5 scenarios covering trending, ranging, multi-timeframe, full pipeline, cache
  - Snapshot-based regression testing
  - GitHub Actions CI integration
  - Complete documentation (testing guide, ADR)
- **2025-09-30:** Added deterministic fixture generation
- **2025-09-30:** Implemented snapshot validation
