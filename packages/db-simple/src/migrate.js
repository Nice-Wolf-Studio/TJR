'use strict';
/**
 * Simple file-based migration runner
 */
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, '__esModule', { value: true });
exports.runMigrations = runMigrations;
const fs = __importStar(require('node:fs'));
const path = __importStar(require('node:path'));
/**
 * Silent no-op logger (default when none provided)
 */
const noopLogger = {
  info: () => {},
  error: () => {},
};
/**
 * Ensure migrations table exists
 * Uses database-specific SQL for compatibility
 */
async function ensureMigrationsTable(db) {
  if (db.dbType === 'sqlite') {
    // SQLite syntax
    await db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT DEFAULT (datetime('now'))
      )
    `);
  } else {
    // PostgreSQL syntax
    await db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
}
/**
 * Get list of applied migrations
 */
async function getAppliedMigrations(db) {
  const rows = await db.query('SELECT name FROM _migrations ORDER BY id');
  return new Set(rows.map((r) => r.name));
}
/**
 * Read migration files from directory
 * Enhanced error handling for file I/O operations
 */
function readMigrationFiles(migrationsDir) {
  // Check directory exists
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }
  // Check directory is readable
  let files;
  try {
    files = fs.readdirSync(migrationsDir);
  } catch (error) {
    throw new Error(
      `Failed to read migrations directory: ${migrationsDir}. Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  // Filter and sort migration files
  const sqlFiles = files.filter((file) => file.endsWith('.sql')).sort();
  if (sqlFiles.length === 0) {
    throw new Error(`No .sql migration files found in: ${migrationsDir}`);
  }
  // Read each migration file with error handling
  return sqlFiles.map((file) => {
    const filePath = path.join(migrationsDir, file);
    try {
      const sql = fs.readFileSync(filePath, 'utf-8');
      if (sql.trim().length === 0) {
        throw new Error(`Migration file is empty: ${file}`);
      }
      return { name: file, sql };
    } catch (error) {
      throw new Error(
        `Failed to read migration file: ${file}. Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}
/**
 * Apply a single migration
 * Wraps migration in transaction for atomicity
 */
async function applyMigration(db, migration, logger) {
  logger.info('Applying migration', { name: migration.name });
  await db.transaction(async (txDb) => {
    // Execute migration SQL
    await txDb.exec(migration.sql);
    // Record migration
    await txDb.exec('INSERT INTO _migrations (name) VALUES (?)', [migration.name]);
  });
  logger.info('Migration applied', { name: migration.name });
}
/**
 * Run migrations from a directory
 *
 * @param migrationsDir - Path to directory containing *.sql migration files
 * @param db - Database connection
 * @param options - Migration options (logger)
 *
 * @example
 * const db = await connect('sqlite::memory:')
 * await runMigrations('./migrations', db)
 * await db.close()
 */
async function runMigrations(migrationsDir, db, options = {}) {
  const logger = options.logger || noopLogger;
  logger.info('Starting migrations', { dir: migrationsDir });
  // Ensure metadata table exists
  await ensureMigrationsTable(db);
  // Get already-applied migrations
  const applied = await getAppliedMigrations(db);
  // Read migration files
  const migrations = readMigrationFiles(migrationsDir);
  // Filter to pending migrations
  const pending = migrations.filter((m) => !applied.has(m.name));
  if (pending.length === 0) {
    logger.info('No pending migrations');
    return;
  }
  logger.info('Found pending migrations', { count: pending.length });
  // Apply each pending migration
  for (const migration of pending) {
    await applyMigration(db, migration, logger);
  }
  logger.info('All migrations applied', { total: migrations.length, applied: pending.length });
}
//# sourceMappingURL=migrate.js.map
