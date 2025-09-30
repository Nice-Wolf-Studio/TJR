# @tjr-suite/db-simple

Minimal database connection and migration runner for SQLite and PostgreSQL.

## Features

- **Dual driver support:** SQLite (better-sqlite3) and PostgreSQL (pg)
- **Simple migration system:** File-based SQL migrations with automatic tracking
- **Connection abstraction:** Unified async interface for both databases
- **Retry logic:** Built-in exponential backoff for transient errors
- **Logger injection:** Plug in your own logger (Winston, Pino, console, etc.)
- **Zero ORM overhead:** Raw SQL only, no query builders

## Installation

```bash
pnpm add @tjr-suite/db-simple
```

## Usage

### Connect to a database

```typescript
import { connect } from '@tjr-suite/db-simple'

// SQLite in-memory (great for testing)
const db = await connect('sqlite::memory:')

// SQLite file
const db = await connect('sqlite:data/app.db')

// PostgreSQL
const db = await connect('postgresql://user:pass@localhost:5432/mydb')
```

### Execute queries

```typescript
// DDL/DML without results
await db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
await db.exec('INSERT INTO users (name) VALUES (?)', ['Alice'])

// SELECT queries with results
const users = await db.query('SELECT * FROM users')
console.log(users) // [{ id: 1, name: 'Alice' }]

// Close connection when done
await db.close()
```

### Run migrations

```typescript
import { connect, runMigrations } from '@tjr-suite/db-simple'

const db = await connect('sqlite:data/app.db')

// Apply all pending migrations from directory
await runMigrations('./migrations', db)

await db.close()
```

**Migration file format:**

Create SQL files in your migrations directory with sequential naming:

```
migrations/
  001_create_users.sql
  002_add_posts.sql
  003_add_indexes.sql
```

Example migration (`001_create_users.sql`):

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_email ON users(email);
```

### Logger injection

```typescript
import { connect, runMigrations } from '@tjr-suite/db-simple'

const logger = {
  info: (msg, meta) => console.log(`[INFO] ${msg}`, meta),
  error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta),
}

const db = await connect('sqlite:data/app.db', { logger })
await runMigrations('./migrations', db, { logger })
```

## API Reference

### `connect(databaseUrl, options?)`

Connect to a database and return a `DbConnection` instance.

**Parameters:**
- `databaseUrl` (string): Connection string
  - SQLite: `sqlite:path/to/db.db` or `sqlite::memory:`
  - PostgreSQL: `postgresql://user:pass@host:port/database`
- `options` (optional):
  - `logger`: Custom logger conforming to `{ info(), error() }`
  - `retry`: Retry configuration for transient errors
    - `maxRetries` (default: 3)
    - `initialDelayMs` (default: 100)
    - `backoffMultiplier` (default: 2)
    - `jitterPercent` (default: 25)

**Returns:** `Promise<DbConnection>`

---

### `DbConnection`

Unified database interface.

**Methods:**
- `exec(sql, params?)`: Execute SQL without returning results (DDL, INSERT, UPDATE, DELETE)
- `query<T>(sql, params?)`: Execute SQL and return results (SELECT)
- `close()`: Close the database connection

---

### `runMigrations(migrationsDir, db, options?)`

Run all pending migrations from a directory.

**Parameters:**
- `migrationsDir` (string): Path to directory containing `*.sql` migration files
- `db` (DbConnection): Database connection instance
- `options` (optional):
  - `logger`: Custom logger conforming to `{ info(), error() }`

**Returns:** `Promise<void>`

**Behavior:**
- Scans directory for `*.sql` files
- Sorts files lexicographically (use `001_`, `002_`, etc. prefixes)
- Applies migrations that are not yet recorded in `_migrations` table
- Each migration runs in a transaction (atomicity guaranteed)
- Logs each applied migration (if logger provided)

## Caveats and Limitations

### SQLite

- **Not suitable for high-concurrency production:** SQLite locks the entire database on writes. Use PostgreSQL for production workloads with concurrent writes.
- **No built-in replication:** For distributed systems, use PostgreSQL.
- **Synchronous API:** Internally synchronous (via better-sqlite3), but wrapped in promises for consistency.

### PostgreSQL

- **Connection pooling:** Uses `pg.Pool` with default max 10 connections. Configure via connection string query params (`?max=20`).
- **No transaction helpers:** You must manage transactions manually (`BEGIN`, `COMMIT`, `ROLLBACK`).

### Migrations

- **Forward-only:** No down migrations. Rollbacks must be handled manually or via separate scripts.
- **No conflict detection:** If two developers create `005_*.sql` simultaneously, you'll have a naming conflict. Consider timestamp prefixes for large teams.
- **Lexicographic order:** Files applied in alphabetical order. Use zero-padded numbers (`001`, `002`, ..., `099`, `100`).

### Security

- **Never hardcode credentials:** Use environment variables (see `.env.example` in repo root).
- **Connection strings are logged (masked):** Passwords are masked in logs, but be cautious with custom loggers.
- **No SQL injection protection beyond parameterization:** Always use parameterized queries (`?` placeholders), never string concatenation.

## Testing

```bash
# Run tests (requires build first)
pnpm build
pnpm test
```

Tests use SQLite in-memory databases for fast, isolated execution.

## License

UNLICENSED

## See Also

- [ADR-0057: DB-simple connectors & migrator](../../docs/adr/ADR-0057-db-simple.md) - Architecture decision record