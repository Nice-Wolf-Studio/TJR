const EventEmitter = require('events');
const { performance } = require('perf_hooks');

/**
 * Alert Manager - Real-time signal processing and smart notification filtering
 * Handles multi-channel delivery with user preferences and backtesting validation
 */
class AlertManager extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            maxAlertsPerMinute: config.maxAlertsPerMinute || 5,
            cooldownPeriod: config.cooldownPeriod || 300000, // 5 minutes
            backtestPeriod: config.backtestPeriod || 7 * 24 * 60 * 60 * 1000, // 7 days
            minConfluenceScore: config.minConfluenceScore || 7,
            enableSmartFiltering: config.enableSmartFiltering !== false,
            ...config
        };

        // Internal state
        this.alertQueue = [];
        this.recentAlerts = new Map(); // symbol -> last alert timestamp
        this.userPreferences = new Map(); // userId -> preferences
        this.alertHistory = new Map(); // alertId -> alert data
        this.deliveryConfirmations = new Map(); // alertId -> delivery status
        this.processingMetrics = {
            processed: 0,
            filtered: 0,
            delivered: 0,
            failed: 0
        };

        // Start processing queue
        this.startProcessing();

        // Clean up old data periodically
        setInterval(() => this.cleanup(), 60000); // Every minute
    }

    /**
     * Process incoming trading signals in real-time
     */
    async processSignal(signal) {
        const startTime = performance.now();

        try {
            // Validate signal structure
            if (!this.validateSignal(signal)) {
                this.processingMetrics.filtered++;
                throw new Error('Invalid signal structure');
            }

            // Create alert from signal
            const alert = await this.createAlert(signal);

            // Apply smart filtering
            if (this.config.enableSmartFiltering && !await this.passesSmartFilter(alert)) {
                this.processingMetrics.filtered++;
                return { success: false, reason: 'Filtered by smart filter' };
            }

            // Check rate limiting
            if (!this.checkRateLimit(alert.symbol)) {
                this.processingMetrics.filtered++;
                return { success: false, reason: 'Rate limited' };
            }

            // Add to processing queue
            this.alertQueue.push(alert);
            this.processingMetrics.processed++;

            const processingTime = performance.now() - startTime;
            this.emit('signal_processed', { alert, processingTime });

            return { success: true, alertId: alert.id };

        } catch (error) {
            this.processingMetrics.failed++;
            this.emit('processing_error', { signal, error: error.message });
            throw error;
        }
    }

    /**
     * Validate incoming signal structure
     */
    validateSignal(signal) {
        const required = ['symbol', 'type', 'price', 'timestamp', 'confluence'];
        const optional = ['stopLoss', 'takeProfit', 'riskReward', 'session', 'setup'];

        // Check required fields
        for (const field of required) {
            if (!signal.hasOwnProperty(field) || signal[field] === undefined) {
                return false;
            }
        }

        // Validate data types
        if (typeof signal.symbol !== 'string' || signal.symbol.length === 0) return false;
        if (!['BUY', 'SELL'].includes(signal.type.toUpperCase())) return false;
        if (typeof signal.price !== 'number' || signal.price <= 0) return false;
        if (!Number.isInteger(signal.timestamp) || signal.timestamp <= 0) return false;
        if (typeof signal.confluence !== 'number' || signal.confluence < 0) return false;

        return true;
    }

    /**
     * Create structured alert from signal
     */
    async createAlert(signal) {
        const alertId = this.generateAlertId();
        const timestamp = Date.now();

        const alert = {
            id: alertId,
            symbol: signal.symbol.toUpperCase(),
            type: signal.type.toUpperCase(),
            price: parseFloat(signal.price.toFixed(5)),
            stopLoss: signal.stopLoss ? parseFloat(signal.stopLoss.toFixed(5)) : null,
            takeProfit: signal.takeProfit ? parseFloat(signal.takeProfit.toFixed(5)) : null,
            riskReward: signal.riskReward || null,
            confluence: signal.confluence,
            session: signal.session || this.getCurrentSession(),
            setup: signal.setup || 'STANDARD',
            timestamp: timestamp,
            originalSignal: signal,
            status: 'PENDING',
            deliveryAttempts: 0,
            maxDeliveryAttempts: 3
        };

        // Store in history
        this.alertHistory.set(alertId, alert);

        return alert;
    }

    /**
     * Smart filtering based on confluence, timing, and historical performance
     */
    async passesSmartFilter(alert) {
        try {
            // Minimum confluence score check
            if (alert.confluence < this.config.minConfluenceScore) {
                return false;
            }

            // Check session timing
            if (!this.isOptimalSession(alert.session)) {
                return false;
            }

            // Check for duplicate setup within cooldown period
            if (this.isDuplicateSetup(alert)) {
                return false;
            }

            // Validate against backtesting performance
            const backtestScore = await this.getBacktestScore(alert);
            if (backtestScore < 0.6) { // 60% minimum success rate
                return false;
            }

            return true;

        } catch (error) {
            // If filtering fails, err on the side of allowing the alert
            this.emit('filter_error', { alert, error: error.message });
            return true;
        }
    }

    /**
     * Check if current session is optimal for trading
     */
    isOptimalSession(session) {
        const optimalSessions = ['LONDON', 'NEW_YORK', 'LONDON_NY_OVERLAP'];
        return optimalSessions.includes(session);
    }

    /**
     * Check for duplicate setup within cooldown period
     */
    isDuplicateSetup(alert) {
        const key = `${alert.symbol}_${alert.setup}`;
        const lastAlert = this.recentAlerts.get(key);

        if (lastAlert && (Date.now() - lastAlert) < this.config.cooldownPeriod) {
            return true;
        }

        this.recentAlerts.set(key, Date.now());
        return false;
    }

    /**
     * Get backtesting performance score for similar setups
     */
    async getBacktestScore(alert) {
        try {
            // This would integrate with your backtesting system
            // For now, return a mock score based on confluence
            const baseScore = Math.min(alert.confluence / 10, 1);

            // Adjust based on setup type (this would come from historical data)
            const setupModifiers = {
                'LIQUIDITY_GRAB': 0.85,
                'BOS_CONFIRMATION': 0.80,
                'FAIR_VALUE_GAP': 0.75,
                'STANDARD': 0.70
            };

            const modifier = setupModifiers[alert.setup] || 0.70;
            return baseScore * modifier;

        } catch (error) {
            // Default to allowing if backtesting fails
            return 0.7;
        }
    }

    /**
     * Check rate limiting for symbol
     */
    checkRateLimit(symbol) {
        const now = Date.now();
        const windowStart = now - 60000; // 1 minute window

        let recentCount = 0;
        for (const [alertId, alert] of this.alertHistory) {
            if (alert.symbol === symbol &&
                alert.timestamp > windowStart &&
                alert.status !== 'FILTERED') {
                recentCount++;
            }
        }

        return recentCount < this.config.maxAlertsPerMinute;
    }

    /**
     * Get current trading session
     */
    getCurrentSession() {
        const now = new Date();
        const utcHour = now.getUTCHours();

        // Session definitions (UTC)
        if (utcHour >= 2 && utcHour < 8) return 'SYDNEY';
        if (utcHour >= 8 && utcHour < 12) return 'LONDON';
        if (utcHour >= 12 && utcHour < 13) return 'LONDON_NY_OVERLAP';
        if (utcHour >= 13 && utcHour < 21) return 'NEW_YORK';
        return 'ASIAN_QUIET';
    }

    /**
     * Start processing alert queue
     */
    startProcessing() {
        setInterval(async () => {
            if (this.alertQueue.length > 0) {
                const alert = this.alertQueue.shift();
                await this.processAlert(alert);
            }
        }, 1000); // Process every second
    }

    /**
     * Process individual alert
     */
    async processAlert(alert) {
        try {
            // Get eligible users for this alert
            const eligibleUsers = this.getEligibleUsers(alert);

            if (eligibleUsers.length === 0) {
                alert.status = 'NO_RECIPIENTS';
                return;
            }

            // Prepare delivery
            alert.status = 'DELIVERING';
            alert.recipients = eligibleUsers;

            // Emit for delivery
            this.emit('alert_ready', alert);

            // Track delivery attempt
            alert.deliveryAttempts++;

        } catch (error) {
            alert.status = 'PROCESSING_ERROR';
            alert.error = error.message;
            this.emit('processing_error', { alert, error: error.message });
        }
    }

    /**
     * Get users eligible to receive this alert
     */
    getEligibleUsers(alert) {
        const eligible = [];

        for (const [userId, preferences] of this.userPreferences) {
            if (this.isUserEligible(userId, alert, preferences)) {
                eligible.push({ userId, preferences });
            }
        }

        return eligible;
    }

    /**
     * Check if user is eligible for alert
     */
    isUserEligible(userId, alert, preferences) {
        // Check if user wants alerts for this symbol
        if (preferences.symbols && preferences.symbols.length > 0) {
            if (!preferences.symbols.includes(alert.symbol)) {
                return false;
            }
        }

        // Check minimum confluence requirement
        if (preferences.minConfluence && alert.confluence < preferences.minConfluence) {
            return false;
        }

        // Check session preferences
        if (preferences.sessions && preferences.sessions.length > 0) {
            if (!preferences.sessions.includes(alert.session)) {
                return false;
            }
        }

        // Check setup type preferences
        if (preferences.setups && preferences.setups.length > 0) {
            if (!preferences.setups.includes(alert.setup)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Update user preferences
     */
    updateUserPreferences(userId, preferences) {
        const currentPrefs = this.userPreferences.get(userId) || {};
        const updatedPrefs = { ...currentPrefs, ...preferences };

        // Validate preferences
        if (preferences.minConfluence &&
            (preferences.minConfluence < 0 || preferences.minConfluence > 10)) {
            throw new Error('minConfluence must be between 0 and 10');
        }

        this.userPreferences.set(userId, updatedPrefs);
        this.emit('preferences_updated', { userId, preferences: updatedPrefs });

        return updatedPrefs;
    }

    /**
     * Get user preferences
     */
    getUserPreferences(userId) {
        return this.userPreferences.get(userId) || {
            symbols: [],
            minConfluence: 7,
            sessions: ['LONDON', 'NEW_YORK', 'LONDON_NY_OVERLAP'],
            setups: [],
            deliveryChannels: ['DM'],
            enabled: true
        };
    }

    /**
     * Confirm alert delivery
     */
    confirmDelivery(alertId, userId, status, error = null) {
        const confirmationKey = `${alertId}_${userId}`;
        const confirmation = {
            alertId,
            userId,
            status, // 'SUCCESS', 'FAILED', 'RETRY'
            timestamp: Date.now(),
            error
        };

        this.deliveryConfirmations.set(confirmationKey, confirmation);

        // Update metrics
        if (status === 'SUCCESS') {
            this.processingMetrics.delivered++;
        } else {
            this.processingMetrics.failed++;
        }

        // Update alert status
        const alert = this.alertHistory.get(alertId);
        if (alert) {
            if (status === 'FAILED' && alert.deliveryAttempts < alert.maxDeliveryAttempts) {
                // Retry delivery
                setTimeout(() => {
                    this.alertQueue.unshift(alert);
                }, 5000); // Retry after 5 seconds
            } else {
                alert.status = status === 'SUCCESS' ? 'DELIVERED' : 'FAILED';
            }
        }

        this.emit('delivery_confirmed', confirmation);
    }

    /**
     * Get alert by ID
     */
    getAlert(alertId) {
        return this.alertHistory.get(alertId);
    }

    /**
     * Get processing metrics
     */
    getMetrics() {
        const totalAlerts = this.alertHistory.size;
        const queueLength = this.alertQueue.length;

        return {
            ...this.processingMetrics,
            totalAlerts,
            queueLength,
            successRate: this.processingMetrics.delivered /
                        (this.processingMetrics.delivered + this.processingMetrics.failed) || 0,
            filterRate: this.processingMetrics.filtered / totalAlerts || 0
        };
    }

    /**
     * Generate unique alert ID
     */
    generateAlertId() {
        return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Cleanup old data
     */
    cleanup() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        // Clean up old alerts
        for (const [alertId, alert] of this.alertHistory) {
            if (now - alert.timestamp > maxAge) {
                this.alertHistory.delete(alertId);
            }
        }

        // Clean up old delivery confirmations
        for (const [key, confirmation] of this.deliveryConfirmations) {
            if (now - confirmation.timestamp > maxAge) {
                this.deliveryConfirmations.delete(key);
            }
        }

        // Clean up old recent alerts
        for (const [key, timestamp] of this.recentAlerts) {
            if (now - timestamp > this.config.cooldownPeriod) {
                this.recentAlerts.delete(key);
            }
        }
    }

    /**
     * Validate alert backtesting performance
     */
    async validateAlertBacktest(alert, historicalData) {
        try {
            // This would run backtesting validation
            // For now, return mock validation based on confluence
            const baseSuccess = alert.confluence >= 8 ? 0.8 : 0.6;
            const variance = (Math.random() - 0.5) * 0.2; // ±10% variance

            return {
                successRate: Math.max(0.3, Math.min(0.95, baseSuccess + variance)),
                sampleSize: 50,
                averageRR: alert.riskReward || 2.0,
                maxDrawdown: 0.15,
                validated: true
            };

        } catch (error) {
            return {
                successRate: 0.5,
                validated: false,
                error: error.message
            };
        }
    }

    /**
     * Get alert history for analysis
     */
    getAlertHistory(filters = {}) {
        const alerts = Array.from(this.alertHistory.values());

        return alerts.filter(alert => {
            if (filters.symbol && alert.symbol !== filters.symbol) return false;
            if (filters.setup && alert.setup !== filters.setup) return false;
            if (filters.session && alert.session !== filters.session) return false;
            if (filters.minConfluence && alert.confluence < filters.minConfluence) return false;
            if (filters.status && alert.status !== filters.status) return false;
            if (filters.startTime && alert.timestamp < filters.startTime) return false;
            if (filters.endTime && alert.timestamp > filters.endTime) return false;

            return true;
        }).sort((a, b) => b.timestamp - a.timestamp);
    }
}

module.exports = AlertManager;