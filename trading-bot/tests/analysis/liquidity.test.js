/**
 * Liquidity Analysis Module Tests
 * Comprehensive test suite for the LiquidityAnalyzer class
 */

const LiquidityAnalyzer = require('../../src/analysis/liquidity');

describe('LiquidityAnalyzer', () => {
    let analyzer;
    let mockPriceData;

    beforeEach(() => {
        analyzer = new LiquidityAnalyzer();

        // Create mock price data
        mockPriceData = [
            { timestamp: 1640995200000, open: 1.1300, high: 1.1350, low: 1.1280, close: 1.1320, volume: 1000 },
            { timestamp: 1640998800000, open: 1.1320, high: 1.1380, low: 1.1310, close: 1.1350, volume: 1200 },
            { timestamp: 1641002400000, open: 1.1350, high: 1.1400, low: 1.1330, close: 1.1360, volume: 1100 },
            { timestamp: 1641006000000, open: 1.1360, high: 1.1420, low: 1.1340, close: 1.1400, volume: 1300 },
            { timestamp: 1641009600000, open: 1.1400, high: 1.1450, low: 1.1380, close: 1.1420, volume: 1400 },
            { timestamp: 1641013200000, open: 1.1420, high: 1.1400, low: 1.1350, close: 1.1360, volume: 1500 },
            { timestamp: 1641016800000, open: 1.1360, high: 1.1380, low: 1.1320, close: 1.1340, volume: 1200 },
            { timestamp: 1641020400000, open: 1.1340, high: 1.1360, low: 1.1300, close: 1.1320, volume: 1100 },
            { timestamp: 1641024000000, open: 1.1320, high: 1.1350, low: 1.1280, close: 1.1300, volume: 1000 },
            { timestamp: 1641027600000, open: 1.1300, high: 1.1320, low: 1.1250, close: 1.1270, volume: 900 }
        ];
    });

    describe('Constructor', () => {
        test('should initialize with default options', () => {
            const defaultAnalyzer = new LiquidityAnalyzer();
            expect(defaultAnalyzer.options.equalLevelTolerance).toBe(0.0005);
            expect(defaultAnalyzer.options.psychologicalLevelStrength).toBe(1.2);
            expect(defaultAnalyzer.options.sessionStrength).toBe(1.5);
        });

        test('should initialize with custom options', () => {
            const customAnalyzer = new LiquidityAnalyzer({
                equalLevelTolerance: 0.001,
                psychologicalLevelStrength: 2.0
            });
            expect(customAnalyzer.options.equalLevelTolerance).toBe(0.001);
            expect(customAnalyzer.options.psychologicalLevelStrength).toBe(2.0);
        });
    });

    describe('detectEqualLevels', () => {
        test('should detect equal highs', () => {
            const equalHighs = analyzer.detectEqualLevels(mockPriceData, 'high');
            expect(equalHighs).toBeInstanceOf(Array);
            expect(equalHighs.length).toBeGreaterThanOrEqual(0);

            if (equalHighs.length > 0) {
                expect(equalHighs[0]).toHaveProperty('price');
                expect(equalHighs[0]).toHaveProperty('type');
                expect(equalHighs[0]).toHaveProperty('touches');
                expect(equalHighs[0]).toHaveProperty('strength');
                expect(equalHighs[0].type).toBe('high');
            }
        });

        test('should detect equal lows', () => {
            const equalLows = analyzer.detectEqualLevels(mockPriceData, 'low');
            expect(equalLows).toBeInstanceOf(Array);

            if (equalLows.length > 0) {
                expect(equalLows[0]).toHaveProperty('price');
                expect(equalLows[0]).toHaveProperty('type');
                expect(equalLows[0]).toHaveProperty('touches');
                expect(equalLows[0]).toHaveProperty('strength');
                expect(equalLows[0].type).toBe('low');
            }
        });

        test('should return empty array for insufficient data', () => {
            const result = analyzer.detectEqualLevels([], 'high');
            expect(result).toEqual([]);

            const result2 = analyzer.detectEqualLevels([mockPriceData[0]], 'high');
            expect(result2).toEqual([]);
        });

        test('should sort results by strength', () => {
            const equalHighs = analyzer.detectEqualLevels(mockPriceData, 'high');
            if (equalHighs.length > 1) {
                for (let i = 1; i < equalHighs.length; i++) {
                    expect(equalHighs[i - 1].strength).toBeGreaterThanOrEqual(equalHighs[i].strength);
                }
            }
        });
    });

    describe('identifySessionExtremes', () => {
        test('should identify session extremes for all sessions', () => {
            const sessionExtremes = analyzer.identifySessionExtremes(mockPriceData, 'all');
            expect(sessionExtremes).toBeInstanceOf(Object);

            // Should have session data
            const sessions = Object.keys(sessionExtremes);
            sessions.forEach(session => {
                expect(sessionExtremes[session]).toHaveProperty('high');
                expect(sessionExtremes[session]).toHaveProperty('low');
                expect(sessionExtremes[session].high).toHaveProperty('price');
                expect(sessionExtremes[session].high).toHaveProperty('timestamp');
                expect(sessionExtremes[session].high).toHaveProperty('strength');
                expect(sessionExtremes[session].low).toHaveProperty('price');
                expect(sessionExtremes[session].low).toHaveProperty('timestamp');
                expect(sessionExtremes[session].low).toHaveProperty('strength');
            });
        });

        test('should identify extremes for specific session', () => {
            const londonExtremes = analyzer.identifySessionExtremes(mockPriceData, 'london');
            expect(londonExtremes).toHaveProperty('london');

            if (londonExtremes.london) {
                expect(londonExtremes.london).toHaveProperty('high');
                expect(londonExtremes.london).toHaveProperty('low');
            }
        });

        test('should return empty object for no data', () => {
            const result = analyzer.identifySessionExtremes([], 'all');
            expect(result).toEqual({});
        });
    });

    describe('mapPsychologicalLevels', () => {
        test('should map psychological levels for forex pairs', () => {
            const currentPrice = 1.1350; // Forex price
            const levels = analyzer.mapPsychologicalLevels(currentPrice, 200);

            expect(levels).toBeInstanceOf(Array);
            if (levels.length > 0) {
                expect(levels[0]).toHaveProperty('price');
                expect(levels[0]).toHaveProperty('type');
                expect(levels[0]).toHaveProperty('strength');
                expect(levels[0]).toHaveProperty('distance');

                // Should include both 00 and 50 levels
                const hasOOLevel = levels.some(level => level.type === 'psychological_00');
                const has50Level = levels.some(level => level.type === 'psychological_50');
                expect(hasOOLevel || has50Level).toBeTruthy();
            }
        });

        test('should map psychological levels for indices/stocks', () => {
            const currentPrice = 15000; // Index price
            const levels = analyzer.mapPsychologicalLevels(currentPrice, 1000);

            expect(levels).toBeInstanceOf(Array);
            if (levels.length > 0) {
                expect(levels[0]).toHaveProperty('price');
                expect(levels[0]).toHaveProperty('type');
                expect(levels[0]).toHaveProperty('strength');
                expect(levels[0]).toHaveProperty('distance');

                // Should include major/minor levels
                const hasMajorLevel = levels.some(level => level.type === 'psychological_major');
                const hasMinorLevel = levels.some(level => level.type === 'psychological_minor');
                expect(hasMajorLevel || hasMinorLevel).toBeTruthy();
            }
        });

        test('should sort levels by distance from current price', () => {
            const currentPrice = 1.1350;
            const levels = analyzer.mapPsychologicalLevels(currentPrice, 200);

            if (levels.length > 1) {
                for (let i = 1; i < levels.length; i++) {
                    expect(levels[i - 1].distance).toBeLessThanOrEqual(levels[i].distance);
                }
            }
        });
    });

    describe('calculateTrendlineLiquidity', () => {
        test('should calculate liquidity for trendlines', () => {
            const trendlines = [
                {
                    startPrice: 1.1300,
                    endPrice: 1.1400,
                    startTime: mockPriceData[0].timestamp,
                    endTime: mockPriceData[mockPriceData.length - 1].timestamp
                }
            ];

            const result = analyzer.calculateTrendlineLiquidity(mockPriceData, trendlines);
            expect(result).toBeInstanceOf(Array);
            expect(result.length).toBe(1);

            expect(result[0]).toHaveProperty('liquidity');
            expect(result[0].liquidity).toHaveProperty('touches');
            expect(result[0].liquidity).toHaveProperty('strength');
            expect(result[0].liquidity).toHaveProperty('averageDistance');
        });

        test('should handle empty trendlines array', () => {
            const result = analyzer.calculateTrendlineLiquidity(mockPriceData, []);
            expect(result).toEqual([]);
        });
    });

    describe('calculateLiquidityStrength', () => {
        test('should calculate strength for liquidity level', () => {
            const liquidityLevel = {
                touches: 3,
                points: [
                    { timestamp: mockPriceData[0].timestamp, volume: 1000 },
                    { timestamp: mockPriceData[2].timestamp, volume: 1100 },
                    { timestamp: mockPriceData[4].timestamp, volume: 1400 }
                ],
                timespan: mockPriceData[4].timestamp - mockPriceData[0].timestamp,
                type: 'equal_high'
            };

            const strength = analyzer.calculateLiquidityStrength(liquidityLevel);
            expect(typeof strength).toBe('number');
            expect(strength).toBeGreaterThan(0);
        });

        test('should apply session strength multiplier', () => {
            const sessionLevel = {
                touches: 2,
                points: [
                    { timestamp: mockPriceData[0].timestamp },
                    { timestamp: mockPriceData[2].timestamp }
                ],
                type: 'session_high'
            };

            const normalLevel = {
                touches: 2,
                points: [
                    { timestamp: mockPriceData[0].timestamp },
                    { timestamp: mockPriceData[2].timestamp }
                ],
                type: 'equal_high'
            };

            const sessionStrength = analyzer.calculateLiquidityStrength(sessionLevel);
            const normalStrength = analyzer.calculateLiquidityStrength(normalLevel);

            expect(sessionStrength).toBeGreaterThan(normalStrength);
        });
    });

    describe('getAllLiquidityLevels', () => {
        test('should return comprehensive liquidity analysis', () => {
            const result = analyzer.getAllLiquidityLevels(mockPriceData, { psychRange: 200 });

            expect(result).toHaveProperty('equalHighs');
            expect(result).toHaveProperty('equalLows');
            expect(result).toHaveProperty('sessionExtremes');
            expect(result).toHaveProperty('psychologicalLevels');
            expect(result).toHaveProperty('allLevels');
            expect(result).toHaveProperty('summary');

            expect(result.equalHighs).toBeInstanceOf(Array);
            expect(result.equalLows).toBeInstanceOf(Array);
            expect(result.sessionExtremes).toBeInstanceOf(Object);
            expect(result.psychologicalLevels).toBeInstanceOf(Array);
            expect(result.allLevels).toBeInstanceOf(Array);

            expect(result.summary).toHaveProperty('totalLevels');
            expect(result.summary).toHaveProperty('strongLevels');
            expect(result.summary).toHaveProperty('nearbyLevels');
            expect(typeof result.summary.totalLevels).toBe('number');
        });

        test('should sort all levels by strength', () => {
            const result = analyzer.getAllLiquidityLevels(mockPriceData);

            if (result.allLevels.length > 1) {
                for (let i = 1; i < result.allLevels.length; i++) {
                    expect(result.allLevels[i - 1].strength).toBeGreaterThanOrEqual(
                        result.allLevels[i].strength
                    );
                }
            }
        });

        test('should handle insufficient data gracefully', () => {
            const result = analyzer.getAllLiquidityLevels([]);
            expect(result).toHaveProperty('equalHighs');
            expect(result).toHaveProperty('equalLows');
            expect(result).toHaveProperty('allLevels');
        });
    });

    describe('Edge Cases and Error Handling', () => {
        test('should handle null/undefined input', () => {
            expect(() => analyzer.detectEqualLevels(null, 'high')).not.toThrow();
            expect(() => analyzer.detectEqualLevels(undefined, 'high')).not.toThrow();
            expect(() => analyzer.identifySessionExtremes(null)).not.toThrow();
        });

        test('should handle empty price data', () => {
            const result = analyzer.getAllLiquidityLevels([]);
            expect(result).toBeDefined();
            expect(result.allLevels).toEqual([]);
        });

        test('should handle single candle data', () => {
            const singleCandle = [mockPriceData[0]];
            const result = analyzer.getAllLiquidityLevels(singleCandle);
            expect(result).toBeDefined();
            expect(result.equalHighs).toEqual([]);
            expect(result.equalLows).toEqual([]);
        });

        test('should handle malformed price data', () => {
            const malformedData = [
                { timestamp: 1640995200000, open: null, high: 1.1350, low: 1.1280, close: 1.1320 },
                { timestamp: 1640998800000, open: 1.1320, high: undefined, low: 1.1310, close: 1.1350 }
            ];

            expect(() => analyzer.getAllLiquidityLevels(malformedData)).not.toThrow();
        });
    });

    describe('Performance Tests', () => {
        test('should handle large datasets efficiently', () => {
            // Generate large dataset
            const largeDataset = [];
            for (let i = 0; i < 10000; i++) {
                largeDataset.push({
                    timestamp: 1640995200000 + (i * 60000),
                    open: 1.1300 + Math.random() * 0.01,
                    high: 1.1300 + Math.random() * 0.015,
                    low: 1.1300 - Math.random() * 0.015,
                    close: 1.1300 + Math.random() * 0.01,
                    volume: 1000 + Math.random() * 500
                });
            }

            const startTime = Date.now();
            const result = analyzer.getAllLiquidityLevels(largeDataset);
            const endTime = Date.now();

            expect(result).toBeDefined();
            expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
        });
    });

    describe('Integration Tests', () => {
        test('should work with real-world-like data patterns', () => {
            // Create data with known patterns
            const patternData = [
                // Double top pattern
                { timestamp: 1640995200000, open: 1.1300, high: 1.1350, low: 1.1280, close: 1.1340, volume: 1000 },
                { timestamp: 1640998800000, open: 1.1340, high: 1.1400, low: 1.1330, close: 1.1390, volume: 1200 },
                { timestamp: 1641002400000, open: 1.1390, high: 1.1450, low: 1.1380, close: 1.1440, volume: 1300 },
                { timestamp: 1641006000000, open: 1.1440, high: 1.1500, low: 1.1430, close: 1.1480, volume: 1400 },
                { timestamp: 1641009600000, open: 1.1480, high: 1.1500, low: 1.1460, close: 1.1470, volume: 1100 }, // First top at 1.1500
                { timestamp: 1641013200000, open: 1.1470, high: 1.1480, low: 1.1420, close: 1.1440, volume: 1000 },
                { timestamp: 1641016800000, open: 1.1440, high: 1.1460, low: 1.1400, close: 1.1420, volume: 900 },
                { timestamp: 1641020400000, open: 1.1420, high: 1.1480, low: 1.1410, close: 1.1460, volume: 1200 },
                { timestamp: 1641024000000, open: 1.1460, high: 1.1500, low: 1.1450, close: 1.1485, volume: 1300 }, // Second top at 1.1500
                { timestamp: 1641027600000, open: 1.1485, high: 1.1490, low: 1.1440, close: 1.1450, volume: 1100 }
            ];

            const result = analyzer.getAllLiquidityLevels(patternData);

            // Should detect the double top as equal highs
            const equalHighs = result.equalHighs;
            expect(equalHighs.length).toBeGreaterThan(0);

            // Look for level around 1.1500
            const doubleTopLevel = equalHighs.find(level =>
                Math.abs(level.price - 1.1500) < 0.0001
            );
            expect(doubleTopLevel).toBeDefined();
            if (doubleTopLevel) {
                expect(doubleTopLevel.touches).toBeGreaterThanOrEqual(2);
            }
        });
    });
});