/**
 * Trading Analysis Engine Tests
 * Comprehensive test suite for the main TradingAnalysisEngine class
 */

const TradingAnalysisEngine = require('../../src/analysis/engine');

describe('TradingAnalysisEngine', () => {
    let engine;
    let mockMultiTimeframeData;

    beforeEach(() => {
        engine = new TradingAnalysisEngine({
            primaryTimeframes: ['1h', '4h'],
            trackPerformance: true
        });

        // Create comprehensive mock data
        const generateMockCandles = (count, basePrice, timeframe) => {
            const candles = [];
            const intervalMs = timeframe === '15m' ? 15 * 60 * 1000 :
                             timeframe === '1h' ? 60 * 60 * 1000 :
                             timeframe === '4h' ? 4 * 60 * 60 * 1000 :
                             24 * 60 * 60 * 1000; // 1d

            for (let i = 0; i < count; i++) {
                const timestamp = Date.now() - ((count - i) * intervalMs);
                const variation = (Math.random() - 0.5) * 0.01; // 1% random variation
                const open = basePrice + variation;
                const close = open + (Math.random() - 0.5) * 0.005; // 0.5% candle variation
                const high = Math.max(open, close) + Math.random() * 0.002;
                const low = Math.min(open, close) - Math.random() * 0.002;

                candles.push({
                    timestamp,
                    open,
                    high,
                    low,
                    close,
                    volume: 1000 + Math.random() * 1000
                });
            }
            return candles;
        };

        mockMultiTimeframeData = {
            '15m': generateMockCandles(100, 1.1300, '15m'),
            '1h': generateMockCandles(50, 1.1300, '1h'),
            '4h': generateMockCandles(25, 1.1300, '4h'),
            '1d': generateMockCandles(10, 1.1300, '1d')
        };
    });

    describe('Constructor', () => {
        test('should initialize with default options', () => {
            const defaultEngine = new TradingAnalysisEngine();
            expect(defaultEngine.options.primaryTimeframes).toEqual(['1h', '4h', '1d']);
            expect(defaultEngine.options.minConfluenceScore).toBe(5.0);
            expect(defaultEngine.options.trackPerformance).toBe(true);
        });

        test('should initialize analysis modules', () => {
            expect(engine.liquidityAnalyzer).toBeDefined();
            expect(engine.structureAnalyzer).toBeDefined();
            expect(engine.confluenceScorer).toBeDefined();
            expect(engine.patternRecognizer).toBeDefined();
        });

        test('should initialize performance tracking', () => {
            expect(engine.performanceData).toBeInstanceOf(Map);
            expect(engine.activeSignals).toBeInstanceOf(Map);
        });
    });

    describe('analyzeMarket', () => {
        test('should perform comprehensive market analysis', async () => {
            const result = await engine.analyzeMarket('EURUSD', mockMultiTimeframeData);

            expect(result).toHaveProperty('symbol', 'EURUSD');
            expect(result).toHaveProperty('timestamp');
            expect(result).toHaveProperty('processingTime');
            expect(result).toHaveProperty('timeframeAnalysis');
            expect(result).toHaveProperty('coordinatedAnalysis');
            expect(result).toHaveProperty('confluenceZones');
            expect(result).toHaveProperty('signals');
            expect(result).toHaveProperty('sessionAnalysis');
            expect(result).toHaveProperty('marketContext');
            expect(result).toHaveProperty('summary');

            expect(typeof result.processingTime).toBe('number');
            expect(result.processingTime).toBeGreaterThan(0);
        });

        test('should analyze each timeframe', async () => {
            const result = await engine.analyzeMarket('EURUSD', mockMultiTimeframeData);

            const timeframes = Object.keys(result.timeframeAnalysis);
            expect(timeframes.length).toBeGreaterThan(0);

            timeframes.forEach(tf => {
                const analysis = result.timeframeAnalysis[tf];
                expect(analysis).toHaveProperty('liquidity');
                expect(analysis).toHaveProperty('structure');
                expect(analysis).toHaveProperty('patterns');
                expect(analysis).toHaveProperty('confluenceScores');

                expect(analysis.confluenceScores).toBeInstanceOf(Array);
            });
        });

        test('should coordinate timeframe analysis', async () => {
            const result = await engine.analyzeMarket('EURUSD', mockMultiTimeframeData);

            expect(result.coordinatedAnalysis).toHaveProperty('alignment');
            expect(result.coordinatedAnalysis).toHaveProperty('conflicts');
            expect(result.coordinatedAnalysis).toHaveProperty('consensus');
            expect(result.coordinatedAnalysis).toHaveProperty('strength');

            expect(typeof result.coordinatedAnalysis.strength).toBe('number');
        });

        test('should generate confluence zones', async () => {
            const result = await engine.analyzeMarket('EURUSD', mockMultiTimeframeData);

            expect(result.confluenceZones).toBeInstanceOf(Array);

            result.confluenceZones.forEach(zone => {
                expect(zone).toHaveProperty('price');
                expect(zone).toHaveProperty('score');
                expect(zone).toHaveProperty('confluences');
                expect(zone).toHaveProperty('strength');
                expect(zone).toHaveProperty('distance');

                expect(['strong', 'moderate'].includes(zone.strength)).toBeTruthy();
                expect(zone.score).toBeGreaterThanOrEqual(engine.options.minConfluenceScore);
            });
        });

        test('should generate trading signals', async () => {
            const result = await engine.analyzeMarket('EURUSD', mockMultiTimeframeData);

            expect(result.signals).toBeInstanceOf(Array);
            expect(result.signals.length).toBeLessThanOrEqual(engine.options.maxSignalsPerPair);

            result.signals.forEach(signal => {
                expect(signal).toHaveProperty('id');
                expect(signal).toHaveProperty('symbol', 'EURUSD');
                expect(signal).toHaveProperty('timestamp');
                expect(signal).toHaveProperty('type');
                expect(signal).toHaveProperty('confidence');
                expect(signal).toHaveProperty('targetPrice');
                expect(signal).toHaveProperty('zone');

                expect(typeof signal.confidence).toBe('number');
                expect(signal.confidence).toBeGreaterThanOrEqual(engine.options.minSignalStrength);
            });
        });

        test('should provide analysis summary', async () => {
            const result = await engine.analyzeMarket('EURUSD', mockMultiTimeframeData);

            expect(result.summary).toHaveProperty('totalConfluenceZones');
            expect(result.summary).toHaveProperty('strongZones');
            expect(result.summary).toHaveProperty('totalSignals');
            expect(result.summary).toHaveProperty('highConfidenceSignals');
            expect(result.summary).toHaveProperty('overallBias');
            expect(result.summary).toHaveProperty('coordinationStrength');
            expect(result.summary).toHaveProperty('analysisQuality');

            expect(typeof result.summary.totalConfluenceZones).toBe('number');
            expect(typeof result.summary.totalSignals).toBe('number');
        });

        test('should handle invalid input gracefully', async () => {
            const result = await engine.analyzeMarket('INVALID', {});
            expect(result).toHaveProperty('error');
            expect(result.status).toBe('error');
        });

        test('should validate multi-timeframe data', async () => {
            const invalidData = {
                '1h': null,
                '4h': [],
                '1d': 'invalid'
            };

            const result = await engine.analyzeMarket('EURUSD', invalidData);
            expect(result).toHaveProperty('error');
        });
    });

    describe('generateAlerts', () => {
        test('should generate real-time alerts', () => {
            const currentData = mockMultiTimeframeData['15m'].slice(-20);
            const alerts = engine.generateAlerts('EURUSD', currentData);

            expect(alerts).toBeInstanceOf(Array);

            alerts.forEach(alert => {
                expect(alert).toHaveProperty('type');
                expect(alert).toHaveProperty('message');
                expect(alert).toHaveProperty('priority');
                expect(alert).toHaveProperty('symbol', 'EURUSD');

                expect(typeof alert.priority).toBe('number');
                expect(typeof alert.message).toBe('string');
            });
        });

        test('should limit number of alerts', () => {
            const currentData = mockMultiTimeframeData['15m'].slice(-20);
            const alerts = engine.generateAlerts('EURUSD', currentData);

            expect(alerts.length).toBeLessThanOrEqual(5); // Max 5 alerts as defined in implementation
        });

        test('should prioritize alerts correctly', () => {
            const currentData = mockMultiTimeframeData['15m'].slice(-20);
            const alerts = engine.generateAlerts('EURUSD', currentData);

            if (alerts.length > 1) {
                for (let i = 1; i < alerts.length; i++) {
                    expect(alerts[i - 1].priority).toBeGreaterThanOrEqual(alerts[i].priority);
                }
            }
        });

        test('should handle empty current data', () => {
            const alerts = engine.generateAlerts('EURUSD', []);
            expect(alerts).toEqual([]);
        });
    });

    describe('getMarketBias', () => {
        test('should determine market bias', () => {
            const bias = engine.getMarketBias('EURUSD', mockMultiTimeframeData);

            expect(bias).toHaveProperty('symbol', 'EURUSD');
            expect(bias).toHaveProperty('timestamp');
            expect(bias).toHaveProperty('overall');
            expect(bias).toHaveProperty('confidence');
            expect(bias).toHaveProperty('timeframeBias');
            expect(bias).toHaveProperty('factors');
            expect(bias).toHaveProperty('sessionContext');

            expect(['bullish', 'bearish', 'neutral'].includes(bias.overall)).toBeTruthy();
            expect(typeof bias.confidence).toBe('number');
            expect(bias.confidence).toBeGreaterThanOrEqual(0);
            expect(bias.confidence).toBeLessThanOrEqual(1);
        });

        test('should analyze bias across timeframes', () => {
            const bias = engine.getMarketBias('EURUSD', mockMultiTimeframeData);

            const timeframes = Object.keys(bias.timeframeBias);
            expect(timeframes.length).toBeGreaterThan(0);

            timeframes.forEach(tf => {
                expect(bias.timeframeBias[tf]).toHaveProperty('direction');
                expect(['bullish', 'bearish', 'neutral'].includes(bias.timeframeBias[tf].direction)).toBeTruthy();
            });
        });

        test('should include session context', () => {
            const bias = engine.getMarketBias('EURUSD', mockMultiTimeframeData);

            expect(bias.sessionContext).toHaveProperty('current');
            expect(bias.sessionContext).toHaveProperty('bias');
            expect(bias.sessionContext).toHaveProperty('upcomingTransitions');

            expect(bias.sessionContext.current).toHaveProperty('name');
        });
    });

    describe('Performance Tracking', () => {
        test('should update signal performance', () => {
            const signalId = 'test_signal_123';
            const outcome = {
                outcome: 0.5, // 50 pip profit
                executionTime: Date.now(),
                exitReason: 'take_profit'
            };

            engine.updateSignalPerformance('EURUSD', signalId, outcome);

            expect(engine.performanceData.has('EURUSD')).toBeTruthy();
        });

        test('should get performance statistics', () => {
            // Add some mock signal outcomes
            engine.performanceData.set('EURUSD', {
                signals: [
                    { id: '1', timestamp: Date.now() - 86400000, outcome: 0.8 },
                    { id: '2', timestamp: Date.now() - 86400000, outcome: -0.3 },
                    { id: '3', timestamp: Date.now() - 86400000, outcome: 1.2 },
                    { id: '4', timestamp: Date.now() - 86400000, outcome: -0.5 }
                ]
            });

            const stats = engine.getPerformanceStats('EURUSD');

            expect(stats).toHaveProperty('totalSignals');
            expect(stats).toHaveProperty('winRate');
            expect(stats).toHaveProperty('avgReturn');
            expect(stats).toHaveProperty('bestReturn');
            expect(stats).toHaveProperty('worstReturn');
            expect(stats).toHaveProperty('profitFactor');

            expect(stats.totalSignals).toBe(4);
            expect(stats.winRate).toBe(0.5); // 2 wins out of 4
            expect(typeof stats.avgReturn).toBe('number');
        });

        test('should handle no performance data', () => {
            const stats = engine.getPerformanceStats('UNKNOWN_PAIR');
            expect(stats).toHaveProperty('error');
        });
    });

    describe('Session Analysis', () => {
        test('should identify current session', () => {
            const session = engine._getCurrentSession();

            expect(session).toHaveProperty('name');
            expect(session).toHaveProperty('active');

            if (session.active) {
                expect(['asia', 'london', 'newyork'].includes(session.name)).toBeTruthy();
            }
        });

        test('should analyze session characteristics', async () => {
            const result = await engine.analyzeMarket('EURUSD', mockMultiTimeframeData);

            expect(result.sessionAnalysis).toHaveProperty('current');
            expect(result.sessionAnalysis).toHaveProperty('sessions');
            expect(result.sessionAnalysis).toHaveProperty('upcomingTransitions');
            expect(result.sessionAnalysis).toHaveProperty('recommendation');

            const sessions = result.sessionAnalysis.sessions;
            Object.keys(sessions).forEach(sessionName => {
                expect(sessions[sessionName]).toHaveProperty('name');
                expect(sessions[sessionName]).toHaveProperty('active');
                expect(sessions[sessionName]).toHaveProperty('characteristics');
            });
        });
    });

    describe('Error Handling', () => {
        test('should handle analysis errors gracefully', async () => {
            // Mock a scenario that might cause errors
            const corruptData = {
                '1h': [
                    { timestamp: 'invalid', open: null, high: 'bad', low: undefined, close: NaN }
                ]
            };

            const result = await engine.analyzeMarket('EURUSD', corruptData);
            expect(result).toHaveProperty('error');
            expect(result.status).toBe('error');
        });

        test('should handle missing timeframe data', async () => {
            const partialData = {
                '1h': mockMultiTimeframeData['1h']
                // Missing other timeframes
            };

            const result = await engine.analyzeMarket('EURUSD', partialData);
            expect(result).not.toHaveProperty('error');
            expect(result.timeframeAnalysis).toHaveProperty('1h');
        });

        test('should handle alert generation errors', () => {
            // Test with malformed data that might cause alert errors
            const badData = [{ invalid: 'data' }];

            expect(() => {
                engine.generateAlerts('EURUSD', badData);
            }).not.toThrow();
        });
    });

    describe('Performance Tests', () => {
        test('should complete analysis within reasonable time', async () => {
            const startTime = Date.now();
            const result = await engine.analyzeMarket('EURUSD', mockMultiTimeframeData);
            const endTime = Date.now();

            expect(result).toBeDefined();
            expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
        });

        test('should handle large datasets efficiently', async () => {
            // Create larger datasets
            const largeData = {};
            Object.keys(mockMultiTimeframeData).forEach(tf => {
                largeData[tf] = [...mockMultiTimeframeData[tf]];
                // Duplicate the data to make it larger
                for (let i = 0; i < 3; i++) {
                    largeData[tf] = [...largeData[tf], ...mockMultiTimeframeData[tf]];
                }
            });

            const startTime = Date.now();
            const result = await engine.analyzeMarket('EURUSD', largeData);
            const endTime = Date.now();

            expect(result).toBeDefined();
            expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
        });
    });

    describe('Integration Tests', () => {
        test('should work with realistic trading scenario', async () => {
            // Create a realistic bullish breakout scenario
            const realisticData = {
                '1h': [
                    // Consolidation phase
                    ...Array(20).fill().map((_, i) => ({
                        timestamp: Date.now() - ((30 - i) * 60 * 60 * 1000),
                        open: 1.1300 + Math.random() * 0.002,
                        high: 1.1305 + Math.random() * 0.002,
                        low: 1.1295 + Math.random() * 0.002,
                        close: 1.1300 + Math.random() * 0.002,
                        volume: 1000 + Math.random() * 200
                    })),
                    // Breakout phase
                    ...Array(10).fill().map((_, i) => ({
                        timestamp: Date.now() - ((10 - i) * 60 * 60 * 1000),
                        open: 1.1300 + (i * 0.003),
                        high: 1.1310 + (i * 0.003),
                        low: 1.1295 + (i * 0.003),
                        close: 1.1305 + (i * 0.003),
                        volume: 1500 + Math.random() * 500
                    }))
                ]
            };

            realisticData['4h'] = realisticData['1h'].filter((_, i) => i % 4 === 0);
            realisticData['1d'] = realisticData['1h'].filter((_, i) => i % 24 === 0);

            const result = await engine.analyzeMarket('EURUSD', realisticData);

            // Should detect the bullish momentum
            expect(result).toBeDefined();
            expect(result.summary.totalSignals).toBeGreaterThan(0);
            expect(['bullish', 'neutral'].includes(result.summary.overallBias)).toBeTruthy();

            // Should generate meaningful alerts
            const alerts = engine.generateAlerts('EURUSD', realisticData['1h'].slice(-20));
            expect(alerts.length).toBeGreaterThan(0);
        });

        test('should coordinate multiple analysis modules', async () => {
            const result = await engine.analyzeMarket('EURUSD', mockMultiTimeframeData);

            // Verify that all modules contributed to the analysis
            expect(result.timeframeAnalysis['1h'].liquidity.allLevels).toBeDefined();
            expect(result.timeframeAnalysis['1h'].structure.trend).toBeDefined();
            expect(result.timeframeAnalysis['1h'].patterns.summary).toBeDefined();

            // Verify confluence integration
            expect(result.confluenceZones.length).toBeGreaterThanOrEqual(0);

            // Verify signal generation uses all components
            if (result.signals.length > 0) {
                const signal = result.signals[0];
                expect(signal.zone).toBeDefined();
                expect(signal.coordination).toBeDefined();
            }
        });
    });

    describe('Real-time Capabilities', () => {
        test('should support real-time data updates', async () => {
            // Initial analysis
            const initial = await engine.analyzeMarket('EURUSD', mockMultiTimeframeData);

            // Simulate new data arriving
            const newCandle = {
                timestamp: Date.now(),
                open: 1.1350,
                high: 1.1365,
                low: 1.1345,
                close: 1.1360,
                volume: 1200
            };

            const updatedData = { ...mockMultiTimeframeData };
            updatedData['15m'] = [...updatedData['15m'], newCandle];

            // Updated analysis
            const updated = await engine.analyzeMarket('EURUSD', updatedData);

            expect(updated.timestamp).toBeGreaterThan(initial.timestamp);
            expect(updated.timeframeAnalysis['15m']).toBeDefined();
        });

        test('should generate incremental alerts', () => {
            const baseData = mockMultiTimeframeData['15m'];
            const initialAlerts = engine.generateAlerts('EURUSD', baseData);

            // Add significant price movement
            const breakoutCandle = {
                timestamp: Date.now(),
                open: 1.1300,
                high: 1.1380, // Significant breakout
                low: 1.1295,
                close: 1.1375,
                volume: 2000
            };

            const updatedData = [...baseData, breakoutCandle];
            const updatedAlerts = engine.generateAlerts('EURUSD', updatedData);

            // Should potentially generate new or different alerts
            expect(updatedAlerts).toBeInstanceOf(Array);
        });
    });
});