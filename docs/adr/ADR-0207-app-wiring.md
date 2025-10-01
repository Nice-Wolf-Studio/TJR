# ADR-0207: App Wiring Architecture

**Status:** Accepted
**Date:** 2025-09-30
**Phase:** 2
**Shard:** G1

---

## Context

TJR Suite requires a central application layer that orchestrates multiple services, manages their lifecycles, and provides a unified interface for both CLI and Discord bot interactions. This ADR documents the architectural decisions made in implementing the `@tjr/app` package, which serves as the main entry point and dependency injection infrastructure for the entire suite.

### Requirements

1. **Service Coordination:** Wire together logger, configuration, data providers, cache, Discord bot, and command handlers
2. **Lifecycle Management:** Initialize services in dependency order, graceful shutdown in reverse order
3. **Health Monitoring:** Provide visibility into service health and dependency relationships
4. **Dual Interface Support:** Support both CLI (single-command + interactive REPL) and Discord bot modes
5. **Type Safety:** Leverage TypeScript's type system to prevent runtime injection errors
6. **Testability:** Enable deterministic testing without external dependencies (dry-run mode)
7. **Extensibility:** Make it easy to add new services and commands without modifying core infrastructure

### Challenges

- **Dependency Injection Complexity:** TypeScript doesn't have built-in DI; need to choose between manual implementation vs external libraries (tsyringe, inversify, etc.)
- **Initialization Order:** Services have dependencies that must initialize before their dependents
- **Type Safety vs Runtime Flexibility:** DI containers often lose type information at runtime
- **Circular Dependencies:** Need to detect and prevent circular service dependencies
- **Health Check Coordination:** Each service needs health check capability without tight coupling
- **Interface Consistency:** CLI and Discord commands should share the same implementation logic
- **Configuration Management:** Environment variables, CLI flags, and defaults must merge cleanly

---

## Decision

### 1. Manual Dependency Injection Container

We implemented a **custom, lightweight DI container** instead of using external libraries like `tsyringe` or `inversify`.

**Rationale:**

- **Zero External Dependencies:** No DI framework means smaller bundle size and fewer supply chain risks
- **Full Control:** Custom implementation allows us to add exactly the features we need (health checks, wiring graph, lifecycle management)
- **Learning Value:** Understanding DI implementation deepens architectural knowledge
- **Type Safety:** Symbol-based tokens with factory functions preserve TypeScript types
- **Simplicity:** ~277 lines of code vs thousands in external libraries

**Container API:**

```typescript
interface IContainer {
  register<T>(token: symbol, factory: (container: IContainer) => T): void;
  resolve<T>(token: symbol): T;
  has(token: symbol): boolean;
  getDependencyGraph(): DependencyNode[];
  getWiringGraph(): string;  // ASCII art visualization
  initializeAll(): Promise<void>;
  shutdownAll(): Promise<void>;
  healthCheckAll(): Promise<Map<string, HealthStatus>>;
}
```

**Container Features:**

1. **Factory Pattern:** Services created via factory functions, not classes directly
2. **Singleton by Default:** Services instantiated once and cached
3. **Recursive Initialization:** Services initialize in dependency order with cycle detection
4. **Reverse Shutdown:** Services shut down in reverse dependency order for clean teardown
5. **Dependency Graph:** Introspectable dependency tree for debugging and visualization

### 2. Symbol-Based Dependency Tokens

We use **TypeScript symbols** as dependency tokens instead of string keys or classes.

**Token Definition (`container/tokens.ts`):**

```typescript
export const TOKENS = {
  // Core infrastructure
  Logger: Symbol('Logger'),
  Config: Symbol('Config'),
  Container: Symbol('Container'),

  // Application services
  DiscordService: Symbol('DiscordService'),
  ProviderService: Symbol('ProviderService'),
  CacheService: Symbol('CacheService'),

  // Commands
  HealthCommand: Symbol('HealthCommand'),
  DailyCommand: Symbol('DailyCommand'),
} as const;
```

**Benefits:**

- **Uniqueness Guaranteed:** Symbols are unique even if names collide
- **Type Safety:** Can create mapped types from token definitions
- **Debugging Support:** Symbol descriptions visible in debugger
- **No String Magic:** Compiler catches typos (vs string-based keys)

**Usage Example:**

```typescript
// Registration
container.register(TOKENS.Logger, () => createLogger());

// Resolution
const logger = container.resolve<Logger>(TOKENS.Logger);
```

### 3. Service Lifecycle Pattern

All services implement a **common Service interface** with lifecycle hooks.

**Service Interface (`container/types.ts`):**

```typescript
interface Service {
  readonly name: string;
  readonly dependencies: string[];
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  healthCheck(): HealthStatus;
}
```

**Lifecycle Phases:**

1. **Registration:** Services registered via factory functions
2. **Resolution:** Services instantiated on-demand (lazy)
3. **Initialization:** Services initialized in dependency order via `initializeAll()`
4. **Runtime:** Services operational, health checks available via `healthCheckAll()`
5. **Shutdown:** Services shut down in reverse order via `shutdownAll()`

**Initialization Algorithm:**

```typescript
// Recursive initialization with cycle detection
async function initialize(service: Service) {
  if (initialized.has(service.name)) return;

  // Initialize dependencies first
  for (const depName of service.dependencies) {
    const dep = services.find(s => s.name === depName);
    if (dep) await initialize(dep);
  }

  // Initialize this service
  await service.initialize();
  initialized.add(service.name);
}
```

**Example Service Implementation:**

```typescript
class MemoryCache implements Service {
  name = 'CacheService';
  dependencies = ['Logger'];

  async initialize(): Promise<void> {
    this.logger.info('Cache initialized');
  }

  async shutdown(): Promise<void> {
    this.cache.clear();
    this.logger.info('Cache cleared');
  }

  healthCheck(): HealthStatus {
    return {
      healthy: true,
      message: `${this.cache.size} items cached`
    };
  }
}
```

### 4. Configuration System

Configuration uses a **layered approach** with environment variables, CLI flags, and schema validation.

**Configuration Sources (priority order):**

1. **CLI Flags:** `--dry-run`, `--verbose`, `-v`
2. **Environment Variables:** `NODE_ENV`, `LOG_LEVEL`, `DISCORD_TOKEN`, etc.
3. **Schema Defaults:** Zod schema provides sensible defaults

**Configuration Schema (`config/schema.ts`):**

```typescript
export const configSchema = z.object({
  app: z.object({
    env: z.enum(['development', 'staging', 'production']).default('development'),
    dryRun: z.boolean().default(false),
    verbose: z.boolean().default(false),
  }),
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    format: z.enum(['json', 'pretty']).default('pretty'),
  }),
  discord: z.object({
    enabled: z.boolean().default(false),
    token: z.string().optional(),
  }),
  // ... provider, cache, database, calendar, analysis
});
```

**Environment Variable Mapping:**

```typescript
export const envMapping: Record<string, string> = {
  'NODE_ENV': 'app.env',
  'DRY_RUN': 'app.dryRun',
  'LOG_LEVEL': 'logging.level',
  'DISCORD_TOKEN': 'discord.token',
  'PROVIDER_TYPE': 'provider.type',
  'CACHE_TYPE': 'cache.type',
  'DATABASE_URL': 'database.url',
};
```

**Configuration Loading Process:**

1. Parse environment variables using `envMapping`
2. Parse CLI flags (`--dry-run`, `--verbose`)
3. Merge with Zod schema defaults
4. Validate entire configuration object
5. Return strongly-typed `Config` object

### 5. Dual Interface Architecture

The application supports **two operational modes** with shared command implementations.

**CLI Mode:**

- **Single Command:** `tjr health` (execute and exit)
- **Interactive REPL:** `tjr` (enter command loop with readline)
- **Output Formats:** text (default), table, JSON (via `--format` flag)

**Discord Bot Mode:**

- **Slash Commands:** `/health`, `/daily`
- **Event-Driven:** Responds to Discord interactions
- **Persistent Process:** Runs indefinitely until SIGINT

**Command Interface (`commands/types.ts`):**

```typescript
interface Command {
  name: string;
  description: string;
  aliases: string[];
  execute(args: string[], options: CommandOptions): Promise<CommandResult>;
}

interface CommandOptions {
  format?: 'text' | 'table' | 'json';
  dryRun?: boolean;
  verbose?: boolean;
}

interface CommandResult {
  success: boolean;
  output: any;
  error?: Error;
  duration: number;
  metadata?: Record<string, any>;
}
```

**Shared Command Logic:**

Both CLI and Discord interfaces resolve the same command instances from the container. Commands are stateless and can be invoked from any interface without modification.

**Example Command Registration:**

```typescript
// CLI mode
const healthCommand = container.resolve<Command>(TOKENS.HealthCommand);
const result = await healthCommand.execute([], { format: 'text' });
console.log(result.output);

// Discord mode
discord.registerCommand(healthCommand);
// Discord bot automatically calls healthCommand.execute() on /health
```

### 6. Wiring Graph Visualization

The container provides **ASCII art visualization** of the service dependency graph.

**Graph Generation:**

```typescript
getWiringGraph(): string {
  const nodes = this.getDependencyGraph();
  const lines: string[] = ['[App Container]'];

  const renderNode = (node: DependencyNode, prefix: string, isLast: boolean) => {
    const connector = isLast ? '└─> ' : '├─> ';
    const status = node.metadata?.initialized ? '✓' : '○';
    lines.push(`${prefix}${connector}[${node.name}] ${status}`);

    const childPrefix = prefix + (isLast ? '      ' : '│     ');
    node.dependencies.forEach((dep, i) => {
      renderNode(dep, childPrefix, i === node.dependencies.length - 1);
    });
  };

  nodes.forEach((node, i) => renderNode(node, '  ', i === nodes.length - 1));
  return lines.join('\n');
}
```

**Example Output:**

```
[App Container]
  ├─> [Logger] ✓
  ├─> [Config] ✓
  ├─> [CacheService] ✓
  │     └─> [Logger] ✓
  ├─> [ProviderService] ✓
  │     └─> [Logger] ✓
  ├─> [DiscordService] ○
  │     └─> [Logger] ✓
  ├─> [HealthCommand] ✓
  └─> [DailyCommand] ✓
        └─> [ProviderService] ✓
```

**Status Indicators:**

- `✓` - Service initialized successfully
- `○` - Service registered but not yet initialized
- Indentation shows dependency hierarchy

### 7. Stub Services vs Real Implementations

We use **stub implementations** for services not yet fully developed, enabling end-to-end testing of the wiring infrastructure.

**Stub Services Implemented:**

1. **DiscordStub (`services/discord/discord.stub.ts`):**
   - Implements full `DiscordService` interface
   - Simulates bot initialization, command registration, interaction handling
   - Logs actions instead of calling Discord API
   - Configurable latency simulation (`simulateLatency: true`)

2. **FixtureProvider (`services/providers/fixture-provider.ts`):**
   - Implements `ProviderService` interface
   - Returns generated fixture data instead of fetching from APIs
   - Deterministic behavior for testing
   - Configurable latency to simulate network delays

**Benefits of Stub-First Approach:**

- **Parallel Development:** Can build app wiring while providers are still in development
- **Deterministic Testing:** Stubs return predictable data for CI/CD
- **Fast Iteration:** No external API calls means instant feedback
- **Interface Validation:** Proves service contracts work before real implementations

**Migration Path:**

Stubs implement the same interfaces as real services. Swapping a stub for a real implementation requires only changing the factory registration:

```typescript
// Phase 2: Stub
container.register(TOKENS.DiscordService, () => new DiscordStub(config));

// Phase 3: Real implementation
container.register(TOKENS.DiscordService, () => new DiscordBot(config));
```

No changes needed in commands or other services that depend on `DiscordService`.

---

## Alternatives Considered

### Alternative 1: External DI Library (tsyringe, inversify)

**Approach:** Use established DI frameworks like `tsyringe` or `inversify`.

**Pros:**
- Battle-tested: Mature libraries with large user bases
- Rich feature set: Advanced features like multi-injection, scoped lifetimes
- Documentation: Extensive guides and examples
- Decorator support: `@injectable()`, `@inject()` decorators for cleaner syntax

**Cons:**
- External dependency: Supply chain risk, version conflicts
- Learning curve: Each library has unique API and concepts
- Overengineering: We don't need multi-injection, scopes, or decorators
- Bundle size: tsyringe adds 10KB+, inversify adds 50KB+ to bundle
- TypeScript limitations: Decorators require `experimentalDecorators` flag

**Decision:** Rejected. Our requirements (7 services, simple singleton pattern) don't justify the complexity and dependency cost. A custom 277-line implementation provides everything we need with full control.

---

### Alternative 2: Class-Based Service Keys

**Approach:** Use classes themselves as dependency tokens instead of symbols.

```typescript
container.register(Logger, () => createLogger());
const logger = container.resolve(Logger);
```

**Pros:**
- Simpler syntax: No need for separate `TOKENS` object
- Natural TypeScript: Classes are already unique identifiers
- Type inference: Compiler can infer return type from class

**Cons:**
- Coupling: Services must import concrete classes, not interfaces
- Mocking difficulty: Harder to substitute mock implementations
- Multiple implementations: Can't have multiple providers for same interface
- Constructor ambiguity: What if we want to resolve by interface, not class?

**Decision:** Rejected. Symbol-based tokens provide better decoupling and flexibility. We can have multiple implementations of the same interface (e.g., `MemoryCache` and `RedisCache` both implementing `CacheService`).

---

### Alternative 3: Service Locator Pattern

**Approach:** Use a global service locator instead of dependency injection.

```typescript
// Global registry
ServiceLocator.register('logger', createLogger());

// Services fetch dependencies from locator
class HealthCommand {
  execute() {
    const logger = ServiceLocator.get('logger');
    logger.info('Health check');
  }
}
```

**Pros:**
- Simplicity: No need to pass dependencies through constructors
- Flexibility: Can fetch dependencies on-demand
- Less boilerplate: No factory functions needed

**Cons:**
- Hidden dependencies: Dependencies not visible in constructor
- Testing difficulty: Must mock global state for tests
- Coupling: All services tightly coupled to service locator
- Type safety: String keys lose type information
- Initialization order: Unclear when services are available

**Decision:** Rejected. Service locator is an anti-pattern that hides dependencies and makes testing harder. Explicit dependency injection via constructor makes dependencies clear and testable.

---

### Alternative 4: Module-Level Singletons

**Approach:** Export singleton instances directly from modules.

```typescript
// logger.ts
export const logger = createLogger();

// health.command.ts
import { logger } from './logger.js';
export class HealthCommand { ... }
```

**Pros:**
- Simplicity: No DI container needed
- Static analysis: Easy for bundlers to tree-shake
- Performance: No runtime resolution overhead

**Cons:**
- Testing difficulty: Singletons are global state, hard to mock
- Initialization order: Module execution order determines initialization
- Circular dependencies: Module system can't handle circles
- Configuration: How do singletons get configuration?
- Lifecycle: No coordinated initialization or shutdown

**Decision:** Rejected. Module-level singletons are problematic for testing and lifecycle management. DI container provides explicit control over initialization order and makes testing easier.

---

## Consequences

### Positive

1. **Clean Architecture:** Clear separation between infrastructure (container), services, and commands
2. **Type Safety:** Symbol-based tokens + factory functions preserve TypeScript types throughout resolution
3. **Testability:** Services receive dependencies via constructor, making mocking trivial
4. **Visibility:** Wiring graph visualization makes dependency relationships explicit
5. **Lifecycle Control:** Coordinated initialization and shutdown prevent resource leaks
6. **Health Monitoring:** Unified health check interface for all services
7. **Interface Flexibility:** CLI and Discord share command implementations without duplication
8. **Extensibility:** Adding new services requires only:
   - Define service class implementing `Service` interface
   - Register factory in `start.ts`
   - No changes to container or existing services
9. **Dry-Run Mode:** Stub services enable deterministic testing without external dependencies
10. **Zero External DI Dependencies:** No tsyringe, inversify, or other DI libraries needed

### Negative

1. **Manual Container Maintenance:** Custom DI container means we maintain it ourselves (no community support)
2. **Limited Features:** No advanced DI features (scopes, multi-injection, conditional registration)
3. **Boilerplate:** Factory functions and token definitions add some ceremony
4. **Learning Curve:** Team members unfamiliar with DI patterns need onboarding
5. **No Decorator Support:** Can't use `@injectable()` or `@inject()` decorators (requires `experimentalDecorators`)
6. **Circular Dependency Detection:** Current implementation logs warnings but doesn't prevent registration
7. **Service Discovery:** No automatic service scanning; must manually register each service

### Mitigation Strategies

- **Container Evolution:** Can add features as needed (scopes, multi-injection) without external library lock-in
- **Documentation:** ADR and inline JSDoc comments explain DI patterns for new contributors
- **Type Generation:** Consider generating token types from service classes to reduce boilerplate
- **Circular Dependency Prevention:** Future enhancement could reject circular registrations at registration time

---

## Implementation Details

### Package Structure

```
packages/app/
├── package.json              # Dependencies: @tjr/logger, @tjr/contracts, @tjr/analysis-kit
├── tsconfig.json             # Extends root tsconfig.base.json
├── src/
│   ├── index.ts              # Public API exports
│   ├── start.ts              # Main entry point (357 lines)
│   ├── cli.ts                # CLI utilities
│   ├── container/
│   │   ├── index.ts          # Container implementation (277 lines)
│   │   ├── tokens.ts         # Dependency injection tokens (43 lines)
│   │   └── types.ts          # Container interfaces (73 lines)
│   ├── config/
│   │   ├── index.ts          # Configuration loader
│   │   └── schema.ts         # Zod configuration schema (115 lines)
│   ├── services/
│   │   ├── discord/
│   │   │   ├── discord.stub.ts  # Discord stub implementation
│   │   │   └── types.ts      # Discord service interfaces
│   │   ├── providers/
│   │   │   ├── fixture-provider.ts  # Fixture data provider
│   │   │   └── types.ts      # Provider service interfaces
│   │   └── cache/
│   │       ├── memory-cache.ts  # In-memory cache service
│   │       └── types.ts      # Cache service interfaces
│   ├── commands/
│   │   ├── health.command.ts # Health check command (169 lines)
│   │   ├── daily.command.ts  # Daily analysis command (348 lines)
│   │   └── types.ts          # Command interfaces
│   └── fixtures/
│       └── index.ts          # Fixture data generators
```

### Key Metrics

- **Total LOC:** ~2,000 lines
- **Services Registered:** 7 (Logger, Config, Cache, Provider, Discord, HealthCommand, DailyCommand)
- **Commands Implemented:** 2 (`/health`, `/daily`)
- **Output Formats:** 3 (text, table, JSON)
- **TypeScript Errors:** 0
- **Container LOC:** 277 lines (vs 10,000+ in inversify)

### Dependencies

- `@tjr/logger` (workspace:*) - Logging infrastructure
- `@tjr/contracts` (workspace:*) - Shared types and interfaces
- `@tjr/analysis-kit` (workspace:*) - Market analysis functions
- `zod` - Configuration schema validation
- `discord.js` (future) - Discord bot library (not yet used)

### Test Strategy

**TypeScript Compilation:** All files compile with zero errors (`npx tsc --noEmit`)

**Unit Tests:** Not yet implemented (implementation-first approach for Phase 2.G1)

**Integration Tests:** Manual testing of:
- `tjr health` - Health check command execution
- `tjr daily SPY` - Daily analysis command with fixture data
- `tjr --verbose` - Wiring graph visualization
- `tjr --dry-run health` - Dry-run mode with stubs
- Interactive CLI mode (`tjr` with no args)

**Future Test Coverage:**
- Container lifecycle (initialize, shutdown, health checks)
- Service registration and resolution
- Dependency graph generation
- Command execution (CLI + Discord modes)
- Configuration loading and validation
- Error handling and recovery

---

## References

- **Issue:** #26 - [P2][G1] Minimal app wiring
- **Journal:** `docs/journal/_fragments/2/2.G1-app-wiring.md`
- **Branch:** `phase-2.G1-app-wiring`
- **Package:** `/packages/app/`
- **Dependencies:**
  - `@tjr/logger` - Logging infrastructure (ADR-0101)
  - `@tjr/contracts` - Shared types (Phase 1)
  - `@tjr/analysis-kit` - Market analysis (Phase 1)
- **Related ADRs:**
  - ADR-0201: Yahoo Finance Data Provider (dependency resolution pattern)
  - ADR-0206: Discord Core (interface integration)
  - ADR-0208: TJR-Tools Skeleton (CLI tool pattern)

---

## Future Enhancements

### Phase 3+ Considerations

1. **Advanced DI Features:**
   - Scoped lifetimes (request-scoped, transient)
   - Multi-injection (inject all implementations of interface)
   - Conditional registration (register different implementations based on environment)
   - Lazy initialization (defer service creation until first use)

2. **Dynamic Command Registry:**
   - Auto-discover commands from filesystem
   - Plugin system for third-party commands
   - Command middleware (auth, validation, logging)
   - Command groups and subcommands

3. **Enhanced Health Checks:**
   - Dependency health propagation (unhealthy dependency marks dependent as degraded)
   - Health check caching (avoid redundant checks)
   - Health check endpoints (HTTP server for monitoring)
   - Alerting integration (send notifications on unhealthy services)

4. **Configuration Hot Reload:**
   - Watch configuration files for changes
   - Reload services when configuration updates
   - Graceful reconfiguration without restart

5. **Service Metrics:**
   - Track initialization time per service
   - Monitor command execution duration
   - Collect cache hit/miss rates
   - Export metrics to Prometheus/Grafana

6. **Error Recovery:**
   - Retry logic for transient failures
   - Circuit breaker pattern for external services
   - Graceful degradation (continue with reduced functionality)
   - Service restart on failure

---

## Changelog

- **2025-09-30:** Initial implementation (Phase 2, Shard G1)
  - Manual DI container with symbol-based tokens
  - Service lifecycle management (initialize/shutdown/healthCheck)
  - Dual interface support (CLI + Discord stub)
  - Configuration system with Zod validation
  - Wiring graph ASCII visualization
  - Two functional commands (`/health`, `/daily`)
  - Stub services for testing (DiscordStub, FixtureProvider)
  - Zero TypeScript compilation errors
