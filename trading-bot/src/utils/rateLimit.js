/**
 * Rate Limiting and API Management System
 * Manages API rate limits for multiple data sources
 */

const { RateLimiterRedis, RateLimiterMemory } = require('rate-limiter-flexible');
const redis = require('redis');
const logger = require('./logger');

class RateLimitManager {
    constructor() {
        this.limiters = new Map();
        this.redisClient = null;
        this.isRedisConnected = false;
        this.stats = {
            requests: 0,
            blocked: 0,
            sources: {}
        };

        // Default rate limit configurations for different sources
        this.defaultConfigs = {
            polygon: {
                points: 5, // Number of requests
                duration: 60, // Per 60 seconds
                blockDuration: 60, // Block for 60 seconds when exceeded
                execEvenly: true
            },
            alphavantage: {
                points: 5, // Free tier: 5 requests per minute
                duration: 60,
                blockDuration: 60,
                execEvenly: true
            },
            tradingview: {
                points: 100, // More lenient for web scraping
                duration: 60,
                blockDuration: 30,
                execEvenly: false
            },
            default: {
                points: 10,
                duration: 60,
                blockDuration: 60,
                execEvenly: true
            }
        };
    }

    /**
     * Initialize Redis connection for distributed rate limiting
     */
    async initializeRedis() {
        try {
            if (process.env.REDIS_HOST) {
                const redisConfig = {
                    host: process.env.REDIS_HOST,
                    port: parseInt(process.env.REDIS_PORT) || 6379,
                    password: process.env.REDIS_PASSWORD,
                    db: parseInt(process.env.REDIS_DB) || 1, // Use different DB for rate limiting
                    retryDelayOnFailover: 100,
                    retryConnectOnFailover: true,
                    maxRetriesPerRequest: 3
                };

                this.redisClient = redis.createClient(redisConfig);

                this.redisClient.on('connect', () => {
                    logger.info('Rate limiter Redis client connected');
                });

                this.redisClient.on('ready', () => {
                    logger.info('Rate limiter Redis client ready');
                    this.isRedisConnected = true;
                });

                this.redisClient.on('error', (error) => {
                    logger.error('Rate limiter Redis error:', error);
                    this.isRedisConnected = false;
                });

                await this.redisClient.connect();
                await this.redisClient.ping();

                logger.info('Rate limiting Redis initialized successfully');
            }
        } catch (error) {
            logger.warn('Failed to initialize Redis for rate limiting, falling back to memory:', error);
            this.isRedisConnected = false;
        }
    }

    /**
     * Create a rate limiter for a specific source
     */
    create(sourceName, customConfig = {}) {
        const config = {
            ...this.defaultConfigs[sourceName] || this.defaultConfigs.default,
            ...customConfig
        };

        let rateLimiter;

        if (this.isRedisConnected && this.redisClient) {
            // Use Redis-based rate limiter for distributed systems
            rateLimiter = new RateLimiterRedis({
                storeClient: this.redisClient,
                keyPrefix: `rl_${sourceName}`,
                points: config.points,
                duration: config.duration,
                blockDuration: config.blockDuration,
                execEvenly: config.execEvenly
            });

            logger.debug(`Created Redis-based rate limiter for ${sourceName}:`, config);
        } else {
            // Fallback to memory-based rate limiter
            rateLimiter = new RateLimiterMemory({
                points: config.points,
                duration: config.duration,
                blockDuration: config.blockDuration,
                execEvenly: config.execEvenly
            });

            logger.debug(`Created memory-based rate limiter for ${sourceName}:`, config);
        }

        // Wrap the rate limiter with additional functionality
        const wrappedLimiter = {
            limiter: rateLimiter,
            source: sourceName,
            config: config,
            stats: {
                requests: 0,
                blocked: 0,
                lastRequest: null,
                lastBlock: null
            },

            async consume(key, points = 1) {
                try {
                    const result = await rateLimiter.consume(key || sourceName, points);

                    this.stats.requests++;
                    this.stats.lastRequest = new Date();

                    // Update global stats
                    if (!this.manager.stats.sources[sourceName]) {
                        this.manager.stats.sources[sourceName] = { requests: 0, blocked: 0 };
                    }
                    this.manager.stats.sources[sourceName].requests++;
                    this.manager.stats.requests++;

                    logger.debug(`Rate limit consumed for ${sourceName}: ${result.remainingHits}/${config.points} remaining`);

                    return {
                        allowed: true,
                        remainingHits: result.remainingHits,
                        msBeforeNext: result.msBeforeNext,
                        totalHits: result.totalHits
                    };

                } catch (rateLimiterRes) {
                    // Rate limit exceeded
                    this.stats.blocked++;
                    this.stats.lastBlock = new Date();

                    if (!this.manager.stats.sources[sourceName]) {
                        this.manager.stats.sources[sourceName] = { requests: 0, blocked: 0 };
                    }
                    this.manager.stats.sources[sourceName].blocked++;
                    this.manager.stats.blocked++;

                    const blockDuration = rateLimiterRes.msBeforeNext || config.blockDuration * 1000;

                    logger.warn(`Rate limit exceeded for ${sourceName}, blocked for ${blockDuration}ms`);

                    return {
                        allowed: false,
                        msBeforeNext: blockDuration,
                        remainingHits: rateLimiterRes.remainingHits || 0,
                        totalHits: rateLimiterRes.totalHits || config.points
                    };
                }
            },

            async penalty(key, points = 1) {
                try {
                    await rateLimiter.penalty(key || sourceName, points);
                    logger.debug(`Applied penalty of ${points} points to ${sourceName}`);
                } catch (error) {
                    logger.error(`Failed to apply penalty to ${sourceName}:`, error);
                }
            },

            async reward(key, points = 1) {
                try {
                    await rateLimiter.reward(key || sourceName, points);
                    logger.debug(`Applied reward of ${points} points to ${sourceName}`);
                } catch (error) {
                    logger.error(`Failed to apply reward to ${sourceName}:`, error);
                }
            },

            async get(key) {
                try {
                    const result = await rateLimiter.get(key || sourceName);
                    return result ? {
                        remainingHits: result.remainingHits,
                        msBeforeNext: result.msBeforeNext,
                        totalHits: result.totalHits
                    } : null;
                } catch (error) {
                    logger.error(`Failed to get rate limit info for ${sourceName}:`, error);
                    return null;
                }
            },

            getStatus() {
                return {
                    source: sourceName,
                    config: config,
                    stats: this.stats,
                    type: this.manager.isRedisConnected ? 'redis' : 'memory'
                };
            }
        };

        // Add reference to manager
        wrappedLimiter.manager = this;

        this.limiters.set(sourceName, wrappedLimiter);

        // Initialize source stats
        if (!this.stats.sources[sourceName]) {
            this.stats.sources[sourceName] = { requests: 0, blocked: 0 };
        }

        logger.info(`Rate limiter created for ${sourceName}`);

        return wrappedLimiter;
    }

    /**
     * Get existing rate limiter
     */
    get(sourceName) {
        return this.limiters.get(sourceName);
    }

    /**
     * Check if rate limit allows request without consuming
     */
    async check(sourceName, key = null) {
        const limiter = this.limiters.get(sourceName);
        if (!limiter) {
            logger.warn(`No rate limiter found for ${sourceName}`);
            return { allowed: true };
        }

        try {
            const status = await limiter.get(key || sourceName);
            return {
                allowed: !status || status.remainingHits > 0,
                remainingHits: status?.remainingHits || limiter.config.points,
                msBeforeNext: status?.msBeforeNext || 0,
                totalHits: status?.totalHits || 0
            };
        } catch (error) {
            logger.error(`Error checking rate limit for ${sourceName}:`, error);
            return { allowed: true }; // Default to allowed on error
        }
    }

    /**
     * Advanced rate limiting with adaptive behavior
     */
    async consumeWithBackoff(sourceName, key = null, options = {}) {
        const {
            maxRetries = 3,
            baseDelay = 1000,
            backoffFactor = 2,
            jitter = true
        } = options;

        const limiter = this.limiters.get(sourceName);
        if (!limiter) {
            throw new Error(`No rate limiter found for ${sourceName}`);
        }

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const result = await limiter.consume(key);

            if (result.allowed) {
                return result;
            }

            // Calculate delay with exponential backoff and optional jitter
            let delay = Math.min(result.msBeforeNext, baseDelay * Math.pow(backoffFactor, attempt));

            if (jitter) {
                delay = delay * (0.5 + Math.random() * 0.5); // Add jitter (50-100% of delay)
            }

            if (attempt < maxRetries - 1) {
                logger.debug(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw new Error(`Rate limit exceeded for ${sourceName} after ${maxRetries} attempts`);
    }

    /**
     * Bulk rate limiting for multiple requests
     */
    async consumeBulk(sourceName, requests, key = null) {
        const limiter = this.limiters.get(sourceName);
        if (!limiter) {
            throw new Error(`No rate limiter found for ${sourceName}`);
        }

        const results = [];
        const errors = [];

        for (const request of requests) {
            try {
                const result = await limiter.consume(key, request.points || 1);
                results.push({
                    request: request,
                    result: result,
                    success: result.allowed
                });

                // If rate limited, add delay before next request
                if (!result.allowed && request !== requests[requests.length - 1]) {
                    await new Promise(resolve => setTimeout(resolve, result.msBeforeNext));
                }
            } catch (error) {
                errors.push({
                    request: request,
                    error: error.message
                });
            }
        }

        return {
            results: results,
            errors: errors,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length + errors.length
        };
    }

    /**
     * Dynamic rate limit adjustment based on API response
     */
    async adjustLimits(sourceName, apiResponse) {
        const limiter = this.limiters.get(sourceName);
        if (!limiter) return;

        // Check for rate limit headers in API response
        const rateLimitHeaders = {
            remaining: apiResponse.headers['x-ratelimit-remaining'] ||
                      apiResponse.headers['x-rate-limit-remaining'],
            reset: apiResponse.headers['x-ratelimit-reset'] ||
                  apiResponse.headers['x-rate-limit-reset'],
            limit: apiResponse.headers['x-ratelimit-limit'] ||
                  apiResponse.headers['x-rate-limit-limit']
        };

        if (rateLimitHeaders.remaining !== undefined) {
            const remaining = parseInt(rateLimitHeaders.remaining);

            if (remaining === 0) {
                // Apply penalty to prevent further requests
                await limiter.penalty(sourceName, 10);
                logger.warn(`Applied penalty to ${sourceName} due to rate limit exhaustion`);
            } else if (remaining < 5) {
                // Apply smaller penalty when close to limit
                await limiter.penalty(sourceName, 2);
                logger.debug(`Applied small penalty to ${sourceName} (${remaining} requests remaining)`);
            }
        }

        // Check for 429 Too Many Requests status
        if (apiResponse.status === 429) {
            const retryAfter = apiResponse.headers['retry-after'];
            const penaltyDuration = retryAfter ? parseInt(retryAfter) * 1000 : 60000;

            await limiter.penalty(sourceName, Math.ceil(penaltyDuration / 1000));
            logger.warn(`Applied ${penaltyDuration}ms penalty to ${sourceName} for 429 response`);
        }
    }

    /**
     * Get comprehensive statistics
     */
    getStats() {
        const limiterStats = {};

        for (const [sourceName, limiter] of this.limiters) {
            limiterStats[sourceName] = limiter.getStatus();
        }

        return {
            global: this.stats,
            limiters: limiterStats,
            redis: {
                connected: this.isRedisConnected,
                client: this.redisClient ? 'available' : 'unavailable'
            }
        };
    }

    /**
     * Health check for rate limiting system
     */
    async healthCheck() {
        try {
            const stats = this.getStats();

            // Test Redis connection if available
            let redisStatus = 'not_configured';
            if (this.redisClient) {
                try {
                    await this.redisClient.ping();
                    redisStatus = 'healthy';
                } catch (error) {
                    redisStatus = 'unhealthy';
                }
            }

            return {
                status: 'healthy',
                limiters: this.limiters.size,
                redis: redisStatus,
                stats: stats
            };

        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    /**
     * Reset all rate limits (use with caution)
     */
    async reset(sourceName = null) {
        if (sourceName) {
            const limiter = this.limiters.get(sourceName);
            if (limiter) {
                try {
                    await limiter.limiter.delete(sourceName);
                    limiter.stats = { requests: 0, blocked: 0, lastRequest: null, lastBlock: null };
                    logger.info(`Reset rate limits for ${sourceName}`);
                } catch (error) {
                    logger.error(`Failed to reset rate limits for ${sourceName}:`, error);
                }
            }
        } else {
            // Reset all limiters
            for (const [name, limiter] of this.limiters) {
                try {
                    await limiter.limiter.delete(name);
                    limiter.stats = { requests: 0, blocked: 0, lastRequest: null, lastBlock: null };
                } catch (error) {
                    logger.error(`Failed to reset rate limits for ${name}:`, error);
                }
            }

            // Reset global stats
            this.stats = {
                requests: 0,
                blocked: 0,
                sources: {}
            };

            logger.info('Reset all rate limits');
        }
    }

    /**
     * Graceful shutdown
     */
    async close() {
        if (this.redisClient && this.isRedisConnected) {
            try {
                await this.redisClient.quit();
                logger.info('Rate limiter Redis connection closed');
            } catch (error) {
                logger.error('Error closing rate limiter Redis connection:', error);
            }
        }
    }
}

// Export singleton instance
module.exports = new RateLimitManager();