/**
 * Data Pipeline Main Entry Point
 * Initializes and coordinates all data pipeline components
 */

const logger = require('../utils/logger');
const config = require('../../config/environment');
const dbConnection = require('../database/connection');
const migrationManager = require('../database/migrations');
const storage = require('./storage');
const collector = require('./collector');
const rateLimit = require('../utils/rateLimit');
const errorRecovery = require('../utils/errorRecovery');
const healthCheck = require('../monitoring/healthCheck');

class DataPipeline {
    constructor() {
        this.isInitialized = false;
        this.isRunning = false;
        this.components = {
            database: false,
            redis: false,
            collector: false,
            monitoring: false
        };
    }

    /**
     * Initialize the complete data pipeline
     */
    async initialize() {
        if (this.isInitialized) {
            logger.warn('Data pipeline already initialized');
            return;
        }

        try {
            logger.info('Initializing data pipeline...', {
                environment: config.env,
                components: Object.keys(this.components)
            });

            // Ensure required directories exist
            config.ensureDirectories();

            // Initialize database connection
            await this.initializeDatabase();

            // Initialize Redis connection
            await this.initializeRedis();

            // Initialize rate limiting
            await this.initializeRateLimit();

            // Initialize data collector
            await this.initializeCollector();

            // Initialize monitoring
            await this.initializeMonitoring();

            // Setup error recovery
            this.setupErrorRecovery();

            this.isInitialized = true;

            logger.info('Data pipeline initialized successfully', {
                components: this.components,
                configuration: config.getConfigSummary()
            });

            return true;

        } catch (error) {
            logger.error('Failed to initialize data pipeline:', error);
            await this.cleanup();
            throw error;
        }
    }

    /**
     * Initialize database connection and migrations
     */
    async initializeDatabase() {
        try {
            logger.info('Initializing database connection...');

            // Initialize database connection
            await dbConnection.initialize();

            // Apply initial schema if needed
            await migrationManager.applyInitialSchema();

            // Run any pending migrations
            await migrationManager.migrate();

            this.components.database = true;
            logger.info('Database initialized successfully');

        } catch (error) {
            logger.error('Database initialization failed:', error);
            throw error;
        }
    }

    /**
     * Initialize Redis connection
     */
    async initializeRedis() {
        try {
            logger.info('Initializing Redis connection...');

            // Initialize Redis for storage
            await storage.initializeRedis();

            this.components.redis = storage.isRedisConnected;

            if (this.components.redis) {
                logger.info('Redis initialized successfully');
            } else {
                logger.warn('Redis initialization failed, continuing without cache');
            }

        } catch (error) {
            logger.warn('Redis initialization failed, continuing without cache:', error);
            this.components.redis = false;
        }
    }

    /**
     * Initialize rate limiting
     */
    async initializeRateLimit() {
        try {
            logger.info('Initializing rate limiting...');

            // Initialize Redis connection for rate limiting
            await rateLimit.initializeRedis();

            // Create rate limiters for enabled data sources
            Object.entries(config.config.dataSources).forEach(([sourceName, sourceConfig]) => {
                if (sourceConfig.enabled) {
                    rateLimit.create(sourceName, {
                        points: sourceConfig.rateLimit.requests,
                        duration: sourceConfig.rateLimit.duration
                    });
                }
            });

            logger.info('Rate limiting initialized successfully');

        } catch (error) {
            logger.error('Rate limiting initialization failed:', error);
            throw error;
        }
    }

    /**
     * Initialize data collector
     */
    async initializeCollector() {
        try {
            logger.info('Initializing data collector...');

            // The collector initializes its own data sources
            // We just need to make sure it's ready
            this.components.collector = true;

            logger.info('Data collector initialized successfully');

        } catch (error) {
            logger.error('Data collector initialization failed:', error);
            throw error;
        }
    }

    /**
     * Initialize monitoring and health checks
     */
    async initializeMonitoring() {
        try {
            logger.info('Initializing monitoring system...');

            // Start health check monitoring if enabled
            if (config.isEnabled('monitoring.enabled')) {
                const interval = config.get('monitoring.healthCheckInterval', 60000) / 1000;
                healthCheck.start(interval);
                this.components.monitoring = true;
            }

            logger.info('Monitoring system initialized successfully');

        } catch (error) {
            logger.error('Monitoring initialization failed:', error);
            throw error;
        }
    }

    /**
     * Setup error recovery strategies
     */
    setupErrorRecovery() {
        logger.info('Setting up error recovery strategies...');

        // Register custom recovery strategies
        errorRecovery.registerRecoveryStrategy('data_pipeline_failure', async (error, context) => {
            logger.warn('Data pipeline failure detected, attempting recovery...', { error: error.message });

            // Try to restart failed components
            if (!this.components.database) {
                try {
                    await this.initializeDatabase();
                } catch (dbError) {
                    logger.error('Database recovery failed:', dbError);
                }
            }

            if (!this.components.redis) {
                try {
                    await this.initializeRedis();
                } catch (redisError) {
                    logger.warn('Redis recovery failed:', redisError);
                }
            }

            return {
                recovered: this.components.database,
                strategy: 'component_restart'
            };
        });

        logger.info('Error recovery strategies configured');
    }

    /**
     * Start the data pipeline
     */
    async start() {
        if (!this.isInitialized) {
            throw new Error('Data pipeline not initialized. Call initialize() first.');
        }

        if (this.isRunning) {
            logger.warn('Data pipeline already running');
            return;
        }

        try {
            logger.info('Starting data pipeline...');

            // Start data collection if enabled
            if (config.isEnabled('dataCollection.enabled')) {
                await collector.start();
                logger.info('Data collector started');
            }

            this.isRunning = true;

            logger.info('Data pipeline started successfully', {
                components: this.components,
                dataCollection: config.isEnabled('dataCollection.enabled'),
                monitoring: config.isEnabled('monitoring.enabled')
            });

            return true;

        } catch (error) {
            logger.error('Failed to start data pipeline:', error);
            throw error;
        }
    }

    /**
     * Stop the data pipeline
     */
    async stop() {
        if (!this.isRunning) {
            logger.warn('Data pipeline not running');
            return;
        }

        try {
            logger.info('Stopping data pipeline...');

            // Stop data collector
            if (collector.isRunning) {
                await collector.stop();
            }

            // Stop monitoring
            if (healthCheck.isRunning) {
                healthCheck.stop();
            }

            this.isRunning = false;

            logger.info('Data pipeline stopped successfully');

        } catch (error) {
            logger.error('Error stopping data pipeline:', error);
            throw error;
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        logger.info('Shutting down data pipeline...');

        try {
            // Stop the pipeline
            await this.stop();

            // Cleanup resources
            await this.cleanup();

            logger.info('Data pipeline shutdown complete');

        } catch (error) {
            logger.error('Error during data pipeline shutdown:', error);
            throw error;
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        logger.info('Cleaning up data pipeline resources...');

        const cleanupTasks = [];

        // Close database connection
        if (this.components.database) {
            cleanupTasks.push(dbConnection.close());
        }

        // Close Redis connections
        if (this.components.redis) {
            cleanupTasks.push(storage.close());
            cleanupTasks.push(rateLimit.close());
        }

        // Close logger
        cleanupTasks.push(logger.close());

        await Promise.allSettled(cleanupTasks);

        // Reset component status
        Object.keys(this.components).forEach(key => {
            this.components[key] = false;
        });

        this.isInitialized = false;
        this.isRunning = false;

        logger.info('Data pipeline cleanup complete');
    }

    /**
     * Get pipeline status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            running: this.isRunning,
            components: this.components,
            health: this.isInitialized ? healthCheck.getLatestResults() : null,
            configuration: {
                environment: config.env,
                dataSources: Object.entries(config.config.dataSources).reduce((acc, [name, source]) => {
                    acc[name] = {
                        enabled: source.enabled,
                        hasApiKey: !!source.apiKey
                    };
                    return acc;
                }, {}),
                features: {
                    dataCollection: config.isEnabled('dataCollection.enabled'),
                    monitoring: config.isEnabled('monitoring.enabled'),
                    redis: this.components.redis
                }
            }
        };
    }

    /**
     * Health check for the entire pipeline
     */
    async healthCheck() {
        if (!this.isInitialized) {
            return {
                status: 'unhealthy',
                message: 'Data pipeline not initialized'
            };
        }

        const componentChecks = await Promise.allSettled([
            dbConnection.healthCheck(),
            storage.getStorageStats(),
            collector.healthCheck(),
            rateLimit.healthCheck(),
            errorRecovery.healthCheck()
        ]);

        const results = {
            database: componentChecks[0].status === 'fulfilled' ? componentChecks[0].value : { status: 'error' },
            storage: componentChecks[1].status === 'fulfilled' ? componentChecks[1].value : { status: 'error' },
            collector: componentChecks[2].status === 'fulfilled' ? componentChecks[2].value : { status: 'error' },
            rateLimit: componentChecks[3].status === 'fulfilled' ? componentChecks[3].value : { status: 'error' },
            errorRecovery: componentChecks[4].status === 'fulfilled' ? componentChecks[4].value : { status: 'error' }
        };

        const overallHealthy = Object.values(results).every(result =>
            result.status === 'healthy' || result.status === 'warning'
        );

        return {
            status: overallHealthy ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            components: results,
            pipeline: this.getStatus()
        };
    }
}

// Create and export singleton instance
const dataPipeline = new DataPipeline();

// Handle process signals for graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    try {
        await dataPipeline.shutdown();
        process.exit(0);
    } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    try {
        await dataPipeline.shutdown();
        process.exit(0);
    } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
});

module.exports = dataPipeline;