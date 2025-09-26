/**
 * Integration Tests for Data Pipeline
 * Tests end-to-end data flow from sources to analysis
 */

const DataPipeline = require('../../src/data/pipeline');
const TradingViewSource = require('../../src/data/sources/tradingview');
const DatabaseConnection = require('../../src/database/connection');
const logger = require('../../src/utils/logger');
const config = require('../../config/database');

// Mock external dependencies
jest.mock('../../src/data/sources/tradingview');
jest.mock('../../src/database/connection');

const mockPriceData = [
    {
        timestamp: new Date('2024-01-01T10:00:00Z'),
        open_price: 1.0850,
        high_price: 1.0875,
        low_price: 1.0845,
        close_price: 1.0870,
        volume: 1000000,
        tick_volume: 5000,
        spread: 1.5,
        session: 'London',
        quality_score: 0.95
    },
    {
        timestamp: new Date('2024-01-01T10:01:00Z'),
        open_price: 1.0870,
        high_price: 1.0885,
        low_price: 1.0865,
        close_price: 1.0880,
        volume: 1100000,
        tick_volume: 5200,
        spread: 1.4,
        session: 'London',
        quality_score: 0.92
    }
];

describe('Data Pipeline Integration Tests', () => {
    let dataPipeline;
    let mockTradingViewSource;
    let mockDatabase;

    beforeEach(() => {
        // Setup mocks
        mockTradingViewSource = {
            initialize: jest.fn().mockResolvedValue(),
            collectPriceData: jest.fn().mockResolvedValue(mockPriceData),
            getStatus: jest.fn().mockReturnValue({
                name: 'tradingview',
                initialized: true,
                available: true
            }),
            stop: jest.fn().mockResolvedValue()
        };

        mockDatabase = {
            connect: jest.fn().mockResolvedValue(),
            query: jest.fn().mockResolvedValue({ rows: [] }),
            insertPriceData: jest.fn().mockResolvedValue(mockPriceData.length),
            getPriceData: jest.fn().mockResolvedValue(mockPriceData),
            close: jest.fn().mockResolvedValue()
        };

        TradingViewSource.mockImplementation(() => mockTradingViewSource);
        DatabaseConnection.mockImplementation(() => mockDatabase);

        dataPipeline = new DataPipeline({
            sources: ['tradingview'],
            database: mockDatabase,
            batchSize: 100,
            retryAttempts: 3
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Pipeline Initialization', () => {
        test('should initialize all data sources successfully', async () => {
            await dataPipeline.initialize();

            expect(mockTradingViewSource.initialize).toHaveBeenCalled();
            expect(dataPipeline.isInitialized).toBe(true);
        });

        test('should handle data source initialization failure', async () => {
            mockTradingViewSource.initialize.mockRejectedValue(
                new Error('Network connection failed')
            );

            await expect(dataPipeline.initialize()).rejects.toThrow(
                'Network connection failed'
            );
        });

        test('should validate configuration before initialization', async () => {
            const invalidPipeline = new DataPipeline({
                sources: [],
                database: null
            });

            await expect(invalidPipeline.initialize()).rejects.toThrow(
                'Invalid pipeline configuration'
            );
        });
    });

    describe('Data Collection', () => {
        beforeEach(async () => {
            await dataPipeline.initialize();
        });

        test('should collect data from all sources', async () => {
            const results = await dataPipeline.collectData('EURUSD', '1h', {
                startTime: new Date('2024-01-01T09:00:00Z'),
                endTime: new Date('2024-01-01T11:00:00Z')
            });

            expect(mockTradingViewSource.collectPriceData).toHaveBeenCalledWith(
                'EURUSD',
                '1h',
                expect.objectContaining({
                    startTime: expect.any(Date),
                    endTime: expect.any(Date)
                })
            );

            expect(results).toHaveProperty('EURUSD');
            expect(results.EURUSD).toHaveLength(mockPriceData.length);
            expect(results.EURUSD[0]).toMatchObject({
                timestamp: expect.any(Date),
                open_price: expect.any(Number),
                high_price: expect.any(Number),
                low_price: expect.any(Number),
                close_price: expect.any(Number)
            });
        });

        test('should handle multiple symbols simultaneously', async () => {
            const symbols = ['EURUSD', 'GBPUSD', 'USDJPY'];
            const results = await dataPipeline.collectMultipleSymbols(
                symbols,
                '4h',
                { batchSize: 2 }
            );

            expect(mockTradingViewSource.collectPriceData).toHaveBeenCalledTimes(
                symbols.length
            );

            symbols.forEach(symbol => {
                expect(results).toHaveProperty(symbol);
            });
        });

        test('should validate data quality and filter invalid records', async () => {
            const invalidData = [
                ...mockPriceData,
                {
                    timestamp: new Date('2024-01-01T10:02:00Z'),
                    open_price: NaN,
                    high_price: 1.0900,
                    low_price: 1.0885,
                    close_price: 1.0895,
                    volume: -1000,
                    quality_score: 0.3
                }
            ];

            mockTradingViewSource.collectPriceData.mockResolvedValue(invalidData);

            const results = await dataPipeline.collectData('EURUSD', '1h');

            // Should filter out invalid record
            expect(results.EURUSD).toHaveLength(2);
            expect(results.EURUSD.every(record => !isNaN(record.open_price))).toBe(true);
        });

        test('should retry failed data collection attempts', async () => {
            mockTradingViewSource.collectPriceData
                .mockRejectedValueOnce(new Error('Temporary network error'))
                .mockRejectedValueOnce(new Error('Rate limit exceeded'))
                .mockResolvedValue(mockPriceData);

            const results = await dataPipeline.collectData('EURUSD', '1h');

            expect(mockTradingViewSource.collectPriceData).toHaveBeenCalledTimes(3);
            expect(results.EURUSD).toHaveLength(mockPriceData.length);
        });
    });

    describe('Data Storage', () => {
        beforeEach(async () => {
            await dataPipeline.initialize();
        });

        test('should store collected data in database', async () => {
            await dataPipeline.collectAndStore('EURUSD', '1h');

            expect(mockDatabase.insertPriceData).toHaveBeenCalledWith(
                'EURUSD',
                '1h',
                expect.arrayContaining([
                    expect.objectContaining({
                        timestamp: expect.any(Date),
                        open_price: expect.any(Number)
                    })
                ])
            );
        });

        test('should handle database storage errors gracefully', async () => {
            mockDatabase.insertPriceData.mockRejectedValue(
                new Error('Database connection lost')
            );

            await expect(
                dataPipeline.collectAndStore('EURUSD', '1h')
            ).rejects.toThrow('Database connection lost');

            // Should still log the error for monitoring
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to store data'),
                expect.any(Object)
            );
        });

        test('should batch large datasets for efficient storage', async () => {
            const largePriceData = Array(500).fill().map((_, index) => ({
                ...mockPriceData[0],
                timestamp: new Date(Date.now() + index * 60000)
            }));

            mockTradingViewSource.collectPriceData.mockResolvedValue(largePriceData);

            await dataPipeline.collectAndStore('EURUSD', '1m', { batchSize: 100 });

            // Should make multiple batch calls
            expect(mockDatabase.insertPriceData).toHaveBeenCalledTimes(5);
        });
    });

    describe('Data Transformation', () => {
        beforeEach(async () => {
            await dataPipeline.initialize();
        });

        test('should normalize data from different sources', async () => {
            // Mock data from different sources with different formats
            const tradingViewData = [
                {
                    timestamp: '2024-01-01T10:00:00Z',
                    o: 1.0850, h: 1.0875, l: 1.0845, c: 1.0870,
                    v: 1000000, source: 'tradingview'
                }
            ];

            mockTradingViewSource.collectPriceData.mockResolvedValue(tradingViewData);

            const normalizer = dataPipeline.getDataNormalizer();
            const normalized = await normalizer.normalize(tradingViewData, 'tradingview');

            expect(normalized[0]).toMatchObject({
                timestamp: expect.any(Date),
                open_price: 1.0850,
                high_price: 1.0875,
                low_price: 1.0845,
                close_price: 1.0870,
                volume: 1000000
            });
        });

        test('should calculate derived metrics', async () => {
            const calculator = dataPipeline.getMetricsCalculator();
            const metrics = calculator.calculate(mockPriceData);

            expect(metrics).toMatchObject({
                volatility: expect.any(Number),
                averageVolume: expect.any(Number),
                priceRange: expect.any(Number),
                momentum: expect.any(Number)
            });
        });

        test('should detect and handle data gaps', async () => {
            const dataWithGaps = [
                mockPriceData[0],
                // Missing 10:01 data
                {
                    ...mockPriceData[1],
                    timestamp: new Date('2024-01-01T10:03:00Z')
                }
            ];

            mockTradingViewSource.collectPriceData.mockResolvedValue(dataWithGaps);

            const results = await dataPipeline.collectData('EURUSD', '1m');
            const gapAnalysis = dataPipeline.analyzeDataGaps(results.EURUSD);

            expect(gapAnalysis.gaps).toHaveLength(1);
            expect(gapAnalysis.gaps[0]).toMatchObject({
                start: expect.any(Date),
                end: expect.any(Date),
                duration: expect.any(Number)
            });
        });
    });

    describe('Real-time Data Streaming', () => {
        beforeEach(async () => {
            await dataPipeline.initialize();
        });

        test('should handle real-time data updates', async () => {
            const streamHandler = jest.fn();
            await dataPipeline.startRealTimeStream('EURUSD', '1m', streamHandler);

            // Simulate real-time data
            const realtimeData = {
                ...mockPriceData[0],
                timestamp: new Date()
            };

            await dataPipeline.processRealTimeData('EURUSD', realtimeData);

            expect(streamHandler).toHaveBeenCalledWith('EURUSD', realtimeData);
        });

        test('should maintain connection during network interruptions', async () => {
            const connectionMonitor = dataPipeline.getConnectionMonitor();

            // Simulate network interruption
            connectionMonitor.simulateNetworkIssue();

            await new Promise(resolve => setTimeout(resolve, 1000));

            // Should attempt reconnection
            expect(connectionMonitor.getReconnectionAttempts()).toBeGreaterThan(0);
        });
    });

    describe('Data Pipeline Performance', () => {
        beforeEach(async () => {
            await dataPipeline.initialize();
        });

        test('should meet performance benchmarks for data collection', async () => {
            const startTime = Date.now();

            await dataPipeline.collectData('EURUSD', '1h', {
                startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
                endTime: new Date()
            });

            const executionTime = Date.now() - startTime;

            // Should complete within 5 seconds for 24 hours of hourly data
            expect(executionTime).toBeLessThan(5000);
        });

        test('should handle concurrent data collection efficiently', async () => {
            const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'];

            const startTime = Date.now();

            const promises = symbols.map(symbol =>
                dataPipeline.collectData(symbol, '1h')
            );

            await Promise.all(promises);

            const executionTime = Date.now() - startTime;

            // Concurrent execution should be more efficient than sequential
            expect(executionTime).toBeLessThan(symbols.length * 1000);
        });

        test('should optimize memory usage for large datasets', async () => {
            const initialMemory = process.memoryUsage().heapUsed;

            // Collect large amount of data
            const largePriceData = Array(10000).fill().map((_, index) => ({
                ...mockPriceData[0],
                timestamp: new Date(Date.now() + index * 60000)
            }));

            mockTradingViewSource.collectPriceData.mockResolvedValue(largePriceData);

            await dataPipeline.collectAndStore('EURUSD', '1m');

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;

            // Memory increase should be reasonable (less than 100MB)
            expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
        });
    });

    describe('Error Handling and Recovery', () => {
        beforeEach(async () => {
            await dataPipeline.initialize();
        });

        test('should recover from partial data collection failures', async () => {
            // Mock partial failure scenario
            mockTradingViewSource.collectPriceData
                .mockImplementation(async (symbol, timeframe) => {
                    if (symbol === 'EURUSD') {
                        throw new Error('Source temporarily unavailable');
                    }
                    return mockPriceData;
                });

            const symbols = ['EURUSD', 'GBPUSD'];
            const results = await dataPipeline.collectMultipleSymbols(symbols, '1h', {
                continueOnError: true
            });

            expect(results).toHaveProperty('GBPUSD');
            expect(results.GBPUSD).toHaveLength(mockPriceData.length);

            // Should log error for failed symbol
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to collect data for EURUSD'),
                expect.any(Object)
            );
        });

        test('should implement circuit breaker for repeated failures', async () => {
            // Mock repeated failures
            mockTradingViewSource.collectPriceData.mockRejectedValue(
                new Error('Service unavailable')
            );

            // Attempt multiple data collections
            for (let i = 0; i < 5; i++) {
                try {
                    await dataPipeline.collectData('EURUSD', '1h');
                } catch (error) {
                    // Expected to fail
                }
            }

            const circuitBreaker = dataPipeline.getCircuitBreaker('tradingview');
            expect(circuitBreaker.isOpen()).toBe(true);

            // Should prevent further attempts while circuit is open
            await expect(
                dataPipeline.collectData('EURUSD', '1h')
            ).rejects.toThrow('Circuit breaker is open');
        });
    });

    describe('Data Quality Monitoring', () => {
        beforeEach(async () => {
            await dataPipeline.initialize();
        });

        test('should monitor data quality metrics', async () => {
            await dataPipeline.collectAndStore('EURUSD', '1h');

            const qualityMetrics = dataPipeline.getDataQualityMetrics('EURUSD', '1h');

            expect(qualityMetrics).toMatchObject({
                completeness: expect.any(Number),
                accuracy: expect.any(Number),
                timeliness: expect.any(Number),
                consistency: expect.any(Number)
            });
        });

        test('should alert on data quality issues', async () => {
            // Mock low quality data
            const lowQualityData = mockPriceData.map(record => ({
                ...record,
                quality_score: 0.5
            }));

            mockTradingViewSource.collectPriceData.mockResolvedValue(lowQualityData);

            const alertHandler = jest.fn();
            dataPipeline.onQualityAlert(alertHandler);

            await dataPipeline.collectAndStore('EURUSD', '1h');

            expect(alertHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    symbol: 'EURUSD',
                    issue: 'low_quality_data',
                    severity: expect.any(String)
                })
            );
        });
    });
});