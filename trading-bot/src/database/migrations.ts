// @ts-nocheck
/**
 * Database Migration System
 * Manages database schema updates and versioning
 */

const fs = require('fs').promises;
const path = require('path');
const dbConnection = require('./connection');
const logger = require('../utils/logger');

class MigrationManager {
    constructor() {
        this.migrationsPath = path.join(__dirname, '../../database/migrations');
        this.schemaPath = path.join(__dirname, '../../database/schema.sql');
    }

    /**
     * Initialize migrations table
     */
    async initializeMigrationsTable() {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                version VARCHAR(255) NOT NULL UNIQUE,
                name VARCHAR(255) NOT NULL,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                checksum VARCHAR(64),
                execution_time INTEGER,
                success BOOLEAN DEFAULT true
            );

            CREATE INDEX IF NOT EXISTS idx_schema_migrations_version
            ON schema_migrations (version);
        `;

        await dbConnection.query(createTableQuery);
        logger.info('Schema migrations table initialized');
    }

    /**
     * Get current database schema version
     */
    async getCurrentVersion() {
        try {
            const result = await dbConnection.query(
                'SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1'
            );

            return result.rows.length > 0 ? result.rows[0].version : '0000';
        } catch (error) {
            logger.warn('Could not get current schema version:', error.message);
            return '0000';
        }
    }

    /**
     * Get all applied migrations
     */
    async getAppliedMigrations() {
        try {
            const result = await dbConnection.query(
                'SELECT version, name, applied_at, success FROM schema_migrations ORDER BY version'
            );

            return result.rows;
        } catch (error) {
            logger.error('Error fetching applied migrations:', error);
            return [];
        }
    }

    /**
     * Check if migration exists in database
     */
    async isMigrationApplied(version) {
        const result = await dbConnection.query(
            'SELECT COUNT(*) as count FROM schema_migrations WHERE version = $1 AND success = true',
            [version]
        );

        return result.rows[0].count > 0;
    }

    /**
     * Calculate file checksum for integrity checking
     */
    async calculateChecksum(filePath) {
        const crypto = require('crypto');
        const content = await fs.readFile(filePath, 'utf8');
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Read migration file and extract metadata
     */
    async parseMigrationFile(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        const filename = path.basename(filePath);

        // Extract version and name from filename (format: YYYYMMDD_HHMMSS_migration_name.sql)
        const match = filename.match(/^(\d{8}_\d{6})_(.+)\.sql$/);

        if (!match) {
            throw new Error(`Invalid migration filename format: ${filename}`);
        }

        const [, version, name] = match;

        return {
            version,
            name: name.replace(/_/g, ' '),
            filename,
            content,
            checksum: require('crypto').createHash('sha256').update(content).digest('hex')
        };
    }

    /**
     * Get all migration files from directory
     */
    async getMigrationFiles() {
        try {
            // Ensure migrations directory exists
            try {
                await fs.access(this.migrationsPath);
            } catch (error) {
                await fs.mkdir(this.migrationsPath, { recursive: true });
                logger.info('Created migrations directory');
            }

            const files = await fs.readdir(this.migrationsPath);
            const migrationFiles = files.filter(file => file.endsWith('.sql'));

            // Parse and sort migrations by version
            const migrations = [];
            for (const file of migrationFiles) {
                const filePath = path.join(this.migrationsPath, file);
                const migration = await this.parseMigrationFile(filePath);
                migrations.push(migration);
            }

            return migrations.sort((a, b) => a.version.localeCompare(b.version));
        } catch (error) {
            logger.error('Error reading migration files:', error);
            return [];
        }
    }

    /**
     * Apply a single migration
     */
    async applyMigration(migration) {
        const startTime = Date.now();

        try {
            logger.info(`Applying migration: ${migration.version} - ${migration.name}`);

            await dbConnection.transactionWrapper(async (client) => {
                // Execute migration SQL
                await client.query(migration.content);

                // Record migration in schema_migrations table
                await client.query(`
                    INSERT INTO schema_migrations (version, name, checksum, execution_time, success)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    migration.version,
                    migration.name,
                    migration.checksum,
                    Date.now() - startTime,
                    true
                ]);
            });

            logger.info(`Migration ${migration.version} applied successfully (${Date.now() - startTime}ms)`);

        } catch (error) {
            // Record failed migration
            try {
                await dbConnection.query(`
                    INSERT INTO schema_migrations (version, name, checksum, execution_time, success)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    migration.version,
                    migration.name,
                    migration.checksum,
                    Date.now() - startTime,
                    false
                ]);
            } catch (recordError) {
                logger.error('Error recording failed migration:', recordError);
            }

            logger.error(`Migration ${migration.version} failed:`, error);
            throw error;
        }
    }

    /**
     * Run all pending migrations
     */
    async migrate() {
        try {
            await this.initializeMigrationsTable();

            const migrations = await this.getMigrationFiles();
            const appliedMigrations = await this.getAppliedMigrations();
            const appliedVersions = new Set(appliedMigrations.filter(m => m.success).map(m => m.version));

            const pendingMigrations = migrations.filter(m => !appliedVersions.has(m.version));

            if (pendingMigrations.length === 0) {
                logger.info('No pending migrations');
                return;
            }

            logger.info(`Found ${pendingMigrations.length} pending migrations`);

            for (const migration of pendingMigrations) {
                await this.applyMigration(migration);
            }

            logger.info('All migrations completed successfully');

        } catch (error) {
            logger.error('Migration process failed:', error);
            throw error;
        }
    }

    /**
     * Rollback to a specific version
     */
    async rollback(targetVersion) {
        logger.warn(`Rollback functionality not implemented. Target version: ${targetVersion}`);
        logger.warn('Please create a new migration to revert changes');
    }

    /**
     * Apply initial schema if no migrations exist
     */
    async applyInitialSchema() {
        try {
            // Check if any tables exist
            const result = await dbConnection.query(`
                SELECT COUNT(*) as table_count
                FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_type = 'BASE TABLE'
                AND table_name NOT IN ('schema_migrations')
            `);

            const tableCount = parseInt(result.rows[0].table_count);

            if (tableCount === 0) {
                logger.info('No existing tables found, applying initial schema');

                // Read and execute schema.sql
                const schemaContent = await fs.readFile(this.schemaPath, 'utf8');

                await dbConnection.transactionWrapper(async (client) => {
                    await client.query(schemaContent);

                    // Record initial schema as migration
                    await client.query(`
                        INSERT INTO schema_migrations (version, name, checksum, execution_time, success)
                        VALUES ($1, $2, $3, $4, $5)
                    `, [
                        '00000000_000000',
                        'Initial Schema',
                        require('crypto').createHash('sha256').update(schemaContent).digest('hex'),
                        0,
                        true
                    ]);
                });

                logger.info('Initial schema applied successfully');
            } else {
                logger.info(`Found ${tableCount} existing tables, skipping initial schema`);
            }

        } catch (error) {
            logger.error('Error applying initial schema:', error);
            throw error;
        }
    }

    /**
     * Create a new migration file
     */
    async createMigration(name) {
        if (!name) {
            throw new Error('Migration name is required');
        }

        const timestamp = new Date().toISOString()
            .replace(/[-:]/g, '')
            .replace('T', '_')
            .split('.')[0];

        const filename = `${timestamp}_${name.toLowerCase().replace(/\s+/g, '_')}.sql`;
        const filePath = path.join(this.migrationsPath, filename);

        const template = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}
--
-- Description: Add your migration description here

-- Add your migration SQL here
-- Example:
-- ALTER TABLE example_table ADD COLUMN new_column VARCHAR(255);

-- Remember to test your migration thoroughly before applying to production
`;

        await fs.mkdir(this.migrationsPath, { recursive: true });
        await fs.writeFile(filePath, template);

        logger.info(`Created migration file: ${filename}`);
        return filePath;
    }

    /**
     * Get migration status
     */
    async getStatus() {
        const migrations = await this.getMigrationFiles();
        const applied = await this.getAppliedMigrations();
        const appliedVersions = new Set(applied.filter(m => m.success).map(m => m.version));

        const status = {
            total: migrations.length,
            applied: applied.filter(m => m.success).length,
            pending: migrations.filter(m => !appliedVersions.has(m.version)).length,
            failed: applied.filter(m => !m.success).length,
            current_version: await this.getCurrentVersion(),
            migrations: migrations.map(m => ({
                version: m.version,
                name: m.name,
                applied: appliedVersions.has(m.version)
            }))
        };

        return status;
    }
}

module.exports = new MigrationManager();