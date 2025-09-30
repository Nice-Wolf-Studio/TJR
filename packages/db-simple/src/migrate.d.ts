/**
 * Simple file-based migration runner
 */
import { DbConnection, Logger } from './connect.js';
/**
 * Migration runner options
 */
export interface MigrateOptions {
    logger?: Logger;
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
export declare function runMigrations(migrationsDir: string, db: DbConnection, options?: MigrateOptions): Promise<void>;
//# sourceMappingURL=migrate.d.ts.map