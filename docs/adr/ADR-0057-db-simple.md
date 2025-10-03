# ADR-0057: DB-simple connectors & migrator

**Status:** Accepted
**Date:** 2025-09-29
**Deciders:** Architecture Team
**Phase:** 51
**Shard:** C1

---

## Context

The TJR Suite requires a minimal database abstraction layer that:

- Supports both SQLite (local/testing) and PostgreSQL (production)
- Provides connection pooling and error handling
- Includes a simple migration runner for schema evolution
- Remains decoupled from application logic (no framework coupling)
- Allows logger injection rather than hardcoded logging

Without a unified database layer, we face:

- Duplicate connection logic across services
- Inconsistent error handling and retry strategies
- No standardized migration approach
- Difficulty switching between SQLite (dev) and PostgreSQL (prod)

---

## Decision

### 1. **Driver Choice: better-sqlite3 + pg**

We will use **better-sqlite3** for SQLite and **pg** for PostgreSQL.

**Rationale:**

- **better-sqlite3:**
  - Synchronous API ideal for testing and CLI tools
  - Excellent performance via native bindings
  - No callback hell or promise overhead for simple operations
  - Built-in prepared statement caching
  - Well-maintained and stable
- **pg:**
  - De-facto standard PostgreSQL driver for Node.js
  - Connection pooling via `pg.Pool`
  - Promise-based async API
  - Excellent TypeScript support
  - Battle-tested in production environments

**Alternatives considered:**

- **node-sqlite3:** Async-only API adds complexity for simple use cases
- **Knex.js/TypeORM:** Too heavyweight for our minimal needs; we want thin wrappers, not ORMs

---

### 2. **Connection String Formats**

Support standard URIs for both databases:

**SQLite:**

```
sqlite:path/to/database.db
sqlite::memory:
file:path/to/db.sqlite?mode=ro
```

**PostgreSQL:**

```
postgresql://user:password@host:port/database
postgres://user:password@host:port/database?sslmode=require
```

**Parsing Strategy:**

- Use URL constructor for postgres URIs
- Strip `sqlite:` prefix for file paths
- Special case `:memory:` for in-memory SQLite databases

---

### 3. **Connection Abstraction**

Provide a unified `connect()` function returning a minimal interface:

```typescript
interface DbConnection {
  exec(sql: string, params?: unknown[]): Promise<void>;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}
```

**Implementation details:**

- SQLite: Wrap better-sqlite3 synchronous methods with Promise wrappers for consistency
- PostgreSQL: Use `pg.Pool` with automatic reconnection
- Both drivers normalized to async interface (even though SQLite is sync internally)

**No ORM features:**

- No query builders
- No schema introspection
- No model mapping
- Just raw SQL execution

---

### 4. **Retry and Backoff Strategy**

Implement exponential backoff for transient errors:

**Retry policy:**

- Max retries: 3
- Initial delay: 100ms
- Backoff multiplier: 2x (100ms → 200ms → 400ms)
- Jitter: ±25% randomization to prevent thundering herd

**Retryable errors:**

- PostgreSQL:
  - `ECONNREFUSED`: Connection refused
  - `ETIMEDOUT`: Connection timeout
  - `ENOTFOUND`: DNS resolution failure
  - `53300`: Too many connections (pg error code)
- SQLite:
  - `SQLITE_BUSY`: Database locked
  - `SQLITE_LOCKED`: Table locked

**Non-retryable errors:**

- Syntax errors (`42601` in pg)
- Authentication failures (`28P01` in pg)
- Constraint violations
- File not found (SQLite)

**Rationale:**

- Transient network/lock issues should self-heal
- Permanent errors should fail fast
- Jitter prevents connection storms during outages

---

### 5. **Migration Runner**

Implement a simple file-based migration system:

**Migration format:**

- SQL files in `migrations/` directory
- Naming convention: `NNN_description.sql` (e.g., `001_create_users.sql`)
- Applied in lexicographic order
- Track applied migrations in `_migrations` table

**Metadata table:**

```sql
CREATE TABLE _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Runner behavior:**

- Scan migration directory
- Compare with `_migrations` table
- Apply missing migrations in order
- Wrap each migration in a transaction (SQLite/Postgres both supported)
- Log each applied migration (via injected logger if provided)

**No down migrations:**

- Keep it simple: forward-only
- Rollbacks handled manually or via separate scripts
- Database backups recommended before migrations

**Rationale:**

- File-based migrations are human-readable and git-friendly
- Sequential numbering prevents conflicts
- Transaction-per-migration ensures atomicity
- No framework dependencies

---

### 6. **Logger Injection (no hardcoded logging)**

Accept optional logger conforming to minimal interface:

```typescript
interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}
```

**Usage:**

```typescript
connect(dbUrl, { logger: myLogger });
runMigrations(migrationsDir, db, { logger: myLogger });
```

**Fallback behavior:**

- If no logger provided, use silent no-op logger
- Allows users to plug in Winston, Pino, console, etc.

**Rationale:**

- Avoids tight coupling to specific logging library
- Enables testing without log noise
- Production systems can inject structured loggers

---

## Alternatives Considered

### Using Knex.js

**Pros:**

- Query builder API
- Built-in migration system
- Mature and well-documented

**Cons:**

- Heavy dependency (50+ transitive deps)
- Opinionated API not needed for raw SQL
- Harder to understand for simple use cases

**Decision:** Rejected. We want a thin wrapper over raw SQL, not a query builder.

---

### Using Prisma

**Pros:**

- Type-safe query API
- Automatic migration generation from schema
- Excellent TypeScript support

**Cons:**

- Requires code generation step
- Heavy runtime + CLI tooling
- Opinionated ORM approach

**Decision:** Rejected. Code generation adds complexity, and we prefer raw SQL control.

---

### Manual retry logic in calling code

**Pros:**

- More control per use case

**Cons:**

- Duplicate retry logic across services
- Easy to forget or implement incorrectly

**Decision:** Rejected. Retry logic should be baked into the connection layer.

---

## Risks and Mitigations

### Risk 1: SQLite locking issues in concurrent scenarios

**Impact:** `SQLITE_BUSY` errors under heavy write load
**Mitigation:**

- Document SQLite limitations (not suitable for high-concurrency production)
- Recommend PostgreSQL for production workloads
- Implement retry logic with exponential backoff for `SQLITE_BUSY`

---

### Risk 2: PostgreSQL connection pool exhaustion

**Impact:** Connections refused when pool is full
**Mitigation:**

- Default pool size: 10 connections
- Allow configuration via connection string query param (`?max=20`)
- Implement connection timeout (5s default)
- Retry transient connection errors

---

### Risk 3: Migration conflicts in multi-developer scenarios

**Impact:** Two developers create `005_*.sql` simultaneously
**Mitigation:**

- Use timestamp prefixes instead of sequential numbers (future improvement)
- Document migration naming conventions in README
- Code review should catch duplicate numbers before merge

---

### Risk 4: Secrets in connection strings (security)

**Impact:** Database passwords exposed in logs or source code
**Mitigation:**

- Document use of environment variables in README
- Provide `.env.example` template
- Never log full connection strings (mask passwords)
- Security review should catch hardcoded credentials

---

## Rollback Plan

If the abstraction proves insufficient:

1. **Switch to Knex.js:** Minimal API change (wrap raw SQL calls in `knex.raw()`)
2. **Add query builder:** Extend interface without breaking existing raw SQL usage
3. **Migrate to ORM:** Replace `db-simple` with Prisma or TypeORM (breaking change)

**Estimated effort:** 1-2 days for Knex migration, 3-5 days for full ORM migration

---

## Success Metrics

1. **Test performance:** SQLite in-memory tests complete in < 100ms per suite
2. **Connection reliability:** 99.9% successful connections (with retries) in production
3. **Migration safety:** Zero data loss incidents from migrations (verified via backups)
4. **Developer experience:** Developers can add migrations without reading docs (self-explanatory)

---

## References

- [better-sqlite3 Documentation](https://github.com/WiseLibs/better-sqlite3)
- [node-postgres (pg) Documentation](https://node-postgres.com/)
- [PostgreSQL Connection URIs](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING)
- [SQLite URI Filenames](https://www.sqlite.org/uri.html)

---

## Changelog

- **2025-09-29:** Initial ADR created (Phase 51, Shard C1)
