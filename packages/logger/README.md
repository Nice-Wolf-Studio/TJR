# @tjr/logger

Structured logging and error handling for TJR Suite.

## Features

- **Structured Logging**: JSON output for production, pretty-print for development
- **PII Redaction**: Automatic redaction of sensitive fields (passwords, tokens, etc.)
- **Multiple Transports**: Console and file output with configurable levels
- **Child Loggers**: Contextual logging with inherited configuration
- **Global Error Handlers**: Capture uncaught exceptions and unhandled rejections
- **TypeScript Support**: Fully typed API with strong type safety

## Installation

```bash
pnpm add @tjr/logger
```

## Quick Start

```typescript
import { createLogger, attachGlobalHandlers } from '@tjr/logger';

// Create logger
const logger = createLogger({
  level: 'info',
  json: process.env.NODE_ENV === 'production',
  filePath: './logs/app.log', // Optional file output
});

// Attach global error handlers
attachGlobalHandlers(logger);

// Log messages
logger.info('Application started', { version: '1.0.0' });
logger.error('Something went wrong', { error: new Error('Oops') });
```

## Usage Examples

### Basic Logging

```typescript
const logger = createLogger({ level: 'info' });

logger.info('User logged in', { userId: '123', username: 'alice' });
logger.warn('Rate limit approaching', { requests: 95, limit: 100 });
logger.error('Database connection failed', { error: new Error('Timeout') });
logger.debug('Cache hit', { key: 'user:123', ttl: 3600 });
```

### Child Loggers with Context

```typescript
const logger = createLogger({ level: 'info' });

// Create component-specific logger
const dbLogger = logger.child({ component: 'database' });
dbLogger.info('Connection established', { host: 'localhost', port: 5432 });
// Output includes: component=database

// Create request-scoped logger
const reqLogger = logger.child({
  component: 'api',
  request_id: 'req-abc-123',
});
reqLogger.info('Request received', { method: 'GET', path: '/users' });
reqLogger.info('Response sent', { status: 200, duration_ms: 45 });
// Both logs include: component=api request_id=req-abc-123
```

### Trading-Specific Context

```typescript
const logger = createLogger({ level: 'info' });

// Create symbol-specific logger
const appleLogger = logger.child({
  component: 'trading-engine',
  symbol: 'AAPL',
  timeframe: '1h',
});

appleLogger.info('Signal generated', {
  request_id: 'trade-xyz-789',
  signal_type: 'BUY',
  confidence: 0.87,
  price: 150.25,
});
// Output includes: component=trading-engine symbol=AAPL timeframe=1h
```

### Automatic PII Redaction

```typescript
const logger = createLogger({ level: 'info' });

// Sensitive fields are automatically redacted
logger.info('User authentication', {
  username: 'alice',
  password: 'secret123', // Redacted: [REDACTED]
  api_key: 'sk-abc123', // Redacted: [REDACTED]
  email: 'alice@example.com', // Not redacted (not in sensitive list)
});

// Output:
// {
//   "level": "info",
//   "message": "User authentication",
//   "username": "alice",
//   "password": "[REDACTED]",
//   "api_key": "[REDACTED]",
//   "email": "alice@example.com"
// }
```

Redacted field patterns (case-insensitive):

- `password`, `passwd`, `pwd`
- `secret`, `api_key`, `apiKey`, `token`
- `authorization`, `auth`
- `private_key`, `privateKey`
- `credit_card`, `creditCard`, `ssn`

### Global Error Handlers

```typescript
import { createLogger, attachGlobalHandlers } from '@tjr/logger';

const logger = createLogger({ level: 'info' });

// Attach handlers to capture all unhandled errors
attachGlobalHandlers(logger);

// These errors will now be logged before process exit
setTimeout(() => {
  throw new Error('Uncaught exception!');
}, 100);

Promise.reject(new Error('Unhandled rejection!'));
```

**Important:** Global error handlers follow a fail-fast philosophy:

- Errors are logged with full stack traces
- Process exits with code 1 after logging
- No attempt is made to recover (prevents corrupted state)

### Environment-Aware Configuration

```typescript
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  json: process.env.NODE_ENV === 'production', // JSON in prod, pretty-print in dev
  filePath: process.env.LOG_FILE, // Optional file output
});
```

### File Output with Rotation

```typescript
const logger = createLogger({
  level: 'info',
  json: true,
  filePath: './logs/app.log',
});

// For production, consider adding log rotation:
// - Use winston-daily-rotate-file transport
// - Configure max file size and retention
// - See: https://github.com/winstonjs/winston-daily-rotate-file
```

## Configuration

### LoggerConfig

```typescript
interface LoggerConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  json?: boolean; // Default: true in prod, false in dev
  filePath?: string; // Optional file output path
  console?: boolean; // Default: true
}
```

### Log Levels

- `error`: Critical errors requiring immediate attention
- `warn`: Warning conditions that should be reviewed
- `info`: Informational messages about normal operations
- `debug`: Detailed debugging information for development

## API Reference

### `createLogger(config: LoggerConfig): Logger`

Creates a configured logger instance.

**Parameters:**

- `config`: Logger configuration options

**Returns:** Winston logger instance

### `attachGlobalHandlers(logger: Logger): void`

Attaches global error handlers for uncaught exceptions and unhandled rejections.

**Parameters:**

- `logger`: Logger instance to use for error logging

### `logger.child(context: Record<string, unknown>): Logger`

Creates a child logger with additional context fields.

**Parameters:**

- `context`: Context fields to include in all logs

**Returns:** Child logger with inherited configuration

## Best Practices

1. **Create child loggers for components:**

   ```typescript
   const dbLogger = logger.child({ component: 'database' });
   const apiLogger = logger.child({ component: 'api' });
   ```

2. **Use request IDs for tracing:**

   ```typescript
   const reqLogger = logger.child({ request_id: generateRequestId() });
   reqLogger.info('Request started');
   reqLogger.info('Request completed');
   ```

3. **Include contextual data:**

   ```typescript
   logger.info('Trade executed', {
     symbol: 'AAPL',
     timeframe: '1h',
     price: 150.25,
     quantity: 100,
   });
   ```

4. **Use appropriate log levels:**
   - Production: `info` or `warn`
   - Development: `debug`
   - Critical systems: `error` only

5. **Avoid logging in hot paths:**
   - Use `debug` level for frequent operations
   - Filter debug logs in production

## Architecture

See [ADR-0053: Logger and Error Handler](../../docs/adr/ADR-0053-logger-and-error-handler.md) for architectural decisions and rationale.

## Security

See [Logging Policy](../../security/logging-policy.md) for PII handling and redaction policies.

## License

UNLICENSED - Copyright Nice Wolf Studio
