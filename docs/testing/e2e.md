# End-to-End (E2E) Testing Guide

**Status:** Active
**Last Updated:** 2025-09-30
**Owner:** QA Team

---

## Overview

The TJR Suite E2E testing framework validates the entire trading pipeline from data providers through to execution zones using deterministic fixture data. These tests ensure all components work together correctly and produce consistent, expected outputs.

### What E2E Tests Validate

E2E tests validate the complete pipeline:

```
Provider (fixtures) → Composite → Cache → Analysis → TJR Tools → Execution Zones
```

**Key validations:**

- Data flows correctly through all pipeline stages
- Fixture data produces deterministic outputs
- Fair Value Gaps (FVGs) are detected correctly
- Order Blocks are identified accurately
- Confluence scoring works as expected
- Execution zones are generated properly
- Cache behavior (hits and misses) works correctly
- Snapshots match expected outputs

---

## Quick Start

### Running E2E Tests Locally

```bash
# Run all scenarios
pnpm e2e

# Run specific scenario
cd e2e && pnpm e2e:scenario=01

# Update snapshots after code changes
pnpm e2e:update
```

### Running in CI

E2E tests run automatically on:

- Every push to `main` or `phase-**` branches
- Every pull request to `main`
- Manual workflow dispatch via GitHub Actions UI

```bash
# Trigger manually via GitHub CLI
gh workflow run e2e-fixtures.yml

# Run specific scenario
gh workflow run e2e-fixtures.yml -f scenario=01
```

---

## Test Scenarios

### Scenario 01: SPY Trending Up Day

**File:** `e2e/specs/scenarios/scenario-01-spy-trending-up.json`

**Description:** Full pipeline test with SPY on a strong uptrend day (2025-09-29)

**Fixture:**

- Symbol: SPY
- Date: 2025-09-29
- Timeframe: 5m
- Type: Trending up

**Expected Outputs:**

- 78 bars (full trading day)
- Multiple Fair Value Gaps detected
- Multiple Order Blocks identified
- Bullish trend bias
- Execution zones present

**Use Case:** Validates detection of bullish patterns and confluence during strong uptrends

---

### Scenario 02: QQQ Ranging Day

**File:** `e2e/specs/scenarios/scenario-02-qqq-ranging.json`

**Description:** Full pipeline test with QQQ on a consolidation/ranging day

**Fixture:**

- Symbol: QQQ
- Date: 2025-09-27
- Timeframe: 5m
- Type: Ranging/consolidation

**Expected Outputs:**

- 78 bars (full trading day)
- Some Fair Value Gaps detected
- Some Order Blocks identified
- Neutral trend bias
- Fewer execution zones than trending days

**Use Case:** Validates behavior during low-conviction, choppy market conditions

---

### Scenario 03: Multi-Timeframe Analysis

**File:** `e2e/specs/scenarios/scenario-03-multi-timeframe.json`

**Description:** Test multi-timeframe analysis with 5m and 1m bars for SPY

**Fixture:**

- Symbol: SPY
- Date: 2025-09-29
- Timeframes: 5m, 1m
- Type: Trending up

**Expected Outputs:**

- 5m: 78 bars with FVGs and Order Blocks
- 1m: 390 bars with FVGs and Order Blocks
- Timeframe alignment detected
- Confluence from multiple timeframes

**Use Case:** Validates multi-timeframe analysis and alignment detection

---

### Scenario 04: Full Execution Pipeline

**File:** `e2e/specs/scenarios/scenario-04-full-execution.json`

**Description:** Complete pipeline from provider to execution zones with confluence scoring

**Fixture:**

- Symbol: IWM
- Date: 2025-09-29
- Timeframe: 5m
- Type: Trending up

**Expected Outputs:**

- 78 bars
- Fair Value Gaps and Order Blocks detected
- Confluences identified (score >= 2)
- Execution zones generated
- Risk levels calculated

**Use Case:** Validates complete execution workflow with risk management

---

### Scenario 05: Cache Behavior

**File:** `e2e/specs/scenarios/scenario-05-cache-behavior.json`

**Description:** Test cache behavior with cold start (miss) and warm cache (hit)

**Fixture:**

- Symbol: SPY
- Date: 2025-09-29
- Timeframe: 5m
- Type: Trending up

**Expected Outputs:**

- Cold start: Cache miss, loads from provider (fixture)
- Warm cache: Cache hit, loads from cache
- Both produce identical outputs
- Cache performance improvement

**Use Case:** Validates caching layer correctness and determinism

---

## Snapshot Testing

### What Are Snapshots?

Snapshots are JSON files containing the expected outputs for each scenario. They serve as regression tests to ensure code changes don't unexpectedly alter behavior.

**Location:** `e2e/specs/snapshots/scenario-*.json`

**Contents:**

- Bars data
- Detected FVGs
- Identified Order Blocks
- Confluences
- Execution zones
- Metadata

### When to Update Snapshots

Update snapshots when:

1. **Intentional algorithm changes:** You've improved FVG detection, Order Block logic, etc.
2. **Bug fixes:** Fixed logic produces different (correct) outputs
3. **New features:** Added execution zones, risk levels, etc.

**Do NOT update snapshots if:**

- Tests fail unexpectedly (investigate first!)
- Outputs look wrong (fix the bug, don't hide it)
- You don't understand why outputs changed

### How to Update Snapshots

```bash
# Update all snapshots
pnpm e2e:update

# Verify changes look correct
git diff e2e/specs/snapshots/

# Commit if correct
git add e2e/specs/snapshots/
git commit -m "test: update E2E snapshots after [reason]"
```

**Snapshot Update Checklist:**

- [ ] Run tests before updating: `pnpm e2e`
- [ ] Update snapshots: `pnpm e2e:update`
- [ ] Review diff: `git diff e2e/specs/snapshots/`
- [ ] Verify outputs are correct (not just different)
- [ ] Document reason in commit message
- [ ] Run tests again to confirm: `pnpm e2e`
- [ ] Commit with descriptive message

---

## Adding New Scenarios

### Step 1: Create Scenario Definition

Create `e2e/specs/scenarios/scenario-XX-name.json`:

```json
{
  "id": "scenario-06",
  "name": "Your Scenario Name",
  "description": "What this scenario tests",
  "fixture": {
    "symbol": "SPY",
    "date": "2025-09-29",
    "timeframe": "5m",
    "type": "trend-up"
  },
  "expectedOutputs": {
    "barCount": 78,
    "hasFairValueGaps": true,
    "hasOrderBlocks": true,
    "minFvgCount": 2,
    "minOrderBlockCount": 1
  },
  "pipeline": {
    "steps": ["provider-fixture", "composite-bars", "analysis-kit", "tjr-tools-confluences"]
  },
  "tags": ["your", "tags", "here"]
}
```

### Step 2: Generate Initial Snapshot

```bash
# Run with snapshot update to generate baseline
pnpm e2e:update

# Verify snapshot was created
ls -la e2e/specs/snapshots/scenario-06-*.json
```

### Step 3: Validate Scenario

```bash
# Run specific scenario
cd e2e && pnpm e2e:scenario=06

# Verify it passes
echo $?  # Should be 0
```

### Step 4: Document in README

Update this file with:

- Scenario description
- Purpose and use case
- Expected behavior
- Any special notes

---

## Troubleshooting

### Test Failures

#### "Bar count mismatch"

**Cause:** Fixture generator produced different number of bars than expected

**Solution:**

1. Check fixture configuration in scenario JSON
2. Verify `barCount` in `expectedOutputs` matches fixture type
3. Full trading day = 78 bars (6.5 hours \* 12 five-minute bars/hour)

#### "FVG count below minimum"

**Cause:** FVG detection logic changed or fixture data doesn't produce enough gaps

**Solution:**

1. Review FVG detection algorithm in `@tjr/tjr-tools`
2. Check if fixture data has sufficient price gaps
3. Adjust `minFvgCount` if expectations were too high
4. Update snapshot if algorithm improved

#### "Snapshot does not exist"

**Cause:** Running test before generating snapshot

**Solution:**

```bash
# Generate snapshot first
pnpm e2e:update

# Then run test
pnpm e2e
```

#### "Snapshot mismatch"

**Cause:** Code changes altered outputs

**Solution:**

1. Review what changed: `git diff e2e/specs/snapshots/`
2. If changes are correct: `pnpm e2e:update`
3. If changes are wrong: Fix the bug, don't update snapshot

### Performance Issues

#### Tests taking too long (>2 minutes)

**Causes:**

- Too many scenarios
- Complex fixture generation
- Inefficient validation

**Solutions:**

- Profile with `time pnpm e2e`
- Simplify fixture data
- Optimize validation logic
- Run specific scenarios during development

#### CI timeout (>10 minutes)

**Causes:**

- Network issues (shouldn't happen with fixtures)
- Dependency installation slow
- Test runner hanging

**Solutions:**

- Check CI logs for bottlenecks
- Verify pnpm cache is working
- Ensure no live API calls (should be fixtures only)

---

## Best Practices

### Fixture Design

1. **Deterministic:** Always use the same seed for random data
2. **Realistic:** Mimic real market conditions
3. **Diverse:** Cover trending, ranging, volatile scenarios
4. **Stable:** Don't include timestamps or random IDs

### Scenario Design

1. **Focused:** Each scenario tests one specific behavior
2. **Fast:** Aim for <5 seconds per scenario
3. **Isolated:** No dependencies between scenarios
4. **Clear:** Descriptive names and documentation

### Snapshot Management

1. **Review:** Always review snapshot diffs before committing
2. **Document:** Explain why snapshots changed in commit messages
3. **Validate:** Ensure outputs are correct, not just different
4. **Version:** Commit snapshots with code changes

### CI Integration

1. **Fast:** Keep total runtime under 2 minutes
2. **Reliable:** No flaky tests (use deterministic fixtures)
3. **Clear:** Provide helpful error messages
4. **Actionable:** Make it obvious what broke and how to fix

---

## Architecture

### Pipeline Flow

```
┌──────────────┐
│   Provider   │  (Fixture mode - deterministic data)
│  (fixtures)  │
└──────┬───────┘
       │
       v
┌──────────────┐
│  Composite   │  (Aggregate bars, clip to sessions)
│    Bars      │
└──────┬───────┘
       │
       v
┌──────────────┐
│    Cache     │  (Store in memory/DB cache)
│    Store     │
└──────┬───────┘
       │
       v
┌──────────────┐
│  Analysis    │  (Market structure, bias, profiles)
│     Kit      │
└──────┬───────┘
       │
       v
┌──────────────┐
│  TJR Tools   │  (FVG, Order Blocks, Confluences)
│ (Confluences)│
└──────┬───────┘
       │
       v
┌──────────────┐
│  Execution   │  (Generate execution zones)
│    Zones     │
└──────┬───────┘
       │
       v
┌──────────────┐
│     Risk     │  (Calculate stop loss, take profit)
│  Management  │
└──────────────┘
```

### Test Runner Architecture

```typescript
// Load scenario definition
const scenario = loadScenario(scenarioId);

// Generate fixture data (deterministic)
const bars = generateFixtureBars(scenario.fixture);

// Execute pipeline steps
for (const step of scenario.pipeline.steps) {
  await executeStep(step, bars);
}

// Validate outputs
const errors = validateOutputs(scenario, outputs);

// Compare with snapshot
const { match, errors } = compareSnapshot(scenarioId, outputs);

// Report results
return { passed: errors.length === 0, errors, outputs };
```

---

## Related Documentation

- [ADR-0314: E2E Tests with Fixtures](../adr/ADR-0314-e2e-tests.md) - Architecture decision
- [Provider Smoke Tests](../ops/provider-smokes.md) - Live API testing (not fixtures)
- [CI Workflow](../../.github/workflows/e2e-fixtures.yml) - GitHub Actions configuration
- [Fixture Generator](../../packages/app/src/fixtures/index.ts) - Deterministic data generation

---

## Changelog

- **2025-09-30:** Initial E2E testing framework with 5 scenarios
  - Scenario 01: SPY trending up day
  - Scenario 02: QQQ ranging day
  - Scenario 03: Multi-timeframe analysis
  - Scenario 04: Full execution pipeline
  - Scenario 05: Cache behavior test
- **2025-09-30:** Added snapshot testing support
- **2025-09-30:** Integrated with GitHub Actions CI
