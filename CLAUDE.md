# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Wolf Agents Integration

**This repository follows the [Wolf Agents](https://github.com/Nice-Wolf-Studio/WolfAgents) multi-agent development framework.**

### Core Wolf Ethos

- **Evidence first; opinions last** - Make decisions based on data and testing
- **Smallest viable, reversible change** - Prefer incremental, rollback-friendly changes
- **Additive before destructive** - Use shims, flags, and adapters before breaking changes
- **Boring-by-default tech** - Choose proven, simple solutions unless novelty reduces risk
- **Readability/operability are features** - Code must be maintainable and debuggable

### Phase Lifecycle

All work follows the Wolf Agents Phase Lifecycle:

1. **Seed Brief** - Phase objectives and context (start of phase)
2. **Pre-Phase Sweeps** - Meta + Governance setup (before shard work)
3. **Shard Work** - Intake → Research/ADR → Implementation → Review → Merge
4. **Close-Out Sweeps** - Meta + Governance validation (end of phase)

### Journaling Requirements

- **Fragments**: Create journal entries in `docs/journal/_fragments/<phase>/`
- **Append-only**: Never replace journals, only append
- **Roll-up**: Fragments consolidate to `docs/journals/PHASE-[X].md` at phase closeout

### Command Grammar

Control agent behavior with prefixes:

- `OOC:` - Out of character (normal conversation)
- `AS:Agent:` - Act as different agent temporarily
- `META:` - System/meta discussion
- **Flags**: `NOJOURNAL`, `NOTOOLS`, `NOCI`, `DRYRUN`

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
pnpm --filter @tjr-suite/discord-mcp build

# Run dev-scripts CLI tools (after build)
cd packages/dev-scripts
node dist/bin/commands-diff.js --help
node dist/bin/cache-warm.js --help
node dist/bin/cache-verify.js --help
node dist/bin/replay-run.js --fixture=path.json

# Run Discord MCP server (after build)
cd packages/discord-mcp
DISCORD_TOKEN=your_token pnpm start

# Test MCP server with inspector
npx @modelcontextprotocol/inspector node packages/discord-mcp/dist/index.js
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

The repository follows a strict separation of concerns across multiple layers:

#### Core Infrastructure

1. **`packages/contracts/`** - Canonical type definitions and DTOs
   - Zero runtime dependencies
   - Shared across all other packages
   - Contains market data types, TJR analysis DTOs, and error hierarchy
   - Uses ES2022 modules (`"type": "module"`)

2. **`packages/logger/`** - Structured logging with PII redaction
   - Provides consistent logging interface across packages
   - Built-in PII redaction for sensitive data

3. **`packages/db-simple/`** - SQLite/PostgreSQL connectors and migrations
   - Database abstraction layer
   - Migration support for schema evolution

#### Market Data Layer

4. **`packages/market-data-core/`** - Timeframe math, bar aggregation, clipping
   - Core market data utilities and transformations

5. **`packages/symbol-registry/`** - Symbol normalization and continuous contracts
   - Handles symbol mapping across different providers

6. **`packages/sessions-calendar/`** - Trading calendar with session hours
   - Asian/London/NY session detection and timing

7. **`packages/bars-cache/`** - Multi-tier caching for historical bars
   - Caching layer to reduce provider API calls
   - SQLite/PostgreSQL-backed persistence

#### Data Providers

8. **`packages/provider-yahoo/`** - Yahoo Finance provider
9. **`packages/provider-polygon/`** - Polygon.io provider with retry logic
10. **`packages/provider-databento/`** - Databento provider with large-window chunking
11. **`packages/provider-alphavantage/`** - Alpha Vantage provider
12. **`packages/provider-composite/`** - Composite provider for fallback chains

#### Analysis & Tools

13. **`packages/analysis-kit/`** - Pure analytics functions
   - All functions are deterministic and side-effect free (no I/O, no Date.now())
   - Provides market structure analysis, bias calculation, session extremes, day profiles
   - Consumes types from `@tjr/contracts`
   - Designed for testability with golden fixtures

14. **`packages/tjr-tools/`** - TJR-specific confluences
   - Fair Value Gaps (FVG), order blocks, and other TJR concepts

15. **`packages/dev-scripts/`** - Development CLI tools
   - Private package (not published)
   - Contains operational tooling: commands-diff, cache-warm, cache-verify, replay-run
   - Philosophy: dry-run by default, JSON output for automation
   - Shared utilities in `src/cli-utils.ts`

#### Application Layer

16. **`packages/discord-bot-core/`** - Discord bot command handlers
   - Core Discord bot functionality
   - Command processing and event handling

17. **`packages/discord-mcp/`** - Discord MCP server
   - Model Context Protocol server for Discord integration
   - Enables LLMs to interact with Discord via `send-message` and `read-messages` tools
   - Uses discord.js with required Gateway Intents (Guilds, GuildMessages, MessageContent)
   - See `.mcp.json` for server configuration

18. **`packages/app/`** - Main application with dependency injection
   - Unified entry point
   - Dependency injection container

#### Testing & Infrastructure

19. **`packages/smoke/`** - Smoke test package
   - Validates build toolchain and project references
   - Minimal package to verify monorepo setup

20. **`packages/live-tests/`** - Live integration tests
   - Tests against real provider APIs
   - Validates end-to-end functionality

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

The dependency graph follows a layered architecture:

```
Layer 1: Core Infrastructure
├── contracts (zero dependencies)
├── logger
└── db-simple

Layer 2: Market Data Foundation
├── market-data-core → contracts
├── symbol-registry → contracts
└── sessions-calendar → contracts

Layer 3: Providers
├── provider-yahoo → contracts, market-data-core
├── provider-polygon → contracts, market-data-core
├── provider-databento → contracts, market-data-core
├── provider-alphavantage → contracts, market-data-core
└── provider-composite → contracts, all providers

Layer 4: Caching & Analysis
├── bars-cache → contracts, market-data-core, db-simple
├── analysis-kit → contracts
└── tjr-tools → contracts, analysis-kit

Layer 5: Application
├── discord-bot-core → contracts, logger
├── discord-mcp (standalone MCP server)
└── app → all packages via DI container

Testing & Tools
├── dev-scripts (standalone, no internal deps)
├── smoke (minimal deps)
└── live-tests → providers, bars-cache
```

**Important Constraints:**
- `@tjr/contracts` must never depend on other workspace packages
- Pure analysis packages (`analysis-kit`, `tjr-tools`) must not have I/O dependencies
- MCP servers (`discord-mcp`) run as standalone processes with their own entry points

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

### MCP Integration

The repository includes Model Context Protocol (MCP) servers to enable LLM integrations:

**Discord MCP Server** (`packages/discord-mcp/`):
- Exposes `send-message` and `read-messages` tools for Discord interaction
- Uses stdio transport for communication with Claude
- Requires Discord bot token with MESSAGE CONTENT INTENT enabled
- Configuration in `.mcp.json` at repository root
- Auto-detects single-server setups (no server parameter needed)
- Channel resolution by name or Discord ID

**MCP Server Configuration**:
- Project-level: `.mcp.json` in repository root
- User-level: `~/.claude/claude_desktop_config.json`
- Servers run as standalone Node.js processes
- Environment variables passed via MCP config

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
  - ADR-0315: Discord bot implementation and MCP integration

- **Governance** (`docs/governance/`): Team policies and branch protections
- **Journal** (`docs/journal/`): Implementation journals tracking development
  - Active fragments in `_fragments/<phase>/` for ongoing work
  - Consolidated phase journals in root after closeout

## Key Design Decisions

1. **No npm, use pnpm**: Stricter dependency resolution, faster installs, disk efficiency
2. **TypeScript project references**: Incremental builds, explicit package boundaries
3. **Changesets for versioning**: Developer-driven, semantic versioning automation
4. **Pure analytics in analysis-kit**: No I/O, fully deterministic, testable with fixtures
5. **Contracts as single source of truth**: All packages consume shared types, zero circular deps

### Wolf Agents Alignment

Following Wolf Ethos principles:

- **Additive strategy**: New packages don't break existing ones (contracts first)
- **Reversibility**: Build tooling supports incremental rollback (TypeScript project references)
- **Observability**: Structured logging via `@tjr-suite/logger` with PII redaction
- **Determinism**: Pure functions in `analysis-kit` for reproducible testing
- **Evidence-based**: ADRs document all major architectural decisions

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
- Contracts package uses ES modules; others use CommonJS (except `discord-mcp` which uses ES modules)
- Analysis kit functions must be pure (no I/O, deterministic)
- Dev-scripts CLIs default to dry-run mode
- Pre-commit: Ensure CI passes (build, test, lint, format)
- MCP servers must be built before use and require environment variables (see `.mcp.json`)
- Discord MCP server requires MESSAGE CONTENT INTENT enabled in Discord Developer Portal

## Wolf Agents Workflow Integration

### Definition of Done (Wolf Ethos)

For each change:

- ✅ Reversible slice merged (flagged/seamed if needed)
- ✅ Deterministic checks green (CI passes)
- ✅ Evidence validates (tests, benchmarks, ADRs)
- ✅ One journal lesson captured
- ✅ Operability note for debugging

### Shard Workflow

1. **Intake** - Create issue with clear acceptance criteria
2. **Research/ADR** - Document decision before implementation
3. **Implementation** - Create PR with journal fragment
4. **Review** - Code review + QA validation
5. **Merge** - Integrate after all checks pass

### Required Artifacts Per Shard

- **Journal Fragment**: `docs/journal/_fragments/<phase>/<shard>-<description>.md`
- **ADR** (if architectural): `docs/adr/ADR-<number>-<title>.md`
- **Tests**: Unit and integration tests for new functionality
- **Output Summary**: Links to PRs and journal entries

### Research Before Code

**Mandatory**: ADR or research comment required before implementation for:

- New packages or major features
- Breaking changes
- Security-sensitive code
- Performance-critical paths
- Third-party integrations

### Quality Gates by Risk Level

**Low Risk** (typos, docs):

- Comment-only governance
- Fast path to merge

**Standard** (features, bug fixes):

- Code Reviewer approval
- QA evidence (tests passing)
- Deterministic checks green

**High Risk** (security, breaking changes):

- Code Reviewer + QA/Security + Architect
- Agentic verification
- Feature flags mandatory
- Rollback plan documented
