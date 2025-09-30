# ADR-0054: Dev Scripts Package

**Status:** Accepted
**Date:** 2025-09-29
**Author:** TJR Suite Team

## Context

The TJR Suite project requires operational tooling for development and debugging tasks such as:
- Comparing local Discord command definitions with deployed manifests
- Warming and verifying cache layers
- Replaying historical data through parsers for regression testing

These tools need to be:
1. Safe to run in production environments (dry-run by default)
2. Machine-readable (JSON output for automation)
3. Well-documented (extensive inline comments)
4. Easy to integrate with CI/CD pipelines

## Decision

We will create a `@tjr-suite/dev-scripts` package containing CLI utilities following a unified design philosophy.

### CLI Philosophy

#### 1. Dry-Run by Default
All mutating operations (cache warming, data replay) default to dry-run mode:
- `--dry-run`: Preview what would happen (default)
- `--execute`: Actually perform the operation
- Read-only operations (commands-diff, cache-verify) don't need this flag

**Rationale:** Prevents accidental data modification in production. Makes tools safe to explore and test. Forces explicit intent for mutating operations.

#### 2. JSON Output by Default
All CLIs output structured JSON to stdout:
- `--pretty`: Human-readable formatted output with colors
- Default: Machine-readable JSON (one line per result)
- Enables piping to jq, storing in databases, CI/CD integration

**Rationale:** JSON is parseable, versionable, and integrates with modern tooling. Pretty mode available for human debugging.

#### 3. Extensive Inline Comments
Every CLI contains detailed comments explaining:
- Purpose and use cases
- Design decisions
- Exit code meanings
- Example usage patterns

**Rationale:** Makes codebase self-documenting. Reduces onboarding time. Captures tribal knowledge in code.

#### 4. Consistent Exit Codes
- `0`: Success (or no diff/warnings)
- `1`: Partial failure or differences found
- `2`: Fatal error or invalid usage

**Rationale:** Enables CI/CD integration and shell scripting. Standard Unix convention.

### Tool Descriptions

#### commands-diff
Compares local Discord command definitions with deployed manifest.

**Design:**
- Read-only operation (no dry-run needed)
- Outputs unified diff format in JSON
- Exit 0 if commands match, exit 1 if differences found
- Useful for pre-deployment verification

**Implementation:** Stub returns hardcoded diff data. Future: integrate with Discord API.

#### cache-warm
Preloads cache layers with commonly accessed data.

**Design:**
- Mutating operation: dry-run by default
- Shows which cache keys would be loaded
- Reports estimated cache size and hit rate impact
- Exit 0 on success

**Implementation:** Stub returns fake cache statistics. Future: integrate with actual cache layer.

#### cache-verify
Validates cache integrity and reports health metrics.

**Design:**
- Read-only operation
- Checks for stale entries, orphaned keys, size violations
- Exit 0 if healthy, 1 if warnings, 2 if critical errors
- Can be run periodically in CI

**Implementation:** Stub returns fake health data. Future: integrate with cache monitoring.

#### replay-run
Re-runs historical bar data through parsers for regression testing.

**Design:**
- Requires `--fixture=path.json` argument
- Mutating (affects parser state): dry-run by default
- Loads fixture, simulates parsing, reports success/failure per bar
- Exit 0 if all pass, 1 if some fail, 2 if fixture invalid

**Implementation:** Stub reads fixture and returns fake results. Future: integrate with actual parser.

### Shared Utilities (cli-utils.ts)

Provides common functionality:
- `parseArgs()`: Parse process.argv with flag validation
- `printHelp()`: Consistent help text formatting
- `outputResult()`: Unified JSON/pretty output logic
- `createResult()`: Standard result object structure

**Rationale:** DRY principle. Ensures consistent behavior across all CLIs. Easier testing.

## Consequences

### Positive
- Safe tooling that's hard to misuse
- CI/CD integration ready out of the box
- Machine-readable output for automation
- Self-documenting code reduces maintenance burden
- Consistent UX across all dev tools

### Negative
- Extra verbosity from extensive comments (mitigated by usefulness)
- Stub implementations need to be replaced with real logic eventually
- JSON output requires jq or parsing for human reading (mitigated by --pretty)

### Neutral
- Establishes pattern that future CLIs should follow
- Package remains private to monorepo (not published to npm)

## Alternatives Considered

### 1. Bash Scripts
Rejected because:
- Less type-safe than TypeScript
- Harder to test programmatically
- JSON handling is awkward in bash
- No access to monorepo TypeScript utilities

### 2. Execute by Default
Rejected because:
- Too risky in production environments
- Users expect "safe" mode first
- Industry best practice (terraform, ansible, etc.) is dry-run first

### 3. Pretty Output by Default
Rejected because:
- Harder to parse in CI/CD pipelines
- JSON is more universal
- Pretty mode still available via flag

## References
- Unix Philosophy: https://en.wikipedia.org/wiki/Unix_philosophy
- Twelve-Factor CLI Apps: https://medium.com/@jdxcode/12-factor-cli-apps-dd3c227a0e46
- Terraform Workflow: https://www.terraform.io/intro/core-workflow