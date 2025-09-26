// @ts-nocheck
/**
 * Database Migration System
 * Handles schema creation and updates
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const crypto = require('crypto');
const logger = require('../utils/logger');

class DatabaseMigrator {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    this.migrationsPath = path.join(__dirname, 'migrations');
    this.schemaPath = path.join(__dirname, 'schema.sql');
  }

  /**
   * Initialize migration system
   */
  async initialize() {
    try {
      // Create migrations table if it doesn't exist
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) NOT NULL UNIQUE,
          checksum VARCHAR(64) NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      logger.info('✅ Migration system initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize migration system:', error);
      throw error;
    }
  }

  /**
   * Calculate checksum for a file
   */
  calculateChecksum(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Run initial schema setup
   */
  async runInitialSchema() {
    try {
      if (!fs.existsSync(this.schemaPath)) {
        logger.error('❌ Schema file not found:', this.schemaPath);
        return false;
      }

      const schemaContent = fs.readFileSync(this.schemaPath, 'utf8');
      const checksum = this.calculateChecksum(schemaContent);

      // Check if initial schema has been run
      const result = await this.pool.query(
        'SELECT * FROM migrations WHERE filename = $1',
        ['initial_schema.sql']
      );

      if (result.rows.length > 0) {
        if (result.rows[0].checksum !== checksum) {
          logger.warn('⚠️ Schema file has changed since initial migration');
          logger.warn('⚠️ Consider creating a new migration instead');
        } else {
          logger.info('✅ Initial schema already applied');
        }
        return true;
      }

      // Execute schema
      logger.info('📀 Applying initial database schema...');
      await this.pool.query(schemaContent);

      // Record migration
      await this.pool.query(
        'INSERT INTO migrations (filename, checksum) VALUES ($1, $2)',
        ['initial_schema.sql', checksum]
      );

      logger.info('✅ Initial schema applied successfully');
      return true;

    } catch (error) {
      logger.error('❌ Failed to apply initial schema:', error);
      throw error;
    }
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations() {
    try {
      const migrationFiles = fs.readdirSync(this.migrationsPath)
        .filter(file => file.endsWith('.sql'))
        .sort();

      const executedMigrations = await this.pool.query(
        'SELECT filename FROM migrations WHERE filename != $1',
        ['initial_schema.sql']
      );

      const executedSet = new Set(executedMigrations.rows.map(row => row.filename));

      return migrationFiles.filter(file => !executedSet.has(file));

    } catch (error) {
      if (error.code === 'ENOENT') {
        // Migrations directory doesn't exist, create it
        fs.mkdirSync(this.migrationsPath, { recursive: true });
        return [];
      }
      throw error;
    }
  }

  /**
   * Run pending migrations
   */
  async runMigrations() {
    try {
      const pendingMigrations = await this.getPendingMigrations();

      if (pendingMigrations.length === 0) {
        logger.info('✅ No pending migrations');
        return true;
      }

      logger.info(`📋 Found ${pendingMigrations.length} pending migrations`);

      for (const filename of pendingMigrations) {
        await this.runSingleMigration(filename);
      }

      logger.info('✅ All migrations completed successfully');
      return true;

    } catch (error) {
      logger.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Run a single migration
   */
  async runSingleMigration(filename) {
    try {
      const filePath = path.join(this.migrationsPath, filename);
      const migrationContent = fs.readFileSync(filePath, 'utf8');
      const checksum = this.calculateChecksum(migrationContent);

      logger.info(`📝 Applying migration: ${filename}`);

      // Start transaction
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        // Execute migration
        await client.query(migrationContent);

        // Record migration
        await client.query(
          'INSERT INTO migrations (filename, checksum) VALUES ($1, $2)',
          [filename, checksum]
        );

        await client.query('COMMIT');
        logger.info(`✅ Migration ${filename} applied successfully`);

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } catch (error) {
      logger.error(`❌ Failed to apply migration ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Rollback last migration (if rollback file exists)
   */
  async rollback() {
    try {
      // Get last migration
      const result = await this.pool.query(
        'SELECT filename FROM migrations WHERE filename != $1 ORDER BY executed_at DESC LIMIT 1',
        ['initial_schema.sql']
      );

      if (result.rows.length === 0) {
        logger.info('ℹ️ No migrations to rollback');
        return;
      }

      const lastMigration = result.rows[0].filename;
      const rollbackFile = lastMigration.replace('.sql', '.rollback.sql');
      const rollbackPath = path.join(this.migrationsPath, rollbackFile);

      if (!fs.existsSync(rollbackPath)) {
        logger.error(`❌ Rollback file not found: ${rollbackFile}`);
        logger.error('❌ Cannot rollback migration without rollback script');
        return;
      }

      const rollbackContent = fs.readFileSync(rollbackPath, 'utf8');

      logger.info(`🔄 Rolling back migration: ${lastMigration}`);

      // Start transaction
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        // Execute rollback
        await client.query(rollbackContent);

        // Remove migration record
        await client.query(
          'DELETE FROM migrations WHERE filename = $1',
          [lastMigration]
        );

        await client.query('COMMIT');
        logger.info(`✅ Migration ${lastMigration} rolled back successfully`);

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } catch (error) {
      logger.error('❌ Rollback failed:', error);
      throw error;
    }
  }

  /**
   * Show migration status
   */
  async status() {
    try {
      const executed = await this.pool.query(
        'SELECT filename, executed_at FROM migrations ORDER BY executed_at'
      );

      const pending = await this.getPendingMigrations();

      logger.info('📊 Migration Status:');
      logger.info('═══════════════════════════════════════');

      if (executed.rows.length > 0) {
        logger.info('✅ Executed Migrations:');
        executed.rows.forEach(row => {
          logger.info(`   • ${row.filename} (${row.executed_at.toISOString()})`);
        });
      } else {
        logger.info('ℹ️ No migrations executed yet');
      }

      if (pending.length > 0) {
        logger.info('⏳ Pending Migrations:');
        pending.forEach(filename => {
          logger.info(`   • ${filename}`);
        });
      } else {
        logger.info('✅ All migrations up to date');
      }

      logger.info('═══════════════════════════════════════');

    } catch (error) {
      logger.error('❌ Failed to get migration status:', error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const migrator = new DatabaseMigrator();

  try {
    // Validate environment
    if (!process.env.DATABASE_URL) {
      logger.error('❌ DATABASE_URL environment variable is required');
      process.exit(1);
    }

    await migrator.initialize();

    const action = args[0] || 'migrate';

    switch (action) {
      case 'migrate':
        logger.info('🚀 Starting database migration...');
        await migrator.runInitialSchema();
        await migrator.runMigrations();
        logger.info('🎉 Migration completed successfully!');
        break;

      case 'rollback':
        logger.info('🔄 Starting migration rollback...');
        await migrator.rollback();
        logger.info('🎉 Rollback completed successfully!');
        break;

      case 'status':
        await migrator.status();
        break;

      case 'init':
        await migrator.runInitialSchema();
        logger.info('🎉 Initial schema applied!');
        break;

      case 'help':
        console.log('TJR Trading Bot - Database Migration');
        console.log('═══════════════════════════════════');
        console.log('');
        console.log('Usage:');
        console.log('  node migrate.js [action]');
        console.log('');
        console.log('Actions:');
        console.log('  migrate   Run all pending migrations (default)');
        console.log('  rollback  Rollback last migration');
        console.log('  status    Show migration status');
        console.log('  init      Apply initial schema only');
        console.log('  help      Show this help');
        console.log('');
        console.log('Environment Variables:');
        console.log('  DATABASE_URL   PostgreSQL connection string');
        break;

      default:
        logger.error(`❌ Unknown action: ${action}`);
        logger.error('Run "node migrate.js help" for usage information');
        process.exit(1);
    }

  } catch (error) {
    logger.error('❌ Migration process failed:', error);
    process.exit(1);
  } finally {
    await migrator.close();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = DatabaseMigrator;