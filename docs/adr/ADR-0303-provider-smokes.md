# ADR-0303: Provider Smoke Test Workflows

**Status:** Accepted
**Date:** 2025-09-30
**Deciders:** DevOps Team
**Phase:** 3
**Shard:** B5
**Issue:** #32

---

## Context

The TJR Suite integrates with multiple external market data providers (Yahoo Finance, Polygon.io) via HTTP APIs. These integrations require live testing to validate:

- **API Key Validity**: Confirm authentication credentials work correctly
- **API Availability**: Verify provider endpoints are accessible and responsive
- **Data Quality**: Ensure returned data meets expected format and quality standards
- **Quota Management**: Check remaining API call limits before production deployment
- **Provider Behavior**: Validate provider-specific quirks and rate limits

Key challenges:

- **CI/CD Noise**: Running live API tests on every PR creates excessive log output and failed checks when API keys aren't present
- **API Costs**: Each provider call consumes quota and may incur charges (Polygon.io charges per call on paid tiers)
- **Rate Limits**: Providers enforce strict rate limits (Polygon free tier: 5 req/min; Yahoo: ~100 req/hour)
- **Security**: API keys must never appear in logs or be accessible to unauthorized workflows
- **Testing vs Production**: Need to test provider integrations without impacting production quotas

Without a dedicated smoke test workflow:

- Developers waste API quota testing manually
- No standardized way to validate provider health
- API key rotation requires manual verification
- No visibility into quota consumption
- Provider failures discovered only in production

---

## Decision

### 1. Manual-Only Workflow Trigger

Implement smoke tests using `workflow_dispatch` trigger exclusively - **never** automatic execution.

**Rationale:**

- **No PR Noise**: Avoids failed checks when contributors don't have API keys
- **Cost Control**: Prevents accidental quota consumption on every commit
- **Explicit Testing**: Forces deliberate decision to consume API quota
- **Security**: Reduces attack surface (no automatic runs from external forks)

**Trigger Configuration:**

```yaml
on:
  workflow_dispatch:
    inputs:
      provider:
        description: 'Provider to test'
        required: true
        type: choice
        options: [yahoo, polygon, all]
        default: 'all'

      symbol:
        description: 'Trading symbol to test'
        required: true
        type: string
        default: 'ES=F'

      timeframe:
        description: 'Timeframe for data request'
        required: true
        type: choice
        options: [1m, 5m, 1h, 1D]
        default: '1h'

      dry-run:
        description: 'Dry run (validate setup without API calls)'
        required: false
        type: boolean
        default: false
```

**Alternatives Considered:**

- **Scheduled Runs** (`cron`): Rejected - wastes quota even when no changes occur
- **PR-Triggered** (`pull_request`): Rejected - creates noise, security risk, cost concerns
- **Manual + Scheduled Hybrid**: Rejected - complexity outweighs benefits

---

### 2. Per-Provider Matrix Execution

Use GitHub Actions matrix strategy to run providers in parallel.

**Implementation:**

```yaml
strategy:
  matrix:
    provider: ${{ fromJSON(inputs.provider == 'all' && '["yahoo", "polygon"]' || format('["{0}"]', inputs.provider)) }}
  fail-fast: false
```

**Benefits:**

- **Parallel Execution**: Test multiple providers simultaneously (faster feedback)
- **Independent Failures**: One provider failure doesn't block others
- **Flexible Targeting**: Test specific providers or all at once
- **Scalability**: Easy to add new providers (Alpaca, IEX, etc.)

**Alternative Considered:**

- **Sequential Execution**: Rejected - slower, no benefit for independent tests

---

### 3. Comprehensive Secret Masking

Implement multiple layers of secret protection.

**Security Measures:**

1. **GitHub Automatic Masking**: Secrets registered in GitHub Actions automatically masked
2. **Explicit Masking**: Use `::add-mask::` directive for extra protection
3. **Environment Variables**: Pass secrets via `env:` block, never command arguments
4. **URL Sanitization**: Never echo complete API URLs that may contain keys

**Implementation:**

```yaml
env:
  POLYGON_API_KEY: ${{ secrets.POLYGON_API_KEY }}

run: |
  # Explicit masking
  echo "::add-mask::$POLYGON_API_KEY"

  # API key only in environment, never in command
  pnpm --filter @tjr/provider-polygon test:smoke -- \
    --symbol="${{ inputs.symbol }}" \
    --timeframe="${{ inputs.timeframe }}"
```

**What Gets Logged:**

- **Safe**: Provider name, symbol, timeframe, status codes, validation results
- **Masked**: API keys, authentication tokens, complete API URLs

---

### 4. Rate Limit Protection

Build rate limiting directly into workflow to prevent API violations.

**Implementation:**

```yaml
# Yahoo: 3-second delay
- name: Smoke test - Yahoo
  run: |
    echo "Rate limiting: Waiting 3 seconds before API call..."
    sleep 3
    pnpm --filter @tjr/provider-yahoo test:smoke

# Polygon: 5-second delay
- name: Smoke test - Polygon
  run: |
    echo "Rate limiting: Waiting 5 seconds before API call..."
    sleep 5
    pnpm --filter @tjr/provider-polygon test:smoke
```

**Delays Chosen:**

- **Yahoo**: 3 seconds (conservative estimate for ~100 req/hour limit)
- **Polygon**: 5 seconds (free tier: 5 req/min = 12 seconds per call minimum)

**Alternatives Considered:**

- **No Delays**: Rejected - risks rate limit violations
- **Dynamic Delays**: Rejected - complexity, requires quota tracking

---

### 5. Graceful Degradation for Missing Scripts

Workflow validates environment without failing when `test:smoke` scripts don't exist yet.

**Current Reality:** As of Phase 3.B5, provider packages don't have smoke test scripts implemented.

**Solution:** Detect missing scripts and warn, but don't fail:

```yaml
if ! grep -q '"test:smoke"' packages/provider-yahoo/package.json 2>/dev/null; then
  echo "WARNING: test:smoke script not found in package.json"
  echo "Please add this script to packages/provider-yahoo/package.json:"
  echo '  "test:smoke": "node dist/smoke-test.js"'
  echo ""
  echo "SKIPPING: Smoke test script not implemented yet"
  exit 0
fi
```

**Benefits:**

- **Non-Blocking**: Workflow can be tested and validated now
- **Clear Guidance**: Provides exact instructions for future implementation
- **Progressive Enhancement**: Scripts can be added incrementally per provider
- **Documentation**: Serves as in-workflow documentation of expected format

---

### 6. Dry-Run Mode for Setup Validation

Add `dry-run` input to validate workflow configuration without consuming API quota.

**Use Cases:**

- **Workflow Development**: Test configuration changes without API calls
- **Secret Validation**: Confirm secrets are configured (without exposing values)
- **Structure Verification**: Validate package structure and build artifacts
- **First-Time Setup**: Test workflow before spending quota

**Implementation:**

```yaml
- name: Dry-run validation
  if: inputs.dry-run == true
  run: |
    echo "==== DRY RUN MODE ===="
    echo "Provider: ${{ matrix.provider }}"

    # Verify package structure
    if [ ! -d "packages/provider-${{ matrix.provider }}" ]; then
      echo "ERROR: Provider package not found"
      exit 1
    fi

    # Verify build artifacts
    if [ ! -d "packages/provider-${{ matrix.provider }}/dist" ]; then
      echo "ERROR: Build artifacts not found"
      exit 1
    fi

    echo "Dry-run validation passed"
    exit 0
```

---

### 7. Cost-Conscious Design

Multiple features to minimize API quota consumption and costs.

**Cost Optimization Features:**

1. **Manual Trigger**: No accidental runs
2. **Dry-Run Mode**: Test setup without quota consumption
3. **Selective Providers**: Test specific providers, not always all
4. **Higher Timeframes**: Default to 1h (lower quota usage than 1m)
5. **Rate Limiting**: Prevents burst usage that may incur surcharges
6. **Timeout Protection**: 10-minute limit prevents runaway costs

**Cost Estimation (Per Run):**

| Configuration       | API Calls | Polygon Cost (Starter) | Yahoo Cost |
| ------------------- | --------- | ---------------------- | ---------- |
| Single provider, 1h | 1-2       | $0.0003-$0.001         | Free       |
| All providers, 1h   | 2-4       | $0.0006-$0.002         | Free       |
| Single provider, 1m | 5-10      | $0.0015-$0.01          | Free       |
| All providers, 1m   | 10-20     | $0.003-$0.02           | Free       |

---

## Technical Details

### Workflow Structure

**File:** `.github/workflows/provider-smoke.yml`

**Jobs:**

1. **smoke-test**: Execute provider smoke tests
   - Matrix strategy for parallel execution
   - Per-provider configuration
   - Secret injection
   - Rate limiting
   - Timeout protection (10 minutes)

2. **summary**: Aggregate results
   - Waits for all provider tests
   - Generates GitHub Actions summary
   - Always runs (even on failure)

**Steps:**

1. Checkout code (shallow clone for speed)
2. Setup Node.js with pnpm caching
3. Install pnpm
4. Install dependencies (frozen lockfile)
5. Build provider package
6. [Optional] Run dry-run validation
7. Execute provider-specific smoke test
8. Report results

### Input Parameters

| Parameter   | Type    | Default | Description                                  |
| ----------- | ------- | ------- | -------------------------------------------- |
| `provider`  | choice  | `all`   | Provider to test (`yahoo`, `polygon`, `all`) |
| `symbol`    | string  | `ES=F`  | Trading symbol (provider-specific format)    |
| `timeframe` | choice  | `1h`    | Data timeframe (`1m`, `5m`, `1h`, `1D`)      |
| `dry-run`   | boolean | `false` | Validate setup without API calls             |

### Secret Management

**Required Secrets:**

- `YAHOO_API_KEY`: Yahoo Finance API key (optional, depending on implementation)
- `POLYGON_API_KEY`: Polygon.io API key (required)

**Storage Location:** Repository Settings > Secrets and variables > Actions

**Access Control:** Secrets only accessible to workflows running on protected branches

### Matrix Strategy

**Dynamic Matrix Configuration:**

```yaml
# Single provider
inputs.provider: "yahoo"
matrix.provider: ["yahoo"]

# All providers
inputs.provider: "all"
matrix.provider: ["yahoo", "polygon"]
```

**Execution:** Providers run in parallel, independent job instances

---

## Alternatives Considered

### 1. Scheduled Smoke Tests (Cron)

**Pros:**

- Automatic health monitoring
- Regular validation without manual intervention

**Cons:**

- Wastes quota on periods without changes
- No control over execution timing
- May hit rate limits if other tests run simultaneously
- False positives when providers have maintenance

**Decision:** Rejected. Manual execution provides better cost control and flexibility.

---

### 2. PR-Triggered Smoke Tests

**Pros:**

- Validates provider changes immediately
- Catches regressions before merge

**Cons:**

- Creates CI noise when API keys missing (external contributors)
- Wastes quota on PRs that don't touch provider code
- Security risk (exposing API keys to fork PRs)
- Slows down PR feedback loop (network latency)

**Decision:** Rejected. Security and cost concerns outweigh benefits.

---

### 3. Single Provider Workflow Per Provider

**Pros:**

- Simpler YAML structure
- Independent workflow history per provider

**Cons:**

- Maintenance overhead (duplicate YAML)
- Can't test all providers at once
- Difficult to keep configurations in sync
- More files to manage

**Decision:** Rejected. Matrix strategy handles all use cases with single workflow.

---

### 4. Combined CI and Smoke Test Workflow

**Pros:**

- Fewer workflow files
- Unified test reporting

**Cons:**

- CI becomes coupled to external APIs
- CI failures when API keys missing
- Difficult to control when smoke tests run
- Violates separation of concerns

**Decision:** Rejected. Keep CI (automatic) separate from smoke tests (manual).

---

## Consequences

### Positive

1. **No CI Noise**: Clean PR checks, no failed workflows from missing API keys
2. **Security**: Multiple layers of secret masking, explicit trigger control
3. **Cost Control**: Dry-run mode, selective providers, rate limiting
4. **Flexibility**: Test specific providers, symbols, timeframes on demand
5. **Clear Documentation**: Operations runbook provides guidance for future work
6. **Progressive Enhancement**: Workflow works now, scripts can be added later

### Negative

1. **Manual Execution Required**: No automatic validation of provider health
2. **Human Error**: Developers may forget to run tests after provider changes
3. **Incomplete Implementation**: Provider packages need smoke test scripts added
4. **Quota Tracking**: No automatic monitoring of API usage across runs

### Neutral

1. **GitHub Actions Minutes**: Each run consumes ~2-5 minutes of GitHub Actions quota
2. **Maintenance**: Workflow needs updates when adding new providers
3. **Learning Curve**: Developers must understand manual dispatch process

---

## Risks and Mitigations

### Risk 1: API Key Exposure in Logs

**Impact:** Compromised API keys, unauthorized usage, security breach

**Mitigation:**

- GitHub automatic secret masking
- Explicit `::add-mask::` directives
- Secrets passed via environment variables only
- Regular log reviews after workflow runs
- Audit logs for secret access tracking

---

### Risk 2: Rate Limit Violations

**Impact:** Temporary API access blocked, workflow failures, quota waste

**Mitigation:**

- Built-in sleep delays (3s Yahoo, 5s Polygon)
- Conservative rate limit estimates
- Clear documentation of provider limits
- Workflow timeout (10 minutes) prevents runaway usage
- Operations runbook includes rate limit troubleshooting

---

### Risk 3: Cost Overruns

**Impact:** Unexpected API charges, budget exceeded

**Mitigation:**

- Dry-run mode for zero-cost validation
- Manual trigger prevents automatic quota consumption
- Cost estimation tables in documentation
- Default to high timeframes (1h, 1D) for lower costs
- Monitoring recommendations in operations runbook

---

### Risk 4: Missing Smoke Test Scripts

**Impact:** Workflow provides no actual validation, false sense of security

**Mitigation:**

- Graceful degradation with clear warnings
- Workflow prints exact implementation instructions
- Documentation includes example smoke test structure
- Exit code 0 (not failure) when script missing
- Future work clearly documented in journal

---

### Risk 5: Provider Format Mismatches

**Impact:** Invalid symbols, 404 errors, wasted API calls

**Mitigation:**

- Default symbols tested for each provider
- Provider-specific format documentation
- Troubleshooting section for symbol errors
- Operations runbook includes format examples
- Symbol parameter description includes format notes

---

## Future Work

### Phase 4+: Implement Smoke Test Scripts

**Priority:** High

**Scope:**

1. Create `smoke-test.ts` in each provider package
2. Add `test:smoke` script to package.json
3. Accept `--symbol` and `--timeframe` CLI arguments
4. Make single API request to validate connectivity
5. Validate response structure and data quality
6. Print results to stdout
7. Exit with appropriate status code

**Example Implementation:**

```typescript
// packages/provider-yahoo/src/smoke-test.ts
import { parseArgs } from 'node:util';
import { YahooProvider } from './index.js';

async function main() {
  const { values } = parseArgs({
    options: {
      symbol: { type: 'string', default: 'ES=F' },
      timeframe: { type: 'string', default: '1h' },
    },
  });

  const provider = new YahooProvider({
    apiKey: process.env.YAHOO_API_KEY,
  });

  console.log(`Testing ${values.symbol} at ${values.timeframe}...`);
  const bars = await provider.getBars({
    symbol: values.symbol,
    timeframe: values.timeframe,
    limit: 10,
  });

  if (!bars || bars.length === 0) {
    console.error('FAILED: No data returned');
    process.exit(1);
  }

  console.log(`SUCCESS: Received ${bars.length} bars`);
  process.exit(0);
}

main().catch((error) => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
```

---

### Phase 5+: Add More Providers

As new providers are implemented:

1. Add to workflow matrix in `provider-smoke.yml`
2. Add secrets for new API keys
3. Document provider-specific rate limits
4. Update operations runbook
5. Add cost estimates

**Future Providers:**

- Alpaca (alpaca-trade-api)
- IEX Cloud
- Interactive Brokers
- Binance (crypto)
- Coinbase (crypto)

---

### Phase 6+: Scheduled Runs (Optional)

**Consideration:** If patterns emerge showing providers fail regularly, add scheduled runs.

**Design:**

```yaml
on:
  workflow_dispatch: # Keep manual trigger
  schedule:
    - cron: '0 9 * * MON' # Weekly Monday 9am UTC
```

**Conditions:**

- Only if false positive rate < 5%
- Only if API costs are acceptable
- Only if team monitors results regularly
- Only if failures actionable (not just provider maintenance)

---

### Phase 7+: Quota Monitoring

**Enhancement:** Track API usage across smoke test runs.

**Implementation:**

- Store run metadata in GitHub Actions artifacts
- Parse API response headers for quota information
- Generate monthly usage reports
- Alert when quota thresholds reached

---

## Success Metrics

1. **Zero Secret Leaks**: No API keys visible in workflow logs (verified by log review)
2. **Workflow Stability**: 100% success rate on dry-run mode (validates environment)
3. **Cost Control**: < $5/month spent on smoke tests (manual trigger prevents overuse)
4. **Adoption**: 10+ manual runs per month by team (indicates usefulness)
5. **Documentation Quality**: Zero support questions about workflow usage (runbook sufficient)

---

## References

- [GitHub Actions workflow_dispatch](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_dispatch)
- [GitHub Actions matrix strategy](https://docs.github.com/en/actions/using-workflows/advanced-workflow-features#using-a-matrix-for-your-jobs)
- [GitHub Actions secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Polygon.io Rate Limits](https://polygon.io/docs/stocks/getting-started#rate-limits)
- Operations Runbook: `docs/ops/provider-smokes.md`
- Workflow File: `.github/workflows/provider-smoke.yml`

---

## Changelog

- **2025-09-30:** Initial ADR created (Phase 3, Shard B5, Issue #32)
