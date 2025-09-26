// @ts-nocheck
/**
 * Simple Database Connection - Works with SQLite or PostgreSQL
 */

const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

class SimpleDatabaseConnection {
    constructor() {
        this.db = null;
        this.isConnected = false;
        this.dbType = null;
    }

    /**
     * Initialize database connection
     */
    async initialize() {
        try {
            const dbUrl = process.env.DATABASE_URL;

            if (!dbUrl) {
                throw new Error('DATABASE_URL is required');
            }

            if (dbUrl.startsWith('sqlite:')) {
                await this.initializeSQLite(dbUrl);
            } else if (dbUrl.startsWith('postgresql:')) {
                await this.initializePostgreSQL(dbUrl);
            } else {
                throw new Error('Unsupported database type. Use sqlite: or postgresql:');
            }

            logger.info(`✅ Database connected (${this.dbType})`);

        } catch (error) {
            logger.error('❌ Database connection failed:', error);
            throw error;
        }
    }

    /**
     * Initialize SQLite connection
     */
    async initializeSQLite(dbUrl) {
        const sqlite3 = require('sqlite3').verbose();
        const dbPath = dbUrl.replace('sqlite:', '');

        // Create directory if it doesn't exist
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir) && dir !== '.') {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new sqlite3.Database(dbPath);
        this.dbType = 'sqlite';
        this.isConnected = true; // Set connected before using query

        // Enable foreign keys
        await this.query('PRAGMA foreign_keys = ON');

        logger.info(`📂 SQLite database: ${dbPath}`);
    }

    /**
     * Initialize PostgreSQL connection
     */
    async initializePostgreSQL(dbUrl) {
        const { Pool } = require('pg');

        this.db = new Pool({
            connectionString: dbUrl,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });

        this.dbType = 'postgresql';
        this.isConnected = true; // Set connected before testing

        // Test connection
        await this.db.query('SELECT 1');

        logger.info('🐘 PostgreSQL database connected');
    }

    /**
     * Execute a query
     */
    async query(sql, params = []) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }

        try {
            if (this.dbType === 'sqlite') {
                return await this.querySQLite(sql, params);
            } else {
                return await this.db.query(sql, params);
            }
        } catch (error) {
            logger.error('Query failed:', { sql, params, error: error.message });
            throw error;
        }
    }

    /**
     * Execute SQLite query with promise wrapper
     */
    async querySQLite(sql, params = []) {
        return new Promise((resolve, reject) => {
            if (sql.trim().toUpperCase().startsWith('SELECT')) {
                this.db.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve({ rows, rowCount: rows.length });
                });
            } else {
                this.db.run(sql, params, function(err) {
                    if (err) reject(err);
                    else resolve({ rowCount: this.changes, insertId: this.lastID });
                });
            }
        });
    }

    /**
     * Get health status
     */
    async getHealth() {
        try {
            await this.query('SELECT 1');
            return {
                status: 'healthy',
                type: this.dbType,
                connected: this.isConnected
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                type: this.dbType,
                connected: false
            };
        }
    }

    /**
     * Close connection
     */
    async shutdown() {
        try {
            if (this.db) {
                if (this.dbType === 'sqlite') {
                    this.db.close();
                } else {
                    await this.db.end();
                }
                this.isConnected = false;
                logger.info('✅ Database connection closed');
            }
        } catch (error) {
            logger.error('❌ Error closing database:', error);
        }
    }
}

module.exports = SimpleDatabaseConnection;