# ADR-0207: App Wiring Architecture

**Status**: Accepted
**Date**: 2025-09-30
**Context**: Phase 2 - Goal 1 (G1)
**Related**: Issue #26

## Context and Problem Statement

TJR Suite's app package requires a robust dependency injection (DI) system to wire together services (providers, cache, logger, Discord bot, analysis-kit) with proper lifecycle management, health monitoring, and minimal external dependencies.

**Key Requirements:**

1. Type-safe service registration and resolution
2. Dependency-aware initialization and shutdown
3. Health check aggregation across all services
4. No heavy DI frameworks (InversifyJS, etc.)
5. Visibility into service wiring for debugging
6. Support for both singleton and transient services

## Decision

We will implement a **manual dependency injection container** with the following design:

### 1. Token-Based Service Registration

```typescript
// services/container/tokens.ts
export const TOKENS = {
  Logger: Symbol('Logger'),
  Config: Symbol('Config'),
  Cache: Symbol('CacheService'),
  ProviderService: Symbol('ProviderService'),
  Discord: Symbol('DiscordService'),
};
```

**Rationale:**

- Symbols provide unique, collision-free identifiers
- Type-safe at compile time when used with TypeScript generics
- No string-based lookups that can lead to typos
- Clear separation between token and implementation

### 2. Service Interface Contract

```typescript
interface Service {
  name: string;
  dependencies: string[];
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  healthCheck(): HealthStatus;
}
```

**Rationale:**

- Standardized lifecycle methods for all services
- Explicit dependency declarations for initialization ordering
- Built-in health check support for monitoring
- Async initialization supports I/O operations

### 3. Container Implementation

**Core Capabilities:**

- `register<T>(token, factory, metadata?)` - Register service with factory function
- `resolve<T>(token)` - Lazily instantiate and return service
- `has(token)` - Check if service is registered
- `initializeAll()` - Initialize all services in dependency order
- `shutdownAll()` - Shutdown services in reverse dependency order
- `healthCheckAll()` - Aggregate health status from all services
- `getDependencyGraph()` - Generate dependency visualization
- `getWiringGraph()` - ASCII art representation of service tree

**Design Choices:**

#### Singleton Pattern

```typescript
resolve<T>(token: symbol): T {
  // Check cache first
  if (this.services.has(token)) {
    return this.services.get(token);
  }

  // Create and cache
  const instance = factory(this);
  if (registration?.singleton !== false) {
    this.services.set(token, instance);
  }
  return instance;
}
```

**Rationale:** Singleton by default reduces object creation overhead and ensures consistent state across the application. Services that need transient behavior can opt-out with `{ singleton: false }`.

#### Dependency Resolution

```typescript
container.register(
  TOKENS.Cache,
  (c) =>
    new MemoryCache({
      logger: c.resolve(TOKENS.Logger), // Resolve dependencies
    }),
  {
    name: 'CacheService',
    dependencies: [TOKENS.Logger], // Declare for init ordering
  }
);
```

**Rationale:** Factory functions receive the container, enabling explicit dependency resolution at construction time. This is clearer than constructor injection frameworks.

#### Initialization Order

```typescript
async initializeAll(): Promise<void> {
  // Topological sort based on service.dependencies
  const initialize = async (service: Service) => {
    for (const depName of service.dependencies) {
      await initialize(findServiceByName(depName));
    }
    await service.initialize();
  };
}
```

**Rationale:** Automatic dependency-order initialization prevents "service not ready" errors. Services are initialized bottom-up (dependencies first).

#### Graceful Shutdown

```typescript
async shutdownAll(): Promise<void> {
  // Reverse dependency order (dependents before dependencies)
  const shutdownService = async (service: Service) => {
    try {
      await service.shutdown();
    } catch (error) {
      // Log but don't throw - continue shutting down others
      console.error(`Error shutting down ${service.name}:`, error);
    }
  };
}
```

**Rationale:** Catch errors during shutdown to ensure all services get a chance to clean up. Shutdown in reverse order prevents "dependency already closed" errors.

### 4. Wiring Graph Visualization

```
[App Container]
  ├─> [Logger] ✓
  ├─> [Config] ✓
  ├─> [CacheService] ✓
  │     └─> [Logger] ✓
  ├─> [ProviderService] ✓
  │     ├─> [Logger] ✓
  │     └─> [CacheService] ✓
  └─> [DiscordService] ✓
        └─> [Logger] ✓
```

**Rationale:** ASCII art visualization helps developers understand service dependencies and debug initialization issues. Check marks (✓) indicate initialized services.

### 5. Health Check Aggregation

```typescript
async healthCheckAll(): Promise<Map<string, HealthStatus>> {
  for (const token of this.initialized) {
    const status = await instance.healthCheck();
    results.set(instance.name, {
      ...status,
      lastCheck: new Date()
    });
  }
  return results;
}
```

**Rationale:** Centralized health monitoring makes it easy to check system-wide health. Only checks initialized services to avoid errors.

## Alternatives Considered

### 1. InversifyJS

**Pros:** Mature, feature-rich, decorator-based
**Cons:** Heavy dependency (78KB), requires `reflect-metadata`, decorator complexity

**Rejection Reason:** Too heavyweight for our needs. Manual DI is simpler and more transparent.

### 2. TSyringe

**Pros:** Lighter than InversifyJS, Microsoft-maintained
**Cons:** Still requires `reflect-metadata`, decorator magic

**Rejection Reason:** Prefer explicit over implicit. Factory functions are clearer than decorators.

### 3. Simple Factory Pattern

**Pros:** No framework, very simple
**Cons:** No lifecycle management, no dependency ordering, manual wiring

**Rejection Reason:** Insufficient structure. Need automated init/shutdown ordering.

## Consequences

### Positive

1. **Zero Dependencies:** No DI framework dependencies to maintain
2. **Type Safety:** Full TypeScript type checking at compile time
3. **Explicit:** Factory functions make dependencies obvious
4. **Debuggable:** Wiring graph shows exactly what's connected
5. **Testable:** Easy to mock services in tests
6. **Lightweight:** <500 lines of code vs. 78KB+ for frameworks
7. **Performance:** Direct function calls, no reflection overhead

### Negative

1. **Manual Wiring:** Developers must manually register services
2. **No Auto-Discovery:** Can't automatically scan for services
3. **Circular Dependencies:** Must be manually detected/prevented
4. **Learning Curve:** New pattern for developers familiar with Angular/NestJS

### Neutral

1. **Convention-Based:** Relies on Service interface contract
2. **Single Container:** One global container per application
3. **Symbol Tokens:** Requires central TOKENS registry

## Implementation Notes

### Service Registration Example

```typescript
// config/wiring.ts
export function wireServices(container: Container) {
  // Logger (no dependencies)
  container.register(TOKENS.Logger, () => createLogger({ level: 'info', format: 'json' }), {
    name: 'Logger',
  });

  // Config (no dependencies)
  container.register(TOKENS.Config, () => loadConfigFromEnv(), { name: 'Config' });

  // Cache (depends on Logger)
  container.register(
    TOKENS.Cache,
    (c) =>
      new MemoryCache({
        logger: c.resolve(TOKENS.Logger),
        maxSize: 100 * 1024 * 1024,
      }),
    { name: 'CacheService', dependencies: ['Logger'] }
  );

  // Provider (depends on Logger and Cache)
  container.register(
    TOKENS.ProviderService,
    (c) =>
      new AlpacaProvider({
        logger: c.resolve(TOKENS.Logger),
        cache: c.resolve(TOKENS.Cache),
        apiKey: process.env.ALPACA_API_KEY,
      }),
    { name: 'ProviderService', dependencies: ['Logger', 'CacheService'] }
  );
}
```

### Application Startup

```typescript
// main.ts
async function main() {
  const container = new Container();

  // Wire all services
  wireServices(container);

  // Initialize in dependency order
  await container.initializeAll();

  // Health check
  const health = await container.healthCheckAll();
  console.log('Service health:', health);

  // Run application
  await runApp(container);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await container.shutdownAll();
    process.exit(0);
  });
}
```

### Testing Services

```typescript
// tests/daily.test.ts
describe('DailyCommand', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();

    // Register test doubles
    container.register(TOKENS.Logger, () => mockLogger, { name: 'Logger' });
    container.register(TOKENS.ProviderService, () => fixtureProvider, {
      name: 'ProviderService',
      dependencies: ['Logger'],
    });

    await container.initializeAll();
  });

  it('should analyze daily data', async () => {
    const command = new DailyCommand({
      providerService: container.resolve(TOKENS.ProviderService),
      logger: container.resolve(TOKENS.Logger),
    });
    // ...
  });
});
```

## Monitoring and Observability

The container exposes metrics for monitoring:

```typescript
interface ContainerMetrics {
  servicesRegistered: number;
  servicesInitialized: number;
  healthyServices: number;
  unhealthyServices: number;
  dependencyGraph: DependencyNode[];
}
```

**Recommended Monitoring:**

- Alert if any service reports unhealthy
- Track initialization time per service
- Monitor circular dependency detection
- Log wiring graph on startup for debugging

## References

- Martin Fowler: [Inversion of Control Containers](https://martinfowler.com/articles/injection.html)
- [TypeScript Handbook: Symbols](https://www.typescriptlang.org/docs/handbook/symbols.html)
- Issue #26: Minimal app wiring implementation
- ADR-0206: Analysis-kit integration
- ADR-0208: Command pattern for CLI

## Decision Log

| Date       | Decision                       | Rationale                                 |
| ---------- | ------------------------------ | ----------------------------------------- |
| 2025-09-30 | Use manual DI over InversifyJS | Simpler, lighter, more explicit           |
| 2025-09-30 | Symbol tokens vs. string IDs   | Type safety and collision prevention      |
| 2025-09-30 | Service interface contract     | Standardize lifecycle across all services |
| 2025-09-30 | Singleton by default           | Most services should be singletons        |
| 2025-09-30 | ASCII wiring graph             | Better debuggability than JSON            |

---

**Status**: ✅ Implemented
**Tests**: 81/81 passing
**Code Review**: Approved
