# @tjr/app

Main application package that wires together all TJR Suite components into a cohesive trading analysis system.

## Overview

The app package provides:

- **Dependency injection container** for service wiring
- **Command interface** for health checks and daily analysis
- **Service stubs** for Discord, providers, and cache
- **Configuration management** with schema validation
- **Wiring graph visualization** for debugging

## Architecture

### Dependency Injection

Uses a manual DI container pattern for simplicity and type safety:

```typescript
const container = new Container();
container.register(TOKENS.Logger, () => createLogger(config));
container.register(TOKENS.ProviderService, () => new FixtureProvider(...));
await container.initializeAll();
```

### Service Pattern

All services implement a common interface:

```typescript
interface Service {
  readonly name: string;
  readonly dependencies: string[];
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  healthCheck(): HealthStatus;
}
```

### Commands

Commands follow a standard interface for consistent execution:

```typescript
interface Command {
  name: string;
  description: string;
  execute(args: string[], options: CommandOptions): Promise<CommandResult>;
}
```

## Installation

```bash
pnpm install
```

## Usage

### CLI Mode

```bash
# Interactive mode
pnpm start

# Command mode
pnpm start health
pnpm start daily SPY
pnpm start daily QQQ 2025-09-29

# With flags
pnpm start --dry-run health
pnpm start --verbose daily SPY
```

### Environment Variables

```bash
# Core
NODE_ENV=development
DRY_RUN=true
VERBOSE=true
LOG_LEVEL=debug

# Services
PROVIDER_TYPE=fixture
CACHE_TYPE=memory
DATABASE_TYPE=sqlite
DATABASE_URL=sqlite:tjr.db

# Discord (optional)
DISCORD_ENABLED=false
DISCORD_TOKEN=your-token
```

## Commands

### /health

Check the health status of all services:

```bash
tjr health
tjr health --verbose  # Include wiring graph
```

Output includes:

- Service health status
- Error messages if unhealthy
- System statistics
- Wiring graph (verbose mode)

### /daily

Analyze daily market structure and bias:

```bash
tjr daily           # Default: SPY today
tjr daily QQQ       # Specific symbol
tjr daily SPY 2025-09-29  # Specific date
```

Analysis includes:

- Market bias (direction, strength, confidence)
- Day profile classification
- Session extremes
- Key levels and statistics

## Service Wiring

The application automatically wires services based on dependencies:

```
[App Container]
  ├─> [Logger] ✓
  ├─> [Config] ✓
  ├─> [CacheService] ✓
  │     └─> [Logger] ✓
  ├─> [ProviderService] ✓
  │     ├─> [Logger] ✓
  │     └─> [CacheService] ✓
  ├─> [DiscordService] ✓
  │     └─> [Logger] ✓
  ├─> [HealthCommand] ✓
  │     ├─> [Container] ✓
  │     └─> [Logger] ✓
  └─> [DailyCommand] ✓
        ├─> [ProviderService] ✓
        └─> [Logger] ✓
```

## Development

### Adding a New Service

1. Define the service interface in `src/services/[service]/types.ts`
2. Implement the service class
3. Register in container (`src/start.ts`)
4. Add to wiring graph

### Adding a New Command

1. Create command class in `src/commands/`
2. Implement `Command` interface
3. Register in container
4. Add to Discord/CLI handlers

### Testing with Fixtures

The app uses fixture data by default for deterministic testing:

```bash
pnpm start --dry-run daily SPY
```

This ensures:

- Consistent test results
- No external API calls
- Fast execution
- Predictable behavior

## Configuration

Configuration is managed through:

1. **Environment variables** (highest priority)
2. **Default values** in schema
3. **Schema validation** with Zod

See `src/config/schema.ts` for all configuration options.

## Project Structure

```
packages/app/
├── src/
│   ├── container/          # DI container implementation
│   ├── services/          # Service implementations
│   │   ├── discord/      # Discord bot stub
│   │   ├── providers/    # Market data providers
│   │   └── cache/        # Cache implementations
│   ├── commands/          # Command implementations
│   ├── config/           # Configuration management
│   ├── fixtures/         # Test data
│   └── start.ts         # Main entry point
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

## Future Enhancements

- [ ] Real Discord bot integration
- [ ] Polygon/Alpaca provider implementations
- [ ] Redis cache support
- [ ] Database persistence
- [ ] More analysis commands
- [ ] Web dashboard interface
- [ ] Real-time data streaming
- [ ] Advanced composite patterns

## License

UNLICENSED - Proprietary
