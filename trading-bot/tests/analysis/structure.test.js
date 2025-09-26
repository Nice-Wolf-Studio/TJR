/**
 * Structure Analysis Module Tests
 * Comprehensive test suite for the StructureAnalyzer class
 */

const StructureAnalyzer = require('../../src/analysis/structure');

describe('StructureAnalyzer', () => {
    let analyzer;
    let mockPriceData;

    beforeEach(() => {
        analyzer = new StructureAnalyzer();

        // Create mock price data with clear structure patterns
        mockPriceData = testUtils.generateMockCandles(50, 1.1300, {
            trend: 'bullish',
            volatility: 0.008
        });
    });

    describe('Constructor', () => {
        test('should initialize with default options', () => {
            const defaultAnalyzer = new StructureAnalyzer();
            expect(defaultAnalyzer.options.swingLookback).toBe(5);
            expect(defaultAnalyzer.options.minSwingStrength).toBe(3);
            expect(defaultAnalyzer.options.bosConfirmationCandles).toBe(2);
        });

        test('should initialize with custom options', () => {
            const customAnalyzer = new StructureAnalyzer({
                swingLookback: 10,
                minSwingStrength: 5
            });
            expect(customAnalyzer.options.swingLookback).toBe(10);
            expect(customAnalyzer.options.minSwingStrength).toBe(5);
        });

        test('should define structure states and trend directions', () => {
            expect(analyzer.STRUCTURE_STATES).toHaveProperty('RESPECTED');
            expect(analyzer.STRUCTURE_STATES).toHaveProperty('CHALLENGED');
            expect(analyzer.STRUCTURE_STATES).toHaveProperty('DISRESPECTED');

            expect(analyzer.TREND_DIRECTIONS).toHaveProperty('BULLISH');
            expect(analyzer.TREND_DIRECTIONS).toHaveProperty('BEARISH');
            expect(analyzer.TREND_DIRECTIONS).toHaveProperty('SIDEWAYS');
        });
    });

    describe('detectHigherHighsLows', () => {
        test('should detect higher highs and higher lows pattern', () => {
            // Create clear uptrend data
            const uptrendData = testUtils.generateMockCandles(30, 1.1300, {
                trend: 'bullish',
                volatility: 0.005
            });

            const result = analyzer.detectHigherHighsLows(uptrendData);

            expect(result).toHaveProperty('pattern');
            expect(result).toHaveProperty('higherHighs');
            expect(result).toHaveProperty('higherLows');
            expect(result).toHaveProperty('swingHighs');
            expect(result).toHaveProperty('swingLows');
            expect(result).toHaveProperty('confidence');

            expect(result.swingHighs).toBeInstanceOf(Array);
            expect(result.swingLows).toBeInstanceOf(Array);
            expect(typeof result.confidence).toBe('number');
        });

        test('should return undefined pattern for insufficient data', () => {
            const shortData = testUtils.generateMockCandles(10, 1.1300);
            const result = analyzer.detectHigherHighsLows(shortData);

            expect(result.pattern).toBe(analyzer.TREND_DIRECTIONS.UNDEFINED);
            expect(result.swings).toEqual([]);
        });

        test('should identify bullish pattern in uptrending data', () => {
            const strongUptrend = [];
            let price = 1.1300;

            // Create clear higher highs and higher lows
            for (let i = 0; i < 20; i++) {
                const increment = i * 0.002;
                strongUptrend.push({
                    timestamp: Date.now() + (i * 60 * 60 * 1000),
                    open: price + increment,
                    high: price + increment + 0.003,
                    low: price + increment - 0.001,
                    close: price + increment + 0.002,
                    volume: 1000
                });
            }

            const result = analyzer.detectHigherHighsLows(strongUptrend);
            expect(result.pattern).toBe(analyzer.TREND_DIRECTIONS.BULLISH);
            expect(result.confidence).toBeGreaterThan(0.5);
        });
    });

    describe('detectLowerHighsLows', () => {
        test('should detect lower highs and lower lows pattern', () => {
            const downtrend = testUtils.generateMockCandles(30, 1.1300, {
                trend: 'bearish',
                volatility: 0.005
            });

            const result = analyzer.detectLowerHighsLows(downtrend);

            expect(result).toHaveProperty('pattern');
            expect(result).toHaveProperty('lowerHighs');
            expect(result).toHaveProperty('lowerLows');
            expect(result).toHaveProperty('confidence');
        });

        test('should identify bearish pattern in downtrending data', () => {
            const strongDowntrend = [];
            let price = 1.1300;

            // Create clear lower highs and lower lows
            for (let i = 0; i < 20; i++) {
                const decrement = i * 0.002;
                strongDowntrend.push({
                    timestamp: Date.now() + (i * 60 * 60 * 1000),
                    open: price - decrement,
                    high: price - decrement + 0.001,
                    low: price - decrement - 0.003,
                    close: price - decrement - 0.002,
                    volume: 1000
                });
            }

            const result = analyzer.detectLowerHighsLows(strongDowntrend);
            expect(result.pattern).toBe(analyzer.TREND_DIRECTIONS.BEARISH);
            expect(result.confidence).toBeGreaterThan(0.5);
        });
    });

    describe('identifyBreakOfStructure', () => {
        test('should identify break of structure', () => {
            // Create data with clear BOS
            const bosData = [
                // Establish structure
                ...testUtils.generateMockCandles(15, 1.1300, { trend: 'sideways' }),
                // Break of structure
                {
                    timestamp: Date.now(),
                    open: 1.1300,
                    high: 1.1380, // Significant break higher
                    low: 1.1295,
                    close: 1.1375,
                    volume: 2000
                },
                {
                    timestamp: Date.now() + 60000,
                    open: 1.1375,
                    high: 1.1385,
                    low: 1.1365,
                    close: 1.1380,
                    volume: 1800
                }
            ];

            const result = analyzer.identifyBreakOfStructure(bosData);

            expect(result).toHaveProperty('detected');
            expect(result).toHaveProperty('type');
            expect(result).toHaveProperty('details');

            if (result.detected) {
                expect(['bullish_bos', 'bearish_bos'].includes(result.type)).toBeTruthy();
                expect(result.details).toHaveProperty('breakLevel');
                expect(result.details).toHaveProperty('confirmationCandles');
                expect(result.details).toHaveProperty('strength');
            }
        });

        test('should not detect BOS with insufficient data', () => {
            const shortData = testUtils.generateMockCandles(5, 1.1300);
            const result = analyzer.identifyBreakOfStructure(shortData);

            expect(result.detected).toBeFalsy();
            expect(result.type).toBeNull();
        });

        test('should require confirmation candles for BOS', () => {
            const weakBreakData = [
                ...testUtils.generateMockCandles(10, 1.1300),
                // Single candle break without confirmation
                {
                    timestamp: Date.now(),
                    open: 1.1300,
                    high: 1.1350,
                    low: 1.1295,
                    close: 1.1305, // Closes back down, no confirmation
                    volume: 1000
                }
            ];

            const result = analyzer.identifyBreakOfStructure(weakBreakData);
            expect(result.detected).toBeFalsy();
        });
    });

    describe('mapSwingPointsMultiTimeframe', () => {
        test('should map swing points across multiple timeframes', () => {
            const multiTfData = testUtils.generateMultiTimeframeData({
                timeframes: ['1h', '4h', '1d'],
                candleCount: 30
            });

            const result = analyzer.mapSwingPointsMultiTimeframe(multiTfData);

            expect(result).toHaveProperty('swingMap');
            expect(result).toHaveProperty('alignment');
            expect(result).toHaveProperty('confluence');

            const timeframes = Object.keys(result.swingMap);
            expect(timeframes).toContain('1h');
            expect(timeframes).toContain('4h');
            expect(timeframes).toContain('1d');

            timeframes.forEach(tf => {
                expect(result.swingMap[tf]).toHaveProperty('highs');
                expect(result.swingMap[tf]).toHaveProperty('lows');
                expect(result.swingMap[tf]).toHaveProperty('structure');
            });
        });

        test('should analyze timeframe alignment', () => {
            const alignedData = {
                '1h': testUtils.generateMockCandles(24, 1.1300, { trend: 'bullish' }),
                '4h': testUtils.generateMockCandles(6, 1.1300, { trend: 'bullish' })
            };

            const result = analyzer.mapSwingPointsMultiTimeframe(alignedData);

            expect(result.alignment).toBeDefined();
            expect(result.confluence).toHaveProperty('score');
            expect(result.confluence).toHaveProperty('strength');
        });
    });

    describe('classifyTrend', () => {
        test('should classify bullish trend', () => {
            const bullishData = testUtils.generateMockCandles(40, 1.1300, {
                trend: 'bullish',
                volatility: 0.006
            });

            const result = analyzer.classifyTrend(bullishData);

            expect(result).toHaveProperty('direction');
            expect(result).toHaveProperty('strength');
            expect(result).toHaveProperty('confidence');
            expect(result).toHaveProperty('momentum');
            expect(result).toHaveProperty('structureDetails');

            expect(['bullish', 'bearish', 'sideways'].includes(result.direction)).toBeTruthy();
            expect(typeof result.strength).toBe('number');
            expect(typeof result.confidence).toBe('number');
        });

        test('should classify bearish trend', () => {
            const bearishData = testUtils.generateMockCandles(40, 1.1300, {
                trend: 'bearish',
                volatility: 0.006
            });

            const result = analyzer.classifyTrend(bearishData);

            expect(result.direction).toBe(analyzer.TREND_DIRECTIONS.BEARISH);
            expect(result.strength).toBeGreaterThan(0);
        });

        test('should return undefined for insufficient data', () => {
            const shortData = testUtils.generateMockCandles(10, 1.1300);
            const result = analyzer.classifyTrend(shortData);

            expect(result.direction).toBe(analyzer.TREND_DIRECTIONS.UNDEFINED);
            expect(result.strength).toBe(0);
            expect(result.confidence).toBe(0);
        });
    });

    describe('analyzeStructureState', () => {
        test('should analyze market structure state', () => {
            const keyLevels = [
                { price: 1.1300, type: 'support', strength: 2.0 },
                { price: 1.1350, type: 'resistance', strength: 1.8 }
            ];

            const result = analyzer.analyzeStructureState(mockPriceData, keyLevels);

            expect(result).toHaveProperty('state');
            expect(result).toHaveProperty('details');
            expect(result).toHaveProperty('levelInteractions');
            expect(result).toHaveProperty('currentPrice');
            expect(result).toHaveProperty('analysis');

            expect(Object.values(analyzer.STRUCTURE_STATES).includes(result.state)).toBeTruthy();
            expect(typeof result.currentPrice).toBe('number');
        });

        test('should handle empty key levels', () => {
            const result = analyzer.analyzeStructureState(mockPriceData, []);

            expect(result.state).toBe(analyzer.STRUCTURE_STATES.RESPECTED);
            expect(result.levelInteractions.respects).toBe(0);
            expect(result.levelInteractions.challenges).toBe(0);
            expect(result.levelInteractions.breaks).toBe(0);
        });

        test('should detect structure disrespect on level breaks', () => {
            const breakoutData = [
                ...testUtils.generateMockCandles(10, 1.1300),
                // Strong breakout above resistance
                {
                    timestamp: Date.now(),
                    open: 1.1345,
                    high: 1.1380,
                    low: 1.1340,
                    close: 1.1375,
                    volume: 2000
                }
            ];

            const keyLevels = [
                { price: 1.1350, type: 'resistance', strength: 2.0 }
            ];

            const result = analyzer.analyzeStructureState(breakoutData, keyLevels);

            // Should detect break of resistance level
            expect(result.levelInteractions.breaks).toBeGreaterThan(0);
        });
    });

    describe('getStructureAnalysis', () => {
        test('should provide comprehensive structure analysis', () => {
            const result = analyzer.getStructureAnalysis(mockPriceData);

            expect(result).toHaveProperty('trend');
            expect(result).toHaveProperty('breakOfStructure');
            expect(result).toHaveProperty('swingPoints');
            expect(result).toHaveProperty('currentStructure');
            expect(result).toHaveProperty('summary');

            expect(result.trend).toHaveProperty('direction');
            expect(result.trend).toHaveProperty('strength');
            expect(result.trend).toHaveProperty('confidence');

            expect(result.swingPoints).toHaveProperty('highs');
            expect(result.swingPoints).toHaveProperty('lows');
            expect(result.swingPoints.highs).toBeInstanceOf(Array);
            expect(result.swingPoints.lows).toBeInstanceOf(Array);

            expect(result.summary).toHaveProperty('trendDirection');
            expect(result.summary).toHaveProperty('trendStrength');
            expect(result.summary).toHaveProperty('structureIntact');
        });

        test('should handle insufficient data gracefully', () => {
            const shortData = testUtils.generateMockCandles(5, 1.1300);
            const result = analyzer.getStructureAnalysis(shortData);

            expect(result).toBeDefined();
            expect(result.trend.direction).toBe(analyzer.TREND_DIRECTIONS.UNDEFINED);
        });

        test('should limit swing points to recent data', () => {
            const longData = testUtils.generateMockCandles(200, 1.1300);
            const result = analyzer.getStructureAnalysis(longData);

            // Should limit to last 10 swing points as defined in implementation
            expect(result.swingPoints.highs.length).toBeLessThanOrEqual(10);
            expect(result.swingPoints.lows.length).toBeLessThanOrEqual(10);
        });
    });

    describe('Swing Point Detection', () => {
        test('should find swing highs correctly', () => {
            // Create data with obvious swing high
            const swingData = [
                { timestamp: 1, open: 1.1300, high: 1.1305, low: 1.1295, close: 1.1302, volume: 1000 },
                { timestamp: 2, open: 1.1302, high: 1.1310, low: 1.1298, close: 1.1308, volume: 1000 },
                { timestamp: 3, open: 1.1308, high: 1.1315, low: 1.1305, close: 1.1312, volume: 1000 },
                { timestamp: 4, open: 1.1312, high: 1.1320, low: 1.1308, close: 1.1318, volume: 1000 },
                { timestamp: 5, open: 1.1318, high: 1.1325, low: 1.1315, close: 1.1322, volume: 1000 },
                { timestamp: 6, open: 1.1322, high: 1.1350, low: 1.1320, close: 1.1345, volume: 1500 }, // Swing high
                { timestamp: 7, open: 1.1345, high: 1.1348, low: 1.1335, close: 1.1340, volume: 1200 },
                { timestamp: 8, open: 1.1340, high: 1.1345, low: 1.1330, close: 1.1335, volume: 1100 },
                { timestamp: 9, open: 1.1335, high: 1.1340, low: 1.1325, close: 1.1330, volume: 1000 },
                { timestamp: 10, open: 1.1330, high: 1.1335, low: 1.1320, close: 1.1325, volume: 900 },
                { timestamp: 11, open: 1.1325, high: 1.1330, low: 1.1315, close: 1.1320, volume: 800 }
            ];

            const swingHighs = analyzer._findSwingPoints(swingData, 'high');
            expect(swingHighs.length).toBeGreaterThan(0);

            const highestSwing = swingHighs.find(swing => swing.price === 1.1350);
            expect(highestSwing).toBeDefined();
            expect(highestSwing.type).toBe('swing_high');
        });

        test('should calculate swing strength', () => {
            const swingData = testUtils.generateMockCandles(20, 1.1300);
            const swingHighs = analyzer._findSwingPoints(swingData, 'high');

            swingHighs.forEach(swing => {
                expect(swing).toHaveProperty('strength');
                expect(typeof swing.strength).toBe('number');
                expect(swing.strength).toBeGreaterThanOrEqual(analyzer.options.minSwingStrength);
            });
        });
    });

    describe('Edge Cases and Error Handling', () => {
        test('should handle null/undefined input', () => {
            expect(() => analyzer.detectHigherHighsLows(null)).not.toThrow();
            expect(() => analyzer.identifyBreakOfStructure(undefined)).not.toThrow();
            expect(() => analyzer.classifyTrend(null)).not.toThrow();
        });

        test('should handle empty price data', () => {
            const result = analyzer.getStructureAnalysis([]);
            expect(result.trend.direction).toBe(analyzer.TREND_DIRECTIONS.UNDEFINED);
        });

        test('should handle malformed price data', () => {
            const badData = [
                { timestamp: 'bad', open: null, high: undefined, low: NaN, close: 'invalid' }
            ];

            expect(() => analyzer.getStructureAnalysis(badData)).not.toThrow();
        });

        test('should handle extreme price values', () => {
            const extremeData = testUtils.generateMockCandles(20, 0.00001); // Very small prices
            const result = analyzer.getStructureAnalysis(extremeData);

            expect(result).toBeDefined();
            expect(typeof result.trend.strength).toBe('number');
        });
    });

    describe('Performance Tests', () => {
        test('should handle large datasets efficiently', () => {
            const largeDataset = testUtils.generateMockCandles(5000, 1.1300);

            const startTime = Date.now();
            const result = analyzer.getStructureAnalysis(largeDataset);
            const endTime = Date.now();

            expect(result).toBeDefined();
            expect(endTime - startTime).toBeLessThan(3000); // Should complete within 3 seconds
        });
    });

    describe('Integration Tests', () => {
        test('should work with realistic market structure patterns', () => {
            // Create realistic ascending triangle pattern
            const triangleData = [];
            let basePrice = 1.1300;

            for (let i = 0; i < 30; i++) {
                const resistanceLevel = 1.1350;
                const supportSlope = basePrice + (i * 0.0005); // Rising support

                const open = Math.random() > 0.5 ? supportSlope : resistanceLevel - 0.001;
                const high = Math.min(resistanceLevel, open + Math.random() * 0.002);
                const low = Math.max(supportSlope - 0.001, open - Math.random() * 0.002);
                const close = low + (Math.random() * (high - low));

                triangleData.push({
                    timestamp: Date.now() + (i * 60 * 60 * 1000),
                    open: Math.round(open * 100000) / 100000,
                    high: Math.round(high * 100000) / 100000,
                    low: Math.round(low * 100000) / 100000,
                    close: Math.round(close * 100000) / 100000,
                    volume: 1000 + Math.random() * 500
                });
            }

            const result = analyzer.getStructureAnalysis(triangleData);

            expect(result).toBeDefined();
            expect(result.swingPoints.highs.length).toBeGreaterThan(0);
            expect(result.swingPoints.lows.length).toBeGreaterThan(0);

            // Should detect the consolidation pattern
            expect(['sideways', 'bullish'].includes(result.trend.direction)).toBeTruthy();
        });

        test('should coordinate with other analysis modules', () => {
            const result = analyzer.getStructureAnalysis(mockPriceData);

            // Results should be compatible with confluence scoring
            expect(result.swingPoints.highs.every(swing =>
                swing.hasOwnProperty('price') &&
                swing.hasOwnProperty('timestamp')
            )).toBeTruthy();

            expect(result.swingPoints.lows.every(swing =>
                swing.hasOwnProperty('price') &&
                swing.hasOwnProperty('timestamp')
            )).toBeTruthy();
        });
    });
});