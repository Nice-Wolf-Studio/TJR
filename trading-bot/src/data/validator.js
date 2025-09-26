/**
 * Data Validation and Integrity Checking System
 * Validates price data, detects anomalies, and ensures data quality
 */

const logger = require('../utils/logger');
const dbConnection = require('../database/connection');

class DataValidator {
    constructor() {
        this.validationRules = {
            priceData: {
                required: ['timestamp', 'open_price', 'high_price', 'low_price', 'close_price'],
                numeric: ['open_price', 'high_price', 'low_price', 'close_price', 'volume'],
                positive: ['open_price', 'high_price', 'low_price', 'close_price'],
                maxDeviationPercent: 50, // Maximum price deviation from previous candle
                maxSpreadPercent: 10, // Maximum spread percentage
                minQualityScore: 0.1
            }
        };

        this.anomalyDetection = {
            enabled: true,
            priceDeviationThreshold: 0.20, // 20% price deviation
            volumeDeviationThreshold: 5.0, // 5x volume deviation
            consecutiveOutliersLimit: 3
        };

        this.cache = {
            recentPrices: new Map(), // Cache recent prices for comparison
            anomalies: new Map()
        };
    }

    /**
     * Validate price data array
     */
    async validatePriceData(data, market, source) {
        if (!Array.isArray(data) || data.length === 0) {
            logger.debug('No data to validate');
            return [];
        }

        logger.debug(`Validating ${data.length} price records for ${market.symbol} from ${source}`);

        const validatedData = [];
        const errors = [];
        let anomaliesDetected = 0;

        for (let i = 0; i < data.length; i++) {
            const record = data[i];

            try {
                // Basic validation
                const basicValidation = this.validateBasicPriceRecord(record, i);
                if (!basicValidation.isValid) {
                    errors.push({
                        index: i,
                        type: 'basic_validation',
                        errors: basicValidation.errors,
                        record: record
                    });
                    continue;
                }

                // OHLC logic validation
                const ohlcValidation = this.validateOHLCLogic(record);
                if (!ohlcValidation.isValid) {
                    errors.push({
                        index: i,
                        type: 'ohlc_logic',
                        errors: ohlcValidation.errors,
                        record: record
                    });
                    continue;
                }

                // Time validation
                const timeValidation = this.validateTimestamp(record.timestamp);
                if (!timeValidation.isValid) {
                    errors.push({
                        index: i,
                        type: 'timestamp',
                        errors: timeValidation.errors,
                        record: record
                    });
                    continue;
                }

                // Get previous record for comparison
                const previousRecord = validatedData.length > 0 ?
                    validatedData[validatedData.length - 1] :
                    await this.getLastPriceRecord(market.id, source);

                // Price deviation validation
                if (previousRecord) {
                    const deviationValidation = this.validatePriceDeviation(record, previousRecord);
                    if (!deviationValidation.isValid) {
                        if (deviationValidation.severity === 'error') {
                            errors.push({
                                index: i,
                                type: 'price_deviation',
                                errors: deviationValidation.errors,
                                record: record,
                                previousRecord: previousRecord
                            });
                            continue;
                        } else {
                            // Mark as anomaly but include
                            record.quality_score = Math.max(record.quality_score - 0.3, 0.1);
                            anomaliesDetected++;
                        }
                    }
                }

                // Duplicate validation
                const isDuplicate = await this.checkForDuplicate(record, market.id, source);
                if (isDuplicate) {
                    logger.debug(`Duplicate record detected for ${market.symbol} at ${record.timestamp}`);
                    continue; // Skip duplicates
                }

                // Volume validation (if available)
                if (record.volume !== undefined && record.volume !== null) {
                    const volumeValidation = this.validateVolume(record, previousRecord);
                    if (!volumeValidation.isValid) {
                        if (volumeValidation.severity === 'warning') {
                            record.quality_score = Math.max(record.quality_score - 0.1, 0.1);
                        }
                    }
                }

                // Spread validation (for forex)
                if (record.spread !== undefined && record.spread !== null) {
                    const spreadValidation = this.validateSpread(record);
                    if (!spreadValidation.isValid) {
                        record.quality_score = Math.max(record.quality_score - 0.2, 0.1);
                    }
                }

                // Apply quality score
                record.quality_score = this.calculateQualityScore(record, previousRecord);

                // Only include records that meet minimum quality threshold
                if (record.quality_score >= this.validationRules.priceData.minQualityScore) {
                    validatedData.push(record);
                } else {
                    errors.push({
                        index: i,
                        type: 'quality_score',
                        errors: [`Quality score ${record.quality_score} below minimum threshold`],
                        record: record
                    });
                }

            } catch (validationError) {
                logger.error('Validation error for record:', validationError);
                errors.push({
                    index: i,
                    type: 'validation_error',
                    errors: [validationError.message],
                    record: record
                });
            }
        }

        // Log validation summary
        this.logValidationSummary(data.length, validatedData.length, errors.length, anomaliesDetected, source);

        // Store validation errors if any
        if (errors.length > 0) {
            await this.storeValidationErrors(market.id, source, errors);
        }

        return validatedData;
    }

    /**
     * Basic price record validation
     */
    validateBasicPriceRecord(record, index) {
        const errors = [];
        const rules = this.validationRules.priceData;

        // Check required fields
        for (const field of rules.required) {
            if (record[field] === undefined || record[field] === null) {
                errors.push(`Missing required field: ${field}`);
            }
        }

        // Check numeric fields
        for (const field of rules.numeric) {
            if (record[field] !== undefined && record[field] !== null) {
                if (isNaN(record[field]) || !isFinite(record[field])) {
                    errors.push(`Invalid numeric value for ${field}: ${record[field]}`);
                }
            }
        }

        // Check positive values
        for (const field of rules.positive) {
            if (record[field] !== undefined && record[field] !== null) {
                if (record[field] <= 0) {
                    errors.push(`${field} must be positive: ${record[field]}`);
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Validate OHLC price logic
     */
    validateOHLCLogic(record) {
        const errors = [];
        const { open_price, high_price, low_price, close_price } = record;

        // High should be the highest price
        if (high_price < open_price || high_price < close_price || high_price < low_price) {
            errors.push(`High price ${high_price} is not the highest among OHLC values`);
        }

        // Low should be the lowest price
        if (low_price > open_price || low_price > close_price || low_price > high_price) {
            errors.push(`Low price ${low_price} is not the lowest among OHLC values`);
        }

        // High must be >= Low
        if (high_price < low_price) {
            errors.push(`High price ${high_price} cannot be less than low price ${low_price}`);
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Validate timestamp
     */
    validateTimestamp(timestamp) {
        const errors = [];

        if (!timestamp || !(timestamp instanceof Date)) {
            errors.push('Invalid timestamp format');
            return { isValid: false, errors };
        }

        if (isNaN(timestamp.getTime())) {
            errors.push('Invalid timestamp value');
        }

        // Check if timestamp is in the future (allow 1 minute tolerance)
        const now = new Date();
        const tolerance = 60 * 1000; // 1 minute
        if (timestamp.getTime() > now.getTime() + tolerance) {
            errors.push('Timestamp is in the future');
        }

        // Check if timestamp is too old (more than 10 years)
        const tenYearsAgo = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);
        if (timestamp.getTime() < tenYearsAgo.getTime()) {
            errors.push('Timestamp is too old (more than 10 years)');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Validate price deviation from previous record
     */
    validatePriceDeviation(current, previous) {
        if (!previous) {
            return { isValid: true, errors: [] };
        }

        const errors = [];
        const maxDeviation = this.validationRules.priceData.maxDeviationPercent / 100;

        const priceFields = ['open_price', 'high_price', 'low_price', 'close_price'];

        for (const field of priceFields) {
            if (current[field] && previous[field]) {
                const deviation = Math.abs(current[field] - previous[field]) / previous[field];

                if (deviation > maxDeviation) {
                    const severity = deviation > maxDeviation * 2 ? 'error' : 'warning';
                    errors.push({
                        field: field,
                        deviation: deviation,
                        severity: severity,
                        message: `${field} deviation ${(deviation * 100).toFixed(2)}% exceeds ${(maxDeviation * 100).toFixed(2)}%`
                    });
                }
            }
        }

        const hasErrors = errors.some(e => e.severity === 'error');
        const severity = hasErrors ? 'error' : 'warning';

        return {
            isValid: !hasErrors,
            severity: severity,
            errors: errors.map(e => e.message)
        };
    }

    /**
     * Validate volume data
     */
    validateVolume(current, previous) {
        if (!current.volume || current.volume <= 0) {
            return { isValid: true, errors: [] }; // Volume is optional
        }

        const errors = [];

        // Check for extremely high volume spikes
        if (previous && previous.volume > 0) {
            const volumeRatio = current.volume / previous.volume;
            const threshold = this.anomalyDetection.volumeDeviationThreshold;

            if (volumeRatio > threshold) {
                errors.push(`Volume spike detected: ${volumeRatio.toFixed(2)}x previous volume`);
                return {
                    isValid: false,
                    severity: 'warning',
                    errors: errors
                };
            }
        }

        return { isValid: true, errors: [] };
    }

    /**
     * Validate spread data
     */
    validateSpread(record) {
        if (!record.spread || record.spread <= 0) {
            return { isValid: true, errors: [] }; // Spread is optional
        }

        const errors = [];
        const maxSpreadPercent = this.validationRules.priceData.maxSpreadPercent / 100;
        const spreadPercent = record.spread / record.close_price;

        if (spreadPercent > maxSpreadPercent) {
            errors.push(`Spread ${(spreadPercent * 100).toFixed(2)}% exceeds maximum ${maxSpreadPercent * 100}%`);
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Calculate quality score for a record
     */
    calculateQualityScore(record, previousRecord) {
        let score = record.quality_score || 1.0;

        // Penalize records with missing optional data
        if (!record.volume || record.volume === 0) {
            score -= 0.05;
        }

        if (!record.session) {
            score -= 0.05;
        }

        // Reward records with spread information
        if (record.spread && record.spread > 0) {
            score += 0.05;
        }

        // Penalize records with suspicious patterns
        if (previousRecord) {
            const priceRange = record.high_price - record.low_price;
            const previousRange = previousRecord.high_price - previousRecord.low_price;

            // Penalize extremely narrow ranges (possible data issues)
            if (priceRange === 0 || (previousRange > 0 && priceRange / previousRange < 0.01)) {
                score -= 0.15;
            }

            // Penalize identical OHLC values (suspicious)
            if (record.open_price === record.high_price &&
                record.high_price === record.low_price &&
                record.low_price === record.close_price) {
                score -= 0.2;
            }
        }

        return Math.max(Math.min(score, 1.0), 0.0);
    }

    /**
     * Check for duplicate records
     */
    async checkForDuplicate(record, marketId, source) {
        try {
            const result = await dbConnection.query(`
                SELECT COUNT(*) as count
                FROM price_data
                WHERE market_id = $1
                  AND timestamp = $2
                  AND data_source = $3
            `, [marketId, record.timestamp, source]);

            return result.rows[0].count > 0;

        } catch (error) {
            logger.error('Error checking for duplicates:', error);
            return false; // Assume not duplicate if check fails
        }
    }

    /**
     * Get last price record for comparison
     */
    async getLastPriceRecord(marketId, source) {
        try {
            const result = await dbConnection.query(`
                SELECT open_price, high_price, low_price, close_price, volume, timestamp
                FROM price_data
                WHERE market_id = $1 AND data_source = $2
                ORDER BY timestamp DESC
                LIMIT 1
            `, [marketId, source]);

            return result.rows.length > 0 ? result.rows[0] : null;

        } catch (error) {
            logger.error('Error fetching last price record:', error);
            return null;
        }
    }

    /**
     * Store validation errors for analysis
     */
    async storeValidationErrors(marketId, source, errors) {
        try {
            const errorSummary = {
                marketId: marketId,
                source: source,
                timestamp: new Date(),
                errorCount: errors.length,
                errorTypes: this.summarizeErrorTypes(errors),
                errors: errors.slice(0, 10) // Store first 10 errors to avoid bloat
            };

            // Here you could store in a separate validation_errors table
            // For now, we'll just log for monitoring
            logger.warn('Data validation errors detected:', errorSummary);

        } catch (error) {
            logger.error('Error storing validation errors:', error);
        }
    }

    /**
     * Summarize error types
     */
    summarizeErrorTypes(errors) {
        const summary = {};

        for (const error of errors) {
            summary[error.type] = (summary[error.type] || 0) + 1;
        }

        return summary;
    }

    /**
     * Log validation summary
     */
    logValidationSummary(totalRecords, validRecords, errorCount, anomaliesDetected, source) {
        const successRate = totalRecords > 0 ? (validRecords / totalRecords * 100).toFixed(2) : 0;

        logger.info('Data validation summary:', {
            source: source,
            totalRecords: totalRecords,
            validRecords: validRecords,
            errorCount: errorCount,
            anomaliesDetected: anomaliesDetected,
            successRate: `${successRate}%`
        });

        if (successRate < 50) {
            logger.warn(`Low data quality from ${source}: ${successRate}% success rate`);
        }
    }

    /**
     * Validate confluence data
     */
    async validateConfluenceData(confluenceData, market) {
        const errors = [];
        const validatedData = [];

        for (const confluence of confluenceData) {
            try {
                // Required fields validation
                if (!confluence.confluence_type || !confluence.timestamp || !confluence.weight || !confluence.score) {
                    errors.push('Missing required confluence fields');
                    continue;
                }

                // Weight validation (0-1)
                if (confluence.weight < 0 || confluence.weight > 1) {
                    errors.push(`Invalid weight: ${confluence.weight}`);
                    continue;
                }

                // Score validation (positive)
                if (confluence.score < 0) {
                    errors.push(`Invalid score: ${confluence.score}`);
                    continue;
                }

                // Timestamp validation
                const timeValidation = this.validateTimestamp(confluence.timestamp);
                if (!timeValidation.isValid) {
                    errors.push('Invalid confluence timestamp');
                    continue;
                }

                validatedData.push(confluence);

            } catch (error) {
                errors.push(`Confluence validation error: ${error.message}`);
            }
        }

        return {
            validData: validatedData,
            errors: errors
        };
    }

    /**
     * Validate liquidity level data
     */
    async validateLiquidityData(liquidityData, market) {
        const errors = [];
        const validatedData = [];

        for (const level of liquidityData) {
            try {
                // Required fields validation
                if (!level.level_price || !level.level_type || level.strength === undefined) {
                    errors.push('Missing required liquidity level fields');
                    continue;
                }

                // Price validation
                if (level.level_price <= 0) {
                    errors.push(`Invalid level price: ${level.level_price}`);
                    continue;
                }

                // Strength validation (0-10)
                if (level.strength < 0 || level.strength > 10) {
                    errors.push(`Invalid strength: ${level.strength}`);
                    continue;
                }

                // Type validation
                const validTypes = ['support', 'resistance', 'demand_zone', 'supply_zone'];
                if (!validTypes.includes(level.level_type)) {
                    errors.push(`Invalid level type: ${level.level_type}`);
                    continue;
                }

                validatedData.push(level);

            } catch (error) {
                errors.push(`Liquidity validation error: ${error.message}`);
            }
        }

        return {
            validData: validatedData,
            errors: errors
        };
    }

    /**
     * Get validation statistics
     */
    getValidationStats() {
        return {
            rules: this.validationRules,
            anomalyDetection: this.anomalyDetection,
            cacheSize: {
                recentPrices: this.cache.recentPrices.size,
                anomalies: this.cache.anomalies.size
            }
        };
    }

    /**
     * Clear validation cache
     */
    clearCache() {
        this.cache.recentPrices.clear();
        this.cache.anomalies.clear();
        logger.info('Validation cache cleared');
    }
}

module.exports = new DataValidator();