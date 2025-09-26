/**
 * Liquidity Analysis Module
 * Implements comprehensive liquidity detection algorithms based on the unified methodology
 *
 * Features:
 * - Equal highs/lows detection
 * - Session extreme identification
 * - Psychological level mapping (00/50 levels)
 * - Trendline liquidity calculation
 * - Liquidity strength scoring
 */

class LiquidityAnalyzer {
    constructor(options = {}) {
        this.options = {
            equalLevelTolerance: options.equalLevelTolerance || 0.0005, // 0.05% tolerance for equal levels
            psychologicalLevelStrength: options.psychologicalLevelStrength || 1.2,
            sessionStrength: options.sessionStrength || 1.5,
            trendlineMinTouches: options.trendlineMinTouches || 3,
            lookbackPeriod: options.lookbackPeriod || 100,
            ...options
        };
    }

    /**
     * Detect equal highs and lows within a dataset
     * @param {Array} priceData - Array of OHLC candlestick data
     * @param {string} type - 'high' or 'low'
     * @returns {Array} Array of equal level clusters
     */
    detectEqualLevels(priceData, type = 'high') {
        if (!priceData || priceData.length < 3) return [];

        const levels = [];
        const tolerance = this.options.equalLevelTolerance;
        const priceKey = type === 'high' ? 'high' : 'low';

        // Extract swing points first
        const swingPoints = this._findSwingPoints(priceData, type);

        // Group swing points by similar price levels
        const levelGroups = new Map();

        swingPoints.forEach(point => {
            const price = point[priceKey];
            let foundGroup = false;

            // Check if this price fits into an existing group
            for (let [groupPrice, group] of levelGroups) {
                if (Math.abs(price - groupPrice) / groupPrice <= tolerance) {
                    group.points.push(point);
                    group.averagePrice = group.points.reduce((sum, p) => sum + p[priceKey], 0) / group.points.length;
                    foundGroup = true;
                    break;
                }
            }

            // Create new group if no match found
            if (!foundGroup) {
                levelGroups.set(price, {
                    points: [point],
                    averagePrice: price,
                    type: type,
                    strength: 1
                });
            }
        });

        // Filter groups with multiple touches and calculate strength
        levelGroups.forEach((group, key) => {
            if (group.points.length >= 2) {
                group.strength = this._calculateLiquidityStrength(group);
                levels.push({
                    price: group.averagePrice,
                    type: type,
                    touches: group.points.length,
                    strength: group.strength,
                    points: group.points,
                    timespan: group.points[group.points.length - 1].timestamp - group.points[0].timestamp
                });
            }
        });

        return levels.sort((a, b) => b.strength - a.strength);
    }

    /**
     * Identify session extremes (session highs and lows)
     * @param {Array} priceData - Array of OHLC data with timestamps
     * @param {string} session - 'london', 'newyork', 'asia', or 'all'
     * @returns {Object} Session extremes data
     */
    identifySessionExtremes(priceData, session = 'all') {
        if (!priceData || priceData.length === 0) return {};

        const sessions = this._categorizeBySession(priceData);
        const extremes = {};

        const sessionKeys = session === 'all' ? Object.keys(sessions) : [session];

        sessionKeys.forEach(sessionKey => {
            const sessionData = sessions[sessionKey];
            if (!sessionData || sessionData.length === 0) return;

            const sessionHigh = sessionData.reduce((max, candle) =>
                candle.high > max.high ? candle : max, sessionData[0]);
            const sessionLow = sessionData.reduce((min, candle) =>
                candle.low < min.low ? candle : min, sessionData[0]);

            extremes[sessionKey] = {
                high: {
                    price: sessionHigh.high,
                    timestamp: sessionHigh.timestamp,
                    strength: this.options.sessionStrength,
                    type: 'session_high'
                },
                low: {
                    price: sessionLow.low,
                    timestamp: sessionLow.timestamp,
                    strength: this.options.sessionStrength,
                    type: 'session_low'
                }
            };
        });

        return extremes;
    }

    /**
     * Map psychological levels (00 and 50 levels)
     * @param {number} currentPrice - Current market price
     * @param {number} range - Price range to scan (in pips for forex)
     * @returns {Array} Array of psychological levels
     */
    mapPsychologicalLevels(currentPrice, range = 500) {
        const levels = [];
        const isForex = currentPrice < 10; // Heuristic for forex vs other assets

        if (isForex) {
            // For forex pairs (e.g., EURUSD = 1.0850)
            const baseLevel = Math.floor(currentPrice * 10000) / 10000;
            const startLevel = baseLevel - (range * 0.0001);
            const endLevel = baseLevel + (range * 0.0001);

            // Generate 00 and 50 levels
            for (let level = startLevel; level <= endLevel; level += 0.0001) {
                const lastTwoDigits = Math.round((level % 0.01) * 10000);
                if (lastTwoDigits % 500 === 0) { // 00 and 50 levels
                    const strength = lastTwoDigits === 0 ?
                        this.options.psychologicalLevelStrength * 1.5 : // 00 levels stronger
                        this.options.psychologicalLevelStrength;        // 50 levels

                    levels.push({
                        price: Math.round(level * 10000) / 10000,
                        type: lastTwoDigits === 0 ? 'psychological_00' : 'psychological_50',
                        strength: strength,
                        distance: Math.abs(level - currentPrice)
                    });
                }
            }
        } else {
            // For indices and stocks
            const increment = currentPrice > 1000 ? 100 : 10;
            const startLevel = Math.floor((currentPrice - range) / increment) * increment;
            const endLevel = Math.ceil((currentPrice + range) / increment) * increment;

            for (let level = startLevel; level <= endLevel; level += increment) {
                levels.push({
                    price: level,
                    type: level % (increment * 10) === 0 ? 'psychological_major' : 'psychological_minor',
                    strength: level % (increment * 10) === 0 ?
                        this.options.psychologicalLevelStrength * 1.5 :
                        this.options.psychologicalLevelStrength,
                    distance: Math.abs(level - currentPrice)
                });
            }
        }

        return levels.sort((a, b) => a.distance - b.distance);
    }

    /**
     * Calculate trendline liquidity based on price interaction
     * @param {Array} priceData - OHLC data
     * @param {Array} trendlines - Array of trendline objects
     * @returns {Array} Trendlines with liquidity calculations
     */
    calculateTrendlineLiquidity(priceData, trendlines) {
        return trendlines.map(trendline => {
            const liquidityData = this._analyzeTrendlineInteractions(priceData, trendline);

            return {
                ...trendline,
                liquidity: {
                    touches: liquidityData.touches,
                    strength: liquidityData.strength,
                    lastTouch: liquidityData.lastTouch,
                    averageDistance: liquidityData.averageDistance,
                    rejections: liquidityData.rejections
                }
            };
        });
    }

    /**
     * Calculate overall liquidity strength for a level
     * @param {Object} liquidityLevel - Liquidity level object
     * @returns {number} Strength score
     */
    calculateLiquidityStrength(liquidityLevel) {
        let strength = 0;

        // Base strength from number of touches
        strength += liquidityLevel.touches * 0.3;

        // Time factor - older levels are stronger
        const ageHours = (Date.now() - liquidityLevel.points[0].timestamp) / (1000 * 60 * 60);
        strength += Math.min(ageHours / 24, 5) * 0.2; // Max 5 points for age

        // Timespan factor - levels that hold over time are stronger
        if (liquidityLevel.timespan) {
            const timespanHours = liquidityLevel.timespan / (1000 * 60 * 60);
            strength += Math.min(timespanHours / 24, 3) * 0.2; // Max 3 points for timespan
        }

        // Volume factor (if available)
        if (liquidityLevel.points[0].volume) {
            const avgVolume = liquidityLevel.points.reduce((sum, p) => sum + (p.volume || 0), 0) / liquidityLevel.points.length;
            strength += Math.min(avgVolume / 1000000, 2) * 0.1; // Normalized volume factor
        }

        // Session factor
        if (liquidityLevel.type && liquidityLevel.type.includes('session')) {
            strength *= this.options.sessionStrength;
        }

        // Psychological level factor
        if (liquidityLevel.type && liquidityLevel.type.includes('psychological')) {
            strength *= this.options.psychologicalLevelStrength;
        }

        return Math.round(strength * 100) / 100;
    }

    /**
     * Get all liquidity levels for a given dataset
     * @param {Array} priceData - OHLC data
     * @param {Object} options - Analysis options
     * @returns {Object} Comprehensive liquidity analysis
     */
    getAllLiquidityLevels(priceData, options = {}) {
        const currentPrice = priceData[priceData.length - 1].close;

        // Get all types of liquidity
        const equalHighs = this.detectEqualLevels(priceData, 'high');
        const equalLows = this.detectEqualLevels(priceData, 'low');
        const sessionExtremes = this.identifySessionExtremes(priceData);
        const psychologicalLevels = this.mapPsychologicalLevels(currentPrice, options.psychRange);

        // Combine and deduplicate
        const allLevels = [
            ...equalHighs,
            ...equalLows,
            ...Object.values(sessionExtremes).flatMap(session => [session.high, session.low]),
            ...psychologicalLevels
        ];

        // Remove duplicates and sort by strength
        const uniqueLevels = this._deduplicateLevels(allLevels);

        return {
            equalHighs,
            equalLows,
            sessionExtremes,
            psychologicalLevels,
            allLevels: uniqueLevels.sort((a, b) => b.strength - a.strength),
            summary: {
                totalLevels: uniqueLevels.length,
                strongLevels: uniqueLevels.filter(l => l.strength > 3).length,
                nearbyLevels: uniqueLevels.filter(l => Math.abs(l.price - currentPrice) / currentPrice < 0.01).length
            }
        };
    }

    // Private helper methods
    _findSwingPoints(priceData, type) {
        const swings = [];
        const lookback = 5; // Look 5 periods back and forward

        for (let i = lookback; i < priceData.length - lookback; i++) {
            const current = priceData[i];
            const priceKey = type === 'high' ? 'high' : 'low';
            const isSwing = type === 'high' ?
                this._isSwingHigh(priceData, i, lookback) :
                this._isSwingLow(priceData, i, lookback);

            if (isSwing) {
                swings.push({
                    ...current,
                    index: i,
                    swingType: type
                });
            }
        }

        return swings;
    }

    _isSwingHigh(priceData, index, lookback) {
        const currentHigh = priceData[index].high;

        // Check if current high is higher than surrounding highs
        for (let i = index - lookback; i <= index + lookback; i++) {
            if (i !== index && i >= 0 && i < priceData.length) {
                if (priceData[i].high >= currentHigh) {
                    return false;
                }
            }
        }
        return true;
    }

    _isSwingLow(priceData, index, lookback) {
        const currentLow = priceData[index].low;

        // Check if current low is lower than surrounding lows
        for (let i = index - lookback; i <= index + lookback; i++) {
            if (i !== index && i >= 0 && i < priceData.length) {
                if (priceData[i].low <= currentLow) {
                    return false;
                }
            }
        }
        return true;
    }

    _calculateLiquidityStrength(group) {
        // Base strength from touches
        let strength = group.points.length * 0.5;

        // Time factor
        const timespan = group.points[group.points.length - 1].timestamp - group.points[0].timestamp;
        const timespanHours = timespan / (1000 * 60 * 60);
        strength += Math.min(timespanHours / 24, 2); // Max 2 points for time

        return strength;
    }

    _categorizeBySession(priceData) {
        const sessions = {
            asia: [],
            london: [],
            newyork: []
        };

        priceData.forEach(candle => {
            const hour = new Date(candle.timestamp).getUTCHours();

            // Asia session: 22:00 - 07:00 UTC
            if (hour >= 22 || hour < 7) {
                sessions.asia.push(candle);
            }
            // London session: 07:00 - 16:00 UTC
            else if (hour >= 7 && hour < 16) {
                sessions.london.push(candle);
            }
            // New York session: 13:00 - 22:00 UTC (overlap with London)
            else if (hour >= 13 && hour < 22) {
                sessions.newyork.push(candle);
            }
        });

        return sessions;
    }

    _analyzeTrendlineInteractions(priceData, trendline) {
        const interactions = {
            touches: 0,
            rejections: 0,
            lastTouch: null,
            distances: []
        };

        priceData.forEach(candle => {
            const trendlinePrice = this._calculateTrendlinePrice(trendline, candle.timestamp);
            const distance = Math.abs(candle.close - trendlinePrice);
            const tolerance = trendlinePrice * 0.001; // 0.1% tolerance

            if (distance <= tolerance) {
                interactions.touches++;
                interactions.lastTouch = candle.timestamp;

                // Check if it's a rejection (price bounces off)
                // This would require looking at subsequent candles
            }

            interactions.distances.push(distance);
        });

        const avgDistance = interactions.distances.reduce((sum, d) => sum + d, 0) / interactions.distances.length;
        const strength = interactions.touches * 0.4 + (interactions.rejections * 0.6);

        return {
            ...interactions,
            averageDistance: avgDistance,
            strength: strength
        };
    }

    _calculateTrendlinePrice(trendline, timestamp) {
        // Simple linear interpolation for trendline price at given time
        const slope = (trendline.endPrice - trendline.startPrice) / (trendline.endTime - trendline.startTime);
        return trendline.startPrice + slope * (timestamp - trendline.startTime);
    }

    _deduplicateLevels(levels) {
        const tolerance = this.options.equalLevelTolerance;
        const unique = [];

        levels.forEach(level => {
            const existing = unique.find(u =>
                Math.abs(u.price - level.price) / level.price <= tolerance
            );

            if (!existing) {
                unique.push(level);
            } else {
                // Merge levels, keeping the stronger one
                if (level.strength > existing.strength) {
                    const index = unique.indexOf(existing);
                    unique[index] = level;
                }
            }
        });

        return unique;
    }
}

module.exports = LiquidityAnalyzer;