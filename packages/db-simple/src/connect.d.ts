/**
 * Database connection abstraction for SQLite and PostgreSQL
 */
/**
 * Minimal logger interface for dependency injection
 */
export interface Logger {
    info(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
}
/**
 * Unified database connection interface
 */
export interface DbConnection {
    /**
     * Database type (sqlite or postgres)
     */
    readonly dbType: 'sqlite' | 'postgres';
    /**
     * Execute SQL without returning results (DDL, INSERT, UPDATE, DELETE)
     */
    exec(sql: string, params?: unknown[]): Promise<void>;
    /**
     * Execute SQL and return results (SELECT)
     */
    query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
    /**
     * Execute a function within a transaction
     * Automatically commits on success, rolls back on error
     */
    transaction<T>(fn: (db: DbConnection) => Promise<T>): Promise<T>;
    /**
     * Close the database connection
     */
    close(): Promise<void>;
}
/**
 * Configuration options for database connection
 */
export interface ConnectOptions {
    logger?: Logger;
    /**
     * Retry configuration (applied to transient errors)
     */
    retry?: {
        maxRetries?: number;
        initialDelayMs?: number;
        backoffMultiplier?: number;
        jitterPercent?: number;
    };
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
export declare function connect(databaseUrl: string, options?: ConnectOptions): Promise<DbConnection>;
//# sourceMappingURL=connect.d.ts.map