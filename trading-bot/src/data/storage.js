/**
 * Database and Redis Storage Operations
 * Handles data storage, caching, and retrieval operations
 */

const dbConnection = require('../database/connection');
const redis = require('redis');
const logger = require('../utils/logger');

class StorageManager {
    constructor() {
        this.redisClient = null;
        this.isRedisConnected = false;
        this.batchSize = 1000; // Batch size for bulk operations
        this.cacheKeyPrefix = 'trading_bot:';
        this.cacheTTL = {
            priceData: 300, // 5 minutes
            analysis: 1800, // 30 minutes
            markets: 3600, // 1 hour
            confluences: 900 // 15 minutes
        };
    }

    /**
     * Initialize Redis connection
     */
    async initializeRedis() {
        try {
            const redisConfig = {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT) || 6379,
                password: process.env.REDIS_PASSWORD,
                db: parseInt(process.env.REDIS_DB) || 0,
                retryDelayOnFailover: 100,
                retryDelayOnClusterDown: 300,
                retryConnectOnFailover: true,
                maxRetriesPerRequest: 3,
                lazyConnect: true
            };

            this.redisClient = redis.createClient(redisConfig);

            // Redis event handlers
            this.redisClient.on('connect', () => {
                logger.info('Redis client connected');
            });

            this.redisClient.on('ready', () => {
                logger.info('Redis client ready');
                this.isRedisConnected = true;
            });

            this.redisClient.on('error', (error) => {
                logger.error('Redis error:', error);
                this.isRedisConnected = false;
            });

            this.redisClient.on('end', () => {
                logger.warn('Redis connection ended');
                this.isRedisConnected = false;
            });

            // Connect to Redis
            await this.redisClient.connect();

            // Test connection
            await this.redisClient.ping();
            logger.info('Redis storage initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize Redis:', error);
            this.isRedisConnected = false;
            // Don't throw error - Redis is optional
        }
    }

    /**
     * Store price data in database and cache
     */
    async storePriceData(priceData, marketId, source) {
        if (!Array.isArray(priceData) || priceData.length === 0) {
            return { stored: 0, errors: [] };
        }

        logger.debug(`Storing ${priceData.length} price records for market ${marketId}`);

        const results = {
            stored: 0,
            errors: [],
            cached: 0
        };

        try {
            // Store in database using batch insert
            const batchResults = await this.batchInsertPriceData(priceData, marketId, source);
            results.stored = batchResults.stored;
            results.errors = batchResults.errors;

            // Cache recent data in Redis
            if (this.isRedisConnected && results.stored > 0) {
                const cacheResults = await this.cachePriceData(priceData, marketId, source);
                results.cached = cacheResults.cached;
            }

            logger.debug(`Storage completed: ${results.stored} stored, ${results.cached} cached`);

        } catch (error) {
            logger.error('Error storing price data:', error);
            results.errors.push(error.message);
        }

        return results;
    }

    /**
     * Batch insert price data to database
     */
    async batchInsertPriceData(priceData, marketId, source) {
        const results = { stored: 0, errors: [] };

        try {
            // Process in batches to avoid overwhelming the database
            const batches = this.chunkArray(priceData, this.batchSize);

            for (const batch of batches) {
                try {
                    await dbConnection.transactionWrapper(async (client) => {
                        const values = [];
                        const placeholders = [];

                        batch.forEach((record, index) => {
                            const baseIndex = index * 12;
                            placeholders.push(
                                `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11}, $${baseIndex + 12})`
                            );

                            values.push(
                                marketId,
                                record.timestamp,
                                record.open_price,
                                record.high_price,
                                record.low_price,
                                record.close_price,
                                record.volume || 0,
                                record.tick_volume || 0,
                                record.spread,
                                record.session,
                                source,
                                record.quality_score || 1.0
                            );
                        });

                        const query = `
                            INSERT INTO price_data (
                                market_id, timestamp, open_price, high_price, low_price,
                                close_price, volume, tick_volume, spread, session,
                                data_source, quality_score
                            ) VALUES ${placeholders.join(', ')}
                            ON CONFLICT (market_id, timestamp, data_source)
                            DO UPDATE SET
                                open_price = EXCLUDED.open_price,
                                high_price = EXCLUDED.high_price,
                                low_price = EXCLUDED.low_price,
                                close_price = EXCLUDED.close_price,
                                volume = EXCLUDED.volume,
                                tick_volume = EXCLUDED.tick_volume,
                                spread = EXCLUDED.spread,
                                session = EXCLUDED.session,
                                quality_score = EXCLUDED.quality_score
                        `;

                        const result = await client.query(query, values);
                        results.stored += batch.length;
                    });

                } catch (batchError) {
                    logger.error('Batch insert error:', batchError);
                    results.errors.push(`Batch error: ${batchError.message}`);
                }
            }

        } catch (error) {
            logger.error('Error in batch insert process:', error);
            results.errors.push(error.message);
        }

        return results;
    }

    /**
     * Cache price data in Redis
     */
    async cachePriceData(priceData, marketId, source) {
        if (!this.isRedisConnected) {
            return { cached: 0 };
        }

        try {
            const cacheKey = `${this.cacheKeyPrefix}price:${marketId}:${source}`;

            // Sort by timestamp and keep only the latest 100 records for cache
            const sortedData = priceData
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 100);

            // Store as JSON
            await this.redisClient.setEx(
                cacheKey,
                this.cacheTTL.priceData,
                JSON.stringify(sortedData)
            );

            // Also cache the latest price separately for quick access
            if (sortedData.length > 0) {
                const latestPriceKey = `${this.cacheKeyPrefix}latest_price:${marketId}:${source}`;
                await this.redisClient.setEx(
                    latestPriceKey,
                    this.cacheTTL.priceData,
                    JSON.stringify(sortedData[0])
                );
            }

            return { cached: sortedData.length };

        } catch (error) {
            logger.error('Error caching price data:', error);
            return { cached: 0 };
        }
    }

    /**
     * Get price data from cache or database
     */
    async getPriceData(marketId, timeframe, options = {}) {
        const {
            source = null,
            limit = 100,
            startTime = null,
            endTime = null,
            useCache = true
        } = options;

        try {
            // Try cache first if enabled
            if (useCache && this.isRedisConnected) {
                const cachedData = await this.getCachedPriceData(marketId, source);
                if (cachedData && cachedData.length > 0) {
                    logger.debug(`Retrieved ${cachedData.length} price records from cache`);
                    return this.filterPriceData(cachedData, { startTime, endTime, limit });
                }
            }

            // Fallback to database
            const dbData = await this.getPriceDataFromDB(marketId, {
                source,
                limit,
                startTime,
                endTime
            });

            logger.debug(`Retrieved ${dbData.length} price records from database`);
            return dbData;

        } catch (error) {
            logger.error('Error getting price data:', error);
            return [];
        }
    }

    /**
     * Get cached price data
     */
    async getCachedPriceData(marketId, source = null) {
        if (!this.isRedisConnected) {
            return null;
        }

        try {
            const cacheKey = source ?
                `${this.cacheKeyPrefix}price:${marketId}:${source}` :
                `${this.cacheKeyPrefix}price:${marketId}:*`;

            if (source) {
                const cached = await this.redisClient.get(cacheKey);
                return cached ? JSON.parse(cached) : null;
            } else {
                // Get all sources for this market
                const keys = await this.redisClient.keys(cacheKey);
                const results = [];

                for (const key of keys) {
                    const cached = await this.redisClient.get(key);
                    if (cached) {
                        results.push(...JSON.parse(cached));
                    }
                }

                return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            }

        } catch (error) {
            logger.error('Error getting cached price data:', error);
            return null;
        }
    }

    /**
     * Get price data from database
     */
    async getPriceDataFromDB(marketId, options = {}) {
        const {
            source = null,
            limit = 100,
            startTime = null,
            endTime = null
        } = options;

        try {
            let query = `
                SELECT timestamp, open_price, high_price, low_price, close_price,
                       volume, tick_volume, spread, session, data_source, quality_score
                FROM price_data
                WHERE market_id = $1
            `;

            const params = [marketId];
            let paramIndex = 2;

            if (source) {
                query += ` AND data_source = $${paramIndex}`;
                params.push(source);
                paramIndex++;
            }

            if (startTime) {
                query += ` AND timestamp >= $${paramIndex}`;
                params.push(startTime);
                paramIndex++;
            }

            if (endTime) {
                query += ` AND timestamp <= $${paramIndex}`;
                params.push(endTime);
                paramIndex++;
            }

            query += ` ORDER BY timestamp DESC LIMIT $${paramIndex}`;
            params.push(limit);

            const result = await dbConnection.query(query, params);

            return result.rows.map(row => ({
                ...row,
                timestamp: new Date(row.timestamp)
            }));

        } catch (error) {
            logger.error('Error querying price data from database:', error);
            return [];
        }
    }

    /**
     * Store liquidity levels
     */
    async storeLiquidityLevels(liquidityData, marketId) {
        if (!Array.isArray(liquidityData) || liquidityData.length === 0) {
            return { stored: 0, errors: [] };
        }

        const results = { stored: 0, errors: [] };

        try {
            for (const level of liquidityData) {
                try {
                    const result = await dbConnection.query(`
                        INSERT INTO liquidity_levels (
                            market_id, level_price, level_type, strength, touches,
                            session, timeframe, identified_at, last_tested,
                            is_active, confluence_factors
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        ON CONFLICT (market_id, level_price, level_type, timeframe)
                        DO UPDATE SET
                            strength = EXCLUDED.strength,
                            touches = liquidity_levels.touches + 1,
                            last_tested = EXCLUDED.last_tested,
                            is_active = EXCLUDED.is_active,
                            confluence_factors = EXCLUDED.confluence_factors,
                            updated_at = NOW()
                        RETURNING id
                    `, [
                        marketId,
                        level.level_price,
                        level.level_type,
                        level.strength,
                        level.touches || 1,
                        level.session,
                        level.timeframe,
                        level.identified_at || new Date(),
                        level.last_tested,
                        level.is_active !== undefined ? level.is_active : true,
                        level.confluence_factors ? JSON.stringify(level.confluence_factors) : null
                    ]);

                    results.stored++;

                } catch (error) {
                    logger.error('Error storing liquidity level:', error);
                    results.errors.push(error.message);
                }
            }

            // Cache liquidity levels
            if (this.isRedisConnected && results.stored > 0) {
                await this.cacheLiquidityLevels(liquidityData, marketId);
            }

        } catch (error) {
            logger.error('Error storing liquidity levels:', error);
            results.errors.push(error.message);
        }

        return results;
    }

    /**
     * Store confluences
     */
    async storeConfluences(confluenceData, marketId) {
        if (!Array.isArray(confluenceData) || confluenceData.length === 0) {
            return { stored: 0, errors: [] };
        }

        const results = { stored: 0, errors: [] };

        try {
            for (const confluence of confluenceData) {
                try {
                    const result = await dbConnection.query(`
                        INSERT INTO confluences (
                            market_id, timestamp, confluence_type, weight, score,
                            direction, session, timeframe, details, is_valid, expires_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        RETURNING id
                    `, [
                        marketId,
                        confluence.timestamp,
                        confluence.confluence_type,
                        confluence.weight,
                        confluence.score,
                        confluence.direction,
                        confluence.session,
                        confluence.timeframe,
                        JSON.stringify(confluence.details),
                        confluence.is_valid !== undefined ? confluence.is_valid : true,
                        confluence.expires_at
                    ]);

                    results.stored++;

                } catch (error) {
                    logger.error('Error storing confluence:', error);
                    results.errors.push(error.message);
                }
            }

            // Cache confluences
            if (this.isRedisConnected && results.stored > 0) {
                await this.cacheConfluences(confluenceData, marketId);
            }

        } catch (error) {
            logger.error('Error storing confluences:', error);
            results.errors.push(error.message);
        }

        return results;
    }

    /**
     * Cache liquidity levels
     */
    async cacheLiquidityLevels(liquidityData, marketId) {
        if (!this.isRedisConnected) return;

        try {
            const cacheKey = `${this.cacheKeyPrefix}liquidity:${marketId}`;
            await this.redisClient.setEx(
                cacheKey,
                this.cacheTTL.analysis,
                JSON.stringify(liquidityData)
            );

        } catch (error) {
            logger.error('Error caching liquidity levels:', error);
        }
    }

    /**
     * Cache confluences
     */
    async cacheConfluences(confluenceData, marketId) {
        if (!this.isRedisConnected) return;

        try {
            const cacheKey = `${this.cacheKeyPrefix}confluences:${marketId}`;
            await this.redisClient.setEx(
                cacheKey,
                this.cacheTTL.confluences,
                JSON.stringify(confluenceData)
            );

        } catch (error) {
            logger.error('Error caching confluences:', error);
        }
    }

    /**
     * Get active markets from cache or database
     */
    async getActiveMarkets(useCache = true) {
        try {
            // Try cache first
            if (useCache && this.isRedisConnected) {
                const cacheKey = `${this.cacheKeyPrefix}markets:active`;
                const cached = await this.redisClient.get(cacheKey);

                if (cached) {
                    return JSON.parse(cached);
                }
            }

            // Get from database
            const result = await dbConnection.query(`
                SELECT id, symbol, base_currency, quote_currency, exchange, session_info
                FROM markets
                WHERE is_active = true
                ORDER BY symbol
            `);

            const markets = result.rows;

            // Cache the result
            if (this.isRedisConnected && markets.length > 0) {
                const cacheKey = `${this.cacheKeyPrefix}markets:active`;
                await this.redisClient.setEx(
                    cacheKey,
                    this.cacheTTL.markets,
                    JSON.stringify(markets)
                );
            }

            return markets;

        } catch (error) {
            logger.error('Error getting active markets:', error);
            return [];
        }
    }

    /**
     * Filter price data by time range and limit
     */
    filterPriceData(data, options = {}) {
        let filtered = [...data];

        if (options.startTime) {
            filtered = filtered.filter(record =>
                new Date(record.timestamp) >= new Date(options.startTime)
            );
        }

        if (options.endTime) {
            filtered = filtered.filter(record =>
                new Date(record.timestamp) <= new Date(options.endTime)
            );
        }

        if (options.limit && options.limit > 0) {
            filtered = filtered.slice(0, options.limit);
        }

        return filtered;
    }

    /**
     * Utility function to chunk arrays
     */
    chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * Clear cache for a specific pattern
     */
    async clearCache(pattern) {
        if (!this.isRedisConnected) return;

        try {
            const keys = await this.redisClient.keys(`${this.cacheKeyPrefix}${pattern}`);
            if (keys.length > 0) {
                await this.redisClient.del(keys);
                logger.info(`Cleared ${keys.length} cache keys matching pattern: ${pattern}`);
            }

        } catch (error) {
            logger.error('Error clearing cache:', error);
        }
    }

    /**
     * Get storage statistics
     */
    async getStorageStats() {
        try {
            const stats = {
                database: {},
                redis: {}
            };

            // Database stats
            const dbQueries = [
                { name: 'price_data_count', query: 'SELECT COUNT(*) as count FROM price_data' },
                { name: 'markets_count', query: 'SELECT COUNT(*) as count FROM markets WHERE is_active = true' },
                { name: 'liquidity_levels_count', query: 'SELECT COUNT(*) as count FROM liquidity_levels WHERE is_active = true' },
                { name: 'confluences_count', query: 'SELECT COUNT(*) as count FROM confluences WHERE is_valid = true' }
            ];

            for (const { name, query } of dbQueries) {
                try {
                    const result = await dbConnection.query(query);
                    stats.database[name] = parseInt(result.rows[0].count);
                } catch (error) {
                    stats.database[name] = 0;
                }
            }

            // Redis stats
            if (this.isRedisConnected) {
                try {
                    const redisInfo = await this.redisClient.info('memory');
                    stats.redis.connected = true;
                    stats.redis.memory_usage = redisInfo.used_memory_human || 'N/A';

                    // Count cached keys
                    const cacheKeys = await this.redisClient.keys(`${this.cacheKeyPrefix}*`);
                    stats.redis.cached_keys = cacheKeys.length;

                } catch (error) {
                    stats.redis.connected = false;
                    stats.redis.error = error.message;
                }
            } else {
                stats.redis.connected = false;
            }

            return stats;

        } catch (error) {
            logger.error('Error getting storage stats:', error);
            return {};
        }
    }

    /**
     * Close connections
     */
    async close() {
        if (this.redisClient && this.isRedisConnected) {
            await this.redisClient.quit();
            logger.info('Redis connection closed');
        }
    }
}

module.exports = new StorageManager();