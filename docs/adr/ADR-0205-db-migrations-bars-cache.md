# ADR-0205: Database Migrations for bars_cache Table

**Status:** Accepted
**Date:** 2025-09-30
**Deciders:** Architecture Team
**Phase:** 2
**Shard:** C1

---

## Context

The TJR Suite requires persistent storage for historical bar data (OHLC - Open, High, Low, Close) from multiple market data providers. This data is needed by:

1. **bars-cache package (Issue #23):** Fast access to historical bar data without repeated API calls
2. **Analysis components:** Technical indicator calculations requiring historical price series
3. **Backtesting systems:** Historical data for strategy validation

Key requirements:

- Support multiple data providers (with provider priority for merging)
- Handle bar revisions/corrections (providers sometimes update historical data)
- Store bars across multiple timeframes (1m, 5m, 1h, 1d, etc.)
- Fast queries by symbol, timeframe, and time range
- Support both SQLite (development/testing) and PostgreSQL (production)

Without a standardized migration approach for the bars_cache table:

- Schema inconsistencies between development and production
- Manual schema updates prone to errors
- No rollback capability
- Difficult to track schema evolution over time

---

## Decision

### 1. **Schema Design: bars_cache Table**

We will create a `bars_cache` table with the following structure:

**Core columns:**

- `symbol` (TEXT): Asset symbol (e.g., "AAPL", "BTCUSD")
- `provider` (TEXT): Data provider identifier (e.g., "alpaca", "polygon")
- `timeframe` (TEXT): Bar timeframe (e.g., "1m", "5m", "1h", "1d")
- `timestamp` (INTEGER): Bar timestamp in epoch milliseconds (UTC)
- `open` (REAL): Opening price
- `high` (REAL): Highest price in timeframe
- `low` (REAL): Lowest price in timeframe
- `close` (REAL): Closing price
- `volume` (REAL): Trading volume

**Metadata columns:**

- `revision` (INTEGER): Revision number for corrections (default: 0)
- `providerPriority` (INTEGER): Priority for merge handling (lower = higher priority)
- `insertedAt` (INTEGER): Record insertion timestamp in epoch milliseconds

**Primary key:**

- Composite: `(symbol, provider, timeframe, timestamp)`

**Indexes:**

- `idx_bars_cache_lookup`: `(symbol, timeframe, timestamp)` for range queries
- `idx_bars_cache_provider`: `(provider, symbol)` for provider-specific queries

**Rationale:**

- **INTEGER timestamps:** Epoch milliseconds provide timezone-neutral storage and efficient comparisons
- **REAL for prices:** Sufficient precision for financial data (double-precision floating point)
- **Composite primary key:** Ensures uniqueness per (symbol, provider, timeframe, timestamp)
- **revision field:** Allows tracking data corrections without losing history
- **providerPriority:** Enables intelligent merging when multiple providers have the same bar

---

### 2. **Migration File Organization**

Create separate migration files for SQLite and PostgreSQL due to syntax differences:

```
packages/db-simple/migrations/
├── sqlite/
│   └── 001_create_bars_cache_sqlite.sql
├── postgres/
│   └── 001_create_bars_cache_postgres.sql
└── rollback/
    └── 001_rollback_bars_cache.sql
```

**Directory structure rationale:**

- **Separate directories:** SQLite and PostgreSQL have different SQL syntax (AUTOINCREMENT vs SERIAL, etc.)
- **Unified rollback:** Rollback logic is often database-agnostic (just DROP statements)
- **Sequential numbering:** `001_`, `002_`, etc. ensures lexicographic ordering
- **Descriptive names:** `create_bars_cache` clearly indicates purpose

---

### 3. **SQLite-Specific Migration**

**File:** `packages/db-simple/migrations/sqlite/001_create_bars_cache_sqlite.sql`

Key differences from PostgreSQL:

- Use `INTEGER PRIMARY KEY` (maps to ROWID)
- Use `datetime('now')` for default timestamps
- CREATE INDEX syntax identical to PostgreSQL

**Idempotency:**

- Use `CREATE TABLE IF NOT EXISTS` to allow safe re-runs
- Use `CREATE INDEX IF NOT EXISTS` to prevent errors on re-application

---

### 4. **PostgreSQL-Specific Migration**

**File:** `packages/db-simple/migrations/postgres/001_create_bars_cache_postgres.sql`

Key differences from SQLite:

- Use `BIGINT` for 64-bit integer timestamps
- Use `DOUBLE PRECISION` instead of `REAL` for better precision
- Use `CURRENT_TIMESTAMP` for default timestamps (stored as epoch via extract)
- Use `ON CONFLICT DO NOTHING` for upsert patterns (future enhancement)

**Performance considerations:**

- Create indexes CONCURRENTLY in production (manual operation)
- Consider partitioning by timeframe for very large datasets (future enhancement)

---

### 5. **Rollback Script**

**File:** `packages/db-simple/migrations/rollback/001_rollback_bars_cache.sql`

**Contents:**

```sql
DROP TABLE IF EXISTS bars_cache;
DROP INDEX IF EXISTS idx_bars_cache_lookup;
DROP INDEX IF EXISTS idx_bars_cache_provider;
```

**Rationale:**

- Simple DROP statements work on both SQLite and PostgreSQL
- Use `IF EXISTS` to prevent errors if table already dropped
- Drop indexes explicitly for clarity (some databases auto-drop with table)

**⚠️ Warning:**

- Rollbacks are destructive and should only be used in development or with backups
- Production rollbacks require careful planning and data migration

---

### 6. **CLI Migration Scripts**

Add to `packages/db-simple/package.json`:

```json
{
  "scripts": {
    "migrate:sqlite": "node -e \"require('./dist/index.js').connect('sqlite:data/app.db').then(db => require('./dist/index.js').runMigrations('./migrations/sqlite', db))\"",
    "migrate:postgres": "node -e \"require('./dist/index.js').connect(process.env.DATABASE_URL).then(db => require('./dist/index.js').runMigrations('./migrations/postgres', db))\"",
    "migrate:test": "node --test tests/bars-cache-migration.test.js"
  }
}
```

**Usage:**

```bash
# SQLite migration (development)
pnpm --filter @tjr-suite/db-simple migrate:sqlite

# PostgreSQL migration (production)
DATABASE_URL=postgresql://... pnpm --filter @tjr-suite/db-simple migrate:postgres

# Run migration tests
pnpm --filter @tjr-suite/db-simple migrate:test
```

**Rationale:**

- Keep migrations close to the package that defines the schema
- Use environment variables for production credentials
- Provide test script for CI/CD validation

---

### 7. **Testing Strategy**

Create `packages/db-simple/tests/bars-cache-migration.test.js` covering:

1. **Schema creation:** Verify table exists after migration
2. **Idempotency:** Re-running migration doesn't fail or duplicate data
3. **Index creation:** Verify indexes exist and are functional
4. **Data insertion:** Insert sample bars and verify retrieval
5. **Constraint validation:** Ensure primary key prevents duplicates
6. **Performance:** Query performance with indexes vs without

**Test databases:**

- Use SQLite in-memory (`:memory:`) for fast, isolated tests
- Optional PostgreSQL tests if `TEST_POSTGRES_URL` environment variable set

---

## Alternatives Considered

### Using ORM Migrations (Prisma, TypeORM)

**Pros:**

- Automatic migration generation from schema models
- Type-safe database access
- Built-in versioning and rollback

**Cons:**

- Requires learning ORM-specific DSL
- Code generation adds build complexity
- Opaque SQL (harder to review and optimize)
- Heavy dependencies

**Decision:** Rejected. Raw SQL migrations provide maximum control and transparency.

---

### Single Migration File for Both Databases

**Pros:**

- Simpler directory structure
- Less duplication

**Cons:**

- SQLite and PostgreSQL have significant syntax differences
- Conditional logic in SQL is fragile and hard to read
- Error-prone to maintain

**Decision:** Rejected. Separate files improve clarity and maintainability.

---

### Storing Timestamps as ISO 8601 Strings

**Pros:**

- Human-readable in database browser tools
- No timezone ambiguity with 'Z' suffix

**Cons:**

- Slower comparisons (string vs integer)
- Larger storage footprint (20 bytes vs 8 bytes)
- More complex range queries

**Decision:** Rejected. Integer epoch milliseconds are faster and more compact.

---

### Using DECIMAL/NUMERIC for Prices

**Pros:**

- Exact decimal representation (no floating point rounding)
- Better for financial calculations requiring exact precision

**Cons:**

- Slower arithmetic operations
- Overkill for cached bar data (exact precision not critical)
- More complex aggregation queries

**Decision:** Rejected. REAL/DOUBLE PRECISION sufficient for cached bar data. Exact precision should be handled at application layer if needed.

---

## Risks and Mitigations

### Risk 1: Large Data Volume (Millions of Bars)

**Impact:** Slow queries, index bloat, disk space exhaustion

**Mitigation:**

- Create appropriate indexes on query patterns
- Consider partitioning by timeframe or date range (PostgreSQL)
- Implement data retention policies (archive old bars)
- Monitor disk usage and query performance

---

### Risk 2: Provider Data Inconsistencies

**Impact:** Duplicate bars, incorrect revisions, merge conflicts

**Mitigation:**

- Use composite primary key to prevent duplicates
- Implement revision tracking for corrections
- Document provider priority conventions
- Add validation logic in bars-cache package

---

### Risk 3: Schema Evolution (Future Changes)

**Impact:** Migration conflicts, breaking changes to dependent packages

**Mitigation:**

- Use sequential migration numbering (002*, 003*, etc.)
- Never modify existing migrations (create new ones instead)
- Document breaking changes in ADRs
- Version API contracts separately from schema

---

### Risk 4: Migration Failures in Production

**Impact:** Partial schema updates, data loss, downtime

**Mitigation:**

- Always backup before migrations
- Test migrations in staging first
- Use transactions (automatic in db-simple)
- Provide rollback scripts
- Monitor migration logs

---

## Rollback Plan

If schema proves inadequate:

1. **Add columns:** Create `002_alter_bars_cache.sql` (non-breaking)
2. **Change indexes:** Drop and recreate with new columns
3. **Major restructure:** Create new table, migrate data, rename (breaking change)

**Estimated effort:** 2-4 hours for minor changes, 1-2 days for major restructure

---

## Success Metrics

1. **Migration speed:** < 1 second for empty database, < 10 seconds for 1M rows
2. **Query performance:** Range queries on indexed columns < 50ms for 10K rows
3. **Test coverage:** 100% of migration logic covered by automated tests
4. **Zero data loss:** All production migrations complete successfully with backups

---

## References

- [ADR-0057: DB-simple connectors & migrator](./ADR-0057-db-simple.md)
- [SQLite Data Types](https://www.sqlite.org/datatype3.html)
- [PostgreSQL Data Types](https://www.postgresql.org/docs/current/datatype.html)
- [Issue #23: bars-cache package](https://github.com/tjr-suite/tjr-suite/issues/23)
- [Issue #24: Database migration infrastructure](https://github.com/tjr-suite/tjr-suite/issues/24)

---

## Changelog

- **2025-09-30:** Initial ADR created (Phase 2, Shard C1)
