/**
 * TradingView Webhook Receiver
 * Handles incoming webhook alerts from TradingView with security validation,
 * rate limiting, and integration with the analysis engine.
 *
 * Features:
 * - Webhook signature validation
 * - High-frequency alert processing
 * - Data parsing and validation
 * - Integration with analysis engine
 * - Rate limiting and DDoS protection
 * - Alert deduplication and filtering
 */

const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const logger = require('../utils/logger');
const config = require('../../config/environment');
const SignalProcessor = require('../signals/processor');

class TradingViewWebhookReceiver {
    constructor(options = {}) {
        this.options = {
            port: options.port || config.get('tradingView.webhook.port', 3001),
            path: options.path || config.get('tradingView.webhook.path', '/webhook/tradingview'),
            secret: options.secret || config.get('tradingView.webhook.secret'),
            enableSignatureValidation: options.enableSignatureValidation !== false,
            enableRateLimit: options.enableRateLimit !== false,
            maxAlertsPerMinute: options.maxAlertsPerMinute || 100,
            maxAlertsPerHour: options.maxAlertsPerHour || 1000,
            alertTimeout: options.alertTimeout || 30000, // 30 seconds
            enableDeduplication: options.enableDeduplication !== false,
            deduplicationWindow: options.deduplicationWindow || 5000, // 5 seconds
            ...options
        };

        this.app = express();
        this.signalProcessor = new SignalProcessor(options.signalProcessor);
        this.rateLimiter = null;
        this.alertCache = new Map(); // For deduplication
        this.metrics = {
            totalAlerts: 0,
            validAlerts: 0,
            invalidAlerts: 0,
            duplicateAlerts: 0,
            rateLimitedAlerts: 0,
            processingErrors: 0,
            averageProcessingTime: 0
        };

        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    /**
     * Setup Express middleware for security and rate limiting
     */
    setupMiddleware() {
        // Security headers
        this.app.use(helmet({
            contentSecurityPolicy: false, // Allow webhook content
            crossOriginEmbedderPolicy: false
        }));

        // Rate limiting setup
        if (this.options.enableRateLimit) {
            this.setupRateLimiting();
        }

        // Body parsing with size limits
        this.app.use(express.json({
            limit: '1mb',
            verify: (req, res, buf) => {
                req.rawBody = buf.toString('utf8');
            }
        }));

        this.app.use(express.urlencoded({
            extended: true,
            limit: '1mb'
        }));

        // Request logging
        this.app.use((req, res, next) => {
            req.startTime = Date.now();
            logger.debug('Webhook request received', {
                method: req.method,
                url: req.url,
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
            next();
        });
    }

    /**
     * Setup rate limiting with Redis backend
     */
    setupRateLimiting() {
        // Per-minute rate limiter
        this.rateLimiterMinute = new RateLimiterRedis({
            storeClient: require('../data/storage').redis,
            keyPrefix: 'tv_webhook_min',
            points: this.options.maxAlertsPerMinute,
            duration: 60, // 1 minute
            blockDuration: 60, // Block for 1 minute
            execEvenly: true
        });

        // Per-hour rate limiter
        this.rateLimiterHour = new RateLimiterRedis({
            storeClient: require('../data/storage').redis,
            keyPrefix: 'tv_webhook_hour',
            points: this.options.maxAlertsPerHour,
            duration: 3600, // 1 hour
            blockDuration: 300, // Block for 5 minutes
            execEvenly: true
        });

        // Express rate limit middleware
        this.app.use(rateLimit({
            windowMs: 60 * 1000, // 1 minute
            max: this.options.maxAlertsPerMinute,
            message: 'Too many webhook requests',
            standardHeaders: true,
            legacyHeaders: false,
            handler: (req, res) => {
                this.metrics.rateLimitedAlerts++;
                logger.warn('Rate limit exceeded for webhook', {
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                });
                res.status(429).json({
                    error: 'Rate limit exceeded',
                    retryAfter: 60
                });
            }
        }));
    }

    /**
     * Setup webhook routes
     */
    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: Date.now(),
                metrics: this.getMetrics(),
                uptime: process.uptime()
            });
        });

        // Metrics endpoint
        this.app.get('/metrics', (req, res) => {
            res.json({
                metrics: this.getMetrics(),
                rateLimit: {
                    enabled: this.options.enableRateLimit,
                    maxPerMinute: this.options.maxAlertsPerMinute,
                    maxPerHour: this.options.maxAlertsPerHour
                }
            });
        });

        // Main webhook endpoint
        this.app.post(this.options.path, async (req, res) => {
            await this.handleWebhook(req, res);
        });

        // Catch-all for undefined routes
        this.app.use('*', (req, res) => {
            logger.warn('Unknown webhook endpoint accessed', {
                method: req.method,
                url: req.url,
                ip: req.ip
            });
            res.status(404).json({ error: 'Endpoint not found' });
        });
    }

    /**
     * Setup error handling middleware
     */
    setupErrorHandling() {
        this.app.use((error, req, res, next) => {
            this.metrics.processingErrors++;
            logger.error('Webhook processing error', {
                error: error.message,
                stack: error.stack,
                url: req.url,
                method: req.method,
                ip: req.ip
            });

            res.status(500).json({
                error: 'Internal server error',
                requestId: req.id || Date.now()
            });
        });
    }

    /**
     * Main webhook handler
     */
    async handleWebhook(req, res) {
        const startTime = Date.now();

        try {
            this.metrics.totalAlerts++;

            // Validate request
            const validationResult = await this.validateRequest(req);
            if (!validationResult.valid) {
                this.metrics.invalidAlerts++;
                return res.status(400).json({
                    error: validationResult.error,
                    code: validationResult.code
                });
            }

            // Parse webhook data
            const alertData = this.parseWebhookData(req.body);
            if (!alertData) {
                this.metrics.invalidAlerts++;
                return res.status(400).json({
                    error: 'Invalid alert data format',
                    code: 'INVALID_FORMAT'
                });
            }

            // Check for duplicate alerts
            if (this.options.enableDeduplication) {
                const isDuplicate = this.checkDuplicateAlert(alertData);
                if (isDuplicate) {
                    this.metrics.duplicateAlerts++;
                    return res.status(200).json({
                        status: 'duplicate',
                        message: 'Alert already processed'
                    });
                }
            }

            // Rate limiting check (additional to middleware)
            if (this.options.enableRateLimit) {
                const rateLimitResult = await this.checkRateLimit(req.ip);
                if (!rateLimitResult.allowed) {
                    this.metrics.rateLimitedAlerts++;
                    return res.status(429).json({
                        error: 'Rate limit exceeded',
                        retryAfter: rateLimitResult.retryAfter
                    });
                }
            }

            // Process the alert
            const processingResult = await this.processAlert(alertData, req);

            this.metrics.validAlerts++;
            this.updateProcessingTimeMetrics(Date.now() - startTime);

            logger.info('TradingView alert processed successfully', {
                symbol: alertData.symbol,
                alertType: alertData.type,
                processingTime: Date.now() - startTime,
                processingResult: processingResult.status
            });

            res.status(200).json({
                status: 'success',
                processingTime: Date.now() - startTime,
                alertId: processingResult.alertId,
                message: 'Alert processed successfully'
            });

        } catch (error) {
            this.metrics.processingErrors++;
            logger.error('Webhook processing error', {
                error: error.message,
                stack: error.stack,
                body: req.body,
                processingTime: Date.now() - startTime
            });

            res.status(500).json({
                status: 'error',
                error: 'Processing failed',
                processingTime: Date.now() - startTime
            });
        }
    }

    /**
     * Validate incoming webhook request
     */
    async validateRequest(req) {
        // Check Content-Type
        if (!req.is('application/json')) {
            return {
                valid: false,
                error: 'Invalid Content-Type, expected application/json',
                code: 'INVALID_CONTENT_TYPE'
            };
        }

        // Validate webhook signature if enabled
        if (this.options.enableSignatureValidation && this.options.secret) {
            const signatureValid = this.validateSignature(req);
            if (!signatureValid) {
                return {
                    valid: false,
                    error: 'Invalid webhook signature',
                    code: 'INVALID_SIGNATURE'
                };
            }
        }

        // Check request size
        if (req.rawBody.length > 1024 * 1024) { // 1MB limit
            return {
                valid: false,
                error: 'Request body too large',
                code: 'REQUEST_TOO_LARGE'
            };
        }

        // Basic JSON validation
        try {
            if (typeof req.body !== 'object' || req.body === null) {
                return {
                    valid: false,
                    error: 'Invalid JSON payload',
                    code: 'INVALID_JSON'
                };
            }
        } catch (error) {
            return {
                valid: false,
                error: 'JSON parsing failed',
                code: 'JSON_PARSE_ERROR'
            };
        }

        return { valid: true };
    }

    /**
     * Validate webhook signature using HMAC
     */
    validateSignature(req) {
        const signature = req.get('X-TradingView-Signature') || req.get('X-Signature');
        if (!signature) {
            return false;
        }

        try {
            const expectedSignature = crypto
                .createHmac('sha256', this.options.secret)
                .update(req.rawBody)
                .digest('hex');

            const providedSignature = signature.replace('sha256=', '');

            return crypto.timingSafeEqual(
                Buffer.from(expectedSignature, 'hex'),
                Buffer.from(providedSignature, 'hex')
            );
        } catch (error) {
            logger.error('Signature validation error', { error: error.message });
            return false;
        }
    }

    /**
     * Parse webhook data from TradingView
     */
    parseWebhookData(body) {
        try {
            // Standard TradingView webhook format
            const alertData = {
                timestamp: Date.now(),
                receivedAt: new Date().toISOString(),

                // Basic alert information
                symbol: body.ticker || body.symbol,
                exchange: body.exchange,
                type: body.type || body.alert_type,
                message: body.message || body.alert_message,

                // Price information
                price: parseFloat(body.price || body.close),
                open: parseFloat(body.open),
                high: parseFloat(body.high),
                low: parseFloat(body.low),
                close: parseFloat(body.close),
                volume: parseFloat(body.volume),

                // Timeframe and timing
                timeframe: body.timeframe || body.interval,
                time: body.time || body.alert_time,

                // Technical analysis data
                rsi: parseFloat(body.rsi),
                macd: body.macd ? {
                    line: parseFloat(body.macd_line),
                    signal: parseFloat(body.macd_signal),
                    histogram: parseFloat(body.macd_histogram)
                } : null,

                // Custom fields for trading signals
                signal: body.signal,
                action: body.action,
                direction: body.direction,
                confidence: parseFloat(body.confidence),
                strength: parseFloat(body.strength),

                // Confluence data
                confluence: body.confluence ? {
                    score: parseFloat(body.confluence_score),
                    factors: body.confluence_factors ? body.confluence_factors.split(',') : [],
                    levels: body.confluence_levels ? body.confluence_levels.split(',').map(parseFloat) : []
                } : null,

                // Liquidity and structure
                liquidityLevel: parseFloat(body.liquidity_level),
                liquidityType: body.liquidity_type,
                structureBreak: body.structure_break === 'true',
                bosType: body.bos_type,
                fvgDetected: body.fvg_detected === 'true',

                // Session information
                session: body.session,
                sessionHigh: parseFloat(body.session_high),
                sessionLow: parseFloat(body.session_low),

                // Risk management
                stopLoss: parseFloat(body.stop_loss),
                takeProfit: parseFloat(body.take_profit),
                riskReward: parseFloat(body.risk_reward),

                // Raw data for custom processing
                raw: body,

                // Alert metadata
                alertId: body.alert_id || this.generateAlertId(),
                strategy: body.strategy,
                version: body.version || '1.0'
            };

            // Validate required fields
            if (!alertData.symbol) {
                logger.warn('Alert missing required symbol field', { body });
                return null;
            }

            // Clean up undefined values
            Object.keys(alertData).forEach(key => {
                if (alertData[key] === undefined || (typeof alertData[key] === 'number' && isNaN(alertData[key]))) {
                    delete alertData[key];
                }
            });

            return alertData;

        } catch (error) {
            logger.error('Failed to parse webhook data', {
                error: error.message,
                body: body
            });
            return null;
        }
    }

    /**
     * Check for duplicate alerts within the deduplication window
     */
    checkDuplicateAlert(alertData) {
        const alertKey = this.generateAlertKey(alertData);
        const now = Date.now();

        // Clean up expired entries
        for (const [key, timestamp] of this.alertCache.entries()) {
            if (now - timestamp > this.options.deduplicationWindow) {
                this.alertCache.delete(key);
            }
        }

        // Check if alert already exists
        if (this.alertCache.has(alertKey)) {
            return true;
        }

        // Add to cache
        this.alertCache.set(alertKey, now);
        return false;
    }

    /**
     * Generate alert key for deduplication
     */
    generateAlertKey(alertData) {
        return `${alertData.symbol}_${alertData.type}_${alertData.timeframe}_${Math.floor(alertData.timestamp / 1000)}`;
    }

    /**
     * Check rate limits using Redis-based limiters
     */
    async checkRateLimit(ip) {
        try {
            // Check per-minute limit
            await this.rateLimiterMinute.consume(ip);

            // Check per-hour limit
            await this.rateLimiterHour.consume(ip);

            return { allowed: true };
        } catch (rateLimiterRes) {
            return {
                allowed: false,
                retryAfter: Math.ceil(rateLimiterRes.msBeforeNext / 1000)
            };
        }
    }

    /**
     * Process the validated alert
     */
    async processAlert(alertData, req) {
        try {
            logger.info('Processing TradingView alert', {
                symbol: alertData.symbol,
                type: alertData.type,
                alertId: alertData.alertId
            });

            // Convert TradingView alert to internal signal format
            const signal = await this.signalProcessor.processSignal(alertData);

            // Store alert for tracking
            await this.storeAlert(alertData, signal, req);

            return {
                status: 'processed',
                alertId: alertData.alertId,
                signalId: signal.id,
                processingTime: Date.now() - req.startTime
            };

        } catch (error) {
            logger.error('Alert processing failed', {
                error: error.message,
                alertData: alertData
            });
            throw error;
        }
    }

    /**
     * Store alert data for tracking and analysis
     */
    async storeAlert(alertData, signal, req) {
        try {
            const storage = require('../data/storage');

            const alertRecord = {
                id: alertData.alertId,
                symbol: alertData.symbol,
                type: alertData.type,
                timestamp: alertData.timestamp,
                received_at: alertData.receivedAt,
                processed_at: new Date().toISOString(),
                processing_time: Date.now() - req.startTime,
                signal_id: signal.id,
                source_ip: req.ip,
                user_agent: req.get('User-Agent'),
                data: alertData,
                signal_data: signal,
                status: 'processed'
            };

            await storage.storeAlert('tradingview', alertRecord);

            logger.debug('Alert stored successfully', {
                alertId: alertData.alertId,
                signalId: signal.id
            });

        } catch (error) {
            logger.error('Failed to store alert', {
                error: error.message,
                alertId: alertData.alertId
            });
            // Don't throw - storage failure shouldn't stop processing
        }
    }

    /**
     * Generate unique alert ID
     */
    generateAlertId() {
        return `tv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Update processing time metrics
     */
    updateProcessingTimeMetrics(processingTime) {
        const currentAvg = this.metrics.averageProcessingTime;
        const totalProcessed = this.metrics.validAlerts;

        this.metrics.averageProcessingTime =
            (currentAvg * (totalProcessed - 1) + processingTime) / totalProcessed;
    }

    /**
     * Get current metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            cacheSize: this.alertCache.size,
            successRate: this.metrics.totalAlerts > 0
                ? (this.metrics.validAlerts / this.metrics.totalAlerts) * 100
                : 0
        };
    }

    /**
     * Start the webhook server
     */
    async start() {
        return new Promise((resolve, reject) => {
            const server = this.app.listen(this.options.port, (error) => {
                if (error) {
                    logger.error('Failed to start webhook server', { error: error.message });
                    reject(error);
                } else {
                    logger.info('TradingView webhook server started', {
                        port: this.options.port,
                        path: this.options.path,
                        rateLimit: this.options.enableRateLimit,
                        signatureValidation: this.options.enableSignatureValidation
                    });
                    resolve(server);
                }
            });
        });
    }

    /**
     * Stop the webhook server
     */
    stop() {
        if (this.server) {
            this.server.close();
            logger.info('TradingView webhook server stopped');
        }
    }
}

module.exports = TradingViewWebhookReceiver;