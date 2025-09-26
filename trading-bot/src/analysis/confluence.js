/**
 * Confluence Scoring System
 * Implements weighted confluence analysis based on the unified methodology
 *
 * Features:
 * - Tier 1 confluences (3x weight): BOS, liquidity sweeps, session manipulation
 * - Tier 2 confluences (2x weight): FVG, Order Blocks, IFVG, SMT divergence
 * - Tier 3 confluences (1x weight): Equilibrium, breaker blocks, Fibonacci
 * - Dynamic scoring algorithm with probability weighting
 * - Multi-timeframe confluence analysis
 */

class ConfluenceScorer {
    constructor(options = {}) {
        this.options = {
            // Weighting system
            tier1Weight: options.tier1Weight || 3.0,
            tier2Weight: options.tier2Weight || 2.0,
            tier3Weight: options.tier3Weight || 1.0,

            // Scoring thresholds
            minScore: options.minScore || 5.0,
            strongScore: options.strongScore || 8.0,
            extremeScore: options.extremeScore || 12.0,

            // Distance weighting
            maxDistance: options.maxDistance || 0.01, // 1% max distance for confluence
            distanceDecay: options.distanceDecay || 0.5, // Distance decay factor

            // Time weighting
            maxAge: options.maxAge || 48 * 60 * 60 * 1000, // 48 hours max age
            timeDecay: options.timeDecay || 0.3, // Time decay factor

            ...options
        };

        // Confluence tiers definition
        this.CONFLUENCE_TIERS = {
            TIER_1: {
                weight: this.options.tier1Weight,
                types: [
                    'break_of_structure',
                    'liquidity_sweep',
                    'session_manipulation',
                    'inducement'
                ]
            },
            TIER_2: {
                weight: this.options.tier2Weight,
                types: [
                    'fair_value_gap',
                    'order_block',
                    'inverse_fair_value_gap',
                    'smt_divergence',
                    'breaker_block'
                ]
            },
            TIER_3: {
                weight: this.options.tier3Weight,
                types: [
                    'equilibrium',
                    'fibonacci_level',
                    'psychological_level',
                    'trend_line',
                    'support_resistance'
                ]
            }
        };

        // Score ratings
        this.SCORE_RATINGS = {
            WEAK: { min: 0, max: this.options.minScore, label: 'weak' },
            MODERATE: { min: this.options.minScore, max: this.options.strongScore, label: 'moderate' },
            STRONG: { min: this.options.strongScore, max: this.options.extremeScore, label: 'strong' },
            EXTREME: { min: this.options.extremeScore, max: Infinity, label: 'extreme' }
        };
    }

    /**
     * Calculate confluence score for a specific price level
     * @param {number} targetPrice - The price level to analyze
     * @param {Array} confluences - Array of confluence objects
     * @param {number} currentTime - Current timestamp
     * @returns {Object} Confluence score analysis
     */
    calculateConfluenceScore(targetPrice, confluences, currentTime = Date.now()) {
        if (!confluences || confluences.length === 0) {
            return this._createEmptyScore(targetPrice);
        }

        let totalScore = 0;
        const activeConfluences = [];
        const scoringDetails = {
            tier1: { count: 0, score: 0, types: [] },
            tier2: { count: 0, score: 0, types: [] },
            tier3: { count: 0, score: 0, types: [] }
        };

        confluences.forEach(confluence => {
            const analysis = this._analyzeConfluence(confluence, targetPrice, currentTime);

            if (analysis.isActive) {
                totalScore += analysis.weightedScore;
                activeConfluences.push({
                    ...confluence,
                    analysis
                });

                // Update tier statistics
                const tier = this._getConfluenceTier(confluence.type);
                if (tier) {
                    scoringDetails[tier.name].count++;
                    scoringDetails[tier.name].score += analysis.weightedScore;
                    scoringDetails[tier.name].types.push(confluence.type);
                }
            }
        });

        // Apply probability weighting
        const probabilityScore = this._calculateProbabilityWeighting(totalScore, activeConfluences);

        return {
            targetPrice,
            rawScore: totalScore,
            probabilityScore,
            finalScore: probabilityScore,
            rating: this._getScoreRating(probabilityScore),
            confluenceCount: activeConfluences.length,
            activeConfluences,
            tierBreakdown: scoringDetails,
            timestamp: currentTime,
            analysis: {
                strength: this._assessStrength(probabilityScore, activeConfluences),
                quality: this._assessQuality(activeConfluences),
                reliability: this._assessReliability(activeConfluences, currentTime)
            }
        };
    }

    /**
     * Find confluence zones within price range
     * @param {number} centerPrice - Center price to search around
     * @param {number} range - Price range to search (percentage)
     * @param {Array} allConfluences - All available confluences
     * @param {number} currentTime - Current timestamp
     * @returns {Array} Array of confluence zones
     */
    findConfluenceZones(centerPrice, range, allConfluences, currentTime = Date.now()) {
        const priceStep = centerPrice * 0.001; // 0.1% price steps
        const searchRange = centerPrice * range;
        const zones = [];

        // Scan price levels within range
        for (let price = centerPrice - searchRange; price <= centerPrice + searchRange; price += priceStep) {
            const nearbyConfluences = this._findNearbyConfluences(price, allConfluences, this.options.maxDistance);

            if (nearbyConfluences.length > 0) {
                const score = this.calculateConfluenceScore(price, nearbyConfluences, currentTime);

                if (score.finalScore >= this.options.minScore) {
                    zones.push(score);
                }
            }
        }

        // Merge overlapping zones
        const mergedZones = this._mergeOverlappingZones(zones);

        return mergedZones.sort((a, b) => b.finalScore - a.finalScore);
    }

    /**
     * Calculate multi-timeframe confluence
     * @param {Object} multiTimeframeConfluences - Confluences from multiple timeframes
     * @param {number} targetPrice - Target price level
     * @param {number} currentTime - Current timestamp
     * @returns {Object} Multi-timeframe confluence analysis
     */
    calculateMultiTimeframeConfluence(multiTimeframeConfluences, targetPrice, currentTime = Date.now()) {
        const timeframes = Object.keys(multiTimeframeConfluences);
        const timeframeScores = {};
        let totalScore = 0;
        let timeframeCount = 0;

        timeframes.forEach(timeframe => {
            const confluences = multiTimeframeConfluences[timeframe];
            const score = this.calculateConfluenceScore(targetPrice, confluences, currentTime);

            if (score.finalScore > 0) {
                // Apply timeframe weighting
                const timeframeWeight = this._getTimeframeWeight(timeframe);
                const weightedScore = score.finalScore * timeframeWeight;

                timeframeScores[timeframe] = {
                    ...score,
                    weight: timeframeWeight,
                    weightedScore
                };

                totalScore += weightedScore;
                timeframeCount++;
            }
        });

        // Calculate alignment score
        const alignment = this._calculateTimeframeAlignment(timeframeScores);

        return {
            targetPrice,
            totalScore,
            averageScore: timeframeCount > 0 ? totalScore / timeframeCount : 0,
            timeframeScores,
            alignment,
            timeframeCount,
            rating: this._getScoreRating(totalScore),
            analysis: {
                convergence: alignment.convergence,
                strength: alignment.strength,
                reliability: alignment.reliability
            }
        };
    }

    /**
     * Analyze confluence quality and reliability
     * @param {Array} confluences - Array of confluence objects
     * @param {number} currentTime - Current timestamp
     * @returns {Object} Quality analysis
     */
    analyzeConfluenceQuality(confluences, currentTime = Date.now()) {
        if (!confluences || confluences.length === 0) {
            return { quality: 'poor', reliability: 0, factors: [] };
        }

        const qualityFactors = [];
        let reliabilityScore = 0;

        // Age factor
        const avgAge = confluences.reduce((sum, c) =>
            sum + (currentTime - (c.timestamp || currentTime)), 0) / confluences.length;
        const ageFactor = Math.max(0, 1 - (avgAge / this.options.maxAge));
        qualityFactors.push({ factor: 'age', score: ageFactor, weight: 0.2 });

        // Diversity factor (different types of confluences)
        const uniqueTypes = new Set(confluences.map(c => c.type)).size;
        const diversityFactor = Math.min(uniqueTypes / 5, 1); // Max score at 5+ different types
        qualityFactors.push({ factor: 'diversity', score: diversityFactor, weight: 0.3 });

        // Tier distribution
        const tierDistribution = this._analyzeTierDistribution(confluences);
        qualityFactors.push({ factor: 'tier_distribution', score: tierDistribution.score, weight: 0.25 });

        // Volume factor (if available)
        const volumeConfluences = confluences.filter(c => c.volume && c.volume > 0);
        const volumeFactor = volumeConfluences.length > 0 ?
            Math.min(volumeConfluences.length / confluences.length * 2, 1) : 0.5;
        qualityFactors.push({ factor: 'volume_support', score: volumeFactor, weight: 0.25 });

        // Calculate weighted reliability score
        reliabilityScore = qualityFactors.reduce((sum, factor) =>
            sum + (factor.score * factor.weight), 0);

        const quality = reliabilityScore > 0.8 ? 'excellent' :
                       reliabilityScore > 0.6 ? 'good' :
                       reliabilityScore > 0.4 ? 'moderate' :
                       reliabilityScore > 0.2 ? 'poor' : 'very_poor';

        return {
            quality,
            reliability: reliabilityScore,
            factors: qualityFactors,
            recommendations: this._generateQualityRecommendations(qualityFactors)
        };
    }

    /**
     * Generate trading signals based on confluence analysis
     * @param {Object} confluenceScore - Confluence score object
     * @param {Object} marketContext - Current market context
     * @returns {Object} Trading signal analysis
     */
    generateTradingSignal(confluenceScore, marketContext = {}) {
        if (!confluenceScore || confluenceScore.finalScore < this.options.minScore) {
            return {
                signal: 'none',
                confidence: 0,
                reasoning: 'Insufficient confluence score'
            };
        }

        const signal = {
            type: this._determineSignalType(confluenceScore, marketContext),
            strength: confluenceScore.rating,
            confidence: Math.min(confluenceScore.finalScore / this.options.extremeScore, 1),
            targetPrice: confluenceScore.targetPrice,
            confluenceScore: confluenceScore.finalScore,
            reasoning: this._generateSignalReasoning(confluenceScore, marketContext)
        };

        // Add risk assessment
        signal.risk = this._assessSignalRisk(confluenceScore, marketContext);

        // Add timing analysis
        signal.timing = this._analyzeSignalTiming(confluenceScore, marketContext);

        return signal;
    }

    // Private helper methods
    _analyzeConfluence(confluence, targetPrice, currentTime) {
        const distance = Math.abs(confluence.price - targetPrice) / targetPrice;
        const age = currentTime - (confluence.timestamp || currentTime);

        // Check if confluence is within acceptable distance
        const isActive = distance <= this.options.maxDistance;

        if (!isActive) {
            return { isActive: false, weightedScore: 0 };
        }

        // Get base weight for confluence type
        const tier = this._getConfluenceTier(confluence.type);
        const baseWeight = tier ? tier.weight : 1;

        // Apply distance decay
        const distanceWeight = Math.max(0, 1 - (distance / this.options.maxDistance));

        // Apply time decay
        const timeWeight = Math.max(0.2, 1 - (age / this.options.maxAge) * this.options.timeDecay);

        // Apply confluence-specific strength multiplier
        const strengthMultiplier = confluence.strength || 1;

        const weightedScore = baseWeight * distanceWeight * timeWeight * strengthMultiplier;

        return {
            isActive: true,
            baseWeight,
            distanceWeight,
            timeWeight,
            strengthMultiplier,
            weightedScore,
            distance,
            age
        };
    }

    _getConfluenceTier(type) {
        for (const [tierName, tierData] of Object.entries(this.CONFLUENCE_TIERS)) {
            if (tierData.types.includes(type)) {
                return { name: tierName.toLowerCase(), weight: tierData.weight };
            }
        }
        return null;
    }

    _calculateProbabilityWeighting(rawScore, activeConfluences) {
        // Apply diminishing returns to prevent over-scoring
        const diminishingFactor = 1 / (1 + Math.exp(-(rawScore - 10) / 3));

        // Apply diversity bonus
        const uniqueTypes = new Set(activeConfluences.map(c => c.type)).size;
        const diversityBonus = Math.min(uniqueTypes * 0.1, 0.5);

        return (rawScore * diminishingFactor) + diversityBonus;
    }

    _getScoreRating(score) {
        for (const [rating, data] of Object.entries(this.SCORE_RATINGS)) {
            if (score >= data.min && score < data.max) {
                return {
                    label: data.label,
                    value: rating,
                    score: score,
                    percentage: Math.min(score / this.options.extremeScore * 100, 100)
                };
            }
        }
        return this.SCORE_RATINGS.EXTREME;
    }

    _findNearbyConfluences(targetPrice, allConfluences, maxDistance) {
        return allConfluences.filter(confluence => {
            const distance = Math.abs(confluence.price - targetPrice) / targetPrice;
            return distance <= maxDistance;
        });
    }

    _mergeOverlappingZones(zones) {
        if (zones.length === 0) return [];

        const sorted = zones.sort((a, b) => a.targetPrice - b.targetPrice);
        const merged = [sorted[0]];

        for (let i = 1; i < sorted.length; i++) {
            const current = sorted[i];
            const last = merged[merged.length - 1];

            // Check if zones overlap (within 0.5% of each other)
            const priceDistance = Math.abs(current.targetPrice - last.targetPrice) / last.targetPrice;

            if (priceDistance < 0.005) {
                // Merge zones - keep the one with higher score
                if (current.finalScore > last.finalScore) {
                    merged[merged.length - 1] = current;
                }
            } else {
                merged.push(current);
            }
        }

        return merged;
    }

    _getTimeframeWeight(timeframe) {
        const weights = {
            '1m': 0.3,
            '5m': 0.5,
            '15m': 0.7,
            '30m': 0.8,
            '1h': 1.0,
            '4h': 1.2,
            '1d': 1.5,
            '1w': 1.3
        };

        return weights[timeframe] || 1.0;
    }

    _calculateTimeframeAlignment(timeframeScores) {
        const scores = Object.values(timeframeScores).map(ts => ts.finalScore);

        if (scores.length === 0) {
            return { convergence: 0, strength: 'weak', reliability: 0 };
        }

        // Calculate convergence (how similar the scores are)
        const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
        const convergence = Math.max(0, 1 - (Math.sqrt(variance) / avgScore));

        const strength = avgScore > this.options.strongScore ? 'strong' :
                        avgScore > this.options.minScore ? 'moderate' : 'weak';

        return {
            convergence,
            strength,
            reliability: convergence * (scores.length / 5) // More timeframes = higher reliability
        };
    }

    _assessStrength(score, confluences) {
        const tier1Count = confluences.filter(c => this._getConfluenceTier(c.type)?.name === 'tier_1').length;
        const tier2Count = confluences.filter(c => this._getConfluenceTier(c.type)?.name === 'tier_2').length;

        if (score >= this.options.extremeScore || tier1Count >= 2) {
            return 'extreme';
        } else if (score >= this.options.strongScore || (tier1Count >= 1 && tier2Count >= 1)) {
            return 'strong';
        } else if (score >= this.options.minScore) {
            return 'moderate';
        } else {
            return 'weak';
        }
    }

    _assessQuality(confluences) {
        const uniqueTypes = new Set(confluences.map(c => c.type)).size;
        const hasHighTier = confluences.some(c => this._getConfluenceTier(c.type)?.name === 'tier_1');

        if (uniqueTypes >= 4 && hasHighTier) {
            return 'high';
        } else if (uniqueTypes >= 3) {
            return 'medium';
        } else {
            return 'low';
        }
    }

    _assessReliability(confluences, currentTime) {
        const avgAge = confluences.reduce((sum, c) =>
            sum + (currentTime - (c.timestamp || currentTime)), 0) / confluences.length;

        const ageFactor = Math.max(0, 1 - (avgAge / this.options.maxAge));
        const volumeSupport = confluences.filter(c => c.volume && c.volume > 0).length / confluences.length;

        return (ageFactor * 0.6) + (volumeSupport * 0.4);
    }

    _analyzeTierDistribution(confluences) {
        const tierCounts = { tier_1: 0, tier_2: 0, tier_3: 0 };

        confluences.forEach(c => {
            const tier = this._getConfluenceTier(c.type);
            if (tier) {
                tierCounts[tier.name]++;
            }
        });

        // Ideal distribution has representation from all tiers
        const totalTiers = Object.values(tierCounts).filter(count => count > 0).length;
        const score = totalTiers / 3; // Max score when all 3 tiers are represented

        return { score, distribution: tierCounts };
    }

    _determineSignalType(confluenceScore, marketContext) {
        // Determine signal type based on confluence and market context
        if (marketContext.trend === 'bullish' && confluenceScore.targetPrice < marketContext.currentPrice) {
            return 'buy_support';
        } else if (marketContext.trend === 'bearish' && confluenceScore.targetPrice > marketContext.currentPrice) {
            return 'sell_resistance';
        } else {
            return 'reversal_zone';
        }
    }

    _generateSignalReasoning(confluenceScore, marketContext) {
        const reasons = [];

        reasons.push(`Strong confluence zone with score of ${confluenceScore.finalScore.toFixed(1)}`);

        if (confluenceScore.tierBreakdown.tier1.count > 0) {
            reasons.push(`${confluenceScore.tierBreakdown.tier1.count} Tier 1 confluences present`);
        }

        if (confluenceScore.confluenceCount >= 5) {
            reasons.push(`High confluence density (${confluenceScore.confluenceCount} factors)`);
        }

        return reasons;
    }

    _assessSignalRisk(confluenceScore, marketContext) {
        let riskScore = 0;

        // Lower risk with higher confluence scores
        riskScore += Math.max(0, (this.options.extremeScore - confluenceScore.finalScore) / this.options.extremeScore) * 0.4;

        // Higher risk with fewer confluences
        riskScore += Math.max(0, (5 - confluenceScore.confluenceCount) / 5) * 0.3;

        // Market context risk
        if (marketContext.volatility === 'high') riskScore += 0.2;
        if (marketContext.trend === 'sideways') riskScore += 0.1;

        return {
            score: Math.min(riskScore, 1),
            level: riskScore < 0.3 ? 'low' : riskScore < 0.6 ? 'medium' : 'high'
        };
    }

    _analyzeSignalTiming(confluenceScore, marketContext) {
        const hasRecentConfluences = confluenceScore.activeConfluences.some(c => {
            const age = Date.now() - (c.timestamp || Date.now());
            return age < (2 * 60 * 60 * 1000); // Less than 2 hours old
        });

        return {
            freshness: hasRecentConfluences ? 'fresh' : 'aged',
            urgency: confluenceScore.rating.label === 'extreme' ? 'high' : 'medium',
            window: 'active' // Could be enhanced with time-based analysis
        };
    }

    _generateQualityRecommendations(factors) {
        const recommendations = [];

        factors.forEach(factor => {
            if (factor.score < 0.5) {
                switch (factor.factor) {
                    case 'age':
                        recommendations.push('Look for more recent confluences');
                        break;
                    case 'diversity':
                        recommendations.push('Seek confluences from different analysis types');
                        break;
                    case 'volume_support':
                        recommendations.push('Confirm with volume analysis');
                        break;
                    case 'tier_distribution':
                        recommendations.push('Add higher-tier confluence factors');
                        break;
                }
            }
        });

        return recommendations;
    }

    _createEmptyScore(targetPrice) {
        return {
            targetPrice,
            rawScore: 0,
            probabilityScore: 0,
            finalScore: 0,
            rating: this._getScoreRating(0),
            confluenceCount: 0,
            activeConfluences: [],
            tierBreakdown: {
                tier1: { count: 0, score: 0, types: [] },
                tier2: { count: 0, score: 0, types: [] },
                tier3: { count: 0, score: 0, types: [] }
            },
            timestamp: Date.now()
        };
    }
}

module.exports = ConfluenceScorer;