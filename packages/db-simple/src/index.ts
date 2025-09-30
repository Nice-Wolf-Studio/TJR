/**
 * @tjr-suite/db-simple
 *
 * Minimal database connection and migration runner for SQLite and PostgreSQL
 */

export { connect, type DbConnection, type Logger, type ConnectOptions } from './connect.js'
export { runMigrations, type MigrateOptions } from './migrate.js'