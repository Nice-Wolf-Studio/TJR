# ADR-0309: TJR Commands Integration (/tjr-setup, /tjr-confluences, /tjr-execution)

**Status:** Accepted
**Date:** 2025-09-30
**Decision Makers:** Architect Agent, PM Agent
**Issue:** #38

---

## Context

The TJR Suite now has comprehensive analysis capabilities through @tjr/tjr-tools (confluences, risk management, execution logic), but these capabilities are not yet exposed through user-facing commands. We need to implement three new commands that make these tools accessible via CLI and Discord:

1. **/tjr-setup** - Configure user preferences and analysis parameters
2. **/tjr-confluences** - Display confluence analysis (FVG, Order Blocks, scoring)
3. **/tjr-execution** - Display execution recommendations (5m confirmation + 1m entry)

### Requirements from Issue #38

- Commands must render tjr-tools outputs in user-friendly formats
- Fixture-first approach for testing, but live-capable for production
- Multiple output formatters (text, JSON, table, markdown)
- Config loader for user preferences
- Structured logging throughout
- Deterministic fixtures for reproducible tests
- No duplicate command registrations

### Current Architecture Context

**Existing Command Infrastructure:**

- Command interface at `/packages/app/src/commands/types.ts`
- DI container for service injection
- Existing patterns: `health.command.ts`, `daily.command.ts`
- Formatter pattern established by `DailyFormatter`
- Cache integration for performance
- Provider service abstraction

**@tjr/tjr-tools Capabilities:**

- `analyze()` function returns `TJRToolsResult` with:
  - Confluence scoring (FVG, Order Blocks, overlap, recency)
  - Execution parameters (entry, stop, take profit, position size)
  - Risk management (position sizing, daily stops, partial exits)
- Configurable thresholds and weights
- Multi-timeframe support (5m + 1m)

---

## Decision

We will implement three new commands following the established command architecture pattern, with dedicated formatters for each command type and a centralized configuration system.

### Key Architectural Decisions

1. **Command Architecture**: Template method pattern with shared base class
2. **Config Management**: File-based storage in `~/.tjr/config/`
3. **Report Types**: Three dedicated report structures (Confluence, Execution, Setup)
4. **Formatter Pattern**: Multiple output formats (text, JSON, table, markdown)
5. **Error Handling**: Friendly error messages with structured codes
6. **Testing**: Fixture-first approach with deterministic outputs

---

## Implementation

### 1. Command Structure

All TJR commands follow the template method pattern:

```typescript
abstract class BaseTJRCommand implements Command {
  protected providerService: ProviderService;
  protected cacheService?: CacheService;
  protected configService: ConfigService;
  protected logger: Logger;

  async execute(args: string[], options: CommandOptions): Promise<CommandResult> {
    // 1. Parse and validate args
    // 2. Load user config
    // 3. Check cache
    // 4. Execute command logic
    // 5. Format output
    // 6. Cache result
  }
}
```

### 2. Three Commands

**TJRSetupCommand** - Configuration management

- Display current configuration
- Set confluence weights, execution thresholds, risk parameters
- Validate configuration
- Save/load user preferences

**TJRConfluencesCommand** - Confluence analysis

- Detect FVG zones and Order Blocks
- Calculate confluence score with weighted factors
- Display zone overlaps and recency analysis
- Multiple output formats

**TJRExecutionCommand** - Trade execution recommendations

- 5-minute confirmation check
- 1-minute entry trigger
- Price level calculation (entry, stop, take profit)
- Position sizing with risk management
- Trade recommendations

### 3. Configuration System

```typescript
export interface UserConfig {
  confluence: {
    weights: ConfluenceWeights;
    fvg: FVGOptions;
    orderBlock: OrderBlockOptions;
  };
  execution: ExecutionConfig;
  risk?: RiskConfig;
  formatting: {
    defaultFormat: OutputFormat;
    includeMetadata: boolean;
    verbose: boolean;
  };
  cache: {
    enabled: boolean;
    ttl: { confluence: number; execution: number };
  };
}
```

**Storage**: File-based in `~/.tjr/config/<userId>.json`

**Default Config**: Sensible defaults for all parameters

### 4. Formatter Pattern

Each command has a dedicated formatter supporting multiple outputs:

```typescript
export interface TJRFormatter<TReport> {
  format(report: TReport, format: OutputFormat): string;
  validate(report: TReport): ValidationResult;
}
```

**Formats**:

- `text`: Human-readable console output
- `json`: Structured data for API consumers
- `table`: Box-drawing table format
- `markdown`: Discord-friendly embeds

### 5. Report Types

**ConfluenceReport**: Zones, scoring, overlaps, metadata
**ExecutionReport**: Confirmation, entry, execution params, risk management
**SetupReport**: Current configuration, validation status, warnings

### 6. Error Handling

```typescript
export enum TJRErrorCode {
  INVALID_ARGS = 'INVALID_ARGS',
  CONFIG_ERROR = 'CONFIG_ERROR',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
  ANALYSIS_ERROR = 'ANALYSIS_ERROR',
  FORMAT_ERROR = 'FORMAT_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}
```

Friendly error messages mapped to each code.

---

## Testing Strategy

### Fixture-First Approach

```
packages/app/tests/commands/
├── tjr-setup.test.ts
├── tjr-confluences.test.ts
├── tjr-execution.test.ts
└── fixtures/
    ├── confluences/
    ├── execution/
    └── configs/
```

### Test Categories

1. **Unit Tests**: Argument parsing, config loading, formatters
2. **Integration Tests**: Command execution with fixtures, cache, config persistence
3. **E2E Tests**: Full flow with DI container, multi-command sequences

### Deterministic Outputs

All tests use fixtures to ensure:

- Same input → same output
- No flaky tests
- Reproducible results
- Fast execution

---

## Consequences

### Positive

✅ **Consistent Architecture**: Follows established patterns
✅ **User-Friendly**: Persistent config, multiple formats, friendly errors
✅ **Testable**: Fixture-first enables deterministic testing
✅ **Cacheable**: Performance optimization via cache integration
✅ **Extensible**: Easy to add new commands or formatters
✅ **Type-Safe**: Full TypeScript integration
✅ **No Duplication**: Guard against duplicate registration

### Negative

⚠️ **Configuration Complexity**: Many parameters to understand
⚠️ **File I/O**: Config persistence adds filesystem dependency
⚠️ **Multiple Report Types**: Three structures to maintain
⚠️ **Transform Layer**: Additional mapping needed

### Mitigations

- Sensible defaults for all configuration
- Config validation prevents invalid states
- Clear documentation for each parameter
- Thin, well-tested transform layer
- Cache keys include config version

---

## Implementation Phases

### Phase 1: Foundation

- Base command class with template method
- ConfigService with file storage
- Report types and interfaces
- Fixture infrastructure

### Phase 2: Setup Command

- TJRSetupCommand implementation
- SetupFormatter
- Config validation
- Integration tests

### Phase 3: Confluences Command

- TJRConfluencesCommand implementation
- ConfluenceFormatter (all formats)
- tjr-tools integration
- Report transformation

### Phase 4: Execution Command

- TJRExecutionCommand implementation
- ExecutionFormatter (all formats)
- Multi-timeframe handling
- Risk integration

### Phase 5: Integration

- Command registration
- Cache integration
- Error handling
- Documentation

---

## Trade-offs

### Rejected Alternatives

**Single Unified Command**: Harder to discover, test, and use
**Database Config Storage**: Overkill for key-value storage
**Shared Report Type**: Reduces type safety and flexibility
**No Config Persistence**: Users expect saved preferences

---

## Future Enhancements

1. Config profiles (conservative, aggressive, custom)
2. Remote config sync
3. Config templates
4. Interactive setup wizard
5. Batch analysis
6. Price/confluence alerts
7. Export to CSV/Excel
8. Backtesting integration

---

## References

- **Issue:** #38 [P3][G4] /tjr-\* commands integration
- **Dependencies:**
  - ADR-0209: TJR Confluences
  - ADR-0307: TJR Execution
  - ADR-0308: TJR Risk Management
- **Packages:** @tjr/tjr-tools, @tjr/app, @tjr/contracts

---

**Status:** Accepted
**Author:** Architect Agent, PM Agent
**Date:** 2025-09-30
**Implementation Target:** Phase 3, Sprint 3
