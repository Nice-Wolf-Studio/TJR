/**
 * Simple file-based migration runner
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { DbConnection, Logger } from './connect.js'

/**
 * Silent no-op logger (default when none provided)
 */
const noopLogger: Logger = {
  info: () => {},
  error: () => {},
}

/**
 * Migration metadata
 */
interface Migration {
  name: string
  sql: string
}

/**
 * Migration runner options
 */
export interface MigrateOptions {
  logger?: Logger
}

/**
 * Ensure migrations table exists
 */
async function ensureMigrationsTable(db: DbConnection): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `)
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations(db: DbConnection): Promise<Set<string>> {
  const rows = await db.query<{ name: string }>('SELECT name FROM _migrations ORDER BY id')
  return new Set(rows.map((r) => r.name))
}

/**
 * Read migration files from directory
 */
function readMigrationFiles(migrationsDir: string): Migration[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`)
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort() // Lexicographic sort ensures NNN_name.sql order

  return files.map((file) => ({
    name: file,
    sql: fs.readFileSync(path.join(migrationsDir, file), 'utf-8'),
  }))
}

/**
 * Apply a single migration
 */
async function applyMigration(db: DbConnection, migration: Migration, logger: Logger): Promise<void> {
  logger.info('Applying migration', { name: migration.name })

  // Execute migration SQL
  await db.exec(migration.sql)

  // Record migration
  await db.exec('INSERT INTO _migrations (name) VALUES (?)', [migration.name])

  logger.info('Migration applied', { name: migration.name })
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
export async function runMigrations(
  migrationsDir: string,
  db: DbConnection,
  options: MigrateOptions = {}
): Promise<void> {
  const logger = options.logger || noopLogger

  logger.info('Starting migrations', { dir: migrationsDir })

  // Ensure metadata table exists
  await ensureMigrationsTable(db)

  // Get already-applied migrations
  const applied = await getAppliedMigrations(db)

  // Read migration files
  const migrations = readMigrationFiles(migrationsDir)

  // Filter to pending migrations
  const pending = migrations.filter((m) => !applied.has(m.name))

  if (pending.length === 0) {
    logger.info('No pending migrations')
    return
  }

  logger.info('Found pending migrations', { count: pending.length })

  // Apply each pending migration
  for (const migration of pending) {
    await applyMigration(db, migration, logger)
  }

  logger.info('All migrations applied', { total: migrations.length, applied: pending.length })
}