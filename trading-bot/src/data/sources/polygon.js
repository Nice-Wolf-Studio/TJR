/**
 * Polygon.io Data Source
 * Professional market data from Polygon.io API
 */

const axios = require('axios');
const logger = require('../../utils/logger');

class PolygonSource {
    constructor(options = {}) {
        this.name = 'polygon';
        this.apiKey = options.apiKey;
        this.rateLimiter = options.rateLimiter;
        this.baseUrl = 'https://api.polygon.io';
        this.isInitialized = false;

        if (!this.apiKey) {
            throw new Error('Polygon API key is required');
        }

        // Session management
        this.session = axios.create({
            baseURL: this.baseUrl,
            timeout: 30000,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'User-Agent': 'TradingBot/1.0'
            }
        });

        this.setupRetryLogic();
    }

    /**
     * Setup axios retry logic
     */
    setupRetryLogic() {
        this.session.interceptors.response.use(
            response => response,
            async error => {
                const { config } = error;

                // Don't retry on authentication errors
                if (error.response && error.response.status === 401) {
                    logger.error('Polygon API authentication failed');
                    return Promise.reject(error);
                }

                // Don't retry on rate limit errors (handle separately)
                if (error.response && error.response.status === 429) {
                    logger.warn('Polygon API rate limit exceeded');
                    return Promise.reject(error);
                }

                if (!config || config.retryCount >= 3) {
                    return Promise.reject(error);
                }

                config.retryCount = (config.retryCount || 0) + 1;
                const delay = Math.pow(2, config.retryCount) * 1000;

                logger.warn(`Polygon request failed, retry ${config.retryCount}/3 in ${delay}ms`);

                await new Promise(resolve => setTimeout(resolve, delay));
                return this.session(config);
            }
        );
    }

    /**
     * Initialize the Polygon source
     */
    async initialize() {
        try {
            logger.info('Initializing Polygon.io data source...');

            // Test API connection and validate key
            await this.testConnection();

            this.isInitialized = true;
            logger.info('Polygon.io data source initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize Polygon source:', error);
            throw error;
        }
    }

    /**
     * Test connection to Polygon API
     */
    async testConnection() {
        try {
            const response = await this.session.get('/v3/reference/exchanges');

            if (response.status === 200 && response.data) {
                logger.debug('Polygon API connection test successful');
                return true;
            } else {
                throw new Error('Invalid response from Polygon API');
            }
        } catch (error) {
            if (error.response) {
                if (error.response.status === 401) {
                    throw new Error('Invalid Polygon API key');
                } else if (error.response.status === 429) {
                    throw new Error('Polygon API rate limit exceeded during initialization');
                }
            }
            logger.error('Polygon API connection test failed:', error);
            throw new Error('Failed to connect to Polygon API: ' + error.message);
        }
    }

    /**
     * Collect price data for a symbol and timeframe
     */
    async collectPriceData(symbol, timeframe, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Polygon source not initialized');
        }

        try {
            logger.debug(`Collecting ${timeframe} data for ${symbol} from Polygon`);

            // Convert symbol format for Polygon (e.g., EURUSD -> C:EURUSD for forex)
            const polygonSymbol = this.formatSymbolForPolygon(symbol);

            // Convert timeframe to Polygon format
            const { multiplier, timespan } = this.convertTimeframe(timeframe);

            // Calculate date range (default: last 24 hours)
            const endDate = options.endDate || new Date();
            const startDate = options.startDate || new Date(Date.now() - 24 * 60 * 60 * 1000);

            // Format dates for Polygon API (YYYY-MM-DD)
            const from = startDate.toISOString().split('T')[0];
            const to = endDate.toISOString().split('T')[0];

            // Fetch aggregates (OHLCV data)
            const response = await this.session.get(
                `/v2/aggs/ticker/${polygonSymbol}/range/${multiplier}/${timespan}/${from}/${to}`,
                {
                    params: {
                        adjusted: 'false',
                        sort: 'asc',
                        limit: options.limit || 5000
                    }
                }
            );

            if (response.status === 200 && response.data && response.data.results) {
                const priceData = this.convertPolygonData(
                    response.data.results,
                    symbol,
                    timeframe
                );

                logger.debug(`Collected ${priceData.length} records for ${symbol} from Polygon`);
                return priceData;
            }

            logger.warn(`No data available for ${symbol} on Polygon`);
            return [];

        } catch (error) {
            if (error.response && error.response.status === 429) {
                logger.warn(`Rate limit exceeded for ${symbol} on Polygon`);
                throw new Error('RATE_LIMIT_EXCEEDED');
            }

            logger.error(`Error collecting data for ${symbol} from Polygon:`, error);
            throw error;
        }
    }

    /**
     * Format symbol for Polygon API
     */
    formatSymbolForPolygon(symbol) {
        // Detect asset type and format accordingly
        if (this.isForexPair(symbol)) {
            return `C:${symbol}`; // Forex pairs
        } else if (this.isCryptoPair(symbol)) {
            return `X:${symbol}`; // Crypto pairs
        } else {
            return symbol; // Stocks (no prefix needed)
        }
    }

    /**
     * Check if symbol is a forex pair
     */
    isForexPair(symbol) {
        const forexPairs = [
            'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
            'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY', 'EURAUD', 'EURCHF', 'AUDNZD',
            'NZDJPY', 'GBPAUD', 'GBPCAD', 'EURNZD', 'AUDCAD', 'GBPCHF', 'AUDCHF',
            'EURCAD', 'CADJPY', 'NZDCAD', 'CADCHF', 'NZDCHF', 'CHFJPY'
        ];

        return forexPairs.includes(symbol.toUpperCase());
    }

    /**
     * Check if symbol is a crypto pair
     */
    isCryptoPair(symbol) {
        const cryptoSuffixes = ['USD', 'BTC', 'ETH', 'USDT'];
        const cryptoPrefixes = ['BTC', 'ETH', 'ADA', 'DOT', 'LINK', 'LTC', 'XRP'];

        return cryptoPrefixes.some(prefix => symbol.startsWith(prefix)) ||
               cryptoSuffixes.some(suffix => symbol.endsWith(suffix));
    }

    /**
     * Convert timeframe to Polygon format
     */
    convertTimeframe(timeframe) {
        const timeframeMap = {
            '1m': { multiplier: 1, timespan: 'minute' },
            '5m': { multiplier: 5, timespan: 'minute' },
            '15m': { multiplier: 15, timespan: 'minute' },
            '30m': { multiplier: 30, timespan: 'minute' },
            '1h': { multiplier: 1, timespan: 'hour' },
            '2h': { multiplier: 2, timespan: 'hour' },
            '4h': { multiplier: 4, timespan: 'hour' },
            '6h': { multiplier: 6, timespan: 'hour' },
            '8h': { multiplier: 8, timespan: 'hour' },
            '12h': { multiplier: 12, timespan: 'hour' },
            '1d': { multiplier: 1, timespan: 'day' },
            '3d': { multiplier: 3, timespan: 'day' },
            '1w': { multiplier: 1, timespan: 'week' },
            '1M': { multiplier: 1, timespan: 'month' }
        };

        return timeframeMap[timeframe] || { multiplier: 1, timespan: 'minute' };
    }

    /**
     * Convert Polygon data to our format
     */
    convertPolygonData(polygonData, symbol, timeframe) {
        try {
            const priceData = [];

            for (const item of polygonData) {
                const timestamp = new Date(item.t); // Polygon timestamp is in milliseconds
                const session = this.getSessionFromTimestamp(timestamp);

                const record = {
                    timestamp: timestamp,
                    open_price: parseFloat(item.o),
                    high_price: parseFloat(item.h),
                    low_price: parseFloat(item.l),
                    close_price: parseFloat(item.c),
                    volume: parseFloat(item.v) || 0,
                    tick_volume: parseInt(item.n) || 0, // Number of transactions
                    spread: null,
                    session: session,
                    quality_score: 0.95 // Polygon has high-quality data
                };

                // Calculate spread if available (for forex)
                if (item.vw && item.c) {
                    // Volume weighted average price vs close price can indicate spread
                    record.spread = Math.abs(item.vw - item.c);
                }

                // Validate the record
                if (this.isValidPriceRecord(record)) {
                    priceData.push(record);
                }
            }

            return priceData;

        } catch (error) {
            logger.error('Error converting Polygon data:', error);
            return [];
        }
    }

    /**
     * Get trading session from timestamp
     */
    getSessionFromTimestamp(timestamp) {
        const utcHour = timestamp.getUTCHours();

        // Determine trading session based on UTC time
        if (utcHour >= 22 || utcHour < 7) {
            return 'Tokyo';
        } else if (utcHour >= 7 && utcHour < 16) {
            return 'London';
        } else if (utcHour >= 13 && utcHour < 22) {
            return 'NewYork';
        } else {
            return 'Sydney';
        }
    }

    /**
     * Validate price record
     */
    isValidPriceRecord(record) {
        return (
            record.timestamp &&
            !isNaN(record.open_price) &&
            !isNaN(record.high_price) &&
            !isNaN(record.low_price) &&
            !isNaN(record.close_price) &&
            record.high_price >= record.low_price &&
            record.high_price >= Math.max(record.open_price, record.close_price) &&
            record.low_price <= Math.min(record.open_price, record.close_price)
        );
    }

    /**
     * Get real-time quote for a symbol
     */
    async getRealTimeQuote(symbol) {
        try {
            const polygonSymbol = this.formatSymbolForPolygon(symbol);

            const response = await this.session.get(
                `/v2/last/trade/${polygonSymbol}`
            );

            if (response.status === 200 && response.data && response.data.results) {
                const result = response.data.results;

                return {
                    symbol: symbol,
                    price: result.p,
                    size: result.s,
                    timestamp: new Date(result.t),
                    exchange: result.x,
                    conditions: result.c
                };
            }

            return null;

        } catch (error) {
            logger.error(`Error getting real-time quote for ${symbol}:`, error);
            return null;
        }
    }

    /**
     * Get market status
     */
    async getMarketStatus() {
        try {
            const response = await this.session.get('/v1/marketstatus/now');

            if (response.status === 200 && response.data) {
                return {
                    afterHours: response.data.afterHours,
                    currencies: response.data.currencies,
                    earlyHours: response.data.earlyHours,
                    exchanges: response.data.exchanges,
                    market: response.data.market,
                    serverTime: response.data.serverTime
                };
            }

            return null;

        } catch (error) {
            logger.error('Error getting market status:', error);
            return null;
        }
    }

    /**
     * Search for symbols
     */
    async searchSymbols(query, options = {}) {
        try {
            const response = await this.session.get('/v3/reference/tickers', {
                params: {
                    search: query,
                    active: 'true',
                    sort: 'ticker',
                    order: 'asc',
                    limit: options.limit || 20,
                    market: options.market || 'fx' // fx, stocks, crypto
                }
            });

            if (response.status === 200 && response.data && response.data.results) {
                return response.data.results.map(ticker => ({
                    symbol: ticker.ticker,
                    name: ticker.name,
                    type: ticker.type,
                    market: ticker.market,
                    active: ticker.active,
                    primaryExchange: ticker.primary_exchange,
                    currency: ticker.currency_name
                }));
            }

            return [];

        } catch (error) {
            logger.error('Error searching symbols on Polygon:', error);
            return [];
        }
    }

    /**
     * Stop the Polygon source
     */
    async stop() {
        logger.info('Stopping Polygon.io data source');
        this.isInitialized = false;
    }

    /**
     * Get source status
     */
    getStatus() {
        return {
            name: this.name,
            initialized: this.isInitialized,
            available: !!this.apiKey,
            rateLimit: this.rateLimiter ? this.rateLimiter.getStatus() : null
        };
    }
}

module.exports = PolygonSource;