/**
 * Mathematical Utilities Tests
 * Comprehensive test suite for the MathUtils class
 */

const MathUtils = require('../../src/utils/math');

describe('MathUtils', () => {
    describe('Basic Mathematical Operations', () => {
        test('should calculate percentage change correctly', () => {
            expect(MathUtils.percentageChange(100, 110)).toBeWithinTolerance(10);
            expect(MathUtils.percentageChange(100, 90)).toBeWithinTolerance(-10);
            expect(MathUtils.percentageChange(0, 10)).toBe(0); // Edge case: division by zero
            expect(MathUtils.percentageChange(50, 75)).toBeWithinTolerance(50);
        });

        test('should calculate simple moving average', () => {
            const values = [10, 12, 14, 16, 18, 20];
            const sma = MathUtils.simpleMovingAverage(values, 3);
            expect(sma).toBeWithinTolerance(18); // Average of last 3: (16+18+20)/3

            const sma5 = MathUtils.simpleMovingAverage(values, 5);
            expect(sma5).toBeWithinTolerance(16); // Average of last 5: (12+14+16+18+20)/5

            expect(MathUtils.simpleMovingAverage([], 3)).toBeNull();
            expect(MathUtils.simpleMovingAverage([1, 2], 5)).toBeNull(); // Insufficient data
        });

        test('should calculate exponential moving average', () => {
            const values = [10, 12, 14, 16, 18, 20];
            const ema = MathUtils.exponentialMovingAverage(values, 3);

            expect(ema).toBeGreaterThan(10);
            expect(ema).toBeLessThan(20);
            expect(typeof ema).toBe('number');

            expect(MathUtils.exponentialMovingAverage([], 3)).toBeNull();
            expect(MathUtils.exponentialMovingAverage([15], 3)).toBe(15); // Single value
        });

        test('should calculate standard deviation', () => {
            const values = [2, 4, 4, 4, 5, 5, 7, 9];
            const stdDev = MathUtils.standardDeviation(values);
            expect(stdDev).toBeWithinTolerance(2, 0.1);

            const uniformValues = [5, 5, 5, 5, 5];
            expect(MathUtils.standardDeviation(uniformValues)).toBe(0);

            expect(MathUtils.standardDeviation([])).toBe(0);
            expect(MathUtils.standardDeviation([5])).toBe(0);
        });
    });

    describe('Technical Indicators', () => {
        test('should calculate Bollinger Bands', () => {
            const prices = [20, 21, 22, 21, 20, 19, 20, 21, 22, 23,
                          21, 20, 19, 20, 21, 22, 21, 20, 19, 20];

            const bands = MathUtils.bollingerBands(prices, 10, 2);

            expect(bands).toHaveProperty('upper');
            expect(bands).toHaveProperty('middle');
            expect(bands).toHaveProperty('lower');
            expect(bands).toHaveProperty('bandwidth');

            expect(bands.upper).toBeGreaterThan(bands.middle);
            expect(bands.middle).toBeGreaterThan(bands.lower);
            expect(typeof bands.bandwidth).toBe('number');

            expect(MathUtils.bollingerBands([], 20, 2)).toBeNull();
            expect(MathUtils.bollingerBands([1, 2, 3], 20, 2)).toBeNull();
        });

        test('should calculate RSI', () => {
            const prices = [44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.85, 47.25,
                          47.92, 47.20, 46.57, 46.03, 46.83, 47.69, 47.54, 49.25, 49.93];

            const rsi = MathUtils.rsi(prices, 14);

            expect(typeof rsi).toBe('number');
            expect(rsi).toBeGreaterThanOrEqual(0);
            expect(rsi).toBeLessThanOrEqual(100);

            expect(MathUtils.rsi([], 14)).toBeNull();
            expect(MathUtils.rsi([1, 2], 14)).toBeNull();

            // Test extreme cases
            const allGains = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
            const rsiAllGains = MathUtils.rsi(allGains, 14);
            expect(rsiAllGains).toBeCloseTo(100, 0);
        });

        test('should calculate ATR', () => {
            const ohlcData = [
                { high: 48, low: 47, close: 47.5 },
                { high: 48.5, low: 47.25, close: 48.25 },
                { high: 48.75, low: 47.75, close: 48.25 },
                { high: 48.25, low: 47.5, close: 47.75 },
                { high: 48, low: 47, close: 47.5 },
                { high: 47.75, low: 46.5, close: 47 },
                { high: 47.5, low: 46.75, close: 47.25 },
                { high: 47.75, low: 47, close: 47.5 },
                { high: 48, low: 47.25, close: 47.75 },
                { high: 48.25, low: 47.5, close: 48 },
                { high: 48.5, low: 47.75, close: 48.25 },
                { high: 48.75, low: 48, close: 48.5 },
                { high: 49, low: 48.25, close: 48.75 },
                { high: 49.25, low: 48.5, close: 49 },
                { high: 49.5, low: 48.75, close: 49.25 }
            ];

            const atr = MathUtils.atr(ohlcData, 14);

            expect(typeof atr).toBe('number');
            expect(atr).toBeGreaterThan(0);

            expect(MathUtils.atr([], 14)).toBeNull();
            expect(MathUtils.atr([ohlcData[0]], 14)).toBeNull();
        });

        test('should calculate pivot points', () => {
            const previousDay = { high: 110, low: 100, close: 105 };
            const pivots = MathUtils.pivotPoints(previousDay);

            expect(pivots).toHaveProperty('pivot');
            expect(pivots).toHaveProperty('r1');
            expect(pivots).toHaveProperty('r2');
            expect(pivots).toHaveProperty('r3');
            expect(pivots).toHaveProperty('s1');
            expect(pivots).toHaveProperty('s2');
            expect(pivots).toHaveProperty('s3');

            expect(pivots.pivot).toBeCloseTo(105, 1);
            expect(pivots.r1).toBeGreaterThan(pivots.pivot);
            expect(pivots.s1).toBeLessThan(pivots.pivot);
        });

        test('should calculate Fibonacci retracement levels', () => {
            const high = 120;
            const low = 100;

            const uptrend = MathUtils.fibonacciRetracement(high, low, true);
            const downtrend = MathUtils.fibonacciRetracement(high, low, false);

            expect(uptrend).toHaveProperty('fib_0');
            expect(uptrend).toHaveProperty('fib_0.618');
            expect(uptrend).toHaveProperty('fib_1');

            expect(uptrend.fib_0).toBe(high);
            expect(uptrend.fib_1).toBe(low);
            expect(uptrend['fib_0.618']).toBeCloseTo(107.64, 1);

            expect(downtrend.fib_0).toBe(low);
            expect(downtrend.fib_1).toBe(high);
        });
    });

    describe('Statistical Functions', () => {
        test('should calculate correlation coefficient', () => {
            const x = [1, 2, 3, 4, 5];
            const y = [2, 4, 6, 8, 10];

            const perfectCorr = MathUtils.correlation(x, y);
            expect(perfectCorr).toBeCloseTo(1, 2);

            const noCorr = MathUtils.correlation([1, 2, 3, 4, 5], [5, 3, 1, 4, 2]);
            expect(Math.abs(noCorr)).toBeLessThanOrEqual(0.5);

            expect(MathUtils.correlation([], [])).toBe(0);
            expect(MathUtils.correlation([1], [2])).toBe(0);
            expect(MathUtils.correlation([1, 2], [3])).toBe(0); // Mismatched lengths
        });

        test('should calculate z-score', () => {
            const dataset = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const zscore = MathUtils.zScore(7, dataset);

            expect(typeof zscore).toBe('number');
            expect(zscore).toBeGreaterThan(0); // 7 is above mean

            const zscoreMean = MathUtils.zScore(5.5, dataset); // Mean value
            expect(zscoreMean).toBeCloseTo(0, 1);

            expect(MathUtils.zScore(5, [])).toBe(0);
        });

        test('should normalize values', () => {
            expect(MathUtils.normalize(5, 0, 10)).toBe(0.5);
            expect(MathUtils.normalize(0, 0, 10)).toBe(0);
            expect(MathUtils.normalize(10, 0, 10)).toBe(1);

            // Edge case: no range
            expect(MathUtils.normalize(5, 5, 5)).toBe(0.5);
        });

        test('should calculate weighted average', () => {
            const values = [
                { value: 10, weight: 0.3 },
                { value: 20, weight: 0.5 },
                { value: 30, weight: 0.2 }
            ];

            const weightedAvg = MathUtils.weightedAverage(values);
            expect(weightedAvg).toBeCloseTo(19, 0); // (10*0.3 + 20*0.5 + 30*0.2) = 3+10+6 = 19

            expect(MathUtils.weightedAverage([])).toBe(0);
            expect(MathUtils.weightedAverage([{ value: 10, weight: 0 }])).toBe(0);
        });
    });

    describe('Risk Management Functions', () => {
        test('should calculate position size', () => {
            const accountBalance = 10000;
            const riskPercentage = 2; // 2%
            const entryPrice = 1.1300;
            const stopLoss = 1.1250;

            const positionSize = MathUtils.calculatePositionSize(
                accountBalance, riskPercentage, entryPrice, stopLoss
            );

            expect(typeof positionSize).toBe('number');
            expect(positionSize).toBeGreaterThan(0);

            // Test edge case: no risk (entry equals stop)
            const noRisk = MathUtils.calculatePositionSize(
                accountBalance, riskPercentage, entryPrice, entryPrice
            );
            expect(noRisk).toBe(0);
        });

        test('should calculate risk-reward ratio', () => {
            const entryPrice = 100;
            const stopLoss = 95;
            const takeProfit = 110;

            const rrRatio = MathUtils.riskRewardRatio(entryPrice, stopLoss, takeProfit);
            expect(rrRatio).toBe(2); // 10 reward / 5 risk

            // Test edge case: no risk
            const noRisk = MathUtils.riskRewardRatio(entryPrice, entryPrice, takeProfit);
            expect(noRisk).toBe(0);
        });

        test('should calculate Kelly Criterion', () => {
            const winRate = 0.6; // 60%
            const avgWin = 150;
            const avgLoss = 100;

            const kelly = MathUtils.kellyCriterion(winRate, avgWin, avgLoss);
            expect(typeof kelly).toBe('number');

            // Test edge cases
            expect(MathUtils.kellyCriterion(0, 100, 50)).toBe(0);
            expect(MathUtils.kellyCriterion(0.5, 100, 0)).toBe(0);
        });

        test('should calculate Sharpe ratio', () => {
            const returns = [0.05, 0.03, -0.02, 0.08, 0.01, 0.06, -0.01, 0.04];
            const riskFreeRate = 0.02;

            const sharpe = MathUtils.sharpeRatio(returns, riskFreeRate);
            expect(typeof sharpe).toBe('number');

            expect(MathUtils.sharpeRatio([], 0.02)).toBe(0);
            expect(MathUtils.sharpeRatio([0.05], 0.02)).toBe(0);
        });

        test('should calculate maximum drawdown', () => {
            const equityCurve = [1000, 1100, 1050, 800, 900, 1200, 1150];
            const drawdown = MathUtils.maxDrawdown(equityCurve);

            expect(drawdown).toHaveProperty('maxDrawdown');
            expect(drawdown).toHaveProperty('peak');
            expect(drawdown).toHaveProperty('trough');
            expect(drawdown).toHaveProperty('peakIndex');
            expect(drawdown).toHaveProperty('troughIndex');
            expect(drawdown).toHaveProperty('drawdownPeriod');

            expect(drawdown.maxDrawdown).toBeGreaterThan(0);
            expect(drawdown.peak).toBeGreaterThan(drawdown.trough);

            expect(MathUtils.maxDrawdown([])).toEqual({
                maxDrawdown: 0, peak: 0, trough: 0
            });
        });

        test('should calculate Value at Risk', () => {
            const returns = [-0.05, -0.03, -0.08, -0.01, -0.06, 0.02, 0.04, 0.01];
            const var95 = MathUtils.valueAtRisk(returns, 0.95);

            expect(typeof var95).toBe('number');
            expect(var95).toBeGreaterThanOrEqual(0);

            expect(MathUtils.valueAtRisk([], 0.95)).toBe(0);
        });

        test('should calculate CAGR', () => {
            const startValue = 1000;
            const endValue = 1500;
            const periods = 3; // 3 years

            const cagr = MathUtils.cagr(startValue, endValue, periods);
            expect(cagr).toBeCloseTo(14.47, 1);

            // Test edge cases
            expect(MathUtils.cagr(0, 1000, 3)).toBe(0);
            expect(MathUtils.cagr(1000, 0, 3)).toBe(0);
            expect(MathUtils.cagr(1000, 1500, 0)).toBe(0);
        });
    });

    describe('Price and Trading Utilities', () => {
        test('should calculate price levels', () => {
            const basePrice = 100;
            const increase = MathUtils.calculatePriceLevel(basePrice, 10, true);
            const decrease = MathUtils.calculatePriceLevel(basePrice, 10, false);

            expect(increase).toBe(110);
            expect(decrease).toBe(90);
        });

        test('should round prices correctly', () => {
            expect(MathUtils.roundPrice(1.23456, 'forex')).toBe(1.23456);
            expect(MathUtils.roundPrice(123.456789, 'stock')).toBe(123.46);
            expect(MathUtils.roundPrice(0.123456789, 'crypto')).toBe(0.12345679);
        });

        test('should calculate pip value', () => {
            const pipValue = MathUtils.calculatePipValue('EURUSD', 1.1300, 1);
            expect(typeof pipValue).toBe('number');
            expect(pipValue).toBeGreaterThan(0);

            const jpyPipValue = MathUtils.calculatePipValue('USDJPY', 110.50, 1);
            expect(typeof jpyPipValue).toBe('number');
            expect(jpyPipValue).toBeGreaterThan(0);
        });

        test('should calculate price distance', () => {
            const distance = MathUtils.priceDistance(100, 105);
            expect(distance).toBe(5);

            const zeroDistance = MathUtils.priceDistance(100, 100);
            expect(zeroDistance).toBe(0);

            expect(MathUtils.priceDistance(0, 100)).toBe(0);
        });

        test('should check tolerance ranges', () => {
            expect(MathUtils.isWithinTolerance(100, 102, 5)).toBeTruthy(); // 2% within 5%
            expect(MathUtils.isWithinTolerance(100, 110, 5)).toBeFalsy(); // 10% outside 5%
            expect(MathUtils.isWithinTolerance(5, 0, 10)).toBeTruthy(); // Edge case: target is zero
        });
    });

    describe('Interpolation and Advanced Math', () => {
        test('should perform linear interpolation', () => {
            const result = MathUtils.linearInterpolation(0, 0, 10, 100, 5);
            expect(result).toBe(50);

            const result2 = MathUtils.linearInterpolation(1, 10, 3, 30, 2);
            expect(result2).toBe(20);

            // Edge case: same x values
            const result3 = MathUtils.linearInterpolation(5, 10, 5, 20, 5);
            expect(result3).toBe(10);
        });
    });

    describe('Edge Cases and Error Handling', () => {
        test('should handle null and undefined inputs', () => {
            expect(MathUtils.percentageChange(null, 100)).toBe(0);
            expect(MathUtils.simpleMovingAverage(null, 5)).toBeNull();
            expect(MathUtils.standardDeviation(undefined)).toBe(0);
        });

        test('should handle infinite and NaN values', () => {
            const infiniteData = [1, 2, Infinity, 4, 5];
            expect(() => MathUtils.standardDeviation(infiniteData)).not.toThrow();

            const nanData = [1, 2, NaN, 4, 5];
            expect(() => MathUtils.simpleMovingAverage(nanData, 3)).not.toThrow();
        });

        test('should handle extreme values', () => {
            const largeNumbers = [1e10, 1e10 + 1, 1e10 + 2];
            const sma = MathUtils.simpleMovingAverage(largeNumbers, 3);
            expect(typeof sma).toBe('number');
            expect(isFinite(sma)).toBeTruthy();

            const smallNumbers = [1e-10, 2e-10, 3e-10];
            const smaSmail = MathUtils.simpleMovingAverage(smallNumbers, 3);
            expect(typeof smaSmail).toBe('number');
            expect(isFinite(smaSmail)).toBeTruthy();
        });
    });

    describe('Performance Tests', () => {
        test('should handle large datasets efficiently', () => {
            const largeDataset = Array(10000).fill().map(() => Math.random() * 100);

            const startTime = Date.now();
            const sma = MathUtils.simpleMovingAverage(largeDataset, 200);
            const stdDev = MathUtils.standardDeviation(largeDataset.slice(-1000));
            const endTime = Date.now();

            expect(sma).toBeDefined();
            expect(stdDev).toBeDefined();
            expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
        });
    });

    describe('Integration Tests', () => {
        test('should work together for complete analysis', () => {
            const prices = testUtils.generateMockCandles(100, 1.1300).map(c => c.close);

            // Perform multiple calculations
            const sma20 = MathUtils.simpleMovingAverage(prices, 20);
            const ema20 = MathUtils.exponentialMovingAverage(prices, 20);
            const stdDev = MathUtils.standardDeviation(prices.slice(-20));
            const rsi = MathUtils.rsi(prices, 14);

            expect(sma20).toBeDefined();
            expect(ema20).toBeDefined();
            expect(stdDev).toBeDefined();
            expect(rsi).toBeDefined();

            // Values should be reasonable
            expect(sma20).toBeCloseTo(1.1300, 1);
            expect(ema20).toBeCloseTo(1.1300, 1);
            expect(stdDev).toBeGreaterThan(0);
            expect(rsi).toBeGreaterThanOrEqual(0);
            expect(rsi).toBeLessThanOrEqual(100);
        });

        test('should provide consistent results', () => {
            const testPrices = [10, 11, 12, 11, 10, 9, 10, 11, 12, 13];

            const sma1 = MathUtils.simpleMovingAverage(testPrices, 5);
            const sma2 = MathUtils.simpleMovingAverage(testPrices, 5);

            expect(sma1).toBe(sma2); // Should be identical

            const stdDev1 = MathUtils.standardDeviation(testPrices);
            const stdDev2 = MathUtils.standardDeviation([...testPrices]); // Copy array

            expect(stdDev1).toBe(stdDev2);
        });
    });
});