/**
 * Structure Analysis Module
 * Implements market structure detection algorithms based on the unified methodology
 *
 * Features:
 * - Higher highs/higher lows detection
 * - Break of structure (BOS) identification
 * - Swing point mapping across timeframes
 * - Trend classification algorithm
 * - Market structure states (respected/challenged/disrespected)
 */

class StructureAnalyzer {
    constructor(options = {}) {
        this.options = {
            swingLookback: options.swingLookback || 5,
            minSwingStrength: options.minSwingStrength || 3,
            bosConfirmationCandles: options.bosConfirmationCandles || 2,
            trendLookbackPeriod: options.trendLookbackPeriod || 50,
            structureTolerance: options.structureTolerance || 0.001, // 0.1% tolerance
            ...options
        };

        // Structure states
        this.STRUCTURE_STATES = {
            RESPECTED: 'respected',
            CHALLENGED: 'challenged',
            DISRESPECTED: 'disrespected'
        };

        // Trend directions
        this.TREND_DIRECTIONS = {
            BULLISH: 'bullish',
            BEARISH: 'bearish',
            SIDEWAYS: 'sideways',
            UNDEFINED: 'undefined'
        };
    }

    /**
     * Detect higher highs and higher lows pattern
     * @param {Array} priceData - Array of OHLC data
     * @returns {Object} HH/HL pattern analysis
     */
    detectHigherHighsLows(priceData) {
        if (!priceData || priceData.length < this.options.trendLookbackPeriod) {
            return { pattern: this.TREND_DIRECTIONS.UNDEFINED, swings: [] };
        }

        const swingHighs = this._findSwingPoints(priceData, 'high');
        const swingLows = this._findSwingPoints(priceData, 'low');

        // Analyze recent swing progression
        const recentHighs = swingHighs.slice(-5);
        const recentLows = swingLows.slice(-5);

        const hhPattern = this._analyzeSwingProgression(recentHighs, 'high');
        const hlPattern = this._analyzeSwingProgression(recentLows, 'low');

        const pattern = this._determineOverallPattern(hhPattern, hlPattern);

        return {
            pattern,
            higherHighs: hhPattern,
            higherLows: hlPattern,
            swingHighs: recentHighs,
            swingLows: recentLows,
            confidence: this._calculatePatternConfidence(hhPattern, hlPattern)
        };
    }

    /**
     * Detect lower highs and lower lows pattern
     * @param {Array} priceData - Array of OHLC data
     * @returns {Object} LH/LL pattern analysis
     */
    detectLowerHighsLows(priceData) {
        if (!priceData || priceData.length < this.options.trendLookbackPeriod) {
            return { pattern: this.TREND_DIRECTIONS.UNDEFINED, swings: [] };
        }

        const swingHighs = this._findSwingPoints(priceData, 'high');
        const swingLows = this._findSwingPoints(priceData, 'low');

        const recentHighs = swingHighs.slice(-5);
        const recentLows = swingLows.slice(-5);

        const lhPattern = this._analyzeLowerSwingProgression(recentHighs, 'high');
        const llPattern = this._analyzeLowerSwingProgression(recentLows, 'low');

        const pattern = this._determineOverallPattern(lhPattern, llPattern, true);

        return {
            pattern,
            lowerHighs: lhPattern,
            lowerLows: llPattern,
            swingHighs: recentHighs,
            swingLows: recentLows,
            confidence: this._calculatePatternConfidence(lhPattern, llPattern)
        };
    }

    /**
     * Identify break of structure (BOS)
     * @param {Array} priceData - OHLC data
     * @param {Object} previousStructure - Previous structure analysis
     * @returns {Object} BOS analysis
     */
    identifyBreakOfStructure(priceData, previousStructure = null) {
        if (!priceData || priceData.length < 10) {
            return { detected: false, type: null, details: null };
        }

        const currentStructure = this.detectHigherHighsLows(priceData);
        const recentCandles = priceData.slice(-this.options.bosConfirmationCandles);

        // Get recent swing points
        const swingHighs = this._findSwingPoints(priceData, 'high');
        const swingLows = this._findSwingPoints(priceData, 'low');

        if (swingHighs.length < 2 || swingLows.length < 2) {
            return { detected: false, type: null, details: null };
        }

        const latestHigh = swingHighs[swingHighs.length - 1];
        const previousHigh = swingHighs[swingHighs.length - 2];
        const latestLow = swingLows[swingLows.length - 1];
        const previousLow = swingLows[swingLows.length - 2];

        // Check for bullish BOS (break above previous high)
        const bullishBOS = this._checkBullishBOS(recentCandles, latestHigh, previousHigh);

        // Check for bearish BOS (break below previous low)
        const bearishBOS = this._checkBearishBOS(recentCandles, latestLow, previousLow);

        let bosDetails = null;

        if (bullishBOS.detected) {
            bosDetails = {
                type: 'bullish_bos',
                breakLevel: bullishBOS.breakLevel,
                confirmationCandles: bullishBOS.confirmationCandles,
                strength: bullishBOS.strength,
                timestamp: bullishBOS.timestamp
            };
        } else if (bearishBOS.detected) {
            bosDetails = {
                type: 'bearish_bos',
                breakLevel: bearishBOS.breakLevel,
                confirmationCandles: bearishBOS.confirmationCandles,
                strength: bearishBOS.strength,
                timestamp: bearishBOS.timestamp
            };
        }

        return {
            detected: bullishBOS.detected || bearishBOS.detected,
            type: bosDetails?.type || null,
            details: bosDetails,
            previousStructure: currentStructure
        };
    }

    /**
     * Map swing points across multiple timeframes
     * @param {Object} multiTimeframeData - Data for multiple timeframes
     * @returns {Object} Swing point mapping
     */
    mapSwingPointsMultiTimeframe(multiTimeframeData) {
        const swingMap = {};

        Object.keys(multiTimeframeData).forEach(timeframe => {
            const data = multiTimeframeData[timeframe];

            swingMap[timeframe] = {
                highs: this._findSwingPoints(data, 'high'),
                lows: this._findSwingPoints(data, 'low'),
                structure: this.detectHigherHighsLows(data)
            };
        });

        // Find alignment between timeframes
        const alignment = this._analyzeTimeframeAlignment(swingMap);

        return {
            swingMap,
            alignment,
            confluence: this._calculateSwingConfluence(swingMap)
        };
    }

    /**
     * Classify trend based on market structure
     * @param {Array} priceData - OHLC data
     * @returns {Object} Trend classification
     */
    classifyTrend(priceData) {
        if (!priceData || priceData.length < this.options.trendLookbackPeriod) {
            return {
                direction: this.TREND_DIRECTIONS.UNDEFINED,
                strength: 0,
                confidence: 0
            };
        }

        const hhhl = this.detectHigherHighsLows(priceData);
        const lhll = this.detectLowerHighsLows(priceData);

        // Calculate trend strength based on structure consistency
        let direction = this.TREND_DIRECTIONS.SIDEWAYS;
        let strength = 0;
        let confidence = 0;

        if (hhhl.pattern === this.TREND_DIRECTIONS.BULLISH && hhhl.confidence > 0.6) {
            direction = this.TREND_DIRECTIONS.BULLISH;
            strength = hhhl.confidence;
            confidence = hhhl.confidence;
        } else if (lhll.pattern === this.TREND_DIRECTIONS.BEARISH && lhll.confidence > 0.6) {
            direction = this.TREND_DIRECTIONS.BEARISH;
            strength = lhll.confidence;
            confidence = lhll.confidence;
        }

        // Add momentum confirmation
        const momentumConfirmation = this._getMomentumConfirmation(priceData);

        return {
            direction,
            strength: Math.min(strength * momentumConfirmation.factor, 1),
            confidence,
            momentum: momentumConfirmation,
            structureDetails: {
                bullish: hhhl,
                bearish: lhll
            }
        };
    }

    /**
     * Analyze market structure state
     * @param {Array} priceData - OHLC data
     * @param {Array} keyLevels - Important support/resistance levels
     * @returns {Object} Structure state analysis
     */
    analyzeStructureState(priceData, keyLevels = []) {
        if (!priceData || priceData.length === 0) {
            return { state: this.STRUCTURE_STATES.UNDEFINED };
        }

        const currentPrice = priceData[priceData.length - 1].close;
        const recentCandles = priceData.slice(-10);

        // Check interaction with key levels
        const levelInteractions = this._analyzeLevelInteractions(recentCandles, keyLevels);

        // Determine structure state
        let state = this.STRUCTURE_STATES.RESPECTED;
        let details = {};

        // Check for challenges to structure
        if (levelInteractions.challenges > 0) {
            state = this.STRUCTURE_STATES.CHALLENGED;
            details.challenges = levelInteractions.challenges;
        }

        // Check for disrespect of structure
        if (levelInteractions.breaks > 0) {
            state = this.STRUCTURE_STATES.DISRESPECTED;
            details.breaks = levelInteractions.breaks;
        }

        return {
            state,
            details,
            levelInteractions,
            currentPrice,
            analysis: {
                respectCount: levelInteractions.respects,
                challengeCount: levelInteractions.challenges,
                breakCount: levelInteractions.breaks
            }
        };
    }

    /**
     * Get comprehensive structure analysis
     * @param {Array} priceData - OHLC data
     * @param {Object} options - Analysis options
     * @returns {Object} Complete structure analysis
     */
    getStructureAnalysis(priceData, options = {}) {
        const trend = this.classifyTrend(priceData);
        const bos = this.identifyBreakOfStructure(priceData);
        const swingPoints = {
            highs: this._findSwingPoints(priceData, 'high').slice(-10),
            lows: this._findSwingPoints(priceData, 'low').slice(-10)
        };

        return {
            trend,
            breakOfStructure: bos,
            swingPoints,
            currentStructure: {
                higherHighsLows: this.detectHigherHighsLows(priceData),
                lowerHighsLows: this.detectLowerHighsLows(priceData)
            },
            summary: {
                trendDirection: trend.direction,
                trendStrength: trend.strength,
                structureIntact: bos.detected === false,
                lastStructureBreak: bos.details?.timestamp || null
            }
        };
    }

    // Private helper methods
    _findSwingPoints(priceData, type) {
        const swings = [];
        const lookback = this.options.swingLookback;

        for (let i = lookback; i < priceData.length - lookback; i++) {
            if (type === 'high' && this._isSwingHigh(priceData, i, lookback)) {
                swings.push({
                    price: priceData[i].high,
                    timestamp: priceData[i].timestamp,
                    index: i,
                    type: 'swing_high',
                    strength: this._calculateSwingStrength(priceData, i, 'high')
                });
            } else if (type === 'low' && this._isSwingLow(priceData, i, lookback)) {
                swings.push({
                    price: priceData[i].low,
                    timestamp: priceData[i].timestamp,
                    index: i,
                    type: 'swing_low',
                    strength: this._calculateSwingStrength(priceData, i, 'low')
                });
            }
        }

        return swings.filter(swing => swing.strength >= this.options.minSwingStrength);
    }

    _isSwingHigh(priceData, index, lookback) {
        const currentHigh = priceData[index].high;

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

        for (let i = index - lookback; i <= index + lookback; i++) {
            if (i !== index && i >= 0 && i < priceData.length) {
                if (priceData[i].low <= currentLow) {
                    return false;
                }
            }
        }
        return true;
    }

    _calculateSwingStrength(priceData, index, type) {
        const lookback = this.options.swingLookback;
        const currentPrice = type === 'high' ? priceData[index].high : priceData[index].low;
        let strength = 1;

        // Calculate based on how much it stands out from surrounding prices
        for (let i = index - lookback; i <= index + lookback; i++) {
            if (i !== index && i >= 0 && i < priceData.length) {
                const comparePrice = type === 'high' ? priceData[i].high : priceData[i].low;
                const diff = type === 'high' ?
                    (currentPrice - comparePrice) / comparePrice :
                    (comparePrice - currentPrice) / currentPrice;

                if (diff > 0) {
                    strength += diff * 100; // Convert to percentage points
                }
            }
        }

        return Math.round(strength * 10) / 10;
    }

    _analyzeSwingProgression(swings, type) {
        if (swings.length < 2) {
            return { trend: 'insufficient_data', count: 0, strength: 0 };
        }

        let higherCount = 0;
        let totalCount = swings.length - 1;

        for (let i = 1; i < swings.length; i++) {
            const current = swings[i].price;
            const previous = swings[i - 1].price;

            if ((type === 'high' && current > previous) || (type === 'low' && current > previous)) {
                higherCount++;
            }
        }

        const ratio = higherCount / totalCount;
        return {
            trend: ratio > 0.6 ? 'rising' : ratio < 0.4 ? 'falling' : 'sideways',
            count: higherCount,
            total: totalCount,
            strength: ratio
        };
    }

    _analyzeLowerSwingProgression(swings, type) {
        if (swings.length < 2) {
            return { trend: 'insufficient_data', count: 0, strength: 0 };
        }

        let lowerCount = 0;
        let totalCount = swings.length - 1;

        for (let i = 1; i < swings.length; i++) {
            const current = swings[i].price;
            const previous = swings[i - 1].price;

            if ((type === 'high' && current < previous) || (type === 'low' && current < previous)) {
                lowerCount++;
            }
        }

        const ratio = lowerCount / totalCount;
        return {
            trend: ratio > 0.6 ? 'falling' : ratio < 0.4 ? 'rising' : 'sideways',
            count: lowerCount,
            total: totalCount,
            strength: ratio
        };
    }

    _determineOverallPattern(highPattern, lowPattern, isLowerPattern = false) {
        if (!isLowerPattern) {
            // For HH/HL pattern
            if (highPattern.trend === 'rising' && lowPattern.trend === 'rising') {
                return this.TREND_DIRECTIONS.BULLISH;
            }
        } else {
            // For LH/LL pattern
            if (highPattern.trend === 'falling' && lowPattern.trend === 'falling') {
                return this.TREND_DIRECTIONS.BEARISH;
            }
        }

        return this.TREND_DIRECTIONS.SIDEWAYS;
    }

    _calculatePatternConfidence(pattern1, pattern2) {
        const avgStrength = (pattern1.strength + pattern2.strength) / 2;
        const dataQuality = Math.min(pattern1.total, pattern2.total) / 5; // Normalize based on data points

        return Math.min(avgStrength * dataQuality, 1);
    }

    _checkBullishBOS(recentCandles, latestHigh, previousHigh) {
        const breakLevel = previousHigh.price;
        let confirmationCandles = 0;
        let breakTimestamp = null;

        for (const candle of recentCandles) {
            if (candle.close > breakLevel) {
                confirmationCandles++;
                if (!breakTimestamp) {
                    breakTimestamp = candle.timestamp;
                }
            }
        }

        const detected = confirmationCandles >= this.options.bosConfirmationCandles;
        const strength = confirmationCandles / recentCandles.length;

        return {
            detected,
            breakLevel,
            confirmationCandles,
            strength,
            timestamp: breakTimestamp
        };
    }

    _checkBearishBOS(recentCandles, latestLow, previousLow) {
        const breakLevel = previousLow.price;
        let confirmationCandles = 0;
        let breakTimestamp = null;

        for (const candle of recentCandles) {
            if (candle.close < breakLevel) {
                confirmationCandles++;
                if (!breakTimestamp) {
                    breakTimestamp = candle.timestamp;
                }
            }
        }

        const detected = confirmationCandles >= this.options.bosConfirmationCandles;
        const strength = confirmationCandles / recentCandles.length;

        return {
            detected,
            breakLevel,
            confirmationCandles,
            strength,
            timestamp: breakTimestamp
        };
    }

    _analyzeTimeframeAlignment(swingMap) {
        const timeframes = Object.keys(swingMap);
        const alignments = {};

        // Compare each timeframe pair
        for (let i = 0; i < timeframes.length; i++) {
            for (let j = i + 1; j < timeframes.length; j++) {
                const tf1 = timeframes[i];
                const tf2 = timeframes[j];

                const alignment = this._compareStructures(
                    swingMap[tf1].structure,
                    swingMap[tf2].structure
                );

                alignments[`${tf1}_${tf2}`] = alignment;
            }
        }

        return alignments;
    }

    _compareStructures(structure1, structure2) {
        if (structure1.pattern === structure2.pattern) {
            return {
                aligned: true,
                confidence: (structure1.confidence + structure2.confidence) / 2,
                type: structure1.pattern
            };
        }

        return {
            aligned: false,
            confidence: 0,
            type: 'divergent'
        };
    }

    _calculateSwingConfluence(swingMap) {
        // Implementation for calculating confluence between swing points across timeframes
        const confluenceScore = Object.values(swingMap).reduce((score, tf) => {
            return score + (tf.structure.confidence || 0);
        }, 0) / Object.keys(swingMap).length;

        return {
            score: confluenceScore,
            strength: confluenceScore > 0.7 ? 'strong' : confluenceScore > 0.5 ? 'moderate' : 'weak'
        };
    }

    _getMomentumConfirmation(priceData) {
        if (priceData.length < 10) {
            return { factor: 1, strength: 'insufficient_data' };
        }

        const recent = priceData.slice(-10);
        const older = priceData.slice(-20, -10);

        const recentAvg = recent.reduce((sum, candle) => sum + candle.close, 0) / recent.length;
        const olderAvg = older.reduce((sum, candle) => sum + candle.close, 0) / older.length;

        const momentum = (recentAvg - olderAvg) / olderAvg;
        const factor = 1 + Math.abs(momentum) * 0.2; // Up to 20% boost for momentum

        return {
            factor: Math.min(factor, 1.2),
            strength: Math.abs(momentum) > 0.02 ? 'strong' : Math.abs(momentum) > 0.01 ? 'moderate' : 'weak',
            direction: momentum > 0 ? 'bullish' : 'bearish',
            value: momentum
        };
    }

    _analyzeLevelInteractions(recentCandles, keyLevels) {
        let respects = 0;
        let challenges = 0;
        let breaks = 0;

        keyLevels.forEach(level => {
            const interactions = this._checkLevelInteraction(recentCandles, level);
            respects += interactions.respects;
            challenges += interactions.challenges;
            breaks += interactions.breaks;
        });

        return { respects, challenges, breaks };
    }

    _checkLevelInteraction(candles, level) {
        const tolerance = level.price * this.options.structureTolerance;
        let respects = 0;
        let challenges = 0;
        let breaks = 0;

        candles.forEach(candle => {
            const touchesLevel = Math.abs(candle.low - level.price) <= tolerance ||
                               Math.abs(candle.high - level.price) <= tolerance;

            if (touchesLevel) {
                if (level.type === 'support' && candle.low <= level.price && candle.close > level.price) {
                    respects++;
                } else if (level.type === 'resistance' && candle.high >= level.price && candle.close < level.price) {
                    respects++;
                } else if (candle.close > level.price + tolerance || candle.close < level.price - tolerance) {
                    breaks++;
                } else {
                    challenges++;
                }
            }
        });

        return { respects, challenges, breaks };
    }
}

module.exports = StructureAnalyzer;