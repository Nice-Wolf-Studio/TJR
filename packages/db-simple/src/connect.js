"use strict";
/**
 * Database connection abstraction for SQLite and PostgreSQL
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connect = connect;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const pg_1 = __importDefault(require("pg"));
/**
 * Silent no-op logger (default when none provided)
 */
const noopLogger = {
    info: () => { },
    error: () => { },
};
/**
 * Default retry configuration
 */
const DEFAULT_RETRY = {
    maxRetries: 3,
    initialDelayMs: 100,
    backoffMultiplier: 2,
    jitterPercent: 25,
};
/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Apply jitter to delay (±jitterPercent%)
 */
function applyJitter(delayMs, jitterPercent) {
    const jitter = delayMs * (jitterPercent / 100);
    return delayMs + (Math.random() * 2 - 1) * jitter;
}
/**
 * Check if error is retryable
 */
function isRetryableError(err) {
    if (!err || typeof err !== 'object')
        return false;
    const error = err;
    // PostgreSQL errors
    if (error['code'] === 'ECONNREFUSED')
        return true;
    if (error['code'] === 'ETIMEDOUT')
        return true;
    if (error['code'] === 'ENOTFOUND')
        return true;
    if (error['code'] === '53300')
        return true; // too_many_connections
    // SQLite errors
    const message = String(error['message'] || '');
    if (message.includes('SQLITE_BUSY'))
        return true;
    if (message.includes('SQLITE_LOCKED'))
        return true;
    return false;
}
/**
 * Retry wrapper for functions
 */
async function withRetry(fn, options, operation) {
    const retry = { ...DEFAULT_RETRY, ...options.retry };
    const logger = options.logger || noopLogger;
    let lastError;
    for (let attempt = 0; attempt <= retry.maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastError = err;
            if (!isRetryableError(err) || attempt === retry.maxRetries) {
                throw err;
            }
            const baseDelay = retry.initialDelayMs * Math.pow(retry.backoffMultiplier, attempt);
            const delayMs = applyJitter(baseDelay, retry.jitterPercent);
            logger.info(`Retrying ${operation} after transient error`, {
                attempt: attempt + 1,
                maxRetries: retry.maxRetries,
                delayMs: Math.round(delayMs),
                error: String(err),
            });
            await sleep(delayMs);
        }
    }
    throw lastError;
}
/**
 * SQLite connection wrapper
 */
class SqliteConnection {
    db;
    logger;
    dbType = 'sqlite';
    constructor(db, logger) {
        this.db = db;
        this.logger = logger;
    }
    async exec(sql, params = []) {
        // If params provided, use prepared statement (single statement only)
        if (params.length > 0) {
            const stmt = this.db.prepare(sql);
            stmt.run(...params);
            return;
        }
        // If no params, check if SQL contains multiple statements
        // Split by semicolon and execute each statement separately
        const statements = sql
            .split(';')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        if (statements.length > 1) {
            // Multiple statements - execute using db.exec (unprepared)
            this.db.exec(sql);
        }
        else {
            // Single statement - use prepared statement for consistency
            const stmt = this.db.prepare(sql);
            stmt.run();
        }
    }
    async query(sql, params = []) {
        const stmt = this.db.prepare(sql);
        return stmt.all(...params);
    }
    async transaction(fn) {
        this.logger.info('Starting SQLite transaction');
        this.db.exec('BEGIN');
        try {
            const result = await fn(this);
            this.db.exec('COMMIT');
            this.logger.info('SQLite transaction committed');
            return result;
        }
        catch (error) {
            this.db.exec('ROLLBACK');
            this.logger.error('SQLite transaction rolled back', { error: String(error) });
            throw error;
        }
    }
    async close() {
        this.db.close();
        this.logger.info('SQLite connection closed');
    }
}
/**
 * PostgreSQL connection wrapper
 */
class PostgresConnection {
    pool;
    logger;
    client;
    dbType = 'postgres';
    constructor(pool, logger, client) {
        this.pool = pool;
        this.logger = logger;
        this.client = client;
    }
    async exec(sql, params = []) {
        if (this.client) {
            // Use existing client (within transaction)
            await this.client.query(sql, params);
        }
        else {
            // Use pool
            await this.pool.query(sql, params);
        }
    }
    async query(sql, params = []) {
        if (this.client) {
            // Use existing client (within transaction)
            const result = await this.client.query(sql, params);
            return result.rows;
        }
        else {
            // Use pool
            const result = await this.pool.query(sql, params);
            return result.rows;
        }
    }
    async transaction(fn) {
        this.logger.info('Starting PostgreSQL transaction');
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            // Create a new connection instance that uses this client
            const txConnection = new PostgresConnection(this.pool, this.logger, client);
            const result = await fn(txConnection);
            await client.query('COMMIT');
            this.logger.info('PostgreSQL transaction committed');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            this.logger.error('PostgreSQL transaction rolled back', { error: String(error) });
            throw error;
        }
        finally {
            client.release();
        }
    }
    async close() {
        await this.pool.end();
        this.logger.info('PostgreSQL connection pool closed');
    }
}
/**
 * Parse connection string and return database type and config
 */
function parseConnectionString(databaseUrl) {
    if (databaseUrl.startsWith('sqlite:')) {
        const path = databaseUrl.replace(/^sqlite:/, '');
        return { type: 'sqlite', config: path };
    }
    if (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')) {
        return { type: 'postgres', config: databaseUrl };
    }
    // Default to SQLite for file paths
    if (databaseUrl.includes('.db') || databaseUrl.includes('.sqlite')) {
        return { type: 'sqlite', config: databaseUrl };
    }
    throw new Error(`Unsupported database URL format: ${databaseUrl}. ` +
        `Expected sqlite:path/to/db.db or postgresql://...`);
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
async function connect(databaseUrl, options = {}) {
    const logger = options.logger || noopLogger;
    const { type, config } = parseConnectionString(databaseUrl);
    return withRetry(async () => {
        if (type === 'sqlite') {
            logger.info('Connecting to SQLite', { path: config });
            const db = new better_sqlite3_1.default(config);
            return new SqliteConnection(db, logger);
        }
        else {
            logger.info('Connecting to PostgreSQL', { url: databaseUrl.replace(/:[^:@]+@/, ':***@') });
            const pool = new pg_1.default.Pool({ connectionString: config });
            // Test connection
            await pool.query('SELECT 1');
            return new PostgresConnection(pool, logger);
        }
    }, options, 'database connection');
}
//# sourceMappingURL=connect.js.map