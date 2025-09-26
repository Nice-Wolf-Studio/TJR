/**
 * TradingView Data Source
 * Collects market data from TradingView (via web scraping or unofficial API)
 */

const axios = require('axios');
const logger = require('../../utils/logger');

class TradingViewSource {
    constructor(options = {}) {
        this.name = 'tradingview';
        this.rateLimiter = options.rateLimiter;
        this.baseUrl = 'https://scanner.tradingview.com';
        this.symbolInfoUrl = 'https://symbol-search.tradingview.com';
        this.isInitialized = false;

        // Session management
        this.session = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.tradingview.com/',
                'Origin': 'https://www.tradingview.com'
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

                if (!config || config.retryCount >= 3) {
                    return Promise.reject(error);
                }

                config.retryCount = (config.retryCount || 0) + 1;
                const delay = Math.pow(2, config.retryCount) * 1000;

                logger.warn(`TradingView request failed, retry ${config.retryCount}/3 in ${delay}ms`);

                await new Promise(resolve => setTimeout(resolve, delay));
                return this.session(config);
            }
        );
    }

    /**
     * Initialize the TradingView source
     */
    async initialize() {
        try {
            logger.info('Initializing TradingView data source...');

            // Test connection by fetching market status
            await this.testConnection();

            this.isInitialized = true;
            logger.info('TradingView data source initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize TradingView source:', error);
            throw error;
        }
    }

    /**
     * Test connection to TradingView
     */
    async testConnection() {
        try {
            const response = await this.session.get(`${this.symbolInfoUrl}/symbol_search/?text=EURUSD&type=forex`);

            if (response.status === 200 && response.data) {
                logger.debug('TradingView connection test successful');
                return true;
            } else {
                throw new Error('Invalid response from TradingView');
            }
        } catch (error) {
            logger.error('TradingView connection test failed:', error);
            throw new Error('Failed to connect to TradingView: ' + error.message);
        }
    }

    /**
     * Collect price data for a symbol and timeframe
     */
    async collectPriceData(symbol, timeframe, options = {}) {
        if (!this.isInitialized) {
            throw new Error('TradingView source not initialized');
        }

        try {
            logger.debug(`Collecting ${timeframe} data for ${symbol} from TradingView`);

            // Convert timeframe to TradingView format
            const tvTimeframe = this.convertTimeframe(timeframe);

            // Get current market session
            const session = this.getCurrentSession();

            // Use TradingView scanner API to get recent data
            const scannerData = await this.getScannerData(symbol, tvTimeframe);

            if (!scannerData || scannerData.length === 0) {
                logger.warn(`No data available for ${symbol} on TradingView`);
                return [];
            }

            // Convert scanner data to our format
            const priceData = this.convertScannerData(scannerData, symbol, timeframe, session);

            logger.debug(`Collected ${priceData.length} records for ${symbol} from TradingView`);

            return priceData;

        } catch (error) {
            logger.error(`Error collecting data for ${symbol} from TradingView:`, error);
            throw error;
        }
    }

    /**
     * Get scanner data from TradingView
     */
    async getScannerData(symbol, timeframe) {
        try {
            // TradingView scanner payload
            const payload = {
                filter: [
                    { left: "name", operation: "match", right: symbol }
                ],
                options: { lang: "en" },
                symbols: { query: { types: [] }, tickers: [] },
                columns: [
                    "name", "close", "volume", "market_cap_calc",
                    "high", "low", "open",
                    "change", "change_abs",
                    "Recommend.All",
                    "exchange",
                    "description",
                    "type",
                    "subtype",
                    "update_mode",
                    "pricescale",
                    "minmov",
                    "fractional",
                    "minmove2"
                ],
                sort: { sortBy: "name", sortOrder: "asc" },
                range: [0, 50]
            };

            const response = await this.session.post(
                `${this.baseUrl}/america/scan`,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.status === 200 && response.data && response.data.data) {
                return response.data.data;
            }

            return [];

        } catch (error) {
            logger.error('Error fetching scanner data from TradingView:', error);
            return [];
        }
    }

    /**
     * Convert scanner data to our price data format
     */
    convertScannerData(scannerData, symbol, timeframe, session) {
        try {
            const priceData = [];
            const currentTime = new Date();

            // TradingView scanner returns current snapshot, not historical data
            // For historical data, we would need to use their charts API or WebSocket
            for (const item of scannerData) {
                if (item.s && item.s.toLowerCase().includes(symbol.toLowerCase())) {
                    const record = {
                        timestamp: currentTime,
                        open_price: parseFloat(item.d[6]) || parseFloat(item.d[1]), // open or close as fallback
                        high_price: parseFloat(item.d[4]) || parseFloat(item.d[1]),
                        low_price: parseFloat(item.d[5]) || parseFloat(item.d[1]),
                        close_price: parseFloat(item.d[1]),
                        volume: parseFloat(item.d[2]) || 0,
                        tick_volume: 0,
                        spread: null,
                        session: session,
                        quality_score: 0.8 // TradingView data quality score
                    };

                    // Validate the record
                    if (this.isValidPriceRecord(record)) {
                        priceData.push(record);
                    }
                }
            }

            return priceData;

        } catch (error) {
            logger.error('Error converting scanner data:', error);
            return [];
        }
    }

    /**
     * Convert our timeframe format to TradingView format
     */
    convertTimeframe(timeframe) {
        const timeframeMap = {
            '1m': '1',
            '5m': '5',
            '15m': '15',
            '30m': '30',
            '1h': '60',
            '2h': '120',
            '4h': '240',
            '6h': '360',
            '8h': '480',
            '12h': '720',
            '1d': '1D',
            '3d': '3D',
            '1w': '1W',
            '1M': '1M'
        };

        return timeframeMap[timeframe] || timeframe;
    }

    /**
     * Get current trading session
     */
    getCurrentSession() {
        const now = new Date();
        const utcHour = now.getUTCHours();

        // Determine current trading session based on UTC time
        if (utcHour >= 0 && utcHour < 9) {
            return 'Sydney';
        } else if (utcHour >= 8 && utcHour < 17) {
            return 'London';
        } else if (utcHour >= 13 && utcHour < 22) {
            return 'NewYork';
        } else {
            return 'Tokyo';
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
     * Search for symbols on TradingView
     */
    async searchSymbols(query, type = 'forex') {
        try {
            const response = await this.session.get(
                `${this.symbolInfoUrl}/symbol_search/`,
                {
                    params: {
                        text: query,
                        type: type
                    }
                }
            );

            if (response.status === 200 && response.data) {
                return response.data.map(item => ({
                    symbol: item.symbol,
                    description: item.description,
                    exchange: item.exchange,
                    type: item.type
                }));
            }

            return [];

        } catch (error) {
            logger.error('Error searching symbols on TradingView:', error);
            return [];
        }
    }

    /**
     * Get symbol information
     */
    async getSymbolInfo(symbol) {
        try {
            const searchResults = await this.searchSymbols(symbol);

            if (searchResults.length > 0) {
                return searchResults[0];
            }

            return null;

        } catch (error) {
            logger.error(`Error getting symbol info for ${symbol}:`, error);
            return null;
        }
    }

    /**
     * Stop the TradingView source
     */
    async stop() {
        logger.info('Stopping TradingView data source');
        this.isInitialized = false;
    }

    /**
     * Get source status
     */
    getStatus() {
        return {
            name: this.name,
            initialized: this.isInitialized,
            available: true,
            rateLimit: this.rateLimiter ? this.rateLimiter.getStatus() : null
        };
    }
}

module.exports = TradingViewSource;