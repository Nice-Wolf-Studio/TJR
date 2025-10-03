# ADR-0053: Logger and Error Handler

**Status:** Accepted
**Date:** 2025-09-29
**Deciders:** Architecture Team
**Phase:** 51
**Shard:** A3

---

## Context

The TJR Suite requires a unified logging and error handling solution that:

- Provides structured, machine-readable logs for observability and debugging
- Supports multiple output transports (console, file, remote services)
- Captures contextual information (symbol, timeframe, request_id, etc.)
- Handles uncaught exceptions and unhandled promise rejections gracefully
- Protects sensitive data through PII redaction policies
- Enables typed child loggers for component-specific context

Without a standardized logging solution, we face:

- Inconsistent log formats across packages (plain text, JSON, custom formats)
- Missing contextual data for debugging distributed operations
- Unhandled errors causing silent failures or incomplete stack traces
- Accidental logging of sensitive data (API keys, user credentials, PII)
- Difficulty aggregating logs from multiple services

---

## Decision

### 1. **Logging Library: Winston**

We will use **Winston** as our logging library.

**Rationale:**

- **Mature and battle-tested:** Widely adopted in Node.js ecosystem
- **Transport ecosystem:** Built-in support for console, file, HTTP, stream transports
- **Format flexibility:** JSON, pretty-print, custom formatters
- **Performance:** Efficient with async logging and buffering
- **TypeScript support:** Strong community typings available

**Alternative considered:** Pino

- Pros: Faster raw performance, smaller footprint, excellent benchmarks
- Cons: Less flexible format customization, fewer transport options out-of-box
- Decision: Winston's flexibility and ecosystem maturity better fit our observability needs

---

### 2. **Structured Log Fields**

Standard log entries will include:

```typescript
interface LogEntry {
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  timestamp: string; // ISO 8601 format
  symbol?: string; // Trading symbol (e.g., "AAPL", "BTCUSD")
  timeframe?: string; // Chart timeframe (e.g., "1h", "1d")
  request_id?: string; // Request correlation ID
  component?: string; // Logger name/component (from child logger)
  [key: string]: unknown; // Additional context fields
}
```

**Rationale:**

- **symbol/timeframe:** Critical for debugging trading operations and backtests
- **request_id:** Enables tracing operations across services/modules
- **component:** Identifies source of log for easier filtering
- **Extensibility:** Additional fields can be added via child loggers

---

### 3. **Logger Configuration API**

```typescript
interface LoggerConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  json?: boolean; // JSON output (default: true in prod, false in dev)
  filePath?: string; // Optional file transport path
  console?: boolean; // Console output (default: true)
}

function createLogger(config: LoggerConfig): Logger;
```

**Features:**

- **Environment-aware defaults:** JSON in production, pretty-print in development
- **Multiple transports:** Console + optional file output
- **Level filtering:** Configurable log level per environment
- **Child loggers:** `logger.child({ component: 'MyModule' })` for scoped context

---

### 4. **Global Error Handlers**

```typescript
function attachGlobalHandlers(logger: Logger): void;
```

**Behavior:**

- Captures `uncaughtException` events and logs with full stack trace
- Captures `unhandledRejection` events and logs promise details
- Logs error details, then allows process to exit gracefully (exit code 1)
- Does NOT prevent process termination (fail-fast philosophy)

**Rationale:**

- **Observability:** Ensures no error goes unlogged
- **Fail-fast:** Prevents running in corrupted state after unhandled error
- **Graceful shutdown:** Allows logger to flush before exit

**Safety:** Handlers log and exit; they do not attempt recovery (avoids masking bugs)

---

### 5. **PII Redaction Policy**

Sensitive data will be redacted from logs automatically.

**Redacted fields (case-insensitive match):**

- `password`, `passwd`, `pwd`
- `secret`, `api_key`, `apiKey`, `token`
- `authorization`, `auth`
- `credit_card`, `creditCard`, `ssn`
- `private_key`, `privateKey`

**Redaction format:** `"password": "[REDACTED]"`

**Rationale:**

- **Security:** Prevents credential leaks in logs
- **Compliance:** Supports GDPR/CCPA requirements for PII handling
- **Safety by default:** Automatic redaction reduces human error

**Implementation:** Custom Winston format filter applied before output

---

## Architecture

### Package Structure

```
packages/logger/
├── src/
│   ├── createLogger.ts       # Main logger factory
│   ├── errorHandler.ts       # Global error handler attachment
│   ├── formats.ts            # Custom Winston formats (PII redaction, etc.)
│   ├── types.ts              # TypeScript interfaces
│   └── index.ts              # Public API exports
├── tests/
│   ├── logger.test.ts        # Logger creation and usage tests
│   ├── errorHandler.test.ts  # Global handler tests
│   └── pii-redaction.test.ts # PII redaction validation
├── package.json
├── tsconfig.json
└── README.md
```

---

### Usage Example

```typescript
import { createLogger, attachGlobalHandlers } from '@tjr/logger';

// Create root logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  json: process.env.NODE_ENV === 'production',
  filePath: process.env.LOG_FILE,
});

// Attach global error handlers
attachGlobalHandlers(logger);

// Component-specific child logger
const dbLogger = logger.child({ component: 'database' });

// Log with structured context
dbLogger.info('Query executed', {
  symbol: 'AAPL',
  timeframe: '1h',
  request_id: 'req-abc-123',
  duration_ms: 45,
});

// PII is automatically redacted
logger.warn('Login failed', {
  username: 'user@example.com',
  password: 'secret123', // Will be logged as "[REDACTED]"
});
```

---

## Alternatives Considered

### Console.log with Manual Formatting

**Pros:**

- Zero dependencies
- Simple for basic use cases

**Cons:**

- No structured logging (difficult to parse/aggregate)
- No transport flexibility (console only)
- No automatic PII redaction
- No contextual child loggers

**Decision:** Rejected. Insufficient for production observability needs.

---

### Bunyan

**Pros:**

- Fast, JSON-only logging
- CLI tool for pretty-printing (`bunyan` command)

**Cons:**

- Abandoned (last release 2019)
- No active maintenance or security updates
- Smaller ecosystem than Winston

**Decision:** Rejected due to lack of maintenance.

---

## Risks and Mitigations

### Risk 1: Performance impact of logging in hot paths

**Impact:** Excessive logging degrades application performance
**Mitigation:**

- Use appropriate log levels (avoid `debug` in production)
- Winston's async logging minimizes blocking
- Benchmark critical paths to ensure <1ms logging overhead

---

### Risk 2: Log volume growth

**Impact:** Large log files consume disk space, increase costs
**Mitigation:**

- Configure log rotation (e.g., `winston-daily-rotate-file`)
- Use level filtering to reduce noise (e.g., `info` in prod, `debug` in dev)
- Implement retention policies (e.g., 30-day rotation)

---

### Risk 3: Incomplete PII redaction

**Impact:** Sensitive data leaked despite redaction policy
**Mitigation:**

- Comprehensive test suite for redaction logic
- Security review of redaction patterns
- Document redaction policy in `security/logging-policy.md`
- Periodic audit of production logs for leaked secrets

---

### Risk 4: Unhandled errors causing data loss

**Impact:** Global error handler exits before flushing logs
**Mitigation:**

- Winston transports flush synchronously on exit by default
- Add explicit flush timeout before exit (e.g., 3 seconds)
- Test error handler with file transport to ensure flush

---

## Success Metrics

1. **Adoption:** All packages use `@tjr/logger` (no `console.log` in production code)
2. **PII safety:** 100% test coverage for redaction logic, zero secrets in production logs
3. **Observability:** Request tracing enabled for all API operations via `request_id`
4. **Reliability:** All unhandled errors logged with full stack traces before exit

---

## References

- [Winston Documentation](https://github.com/winstonjs/winston)
- [Node.js Error Handling Best Practices](https://nodejs.org/en/docs/guides/error-handling/)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)

---

## Changelog

- **2025-09-29:** Initial ADR created (Phase 51, Shard A3)
