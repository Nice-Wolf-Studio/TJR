/**
 * Alpha Vantage Data Source
 * Free and premium market data from Alpha Vantage API
 */

const axios = require('axios');
const logger = require('../../utils/logger');

class AlphaVantageSource {
    constructor(options = {}) {
        this.name = 'alphavantage';
        this.apiKey = options.apiKey;
        this.rateLimiter = options.rateLimiter;
        this.baseUrl = 'https://www.alphavantage.co/query';
        this.isInitialized = false;

        if (!this.apiKey) {
            throw new Error('Alpha Vantage API key is required');
        }

        // Session management
        this.session = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'TradingBot/1.0'
            }
        });

        this.setupRetryLogic();

        // Alpha Vantage specific rate limits (5 API calls per minute for free tier)
        this.lastRequestTime = 0;
        this.requestInterval = 12000; // 12 seconds between requests for free tier
    }

    /**
     * Setup axios retry logic
     */
    setupRetryLogic() {
        this.session.interceptors.response.use(
            response => response,
            async error => {
                const { config } = error;

                // Don't retry on API key errors
                if (error.response && error.response.status === 401) {
                    logger.error('Alpha Vantage API authentication failed');
                    return Promise.reject(error);
                }

                if (!config || config.retryCount >= 3) {
                    return Promise.reject(error);
                }

                config.retryCount = (config.retryCount || 0) + 1;
                const delay = Math.pow(2, config.retryCount) * 1000;

                logger.warn(`Alpha Vantage request failed, retry ${config.retryCount}/3 in ${delay}ms`);

                await new Promise(resolve => setTimeout(resolve, delay));
                return this.session(config);
            }
        );
    }

    /**
     * Initialize the Alpha Vantage source
     */
    async initialize() {
        try {
            logger.info('Initializing Alpha Vantage data source...');

            // Test API connection
            await this.testConnection();

            this.isInitialized = true;
            logger.info('Alpha Vantage data source initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize Alpha Vantage source:', error);
            throw error;
        }
    }

    /**
     * Test connection to Alpha Vantage API
     */
    async testConnection() {
        try {
            const response = await this.session.get(this.baseUrl, {
                params: {
                    function: 'CURRENCY_EXCHANGE_RATE',
                    from_currency: 'USD',
                    to_currency: 'EUR',
                    apikey: this.apiKey
                }
            });

            if (response.status === 200 && response.data) {
                if (response.data['Error Message']) {
                    throw new Error(response.data['Error Message']);
                }
                if (response.data['Note']) {
                    logger.warn('Alpha Vantage API limit notice:', response.data['Note']);
                }

                logger.debug('Alpha Vantage API connection test successful');
                return true;
            } else {
                throw new Error('Invalid response from Alpha Vantage API');
            }
        } catch (error) {
            logger.error('Alpha Vantage API connection test failed:', error);
            throw new Error('Failed to connect to Alpha Vantage API: ' + error.message);
        }
    }

    /**
     * Rate limiting for Alpha Vantage API
     */
    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.requestInterval) {
            const waitTime = this.requestInterval - timeSinceLastRequest;
            logger.debug(`Alpha Vantage rate limit: waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.lastRequestTime = Date.now();
    }

    /**
     * Collect price data for a symbol and timeframe
     */
    async collectPriceData(symbol, timeframe, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Alpha Vantage source not initialized');
        }

        try {
            logger.debug(`Collecting ${timeframe} data for ${symbol} from Alpha Vantage`);

            // Enforce rate limiting
            await this.enforceRateLimit();

            let priceData = [];

            // Alpha Vantage has different endpoints for different asset types
            if (this.isForexPair(symbol)) {
                priceData = await this.collectForexData(symbol, timeframe, options);
            } else if (this.isCryptoPair(symbol)) {
                priceData = await this.collectCryptoData(symbol, timeframe, options);
            } else {
                priceData = await this.collectStockData(symbol, timeframe, options);
            }

            logger.debug(`Collected ${priceData.length} records for ${symbol} from Alpha Vantage`);
            return priceData;

        } catch (error) {
            logger.error(`Error collecting data for ${symbol} from Alpha Vantage:`, error);
            throw error;
        }
    }

    /**
     * Collect forex data
     */
    async collectForexData(symbol, timeframe, options = {}) {
        const [fromCurrency, toCurrency] = this.parseForexPair(symbol);

        // Convert timeframe to Alpha Vantage function
        const avFunction = this.getForexFunction(timeframe);
        const interval = this.convertTimeframeToInterval(timeframe);

        const params = {
            function: avFunction,
            from_symbol: fromCurrency,
            to_symbol: toCurrency,
            apikey: this.apiKey,
            outputsize: options.outputSize || 'compact' // compact (100 data points) or full (up to 20 years)
        };

        if (interval) {
            params.interval = interval;
        }

        const response = await this.session.get(this.baseUrl, { params });

        if (response.status === 200 && response.data) {
            if (response.data['Error Message']) {
                throw new Error(response.data['Error Message']);
            }

            if (response.data['Note']) {
                logger.warn('Alpha Vantage API limit:', response.data['Note']);
                throw new Error('RATE_LIMIT_EXCEEDED');
            }

            return this.parseForexResponse(response.data, symbol, timeframe);
        }

        return [];
    }

    /**
     * Collect crypto data
     */
    async collectCryptoData(symbol, timeframe, options = {}) {
        const [fromCurrency, toCurrency] = this.parseCryptoPair(symbol);

        const params = {
            function: 'DIGITAL_CURRENCY_INTRADAY',
            symbol: fromCurrency,
            market: toCurrency,
            interval: this.convertTimeframeToInterval(timeframe) || '5min',
            apikey: this.apiKey
        };

        const response = await this.session.get(this.baseUrl, { params });

        if (response.status === 200 && response.data) {
            if (response.data['Error Message']) {
                throw new Error(response.data['Error Message']);
            }

            if (response.data['Note']) {
                logger.warn('Alpha Vantage API limit:', response.data['Note']);
                throw new Error('RATE_LIMIT_EXCEEDED');
            }

            return this.parseCryptoResponse(response.data, symbol, timeframe);
        }

        return [];
    }

    /**
     * Collect stock data
     */
    async collectStockData(symbol, timeframe, options = {}) {
        const avFunction = this.getStockFunction(timeframe);
        const interval = this.convertTimeframeToInterval(timeframe);

        const params = {
            function: avFunction,
            symbol: symbol,
            apikey: this.apiKey,
            outputsize: options.outputSize || 'compact'
        };

        if (interval) {
            params.interval = interval;
        }

        const response = await this.session.get(this.baseUrl, { params });

        if (response.status === 200 && response.data) {
            if (response.data['Error Message']) {
                throw new Error(response.data['Error Message']);
            }

            if (response.data['Note']) {
                logger.warn('Alpha Vantage API limit:', response.data['Note']);
                throw new Error('RATE_LIMIT_EXCEEDED');
            }

            return this.parseStockResponse(response.data, symbol, timeframe);
        }

        return [];
    }

    /**
     * Get Alpha Vantage function for forex data
     */
    getForexFunction(timeframe) {
        const timeframeFunctions = {
            '1m': 'FX_INTRADAY',
            '5m': 'FX_INTRADAY',
            '15m': 'FX_INTRADAY',
            '30m': 'FX_INTRADAY',
            '1h': 'FX_INTRADAY',
            '1d': 'FX_DAILY',
            '1w': 'FX_WEEKLY',
            '1M': 'FX_MONTHLY'
        };

        return timeframeFunctions[timeframe] || 'FX_INTRADAY';
    }

    /**
     * Get Alpha Vantage function for stock data
     */
    getStockFunction(timeframe) {
        const timeframeFunctions = {
            '1m': 'TIME_SERIES_INTRADAY',
            '5m': 'TIME_SERIES_INTRADAY',
            '15m': 'TIME_SERIES_INTRADAY',
            '30m': 'TIME_SERIES_INTRADAY',
            '1h': 'TIME_SERIES_INTRADAY',
            '1d': 'TIME_SERIES_DAILY',
            '1w': 'TIME_SERIES_WEEKLY',
            '1M': 'TIME_SERIES_MONTHLY'
        };

        return timeframeFunctions[timeframe] || 'TIME_SERIES_INTRADAY';
    }

    /**
     * Convert timeframe to Alpha Vantage interval
     */
    convertTimeframeToInterval(timeframe) {
        const intervalMap = {
            '1m': '1min',
            '5m': '5min',
            '15m': '15min',
            '30m': '30min',
            '1h': '60min'
        };

        return intervalMap[timeframe];
    }

    /**
     * Parse forex pair symbol
     */
    parseForexPair(symbol) {
        if (symbol.length === 6) {
            return [symbol.substring(0, 3), symbol.substring(3, 6)];
        } else if (symbol.includes('/')) {
            return symbol.split('/');
        }

        throw new Error(`Invalid forex pair format: ${symbol}`);
    }

    /**
     * Parse crypto pair symbol
     */
    parseCryptoPair(symbol) {
        // Common crypto pairs
        const cryptoSuffixes = ['USD', 'BTC', 'ETH', 'USDT'];

        for (const suffix of cryptoSuffixes) {
            if (symbol.endsWith(suffix)) {
                const base = symbol.substring(0, symbol.length - suffix.length);
                return [base, suffix];
            }
        }

        throw new Error(`Invalid crypto pair format: ${symbol}`);
    }

    /**
     * Parse forex API response
     */
    parseForexResponse(data, symbol, timeframe) {
        const priceData = [];

        // Find the time series data key
        const timeSeriesKey = Object.keys(data).find(key =>
            key.includes('Time Series') || key.includes('FX')
        );

        if (!timeSeriesKey || !data[timeSeriesKey]) {
            return priceData;
        }

        const timeSeriesData = data[timeSeriesKey];

        for (const [timestamp, values] of Object.entries(timeSeriesData)) {
            const record = {
                timestamp: new Date(timestamp),
                open_price: parseFloat(values['1. open']),
                high_price: parseFloat(values['2. high']),
                low_price: parseFloat(values['3. low']),
                close_price: parseFloat(values['4. close']),
                volume: 0, // Forex doesn't have volume in Alpha Vantage
                tick_volume: 0,
                spread: null,
                session: this.getSessionFromTimestamp(new Date(timestamp)),
                quality_score: 0.85 // Alpha Vantage quality score
            };

            if (this.isValidPriceRecord(record)) {
                priceData.push(record);
            }
        }

        return priceData.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Parse crypto API response
     */
    parseCryptoResponse(data, symbol, timeframe) {
        const priceData = [];

        const timeSeriesKey = Object.keys(data).find(key =>
            key.includes('Time Series')
        );

        if (!timeSeriesKey || !data[timeSeriesKey]) {
            return priceData;
        }

        const timeSeriesData = data[timeSeriesKey];

        for (const [timestamp, values] of Object.entries(timeSeriesData)) {
            const record = {
                timestamp: new Date(timestamp),
                open_price: parseFloat(values['1a. open (USD)'] || values['1. open']),
                high_price: parseFloat(values['2a. high (USD)'] || values['2. high']),
                low_price: parseFloat(values['3a. low (USD)'] || values['3. low']),
                close_price: parseFloat(values['4a. close (USD)'] || values['4. close']),
                volume: parseFloat(values['5. volume']) || 0,
                tick_volume: 0,
                spread: null,
                session: this.getSessionFromTimestamp(new Date(timestamp)),
                quality_score: 0.85
            };

            if (this.isValidPriceRecord(record)) {
                priceData.push(record);
            }
        }

        return priceData.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Parse stock API response
     */
    parseStockResponse(data, symbol, timeframe) {
        const priceData = [];

        const timeSeriesKey = Object.keys(data).find(key =>
            key.includes('Time Series')
        );

        if (!timeSeriesKey || !data[timeSeriesKey]) {
            return priceData;
        }

        const timeSeriesData = data[timeSeriesKey];

        for (const [timestamp, values] of Object.entries(timeSeriesData)) {
            const record = {
                timestamp: new Date(timestamp),
                open_price: parseFloat(values['1. open']),
                high_price: parseFloat(values['2. high']),
                low_price: parseFloat(values['3. low']),
                close_price: parseFloat(values['4. close']),
                volume: parseFloat(values['5. volume']) || 0,
                tick_volume: 0,
                spread: null,
                session: this.getSessionFromTimestamp(new Date(timestamp)),
                quality_score: 0.85
            };

            if (this.isValidPriceRecord(record)) {
                priceData.push(record);
            }
        }

        return priceData.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Check if symbol is a forex pair
     */
    isForexPair(symbol) {
        const forexPairs = [
            'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
            'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY', 'EURAUD', 'EURCHF', 'AUDNZD'
        ];

        return forexPairs.includes(symbol.toUpperCase()) || symbol.includes('/');
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
     * Get trading session from timestamp
     */
    getSessionFromTimestamp(timestamp) {
        const utcHour = timestamp.getUTCHours();

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
     * Stop the Alpha Vantage source
     */
    async stop() {
        logger.info('Stopping Alpha Vantage data source');
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
            rateLimit: {
                requestInterval: this.requestInterval,
                lastRequest: this.lastRequestTime
            }
        };
    }
}

module.exports = AlphaVantageSource;