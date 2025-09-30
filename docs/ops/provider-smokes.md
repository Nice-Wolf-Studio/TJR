# Provider Smoke Tests - Operations Runbook

## Overview

Provider smoke tests validate live API integrations for market data providers (Yahoo Finance, Polygon.io) without impacting the CI/CD pipeline. These tests are **manual-only** and **never run automatically** to prevent unnecessary API quota consumption and CI noise.

## Purpose

- **Live API Validation**: Verify provider APIs are accessible and returning valid data
- **API Key Testing**: Confirm API keys are valid and have sufficient quota
- **Post-Change Validation**: Test provider implementations after code changes
- **Quota Management**: Check remaining API call limits before production deployment
- **Security Verification**: Ensure secrets are properly configured and masked in logs

## When to Run

Run provider smoke tests in these scenarios:

1. **After Provider Code Changes**: Validate modifications to provider-yahoo or provider-polygon packages
2. **API Key Rotation**: Verify new API keys work correctly after rotation
3. **Quota Checks**: Test API availability and remaining call limits
4. **Before Production Deploy**: Final validation that providers work with live APIs
5. **Troubleshooting**: Diagnose provider-related issues in production
6. **Monthly Health Checks**: Periodic validation of provider integrations

**DO NOT RUN:**
- On pull requests (wastes API quota)
- In automated CI pipelines (creates noise and quota issues)
- Without understanding cost implications (see Cost Estimation below)

## How to Dispatch

### Via GitHub Actions UI

1. Navigate to: `https://github.com/[owner]/tjr-suite/actions/workflows/provider-smoke.yml`
2. Click "Run workflow" button (top right)
3. Configure input parameters:
   - **Provider**: Select `yahoo`, `polygon`, or `all`
   - **Symbol**: Trading symbol (default: `ES=F` for Yahoo, `ES` for Polygon)
   - **Timeframe**: Data timeframe (`1m`, `5m`, `1h`, `1D`)
   - **Dry-run**: Set to `true` to validate setup without API calls
4. Click "Run workflow" to start

### Via GitHub CLI

```bash
# Test Yahoo provider
gh workflow run provider-smoke.yml \
  --field provider=yahoo \
  --field symbol=ES=F \
  --field timeframe=1h \
  --field dry-run=false

# Test Polygon provider
gh workflow run provider-smoke.yml \
  --field provider=polygon \
  --field symbol=ES \
  --field timeframe=5m \
  --field dry-run=false

# Test all providers (dry-run)
gh workflow run provider-smoke.yml \
  --field provider=all \
  --field symbol=ES=F \
  --field timeframe=1D \
  --field dry-run=true
```

### Via GitHub API

```bash
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/[owner]/tjr-suite/actions/workflows/provider-smoke.yml/dispatches \
  -d '{
    "ref": "main",
    "inputs": {
      "provider": "all",
      "symbol": "ES=F",
      "timeframe": "1h",
      "dry-run": "false"
    }
  }'
```

## Input Parameters

### Provider
- **Type**: Choice (`yahoo`, `polygon`, `all`)
- **Default**: `all`
- **Description**: Which provider(s) to test
- **Examples**:
  - `yahoo`: Test only Yahoo Finance provider
  - `polygon`: Test only Polygon.io provider
  - `all`: Test all providers in parallel

### Symbol
- **Type**: String
- **Default**: `ES=F`
- **Description**: Trading symbol to request data for
- **Provider-Specific Formats**:
  - **Yahoo**: Use futures notation (e.g., `ES=F`, `NQ=F`, `CL=F`)
  - **Polygon**: Use standard tickers (e.g., `ES`, `NQ`, `CL`)
- **Examples**:
  - `ES=F` (E-mini S&P 500 futures - Yahoo)
  - `ES` (E-mini S&P 500 futures - Polygon)
  - `AAPL` (Apple stock)
  - `BTC-USD` (Bitcoin - Yahoo)

### Timeframe
- **Type**: Choice (`1m`, `5m`, `1h`, `1D`)
- **Default**: `1h`
- **Description**: Timeframe/interval for historical data request
- **API Cost Impact**: Lower timeframes (1m, 5m) may consume more API quota
- **Examples**:
  - `1m`: 1-minute bars (high API cost)
  - `5m`: 5-minute bars (medium API cost)
  - `1h`: 1-hour bars (low API cost)
  - `1D`: Daily bars (lowest API cost)

### Dry-run
- **Type**: Boolean
- **Default**: `false`
- **Description**: Validate workflow setup without making API calls
- **Use Cases**:
  - Test workflow configuration changes
  - Verify package structure and build artifacts
  - Validate secrets are configured (without consuming quota)
  - First-time workflow testing
- **Output**: Validates environment, skips actual API requests

## Expected Output

### Successful Run

```
==== YAHOO PROVIDER SMOKE TEST ====
Symbol: ES=F
Timeframe: 1h

Rate limiting: Waiting 3 seconds before API call...
Executing smoke test...

API Response:
- Status: 200 OK
- Bars received: 50
- Date range: 2025-09-29 to 2025-09-30
- Validation: PASSED

==== SMOKE TEST SUMMARY ====
Provider: yahoo
Symbol: ES=F
Timeframe: 1h
Dry-run: false
Status: PASSED
==========================
```

### Dry-run Output

```
==== DRY RUN MODE ====
Provider: yahoo
Symbol: ES=F
Timeframe: 1h
Package path: packages/provider-yahoo
Dry-run validation passed
```

### Script Not Implemented (Warning)

```
WARNING: test:smoke script not found in package.json
Expected command format:
  pnpm --filter @tjr/provider-yahoo test:smoke -- --symbol=ES=F --timeframe=1h

Please add this script to packages/provider-yahoo/package.json:
  "test:smoke": "node dist/smoke-test.js"

SKIPPING: Smoke test script not implemented yet
```

## Troubleshooting

### API Key Not Configured

**Symptom**: Error message "POLYGON_API_KEY secret not configured"

**Cause**: GitHub Secret not set for the repository

**Resolution**:
1. Go to repository Settings > Secrets and variables > Actions
2. Click "New repository secret"
3. Add secret:
   - Name: `POLYGON_API_KEY` or `YAHOO_API_KEY`
   - Value: Your API key
4. Re-run workflow

**Prevention**: Always configure secrets before first run

### Rate Limit Exceeded

**Symptom**: API returns 429 status code or "rate limit exceeded" error

**Cause**: Too many API requests in short time period

**Resolution**:
1. Wait for rate limit window to reset (varies by provider)
2. Use higher timeframes (1h, 1D) to reduce API calls
3. Run tests individually instead of `all` providers
4. Check provider documentation for rate limit details:
   - Polygon: https://polygon.io/docs/stocks/getting-started#rate-limits
   - Yahoo: Check API tier limits

**Prevention**:
- Space out test runs (wait 5-10 minutes between runs)
- Use dry-run mode for workflow validation
- Monitor API usage dashboards

### Quota Exceeded

**Symptom**: API returns 403/401 status or "quota exceeded" error

**Cause**: Monthly/daily API quota limit reached

**Resolution**:
1. Check provider dashboard for quota usage:
   - Polygon: https://polygon.io/dashboard
   - Yahoo: Check account dashboard
2. Wait until quota resets (usually monthly)
3. Consider upgrading API tier for higher limits
4. Use cached data or mock responses for development

**Prevention**:
- Run smoke tests sparingly (only when necessary)
- Use dry-run mode for CI/workflow testing
- Implement cost estimation (see below)

### Invalid Symbol Format

**Symptom**: API returns 404 or "symbol not found" error

**Cause**: Symbol format doesn't match provider expectations

**Resolution**:
- **Yahoo**: Use futures notation with `=F` suffix (e.g., `ES=F`, `NQ=F`)
- **Polygon**: Use standard ticker without suffix (e.g., `ES`, `NQ`)
- **Stocks**: Use standard ticker (e.g., `AAPL`, `MSFT`)
- Check provider documentation for symbol formats

**Prevention**: Use default symbols (`ES=F` for Yahoo, `ES` for Polygon)

### Build Failures

**Symptom**: "Build artifacts not found" error during dry-run

**Cause**: Provider package not built or build output missing

**Resolution**:
1. Workflow automatically builds packages - check build step logs
2. Verify `dist/` directory exists in provider package
3. Check for TypeScript compilation errors
4. Run locally: `pnpm --filter @tjr/provider-[name] build`

**Prevention**: Ensure clean builds before testing

### Timeout

**Symptom**: Workflow times out after 10 minutes

**Cause**: API request hanging or extremely slow response

**Resolution**:
1. Check provider API status pages
2. Verify network connectivity (unlikely in GitHub Actions)
3. Review smoke test implementation for infinite loops
4. Increase timeout if legitimate (edit workflow `timeout-minutes`)

**Prevention**: Implement request timeouts in smoke test code (e.g., 30 seconds)

## Security Considerations

### Secret Management

- **Storage**: API keys stored as GitHub Secrets (Settings > Secrets)
- **Scope**: Repository secrets (not environment-specific)
- **Access**: Only accessible to workflow runs on protected branches
- **Rotation**: Rotate API keys quarterly or after suspected exposure

### Log Masking

The workflow implements multiple security measures:

1. **Automatic Masking**: GitHub Actions automatically masks registered secrets
2. **Explicit Masking**: Workflow uses `::add-mask::` for extra protection
3. **URL Sanitization**: URLs containing API keys are never echoed to logs
4. **Environment Variables**: Secrets passed via `env:` block, never as command args

### What Gets Logged

**SAFE** (visible in logs):
- Provider name
- Symbol
- Timeframe
- Dry-run flag
- API response status codes
- Number of bars received
- Validation results

**MASKED** (never visible):
- API keys
- Complete API request URLs with keys
- Authentication tokens
- Any data marked with `::add-mask::`

### Security Best Practices

1. **Never commit API keys** to repository (use .gitignore for .env files)
2. **Use read-only API keys** when possible (not write/trading keys)
3. **Monitor secret access** via GitHub audit logs
4. **Rotate keys regularly** (quarterly minimum)
5. **Review logs** after runs to ensure no secrets leaked
6. **Limit workflow permissions** to minimum required (read-only checkout)

## Cost Estimation

### API Costs Per Run

Provider smoke tests consume API quota. Estimate costs before running:

#### Yahoo Finance
- **Free Tier**: Varies by endpoint, generally limited to 100 requests/hour
- **Per Test Run**: 1-5 API calls depending on timeframe
- **Monthly Limit**: Check API dashboard (typically 2,000-10,000 calls/month)
- **Cost**: Usually free for basic historical data

#### Polygon.io
- **Free Tier**: 5 API calls/minute, limited features
- **Starter Tier** ($29/month): 100 calls/minute, 100,000 calls/month
- **Developer Tier** ($99/month): 1,000 calls/minute, unlimited calls
- **Per Test Run**: 1-10 API calls depending on timeframe and data range
- **Cost**: Varies by plan, typically $0.0003-$0.001 per call

### Test Run Scenarios

| Scenario | Providers | Calls | Yahoo Cost | Polygon Cost |
|----------|-----------|-------|------------|--------------|
| Single provider (1h) | 1 | 1-2 | Free | $0.0003-$0.001 |
| All providers (1h) | 2 | 2-4 | Free | $0.0006-$0.002 |
| Single provider (1m) | 1 | 5-10 | Free | $0.0015-$0.01 |
| All providers (1m) | 2 | 10-20 | Free | $0.003-$0.02 |

### Monthly Cost Estimates

| Usage Pattern | Yahoo | Polygon (Free) | Polygon (Starter) |
|---------------|-------|----------------|-------------------|
| 10 runs/month | Free | ~40 calls (OK) | ~40 calls (OK) |
| 50 runs/month | Free | ~200 calls (May exceed) | ~200 calls (OK) |
| 100 runs/month | Free | ~400 calls (Exceeds) | ~400 calls (OK) |

### Cost Optimization Tips

1. **Use Dry-run**: Validate workflow changes without API calls
2. **Higher Timeframes**: Use 1h or 1D instead of 1m for lower call counts
3. **Targeted Testing**: Test specific providers instead of `all`
4. **Limit Frequency**: Run only when necessary (not on every commit)
5. **Cache Results**: Consider caching smoke test responses for development
6. **Monitor Usage**: Check provider dashboards weekly for quota tracking

## Implementation Notes

### Current Status

As of Phase 3.B5, the smoke test workflow is created but **providers do not yet have `test:smoke` scripts implemented**. The workflow handles this gracefully:

1. Checks if `test:smoke` script exists in package.json
2. If missing, prints warning with expected command format
3. Skips test execution (does not fail workflow)
4. Allows workflow to be tested without breaking CI

### Future Implementation

Each provider needs a `test:smoke` script added to its `package.json`:

**packages/provider-yahoo/package.json**:
```json
{
  "scripts": {
    "test:smoke": "node dist/smoke-test.js"
  }
}
```

**packages/provider-polygon/package.json**:
```json
{
  "scripts": {
    "test:smoke": "node dist/smoke-test.js"
  }
}
```

Each smoke test script should:
- Accept `--symbol` and `--timeframe` CLI arguments
- Make a single API request to the provider
- Validate response structure and data quality
- Print results to stdout
- Exit with code 0 (success) or 1 (failure)
- Respect rate limits (use exponential backoff if needed)
- Never log API keys or sensitive data

### Example Smoke Test Structure

```typescript
// smoke-test.ts
import { parseArgs } from 'node:util';
import { createProvider } from './index.js';

async function main() {
  // Parse CLI arguments
  const { values } = parseArgs({
    options: {
      symbol: { type: 'string', default: 'ES=F' },
      timeframe: { type: 'string', default: '1h' },
    },
  });

  // Create provider instance
  const provider = createProvider({
    apiKey: process.env.YAHOO_API_KEY || process.env.POLYGON_API_KEY,
  });

  // Make API request
  console.log(`Testing ${values.symbol} at ${values.timeframe}...`);
  const bars = await provider.getBars({
    symbol: values.symbol,
    timeframe: values.timeframe,
    limit: 10,
  });

  // Validate response
  if (!bars || bars.length === 0) {
    console.error('FAILED: No data returned');
    process.exit(1);
  }

  console.log(`SUCCESS: Received ${bars.length} bars`);
  console.log(`Date range: ${bars[0].time} to ${bars[bars.length - 1].time}`);
  process.exit(0);
}

main().catch(console.error);
```

## Related Documentation

- GitHub Actions workflow: `.github/workflows/provider-smoke.yml`
- CI workflow (for reference): `.github/workflows/ci.yml`
- Provider packages:
  - `packages/provider-yahoo/`
  - `packages/provider-polygon/`
- GitHub Secrets documentation: https://docs.github.com/en/actions/security-guides/encrypted-secrets

## Changelog

- **2025-09-30**: Initial runbook created for Phase 3.B5
- Workflow implemented with workflow_dispatch trigger
- Dry-run mode for validation without API calls
- Security measures: secret masking, rate limiting
- Note: Provider smoke test scripts not yet implemented