# @tjr-suite/dev-scripts

Development and operational CLI tools for TJR Suite.

## Overview

This package provides command-line utilities for development, debugging, and operations tasks:

- **commands-diff**: Compare local Discord commands with deployed manifest
- **cache-warm**: Preload cache layers with commonly accessed data
- **cache-verify**: Validate cache integrity and report health metrics
- **replay-run**: Re-run historical bar data through parsers for regression testing

## CLI Philosophy

All CLIs follow a consistent design philosophy:

### Dry-Run by Default

Mutating operations (cache-warm, replay-run) default to dry-run mode for safety.

```bash
# Preview what would happen (default)
cache-warm

# Actually perform the operation
cache-warm --execute
```

### JSON Output by Default

All CLIs output machine-readable JSON to stdout.

```bash
# JSON output (default) - pipe to jq, save to file, etc.
commands-diff | jq '.data.differences'

# Human-readable formatted output
commands-diff --pretty
```

### Consistent Exit Codes

- `0`: Success (or no differences found)
- `1`: Partial failure or differences found
- `2`: Fatal error or invalid usage

## Commands

### commands-diff

Compare local Discord command definitions with deployed manifest.

**Usage:**

```bash
commands-diff [--help] [--pretty]
```

**Purpose:**
Validates that local Discord slash command definitions match what's deployed. Helps catch configuration drift before deployment.

**Exit Codes:**

- `0`: Local and deployed commands match
- `1`: Differences found
- `2`: Fatal error (network failure, invalid config, etc.)

**Example:**

```bash
# Check for differences
commands-diff

# Pretty output
commands-diff --pretty

# Use in CI
commands-diff || echo "Commands need deployment"
```

**Example Output:**

```json
{
  "success": true,
  "command": "commands-diff",
  "timestamp": "2025-09-29T12:34:56.789Z",
  "data": {
    "hasDifferences": true,
    "totalLocal": 5,
    "totalDeployed": 4,
    "differences": [
      {
        "type": "added",
        "commandName": "analyze",
        "description": "New command not yet deployed"
      },
      {
        "type": "modified",
        "commandName": "status",
        "field": "description",
        "local": "Check system status",
        "deployed": "Check status"
      }
    ]
  },
  "warnings": ["Differences found - deployment may be needed"]
}
```

---

### cache-warm

Preload cache layers with commonly accessed data.

**Usage:**

```bash
cache-warm [--help] [--pretty] [--execute | --dry-run]
```

**Purpose:**
Warms up cache layers by preloading frequently accessed data. Reduces cold start latency and improves response times after deployments or cache evictions.

**Exit Codes:**

- `0`: Cache warming succeeded (or dry-run completed)
- `1`: Partial failure (some keys failed to load)
- `2`: Fatal error (cache unavailable, network failure, etc.)

**Example:**

```bash
# Preview what would be warmed (default)
cache-warm

# Actually warm the cache
cache-warm --execute

# Pretty output
cache-warm --execute --pretty
```

**Example Output:**

```json
{
  "success": true,
  "command": "cache-warm",
  "timestamp": "2025-09-29T12:34:56.789Z",
  "dryRun": true,
  "data": {
    "keysToWarm": 150,
    "estimatedSize": "4.2 MB",
    "estimatedDuration": "2.3s",
    "categories": {
      "userProfiles": 50,
      "marketData": 75,
      "parserConfigs": 25
    },
    "projectedHitRateIncrease": "15%"
  },
  "warnings": ["Dry-run mode: No actual cache changes made. Use --execute to warm cache."]
}
```

---

### cache-verify

Validate cache integrity and report health metrics.

**Usage:**

```bash
cache-verify [--help] [--pretty]
```

**Purpose:**
Performs health checks on cache layers to detect issues like stale entries, orphaned keys, size violations, and memory pressure.

**Exit Codes:**

- `0`: Cache is healthy (no issues found)
- `1`: Warnings found (non-critical issues)
- `2`: Critical errors found (cache corruption, unavailability, etc.)

**Example:**

```bash
# Check cache health
cache-verify

# Pretty output
cache-verify --pretty

# Use in CI
cache-verify && echo "Cache healthy" || echo "Cache issues detected"
```

**Example Output:**

```json
{
  "success": false,
  "command": "cache-verify",
  "timestamp": "2025-09-29T12:34:56.789Z",
  "data": {
    "status": "warning",
    "totalKeys": 1523,
    "healthyKeys": 1500,
    "staleKeys": 20,
    "orphanedKeys": 3,
    "memoryUsage": "85%",
    "hitRate": "92.3%",
    "issues": [
      {
        "severity": "warning",
        "category": "staleness",
        "count": 20,
        "message": "20 keys have expired TTL"
      },
      {
        "severity": "warning",
        "category": "memory",
        "count": 1,
        "message": "Memory usage above 80%"
      }
    ]
  },
  "warnings": [
    "20 keys have expired TTL but not evicted",
    "3 orphaned keys reference deleted data",
    "Memory usage above 80% - consider eviction or scaling"
  ]
}
```

---

### replay-run

Re-run historical bar data through parsers for regression testing.

**Usage:**

```bash
replay-run --fixture=path.json [--help] [--pretty] [--execute | --dry-run]
```

**Purpose:**
Replays historical market data bars through parsing logic to validate parser correctness, enable regression testing, and benchmark performance.

**Exit Codes:**

- `0`: All bars processed successfully (100% pass rate)
- `1`: Some bars failed (parser errors or mismatches)
- `2`: Fatal error (fixture not found, invalid format, etc.)

**Required Arguments:**

- `--fixture=path.json`: Path to fixture file containing test bars

**Fixture Format:**

```json
[
  {
    "id": "es_2024-10-01_09:30:00",
    "text": "ES 5850.25 +12.50 vol 15234",
    "timestamp": "2024-10-01T09:30:00Z",
    "expectedResult": {
      "symbol": "ES",
      "price": 5850.25,
      "change": 12.5,
      "volume": 15234
    }
  }
]
```

**Example:**

```bash
# Preview replay (default)
replay-run --fixture=examples/es_2024-10-01.json

# Actually run replay
replay-run --fixture=examples/es_2024-10-01.json --execute

# Pretty output
replay-run --fixture=examples/es_2024-10-01.json --pretty

# Use in CI
replay-run --fixture=fixtures/regression.json --execute && echo "All tests passed"
```

**Example Output:**

```json
{
  "success": false,
  "command": "replay-run",
  "timestamp": "2025-09-29T12:34:56.789Z",
  "dryRun": true,
  "data": {
    "fixture": "examples/es_2024-10-01.json",
    "totalBars": 8,
    "passed": 7,
    "failed": 1,
    "skipped": 0,
    "duration": "40ms",
    "failures": [
      {
        "barId": "es_2024-10-01_14:00:00",
        "reason": "Expected volume 12345, got 12344"
      }
    ]
  },
  "warnings": [
    "Dry-run mode: Parser state not modified. Use --execute for actual replay.",
    "1 bars failed - check failures array for details"
  ]
}
```

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Type Check

```bash
npm run typecheck
```

### Clean

```bash
npm run clean
```

## Implementation Status

All CLIs are currently STUB implementations:

- Return hardcoded/fake data
- No actual API calls or cache operations
- Demonstrate expected behavior and output format
- Ready for integration with real systems

Future implementation will connect to:

- Discord API for commands-diff
- Cache layer (Redis, in-memory) for cache-warm and cache-verify
- Actual parser logic for replay-run

## Architecture

See [ADR-0054: Dev Scripts Package](../../docs/adr/ADR-0054-dev-scripts.md) for detailed design decisions and rationale.

## CI/CD Integration

All CLIs are designed for CI/CD integration:

```yaml
# Example GitHub Actions workflow
- name: Verify Discord commands
  run: npx commands-diff

- name: Check cache health
  run: npx cache-verify

- name: Run regression tests
  run: npx replay-run --fixture=fixtures/regression.json --execute
```

## License

UNLICENSED - Private to TJR Suite monorepo
