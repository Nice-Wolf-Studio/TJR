/**
 * Database connection abstraction for SQLite and PostgreSQL
 */

import Database from 'better-sqlite3'
import pg from 'pg'

/**
 * Minimal logger interface for dependency injection
 */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

/**
 * Silent no-op logger (default when none provided)
 */
const noopLogger: Logger = {
  info: () => {},
  error: () => {},
}

/**
 * Unified database connection interface
 */
export interface DbConnection {
  /**
   * Execute SQL without returning results (DDL, INSERT, UPDATE, DELETE)
   */
  exec(sql: string, params?: unknown[]): Promise<void>

  /**
   * Execute SQL and return results (SELECT)
   */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>

  /**
   * Close the database connection
   */
  close(): Promise<void>
}

/**
 * Configuration options for database connection
 */
export interface ConnectOptions {
  logger?: Logger
  /**
   * Retry configuration (applied to transient errors)
   */
  retry?: {
    maxRetries?: number
    initialDelayMs?: number
    backoffMultiplier?: number
    jitterPercent?: number
  }
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY = {
  maxRetries: 3,
  initialDelayMs: 100,
  backoffMultiplier: 2,
  jitterPercent: 25,
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Apply jitter to delay (±jitterPercent%)
 */
function applyJitter(delayMs: number, jitterPercent: number): number {
  const jitter = delayMs * (jitterPercent / 100)
  return delayMs + (Math.random() * 2 - 1) * jitter
}

/**
 * Check if error is retryable
 */
function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false

  const error = err as Record<string, unknown>

  // PostgreSQL errors
  if (error['code'] === 'ECONNREFUSED') return true
  if (error['code'] === 'ETIMEDOUT') return true
  if (error['code'] === 'ENOTFOUND') return true
  if (error['code'] === '53300') return true // too_many_connections

  // SQLite errors
  const message = String(error['message'] || '')
  if (message.includes('SQLITE_BUSY')) return true
  if (message.includes('SQLITE_LOCKED')) return true

  return false
}

/**
 * Retry wrapper for functions
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: ConnectOptions,
  operation: string
): Promise<T> {
  const retry = { ...DEFAULT_RETRY, ...options.retry }
  const logger = options.logger || noopLogger
  let lastError: unknown

  for (let attempt = 0; attempt <= retry.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err

      if (!isRetryableError(err) || attempt === retry.maxRetries) {
        throw err
      }

      const baseDelay = retry.initialDelayMs * Math.pow(retry.backoffMultiplier, attempt)
      const delayMs = applyJitter(baseDelay, retry.jitterPercent)

      logger.info(`Retrying ${operation} after transient error`, {
        attempt: attempt + 1,
        maxRetries: retry.maxRetries,
        delayMs: Math.round(delayMs),
        error: String(err),
      })

      await sleep(delayMs)
    }
  }

  throw lastError
}

/**
 * SQLite connection wrapper
 */
class SqliteConnection implements DbConnection {
  constructor(
    private db: Database.Database,
    private logger: Logger
  ) {}

  async exec(sql: string, params: unknown[] = []): Promise<void> {
    const stmt = this.db.prepare(sql)
    stmt.run(...params)
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql)
    return stmt.all(...params) as T[]
  }

  async close(): Promise<void> {
    this.db.close()
    this.logger.info('SQLite connection closed')
  }
}

/**
 * PostgreSQL connection wrapper
 */
class PostgresConnection implements DbConnection {
  constructor(
    private pool: pg.Pool,
    private logger: Logger
  ) {}

  async exec(sql: string, params: unknown[] = []): Promise<void> {
    await this.pool.query(sql, params)
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query(sql, params)
    return result.rows as T[]
  }

  async close(): Promise<void> {
    await this.pool.end()
    this.logger.info('PostgreSQL connection pool closed')
  }
}

/**
 * Parse connection string and return database type and config
 */
function parseConnectionString(databaseUrl: string): {
  type: 'sqlite' | 'postgres'
  config: string
} {
  if (databaseUrl.startsWith('sqlite:')) {
    const path = databaseUrl.replace(/^sqlite:/, '')
    return { type: 'sqlite', config: path }
  }

  if (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')) {
    return { type: 'postgres', config: databaseUrl }
  }

  // Default to SQLite for file paths
  if (databaseUrl.includes('.db') || databaseUrl.includes('.sqlite')) {
    return { type: 'sqlite', config: databaseUrl }
  }

  throw new Error(
    `Unsupported database URL format: ${databaseUrl}. ` +
      `Expected sqlite:path/to/db.db or postgresql://...`
  )
}

/**
 * Connect to a database (SQLite or PostgreSQL)
 *
 * @param databaseUrl - Connection string (e.g., "sqlite:test.db" or "postgresql://...")
 * @param options - Connection options (logger, retry config)
 * @returns DbConnection instance
 *
 * @example
 * // SQLite
 * const db = await connect('sqlite::memory:')
 * const db = await connect('sqlite:data/app.db')
 *
 * // PostgreSQL
 * const db = await connect('postgresql://user:pass@localhost:5432/mydb')
 */
export async function connect(
  databaseUrl: string,
  options: ConnectOptions = {}
): Promise<DbConnection> {
  const logger = options.logger || noopLogger
  const { type, config } = parseConnectionString(databaseUrl)

  return withRetry(
    async () => {
      if (type === 'sqlite') {
        logger.info('Connecting to SQLite', { path: config })
        const db = new Database(config)
        return new SqliteConnection(db, logger)
      } else {
        logger.info('Connecting to PostgreSQL', { url: databaseUrl.replace(/:[^:@]+@/, ':***@') })
        const pool = new pg.Pool({ connectionString: config })
        // Test connection
        await pool.query('SELECT 1')
        return new PostgresConnection(pool, logger)
      }
    },
    options,
    'database connection'
  )
}