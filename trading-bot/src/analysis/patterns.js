/**
 * Pattern Recognition Module
 * Implements advanced pattern detection algorithms based on the unified methodology
 *
 * Features:
 * - Candlestick intelligence (7-layer analysis)
 * - Doji variations and rejection wicks
 * - Order flow states and transitions
 * - Fair Value Gap detection
 * - Order Block identification
 * - Inverse Fair Value Gap detection
 */

class PatternRecognizer {
    constructor(options = {}) {
        this.options = {
            // Candlestick analysis settings
            wickRatioThreshold: options.wickRatioThreshold || 0.6, // 60% wick to body ratio
            dojiThreshold: options.dojiThreshold || 0.1, // 10% body to range ratio
            engulfingMinRatio: options.engulfingMinRatio || 1.2, // Engulfing pattern ratio

            // FVG settings
            fvgMinSize: options.fvgMinSize || 0.0005, // Minimum FVG size (0.05%)
            fvgLookback: options.fvgLookback || 20, // Periods to look back for FVG
            fvgStrengthThreshold: options.fvgStrengthThreshold || 0.3,

            // Order Block settings
            obMinStrength: options.obMinStrength || 2.0,
            obLookback: options.obLookback || 50,
            obVolumeMultiplier: options.obVolumeMultiplier || 1.5,

            // General settings
            minPatternStrength: options.minPatternStrength || 1.0,
            patternExpiryHours: options.patternExpiryHours || 48,

            ...options
        };

        // Order flow states
        this.ORDER_FLOW_STATES = {
            ACCUMULATION: 'accumulation',
            DISTRIBUTION: 'distribution',
            MARKUP: 'markup',
            MARKDOWN: 'markdown',
            RANGING: 'ranging'
        };

        // Pattern types
        this.PATTERN_TYPES = {
            // Candlestick patterns
            DOJI: 'doji',
            HAMMER: 'hammer',
            SHOOTING_STAR: 'shooting_star',
            ENGULFING_BULLISH: 'engulfing_bullish',
            ENGULFING_BEARISH: 'engulfing_bearish',
            INSIDE_BAR: 'inside_bar',
            OUTSIDE_BAR: 'outside_bar',

            // ICT patterns
            FAIR_VALUE_GAP: 'fair_value_gap',
            INVERSE_FVG: 'inverse_fvg',
            ORDER_BLOCK: 'order_block',
            BREAKER_BLOCK: 'breaker_block',
            MITIGATION_BLOCK: 'mitigation_block'
        };
    }

    /**
     * Perform 7-layer candlestick analysis
     * @param {Object} candle - Single candlestick data
     * @param {Array} context - Previous candles for context
     * @returns {Object} Comprehensive candlestick analysis
     */
    analyzeCandlestick(candle, context = []) {
        const analysis = {
            candle,
            layers: {
                layer1: this._analyzeBodySize(candle),
                layer2: this._analyzeWickAnalysis(candle),
                layer3: this._analyzeOpenCloseRelation(candle),
                layer4: this._analyzeHighLowPosition(candle),
                layer5: this._analyzeVolumeProfile(candle, context),
                layer6: this._analyzeContextualSignificance(candle, context),
                layer7: this._analyzeOrderFlowImplications(candle, context)
            },
            patterns: this._identifyCandlestickPatterns(candle, context),
            strength: 0,
            bias: 'neutral'
        };

        // Calculate overall strength and bias
        analysis.strength = this._calculateCandlestickStrength(analysis.layers);
        analysis.bias = this._determineCandlestickBias(analysis.layers, analysis.patterns);

        return analysis;
    }

    /**
     * Detect Fair Value Gaps (FVG)
     * @param {Array} priceData - Array of OHLC data
     * @returns {Array} Array of detected FVGs
     */
    detectFairValueGaps(priceData) {
        if (!priceData || priceData.length < 3) return [];

        const fvgs = [];

        for (let i = 2; i < priceData.length; i++) {
            const previous = priceData[i - 2];
            const middle = priceData[i - 1];
            const current = priceData[i];

            // Check for bullish FVG (gap up)
            const bullishFVG = this._checkBullishFVG(previous, middle, current);
            if (bullishFVG) {
                fvgs.push({
                    ...bullishFVG,
                    index: i,
                    timestamp: current.timestamp,
                    type: this.PATTERN_TYPES.FAIR_VALUE_GAP,
                    direction: 'bullish'
                });
            }

            // Check for bearish FVG (gap down)
            const bearishFVG = this._checkBearishFVG(previous, middle, current);
            if (bearishFVG) {
                fvgs.push({
                    ...bearishFVG,
                    index: i,
                    timestamp: current.timestamp,
                    type: this.PATTERN_TYPES.FAIR_VALUE_GAP,
                    direction: 'bearish'
                });
            }
        }

        return this._validateFVGs(fvgs, priceData);
    }

    /**
     * Detect Inverse Fair Value Gaps (IFVG)
     * @param {Array} priceData - Array of OHLC data
     * @returns {Array} Array of detected IFVGs
     */
    detectInverseFairValueGaps(priceData) {
        if (!priceData || priceData.length < 5) return [];

        const ifvgs = [];
        const fvgs = this.detectFairValueGaps(priceData);

        // Look for FVGs that have been filled and created inverse structure
        fvgs.forEach(fvg => {
            const inversePattern = this._checkForInverseFVG(fvg, priceData);
            if (inversePattern) {
                ifvgs.push({
                    ...inversePattern,
                    originalFVG: fvg,
                    type: this.PATTERN_TYPES.INVERSE_FVG
                });
            }
        });

        return ifvgs;
    }

    /**
     * Identify Order Blocks
     * @param {Array} priceData - Array of OHLC data
     * @returns {Array} Array of identified order blocks
     */
    identifyOrderBlocks(priceData) {
        if (!priceData || priceData.length < 10) return [];

        const orderBlocks = [];
        const significantMoves = this._findSignificantMoves(priceData);

        significantMoves.forEach(move => {
            // Look for the last opposite candle before the move
            const orderBlock = this._findOrderBlockCandle(priceData, move);

            if (orderBlock) {
                orderBlocks.push({
                    ...orderBlock,
                    move: move,
                    type: this.PATTERN_TYPES.ORDER_BLOCK,
                    strength: this._calculateOrderBlockStrength(orderBlock, move)
                });
            }
        });

        return this._filterOrderBlocks(orderBlocks);
    }

    /**
     * Analyze order flow state
     * @param {Array} priceData - Array of OHLC data
     * @param {number} lookback - Number of periods to analyze
     * @returns {Object} Order flow analysis
     */
    analyzeOrderFlow(priceData, lookback = 20) {
        if (!priceData || priceData.length < lookback) {
            return { state: this.ORDER_FLOW_STATES.RANGING, confidence: 0 };
        }

        const recentData = priceData.slice(-lookback);
        const analysis = {
            priceAction: this._analyzePriceAction(recentData),
            volumeProfile: this._analyzeVolumeDistribution(recentData),
            momentum: this._analyzeMomentum(recentData),
            structure: this._analyzeStructuralBehavior(recentData)
        };

        const state = this._determineOrderFlowState(analysis);
        const confidence = this._calculateOrderFlowConfidence(analysis);

        return {
            state,
            confidence,
            analysis,
            signals: this._generateOrderFlowSignals(state, analysis),
            transitions: this._detectStateTransitions(priceData, lookback)
        };
    }

    /**
     * Detect doji variations
     * @param {Array} priceData - Array of OHLC data
     * @returns {Array} Array of doji patterns
     */
    detectDojiVariations(priceData) {
        if (!priceData || priceData.length === 0) return [];

        const dojis = [];

        priceData.forEach((candle, index) => {
            const dojiType = this._classifyDoji(candle, index > 0 ? priceData[index - 1] : null);

            if (dojiType) {
                dojis.push({
                    index,
                    candle,
                    type: dojiType.type,
                    subtype: dojiType.subtype,
                    strength: dojiType.strength,
                    timestamp: candle.timestamp,
                    significance: this._assessDojiSignificance(candle, priceData, index)
                });
            }
        });

        return dojis;
    }

    /**
     * Analyze rejection wicks
     * @param {Array} priceData - Array of OHLC data
     * @returns {Array} Array of rejection wick patterns
     */
    analyzeRejectionWicks(priceData) {
        if (!priceData || priceData.length === 0) return [];

        const rejections = [];

        priceData.forEach((candle, index) => {
            const rejection = this._analyzeWickRejection(candle, priceData, index);

            if (rejection && rejection.strength >= this.options.minPatternStrength) {
                rejections.push({
                    index,
                    candle,
                    ...rejection,
                    timestamp: candle.timestamp
                });
            }
        });

        return rejections;
    }

    /**
     * Get comprehensive pattern analysis
     * @param {Array} priceData - Array of OHLC data
     * @returns {Object} Complete pattern analysis
     */
    getPatternAnalysis(priceData) {
        if (!priceData || priceData.length < 10) {
            return { error: 'Insufficient data for pattern analysis' };
        }

        const analysis = {
            candlestickPatterns: priceData.slice(-10).map((candle, index) =>
                this.analyzeCandlestick(candle, priceData.slice(0, index + priceData.length - 10))
            ),
            fairValueGaps: this.detectFairValueGaps(priceData),
            inverseFVGs: this.detectInverseFairValueGaps(priceData),
            orderBlocks: this.identifyOrderBlocks(priceData),
            dojiPatterns: this.detectDojiVariations(priceData),
            rejectionWicks: this.analyzeRejectionWicks(priceData),
            orderFlow: this.analyzeOrderFlow(priceData)
        };

        // Calculate summary statistics
        analysis.summary = {
            totalPatterns: Object.values(analysis).reduce((sum, patterns) =>
                sum + (Array.isArray(patterns) ? patterns.length : 0), 0),
            strongPatterns: this._countStrongPatterns(analysis),
            recentPatterns: this._countRecentPatterns(analysis, 24 * 60 * 60 * 1000), // Last 24 hours
            orderFlowBias: analysis.orderFlow.state
        };

        return analysis;
    }

    // Private helper methods
    _analyzeBodySize(candle) {
        const range = candle.high - candle.low;
        const body = Math.abs(candle.close - candle.open);
        const bodyRatio = range > 0 ? body / range : 0;

        return {
            size: body,
            ratio: bodyRatio,
            classification: bodyRatio > 0.7 ? 'large' : bodyRatio > 0.4 ? 'medium' : 'small',
            strength: bodyRatio
        };
    }

    _analyzeWickAnalysis(candle) {
        const range = candle.high - candle.low;
        const body = Math.abs(candle.close - candle.open);
        const upperWick = candle.high - Math.max(candle.open, candle.close);
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;

        const upperWickRatio = range > 0 ? upperWick / range : 0;
        const lowerWickRatio = range > 0 ? lowerWick / range : 0;

        return {
            upperWick: { size: upperWick, ratio: upperWickRatio },
            lowerWick: { size: lowerWick, ratio: lowerWickRatio },
            dominantWick: upperWickRatio > lowerWickRatio ? 'upper' : 'lower',
            rejectionStrength: Math.max(upperWickRatio, lowerWickRatio),
            hasSignificantWicks: Math.max(upperWickRatio, lowerWickRatio) > this.options.wickRatioThreshold
        };
    }

    _analyzeOpenCloseRelation(candle) {
        const body = candle.close - candle.open;
        const range = candle.high - candle.low;

        return {
            direction: body > 0 ? 'bullish' : body < 0 ? 'bearish' : 'neutral',
            bodyPercent: range > 0 ? Math.abs(body) / range : 0,
            gapFromOpen: 0, // Would require previous candle
            closePosition: range > 0 ? (candle.close - candle.low) / range : 0.5
        };
    }

    _analyzeHighLowPosition(candle) {
        const range = candle.high - candle.low;
        const openPosition = range > 0 ? (candle.open - candle.low) / range : 0.5;
        const closePosition = range > 0 ? (candle.close - candle.low) / range : 0.5;

        return {
            openPosition,
            closePosition,
            highTestStrength: range > 0 ? (candle.high - Math.max(candle.open, candle.close)) / range : 0,
            lowTestStrength: range > 0 ? (Math.min(candle.open, candle.close) - candle.low) / range : 0
        };
    }

    _analyzeVolumeProfile(candle, context) {
        if (!candle.volume || context.length === 0) {
            return { relative: 'unknown', strength: 0 };
        }

        const avgVolume = context.slice(-10).reduce((sum, c) => sum + (c.volume || 0), 0) / Math.min(context.length, 10);
        const volumeRatio = avgVolume > 0 ? candle.volume / avgVolume : 1;

        return {
            absolute: candle.volume,
            relative: volumeRatio > 1.5 ? 'high' : volumeRatio > 0.8 ? 'normal' : 'low',
            ratio: volumeRatio,
            strength: Math.min(volumeRatio / 2, 1) // Normalize to 0-1
        };
    }

    _analyzeContextualSignificance(candle, context) {
        if (context.length === 0) {
            return { significance: 'low', factors: [] };
        }

        const factors = [];
        let significance = 0;

        // Range significance
        const recentRanges = context.slice(-5).map(c => c.high - c.low);
        const avgRange = recentRanges.reduce((sum, r) => sum + r, 0) / recentRanges.length;
        const currentRange = candle.high - candle.low;

        if (currentRange > avgRange * 1.5) {
            factors.push('large_range');
            significance += 0.3;
        }

        // Position in recent trading
        if (context.length >= 10) {
            const recentHigh = Math.max(...context.slice(-10).map(c => c.high));
            const recentLow = Math.min(...context.slice(-10).map(c => c.low));

            if (candle.high >= recentHigh * 0.99) {
                factors.push('near_recent_high');
                significance += 0.2;
            }
            if (candle.low <= recentLow * 1.01) {
                factors.push('near_recent_low');
                significance += 0.2;
            }
        }

        return {
            significance: significance > 0.5 ? 'high' : significance > 0.2 ? 'medium' : 'low',
            score: significance,
            factors
        };
    }

    _analyzeOrderFlowImplications(candle, context) {
        const implications = [];
        let institutionalActivity = 0;

        // Large body with volume suggests institutional participation
        const body = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;

        if (range > 0 && body / range > 0.7 && candle.volume) {
            implications.push('strong_directional_move');
            institutionalActivity += 0.3;
        }

        // Rejection wicks suggest absorption
        const upperWick = candle.high - Math.max(candle.open, candle.close);
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;

        if (Math.max(upperWick, lowerWick) / range > 0.6) {
            implications.push('absorption_present');
            institutionalActivity += 0.2;
        }

        return {
            implications,
            institutionalActivity,
            orderFlowBias: candle.close > candle.open ? 'buying_pressure' : 'selling_pressure'
        };
    }

    _identifyCandlestickPatterns(candle, context) {
        const patterns = [];

        // Doji pattern
        const range = candle.high - candle.low;
        const body = Math.abs(candle.close - candle.open);
        if (range > 0 && body / range < this.options.dojiThreshold) {
            patterns.push({
                type: this.PATTERN_TYPES.DOJI,
                strength: 1 - (body / range) / this.options.dojiThreshold
            });
        }

        // Hammer/Shooting star
        const upperWick = candle.high - Math.max(candle.open, candle.close);
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;

        if (lowerWick > body * 2 && upperWick < body) {
            patterns.push({
                type: this.PATTERN_TYPES.HAMMER,
                strength: Math.min(lowerWick / body / 2, 1)
            });
        }

        if (upperWick > body * 2 && lowerWick < body) {
            patterns.push({
                type: this.PATTERN_TYPES.SHOOTING_STAR,
                strength: Math.min(upperWick / body / 2, 1)
            });
        }

        // Engulfing patterns (requires previous candle)
        if (context.length > 0) {
            const prevCandle = context[context.length - 1];
            const engulfing = this._checkEngulfingPattern(prevCandle, candle);
            if (engulfing) {
                patterns.push(engulfing);
            }
        }

        return patterns;
    }

    _checkEngulfingPattern(prevCandle, currentCandle) {
        const prevBody = Math.abs(prevCandle.close - prevCandle.open);
        const currBody = Math.abs(currentCandle.close - currentCandle.open);

        // Bullish engulfing: prev bearish, current bullish and larger
        if (prevCandle.close < prevCandle.open &&
            currentCandle.close > currentCandle.open &&
            currBody > prevBody * this.options.engulfingMinRatio &&
            currentCandle.open < prevCandle.close &&
            currentCandle.close > prevCandle.open) {

            return {
                type: this.PATTERN_TYPES.ENGULFING_BULLISH,
                strength: Math.min(currBody / prevBody / this.options.engulfingMinRatio, 1)
            };
        }

        // Bearish engulfing: prev bullish, current bearish and larger
        if (prevCandle.close > prevCandle.open &&
            currentCandle.close < currentCandle.open &&
            currBody > prevBody * this.options.engulfingMinRatio &&
            currentCandle.open > prevCandle.close &&
            currentCandle.close < prevCandle.open) {

            return {
                type: this.PATTERN_TYPES.ENGULFING_BEARISH,
                strength: Math.min(currBody / prevBody / this.options.engulfingMinRatio, 1)
            };
        }

        return null;
    }

    _calculateCandlestickStrength(layers) {
        let strength = 0;

        // Weight each layer contribution
        strength += layers.layer1.strength * 0.2; // Body size
        strength += layers.layer2.rejectionStrength * 0.25; // Wick analysis
        strength += layers.layer5.strength * 0.15; // Volume
        strength += layers.layer6.score * 0.2; // Context
        strength += layers.layer7.institutionalActivity * 0.2; // Order flow

        return Math.min(strength, 1);
    }

    _determineCandlestickBias(layers, patterns) {
        let bullishScore = 0;
        let bearishScore = 0;

        // Body direction
        if (layers.layer3.direction === 'bullish') bullishScore += 0.3;
        if (layers.layer3.direction === 'bearish') bearishScore += 0.3;

        // Wick rejection
        if (layers.layer2.dominantWick === 'lower') bullishScore += 0.2;
        if (layers.layer2.dominantWick === 'upper') bearishScore += 0.2;

        // Pattern implications
        patterns.forEach(pattern => {
            if ([this.PATTERN_TYPES.HAMMER, this.PATTERN_TYPES.ENGULFING_BULLISH].includes(pattern.type)) {
                bullishScore += pattern.strength * 0.3;
            }
            if ([this.PATTERN_TYPES.SHOOTING_STAR, this.PATTERN_TYPES.ENGULFING_BEARISH].includes(pattern.type)) {
                bearishScore += pattern.strength * 0.3;
            }
        });

        const difference = Math.abs(bullishScore - bearishScore);
        if (difference < 0.2) return 'neutral';

        return bullishScore > bearishScore ? 'bullish' : 'bearish';
    }

    _checkBullishFVG(previous, middle, current) {
        // Bullish FVG: current.low > previous.high (gap up)
        if (current.low <= previous.high) return null;

        const gapSize = current.low - previous.high;
        const previousRange = previous.high - previous.low;

        if (gapSize < this.options.fvgMinSize * previous.close) return null;

        return {
            high: current.low,
            low: previous.high,
            size: gapSize,
            sizePercent: gapSize / previous.close,
            strength: Math.min(gapSize / previousRange, 3), // Max strength of 3
            candles: { previous, middle, current }
        };
    }

    _checkBearishFVG(previous, middle, current) {
        // Bearish FVG: current.high < previous.low (gap down)
        if (current.high >= previous.low) return null;

        const gapSize = previous.low - current.high;
        const previousRange = previous.high - previous.low;

        if (gapSize < this.options.fvgMinSize * previous.close) return null;

        return {
            high: previous.low,
            low: current.high,
            size: gapSize,
            sizePercent: gapSize / previous.close,
            strength: Math.min(gapSize / previousRange, 3),
            candles: { previous, middle, current }
        };
    }

    _validateFVGs(fvgs, priceData) {
        // Remove FVGs that have been filled
        return fvgs.filter(fvg => {
            const subsequentCandles = priceData.slice(fvg.index);

            for (const candle of subsequentCandles) {
                // Check if FVG has been filled
                if ((fvg.direction === 'bullish' && candle.low <= fvg.low) ||
                    (fvg.direction === 'bearish' && candle.high >= fvg.high)) {
                    return false; // FVG has been filled
                }
            }

            return true; // FVG remains unfilled
        });
    }

    _checkForInverseFVG(fvg, priceData) {
        // Implementation would check if FVG was filled and then created opposite structure
        // This is a complex pattern requiring detailed analysis of price action after FVG fill

        const fillIndex = this._findFVGFillIndex(fvg, priceData);
        if (fillIndex === -1) return null;

        // Look for inverse pattern after fill
        const postFillData = priceData.slice(fillIndex);
        if (postFillData.length < 5) return null;

        // Check for opposite directional move creating new structure
        // This is simplified - real implementation would be more sophisticated
        const hasInverseMove = this._checkInverseMove(fvg, postFillData);

        if (hasInverseMove) {
            return {
                originalDirection: fvg.direction,
                inverseDirection: fvg.direction === 'bullish' ? 'bearish' : 'bullish',
                fillIndex,
                strength: hasInverseMove.strength
            };
        }

        return null;
    }

    _findFVGFillIndex(fvg, priceData) {
        for (let i = fvg.index; i < priceData.length; i++) {
            const candle = priceData[i];
            if ((fvg.direction === 'bullish' && candle.low <= fvg.low) ||
                (fvg.direction === 'bearish' && candle.high >= fvg.high)) {
                return i;
            }
        }
        return -1;
    }

    _checkInverseMove(fvg, postFillData) {
        // Simplified inverse move detection
        const significantMove = postFillData.find(candle => {
            const range = candle.high - candle.low;
            const body = Math.abs(candle.close - candle.open);
            return body / range > 0.7 && range > fvg.size;
        });

        if (significantMove) {
            const moveDirection = significantMove.close > significantMove.open ? 'bullish' : 'bearish';
            const isInverse = (fvg.direction === 'bullish' && moveDirection === 'bearish') ||
                            (fvg.direction === 'bearish' && moveDirection === 'bullish');

            return isInverse ? { strength: 1.0 } : null;
        }

        return null;
    }

    _findSignificantMoves(priceData) {
        const moves = [];
        const minMoveSize = 0.002; // 0.2% minimum move

        for (let i = 5; i < priceData.length - 5; i++) {
            const lookback = priceData.slice(i - 5, i);
            const lookforward = priceData.slice(i, i + 5);

            const beforeHigh = Math.max(...lookback.map(c => c.high));
            const beforeLow = Math.min(...lookback.map(c => c.low));
            const afterHigh = Math.max(...lookforward.map(c => c.high));
            const afterLow = Math.min(...lookforward.map(c => c.low));

            // Check for significant bullish move
            if (afterHigh > beforeHigh * (1 + minMoveSize)) {
                moves.push({
                    direction: 'bullish',
                    startIndex: i,
                    endIndex: i + lookforward.findIndex(c => c.high === afterHigh),
                    startPrice: priceData[i].close,
                    endPrice: afterHigh,
                    strength: (afterHigh - priceData[i].close) / priceData[i].close
                });
            }

            // Check for significant bearish move
            if (afterLow < beforeLow * (1 - minMoveSize)) {
                moves.push({
                    direction: 'bearish',
                    startIndex: i,
                    endIndex: i + lookforward.findIndex(c => c.low === afterLow),
                    startPrice: priceData[i].close,
                    endPrice: afterLow,
                    strength: (priceData[i].close - afterLow) / priceData[i].close
                });
            }
        }

        return moves;
    }

    _findOrderBlockCandle(priceData, move) {
        // Find the last opposite colored candle before the move
        const direction = move.direction;
        const startIndex = move.startIndex;

        for (let i = startIndex - 1; i >= Math.max(0, startIndex - 10); i--) {
            const candle = priceData[i];
            const candleDirection = candle.close > candle.open ? 'bullish' : 'bearish';

            // Look for opposite candle
            if ((direction === 'bullish' && candleDirection === 'bearish') ||
                (direction === 'bearish' && candleDirection === 'bullish')) {

                return {
                    candle,
                    index: i,
                    high: candle.high,
                    low: candle.low,
                    direction: direction === 'bullish' ? 'bullish_ob' : 'bearish_ob'
                };
            }
        }

        return null;
    }

    _calculateOrderBlockStrength(orderBlock, move) {
        let strength = move.strength * 2; // Base strength from move

        // Add volume factor if available
        if (orderBlock.candle.volume) {
            strength *= 1.2;
        }

        // Add time factor (more recent = stronger)
        const age = move.startIndex - orderBlock.index;
        strength *= Math.max(0.5, 1 - (age / 20));

        return Math.min(strength, 5); // Cap at 5
    }

    _filterOrderBlocks(orderBlocks) {
        // Remove weak order blocks and overlapping ones
        return orderBlocks
            .filter(ob => ob.strength >= this.options.obMinStrength)
            .sort((a, b) => b.strength - a.strength)
            .slice(0, 10); // Keep top 10
    }

    // Additional helper methods for order flow, doji analysis, etc.
    // ... (implementation continues with similar detailed analysis patterns)

    _analyzePriceAction(recentData) {
        const closes = recentData.map(c => c.close);
        const trend = closes[closes.length - 1] > closes[0] ? 'bullish' : 'bearish';
        const volatility = this._calculateVolatility(recentData);

        return { trend, volatility };
    }

    _analyzeVolumeDistribution(recentData) {
        if (!recentData[0].volume) return { profile: 'unknown' };

        const volumes = recentData.map(c => c.volume);
        const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;

        return {
            average: avgVolume,
            profile: volumes[volumes.length - 1] > avgVolume * 1.2 ? 'increasing' : 'normal'
        };
    }

    _analyzeMomentum(recentData) {
        const closes = recentData.map(c => c.close);
        const momentum = (closes[closes.length - 1] - closes[0]) / closes[0];

        return {
            value: momentum,
            strength: Math.abs(momentum) > 0.01 ? 'strong' : 'weak'
        };
    }

    _analyzeStructuralBehavior(recentData) {
        // Simplified structural analysis
        const highs = recentData.map(c => c.high);
        const lows = recentData.map(c => c.low);

        const recentHigh = Math.max(...highs.slice(-5));
        const recentLow = Math.min(...lows.slice(-5));
        const olderHigh = Math.max(...highs.slice(0, -5));
        const olderLow = Math.min(...lows.slice(0, -5));

        return {
            higherHighs: recentHigh > olderHigh,
            higherLows: recentLow > olderLow,
            structure: recentHigh > olderHigh && recentLow > olderLow ? 'bullish' : 'bearish'
        };
    }

    _determineOrderFlowState(analysis) {
        if (analysis.momentum.strength === 'strong') {
            return analysis.momentum.value > 0 ?
                this.ORDER_FLOW_STATES.MARKUP :
                this.ORDER_FLOW_STATES.MARKDOWN;
        }

        if (analysis.structure.higherHighs && analysis.structure.higherLows) {
            return this.ORDER_FLOW_STATES.ACCUMULATION;
        }

        return this.ORDER_FLOW_STATES.RANGING;
    }

    _calculateOrderFlowConfidence(analysis) {
        let confidence = 0.5; // Base confidence

        if (analysis.momentum.strength === 'strong') confidence += 0.2;
        if (analysis.volumeProfile.profile === 'increasing') confidence += 0.1;
        if (analysis.structure.structure !== 'neutral') confidence += 0.2;

        return Math.min(confidence, 1);
    }

    _generateOrderFlowSignals(state, analysis) {
        const signals = [];

        switch (state) {
            case this.ORDER_FLOW_STATES.MARKUP:
                signals.push({ type: 'bullish_continuation', strength: analysis.momentum.value });
                break;
            case this.ORDER_FLOW_STATES.MARKDOWN:
                signals.push({ type: 'bearish_continuation', strength: Math.abs(analysis.momentum.value) });
                break;
            case this.ORDER_FLOW_STATES.ACCUMULATION:
                signals.push({ type: 'potential_reversal_up', strength: 0.6 });
                break;
        }

        return signals;
    }

    _detectStateTransitions(priceData, lookback) {
        // Simplified state transition detection
        if (priceData.length < lookback * 2) return [];

        const currentState = this.analyzeOrderFlow(priceData.slice(-lookback), lookback).state;
        const previousState = this.analyzeOrderFlow(priceData.slice(-lookback * 2, -lookback), lookback).state;

        if (currentState !== previousState) {
            return [{
                from: previousState,
                to: currentState,
                timestamp: priceData[priceData.length - 1].timestamp,
                significance: 'medium'
            }];
        }

        return [];
    }

    _classifyDoji(candle, previousCandle) {
        const range = candle.high - candle.low;
        const body = Math.abs(candle.close - candle.open);

        if (range === 0 || body / range > this.options.dojiThreshold) {
            return null;
        }

        const upperWick = candle.high - Math.max(candle.open, candle.close);
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;

        let subtype = 'standard';
        if (upperWick > lowerWick * 2) subtype = 'dragonfly';
        if (lowerWick > upperWick * 2) subtype = 'gravestone';
        if (Math.abs(upperWick - lowerWick) < range * 0.1) subtype = 'four_price';

        return {
            type: this.PATTERN_TYPES.DOJI,
            subtype,
            strength: 1 - (body / range) / this.options.dojiThreshold
        };
    }

    _assessDojiSignificance(candle, priceData, index) {
        // Assess significance based on context
        let significance = 0.5; // Base significance

        if (index > 0) {
            const prevCandle = priceData[index - 1];
            const prevRange = prevCandle.high - prevCandle.low;
            const currentRange = candle.high - candle.low;

            // Higher significance if larger than previous candles
            if (currentRange > prevRange * 1.2) significance += 0.2;
        }

        // Volume significance (if available)
        if (candle.volume && index > 5) {
            const avgVolume = priceData.slice(index - 5, index).reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
            if (candle.volume > avgVolume * 1.3) significance += 0.2;
        }

        return Math.min(significance, 1);
    }

    _analyzeWickRejection(candle, priceData, index) {
        const range = candle.high - candle.low;
        if (range === 0) return null;

        const upperWick = candle.high - Math.max(candle.open, candle.close);
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;

        const upperWickRatio = upperWick / range;
        const lowerWickRatio = lowerWick / range;

        let rejection = null;

        if (upperWickRatio >= this.options.wickRatioThreshold) {
            rejection = {
                type: 'upper_rejection',
                strength: upperWickRatio,
                price: candle.high,
                implication: 'resistance'
            };
        } else if (lowerWickRatio >= this.options.wickRatioThreshold) {
            rejection = {
                type: 'lower_rejection',
                strength: lowerWickRatio,
                price: candle.low,
                implication: 'support'
            };
        }

        return rejection;
    }

    _countStrongPatterns(analysis) {
        let count = 0;

        // Count patterns with high strength
        Object.values(analysis).forEach(patterns => {
            if (Array.isArray(patterns)) {
                count += patterns.filter(p => (p.strength || 0) > 0.7).length;
            }
        });

        return count;
    }

    _countRecentPatterns(analysis, timeWindow) {
        const cutoff = Date.now() - timeWindow;
        let count = 0;

        Object.values(analysis).forEach(patterns => {
            if (Array.isArray(patterns)) {
                count += patterns.filter(p => (p.timestamp || 0) > cutoff).length;
            }
        });

        return count;
    }

    _calculateVolatility(priceData) {
        const returns = [];
        for (let i = 1; i < priceData.length; i++) {
            returns.push((priceData[i].close - priceData[i - 1].close) / priceData[i - 1].close);
        }

        const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

        return Math.sqrt(variance);
    }
}

module.exports = PatternRecognizer;