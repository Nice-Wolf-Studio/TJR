/**
 * Error Recovery and Retry Logic System
 * Handles error recovery, circuit breakers, and retry mechanisms
 */

const EventEmitter = require('events');
const logger = require('./logger');

class ErrorRecoveryManager extends EventEmitter {
    constructor() {
        super();
        this.circuitBreakers = new Map();
        this.retryConfigs = new Map();
        this.errorStats = new Map();
        this.recoveryStrategies = new Map();

        this.setupDefaultConfigs();
        this.setupDefaultStrategies();
    }

    /**
     * Setup default retry configurations
     */
    setupDefaultConfigs() {
        // Default retry configurations for different operations
        this.retryConfigs.set('database', {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 30000,
            backoffFactor: 2,
            jitter: true,
            retryableErrors: ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'CONNECTION_REFUSED']
        });

        this.retryConfigs.set('api', {
            maxRetries: 5,
            baseDelay: 500,
            maxDelay: 10000,
            backoffFactor: 1.5,
            jitter: true,
            retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', '500', '502', '503', '504', '429']
        });

        this.retryConfigs.set('data_collection', {
            maxRetries: 3,
            baseDelay: 2000,
            maxDelay: 60000,
            backoffFactor: 2,
            jitter: true,
            retryableErrors: ['RATE_LIMIT_EXCEEDED', 'TIMEOUT', 'NETWORK_ERROR']
        });

        this.retryConfigs.set('file_operation', {
            maxRetries: 2,
            baseDelay: 100,
            maxDelay: 5000,
            backoffFactor: 2,
            jitter: false,
            retryableErrors: ['EBUSY', 'EMFILE', 'ENFILE']
        });
    }

    /**
     * Setup default recovery strategies
     */
    setupDefaultStrategies() {
        // Database recovery strategies
        this.recoveryStrategies.set('database_connection', async (error, context) => {
            logger.warn('Database connection lost, attempting recovery...', { error: error.message });

            // Try to reconnect
            try {
                const dbConnection = require('../database/connection');
                await dbConnection.initialize();
                logger.info('Database connection recovered successfully');
                return { recovered: true, strategy: 'reconnect' };
            } catch (recoveryError) {
                logger.error('Database recovery failed:', recoveryError);
                return { recovered: false, strategy: 'reconnect', error: recoveryError.message };
            }
        });

        // Redis recovery strategies
        this.recoveryStrategies.set('redis_connection', async (error, context) => {
            logger.warn('Redis connection lost, attempting recovery...', { error: error.message });

            try {
                const storage = require('../data/storage');
                await storage.initializeRedis();
                logger.info('Redis connection recovered successfully');
                return { recovered: true, strategy: 'reconnect' };
            } catch (recoveryError) {
                logger.error('Redis recovery failed, continuing without cache:', recoveryError);
                return { recovered: false, strategy: 'graceful_degradation' };
            }
        });

        // Data source recovery strategies
        this.recoveryStrategies.set('data_source_error', async (error, context) => {
            const { sourceName } = context || {};

            logger.warn(`Data source ${sourceName} error, attempting recovery...`, { error: error.message });

            // Apply exponential backoff penalty
            if (sourceName) {
                try {
                    const rateLimit = require('./rateLimit');
                    const limiter = rateLimit.get(sourceName);
                    if (limiter) {
                        await limiter.penalty(sourceName, 5); // Apply 5-point penalty
                    }
                } catch (rateLimitError) {
                    logger.debug('Could not apply rate limit penalty:', rateLimitError);
                }
            }

            return { recovered: false, strategy: 'backoff_penalty' };
        });
    }

    /**
     * Execute function with retry logic and error handling
     */
    async executeWithRetry(fn, context = {}) {
        const {
            operation = 'default',
            maxRetries = null,
            onRetry = null,
            onFailure = null,
            ...customConfig
        } = context;

        const config = this.getRetryConfig(operation, customConfig);
        let lastError = null;

        for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
            try {
                const startTime = Date.now();

                // Check circuit breaker
                if (this.isCircuitBreakerOpen(operation)) {
                    throw new Error(`Circuit breaker open for operation: ${operation}`);
                }

                // Execute the function
                const result = await fn();

                // Record success
                this.recordSuccess(operation, Date.now() - startTime);

                logger.debug(`Operation ${operation} succeeded on attempt ${attempt + 1}`);
                return result;

            } catch (error) {
                lastError = error;

                // Record error
                this.recordError(operation, error, attempt);

                // Check if error is retryable
                if (!this.isRetryableError(error, config) || attempt >= config.maxRetries) {
                    break;
                }

                // Calculate delay
                const delay = this.calculateDelay(attempt, config);

                logger.warn(`Operation ${operation} failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms`, {
                    error: error.message,
                    attempt: attempt + 1,
                    maxRetries: config.maxRetries + 1
                });

                // Call retry callback if provided
                if (onRetry) {
                    try {
                        await onRetry(error, attempt, delay);
                    } catch (callbackError) {
                        logger.error('Retry callback error:', callbackError);
                    }
                }

                // Wait before retry
                await this.delay(delay);
            }
        }

        // All retries exhausted
        logger.error(`Operation ${operation} failed after ${config.maxRetries + 1} attempts:`, lastError);

        // Attempt recovery
        const recoveryResult = await this.attemptRecovery(operation, lastError, context);

        // Call failure callback if provided
        if (onFailure) {
            try {
                await onFailure(lastError, config.maxRetries + 1, recoveryResult);
            } catch (callbackError) {
                logger.error('Failure callback error:', callbackError);
            }
        }

        // Update circuit breaker
        this.updateCircuitBreaker(operation, false);

        throw lastError;
    }

    /**
     * Get retry configuration for operation
     */
    getRetryConfig(operation, customConfig = {}) {
        const defaultConfig = this.retryConfigs.get(operation) || this.retryConfigs.get('default') || {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 30000,
            backoffFactor: 2,
            jitter: true,
            retryableErrors: []
        };

        return { ...defaultConfig, ...customConfig };
    }

    /**
     * Check if error is retryable
     */
    isRetryableError(error, config) {
        if (!config.retryableErrors || config.retryableErrors.length === 0) {
            return true; // Retry all errors if no specific list
        }

        const errorString = error.message || error.code || error.name || String(error);

        return config.retryableErrors.some(retryableError => {
            if (typeof retryableError === 'string') {
                return errorString.includes(retryableError);
            } else if (retryableError instanceof RegExp) {
                return retryableError.test(errorString);
            }
            return false;
        });
    }

    /**
     * Calculate retry delay with exponential backoff and jitter
     */
    calculateDelay(attempt, config) {
        let delay = config.baseDelay * Math.pow(config.backoffFactor, attempt);

        // Apply maximum delay cap
        delay = Math.min(delay, config.maxDelay);

        // Add jitter if enabled
        if (config.jitter) {
            delay = delay * (0.5 + Math.random() * 0.5);
        }

        return Math.floor(delay);
    }

    /**
     * Create a delay promise
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Record successful operation
     */
    recordSuccess(operation, duration) {
        if (!this.errorStats.has(operation)) {
            this.errorStats.set(operation, {
                successes: 0,
                errors: 0,
                lastSuccess: null,
                lastError: null,
                avgDuration: 0
            });
        }

        const stats = this.errorStats.get(operation);
        stats.successes++;
        stats.lastSuccess = new Date();
        stats.avgDuration = (stats.avgDuration * (stats.successes - 1) + duration) / stats.successes;

        this.updateCircuitBreaker(operation, true);
        this.emit('operationSuccess', { operation, duration, stats });
    }

    /**
     * Record failed operation
     */
    recordError(operation, error, attempt) {
        if (!this.errorStats.has(operation)) {
            this.errorStats.set(operation, {
                successes: 0,
                errors: 0,
                lastSuccess: null,
                lastError: null,
                avgDuration: 0,
                errorTypes: {}
            });
        }

        const stats = this.errorStats.get(operation);
        stats.errors++;
        stats.lastError = new Date();

        // Track error types
        const errorType = error.name || error.code || 'Unknown';
        stats.errorTypes[errorType] = (stats.errorTypes[errorType] || 0) + 1;

        this.emit('operationError', { operation, error, attempt, stats });
    }

    /**
     * Circuit breaker implementation
     */
    isCircuitBreakerOpen(operation) {
        const breaker = this.circuitBreakers.get(operation);
        if (!breaker) {
            return false;
        }

        const now = Date.now();

        // Check if circuit should be closed (recovery period)
        if (breaker.state === 'open' && now >= breaker.nextAttempt) {
            breaker.state = 'half-open';
            logger.info(`Circuit breaker half-open for operation: ${operation}`);
        }

        return breaker.state === 'open';
    }

    /**
     * Update circuit breaker state
     */
    updateCircuitBreaker(operation, success) {
        const stats = this.errorStats.get(operation);
        if (!stats) return;

        const totalOperations = stats.successes + stats.errors;
        const errorRate = totalOperations > 0 ? stats.errors / totalOperations : 0;

        let breaker = this.circuitBreakers.get(operation);
        if (!breaker) {
            breaker = {
                state: 'closed',
                errorThreshold: 0.5, // 50% error rate
                minRequests: 10,
                timeout: 60000, // 1 minute
                nextAttempt: 0
            };
            this.circuitBreakers.set(operation, breaker);
        }

        if (success) {
            if (breaker.state === 'half-open') {
                breaker.state = 'closed';
                logger.info(`Circuit breaker closed for operation: ${operation}`);
            }
        } else if (totalOperations >= breaker.minRequests && errorRate >= breaker.errorThreshold) {
            if (breaker.state !== 'open') {
                breaker.state = 'open';
                breaker.nextAttempt = Date.now() + breaker.timeout;
                logger.warn(`Circuit breaker opened for operation: ${operation} (error rate: ${(errorRate * 100).toFixed(1)}%)`);

                this.emit('circuitBreakerOpened', { operation, errorRate, totalOperations });
            }
        }
    }

    /**
     * Attempt error recovery
     */
    async attemptRecovery(operation, error, context) {
        const strategyName = context.recoveryStrategy || this.detectRecoveryStrategy(error, context);

        if (!strategyName) {
            return { recovered: false, strategy: 'none' };
        }

        const strategy = this.recoveryStrategies.get(strategyName);
        if (!strategy) {
            logger.warn(`Recovery strategy not found: ${strategyName}`);
            return { recovered: false, strategy: strategyName };
        }

        try {
            logger.info(`Attempting recovery with strategy: ${strategyName}`);
            const result = await strategy(error, context);

            if (result.recovered) {
                this.emit('recoverySuccess', { operation, strategy: strategyName, result });
            } else {
                this.emit('recoveryFailure', { operation, strategy: strategyName, result });
            }

            return result;

        } catch (recoveryError) {
            logger.error(`Recovery strategy ${strategyName} failed:`, recoveryError);
            return { recovered: false, strategy: strategyName, error: recoveryError.message };
        }
    }

    /**
     * Detect appropriate recovery strategy based on error
     */
    detectRecoveryStrategy(error, context) {
        const errorString = error.message || error.code || error.name || String(error);

        if (errorString.includes('database') || errorString.includes('connection')) {
            return 'database_connection';
        }

        if (errorString.includes('redis') || errorString.includes('cache')) {
            return 'redis_connection';
        }

        if (context.sourceName || errorString.includes('api')) {
            return 'data_source_error';
        }

        return null;
    }

    /**
     * Register custom recovery strategy
     */
    registerRecoveryStrategy(name, strategyFunction) {
        this.recoveryStrategies.set(name, strategyFunction);
        logger.info(`Registered recovery strategy: ${name}`);
    }

    /**
     * Register custom retry configuration
     */
    registerRetryConfig(operation, config) {
        this.retryConfigs.set(operation, config);
        logger.info(`Registered retry config for operation: ${operation}`);
    }

    /**
     * Get error statistics
     */
    getErrorStats(operation = null) {
        if (operation) {
            return this.errorStats.get(operation) || null;
        }

        const stats = {};
        for (const [op, stat] of this.errorStats) {
            stats[op] = stat;
        }
        return stats;
    }

    /**
     * Get circuit breaker status
     */
    getCircuitBreakerStatus(operation = null) {
        if (operation) {
            return this.circuitBreakers.get(operation) || null;
        }

        const status = {};
        for (const [op, breaker] of this.circuitBreakers) {
            status[op] = breaker;
        }
        return status;
    }

    /**
     * Reset circuit breaker
     */
    resetCircuitBreaker(operation) {
        if (this.circuitBreakers.has(operation)) {
            const breaker = this.circuitBreakers.get(operation);
            breaker.state = 'closed';
            breaker.nextAttempt = 0;
            logger.info(`Circuit breaker reset for operation: ${operation}`);
        }
    }

    /**
     * Clear error statistics
     */
    clearStats(operation = null) {
        if (operation) {
            this.errorStats.delete(operation);
            this.circuitBreakers.delete(operation);
            logger.info(`Cleared error stats for operation: ${operation}`);
        } else {
            this.errorStats.clear();
            this.circuitBreakers.clear();
            logger.info('Cleared all error statistics');
        }
    }

    /**
     * Health check for error recovery system
     */
    healthCheck() {
        const openCircuits = Array.from(this.circuitBreakers.entries())
            .filter(([, breaker]) => breaker.state === 'open');

        const recentErrors = Array.from(this.errorStats.entries())
            .filter(([, stats]) => {
                const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
                return stats.lastError && stats.lastError > fiveMinutesAgo;
            });

        const status = openCircuits.length === 0 ? 'healthy' : 'warning';

        return {
            status: status,
            message: status === 'healthy' ? 'Error recovery system healthy' : 'Circuit breakers open',
            details: {
                totalOperations: this.errorStats.size,
                openCircuits: openCircuits.length,
                recentErrors: recentErrors.length,
                circuitBreakers: Object.fromEntries(openCircuits)
            }
        };
    }
}

module.exports = new ErrorRecoveryManager();