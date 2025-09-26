/**
 * Webhook Manager
 * Manages webhook endpoint registration, health monitoring, statistics,
 * error handling, and retry logic for all webhook integrations.
 *
 * Features:
 * - Webhook endpoint registration and management
 * - Health monitoring and connectivity checks
 * - Statistics and performance metrics
 * - Error handling and retry mechanisms
 * - Rate limiting and security management
 * - Multi-provider webhook support
 */

const EventEmitter = require('events');
const logger = require('../utils/logger');
const config = require('../../config/environment');
const TradingViewWebhookReceiver = require('./tradingview');

class WebhookManager extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            // Health monitoring
            healthCheckInterval: options.healthCheckInterval || 60000, // 1 minute
            healthCheckTimeout: options.healthCheckTimeout || 10000, // 10 seconds
            unhealthyThreshold: options.unhealthyThreshold || 3, // failures before marking unhealthy
            recoveryThreshold: options.recoveryThreshold || 2, // successes before marking healthy

            // Statistics
            enableStatistics: options.enableStatistics !== false,
            statisticsInterval: options.statisticsInterval || 300000, // 5 minutes
            statisticsRetention: options.statisticsRetention || 86400000, // 24 hours

            // Error handling
            enableRetry: options.enableRetry !== false,
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 5000, // 5 seconds
            backoffMultiplier: options.backoffMultiplier || 2,
            maxRetryDelay: options.maxRetryDelay || 300000, // 5 minutes

            // Security
            enableRateLimiting: options.enableRateLimiting !== false,
            enableSignatureValidation: options.enableSignatureValidation !== false,
            enableDDoSProtection: options.enableDDoSProtection !== false,

            // Webhook providers
            providers: {
                tradingview: {
                    enabled: options.tradingview?.enabled !== false,
                    ...options.tradingview
                }
            },

            ...options
        };

        // Webhook instances
        this.webhooks = new Map();
        this.webhookHealth = new Map();
        this.webhookStatistics = new Map();

        // Health monitoring
        this.healthCheckInterval = null;
        this.statisticsInterval = null;

        // Error tracking
        this.errorCounts = new Map();
        this.retryQueues = new Map();

        // Global metrics
        this.globalMetrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            errorRate: 0,
            uptime: Date.now(),
            lastHealthCheck: null,
            lastStatisticsUpdate: null
        };

        this.initialize();
    }

    /**
     * Initialize the webhook manager
     */
    async initialize() {
        try {
            logger.info('Initializing webhook manager', {
                providersEnabled: Object.keys(this.options.providers).filter(p =>
                    this.options.providers[p].enabled
                ),
                healthCheckInterval: this.options.healthCheckInterval,
                statisticsEnabled: this.options.enableStatistics
            });

            // Initialize webhook providers
            await this.initializeWebhookProviders();

            // Start health monitoring
            this.startHealthMonitoring();

            // Start statistics collection
            if (this.options.enableStatistics) {
                this.startStatisticsCollection();
            }

            this.emit('initialized');

            logger.info('Webhook manager initialized successfully', {
                activeWebhooks: this.webhooks.size
            });

        } catch (error) {
            logger.error('Webhook manager initialization failed', {
                error: error.message,
                stack: error.stack
            });
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Initialize webhook providers
     */
    async initializeWebhookProviders() {
        // Initialize TradingView webhook
        if (this.options.providers.tradingview.enabled) {
            await this.registerTradingViewWebhook();
        }

        // Additional webhook providers can be added here
        // - Discord webhooks
        // - Slack webhooks
        // - Custom webhook providers
    }

    /**
     * Register TradingView webhook receiver
     */
    async registerTradingViewWebhook() {
        try {
            const webhookConfig = {
                port: config.get('tradingView.webhook.port', 3001),
                path: config.get('tradingView.webhook.path', '/webhook/tradingview'),
                secret: config.get('tradingView.webhook.secret'),
                enableSignatureValidation: this.options.enableSignatureValidation,
                enableRateLimit: this.options.enableRateLimiting,
                ...this.options.providers.tradingview
            };

            const tradingViewWebhook = new TradingViewWebhookReceiver(webhookConfig);

            // Start the webhook server
            const server = await tradingViewWebhook.start();

            // Register webhook
            this.registerWebhook('tradingview', {
                instance: tradingViewWebhook,
                server: server,
                config: webhookConfig,
                type: 'receiver',
                status: 'healthy',
                lastHealthCheck: Date.now(),
                failureCount: 0,
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0
            });

            // Set up event handlers
            this.setupTradingViewEventHandlers(tradingViewWebhook);

            logger.info('TradingView webhook registered successfully', {
                port: webhookConfig.port,
                path: webhookConfig.path,
                signatureValidation: webhookConfig.enableSignatureValidation
            });

        } catch (error) {
            logger.error('Failed to register TradingView webhook', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Set up TradingView webhook event handlers
     */
    setupTradingViewEventHandlers(webhook) {
        // Monitor webhook metrics
        setInterval(() => {
            const metrics = webhook.getMetrics();
            this.updateWebhookStatistics('tradingview', metrics);
        }, 30000); // Update every 30 seconds

        // Handle webhook events
        webhook.app.on('request', (req) => {
            this.handleWebhookRequest('tradingview', req);
        });

        webhook.app.on('response', (res) => {
            this.handleWebhookResponse('tradingview', res);
        });
    }

    /**
     * Register a webhook instance
     */
    registerWebhook(name, webhookData) {
        this.webhooks.set(name, webhookData);
        this.webhookHealth.set(name, {
            status: 'healthy',
            lastCheck: Date.now(),
            failureCount: 0,
            consecutiveFailures: 0,
            lastFailure: null,
            lastSuccess: Date.now(),
            responseTime: 0
        });

        this.webhookStatistics.set(name, {
            hourlyStats: new Map(),
            dailyStats: new Map(),
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            peakRequestsPerMinute: 0,
            lastUpdate: Date.now()
        });

        this.emit('webhookRegistered', name, webhookData);

        logger.info('Webhook registered', {
            name: name,
            type: webhookData.type,
            status: webhookData.status
        });
    }

    /**
     * Unregister a webhook instance
     */
    async unregisterWebhook(name) {
        const webhook = this.webhooks.get(name);

        if (!webhook) {
            logger.warn('Attempted to unregister non-existent webhook', { name });
            return;
        }

        try {
            // Stop the webhook server if it exists
            if (webhook.server) {
                webhook.server.close();
            }

            // Clean up webhook instance
            if (webhook.instance && typeof webhook.instance.stop === 'function') {
                webhook.instance.stop();
            }

            // Remove from tracking
            this.webhooks.delete(name);
            this.webhookHealth.delete(name);
            this.webhookStatistics.delete(name);

            this.emit('webhookUnregistered', name);

            logger.info('Webhook unregistered successfully', { name });

        } catch (error) {
            logger.error('Error unregistering webhook', {
                error: error.message,
                name: name
            });
            throw error;
        }
    }

    /**
     * Start health monitoring for all webhooks
     */
    startHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            await this.performHealthChecks();
        }, this.options.healthCheckInterval);

        logger.info('Health monitoring started', {
            interval: this.options.healthCheckInterval,
            timeout: this.options.healthCheckTimeout
        });
    }

    /**
     * Perform health checks on all registered webhooks
     */
    async performHealthChecks() {
        const checkPromises = [];

        for (const [name, webhook] of this.webhooks) {
            checkPromises.push(this.checkWebhookHealth(name, webhook));
        }

        try {
            await Promise.all(checkPromises);
            this.globalMetrics.lastHealthCheck = Date.now();

        } catch (error) {
            logger.error('Health check batch failed', {
                error: error.message
            });
        }
    }

    /**
     * Check health of a specific webhook
     */
    async checkWebhookHealth(name, webhook) {
        const startTime = Date.now();
        const healthData = this.webhookHealth.get(name);

        try {
            // Perform health check based on webhook type
            let isHealthy = false;
            let responseTime = 0;

            if (webhook.type === 'receiver') {
                // For receivers, check if server is listening
                isHealthy = await this.checkReceiverHealth(webhook);
                responseTime = Date.now() - startTime;
            }

            // Update health status
            if (isHealthy) {
                healthData.consecutiveFailures = 0;
                healthData.lastSuccess = Date.now();
                healthData.responseTime = responseTime;

                if (healthData.status !== 'healthy') {
                    if (healthData.consecutiveFailures <= -this.options.recoveryThreshold) {
                        healthData.status = 'healthy';
                        this.emit('webhookHealthy', name);
                        logger.info('Webhook recovered', { name });
                    }
                }
            } else {
                healthData.consecutiveFailures++;
                healthData.lastFailure = Date.now();
                healthData.failureCount++;

                if (healthData.consecutiveFailures >= this.options.unhealthyThreshold) {
                    if (healthData.status !== 'unhealthy') {
                        healthData.status = 'unhealthy';
                        this.emit('webhookUnhealthy', name);
                        logger.warn('Webhook marked as unhealthy', {
                            name: name,
                            consecutiveFailures: healthData.consecutiveFailures
                        });
                    }
                }
            }

            healthData.lastCheck = Date.now();

        } catch (error) {
            logger.error('Health check failed for webhook', {
                name: name,
                error: error.message
            });

            healthData.consecutiveFailures++;
            healthData.lastFailure = Date.now();
            healthData.failureCount++;
            healthData.lastCheck = Date.now();
        }
    }

    /**
     * Check health of a receiver-type webhook
     */
    async checkReceiverHealth(webhook) {
        try {
            // Basic check - ensure server is listening
            if (!webhook.server || !webhook.server.listening) {
                return false;
            }

            // Advanced check - make a health request if endpoint exists
            if (webhook.instance && webhook.instance.getMetrics) {
                const metrics = webhook.instance.getMetrics();
                return metrics && typeof metrics === 'object';
            }

            return true;

        } catch (error) {
            logger.debug('Receiver health check failed', {
                error: error.message
            });
            return false;
        }
    }

    /**
     * Start statistics collection
     */
    startStatisticsCollection() {
        if (this.statisticsInterval) {
            clearInterval(this.statisticsInterval);
        }

        this.statisticsInterval = setInterval(() => {
            this.collectStatistics();
        }, this.options.statisticsInterval);

        logger.info('Statistics collection started', {
            interval: this.options.statisticsInterval,
            retention: this.options.statisticsRetention
        });
    }

    /**
     * Collect statistics from all webhooks
     */
    collectStatistics() {
        const timestamp = Date.now();

        for (const [name, webhook] of this.webhooks) {
            try {
                let metrics = {};

                if (webhook.instance && webhook.instance.getMetrics) {
                    metrics = webhook.instance.getMetrics();
                }

                this.updateWebhookStatistics(name, metrics, timestamp);

            } catch (error) {
                logger.error('Statistics collection failed for webhook', {
                    name: name,
                    error: error.message
                });
            }
        }

        this.updateGlobalStatistics();
        this.cleanupOldStatistics();
        this.globalMetrics.lastStatisticsUpdate = timestamp;
    }

    /**
     * Update statistics for a specific webhook
     */
    updateWebhookStatistics(name, metrics, timestamp = Date.now()) {
        const stats = this.webhookStatistics.get(name);
        if (!stats) return;

        // Update totals
        stats.totalRequests = metrics.totalAlerts || metrics.totalRequests || 0;
        stats.successfulRequests = metrics.validAlerts || metrics.successfulRequests || 0;
        stats.failedRequests = metrics.invalidAlerts || metrics.failedRequests || 0;
        stats.averageResponseTime = metrics.averageProcessingTime || metrics.averageResponseTime || 0;

        // Calculate hourly and daily aggregates
        const hour = new Date(timestamp).getHours();
        const day = new Date(timestamp).toDateString();

        // Hourly stats
        if (!stats.hourlyStats.has(hour)) {
            stats.hourlyStats.set(hour, {
                requests: 0,
                successful: 0,
                failed: 0,
                averageResponseTime: 0
            });
        }

        const hourStats = stats.hourlyStats.get(hour);
        hourStats.requests = stats.totalRequests;
        hourStats.successful = stats.successfulRequests;
        hourStats.failed = stats.failedRequests;
        hourStats.averageResponseTime = stats.averageResponseTime;

        // Daily stats
        if (!stats.dailyStats.has(day)) {
            stats.dailyStats.set(day, {
                requests: 0,
                successful: 0,
                failed: 0,
                averageResponseTime: 0
            });
        }

        const dayStats = stats.dailyStats.get(day);
        dayStats.requests = stats.totalRequests;
        dayStats.successful = stats.successfulRequests;
        dayStats.failed = stats.failedRequests;
        dayStats.averageResponseTime = stats.averageResponseTime;

        stats.lastUpdate = timestamp;
    }

    /**
     * Update global statistics
     */
    updateGlobalStatistics() {
        let totalRequests = 0;
        let successfulRequests = 0;
        let failedRequests = 0;
        let totalResponseTime = 0;
        let webhookCount = 0;

        for (const [name, stats] of this.webhookStatistics) {
            totalRequests += stats.totalRequests;
            successfulRequests += stats.successfulRequests;
            failedRequests += stats.failedRequests;
            totalResponseTime += stats.averageResponseTime;
            webhookCount++;
        }

        this.globalMetrics.totalRequests = totalRequests;
        this.globalMetrics.successfulRequests = successfulRequests;
        this.globalMetrics.failedRequests = failedRequests;
        this.globalMetrics.averageResponseTime = webhookCount > 0 ? totalResponseTime / webhookCount : 0;
        this.globalMetrics.errorRate = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;
    }

    /**
     * Clean up old statistics data
     */
    cleanupOldStatistics() {
        const cutoff = Date.now() - this.options.statisticsRetention;

        for (const [name, stats] of this.webhookStatistics) {
            // Clean hourly stats older than retention period
            for (const [hour, data] of stats.hourlyStats) {
                if (data.timestamp && data.timestamp < cutoff) {
                    stats.hourlyStats.delete(hour);
                }
            }

            // Clean daily stats older than retention period
            for (const [day, data] of stats.dailyStats) {
                const dayTime = new Date(day).getTime();
                if (dayTime < cutoff) {
                    stats.dailyStats.delete(day);
                }
            }
        }
    }

    /**
     * Handle webhook request
     */
    handleWebhookRequest(name, req) {
        const webhook = this.webhooks.get(name);
        if (!webhook) return;

        webhook.totalRequests++;
        this.globalMetrics.totalRequests++;

        this.emit('webhookRequest', name, req);
    }

    /**
     * Handle webhook response
     */
    handleWebhookResponse(name, res) {
        const webhook = this.webhooks.get(name);
        if (!webhook) return;

        if (res.statusCode >= 200 && res.statusCode < 400) {
            webhook.successfulRequests++;
            this.globalMetrics.successfulRequests++;
        } else {
            webhook.failedRequests++;
            this.globalMetrics.failedRequests++;
        }

        this.emit('webhookResponse', name, res);
    }

    /**
     * Retry failed webhook operations
     */
    async retryWebhookOperation(name, operation, data, attempt = 1) {
        if (!this.options.enableRetry || attempt > this.options.maxRetries) {
            logger.error('Max retries exceeded for webhook operation', {
                name: name,
                operation: operation,
                attempt: attempt
            });
            return { success: false, error: 'Max retries exceeded' };
        }

        try {
            const result = await operation(data);
            logger.info('Webhook operation retry succeeded', {
                name: name,
                attempt: attempt
            });
            return { success: true, result: result };

        } catch (error) {
            logger.warn('Webhook operation retry failed', {
                name: name,
                attempt: attempt,
                error: error.message,
                nextRetryIn: this.calculateRetryDelay(attempt)
            });

            // Calculate backoff delay
            const delay = this.calculateRetryDelay(attempt);

            // Schedule next retry
            setTimeout(() => {
                this.retryWebhookOperation(name, operation, data, attempt + 1);
            }, delay);

            return { success: false, retrying: true, nextRetryIn: delay };
        }
    }

    /**
     * Calculate retry delay with exponential backoff
     */
    calculateRetryDelay(attempt) {
        const delay = Math.min(
            this.options.retryDelay * Math.pow(this.options.backoffMultiplier, attempt - 1),
            this.options.maxRetryDelay
        );
        return delay;
    }

    /**
     * Get webhook status
     */
    getWebhookStatus(name) {
        const webhook = this.webhooks.get(name);
        const health = this.webhookHealth.get(name);
        const stats = this.webhookStatistics.get(name);

        if (!webhook) {
            return { error: 'Webhook not found' };
        }

        return {
            name: name,
            type: webhook.type,
            status: health.status,
            config: {
                port: webhook.config.port,
                path: webhook.config.path,
                enableSignatureValidation: webhook.config.enableSignatureValidation
            },
            health: {
                status: health.status,
                lastCheck: health.lastCheck,
                responseTime: health.responseTime,
                consecutiveFailures: health.consecutiveFailures,
                totalFailures: health.failureCount,
                lastFailure: health.lastFailure,
                lastSuccess: health.lastSuccess
            },
            statistics: {
                totalRequests: stats.totalRequests,
                successfulRequests: stats.successfulRequests,
                failedRequests: stats.failedRequests,
                successRate: stats.totalRequests > 0
                    ? (stats.successfulRequests / stats.totalRequests) * 100
                    : 0,
                averageResponseTime: stats.averageResponseTime,
                lastUpdate: stats.lastUpdate
            }
        };
    }

    /**
     * Get all webhook statuses
     */
    getAllWebhookStatuses() {
        const statuses = {};

        for (const name of this.webhooks.keys()) {
            statuses[name] = this.getWebhookStatus(name);
        }

        return {
            webhooks: statuses,
            global: this.globalMetrics,
            summary: {
                totalWebhooks: this.webhooks.size,
                healthyWebhooks: Array.from(this.webhookHealth.values())
                    .filter(h => h.status === 'healthy').length,
                uptime: Date.now() - this.globalMetrics.uptime
            }
        };
    }

    /**
     * Get statistics for a specific webhook
     */
    getWebhookStatistics(name, timeRange = '24h') {
        const stats = this.webhookStatistics.get(name);
        if (!stats) {
            return { error: 'Webhook not found' };
        }

        // Return statistics based on time range
        const result = {
            name: name,
            timeRange: timeRange,
            current: {
                totalRequests: stats.totalRequests,
                successfulRequests: stats.successfulRequests,
                failedRequests: stats.failedRequests,
                successRate: stats.totalRequests > 0
                    ? (stats.successfulRequests / stats.totalRequests) * 100
                    : 0,
                averageResponseTime: stats.averageResponseTime,
                lastUpdate: stats.lastUpdate
            }
        };

        if (timeRange === '24h') {
            result.hourly = Object.fromEntries(stats.hourlyStats);
        } else if (timeRange === '7d') {
            result.daily = Object.fromEntries(stats.dailyStats);
        }

        return result;
    }

    /**
     * Stop all webhook monitoring
     */
    stop() {
        // Clear intervals
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        if (this.statisticsInterval) {
            clearInterval(this.statisticsInterval);
            this.statisticsInterval = null;
        }

        // Stop all webhooks
        const stopPromises = [];
        for (const [name, webhook] of this.webhooks) {
            stopPromises.push(this.unregisterWebhook(name));
        }

        return Promise.all(stopPromises);
    }
}

module.exports = WebhookManager;