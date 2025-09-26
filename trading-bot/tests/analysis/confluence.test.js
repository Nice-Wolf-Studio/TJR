/**
 * Confluence Scoring System Tests
 * Comprehensive test suite for the ConfluenceScorer class
 */

const ConfluenceScorer = require('../../src/analysis/confluence');

describe('ConfluenceScorer', () => {
    let scorer;
    let mockConfluences;

    beforeEach(() => {
        scorer = new ConfluenceScorer();

        // Create mock confluence data
        mockConfluences = [
            {
                type: 'break_of_structure',
                price: 1.1350,
                strength: 2.5,
                timestamp: Date.now() - (2 * 60 * 60 * 1000), // 2 hours ago
                volume: 1500
            },
            {
                type: 'fair_value_gap',
                price: 1.1352,
                strength: 1.8,
                timestamp: Date.now() - (1 * 60 * 60 * 1000), // 1 hour ago
                volume: 1200
            },
            {
                type: 'psychological_level',
                price: 1.1350,
                strength: 1.2,
                timestamp: Date.now() - (24 * 60 * 60 * 1000), // 24 hours ago
                volume: null
            },
            {
                type: 'order_block',
                price: 1.1348,
                strength: 2.0,
                timestamp: Date.now() - (30 * 60 * 1000), // 30 minutes ago
                volume: 1800
            },
            {
                type: 'fibonacci_level',
                price: 1.1351,
                strength: 1.5,
                timestamp: Date.now() - (6 * 60 * 60 * 1000), // 6 hours ago
                volume: 1000
            }
        ];
    });

    describe('Constructor', () => {
        test('should initialize with default options', () => {
            const defaultScorer = new ConfluenceScorer();
            expect(defaultScorer.options.tier1Weight).toBe(3.0);
            expect(defaultScorer.options.tier2Weight).toBe(2.0);
            expect(defaultScorer.options.tier3Weight).toBe(1.0);
            expect(defaultScorer.options.minScore).toBe(5.0);
        });

        test('should initialize with custom options', () => {
            const customScorer = new ConfluenceScorer({
                tier1Weight: 4.0,
                minScore: 6.0,
                maxDistance: 0.02
            });
            expect(customScorer.options.tier1Weight).toBe(4.0);
            expect(customScorer.options.minScore).toBe(6.0);
            expect(customScorer.options.maxDistance).toBe(0.02);
        });

        test('should properly define confluence tiers', () => {
            expect(scorer.CONFLUENCE_TIERS.TIER_1.types).toContain('break_of_structure');
            expect(scorer.CONFLUENCE_TIERS.TIER_2.types).toContain('fair_value_gap');
            expect(scorer.CONFLUENCE_TIERS.TIER_3.types).toContain('fibonacci_level');
        });
    });

    describe('calculateConfluenceScore', () => {
        test('should calculate confluence score for target price', () => {
            const targetPrice = 1.1350;
            const currentTime = Date.now();

            const result = scorer.calculateConfluenceScore(targetPrice, mockConfluences, currentTime);

            expect(result).toHaveProperty('targetPrice', targetPrice);
            expect(result).toHaveProperty('rawScore');
            expect(result).toHaveProperty('probabilityScore');
            expect(result).toHaveProperty('finalScore');
            expect(result).toHaveProperty('rating');
            expect(result).toHaveProperty('confluenceCount');
            expect(result).toHaveProperty('activeConfluences');
            expect(result).toHaveProperty('tierBreakdown');

            expect(typeof result.rawScore).toBe('number');
            expect(typeof result.probabilityScore).toBe('number');
            expect(typeof result.finalScore).toBe('number');
            expect(result.confluenceCount).toBeGreaterThan(0);
        });

        test('should filter confluences by distance', () => {
            const targetPrice = 1.1350;
            const farConfluence = {
                type: 'order_block',
                price: 1.2000, // Very far from target
                strength: 3.0,
                timestamp: Date.now()
            };

            const result = scorer.calculateConfluenceScore(
                targetPrice,
                [...mockConfluences, farConfluence],
                Date.now()
            );

            // Far confluence should not be included
            const farIncluded = result.activeConfluences.some(c => c.price === 1.2000);
            expect(farIncluded).toBeFalsy();
        });

        test('should apply time decay to old confluences', () => {
            const targetPrice = 1.1350;
            const oldConfluence = {
                type: 'break_of_structure',
                price: 1.1350,
                strength: 3.0,
                timestamp: Date.now() - (72 * 60 * 60 * 1000) // 72 hours ago (very old)
            };

            const recentConfluence = {
                type: 'break_of_structure',
                price: 1.1350,
                strength: 3.0,
                timestamp: Date.now() - (1 * 60 * 60 * 1000) // 1 hour ago (recent)
            };

            const oldResult = scorer.calculateConfluenceScore(targetPrice, [oldConfluence]);
            const recentResult = scorer.calculateConfluenceScore(targetPrice, [recentConfluence]);

            expect(recentResult.finalScore).toBeGreaterThan(oldResult.finalScore);
        });

        test('should weight different tiers correctly', () => {
            const targetPrice = 1.1350;

            const tier1Confluence = {
                type: 'break_of_structure',
                price: 1.1350,
                strength: 1.0,
                timestamp: Date.now()
            };

            const tier2Confluence = {
                type: 'fair_value_gap',
                price: 1.1350,
                strength: 1.0,
                timestamp: Date.now()
            };

            const tier3Confluence = {
                type: 'fibonacci_level',
                price: 1.1350,
                strength: 1.0,
                timestamp: Date.now()
            };

            const tier1Result = scorer.calculateConfluenceScore(targetPrice, [tier1Confluence]);
            const tier2Result = scorer.calculateConfluenceScore(targetPrice, [tier2Confluence]);
            const tier3Result = scorer.calculateConfluenceScore(targetPrice, [tier3Confluence]);

            expect(tier1Result.finalScore).toBeGreaterThan(tier2Result.finalScore);
            expect(tier2Result.finalScore).toBeGreaterThan(tier3Result.finalScore);
        });

        test('should return empty score for no confluences', () => {
            const result = scorer.calculateConfluenceScore(1.1350, []);

            expect(result.finalScore).toBe(0);
            expect(result.confluenceCount).toBe(0);
            expect(result.activeConfluences).toEqual([]);
        });

        test('should provide tier breakdown', () => {
            const result = scorer.calculateConfluenceScore(1.1350, mockConfluences);

            expect(result.tierBreakdown).toHaveProperty('tier1');
            expect(result.tierBreakdown).toHaveProperty('tier2');
            expect(result.tierBreakdown).toHaveProperty('tier3');

            expect(result.tierBreakdown.tier1).toHaveProperty('count');
            expect(result.tierBreakdown.tier1).toHaveProperty('score');
            expect(result.tierBreakdown.tier1).toHaveProperty('types');

            expect(result.tierBreakdown.tier1.count).toBeGreaterThanOrEqual(0);
        });
    });

    describe('findConfluenceZones', () => {
        test('should find confluence zones within range', () => {
            const centerPrice = 1.1350;
            const range = 0.01; // 1% range

            const zones = scorer.findConfluenceZones(centerPrice, range, mockConfluences);

            expect(zones).toBeInstanceOf(Array);

            zones.forEach(zone => {
                expect(zone).toHaveProperty('targetPrice');
                expect(zone).toHaveProperty('finalScore');
                expect(zone).toHaveProperty('confluenceCount');
                expect(zone.finalScore).toBeGreaterThanOrEqual(scorer.options.minScore);

                // Should be within range
                const distance = Math.abs(zone.targetPrice - centerPrice) / centerPrice;
                expect(distance).toBeLessThanOrEqual(range);
            });
        });

        test('should sort zones by score', () => {
            const zones = scorer.findConfluenceZones(1.1350, 0.01, mockConfluences);

            if (zones.length > 1) {
                for (let i = 1; i < zones.length; i++) {
                    expect(zones[i - 1].finalScore).toBeGreaterThanOrEqual(zones[i].finalScore);
                }
            }
        });

        test('should return empty array for no confluences in range', () => {
            const distantConfluences = mockConfluences.map(c => ({
                ...c,
                price: c.price + 0.1 // Move all confluences far away
            }));

            const zones = scorer.findConfluenceZones(1.1350, 0.005, distantConfluences);
            expect(zones).toEqual([]);
        });
    });

    describe('calculateMultiTimeframeConfluence', () => {
        test('should calculate multi-timeframe confluence', () => {
            const multiTimeframeConfluences = {
                '1h': mockConfluences.slice(0, 2),
                '4h': mockConfluences.slice(2, 4),
                '1d': mockConfluences.slice(4)
            };

            const result = scorer.calculateMultiTimeframeConfluence(
                multiTimeframeConfluences,
                1.1350
            );

            expect(result).toHaveProperty('targetPrice', 1.1350);
            expect(result).toHaveProperty('totalScore');
            expect(result).toHaveProperty('averageScore');
            expect(result).toHaveProperty('timeframeScores');
            expect(result).toHaveProperty('alignment');
            expect(result).toHaveProperty('timeframeCount');

            expect(typeof result.totalScore).toBe('number');
            expect(typeof result.averageScore).toBe('number');
            expect(typeof result.timeframeCount).toBe('number');

            // Should have scores for each timeframe
            expect(result.timeframeScores).toHaveProperty('1h');
            expect(result.timeframeScores).toHaveProperty('4h');
            expect(result.timeframeScores).toHaveProperty('1d');
        });

        test('should apply timeframe weighting', () => {
            const multiTimeframeConfluences = {
                '1m': [mockConfluences[0]], // Lower weight timeframe
                '1d': [mockConfluences[1]]  // Higher weight timeframe
            };

            const result = scorer.calculateMultiTimeframeConfluence(
                multiTimeframeConfluences,
                1.1350
            );

            // Daily timeframe should have higher weighted score
            if (result.timeframeScores['1m'] && result.timeframeScores['1d']) {
                expect(result.timeframeScores['1d'].weightedScore).toBeGreaterThan(
                    result.timeframeScores['1m'].weightedScore
                );
            }
        });
    });

    describe('analyzeConfluenceQuality', () => {
        test('should analyze confluence quality', () => {
            const result = scorer.analyzeConfluenceQuality(mockConfluences);

            expect(result).toHaveProperty('quality');
            expect(result).toHaveProperty('reliability');
            expect(result).toHaveProperty('factors');
            expect(result).toHaveProperty('recommendations');

            expect(['excellent', 'good', 'moderate', 'poor', 'very_poor']).toContain(result.quality);
            expect(typeof result.reliability).toBe('number');
            expect(result.reliability).toBeGreaterThanOrEqual(0);
            expect(result.reliability).toBeLessThanOrEqual(1);

            expect(result.factors).toBeInstanceOf(Array);
            expect(result.recommendations).toBeInstanceOf(Array);
        });

        test('should return poor quality for empty confluences', () => {
            const result = scorer.analyzeConfluenceQuality([]);
            expect(result.quality).toBe('poor');
            expect(result.reliability).toBe(0);
        });

        test('should consider confluence diversity in quality', () => {
            // High diversity - different types
            const diverseConfluences = [
                { type: 'break_of_structure', timestamp: Date.now(), volume: 1000 },
                { type: 'fair_value_gap', timestamp: Date.now(), volume: 1000 },
                { type: 'psychological_level', timestamp: Date.now(), volume: 1000 },
                { type: 'fibonacci_level', timestamp: Date.now(), volume: 1000 }
            ];

            // Low diversity - same types
            const uniformConfluences = [
                { type: 'fibonacci_level', timestamp: Date.now(), volume: 1000 },
                { type: 'fibonacci_level', timestamp: Date.now(), volume: 1000 },
                { type: 'fibonacci_level', timestamp: Date.now(), volume: 1000 }
            ];

            const diverseResult = scorer.analyzeConfluenceQuality(diverseConfluences);
            const uniformResult = scorer.analyzeConfluenceQuality(uniformConfluences);

            expect(diverseResult.reliability).toBeGreaterThan(uniformResult.reliability);
        });
    });

    describe('generateTradingSignal', () => {
        test('should generate trading signal from confluence score', () => {
            const confluenceScore = {
                targetPrice: 1.1350,
                finalScore: 8.5,
                rating: { label: 'strong' },
                confluenceCount: 4,
                activeConfluences: mockConfluences
            };

            const marketContext = {
                trend: 'bullish',
                currentPrice: 1.1340,
                volatility: 'medium'
            };

            const signal = scorer.generateTradingSignal(confluenceScore, marketContext);

            expect(signal).toHaveProperty('type');
            expect(signal).toHaveProperty('strength');
            expect(signal).toHaveProperty('confidence');
            expect(signal).toHaveProperty('targetPrice');
            expect(signal).toHaveProperty('confluenceScore');
            expect(signal).toHaveProperty('reasoning');
            expect(signal).toHaveProperty('risk');
            expect(signal).toHaveProperty('timing');

            expect(typeof signal.confidence).toBe('number');
            expect(signal.confidence).toBeGreaterThanOrEqual(0);
            expect(signal.confidence).toBeLessThanOrEqual(1);
        });

        test('should return no signal for low confluence score', () => {
            const lowConfluenceScore = {
                targetPrice: 1.1350,
                finalScore: 2.0, // Below minimum
                rating: { label: 'weak' },
                confluenceCount: 1,
                activeConfluences: [mockConfluences[0]]
            };

            const signal = scorer.generateTradingSignal(lowConfluenceScore);

            expect(signal.signal).toBe('none');
            expect(signal.confidence).toBe(0);
        });
    });

    describe('Score Ratings', () => {
        test('should correctly rate scores', () => {
            const weakScore = scorer.calculateConfluenceScore(1.1350, [mockConfluences[4]]); // Single tier3
            const moderateScore = scorer.calculateConfluenceScore(1.1350, mockConfluences.slice(0, 2));
            const strongScore = scorer.calculateConfluenceScore(1.1350, mockConfluences);

            expect(['weak', 'moderate', 'strong'].includes(weakScore.rating.label)).toBeTruthy();
            expect(['weak', 'moderate', 'strong'].includes(moderateScore.rating.label)).toBeTruthy();
            expect(['moderate', 'strong', 'extreme'].includes(strongScore.rating.label)).toBeTruthy();
        });
    });

    describe('Edge Cases and Error Handling', () => {
        test('should handle null/undefined confluences', () => {
            expect(() => scorer.calculateConfluenceScore(1.1350, null)).not.toThrow();
            expect(() => scorer.calculateConfluenceScore(1.1350, undefined)).not.toThrow();

            const result1 = scorer.calculateConfluenceScore(1.1350, null);
            const result2 = scorer.calculateConfluenceScore(1.1350, undefined);

            expect(result1.finalScore).toBe(0);
            expect(result2.finalScore).toBe(0);
        });

        test('should handle confluences with missing properties', () => {
            const incompleteConfluences = [
                { type: 'break_of_structure', price: 1.1350 }, // Missing timestamp, strength
                { price: 1.1350, strength: 2.0 }, // Missing type
                { type: 'fair_value_gap', strength: 1.5 } // Missing price
            ];

            expect(() => scorer.calculateConfluenceScore(1.1350, incompleteConfluences)).not.toThrow();
        });

        test('should handle zero or negative prices', () => {
            const badPriceConfluences = [
                { type: 'break_of_structure', price: 0, strength: 2.0, timestamp: Date.now() },
                { type: 'fair_value_gap', price: -1.1350, strength: 1.5, timestamp: Date.now() }
            ];

            expect(() => scorer.calculateConfluenceScore(1.1350, badPriceConfluences)).not.toThrow();
        });

        test('should handle invalid target price', () => {
            expect(() => scorer.calculateConfluenceScore(0, mockConfluences)).not.toThrow();
            expect(() => scorer.calculateConfluenceScore(-1, mockConfluences)).not.toThrow();
            expect(() => scorer.calculateConfluenceScore(null, mockConfluences)).not.toThrow();
        });
    });

    describe('Performance Tests', () => {
        test('should handle large confluence arrays efficiently', () => {
            // Generate large confluence array
            const largeConfluences = [];
            for (let i = 0; i < 1000; i++) {
                largeConfluences.push({
                    type: 'fibonacci_level',
                    price: 1.1350 + (Math.random() - 0.5) * 0.01,
                    strength: Math.random() * 3,
                    timestamp: Date.now() - Math.random() * 86400000 // Random time within 24h
                });
            }

            const startTime = Date.now();
            const result = scorer.calculateConfluenceScore(1.1350, largeConfluences);
            const endTime = Date.now();

            expect(result).toBeDefined();
            expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
        });
    });

    describe('Integration Tests', () => {
        test('should work with realistic trading scenario', () => {
            // Scenario: Strong bullish confluence at major resistance
            const scenarioConfluences = [
                // Tier 1 confluences
                {
                    type: 'break_of_structure',
                    price: 1.1500,
                    strength: 3.0,
                    timestamp: Date.now() - (30 * 60 * 1000) // 30 min ago
                },
                {
                    type: 'liquidity_sweep',
                    price: 1.1502,
                    strength: 2.8,
                    timestamp: Date.now() - (15 * 60 * 1000) // 15 min ago
                },
                // Tier 2 confluences
                {
                    type: 'fair_value_gap',
                    price: 1.1498,
                    strength: 2.2,
                    timestamp: Date.now() - (45 * 60 * 1000)
                },
                {
                    type: 'order_block',
                    price: 1.1501,
                    strength: 2.5,
                    timestamp: Date.now() - (60 * 60 * 1000)
                },
                // Tier 3 confluences
                {
                    type: 'psychological_level',
                    price: 1.1500,
                    strength: 1.5,
                    timestamp: Date.now() - (24 * 60 * 60 * 1000)
                },
                {
                    type: 'fibonacci_level',
                    price: 1.1499,
                    strength: 1.8,
                    timestamp: Date.now() - (2 * 60 * 60 * 1000)
                }
            ];

            const result = scorer.calculateConfluenceScore(1.1500, scenarioConfluences);

            // Should be a strong confluence zone
            expect(result.finalScore).toBeGreaterThan(scorer.options.strongScore);
            expect(result.confluenceCount).toBeGreaterThan(4);
            expect(['strong', 'extreme'].includes(result.rating.label)).toBeTruthy();

            // Should have representation from all tiers
            expect(result.tierBreakdown.tier1.count).toBeGreaterThan(0);
            expect(result.tierBreakdown.tier2.count).toBeGreaterThan(0);
            expect(result.tierBreakdown.tier3.count).toBeGreaterThan(0);

            // Generate trading signal
            const marketContext = {
                trend: 'bullish',
                currentPrice: 1.1485,
                volatility: 'medium'
            };

            const signal = scorer.generateTradingSignal(result, marketContext);
            expect(signal.type).not.toBe('none');
            expect(signal.confidence).toBeGreaterThan(0.6);
        });
    });
});