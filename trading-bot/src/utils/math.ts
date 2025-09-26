// @ts-nocheck
/**
 * Mathematical Utility Functions
 * Provides specialized mathematical operations for trading analysis
 *
 * Features:
 * - Price calculation utilities
 * - Statistical analysis functions
 * - Technical indicator calculations
 * - Risk management calculations
 * - Performance metrics
 */

class MathUtils {
    /**
     * Calculate percentage change between two values
     * @param {number} oldValue - Original value
     * @param {number} newValue - New value
     * @returns {number} Percentage change
     */
    static percentageChange(oldValue, newValue) {
        if (oldValue === 0 || oldValue == null) return 0;
        return ((newValue - oldValue) / oldValue) * 100;
    }

    /**
     * Calculate simple moving average
     * @param {Array} values - Array of numbers
     * @param {number} period - Period for average
     * @returns {number} Simple moving average
     */
    static simpleMovingAverage(values, period) {
        if (!values || values.length < period) return null;

        const slice = values.slice(-period);
        return slice.reduce((sum, val) => sum + val, 0) / period;
    }

    /**
     * Calculate exponential moving average
     * @param {Array} values - Array of numbers
     * @param {number} period - Period for average
     * @returns {number} Exponential moving average
     */
    static exponentialMovingAverage(values, period) {
        if (!values || values.length === 0) return null;

        const multiplier = 2 / (period + 1);
        let ema = values[0];

        for (let i = 1; i < values.length; i++) {
            ema = (values[i] * multiplier) + (ema * (1 - multiplier));
        }

        return ema;
    }

    /**
     * Calculate standard deviation
     * @param {Array} values - Array of numbers
     * @returns {number} Standard deviation
     */
    static standardDeviation(values) {
        if (!values || values.length < 2) return 0;

        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const squaredDifferences = values.map(val => Math.pow(val - mean, 2));
        const variance = squaredDifferences.reduce((sum, diff) => sum + diff, 0) / values.length;

        return Math.sqrt(variance);
    }

    /**
     * Calculate Bollinger Bands
     * @param {Array} prices - Array of price values
     * @param {number} period - Period for calculation
     * @param {number} deviation - Standard deviation multiplier
     * @returns {Object} Bollinger Bands data
     */
    static bollingerBands(prices, period = 20, deviation = 2) {
        if (!prices || prices.length < period) return null;

        const sma = this.simpleMovingAverage(prices, period);
        const stdDev = this.standardDeviation(prices.slice(-period));

        return {
            upper: sma + (stdDev * deviation),
            middle: sma,
            lower: sma - (stdDev * deviation),
            bandwidth: (stdDev * deviation * 2) / sma * 100
        };
    }

    /**
     * Calculate RSI (Relative Strength Index)
     * @param {Array} prices - Array of price values
     * @param {number} period - Period for calculation
     * @returns {number} RSI value
     */
    static rsi(prices, period = 14) {
        if (!prices || prices.length < period + 1) return null;

        const gains = [];
        const losses = [];

        for (let i = 1; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            gains.push(change > 0 ? change : 0);
            losses.push(change < 0 ? Math.abs(change) : 0);
        }

        const avgGain = this.simpleMovingAverage(gains.slice(-period), period);
        const avgLoss = this.simpleMovingAverage(losses.slice(-period), period);

        if (avgLoss === 0) return 100;

        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    /**
     * Calculate Average True Range (ATR)
     * @param {Array} ohlcData - Array of OHLC objects
     * @param {number} period - Period for calculation
     * @returns {number} ATR value
     */
    static atr(ohlcData, period = 14) {
        if (!ohlcData || ohlcData.length < period + 1) return null;

        const trueRanges = [];

        for (let i = 1; i < ohlcData.length; i++) {
            const current = ohlcData[i];
            const previous = ohlcData[i - 1];

            const tr1 = current.high - current.low;
            const tr2 = Math.abs(current.high - previous.close);
            const tr3 = Math.abs(current.low - previous.close);

            trueRanges.push(Math.max(tr1, tr2, tr3));
        }

        return this.simpleMovingAverage(trueRanges.slice(-period), period);
    }

    /**
     * Calculate pivot points
     * @param {Object} previousDay - Previous day's OHLC data
     * @returns {Object} Pivot points
     */
    static pivotPoints(previousDay) {
        const { high, low, close } = previousDay;
        const pivot = (high + low + close) / 3;

        return {
            pivot,
            r1: (2 * pivot) - low,
            r2: pivot + (high - low),
            r3: high + 2 * (pivot - low),
            s1: (2 * pivot) - high,
            s2: pivot - (high - low),
            s3: low - 2 * (high - pivot)
        };
    }

    /**
     * Calculate Fibonacci retracement levels
     * @param {number} high - High price
     * @param {number} low - Low price
     * @param {boolean} isUptrend - Whether trend is up
     * @returns {Object} Fibonacci levels
     */
    static fibonacciRetracement(high, low, isUptrend = true) {
        const range = high - low;
        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

        const fibs = {};

        levels.forEach(level => {
            const levelKey = level === 0 ? 'fib_0' :
                           level === 1 ? 'fib_1' :
                           `fib_${level}`;

            if (isUptrend) {
                fibs[levelKey] = high - (range * level);
            } else {
                fibs[levelKey] = low + (range * level);
            }
        });

        return fibs;
    }

    /**
     * Calculate correlation coefficient between two arrays
     * @param {Array} x - First array
     * @param {Array} y - Second array
     * @returns {number} Correlation coefficient
     */
    static correlation(x, y) {
        if (!x || !y || x.length !== y.length || x.length === 0) return 0;

        const n = x.length;
        const sumX = x.reduce((sum, val) => sum + val, 0);
        const sumY = y.reduce((sum, val) => sum + val, 0);
        const sumXY = x.reduce((sum, val, i) => sum + (val * y[i]), 0);
        const sumX2 = x.reduce((sum, val) => sum + (val * val), 0);
        const sumY2 = y.reduce((sum, val) => sum + (val * val), 0);

        const numerator = (n * sumXY) - (sumX * sumY);
        const denominator = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));

        return denominator === 0 ? 0 : numerator / denominator;
    }

    /**
     * Calculate position size based on risk management
     * @param {number} accountBalance - Account balance
     * @param {number} riskPercentage - Risk percentage per trade
     * @param {number} entryPrice - Entry price
     * @param {number} stopLoss - Stop loss price
     * @param {number} contractSize - Contract size (for forex)
     * @returns {number} Position size
     */
    static calculatePositionSize(accountBalance, riskPercentage, entryPrice, stopLoss, contractSize = 100000) {
        const riskAmount = accountBalance * (riskPercentage / 100);
        const pipValue = Math.abs(entryPrice - stopLoss);

        if (pipValue === 0) return 0;

        // For forex pairs
        if (entryPrice < 10) { // Heuristic for forex vs other assets
            const pipValueInMoney = (pipValue / entryPrice) * contractSize;
            return riskAmount / pipValueInMoney;
        }

        // For stocks/indices
        return riskAmount / pipValue;
    }

    /**
     * Calculate risk-reward ratio
     * @param {number} entryPrice - Entry price
     * @param {number} stopLoss - Stop loss price
     * @param {number} takeProfit - Take profit price
     * @returns {number} Risk-reward ratio
     */
    static riskRewardRatio(entryPrice, stopLoss, takeProfit) {
        const risk = Math.abs(entryPrice - stopLoss);
        const reward = Math.abs(takeProfit - entryPrice);

        if (risk === 0) return 0;
        return reward / risk;
    }

    /**
     * Calculate Kelly Criterion for optimal position sizing
     * @param {number} winRate - Win rate (0-1)
     * @param {number} avgWin - Average win amount
     * @param {number} avgLoss - Average loss amount
     * @returns {number} Kelly percentage
     */
    static kellyCriterion(winRate, avgWin, avgLoss) {
        if (avgLoss === 0 || winRate === 0) return 0;

        const lossRate = 1 - winRate;
        const winLossRatio = avgWin / avgLoss;

        return (winRate * winLossRatio - lossRate) / winLossRatio;
    }

    /**
     * Calculate Sharpe ratio
     * @param {Array} returns - Array of returns
     * @param {number} riskFreeRate - Risk-free rate
     * @returns {number} Sharpe ratio
     */
    static sharpeRatio(returns, riskFreeRate = 0) {
        if (!returns || returns.length < 2) return 0;

        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const excessReturn = avgReturn - riskFreeRate;
        const stdDev = this.standardDeviation(returns);

        return stdDev === 0 ? 0 : excessReturn / stdDev;
    }

    /**
     * Calculate maximum drawdown
     * @param {Array} equityCurve - Array of equity values
     * @returns {Object} Drawdown information
     */
    static maxDrawdown(equityCurve) {
        if (!equityCurve || equityCurve.length === 0) return { maxDrawdown: 0, peak: 0, trough: 0 };

        let maxDrawdown = 0;
        let peak = equityCurve[0];
        let trough = equityCurve[0];
        let peakIndex = 0;
        let troughIndex = 0;

        for (let i = 1; i < equityCurve.length; i++) {
            if (equityCurve[i] > peak) {
                peak = equityCurve[i];
                peakIndex = i;
            }

            const drawdown = (peak - equityCurve[i]) / peak;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
                trough = equityCurve[i];
                troughIndex = i;
            }
        }

        return {
            maxDrawdown: maxDrawdown * 100, // As percentage
            peak,
            trough,
            peakIndex,
            troughIndex,
            drawdownPeriod: troughIndex - peakIndex
        };
    }

    /**
     * Calculate Value at Risk (VaR)
     * @param {Array} returns - Array of returns
     * @param {number} confidenceLevel - Confidence level (0.95, 0.99, etc.)
     * @returns {number} VaR value
     */
    static valueAtRisk(returns, confidenceLevel = 0.95) {
        if (!returns || returns.length === 0) return 0;

        const sortedReturns = [...returns].sort((a, b) => a - b);
        const index = Math.ceil((1 - confidenceLevel) * sortedReturns.length) - 1;

        return Math.abs(sortedReturns[Math.max(0, index)]);
    }

    /**
     * Calculate price levels based on percentage
     * @param {number} basePrice - Base price
     * @param {number} percentage - Percentage change
     * @param {boolean} isIncrease - Whether it's an increase or decrease
     * @returns {number} New price level
     */
    static calculatePriceLevel(basePrice, percentage, isIncrease = true) {
        const multiplier = isIncrease ? (1 + percentage / 100) : (1 - percentage / 100);
        return Math.round((basePrice * multiplier) * 100) / 100;
    }

    /**
     * Round price to appropriate decimal places
     * @param {number} price - Price to round
     * @param {string} instrument - Instrument type (forex, crypto, stock, etc.)
     * @returns {number} Rounded price
     */
    static roundPrice(price, instrument = 'forex') {
        const decimals = {
            'forex': 5,
            'forex_jpy': 3, // For JPY pairs
            'crypto': 8,
            'stock': 2,
            'index': 1
        };

        let decimalPlaces = decimals[instrument] || 5;

        // Special handling for JPY pairs
        if (instrument === 'forex' && price < 10) {
            decimalPlaces = price.toString().includes('JPY') ? 3 : 5;
        }

        return Math.round(price * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
    }

    /**
     * Calculate pip value for forex pairs
     * @param {string} pair - Currency pair (e.g., 'EURUSD')
     * @param {number} price - Current price
     * @param {number} lotSize - Lot size
     * @returns {number} Pip value in account currency
     */
    static calculatePipValue(pair, price, lotSize = 1) {
        // Simplified pip value calculation
        // In practice, this would need more sophisticated currency conversion

        if (pair.includes('JPY')) {
            // JPY pairs: 1 pip = 0.01
            return (0.01 / price) * lotSize * 100000;
        } else {
            // Major pairs: 1 pip = 0.0001
            return (0.0001 / price) * lotSize * 100000;
        }
    }

    /**
     * Calculate compound annual growth rate (CAGR)
     * @param {number} startValue - Starting value
     * @param {number} endValue - Ending value
     * @param {number} periods - Number of periods (in years)
     * @returns {number} CAGR as percentage
     */
    static cagr(startValue, endValue, periods) {
        if (startValue <= 0 || endValue <= 0 || periods <= 0) return 0;

        return (Math.pow(endValue / startValue, 1 / periods) - 1) * 100;
    }

    /**
     * Linear interpolation between two points
     * @param {number} x0 - First x coordinate
     * @param {number} y0 - First y coordinate
     * @param {number} x1 - Second x coordinate
     * @param {number} y1 - Second y coordinate
     * @param {number} x - X coordinate to interpolate
     * @returns {number} Interpolated y value
     */
    static linearInterpolation(x0, y0, x1, y1, x) {
        if (x1 === x0) return y0;
        return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }

    /**
     * Calculate weighted average
     * @param {Array} values - Array of value objects with 'value' and 'weight' properties
     * @returns {number} Weighted average
     */
    static weightedAverage(values) {
        if (!values || values.length === 0) return 0;

        const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
        const weightedSum = values.reduce((sum, item) => sum + (item.value * item.weight), 0);

        return totalWeight === 0 ? 0 : weightedSum / totalWeight;
    }

    /**
     * Normalize value to 0-1 range
     * @param {number} value - Value to normalize
     * @param {number} min - Minimum value in range
     * @param {number} max - Maximum value in range
     * @returns {number} Normalized value
     */
    static normalize(value, min, max) {
        if (max === min) return 0.5; // If no range, return middle value
        return (value - min) / (max - min);
    }

    /**
     * Calculate z-score
     * @param {number} value - Value to calculate z-score for
     * @param {Array} dataset - Dataset to compare against
     * @returns {number} Z-score
     */
    static zScore(value, dataset) {
        if (!dataset || dataset.length === 0) return 0;

        const mean = dataset.reduce((sum, val) => sum + val, 0) / dataset.length;
        const stdDev = this.standardDeviation(dataset);

        return stdDev === 0 ? 0 : (value - mean) / stdDev;
    }

    /**
     * Calculate distance between two price levels as percentage
     * @param {number} price1 - First price
     * @param {number} price2 - Second price
     * @returns {number} Distance as percentage
     */
    static priceDistance(price1, price2) {
        if (price1 === 0) return 0;
        return Math.abs(price2 - price1) / price1 * 100;
    }

    /**
     * Check if a number is within a tolerance range
     * @param {number} value - Value to check
     * @param {number} target - Target value
     * @param {number} tolerance - Tolerance as percentage
     * @returns {boolean} Whether value is within tolerance
     */
    static isWithinTolerance(value, target, tolerance) {
        if (target === 0) return Math.abs(value) <= tolerance;
        const percentage = Math.abs((value - target) / target) * 100;
        return percentage <= tolerance;
    }
}

module.exports = MathUtils;