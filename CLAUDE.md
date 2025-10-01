# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

TJR Suite is a TypeScript monorepo for trading analysis and automation, using pnpm workspaces with strict TypeScript configuration and project references for incremental builds.

**Key Technologies:**
- Package Manager: pnpm 8.15.0 (frozen lockfile in CI)
- Build System: TypeScript project references (incremental builds)
- Code Quality: ESLint + Prettier (enforced in CI)
- Versioning: Changesets (semantic versioning)
- Test Runner: Node.js built-in test runner (`node --test`)
- CI/CD: GitHub Actions with matrix builds

## Common Commands

### Development Workflow
```bash
# Install dependencies (use pnpm, not npm)
pnpm install

# Build all packages (respects TypeScript project references)
pnpm build

# Run tests across all packages
pnpm test

# Run tests for a specific package
cd packages/contracts && pnpm test

# Lint all packages
pnpm lint

# Check formatting
pnpm format:check

# Auto-fix formatting
pnpm format

# Type-check without emitting
pnpm typecheck

# Clean all build artifacts
pnpm clean
```

### Working with Packages
```bash
# Build a specific package (from root)
pnpm --filter @tjr/contracts build

# Run dev-scripts CLI tools (after build)
cd packages/dev-scripts
node dist/bin/commands-diff.js --help
node dist/bin/cache-warm.js --help
node dist/bin/cache-verify.js --help
node dist/bin/replay-run.js --fixture=path.json
```

### Versioning and Releases
```bash
# Create a changeset for your changes
pnpm changeset

# Version packages (maintainers only)
pnpm changeset:version

# Publish packages (maintainers only)
pnpm changeset:publish
```

## Architecture

### Monorepo Structure

The repository follows a strict separation of concerns:

1. **`packages/contracts/`** - Canonical type definitions and DTOs
   - Zero runtime dependencies
   - Shared across all other packages
   - Contains market data types, TJR analysis DTOs, and error hierarchy
   - Uses ES2022 modules (`"type": "module"`)

2. **`packages/analysis-kit/`** - Pure analytics functions
   - All functions are deterministic and side-effect free (no I/O, no Date.now())
   - Provides market structure analysis, bias calculation, session extremes, day profiles
   - Consumes types from `@tjr/contracts`
   - Designed for testability with golden fixtures

3. **`packages/dev-scripts/`** - Development CLI tools
   - Private package (not published)
   - Contains operational tooling: commands-diff, cache-warm, cache-verify, replay-run
   - Philosophy: dry-run by default, JSON output for automation
   - Shared utilities in `src/cli-utils.ts`

4. **`packages/smoke/`** - Smoke test package
   - Validates build toolchain and project references
   - Minimal package to verify monorepo setup

### TypeScript Configuration

- **`tsconfig.base.json`**: Shared strict configuration for all packages
  - Strict mode enabled (all strict flags)
  - Path mappings: `@tjr-suite/*` for internal packages
  - Project references enabled (`composite: true`)
  - CommonJS output (Node.js compatibility)

- **Per-package `tsconfig.json`**: Extends base config
  - `@tjr/contracts` uses ES2022 modules with `"moduleResolution": "bundler"`
  - Other packages use CommonJS with `"moduleResolution": "node"`

### Package Dependencies

```
contracts (zero dependencies)
  ↑
  ├── analysis-kit (depends on contracts)
  └── dev-scripts (standalone, no internal deps)
```

**Important Constraint:** `@tjr/contracts` must never depend on other workspace packages.

### Testing Strategy

1. **Contracts package**: Uses Vitest (`pnpm test`, `pnpm test:watch`)
2. **Other packages**: Node.js test runner (`node --test tests/*.test.js`)
3. **Analysis Kit**: Golden fixture approach for deterministic validation

### Pure Function Requirements (Analysis Kit)

When working with `packages/analysis-kit/`, all functions MUST:
- Be deterministic (same input → same output)
- Have no side effects (no I/O, no wall-clock access)
- Not mutate input parameters
- Handle edge cases (gaps, equal values, missing data)
- Use epsilon comparisons for floating-point equality: `Math.abs(a - b) < 1e-9`

### Error Handling

Structured errors from `@tjr/contracts`:
- Base class: `TJRError` with `code`, `data`, `timestamp`
- Specialized errors: `ProviderRateLimitError`, `InsufficientBarsError`, `SymbolResolutionError`
- All errors are serializable (JSON.stringify safe)

### CLI Design Philosophy (Dev Scripts)

All CLI tools in `dev-scripts/` follow:
1. **Dry-run by default**: Mutating ops require `--execute` flag
2. **JSON output**: Machine-readable by default, `--pretty` for humans
3. **Consistent exit codes**: 0 = success, 1 = partial failure/diffs, 2 = fatal error
4. **Extensive inline comments**: Code is self-documenting

## CI/CD

**GitHub Actions Workflow** (`.github/workflows/ci.yml`):
- Triggers: Push to `main`, `phase-**` branches; PRs to `main`
- Steps: Install → Build → Test → Lint → Format Check
- Additional: Dev-scripts smoke tests (CLI help commands)
- Security: pnpm audit (non-blocking warnings)

**Required Checks**: All jobs must pass before merge.

## Documentation

- **ADRs** (`docs/adr/`): Architectural Decision Records for major design choices
  - ADR-0051: Monorepo bootstrap (pnpm, TypeScript project references, Changesets)
  - ADR-0052: Contracts package and error taxonomy
  - ADR-0054: Dev-scripts CLI design philosophy
  - ADR-0059: Analysis kit pure functions and fixture testing

- **Governance** (`docs/governance/`): Team policies and branch protections
- **Journal** (`docs/journal/`): Implementation journals tracking development

## Key Design Decisions

1. **No npm, use pnpm**: Stricter dependency resolution, faster installs, disk efficiency
2. **TypeScript project references**: Incremental builds, explicit package boundaries
3. **Changesets for versioning**: Developer-driven, semantic versioning automation
4. **Pure analytics in analysis-kit**: No I/O, fully deterministic, testable with fixtures
5. **Contracts as single source of truth**: All packages consume shared types, zero circular deps

## Common Patterns

### Adding a New Package

1. Create directory: `packages/my-package/`
2. Add `package.json` with `@tjr-suite/my-package` name
3. Create `tsconfig.json` extending `../../tsconfig.base.json`
4. Add source in `src/`, tests in `tests/`
5. Run `pnpm install` from root to link package
6. Build and test: `pnpm build && pnpm test`

### Creating a Changeset

```bash
pnpm changeset
# Select packages changed
# Choose semver bump (major/minor/patch)
# Write user-facing description
```

### Running Single Package Tests

```bash
# Option 1: From package directory
cd packages/contracts
pnpm test

# Option 2: Using filter from root
pnpm --filter @tjr/contracts test
```

## Important Notes

- Always use `pnpm`, never `npm` or `yarn`
- Build before testing (tests may depend on compiled output)
- Contracts package uses ES modules; others use CommonJS
- Analysis kit functions must be pure (no I/O, deterministic)
- Dev-scripts CLIs default to dry-run mode
- Pre-commit: Ensure CI passes (build, test, lint, format)
