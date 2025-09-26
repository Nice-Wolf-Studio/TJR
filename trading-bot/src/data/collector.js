/**
 * Data Collection Orchestrator
 * Main coordinator for collecting market data from multiple sources
 */

const EventEmitter = require('events');
const cron = require('node-cron');
const logger = require('../utils/logger');
const dbConnection = require('../database/connection');
const storage = require('./storage');
const validator = require('./validator');
const rateLimit = require('../utils/rateLimit');

// Data sources
const TradingViewSource = require('./sources/tradingview');
const PolygonSource = require('./sources/polygon');
const AlphaVantageSource = require('./sources/alphavantage');

class DataCollector extends EventEmitter {
    constructor() {
        super();
        this.isRunning = false;
        this.sources = new Map();
        this.activeJobs = new Map();
        this.collectionStats = {
            totalCollected: 0,
            errors: 0,
            lastCollection: null,
            sources: {}
        };

        // Initialize data sources
        this.initializeSources();

        // Setup event listeners
        this.setupEventListeners();
    }

    /**
     * Initialize all data sources
     */
    initializeSources() {
        try {
            // TradingView source
            if (process.env.TRADINGVIEW_ENABLED === 'true') {
                this.sources.set('tradingview', new TradingViewSource({
                    rateLimiter: rateLimit.create('tradingview', {
                        points: 100,
                        duration: 60
                    })
                }));
            }

            // Polygon.io source
            if (process.env.POLYGON_API_KEY && process.env.POLYGON_ENABLED === 'true') {
                this.sources.set('polygon', new PolygonSource({
                    apiKey: process.env.POLYGON_API_KEY,
                    rateLimiter: rateLimit.create('polygon', {
                        points: 5,
                        duration: 60
                    })
                }));
            }

            // Alpha Vantage source
            if (process.env.ALPHAVANTAGE_API_KEY && process.env.ALPHAVANTAGE_ENABLED === 'true') {
                this.sources.set('alphavantage', new AlphaVantageSource({
                    apiKey: process.env.ALPHAVANTAGE_API_KEY,
                    rateLimiter: rateLimit.create('alphavantage', {
                        points: 5,
                        duration: 60
                    })
                }));
            }

            logger.info(`Initialized ${this.sources.size} data sources:`, Array.from(this.sources.keys()));

            // Initialize stats for each source
            for (const sourceName of this.sources.keys()) {
                this.collectionStats.sources[sourceName] = {
                    collected: 0,
                    errors: 0,
                    lastCollection: null,
                    status: 'initialized'
                };
            }

        } catch (error) {
            logger.error('Error initializing data sources:', error);
            throw error;
        }
    }

    /**
     * Setup event listeners for data collection
     */
    setupEventListeners() {
        this.on('dataCollected', this.handleDataCollected.bind(this));
        this.on('collectionError', this.handleCollectionError.bind(this));
        this.on('sourceStatusChanged', this.handleSourceStatusChange.bind(this));

        // Handle process signals for graceful shutdown
        process.on('SIGINT', () => this.stop());
        process.on('SIGTERM', () => this.stop());
    }

    /**
     * Start data collection with scheduled jobs
     */
    async start() {
        if (this.isRunning) {
            logger.warn('Data collector is already running');
            return;
        }

        try {
            logger.info('Starting data collector...');

            // Verify database connection
            const healthCheck = await dbConnection.healthCheck();
            if (healthCheck.status !== 'healthy') {
                throw new Error('Database is not healthy: ' + healthCheck.message);
            }

            // Start data sources
            for (const [sourceName, source] of this.sources) {
                try {
                    await source.initialize();
                    this.collectionStats.sources[sourceName].status = 'active';
                    logger.info(`${sourceName} source initialized successfully`);
                } catch (error) {
                    logger.error(`Failed to initialize ${sourceName} source:`, error);
                    this.collectionStats.sources[sourceName].status = 'error';
                }
            }

            // Setup collection schedules
            await this.setupCollectionSchedules();

            this.isRunning = true;
            logger.info('Data collector started successfully');

            this.emit('collectorStarted');

        } catch (error) {
            logger.error('Failed to start data collector:', error);
            throw error;
        }
    }

    /**
     * Setup collection schedules for different timeframes
     */
    async setupCollectionSchedules() {
        const schedules = [
            {
                name: '1m_collection',
                schedule: '*/1 * * * *', // Every minute
                timeframes: ['1m'],
                description: '1-minute data collection'
            },
            {
                name: '5m_collection',
                schedule: '*/5 * * * *', // Every 5 minutes
                timeframes: ['5m'],
                description: '5-minute data collection'
            },
            {
                name: '15m_collection',
                schedule: '*/15 * * * *', // Every 15 minutes
                timeframes: ['15m'],
                description: '15-minute data collection'
            },
            {
                name: '1h_collection',
                schedule: '0 * * * *', // Every hour
                timeframes: ['1h'],
                description: '1-hour data collection'
            },
            {
                name: '4h_collection',
                schedule: '0 */4 * * *', // Every 4 hours
                timeframes: ['4h'],
                description: '4-hour data collection'
            },
            {
                name: '1d_collection',
                schedule: '0 0 * * *', // Daily at midnight
                timeframes: ['1d'],
                description: 'Daily data collection'
            }
        ];

        for (const schedule of schedules) {
            const job = cron.schedule(schedule.schedule, async () => {
                await this.collectForTimeframes(schedule.timeframes);
            }, {
                scheduled: false,
                timezone: process.env.TIMEZONE || 'UTC'
            });

            this.activeJobs.set(schedule.name, {
                job,
                schedule: schedule.schedule,
                description: schedule.description,
                timeframes: schedule.timeframes
            });

            logger.info(`Scheduled ${schedule.description}: ${schedule.schedule}`);
        }

        // Start all scheduled jobs
        for (const [jobName, jobInfo] of this.activeJobs) {
            jobInfo.job.start();
            logger.info(`Started scheduled job: ${jobName}`);
        }
    }

    /**
     * Collect data for specific timeframes
     */
    async collectForTimeframes(timeframes) {
        if (!this.isRunning) {
            return;
        }

        logger.info(`Starting collection for timeframes: ${timeframes.join(', ')}`);

        try {
            // Get active markets from database
            const markets = await this.getActiveMarkets();

            if (markets.length === 0) {
                logger.warn('No active markets found for data collection');
                return;
            }

            // Collect data from all sources in parallel
            const collectionPromises = [];

            for (const [sourceName, source] of this.sources) {
                if (this.collectionStats.sources[sourceName].status === 'active') {
                    for (const timeframe of timeframes) {
                        collectionPromises.push(
                            this.collectFromSource(source, sourceName, markets, timeframe)
                        );
                    }
                }
            }

            await Promise.allSettled(collectionPromises);

            this.collectionStats.lastCollection = new Date();
            logger.info(`Collection completed for timeframes: ${timeframes.join(', ')}`);

        } catch (error) {
            logger.error('Error in timeframe collection:', error);
            this.emit('collectionError', error);
        }
    }

    /**
     * Collect data from a specific source
     */
    async collectFromSource(source, sourceName, markets, timeframe) {
        const startTime = Date.now();

        try {
            logger.debug(`Collecting ${timeframe} data from ${sourceName} for ${markets.length} markets`);

            for (const market of markets) {
                try {
                    // Check rate limits
                    const canProceed = await source.rateLimiter.consume(sourceName);
                    if (!canProceed) {
                        logger.warn(`Rate limit exceeded for ${sourceName}, skipping market ${market.symbol}`);
                        continue;
                    }

                    // Collect data for this market/timeframe
                    const data = await source.collectPriceData(market.symbol, timeframe);

                    if (data && data.length > 0) {
                        // Validate data
                        const validatedData = await validator.validatePriceData(data, market, sourceName);

                        if (validatedData.length > 0) {
                            // Store data
                            await storage.storePriceData(validatedData, market.id, sourceName);

                            this.collectionStats.sources[sourceName].collected += validatedData.length;
                            this.collectionStats.totalCollected += validatedData.length;

                            this.emit('dataCollected', {
                                source: sourceName,
                                market: market.symbol,
                                timeframe,
                                count: validatedData.length
                            });
                        }
                    }

                    // Small delay to prevent overwhelming the source
                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (marketError) {
                    logger.error(`Error collecting data for ${market.symbol} from ${sourceName}:`, marketError);
                    this.collectionStats.sources[sourceName].errors++;
                    this.collectionStats.errors++;
                }
            }

            const duration = Date.now() - startTime;
            this.collectionStats.sources[sourceName].lastCollection = new Date();

            logger.debug(`${sourceName} collection completed in ${duration}ms`);

        } catch (sourceError) {
            logger.error(`Error collecting from ${sourceName}:`, sourceError);
            this.collectionStats.sources[sourceName].status = 'error';
            this.collectionStats.sources[sourceName].errors++;
            this.emit('collectionError', sourceError);
        }
    }

    /**
     * Get active markets from database
     */
    async getActiveMarkets() {
        try {
            const result = await dbConnection.query(`
                SELECT id, symbol, base_currency, quote_currency, exchange, session_info
                FROM markets
                WHERE is_active = true
                ORDER BY symbol
            `);

            return result.rows;
        } catch (error) {
            logger.error('Error fetching active markets:', error);
            return [];
        }
    }

    /**
     * Manually trigger data collection for specific markets
     */
    async collectMarkets(symbols, timeframes = ['1m', '5m', '15m', '1h']) {
        if (!Array.isArray(symbols)) {
            symbols = [symbols];
        }

        logger.info(`Manual collection triggered for: ${symbols.join(', ')}`);

        try {
            // Get market info from database
            const markets = await dbConnection.query(`
                SELECT id, symbol, base_currency, quote_currency, exchange, session_info
                FROM markets
                WHERE symbol = ANY($1) AND is_active = true
            `, [symbols]);

            if (markets.rows.length === 0) {
                throw new Error('No active markets found for the specified symbols');
            }

            // Collect data for specified timeframes
            for (const timeframe of timeframes) {
                await this.collectForTimeframes([timeframe]);
            }

            return {
                success: true,
                message: `Collection completed for ${symbols.length} markets`,
                markets: markets.rows.length
            };

        } catch (error) {
            logger.error('Manual collection error:', error);
            throw error;
        }
    }

    /**
     * Handle successful data collection
     */
    handleDataCollected(data) {
        logger.debug('Data collected successfully:', data);
    }

    /**
     * Handle collection errors
     */
    handleCollectionError(error) {
        logger.error('Collection error:', error);
    }

    /**
     * Handle source status changes
     */
    handleSourceStatusChange(data) {
        logger.info(`Source ${data.source} status changed to: ${data.status}`);
    }

    /**
     * Get collection statistics
     */
    getStats() {
        return {
            ...this.collectionStats,
            isRunning: this.isRunning,
            activeSources: Array.from(this.sources.keys()).filter(
                source => this.collectionStats.sources[source].status === 'active'
            ),
            activeJobs: Array.from(this.activeJobs.keys())
        };
    }

    /**
     * Stop data collection
     */
    async stop() {
        if (!this.isRunning) {
            logger.warn('Data collector is not running');
            return;
        }

        logger.info('Stopping data collector...');

        try {
            // Stop all scheduled jobs
            for (const [jobName, jobInfo] of this.activeJobs) {
                jobInfo.job.stop();
                logger.debug(`Stopped job: ${jobName}`);
            }

            // Stop all data sources
            for (const [sourceName, source] of this.sources) {
                try {
                    if (typeof source.stop === 'function') {
                        await source.stop();
                    }
                    this.collectionStats.sources[sourceName].status = 'stopped';
                } catch (error) {
                    logger.error(`Error stopping ${sourceName} source:`, error);
                }
            }

            this.isRunning = false;
            logger.info('Data collector stopped successfully');

            this.emit('collectorStopped');

        } catch (error) {
            logger.error('Error stopping data collector:', error);
            throw error;
        }
    }

    /**
     * Health check for the data collector
     */
    async healthCheck() {
        try {
            const stats = this.getStats();
            const dbHealth = await dbConnection.healthCheck();

            return {
                status: this.isRunning && dbHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
                isRunning: this.isRunning,
                database: dbHealth,
                sources: Object.entries(this.collectionStats.sources).map(([name, stats]) => ({
                    name,
                    status: stats.status,
                    collected: stats.collected,
                    errors: stats.errors,
                    lastCollection: stats.lastCollection
                })),
                totalCollected: this.collectionStats.totalCollected,
                totalErrors: this.collectionStats.errors,
                lastCollection: this.collectionStats.lastCollection
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }
}

module.exports = new DataCollector();