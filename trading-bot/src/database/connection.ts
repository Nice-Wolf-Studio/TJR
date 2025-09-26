// @ts-nocheck
/**
 * Database Connection Management
 * Handles PostgreSQL connection pooling and transaction management
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

class DatabaseConnection {
    constructor() {
        this.pool = null;
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.retryDelay = 5000; // 5 seconds
    }

    /**
     * Initialize database connection pool
     */
    async initialize() {
        try {
            const config = {
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 5432,
                database: process.env.DB_NAME || 'trading_bot',
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD,

                // Connection pool settings
                min: parseInt(process.env.DB_POOL_MIN) || 2,
                max: parseInt(process.env.DB_POOL_MAX) || 10,
                idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
                connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000,

                // SSL configuration
                ssl: process.env.DB_SSL === 'true' ? {
                    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
                } : false,

                // Statement timeout
                statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 30000,

                // Application name for monitoring
                application_name: 'trading_bot'
            };

            this.pool = new Pool(config);

            // Handle pool events
            this.pool.on('connect', (client) => {
                logger.info('New client connected to database pool');
            });

            this.pool.on('error', (err, client) => {
                logger.error('Database pool error:', err);
                this.handleConnectionError(err);
            });

            this.pool.on('remove', (client) => {
                logger.debug('Client removed from database pool');
            });

            // Test the connection
            await this.testConnection();
            this.isConnected = true;
            this.retryCount = 0;

            logger.info('Database connection pool initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize database connection:', error);
            await this.handleConnectionRetry(error);
            throw error;
        }
    }

    /**
     * Test database connection
     */
    async testConnection() {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT NOW() as current_time, version() as version');
            logger.info('Database connection test successful:', {
                currentTime: result.rows[0].current_time,
                version: result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1]
            });
        } finally {
            client.release();
        }
    }

    /**
     * Handle connection errors with retry logic
     */
    async handleConnectionError(error) {
        this.isConnected = false;
        logger.error('Database connection error:', error);

        if (this.retryCount < this.maxRetries) {
            await this.handleConnectionRetry(error);
        } else {
            logger.error('Maximum database retry attempts reached');
            process.exit(1);
        }
    }

    /**
     * Retry connection with exponential backoff
     */
    async handleConnectionRetry(error) {
        this.retryCount++;
        const delay = this.retryDelay * Math.pow(2, this.retryCount - 1);

        logger.warn(`Database connection retry ${this.retryCount}/${this.maxRetries} in ${delay}ms`);

        setTimeout(async () => {
            try {
                await this.initialize();
            } catch (retryError) {
                logger.error('Database retry failed:', retryError);
            }
        }, delay);
    }

    /**
     * Execute a query with automatic retry and error handling
     */
    async query(text, params = []) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }

        const start = Date.now();
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;

            logger.debug('Query executed', {
                text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                duration: `${duration}ms`,
                rows: result.rowCount
            });

            return result;
        } catch (error) {
            logger.error('Database query error:', {
                error: error.message,
                query: text.substring(0, 200),
                params: params
            });
            throw error;
        }
    }

    /**
     * Execute multiple queries in a transaction
     */
    async transaction(queries) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            const results = [];
            for (const query of queries) {
                const result = await client.query(query.text, query.params || []);
                results.push(result);
            }

            await client.query('COMMIT');
            logger.debug(`Transaction completed successfully with ${queries.length} queries`);
            return results;

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Transaction rolled back due to error:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Execute a function within a transaction
     */
    async transactionWrapper(callback) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            const result = await callback(client);

            await client.query('COMMIT');
            logger.debug('Transaction wrapper completed successfully');
            return result;

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Transaction wrapper rolled back due to error:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get connection pool statistics
     */
    getPoolStats() {
        if (!this.pool) {
            return null;
        }

        return {
            totalCount: this.pool.totalCount,
            idleCount: this.pool.idleCount,
            waitingCount: this.pool.waitingCount
        };
    }

    /**
     * Health check for the database connection
     */
    async healthCheck() {
        try {
            if (!this.isConnected) {
                return { status: 'error', message: 'Database not connected' };
            }

            const result = await this.query('SELECT 1 as health_check');
            const poolStats = this.getPoolStats();

            return {
                status: 'healthy',
                message: 'Database connection is healthy',
                stats: poolStats,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'error',
                message: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Gracefully close database connection
     */
    async close() {
        if (this.pool) {
            logger.info('Closing database connection pool');
            await this.pool.end();
            this.isConnected = false;
            this.pool = null;
            logger.info('Database connection pool closed');
        }
    }
}

// Singleton instance
const dbConnection = new DatabaseConnection();

module.exports = dbConnection;