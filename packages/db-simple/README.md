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

**Properties:**
- `dbType`: Database type (`'sqlite'` or `'postgres'`)

**Methods:**
- `exec(sql, params?)`: Execute SQL without returning results (DDL, INSERT, UPDATE, DELETE)
- `query<T>(sql, params?)`: Execute SQL and return results (SELECT)
- `transaction<T>(fn)`: Execute a function within a transaction. Automatically commits on success, rolls back on error
- `close()`: Close the database connection

**Example transaction usage:**
```typescript
await db.transaction(async (txDb) => {
  await txDb.exec('INSERT INTO accounts (balance) VALUES ($1)', [100])
  await txDb.exec('INSERT INTO transactions (amount) VALUES ($1)', [100])
  // Automatically commits if both succeed, rolls back if either fails
})
```

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
- **Transaction support:** Use `db.transaction(async (txDb) => { ... })` for atomic operations with automatic commit/rollback.

### Migrations

- **Forward-only:** No down migrations. Rollbacks must be handled manually or via separate scripts.
- **No conflict detection:** If two developers create `005_*.sql` simultaneously, you'll have a naming conflict. Consider timestamp prefixes for large teams.
- **Lexicographic order:** Files applied in alphabetical order. Use zero-padded numbers (`001`, `002`, ..., `099`, `100`).

### Security

#### Credential Management
- **Never hardcode credentials:** Use environment variables (see `.env.example` in repo root)
- **Connection strings are logged (masked):** Passwords are masked in logs, but be cautious with custom loggers
- **Protect connection strings:** Ensure `.env` files are in `.gitignore` and never committed to version control

#### SQL Injection Protection
- **Always use parameterized queries:** This package uses parameterized queries to prevent SQL injection
- **SQLite uses `?` placeholders:** `db.exec('SELECT * FROM users WHERE id = ?', [userId])`
- **PostgreSQL uses `$1, $2, ...` placeholders:** `db.exec('SELECT * FROM users WHERE id = $1', [userId])`
- **Never concatenate user input into SQL:** ❌ `db.exec(\`SELECT * FROM users WHERE name = '\${name}'\`)` (VULNERABLE!)
- **Migration files are raw SQL:** Be extremely careful with dynamic migration generation. Migrations should be static files, not user-generated content

#### Database-Specific Security Considerations

**SQLite:**
- **File permissions:** Ensure database files have appropriate Unix permissions (e.g., `chmod 600 data.db`)
- **Single-user environments:** SQLite is best for single-process applications. No built-in user/role management
- **In-memory databases:** Data is lost on process exit. Not suitable for persistent data

**PostgreSQL:**
- **Use roles and permissions:** Create application-specific roles with minimal privileges
- **Enable SSL/TLS:** Use `?sslmode=require` in connection string for encrypted connections
- **Connection pooling limits:** Set appropriate `max` connection limits to prevent resource exhaustion
- **Network security:** Use firewalls to restrict PostgreSQL port (5432) access. Never expose to public internet without VPN/bastion

#### Migration Security
- **Review migrations before deployment:** Migrations run with full database privileges. Audit all SQL before applying
- **Use transactions:** All migrations in this package run in transactions. Failures automatically rollback
- **Avoid destructive migrations in production:** Be cautious with `DROP TABLE`, `DELETE FROM`, etc. Test in staging first
- **Migration file integrity:** Store migrations in version control. Use code review for all migration changes

#### General Best Practices
- **Principle of least privilege:** Grant only the minimum permissions needed for the application
- **Audit logging:** Use a logger to track all database operations for security incident investigation
- **Dependency updates:** Keep `better-sqlite3` and `pg` updated for security patches
- **Backup before migrations:** Always backup production databases before running migrations

## Testing

```bash
# Build the package
pnpm build

# Run SQLite tests (fast, no external dependencies)
pnpm test

# Run PostgreSQL tests (requires TEST_POSTGRES_URL environment variable)
export TEST_POSTGRES_URL=postgresql://user:pass@localhost:5432/testdb
pnpm test:pg

# Run all tests (SQLite + PostgreSQL)
pnpm test:all
```

**Testing details:**
- SQLite tests use in-memory databases for fast, isolated execution
- PostgreSQL tests require a running PostgreSQL instance (set `TEST_POSTGRES_URL`)
- PostgreSQL tests include transaction rollback, constraint violations, and database-specific schema validation

## License

UNLICENSED

## See Also

- [ADR-0057: DB-simple connectors & migrator](../../docs/adr/ADR-0057-db-simple.md) - Architecture decision record