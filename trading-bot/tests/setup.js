/**
 * Jest Test Setup
 * Global test configuration and utilities
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce logging noise in tests

// Global test utilities
global.testUtils = {
    /**
     * Generate mock OHLC candle data
     * @param {number} count - Number of candles to generate
     * @param {number} basePrice - Base price for generation
     * @param {Object} options - Generation options
     * @returns {Array} Array of mock candles
     */
    generateMockCandles(count = 10, basePrice = 1.1300, options = {}) {
        const {
            timeframe = '1h',
            volatility = 0.01,
            trend = 'sideways',
            startTime = Date.now() - (count * 60 * 60 * 1000)
        } = options;

        const candles = [];
        let currentPrice = basePrice;

        const intervalMs = this.getTimeframeInterval(timeframe);

        for (let i = 0; i < count; i++) {
            const timestamp = startTime + (i * intervalMs);

            // Apply trend
            if (trend === 'bullish') {
                currentPrice += (Math.random() * 0.001) + 0.0005;
            } else if (trend === 'bearish') {
                currentPrice -= (Math.random() * 0.001) + 0.0005;
            }

            const variation = (Math.random() - 0.5) * volatility;
            const open = currentPrice + variation;
            const close = open + (Math.random() - 0.5) * volatility * 0.5;
            const high = Math.max(open, close) + Math.random() * volatility * 0.3;
            const low = Math.min(open, close) - Math.random() * volatility * 0.3;

            candles.push({
                timestamp,
                open: Math.round(open * 100000) / 100000,
                high: Math.round(high * 100000) / 100000,
                low: Math.round(low * 100000) / 100000,
                close: Math.round(close * 100000) / 100000,
                volume: Math.floor(1000 + Math.random() * 2000)
            });

            currentPrice = close;
        }

        return candles;
    },

    /**
     * Get timeframe interval in milliseconds
     * @param {string} timeframe - Timeframe string
     * @returns {number} Interval in milliseconds
     */
    getTimeframeInterval(timeframe) {
        const intervals = {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '30m': 30 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
            '1w': 7 * 24 * 60 * 60 * 1000
        };
        return intervals[timeframe] || 60 * 60 * 1000;
    },

    /**
     * Generate mock confluence data
     * @param {number} targetPrice - Target price for confluences
     * @param {Object} options - Generation options
     * @returns {Array} Array of mock confluences
     */
    generateMockConfluences(targetPrice = 1.1300, options = {}) {
        const {
            count = 5,
            spread = 0.01,
            includeAllTiers = true
        } = options;

        const confluenceTypes = {
            tier1: ['break_of_structure', 'liquidity_sweep', 'session_manipulation'],
            tier2: ['fair_value_gap', 'order_block', 'inverse_fair_value_gap', 'smt_divergence'],
            tier3: ['equilibrium', 'fibonacci_level', 'psychological_level', 'trend_line']
        };

        const confluences = [];

        for (let i = 0; i < count; i++) {
            const tier = includeAllTiers ?
                ['tier1', 'tier2', 'tier3'][i % 3] :
                'tier2';

            const types = confluenceTypes[tier];
            const type = types[Math.floor(Math.random() * types.length)];

            confluences.push({
                type,
                price: targetPrice + (Math.random() - 0.5) * spread,
                strength: Math.random() * 3 + 1,
                timestamp: Date.now() - (Math.random() * 24 * 60 * 60 * 1000),
                volume: Math.random() > 0.3 ? Math.floor(1000 + Math.random() * 1000) : null
            });
        }

        return confluences;
    },

    /**
     * Create mock multi-timeframe data
     * @param {Object} options - Generation options
     * @returns {Object} Multi-timeframe data
     */
    generateMultiTimeframeData(options = {}) {
        const {
            timeframes = ['15m', '1h', '4h', '1d'],
            basePrice = 1.1300,
            candleCount = 50
        } = options;

        const data = {};

        timeframes.forEach(tf => {
            const count = tf === '15m' ? candleCount :
                         tf === '1h' ? Math.floor(candleCount * 0.8) :
                         tf === '4h' ? Math.floor(candleCount * 0.5) :
                         Math.floor(candleCount * 0.2);

            data[tf] = this.generateMockCandles(count, basePrice, { timeframe: tf });
        });

        return data;
    },

    /**
     * Wait for a specified time (for async tests)
     * @param {number} ms - Milliseconds to wait
     * @returns {Promise} Promise that resolves after the wait
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Assert that a number is within a tolerance
     * @param {number} actual - Actual value
     * @param {number} expected - Expected value
     * @param {number} tolerance - Tolerance (default 0.0001)
     */
    expectWithinTolerance(actual, expected, tolerance = 0.0001) {
        expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
    },

    /**
     * Create a mock analysis result structure
     * @param {Object} overrides - Properties to override
     * @returns {Object} Mock analysis result
     */
    createMockAnalysisResult(overrides = {}) {
        return {
            symbol: 'EURUSD',
            timestamp: Date.now(),
            processingTime: 100,
            timeframeAnalysis: {},
            coordinatedAnalysis: {
                alignment: {},
                consensus: { direction: 'neutral', strength: 0.5 },
                strength: 0.5
            },
            confluenceZones: [],
            signals: [],
            sessionAnalysis: {
                current: { name: 'london', active: true },
                sessions: {},
                upcomingTransitions: []
            },
            marketContext: {
                currentPrice: 1.1300,
                currentSession: { name: 'london' }
            },
            summary: {
                totalConfluenceZones: 0,
                totalSignals: 0,
                overallBias: 'neutral',
                analysisQuality: 'good'
            },
            ...overrides
        };
    }
};

// Custom matchers
expect.extend({
    toBeWithinTolerance(received, expected, tolerance = 0.0001) {
        const pass = Math.abs(received - expected) <= tolerance;

        return {
            message: () =>
                `expected ${received} to be within ${tolerance} of ${expected}`,
            pass
        };
    },

    toHaveValidOHLCStructure(received) {
        const isArray = Array.isArray(received);
        if (!isArray) {
            return {
                message: () => 'expected an array of OHLC objects',
                pass: false
            };
        }

        const allValid = received.every(candle =>
            candle.hasOwnProperty('timestamp') &&
            candle.hasOwnProperty('open') &&
            candle.hasOwnProperty('high') &&
            candle.hasOwnProperty('low') &&
            candle.hasOwnProperty('close') &&
            typeof candle.timestamp === 'number' &&
            typeof candle.open === 'number' &&
            typeof candle.high === 'number' &&
            typeof candle.low === 'number' &&
            typeof candle.close === 'number' &&
            candle.high >= Math.max(candle.open, candle.close) &&
            candle.low <= Math.min(candle.open, candle.close)
        );

        return {
            message: () =>
                allValid ?
                'expected invalid OHLC structure' :
                'expected valid OHLC structure with proper high/low relationships',
            pass: allValid
        };
    },

    toHaveValidConfluenceStructure(received) {
        const isArray = Array.isArray(received);
        if (!isArray) {
            return {
                message: () => 'expected an array of confluence objects',
                pass: false
            };
        }

        const allValid = received.every(confluence =>
            confluence.hasOwnProperty('type') &&
            confluence.hasOwnProperty('price') &&
            typeof confluence.type === 'string' &&
            typeof confluence.price === 'number' &&
            confluence.price > 0
        );

        return {
            message: () =>
                allValid ?
                'expected invalid confluence structure' :
                'expected valid confluence structure with type and price',
            pass: allValid
        };
    }
});

// Suppress console warnings in tests unless explicitly needed
const originalWarn = console.warn;
const originalError = console.error;

console.warn = (...args) => {
    if (process.env.SUPPRESS_WARNINGS !== 'true') {
        originalWarn.apply(console, args);
    }
};

console.error = (...args) => {
    if (process.env.SUPPRESS_ERRORS !== 'true') {
        originalError.apply(console, args);
    }
};

// Clean up after tests
afterAll(() => {
    console.warn = originalWarn;
    console.error = originalError;
});

// Mock Date.now for consistent timestamps in tests if needed
global.mockCurrentTime = (timestamp) => {
    const originalDateNow = Date.now;
    Date.now = jest.fn(() => timestamp);
    return () => {
        Date.now = originalDateNow;
    };
};