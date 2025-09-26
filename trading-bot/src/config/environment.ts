// @ts-nocheck
/**
 * Environment Configuration Management
 * Centralized configuration for different environments
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');

class EnvironmentConfig {
    constructor() {
        this.env = process.env.NODE_ENV || 'development';
        this.isDevelopment = this.env === 'development';
        this.isProduction = this.env === 'production';
        this.isTest = this.env === 'test';

        // Load base configuration
        this.config = this.loadConfig();

        // Validate required configuration
        this.validateConfig();
    }

    /**
     * Load configuration based on environment
     */
    loadConfig() {
        const baseConfig = {
            // Environment
            env: this.env,
            isDevelopment: this.isDevelopment,
            isProduction: this.isProduction,
            isTest: this.isTest,

            // Application
            app: {
                name: process.env.APP_NAME || 'Trading Bot',
                version: process.env.APP_VERSION || '1.0.0',
                port: parseInt(process.env.PORT) || 3000,
                host: process.env.HOST || 'localhost',
                timezone: process.env.TIMEZONE || 'UTC'
            },

            // Database Configuration
            database: {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT) || 5432,
                name: process.env.DB_NAME || 'trading_bot',
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD,
                ssl: process.env.DB_SSL === 'true',
                sslRejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',

                // Connection pool settings
                pool: {
                    min: parseInt(process.env.DB_POOL_MIN) || 2,
                    max: parseInt(process.env.DB_POOL_MAX) || 10,
                    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
                    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000,
                    statementTimeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 30000
                }
            },

            // Redis Configuration
            redis: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT) || 6379,
                password: process.env.REDIS_PASSWORD,
                db: parseInt(process.env.REDIS_DB) || 0,
                keyPrefix: process.env.REDIS_KEY_PREFIX || 'trading_bot:',

                // Connection settings
                retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY) || 100,
                retryDelayOnClusterDown: parseInt(process.env.REDIS_CLUSTER_RETRY_DELAY) || 300,
                maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES) || 3,

                // TTL settings (in seconds)
                ttl: {
                    priceData: parseInt(process.env.REDIS_TTL_PRICE_DATA) || 300,
                    analysis: parseInt(process.env.REDIS_TTL_ANALYSIS) || 1800,
                    markets: parseInt(process.env.REDIS_TTL_MARKETS) || 3600,
                    confluences: parseInt(process.env.REDIS_TTL_CONFLUENCES) || 900
                }
            },

            // Data Source API Keys and Configuration
            dataSources: {
                polygon: {
                    enabled: process.env.POLYGON_ENABLED === 'true',
                    apiKey: process.env.POLYGON_API_KEY,
                    baseUrl: process.env.POLYGON_BASE_URL || 'https://api.polygon.io',
                    rateLimit: {
                        requests: parseInt(process.env.POLYGON_RATE_LIMIT_REQUESTS) || 5,
                        duration: parseInt(process.env.POLYGON_RATE_LIMIT_DURATION) || 60
                    }
                },

                alphaVantage: {
                    enabled: process.env.ALPHAVANTAGE_ENABLED === 'true',
                    apiKey: process.env.ALPHAVANTAGE_API_KEY,
                    baseUrl: process.env.ALPHAVANTAGE_BASE_URL || 'https://www.alphavantage.co/query',
                    rateLimit: {
                        requests: parseInt(process.env.ALPHAVANTAGE_RATE_LIMIT_REQUESTS) || 5,
                        duration: parseInt(process.env.ALPHAVANTAGE_RATE_LIMIT_DURATION) || 60
                    }
                },

                tradingView: {
                    enabled: process.env.TRADINGVIEW_ENABLED === 'true',
                    baseUrl: process.env.TRADINGVIEW_BASE_URL || 'https://scanner.tradingview.com',
                    rateLimit: {
                        requests: parseInt(process.env.TRADINGVIEW_RATE_LIMIT_REQUESTS) || 100,
                        duration: parseInt(process.env.TRADINGVIEW_RATE_LIMIT_DURATION) || 60
                    },

                    // Webhook Configuration
                    webhook: {
                        enabled: process.env.TRADINGVIEW_WEBHOOK_ENABLED === 'true',
                        port: parseInt(process.env.TRADINGVIEW_WEBHOOK_PORT) || 3001,
                        path: process.env.TRADINGVIEW_WEBHOOK_PATH || '/webhook/tradingview',
                        secret: process.env.TRADINGVIEW_WEBHOOK_SECRET,

                        // Security settings
                        enableSignatureValidation: process.env.TRADINGVIEW_WEBHOOK_SIGNATURE_VALIDATION !== 'false',
                        enableRateLimit: process.env.TRADINGVIEW_WEBHOOK_RATE_LIMIT !== 'false',
                        enableDDoSProtection: process.env.TRADINGVIEW_WEBHOOK_DDOS_PROTECTION !== 'false',

                        // Rate limiting
                        maxAlertsPerMinute: parseInt(process.env.TRADINGVIEW_WEBHOOK_MAX_ALERTS_PER_MIN) || 100,
                        maxAlertsPerHour: parseInt(process.env.TRADINGVIEW_WEBHOOK_MAX_ALERTS_PER_HOUR) || 1000,

                        // Processing settings
                        alertTimeout: parseInt(process.env.TRADINGVIEW_WEBHOOK_ALERT_TIMEOUT) || 30000,
                        enableDeduplication: process.env.TRADINGVIEW_WEBHOOK_ENABLE_DEDUPLICATION !== 'false',
                        deduplicationWindow: parseInt(process.env.TRADINGVIEW_WEBHOOK_DEDUPLICATION_WINDOW) || 5000,

                        // Signal processing
                        enableSignalProcessing: process.env.TRADINGVIEW_WEBHOOK_ENABLE_SIGNAL_PROCESSING !== 'false',
                        minConfidenceThreshold: parseFloat(process.env.TRADINGVIEW_WEBHOOK_MIN_CONFIDENCE) || 0.6,
                        minConfluenceScore: parseFloat(process.env.TRADINGVIEW_WEBHOOK_MIN_CONFLUENCE_SCORE) || 5.0,

                        // Integration settings
                        enableAnalysisEngineIntegration: process.env.TRADINGVIEW_WEBHOOK_ANALYSIS_INTEGRATION !== 'false',
                        analysisTimeout: parseInt(process.env.TRADINGVIEW_WEBHOOK_ANALYSIS_TIMEOUT) || 30000,
                        enableAlertGeneration: process.env.TRADINGVIEW_WEBHOOK_ALERT_GENERATION !== 'false',

                        // Filtering and validation
                        allowedTimeframes: process.env.TRADINGVIEW_WEBHOOK_ALLOWED_TIMEFRAMES ?
                            process.env.TRADINGVIEW_WEBHOOK_ALLOWED_TIMEFRAMES.split(',') :
                            ['1m', '5m', '15m', '1h', '4h', '1d'],
                        allowedSymbols: process.env.TRADINGVIEW_WEBHOOK_ALLOWED_SYMBOLS ?
                            process.env.TRADINGVIEW_WEBHOOK_ALLOWED_SYMBOLS.split(',') :
                            [],
                        enableSymbolWhitelist: process.env.TRADINGVIEW_WEBHOOK_SYMBOL_WHITELIST === 'true',

                        // Monitoring and health
                        enableHealthCheck: process.env.TRADINGVIEW_WEBHOOK_HEALTH_CHECK !== 'false',
                        healthCheckInterval: parseInt(process.env.TRADINGVIEW_WEBHOOK_HEALTH_INTERVAL) || 60000,
                        enableMetrics: process.env.TRADINGVIEW_WEBHOOK_METRICS !== 'false',
                        metricsRetention: parseInt(process.env.TRADINGVIEW_WEBHOOK_METRICS_RETENTION) || 86400000
                    }
                }
            },

            // Discord Bot Configuration
            discord: {
                token: process.env.DISCORD_TOKEN,
                clientId: process.env.DISCORD_CLIENT_ID,
                guildIds: process.env.DISCORD_GUILD_IDS ? process.env.DISCORD_GUILD_IDS.split(',') : [],
                ownerIds: process.env.DISCORD_OWNER_IDS ? process.env.DISCORD_OWNER_IDS.split(',') : [],
                prefix: process.env.DISCORD_PREFIX || '!',

                // Permissions and features
                enableSlashCommands: process.env.DISCORD_SLASH_COMMANDS !== 'false',
                enableAnalysis: process.env.DISCORD_ENABLE_ANALYSIS !== 'false',
                enableAlerts: process.env.DISCORD_ENABLE_ALERTS !== 'false',

                // Rate limiting
                commandCooldown: parseInt(process.env.DISCORD_COMMAND_COOLDOWN) || 3000,
                maxRequestsPerMinute: parseInt(process.env.DISCORD_MAX_REQUESTS_PER_MINUTE) || 10
            },

            // Logging Configuration
            logging: {
                level: process.env.LOG_LEVEL || (this.isDevelopment ? 'debug' : 'info'),
                dir: process.env.LOG_DIR || path.join(__dirname, '../logs'),
                maxFiles: process.env.LOG_MAX_FILES || '30d',
                maxSize: process.env.LOG_MAX_SIZE || '100m',

                // Console logging
                console: process.env.LOG_CONSOLE !== 'false',
                colorize: process.env.LOG_COLORIZE !== 'false',

                // File logging
                enableFileLogging: process.env.LOG_ENABLE_FILE !== 'false',
                enableErrorFile: process.env.LOG_ENABLE_ERROR_FILE !== 'false',
                enablePerformanceFile: process.env.LOG_ENABLE_PERFORMANCE_FILE !== 'false'
            },

            // Trading Configuration
            trading: {
                // Default markets to monitor
                defaultMarkets: process.env.TRADING_DEFAULT_MARKETS ?
                    process.env.TRADING_DEFAULT_MARKETS.split(',') :
                    ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD'],

                // Default timeframes
                defaultTimeframes: process.env.TRADING_DEFAULT_TIMEFRAMES ?
                    process.env.TRADING_DEFAULT_TIMEFRAMES.split(',') :
                    ['1m', '5m', '15m', '1h', '4h', '1d'],

                // Analysis settings
                confluenceThreshold: parseFloat(process.env.TRADING_CONFLUENCE_THRESHOLD) || 0.7,
                liquidityStrengthThreshold: parseFloat(process.env.TRADING_LIQUIDITY_STRENGTH_THRESHOLD) || 5.0,

                // Sessions
                sessions: {
                    sydney: { start: '22:00', end: '07:00', timezone: 'Australia/Sydney' },
                    tokyo: { start: '00:00', end: '09:00', timezone: 'Asia/Tokyo' },
                    london: { start: '08:00', end: '17:00', timezone: 'Europe/London' },
                    newYork: { start: '13:00', end: '22:00', timezone: 'America/New_York' }
                }
            },

            // Data Collection Configuration
            dataCollection: {
                enabled: process.env.DATA_COLLECTION_ENABLED !== 'false',

                // Collection intervals (in minutes)
                intervals: {
                    '1m': 1,
                    '5m': 5,
                    '15m': 15,
                    '1h': 60,
                    '4h': 240,
                    '1d': 1440
                },

                // Batch sizes
                batchSize: parseInt(process.env.DATA_COLLECTION_BATCH_SIZE) || 1000,
                maxRetries: parseInt(process.env.DATA_COLLECTION_MAX_RETRIES) || 3,
                retryDelay: parseInt(process.env.DATA_COLLECTION_RETRY_DELAY) || 5000,

                // Data validation
                enableValidation: process.env.DATA_VALIDATION_ENABLED !== 'false',
                minQualityScore: parseFloat(process.env.DATA_MIN_QUALITY_SCORE) || 0.7,
                maxPriceDeviation: parseFloat(process.env.DATA_MAX_PRICE_DEVIATION) || 0.5
            },

            // Webhook Management Configuration
            webhookManager: {
                enabled: process.env.WEBHOOK_MANAGER_ENABLED !== 'false',

                // Health monitoring
                healthCheckInterval: parseInt(process.env.WEBHOOK_HEALTH_CHECK_INTERVAL) || 60000,
                healthCheckTimeout: parseInt(process.env.WEBHOOK_HEALTH_CHECK_TIMEOUT) || 10000,
                unhealthyThreshold: parseInt(process.env.WEBHOOK_UNHEALTHY_THRESHOLD) || 3,
                recoveryThreshold: parseInt(process.env.WEBHOOK_RECOVERY_THRESHOLD) || 2,

                // Statistics and metrics
                enableStatistics: process.env.WEBHOOK_ENABLE_STATISTICS !== 'false',
                statisticsInterval: parseInt(process.env.WEBHOOK_STATISTICS_INTERVAL) || 300000,
                statisticsRetention: parseInt(process.env.WEBHOOK_STATISTICS_RETENTION) || 86400000,

                // Error handling and retry logic
                enableRetry: process.env.WEBHOOK_ENABLE_RETRY !== 'false',
                maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES) || 3,
                retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY) || 5000,
                backoffMultiplier: parseFloat(process.env.WEBHOOK_BACKOFF_MULTIPLIER) || 2,
                maxRetryDelay: parseInt(process.env.WEBHOOK_MAX_RETRY_DELAY) || 300000,

                // Security settings
                enableRateLimiting: process.env.WEBHOOK_ENABLE_RATE_LIMITING !== 'false',
                enableSignatureValidation: process.env.WEBHOOK_ENABLE_SIGNATURE_VALIDATION !== 'false',
                enableDDoSProtection: process.env.WEBHOOK_ENABLE_DDOS_PROTECTION !== 'false',

                // Provider-specific configurations
                providers: {
                    tradingview: {
                        enabled: process.env.WEBHOOK_TRADINGVIEW_ENABLED !== 'false'
                    },
                    discord: {
                        enabled: process.env.WEBHOOK_DISCORD_ENABLED === 'true',
                        webhookUrl: process.env.DISCORD_WEBHOOK_URL
                    },
                    slack: {
                        enabled: process.env.WEBHOOK_SLACK_ENABLED === 'true',
                        webhookUrl: process.env.SLACK_WEBHOOK_URL
                    }
                }
            },

            // Signal Processing Configuration
            signalProcessor: {
                enabled: process.env.SIGNAL_PROCESSOR_ENABLED !== 'false',

                // Quality validation
                enableQualityValidation: process.env.SIGNAL_QUALITY_VALIDATION !== 'false',
                minConfidenceThreshold: parseFloat(process.env.SIGNAL_MIN_CONFIDENCE) || 0.6,
                minConfluenceScore: parseFloat(process.env.SIGNAL_MIN_CONFLUENCE_SCORE) || 5.0,
                maxSignalsPerSymbol: parseInt(process.env.SIGNAL_MAX_PER_SYMBOL) || 10,

                // Queue settings
                enableQueueing: process.env.SIGNAL_ENABLE_QUEUEING !== 'false',
                queueMaxSize: parseInt(process.env.SIGNAL_QUEUE_MAX_SIZE) || 1000,
                processingBatchSize: parseInt(process.env.SIGNAL_PROCESSING_BATCH_SIZE) || 10,
                processingInterval: parseInt(process.env.SIGNAL_PROCESSING_INTERVAL) || 1000,

                // Analysis engine integration
                enableAnalysisEngine: process.env.SIGNAL_ENABLE_ANALYSIS_ENGINE !== 'false',
                analysisTimeout: parseInt(process.env.SIGNAL_ANALYSIS_TIMEOUT) || 30000,
                enableTriggerUpdates: process.env.SIGNAL_ENABLE_TRIGGER_UPDATES !== 'false',

                // Signal filtering
                enableDuplicateFiltering: process.env.SIGNAL_ENABLE_DUPLICATE_FILTERING !== 'false',
                duplicateTimeWindow: parseInt(process.env.SIGNAL_DUPLICATE_TIME_WINDOW) || 300000,
                enableTimeframeFiltering: process.env.SIGNAL_ENABLE_TIMEFRAME_FILTERING !== 'false',
                allowedTimeframes: process.env.SIGNAL_ALLOWED_TIMEFRAMES ?
                    process.env.SIGNAL_ALLOWED_TIMEFRAMES.split(',') :
                    ['1m', '5m', '15m', '1h', '4h', '1d'],

                // Performance tracking
                enablePerformanceTracking: process.env.SIGNAL_ENABLE_PERFORMANCE_TRACKING !== 'false',
                performanceWindow: parseInt(process.env.SIGNAL_PERFORMANCE_WINDOW) || 24
            },

            // Security Configuration
            security: {
                // API security
                enableApiSecurity: process.env.ENABLE_API_SECURITY !== 'false',
                apiKeyHeader: process.env.API_KEY_HEADER || 'X-API-Key',

                // Rate limiting
                rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
                rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,

                // CORS
                enableCors: process.env.ENABLE_CORS !== 'false',
                corsOrigin: process.env.CORS_ORIGIN || '*',

                // Headers
                enableSecurityHeaders: process.env.ENABLE_SECURITY_HEADERS !== 'false'
            },

            // Monitoring and Health Checks
            monitoring: {
                enabled: process.env.MONITORING_ENABLED !== 'false',
                healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 60000, // 1 minute

                // Metrics collection
                enableMetrics: process.env.ENABLE_METRICS !== 'false',
                metricsPort: parseInt(process.env.METRICS_PORT) || 9090,

                // Alerting
                enableAlerts: process.env.ENABLE_ALERTS !== 'false',
                alertWebhook: process.env.ALERT_WEBHOOK_URL
            }
        };

        // Apply environment-specific overrides
        return this.applyEnvironmentOverrides(baseConfig);
    }

    /**
     * Apply environment-specific configuration overrides
     */
    applyEnvironmentOverrides(config) {
        switch (this.env) {
            case 'development':
                return {
                    ...config,
                    logging: {
                        ...config.logging,
                        level: 'debug',
                        console: true
                    },
                    security: {
                        ...config.security,
                        enableApiSecurity: false
                    },
                    dataCollection: {
                        ...config.dataCollection,
                        maxRetries: 1 // Faster fails in development
                    }
                };

            case 'production':
                return {
                    ...config,
                    logging: {
                        ...config.logging,
                        level: 'info',
                        console: false
                    },
                    security: {
                        ...config.security,
                        enableApiSecurity: true,
                        corsOrigin: process.env.CORS_ORIGIN || 'https://yourdomain.com'
                    }
                };

            case 'test':
                return {
                    ...config,
                    database: {
                        ...config.database,
                        name: config.database.name + '_test'
                    },
                    redis: {
                        ...config.redis,
                        db: 15 // Use separate Redis DB for tests
                    },
                    logging: {
                        ...config.logging,
                        level: 'error', // Reduce logging noise in tests
                        console: false,
                        enableFileLogging: false
                    },
                    dataCollection: {
                        ...config.dataCollection,
                        enabled: false // Disable data collection in tests
                    }
                };

            default:
                return config;
        }
    }

    /**
     * Validate required configuration
     */
    validateConfig() {
        const required = [];

        // Database password is required in production
        if (this.isProduction && !this.config.database.password) {
            required.push('DB_PASSWORD');
        }

        // Discord token is required if Discord is enabled
        if (!this.config.discord.token) {
            required.push('DISCORD_TOKEN');
        }

        // At least one data source should be enabled
        const enabledSources = Object.values(this.config.dataSources).filter(source => source.enabled);
        if (enabledSources.length === 0) {
            console.warn('Warning: No data sources are enabled. Enable at least one data source.');
        }

        // Check API keys for enabled sources
        Object.entries(this.config.dataSources).forEach(([name, source]) => {
            if (source.enabled && !source.apiKey && name !== 'tradingView') {
                required.push(`${name.toUpperCase()}_API_KEY`);
            }
        });

        if (required.length > 0) {
            const error = new Error(`Missing required environment variables: ${required.join(', ')}`);
            console.error('Configuration Error:', error.message);
            console.error('Please set the required environment variables and restart the application.');

            if (this.isProduction) {
                process.exit(1);
            } else {
                console.warn('Continuing in development mode, but some features may not work properly.');
            }
        }
    }

    /**
     * Get configuration value with dot notation support
     */
    get(path, defaultValue = undefined) {
        return path.split('.').reduce((obj, key) => {
            return obj && obj[key] !== undefined ? obj[key] : defaultValue;
        }, this.config);
    }

    /**
     * Check if a feature is enabled
     */
    isEnabled(feature) {
        return this.get(feature, false) === true;
    }

    /**
     * Get database connection URL
     */
    getDatabaseUrl() {
        const { host, port, name, user, password } = this.config.database;
        const auth = password ? `${user}:${password}` : user;
        return `postgresql://${auth}@${host}:${port}/${name}`;
    }

    /**
     * Get Redis connection URL
     */
    getRedisUrl() {
        const { host, port, password, db } = this.config.redis;
        const auth = password ? `:${password}` : '';
        return `redis://${auth}@${host}:${port}/${db}`;
    }

    /**
     * Create directories if they don't exist
     */
    ensureDirectories() {
        const directories = [
            this.config.logging.dir
        ];

        directories.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`Created directory: ${dir}`);
            }
        });
    }

    /**
     * Get configuration summary for logging
     */
    getConfigSummary() {
        return {
            environment: this.env,
            app: {
                name: this.config.app.name,
                version: this.config.app.version,
                port: this.config.app.port
            },
            database: {
                host: this.config.database.host,
                name: this.config.database.name,
                ssl: this.config.database.ssl
            },
            redis: {
                host: this.config.redis.host,
                db: this.config.redis.db
            },
            dataSources: Object.entries(this.config.dataSources).reduce((acc, [name, source]) => {
                acc[name] = {
                    enabled: source.enabled,
                    hasApiKey: !!source.apiKey
                };
                return acc;
            }, {}),
            features: {
                dataCollection: this.config.dataCollection.enabled,
                monitoring: this.config.monitoring.enabled,
                discord: !!this.config.discord.token
            }
        };
    }
}

// Export singleton instance
module.exports = new EnvironmentConfig();