// @ts-nocheck
const axios = require('axios');
const MathUtils = require('../../utils/math');

const DEFAULT_CACHE_TTL = 4 * 60 * 1000; // 4 minutes
const ALPHAVANTAGE_BASE_URL = 'https://www.alphavantage.co/query';

const SYMBOL_MAP = {
    ES: {
        instrument: 'ES',
        alphaSymbol: 'SPY',
        description: 'E-mini S&P 500 Futures (SPX proxy)',
        assetClass: 'Index Futures'
    },
    MES: {
        instrument: 'MES',
        alphaSymbol: 'SPY',
        description: 'Micro E-mini S&P 500 Futures',
        assetClass: 'Index Futures'
    },
    EQ: {
        instrument: 'EQ',
        alphaSymbol: 'QQQ',
        description: 'E-mini Nasdaq 100 Futures (QQQ proxy)',
        assetClass: 'Index Futures'
    },
    NQ: {
        instrument: 'NQ',
        alphaSymbol: 'QQQ',
        description: 'E-mini Nasdaq 100 Futures',
        assetClass: 'Index Futures'
    }
};

const SESSION_WINDOWS_UTC = [
    { name: 'Asia', start: 22, end: 7 },
    { name: 'London', start: 7, end: 13 },
    { name: 'New York', start: 13, end: 22 }
];

class AlphaVantageClient {
    constructor(options = {}) {
        this.apiKey = options.apiKey || process.env.ALPHAVANTAGE_API_KEY;
        this.cacheTtl = options.cacheTtl || DEFAULT_CACHE_TTL;
        this.cache = new Map();

        if (!this.apiKey) {
            throw new Error('Alpha Vantage API key is required for TJR index bias analysis');
        }
    }

    async getDailySeries(symbol) {
        return this._fetchSeries({
            function: 'TIME_SERIES_DAILY_ADJUSTED',
            symbol,
            outputsize: 'compact'
        }, 'Time Series (Daily)');
    }

    async getIntradaySeries(symbol, interval) {
        return this._fetchSeries({
            function: 'TIME_SERIES_INTRADAY',
            symbol,
            interval,
            outputsize: 'compact'
        }, `Time Series (${interval})`);
    }

    async _fetchSeries(params, dataKey) {
        const cacheKey = JSON.stringify({ ...params, dataKey });
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
            return cached.data;
        }

        const response = await axios.get(ALPHAVANTAGE_BASE_URL, {
            params: { ...params, apikey: this.apiKey }
        });

        const data = response.data;

        if (data['Error Message']) {
            throw new Error(`Alpha Vantage error: ${data['Error Message']}`);
        }

        if (data['Note']) {
            throw new Error('Alpha Vantage rate limit reached. Please wait a minute before retrying.');
        }

        if (data['Information']) {
            throw new Error(`Alpha Vantage notice: ${data['Information']}`);
        }

        const series = data[dataKey];
        if (!series) {
            const availableKeys = Object.keys(data).join(', ');
            throw new Error(`Unexpected response from Alpha Vantage. Series data missing. Keys: ${availableKeys}`);
        }

        const parsed = Object.entries(series)
            .map(([timestamp, candle]) => ({
                time: new Date(`${timestamp}Z`),
                open: parseFloat(candle['1. open']),
                high: parseFloat(candle['2. high']),
                low: parseFloat(candle['3. low']),
                close: parseFloat(candle['4. close']),
                volume: parseFloat(candle['5. volume'] || candle['6. volume'] || 0)
            }))
            .filter(candle => !Number.isNaN(candle.open))
            .sort((a, b) => a.time - b.time);

        this.cache.set(cacheKey, { timestamp: Date.now(), data: parsed });
        return parsed;
    }
}

class TjrIndexBiasAnalyzer {
    constructor(options = {}) {
        this.alphaClient = new AlphaVantageClient(options.alphaVantage || {});
        this.options = {
            rsiPeriod: 14,
            longMa: 50,
            midMa: 21,
            shortMa: 9,
            liquidityTolerance: 0.0015,
            ...options
        };
    }

    static isSupported(symbol) {
        return Boolean(SYMBOL_MAP[symbol?.toUpperCase?.() || symbol]);
    }

    async analyze(symbol) {
        const config = this._resolveSymbol(symbol);

        const [daily, intraday60, intraday15] = await Promise.all([
            this.alphaClient.getDailySeries(config.alphaSymbol),
            this.alphaClient.getIntradaySeries(config.alphaSymbol, '60min'),
            this.alphaClient.getIntradaySeries(config.alphaSymbol, '15min')
        ]);

        const candles4h = this._aggregateCandles(intraday60, 4);
        const latest = intraday15[intraday15.length - 1];

        const structure = {
            daily: this._evaluateStructure(daily, 'Daily'),
            h4: this._evaluateStructure(candles4h, '4H'),
            h1: this._evaluateStructure(intraday60, '1H'),
            m15: this._evaluateStructure(intraday15, '15M')
        };

        const liquidity = this._evaluateLiquidity(daily, intraday60, config);
        const momentum = this._evaluateMomentum(structure, intraday15);
        const confluence = this._calculateConfluence(structure, liquidity, momentum);
        const bias = this._determineBias(structure, confluence, momentum);
        const tradePlan = this._buildTradePlan(bias.direction, daily, intraday15, liquidity);
        const sessionContext = this._deriveSessionContext(latest?.time, intraday15);

        return {
            symbol: config.instrument,
            proxySymbol: config.alphaSymbol,
            market: config.description,
            assetClass: config.assetClass,
            timestamp: latest?.time || new Date(),
            price: latest?.close || daily[daily.length - 1]?.close || null,
            bias,
            structure,
            liquidity,
            momentum,
            confluence,
            tradePlan,
            sessionContext
        };
    }

    _resolveSymbol(symbol) {
        const normalized = symbol?.toUpperCase?.();
        const config = SYMBOL_MAP[normalized];

        if (!config) {
            throw new Error(`Symbol "${symbol}" is not supported by the TJR index bias strategy.`);
        }

        return config;
    }

    _aggregateCandles(candles, groupSize) {
        if (!candles || candles.length === 0) return [];

        const aggregated = [];
        const asc = candles.slice().sort((a, b) => a.time - b.time);

        for (let i = 0; i < asc.length; i += groupSize) {
            const slice = asc.slice(i, i + groupSize);
            if (slice.length < groupSize) continue;

            aggregated.push({
                time: slice[0].time,
                open: slice[0].open,
                high: Math.max(...slice.map(c => c.high)),
                low: Math.min(...slice.map(c => c.low)),
                close: slice[slice.length - 1].close,
                volume: slice.reduce((sum, c) => sum + (c.volume || 0), 0)
            });
        }

        return aggregated;
    }

    _evaluateStructure(candles, timeframeLabel) {
        if (!candles || candles.length < 20) {
            return {
                timeframe: timeframeLabel,
                direction: 'neutral',
                summary: 'Insufficient data',
                rsi: null,
                momentum: 'n/a'
            };
        }

        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);
        const last = candles[candles.length - 1];
        const prev = candles[candles.length - 2];

        const sma21 = MathUtils.simpleMovingAverage(closes, this.options.midMa);
        const sma50 = MathUtils.simpleMovingAverage(closes, this.options.longMa);
        const ema9 = MathUtils.exponentialMovingAverage(closes.slice(-this.options.shortMa * 2), this.options.shortMa);
        const rsi = MathUtils.rsi(closes, this.options.rsiPeriod);
        const atr = MathUtils.atr(candles.slice(-20), 14);

        const pivotHigh = Math.max(...highs.slice(-10));
        const pivotLow = Math.min(...lows.slice(-10));

        let direction = 'neutral';
        if (sma21 && last.close > sma21 * (1 + 0.001)) {
            direction = 'bullish';
        } else if (sma21 && last.close < sma21 * (1 - 0.001)) {
            direction = 'bearish';
        }

        let bos = 'Range bound';
        if (last.close > pivotHigh && prev.close <= pivotHigh) {
            bos = 'Bullish BOS confirmed';
            direction = 'bullish';
        } else if (last.close < pivotLow && prev.close >= pivotLow) {
            bos = 'Bearish BOS confirmed';
            direction = 'bearish';
        }

        let momentum;
        if (rsi == null) {
            momentum = 'Momentum unavailable';
        } else if (rsi > 60) {
            momentum = 'Strong bullish momentum';
        } else if (rsi < 40) {
            momentum = 'Strong bearish momentum';
        } else {
            momentum = 'Neutral momentum';
        }

        const summaryParts = [];
        summaryParts.push(direction === 'bullish' ? 'HH/HL structure intact > 21EMA' :
            direction === 'bearish' ? 'LL/LH structure intact < 21EMA' : 'Structure consolidating around 21EMA');
        summaryParts.push(bos);
        summaryParts.push(`ATR(14): ${atr ? atr.toFixed(2) : 'n/a'}`);

        return {
            timeframe: timeframeLabel,
            direction,
            bos,
            summary: summaryParts.join(' • '),
            price: last.close,
            sma21,
            sma50,
            ema9,
            rsi,
            momentum,
            pivots: {
                recentHigh: pivotHigh,
                recentLow: pivotLow
            }
        };
    }

    _evaluateLiquidity(daily, intraday60, config) {
        const mostRecentDay = daily[daily.length - 1];
        const previousDay = daily[daily.length - 2];
        const previousWeek = daily.slice(-6, -1);

        if (!mostRecentDay || !previousDay) {
            return {
                instrument: config.instrument,
                previousDay: {
                    high: null,
                    low: null,
                    close: null,
                    sweptAbove: false,
                    sweptBelow: false,
                    equilibrium: null
                },
                weekly: {
                    high: null,
                    low: null
                },
                equalHighs: [],
                equalLows: [],
                liquidityLevels: []
            };
        }

        const weeklyHigh = previousWeek.length > 0 ? Math.max(...previousWeek.map(c => c.high)) : null;
        const weeklyLow = previousWeek.length > 0 ? Math.min(...previousWeek.map(c => c.low)) : null;

        const equalHighs = this._detectEqualLevels(intraday60.map(c => c.high));
        const equalLows = this._detectEqualLevels(intraday60.map(c => c.low));

        const sweptAbove = mostRecentDay.high > previousDay.high;
        const sweptBelow = mostRecentDay.low < previousDay.low;

        const equilibrium = (previousDay.high + previousDay.low) / 2;

        const liquidityLevels = [];
        liquidityLevels.push({
            level: previousDay.high,
            type: 'sell-side',
            note: sweptAbove ? 'Prior day high taken (liquidity swept)' : 'Untapped PDH liquidity'
        });
        liquidityLevels.push({
            level: previousDay.low,
            type: 'buy-side',
            note: sweptBelow ? 'Prior day low taken (liquidity swept)' : 'Untapped PDL liquidity'
        });
        if (weeklyHigh != null) {
            liquidityLevels.push({
                level: weeklyHigh,
                type: 'sell-side',
                note: 'Last week high'
            });
        }
        if (weeklyLow != null) {
            liquidityLevels.push({
                level: weeklyLow,
                type: 'buy-side',
                note: 'Last week low'
            });
        }
        liquidityLevels.push({
            level: equilibrium,
            type: 'equilibrium',
            note: 'Prior day equilibrium (50%)'
        });

        if (equalHighs.length > 0) {
            liquidityLevels.push({
                level: equalHighs[equalHighs.length - 1],
                type: 'sell-side',
                note: 'Equal highs on 1H (resting liquidity)'
            });
        }

        if (equalLows.length > 0) {
            liquidityLevels.push({
                level: equalLows[equalLows.length - 1],
                type: 'buy-side',
                note: 'Equal lows on 1H (resting liquidity)'
            });
        }

        return {
            instrument: config.instrument,
            previousDay: {
                high: previousDay.high,
                low: previousDay.low,
                close: previousDay.close,
                sweptAbove,
                sweptBelow,
                equilibrium
            },
            weekly: {
                high: weeklyHigh,
                low: weeklyLow
            },
            equalHighs,
            equalLows,
            liquidityLevels
        };
    }

    _detectEqualLevels(values) {
        if (!values || values.length < 4) return [];

        const tolerance = this.options.liquidityTolerance;
        const matches = [];

        for (let i = values.length - 1; i >= 3; i--) {
            const a = values[i];
            const b = values[i - 1];
            const c = values[i - 2];

            const avg = (a + b + c) / 3;
            if (Math.abs(a - avg) / avg < tolerance && Math.abs(b - avg) / avg < tolerance) {
                matches.push(Number(avg.toFixed(2)));
            }
        }

        return matches.slice(0, 3).reverse();
    }

    _evaluateMomentum(structure, intraday15) {
        if (!intraday15 || intraday15.length === 0) {
            return {
                rsi: null,
                vwap: null,
                volumeState: 'Unknown',
                direction: 'neutral',
                priceRelativeToVWAP: null,
                alignment: { withDaily: false, withH4: false }
            };
        }

        const closes = intraday15.map(c => c.close);
        const volumes = intraday15.map(c => c.volume);
        const last = intraday15[intraday15.length - 1];

        const vwap = this._calculateVWAP(intraday15.slice(-26));

        const rsi = MathUtils.rsi(closes, 14);

        const volumeWindow = volumes.slice(-20);
        const averageVolume = volumeWindow.length > 0 ? volumeWindow.reduce((sum, vol) => sum + vol, 0) / volumeWindow.length : 0;
        const currentVolume = last?.volume || 0;

        const volumeState = averageVolume > 0 ? (
            currentVolume > averageVolume * 1.4 ? 'Volume expansion' :
                currentVolume < averageVolume * 0.7 ? 'Volume contraction' : 'Normal participation'
        ) : 'Unknown';

        const directionMomentum = rsi > 55 ? 'bullish' : rsi < 45 ? 'bearish' : 'neutral';

        return {
            rsi,
            vwap,
            volumeState,
            direction: directionMomentum,
            priceRelativeToVWAP: last && vwap ? last.close - vwap : null,
            alignment: {
                withDaily: structure.daily.direction === directionMomentum,
                withH4: structure.h4.direction === directionMomentum
            }
        };
    }

    _calculateVWAP(candles) {
        if (!candles || candles.length === 0) return null;

        let pvTotal = 0;
        let volumeTotal = 0;

        candles.forEach(c => {
            const typical = (c.high + c.low + c.close) / 3;
            pvTotal += typical * (c.volume || 0);
            volumeTotal += c.volume || 0;
        });

        if (volumeTotal === 0) return null;

        return pvTotal / volumeTotal;
    }

    _calculateConfluence(structure, liquidity, momentum) {
        const tier1 = { score: 0, max: 9, factors: [] };
        const tier2 = { score: 0, max: 6, factors: [] };
        const tier3 = { score: 0, max: 5, factors: [] };

        if (structure.daily.direction === structure.h4.direction && structure.daily.direction !== 'neutral') {
            tier1.score += 3;
            tier1.factors.push(`HTF structure aligned (${structure.daily.direction.toUpperCase()})`);
        }

        if (structure.daily.bos.includes('BOS')) {
            tier1.score += 3;
            tier1.factors.push(structure.daily.bos);
        }

        if (structure.h4.bos.includes('BOS')) {
            tier1.score += 3;
            tier1.factors.push(`4H ${structure.h4.bos}`);
        }

        if (liquidity.previousDay.sweptAbove) {
            tier2.score += 2;
            tier2.factors.push('Buy-side liquidity sweep confirmed');
        }

        if (liquidity.previousDay.sweptBelow) {
            tier2.score += 2;
            tier2.factors.push('Sell-side liquidity sweep confirmed');
        }

        if (liquidity.equalHighs.length > 0) {
            tier2.score += 2;
            tier2.factors.push('Equal highs resting liquidity identified');
        } else if (liquidity.equalLows.length > 0) {
            tier2.score += 2;
            tier2.factors.push('Equal lows resting liquidity identified');
        }

        if (momentum.direction === structure.h1.direction && momentum.direction !== 'neutral') {
            tier3.score += 1.5;
            tier3.factors.push('Momentum aligns with intraday structure');
        }

        if (momentum.volumeState === 'Volume expansion') {
            tier3.score += 1.5;
            tier3.factors.push('Rising participation');
        }

        const intradayRange = structure.h1.pivots ? structure.h1.pivots.recentHigh - structure.h1.pivots.recentLow : null;

        if (momentum.vwap && intradayRange && Math.abs(momentum.priceRelativeToVWAP || 0) < intradayRange * 0.15) {
            tier3.score += 1;
            tier3.factors.push('Price near VWAP equilibrium');
        }

        if (structure.m15.direction === structure.h1.direction) {
            tier3.score += 1;
            tier3.factors.push('Lower timeframe executing with plan');
        }

        const total = Number((tier1.score + tier2.score + tier3.score).toFixed(2));
        const max = tier1.max + tier2.max + tier3.max;

        return {
            tier1,
            tier2,
            tier3,
            total,
            max,
            percentage: Math.round((total / max) * 100)
        };
    }

    _determineBias(structure, confluence, momentum) {
        let direction = 'neutral';
        const catalysts = [];

        if (structure.daily.direction === structure.h4.direction) {
            direction = structure.daily.direction;
        } else if (structure.h4.direction === structure.h1.direction) {
            direction = structure.h4.direction;
        }

        if (direction === 'neutral') {
            direction = momentum.direction;
        }

        if (direction === 'neutral') {
            direction = confluence.tier1.score >= confluence.tier2.score ? 'bullish' : 'bearish';
        }

        const confidence = Math.min(95, Math.max(30, confluence.percentage));

        if (confluence.tier1.factors.length > 0) catalysts.push(...confluence.tier1.factors);
        if (confluence.tier2.factors.length > 0) catalysts.push(...confluence.tier2.factors);
        if (confluence.tier3.factors.length > 0) catalysts.push(...confluence.tier3.factors);

        return {
            direction,
            confidence,
            confluenceScore: confluence.total,
            catalysts
        };
    }

    _buildTradePlan(direction, daily, intraday15, liquidity) {
        const previousDay = daily[daily.length - 2];
        const currentDay = daily[daily.length - 1];

        if (!previousDay || !currentDay) {
            return {
                narrative: 'Awaiting more historical data to generate a trade plan.',
                entryZone: { lower: null, upper: null, comment: 'n/a' },
                invalidation: null,
                targets: []
            };
        }

        const range = previousDay.high - previousDay.low;
        const discountLow = previousDay.low + range * 0.3;
        const discountHigh = previousDay.low + range * 0.5;
        const premiumLow = previousDay.high - range * 0.5;
        const premiumHigh = previousDay.high - range * 0.3;

        const tradePlan = {
            narrative: '',
            entryZone: null,
            invalidation: null,
            targets: []
        };

        if (direction === 'bullish') {
            tradePlan.narrative = 'Focus on accumulation into discount zones following liquidity grabs per TJR plan.';
            tradePlan.entryZone = {
                lower: discountLow,
                upper: discountHigh,
                comment: 'Prior day discount (30-50%)'
            };
            tradePlan.invalidation = previousDay.low - range * 0.2;
            tradePlan.targets = [
                { level: liquidity.previousDay.high, note: 'Prior day high' },
                { level: liquidity.weekly.high ?? currentDay.high, note: 'Weekly high liquidity' },
                { level: currentDay.high, note: 'Current day external liquidity' }
            ];
        } else if (direction === 'bearish') {
            tradePlan.narrative = 'Focus on distribution into premium zones after liquidity sweep alignment.';
            tradePlan.entryZone = {
                lower: premiumLow,
                upper: premiumHigh,
                comment: 'Prior day premium (50-70%)'
            };
            tradePlan.invalidation = previousDay.high + range * 0.2;
            tradePlan.targets = [
                { level: liquidity.previousDay.low, note: 'Prior day low' },
                { level: liquidity.weekly.low ?? currentDay.low, note: 'Weekly low liquidity' },
                { level: currentDay.low, note: 'Current day external liquidity' }
            ];
        } else {
            tradePlan.narrative = 'Market in balance. Wait for a decisive liquidity event before executing.';
            tradePlan.entryZone = {
                lower: discountLow,
                upper: premiumHigh,
                comment: 'Neutral range (30-70%)'
            };
            tradePlan.invalidation = (previousDay.high + previousDay.low) / 2;
            tradePlan.targets = [
                { level: currentDay.high, note: 'Range high liquidity' },
                { level: currentDay.low, note: 'Range low liquidity' }
            ];
        }

        return tradePlan;
    }

    _deriveSessionContext(latestTime, intraday15) {
        const referenceTime = latestTime ? new Date(latestTime) : new Date();
        const hour = referenceTime.getUTCHours();
        const session = SESSION_WINDOWS_UTC.find(window => (
            window.start < window.end ?
                hour >= window.start && hour < window.end :
                hour >= window.start || hour < window.end
        )) || { name: 'Unknown' };

        const recentCandles = intraday15.slice(-12);

        if (recentCandles.length === 0) {
            return {
                activeSession: session.name,
                sessionBias: 'Unknown',
                recentRange: { high: null, low: null }
            };
        }

        const closes = recentCandles.map(c => c.close);
        const direction = closes[closes.length - 1] > closes[0] ? 'Accumulation' : 'Distribution';

        return {
            activeSession: session.name,
            sessionBias: direction,
            recentRange: {
                high: Math.max(...recentCandles.map(c => c.high)),
                low: Math.min(...recentCandles.map(c => c.low))
            }
        };
    }
}

module.exports = TjrIndexBiasAnalyzer;
