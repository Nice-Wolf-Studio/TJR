/**
 * Integration Tests for Analysis Engine
 * Tests end-to-end analysis pipeline from data input to trading insights
 */

const AnalysisEngine = require('../../src/analysis/engine');
const BiasAnalyzer = require('../../src/analysis/bias');
const LevelsAnalyzer = require('../../src/analysis/levels');
const FlowAnalyzer = require('../../src/analysis/flow');
const StructureAnalyzer = require('../../src/analysis/structure');
const PatternAnalyzer = require('../../src/analysis/patterns');
const LiquidityAnalyzer = require('../../src/analysis/liquidity');
const ConfluenceAnalyzer = require('../../src/analysis/confluence');
const logger = require('../../src/utils/logger');

// Mock analyzers
jest.mock('../../src/analysis/bias');
jest.mock('../../src/analysis/levels');
jest.mock('../../src/analysis/flow');
jest.mock('../../src/analysis/structure');
jest.mock('../../src/analysis/patterns');
jest.mock('../../src/analysis/liquidity');
jest.mock('../../src/analysis/confluence');

const mockPriceData = [
    {
        timestamp: new Date('2024-01-01T08:00:00Z'),
        open_price: 1.0850,
        high_price: 1.0875,
        low_price: 1.0845,
        close_price: 1.0870,
        volume: 1000000,
        session: 'London'
    },
    {
        timestamp: new Date('2024-01-01T09:00:00Z'),
        open_price: 1.0870,
        high_price: 1.0895,
        low_price: 1.0865,
        close_price: 1.0885,
        volume: 1100000,
        session: 'London'
    },
    {
        timestamp: new Date('2024-01-01T10:00:00Z'),
        open_price: 1.0885,
        high_price: 1.0900,
        low_price: 1.0880,
        close_price: 1.0895,
        volume: 950000,
        session: 'London'
    }
];

const mockStructureAnalysis = {
    trend: 'Uptrend',
    trendStrength: 'Strong',
    swingHighs: [1.0900, 1.0895],
    swingLows: [1.0845, 1.0865],
    marketStructure: 'Higher Highs, Higher Lows',
    keyLevel: 1.0880
};

const mockLevelsAnalysis = {
    support: [1.0850, 1.0820, 1.0800],
    resistance: [1.0900, 1.0920, 1.0950],
    keyLevel: 1.0880,
    levelStrength: {
        1.0880: 'Strong',
        1.0850: 'Medium',
        1.0900: 'Strong'
    }
};

const mockFlowAnalysis = {
    direction: 'Bullish',
    strength: 'Moderate',
    volume: 'High',
    imbalances: [1.0875, 1.0885],
    orderBlocks: [
        { price: 1.0850, type: 'demand', strength: 'High' },
        { price: 1.0920, type: 'supply', strength: 'Medium' }
    ]
};

describe('Analysis Engine Integration Tests', () => {
    let analysisEngine;
    let mockBiasAnalyzer;
    let mockLevelsAnalyzer;
    let mockFlowAnalyzer;
    let mockStructureAnalyzer;
    let mockPatternAnalyzer;
    let mockLiquidityAnalyzer;
    let mockConfluenceAnalyzer;

    beforeEach(() => {
        // Setup mock analyzers
        mockBiasAnalyzer = {
            analyze: jest.fn().mockResolvedValue({
                bias: 'Bullish',
                confidence: 75,
                timeframe: '1h',
                reasoning: ['Higher highs and higher lows', 'Strong bullish momentum']
            })
        };

        mockLevelsAnalyzer = {
            analyze: jest.fn().mockResolvedValue(mockLevelsAnalysis)
        };

        mockFlowAnalyzer = {
            analyze: jest.fn().mockResolvedValue(mockFlowAnalysis)
        };

        mockStructureAnalyzer = {
            analyze: jest.fn().mockResolvedValue(mockStructureAnalysis)
        };

        mockPatternAnalyzer = {
            analyze: jest.fn().mockResolvedValue({
                patterns: [
                    {
                        type: 'Flag',
                        confidence: 80,
                        direction: 'Bullish',
                        target: 1.0950
                    }
                ]
            })
        };

        mockLiquidityAnalyzer = {
            analyze: jest.fn().mockResolvedValue({
                zones: [
                    { price: 1.0850, type: 'demand', strength: 'High', volume: 1500000 },
                    { price: 1.0920, type: 'supply', strength: 'Medium', volume: 800000 }
                ],
                liquidityLevels: [1.0850, 1.0920]
            })
        };

        mockConfluenceAnalyzer = {
            analyze: jest.fn().mockResolvedValue({
                confluenceZones: [
                    {
                        price: 1.0880,
                        strength: 'High',
                        factors: ['Key Level', 'Order Block', 'Fibonacci 61.8%'],
                        score: 85
                    }
                ],
                overallScore: 78
            })
        };

        // Mock constructor implementations
        BiasAnalyzer.mockImplementation(() => mockBiasAnalyzer);
        LevelsAnalyzer.mockImplementation(() => mockLevelsAnalyzer);
        FlowAnalyzer.mockImplementation(() => mockFlowAnalyzer);
        StructureAnalyzer.mockImplementation(() => mockStructureAnalyzer);
        PatternAnalyzer.mockImplementation(() => mockPatternAnalyzer);
        LiquidityAnalyzer.mockImplementation(() => mockLiquidityAnalyzer);
        ConfluenceAnalyzer.mockImplementation(() => mockConfluenceAnalyzer);

        analysisEngine = new AnalysisEngine({
            enableCaching: true,
            cacheTimeout: 300000, // 5 minutes
            parallelAnalysis: true
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Engine Initialization', () => {
        test('should initialize all analyzers successfully', async () => {
            await analysisEngine.initialize();

            expect(BiasAnalyzer).toHaveBeenCalled();
            expect(LevelsAnalyzer).toHaveBeenCalled();
            expect(FlowAnalyzer).toHaveBeenCalled();
            expect(StructureAnalyzer).toHaveBeenCalled();
            expect(PatternAnalyzer).toHaveBeenCalled();
            expect(LiquidityAnalyzer).toHaveBeenCalled();
            expect(ConfluenceAnalyzer).toHaveBeenCalled();

            expect(analysisEngine.isInitialized).toBe(true);
        });

        test('should handle analyzer initialization failures', async () => {
            BiasAnalyzer.mockImplementation(() => {
                throw new Error('Failed to initialize bias analyzer');
            });

            await expect(analysisEngine.initialize()).rejects.toThrow(
                'Failed to initialize bias analyzer'
            );
        });
    });

    describe('Comprehensive Market Analysis', () => {
        beforeEach(async () => {
            await analysisEngine.initialize();
        });

        test('should perform complete market analysis for a symbol', async () => {
            const analysis = await analysisEngine.analyzeMarket('EURUSD', '1h', mockPriceData);

            expect(analysis).toMatchObject({
                symbol: 'EURUSD',
                timeframe: '1h',
                timestamp: expect.any(Date),
                bias: expect.objectContaining({
                    bias: 'Bullish',
                    confidence: 75
                }),
                structure: expect.objectContaining(mockStructureAnalysis),
                levels: expect.objectContaining(mockLevelsAnalysis),
                flow: expect.objectContaining(mockFlowAnalysis),
                patterns: expect.any(Object),
                liquidity: expect.any(Object),
                confluence: expect.any(Object),
                overallScore: expect.any(Number),
                tradingRecommendation: expect.any(Object)
            });
        });

        test('should validate input data before analysis', async () => {
            const invalidData = [
                {
                    timestamp: null,
                    open_price: NaN,
                    close_price: 1.0870
                }
            ];

            await expect(
                analysisEngine.analyzeMarket('EURUSD', '1h', invalidData)
            ).rejects.toThrow('Invalid price data');
        });

        test('should handle insufficient data gracefully', async () => {
            const insufficientData = [mockPriceData[0]]; // Only 1 candle

            const analysis = await analysisEngine.analyzeMarket('EURUSD', '1h', insufficientData);

            expect(analysis.warnings).toContain('Insufficient data for reliable analysis');
            expect(analysis.bias.confidence).toBeLessThan(50);
        });
    });

    describe('Individual Analysis Components', () => {
        beforeEach(async () => {
            await analysisEngine.initialize();
        });

        test('should perform bias analysis correctly', async () => {
            const biasResult = await analysisEngine.analyzeBias('EURUSD', '1h', mockPriceData);

            expect(mockBiasAnalyzer.analyze).toHaveBeenCalledWith('EURUSD', '1h', mockPriceData);
            expect(biasResult).toMatchObject({
                symbol: 'EURUSD',
                timeframe: '1h',
                bias: 'Bullish',
                confidence: 75,
                reasoning: expect.any(Array)
            });
        });

        test('should perform levels analysis correctly', async () => {
            const levelsResult = await analysisEngine.analyzeLevels('EURUSD', '1h', mockPriceData);

            expect(mockLevelsAnalyzer.analyze).toHaveBeenCalledWith('EURUSD', '1h', mockPriceData);
            expect(levelsResult).toMatchObject({
                symbol: 'EURUSD',
                timeframe: '1h',
                levels: expect.objectContaining({
                    support: expect.any(Array),
                    resistance: expect.any(Array),
                    keyLevel: expect.any(Number)
                })
            });
        });

        test('should perform flow analysis correctly', async () => {
            const flowResult = await analysisEngine.analyzeFlow('EURUSD', '1h', mockPriceData);

            expect(mockFlowAnalyzer.analyze).toHaveBeenCalledWith('EURUSD', '1h', mockPriceData);
            expect(flowResult).toMatchObject({
                symbol: 'EURUSD',
                timeframe: '1h',
                flow: expect.objectContaining({
                    direction: expect.any(String),
                    strength: expect.any(String),
                    imbalances: expect.any(Array)
                })
            });
        });

        test('should handle analyzer failures gracefully', async () => {
            mockBiasAnalyzer.analyze.mockRejectedValue(new Error('Analysis failed'));

            const result = await analysisEngine.analyzeBias('EURUSD', '1h', mockPriceData);

            expect(result.error).toBe('Analysis failed');
            expect(result.bias).toBe('Neutral');
            expect(result.confidence).toBe(0);

            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Bias analysis failed'),
                expect.any(Object)
            );
        });
    });

    describe('Multi-Timeframe Analysis', () => {
        beforeEach(async () => {
            await analysisEngine.initialize();
        });

        test('should perform multi-timeframe analysis', async () => {
            const timeframes = ['1h', '4h', '1d'];
            const multiTimeframeData = {
                '1h': mockPriceData,
                '4h': mockPriceData.slice(0, 2),
                '1d': [mockPriceData[0]]
            };

            const analysis = await analysisEngine.analyzeMultiTimeframe('EURUSD', timeframes, multiTimeframeData);

            expect(analysis).toMatchObject({
                symbol: 'EURUSD',
                timeframes: expect.objectContaining({
                    '1h': expect.any(Object),
                    '4h': expect.any(Object),
                    '1d': expect.any(Object)
                }),
                alignment: expect.objectContaining({
                    score: expect.any(Number),
                    direction: expect.any(String)
                }),
                recommendation: expect.any(Object)
            });

            timeframes.forEach(tf => {
                expect(mockBiasAnalyzer.analyze).toHaveBeenCalledWith('EURUSD', tf, multiTimeframeData[tf]);
            });
        });

        test('should calculate timeframe alignment correctly', async () => {
            // Mock different bias results for different timeframes
            mockBiasAnalyzer.analyze
                .mockResolvedValueOnce({ bias: 'Bullish', confidence: 80 })
                .mockResolvedValueOnce({ bias: 'Bullish', confidence: 75 })
                .mockResolvedValueOnce({ bias: 'Neutral', confidence: 50 });

            const timeframes = ['1h', '4h', '1d'];
            const multiTimeframeData = {
                '1h': mockPriceData,
                '4h': mockPriceData.slice(0, 2),
                '1d': [mockPriceData[0]]
            };

            const analysis = await analysisEngine.analyzeMultiTimeframe('EURUSD', timeframes, multiTimeframeData);

            expect(analysis.alignment.score).toBeGreaterThan(50);
            expect(analysis.alignment.direction).toBe('Bullish');
        });
    });

    describe('Performance Analysis', () => {
        beforeEach(async () => {
            await analysisEngine.initialize();
        });

        test('should complete analysis within acceptable time limits', async () => {
            const startTime = Date.now();

            await analysisEngine.analyzeMarket('EURUSD', '1h', mockPriceData);

            const executionTime = Date.now() - startTime;

            // Should complete within 2 seconds
            expect(executionTime).toBeLessThan(2000);
        });

        test('should handle parallel analysis efficiently', async () => {
            const symbols = ['EURUSD', 'GBPUSD', 'USDJPY'];

            const startTime = Date.now();

            const promises = symbols.map(symbol =>
                analysisEngine.analyzeMarket(symbol, '1h', mockPriceData)
            );

            await Promise.all(promises);

            const executionTime = Date.now() - startTime;

            // Parallel execution should be more efficient than sequential
            expect(executionTime).toBeLessThan(symbols.length * 1000);
        });

        test('should optimize memory usage for large datasets', async () => {
            const initialMemory = process.memoryUsage().heapUsed;

            // Analyze multiple symbols with large datasets
            const largePriceData = Array(1000).fill().map((_, index) => ({
                ...mockPriceData[0],
                timestamp: new Date(Date.now() + index * 60000)
            }));

            await analysisEngine.analyzeMarket('EURUSD', '1m', largePriceData);

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;

            // Memory increase should be reasonable (less than 50MB)
            expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
        });
    });

    describe('Caching and Optimization', () => {
        beforeEach(async () => {
            await analysisEngine.initialize();
        });

        test('should cache analysis results', async () => {
            // First analysis
            await analysisEngine.analyzeMarket('EURUSD', '1h', mockPriceData);

            // Second analysis with same parameters
            await analysisEngine.analyzeMarket('EURUSD', '1h', mockPriceData);

            // Analyzers should only be called once due to caching
            expect(mockBiasAnalyzer.analyze).toHaveBeenCalledTimes(1);
        });

        test('should invalidate cache when data changes', async () => {
            await analysisEngine.analyzeMarket('EURUSD', '1h', mockPriceData);

            const newPriceData = [
                ...mockPriceData,
                {
                    timestamp: new Date('2024-01-01T11:00:00Z'),
                    open_price: 1.0895,
                    high_price: 1.0910,
                    low_price: 1.0890,
                    close_price: 1.0905,
                    volume: 1200000,
                    session: 'London'
                }
            ];

            await analysisEngine.analyzeMarket('EURUSD', '1h', newPriceData);

            // Should perform fresh analysis with new data
            expect(mockBiasAnalyzer.analyze).toHaveBeenCalledTimes(2);
        });

        test('should respect cache timeout', async () => {
            const shortTimeoutEngine = new AnalysisEngine({
                enableCaching: true,
                cacheTimeout: 100 // 100ms
            });

            await shortTimeoutEngine.initialize();
            await shortTimeoutEngine.analyzeMarket('EURUSD', '1h', mockPriceData);

            // Wait for cache to expire
            await new Promise(resolve => setTimeout(resolve, 150));

            await shortTimeoutEngine.analyzeMarket('EURUSD', '1h', mockPriceData);

            // Should perform fresh analysis after cache expiry
            expect(mockBiasAnalyzer.analyze).toHaveBeenCalledTimes(2);
        });
    });

    describe('Error Handling and Resilience', () => {
        beforeEach(async () => {
            await analysisEngine.initialize();
        });

        test('should handle partial analyzer failures', async () => {
            // Mock some analyzers to fail
            mockBiasAnalyzer.analyze.mockRejectedValue(new Error('Bias analyzer failed'));
            mockFlowAnalyzer.analyze.mockRejectedValue(new Error('Flow analyzer failed'));

            const analysis = await analysisEngine.analyzeMarket('EURUSD', '1h', mockPriceData);

            // Should still return analysis with available components
            expect(analysis.structure).toBeDefined();
            expect(analysis.levels).toBeDefined();
            expect(analysis.patterns).toBeDefined();

            // Failed components should have error information
            expect(analysis.bias.error).toBe('Bias analyzer failed');
            expect(analysis.flow.error).toBe('Flow analyzer failed');

            expect(analysis.warnings).toContain('Some analysis components failed');
        });

        test('should implement circuit breaker for repeated failures', async () => {
            // Mock repeated failures
            mockBiasAnalyzer.analyze.mockRejectedValue(new Error('Persistent failure'));

            // Trigger multiple failures
            for (let i = 0; i < 5; i++) {
                await analysisEngine.analyzeBias('EURUSD', '1h', mockPriceData);
            }

            const circuitBreaker = analysisEngine.getCircuitBreaker('bias');
            expect(circuitBreaker.isOpen()).toBe(true);

            // Should return cached/default result when circuit is open
            const result = await analysisEngine.analyzeBias('EURUSD', '1h', mockPriceData);
            expect(result.bias).toBe('Neutral');
            expect(result.confidence).toBe(0);
        });

        test('should recover from analyzer failures', async () => {
            mockBiasAnalyzer.analyze
                .mockRejectedValueOnce(new Error('Temporary failure'))
                .mockResolvedValue({ bias: 'Bullish', confidence: 75 });

            // First call should handle failure
            let result = await analysisEngine.analyzeBias('EURUSD', '1h', mockPriceData);
            expect(result.error).toBe('Temporary failure');

            // Second call should succeed
            result = await analysisEngine.analyzeBias('EURUSD', '1h', mockPriceData);
            expect(result.bias).toBe('Bullish');
            expect(result.confidence).toBe(75);
        });
    });

    describe('Real-time Analysis Updates', () => {
        beforeEach(async () => {
            await analysisEngine.initialize();
        });

        test('should handle real-time price updates', async () => {
            const updateHandler = jest.fn();
            analysisEngine.onAnalysisUpdate(updateHandler);

            // Start real-time analysis
            await analysisEngine.startRealTimeAnalysis('EURUSD', '1m');

            // Simulate new price data
            const newCandle = {
                timestamp: new Date(),
                open_price: 1.0905,
                high_price: 1.0915,
                low_price: 1.0900,
                close_price: 1.0910,
                volume: 800000,
                session: 'London'
            };

            await analysisEngine.processRealTimeCandle('EURUSD', '1m', newCandle);

            expect(updateHandler).toHaveBeenCalledWith(
                'EURUSD',
                '1m',
                expect.objectContaining({
                    bias: expect.any(Object),
                    levels: expect.any(Object)
                })
            );
        });

        test('should throttle real-time updates to prevent spam', async () => {
            const updateHandler = jest.fn();
            analysisEngine.onAnalysisUpdate(updateHandler);

            await analysisEngine.startRealTimeAnalysis('EURUSD', '1m');

            // Send multiple rapid updates
            for (let i = 0; i < 10; i++) {
                const newCandle = {
                    timestamp: new Date(),
                    open_price: 1.0905 + i * 0.0001,
                    high_price: 1.0915 + i * 0.0001,
                    low_price: 1.0900 + i * 0.0001,
                    close_price: 1.0910 + i * 0.0001,
                    volume: 800000,
                    session: 'London'
                };

                await analysisEngine.processRealTimeCandle('EURUSD', '1m', newCandle);
            }

            // Should throttle to prevent excessive updates
            expect(updateHandler).toHaveBeenCalledTimes(1);
        });
    });

    describe('Trading Signals and Recommendations', () => {
        beforeEach(async () => {
            await analysisEngine.initialize();
        });

        test('should generate trading recommendations based on analysis', async () => {
            const analysis = await analysisEngine.analyzeMarket('EURUSD', '1h', mockPriceData);

            expect(analysis.tradingRecommendation).toMatchObject({
                action: expect.oneOf(['BUY', 'SELL', 'HOLD']),
                confidence: expect.any(Number),
                entryPrice: expect.any(Number),
                stopLoss: expect.any(Number),
                takeProfit: expect.any(Number),
                riskRewardRatio: expect.any(Number),
                reasoning: expect.any(Array)
            });
        });

        test('should calculate proper risk management levels', async () => {
            const analysis = await analysisEngine.analyzeMarket('EURUSD', '1h', mockPriceData);
            const recommendation = analysis.tradingRecommendation;

            if (recommendation.action === 'BUY') {
                expect(recommendation.stopLoss).toBeLessThan(recommendation.entryPrice);
                expect(recommendation.takeProfit).toBeGreaterThan(recommendation.entryPrice);
            } else if (recommendation.action === 'SELL') {
                expect(recommendation.stopLoss).toBeGreaterThan(recommendation.entryPrice);
                expect(recommendation.takeProfit).toBeLessThan(recommendation.entryPrice);
            }

            expect(recommendation.riskRewardRatio).toBeGreaterThan(1);
        });
    });
});