/**
 * Signal Processor
 * Converts TradingView webhook signals to internal format,
 * validates signal quality, and integrates with the analysis engine.
 *
 * Features:
 * - Signal format conversion and normalization
 * - Quality validation and confluence scoring
 * - Integration with analysis engine
 * - Signal queuing and priority processing
 * - Performance tracking and optimization
 */

const logger = require('../utils/logger');
const TradingAnalysisEngine = require('../analysis/engine');
const config = require('../../config/environment');

class SignalProcessor {
    constructor(options = {}) {
        this.options = {
            // Signal processing settings
            enableQualityValidation: options.enableQualityValidation !== false,
            minConfidenceThreshold: options.minConfidenceThreshold || 0.6,
            minConfluenceScore: options.minConfluenceScore || 5.0,
            maxSignalsPerSymbol: options.maxSignalsPerSymbol || 10,

            // Queue settings
            enableQueueing: options.enableQueueing !== false,
            queueMaxSize: options.queueMaxSize || 1000,
            processingBatchSize: options.processingBatchSize || 10,
            processingInterval: options.processingInterval || 1000, // 1 second

            // Analysis engine integration
            enableAnalysisEngine: options.enableAnalysisEngine !== false,
            analysisTimeout: options.analysisTimeout || 30000, // 30 seconds
            enableTriggerUpdates: options.enableTriggerUpdates !== false,

            // Signal filtering
            enableDuplicateFiltering: options.enableDuplicateFiltering !== false,
            duplicateTimeWindow: options.duplicateTimeWindow || 300000, // 5 minutes
            enableTimeframeFiltering: options.enableTimeframeFiltering !== false,
            allowedTimeframes: options.allowedTimeframes || ['1m', '5m', '15m', '1h', '4h', '1d'],

            // Performance tracking
            enablePerformanceTracking: options.enablePerformanceTracking !== false,
            performanceWindow: options.performanceWindow || 24, // hours

            ...options
        };

        // Initialize analysis engine
        if (this.options.enableAnalysisEngine) {
            this.analysisEngine = new TradingAnalysisEngine(options.analysisEngine);
        }

        // Signal processing queue
        this.signalQueue = [];
        this.processing = false;
        this.processedSignals = new Map(); // For duplicate detection
        this.activeSignals = new Map(); // Currently active signals per symbol

        // Performance metrics
        this.metrics = {
            totalProcessed: 0,
            validSignals: 0,
            invalidSignals: 0,
            duplicateSignals: 0,
            queuedSignals: 0,
            averageProcessingTime: 0,
            errorRate: 0,
            lastProcessingTime: Date.now()
        };

        // Start queue processing if enabled
        if (this.options.enableQueueing) {
            this.startQueueProcessor();
        }
    }

    /**
     * Process a TradingView signal
     * @param {Object} alertData - Raw alert data from TradingView
     * @returns {Object} Processed signal
     */
    async processSignal(alertData) {
        const startTime = Date.now();

        try {
            logger.debug('Processing TradingView signal', {
                symbol: alertData.symbol,
                type: alertData.type,
                alertId: alertData.alertId
            });

            // Validate and normalize the signal
            const normalizedSignal = this.normalizeSignal(alertData);
            if (!normalizedSignal) {
                throw new Error('Signal normalization failed');
            }

            // Apply quality validation
            if (this.options.enableQualityValidation) {
                const qualityResult = await this.validateSignalQuality(normalizedSignal);
                if (!qualityResult.isValid) {
                    this.metrics.invalidSignals++;
                    throw new Error(`Signal quality validation failed: ${qualityResult.reason}`);
                }
                normalizedSignal.qualityScore = qualityResult.score;
            }

            // Check for duplicates
            if (this.options.enableDuplicateFiltering) {
                const isDuplicate = this.checkDuplicateSignal(normalizedSignal);
                if (isDuplicate) {
                    this.metrics.duplicateSignals++;
                    logger.info('Duplicate signal filtered', {
                        symbol: normalizedSignal.symbol,
                        type: normalizedSignal.type
                    });
                    return this.createDuplicateResponse(normalizedSignal);
                }
            }

            // Add to processing queue or process immediately
            if (this.options.enableQueueing) {
                return await this.queueSignal(normalizedSignal);
            } else {
                return await this.processSignalImmediate(normalizedSignal);
            }

        } catch (error) {
            logger.error('Signal processing error', {
                error: error.message,
                alertData: alertData,
                processingTime: Date.now() - startTime
            });

            this.metrics.invalidSignals++;
            this.updateErrorRate();

            return this.createErrorResponse(alertData, error);
        } finally {
            this.updateProcessingMetrics(Date.now() - startTime);
        }
    }

    /**
     * Normalize TradingView alert data to internal signal format
     * @param {Object} alertData - Raw alert data
     * @returns {Object} Normalized signal
     */
    normalizeSignal(alertData) {
        try {
            const signal = {
                // Core identification
                id: this.generateSignalId(),
                alertId: alertData.alertId,
                source: 'tradingview',
                timestamp: Date.now(),
                receivedAt: alertData.receivedAt,

                // Market data
                symbol: this.normalizeSymbol(alertData.symbol),
                exchange: alertData.exchange,
                price: alertData.price || alertData.close,
                timeframe: this.normalizeTimeframe(alertData.timeframe),

                // Signal classification
                type: this.classifySignalType(alertData),
                action: this.normalizeAction(alertData.action || alertData.signal),
                direction: this.normalizeDirection(alertData.direction),
                confidence: this.normalizeConfidence(alertData.confidence),
                strength: alertData.strength || 0,

                // Technical analysis
                technicalData: {
                    rsi: alertData.rsi,
                    macd: alertData.macd,
                    price: {
                        open: alertData.open,
                        high: alertData.high,
                        low: alertData.low,
                        close: alertData.close,
                        volume: alertData.volume
                    }
                },

                // Confluence information
                confluence: this.normalizeConfluence(alertData.confluence),

                // Liquidity and structure
                liquidityData: {
                    level: alertData.liquidityLevel,
                    type: alertData.liquidityType,
                    structureBreak: alertData.structureBreak === true,
                    bosType: alertData.bosType,
                    fvgDetected: alertData.fvgDetected === true
                },

                // Session data
                sessionData: {
                    session: alertData.session,
                    high: alertData.sessionHigh,
                    low: alertData.sessionLow
                },

                // Risk management
                riskData: {
                    stopLoss: alertData.stopLoss,
                    takeProfit: alertData.takeProfit,
                    riskReward: alertData.riskReward
                },

                // Strategy information
                strategy: alertData.strategy,
                version: alertData.version || '1.0',

                // Processing metadata
                status: 'pending',
                priority: this.calculateSignalPriority(alertData),
                expiresAt: Date.now() + (alertData.timeout || 3600000), // 1 hour default

                // Raw data for reference
                rawData: alertData.raw || alertData
            };

            // Remove undefined values
            this.cleanObject(signal);

            logger.debug('Signal normalized successfully', {
                id: signal.id,
                symbol: signal.symbol,
                type: signal.type,
                priority: signal.priority
            });

            return signal;

        } catch (error) {
            logger.error('Signal normalization failed', {
                error: error.message,
                alertData: alertData
            });
            return null;
        }
    }

    /**
     * Validate signal quality and confluence
     * @param {Object} signal - Normalized signal
     * @returns {Object} Validation result
     */
    async validateSignalQuality(signal) {
        try {
            const validationResult = {
                isValid: true,
                score: 0,
                factors: [],
                warnings: [],
                reason: null
            };

            // Basic validation
            if (!signal.symbol || !signal.type || !signal.price) {
                return {
                    isValid: false,
                    reason: 'Missing required signal fields',
                    score: 0
                };
            }

            // Timeframe validation
            if (this.options.enableTimeframeFiltering) {
                if (!this.options.allowedTimeframes.includes(signal.timeframe)) {
                    return {
                        isValid: false,
                        reason: `Timeframe ${signal.timeframe} not allowed`,
                        score: 0
                    };
                }
                validationResult.factors.push('valid_timeframe');
                validationResult.score += 1;
            }

            // Confidence validation
            if (signal.confidence && signal.confidence >= this.options.minConfidenceThreshold) {
                validationResult.factors.push('high_confidence');
                validationResult.score += signal.confidence * 2;
            } else if (signal.confidence < this.options.minConfidenceThreshold) {
                validationResult.warnings.push('low_confidence');
            }

            // Confluence validation
            if (signal.confluence && signal.confluence.score >= this.options.minConfluenceScore) {
                validationResult.factors.push('high_confluence');
                validationResult.score += signal.confluence.score * 0.5;
            }

            // Technical indicators validation
            if (signal.technicalData) {
                let techScore = 0;
                let techFactors = 0;

                if (signal.technicalData.rsi) {
                    // RSI extreme levels
                    if (signal.technicalData.rsi <= 30 || signal.technicalData.rsi >= 70) {
                        techScore += 1;
                        techFactors++;
                    }
                }

                if (signal.technicalData.macd) {
                    // MACD signal confirmation
                    if (signal.technicalData.macd.line && signal.technicalData.macd.signal) {
                        if ((signal.direction === 'bullish' && signal.technicalData.macd.line > signal.technicalData.macd.signal) ||
                            (signal.direction === 'bearish' && signal.technicalData.macd.line < signal.technicalData.macd.signal)) {
                            techScore += 1;
                            techFactors++;
                        }
                    }
                }

                if (techFactors > 0) {
                    validationResult.factors.push('technical_confirmation');
                    validationResult.score += techScore;
                }
            }

            // Liquidity and structure validation
            if (signal.liquidityData) {
                if (signal.liquidityData.structureBreak) {
                    validationResult.factors.push('structure_break');
                    validationResult.score += 2;
                }

                if (signal.liquidityData.level && signal.liquidityData.level > 0) {
                    validationResult.factors.push('liquidity_level');
                    validationResult.score += 1;
                }

                if (signal.liquidityData.fvgDetected) {
                    validationResult.factors.push('fvg_detected');
                    validationResult.score += 1.5;
                }
            }

            // Session validation
            if (signal.sessionData && signal.sessionData.session) {
                validationResult.factors.push('session_context');
                validationResult.score += 0.5;
            }

            // Risk management validation
            if (signal.riskData) {
                if (signal.riskData.stopLoss && signal.riskData.takeProfit) {
                    const rr = Math.abs(signal.riskData.takeProfit - signal.price) /
                              Math.abs(signal.price - signal.riskData.stopLoss);
                    if (rr >= 1.5) {
                        validationResult.factors.push('good_risk_reward');
                        validationResult.score += 1;
                    }
                }
            }

            // Final validation
            const minScore = this.options.minConfidenceThreshold * 5; // Scale to match scoring
            if (validationResult.score < minScore) {
                validationResult.isValid = false;
                validationResult.reason = `Quality score ${validationResult.score.toFixed(2)} below minimum ${minScore}`;
            }

            logger.debug('Signal quality validation completed', {
                signalId: signal.id,
                isValid: validationResult.isValid,
                score: validationResult.score,
                factors: validationResult.factors.length,
                warnings: validationResult.warnings.length
            });

            return validationResult;

        } catch (error) {
            logger.error('Signal quality validation error', {
                error: error.message,
                signalId: signal.id
            });

            return {
                isValid: false,
                reason: 'Validation error: ' + error.message,
                score: 0
            };
        }
    }

    /**
     * Check for duplicate signals
     * @param {Object} signal - Normalized signal
     * @returns {boolean} True if duplicate
     */
    checkDuplicateSignal(signal) {
        const signalKey = this.generateSignalKey(signal);
        const now = Date.now();

        // Clean up expired entries
        for (const [key, timestamp] of this.processedSignals.entries()) {
            if (now - timestamp > this.options.duplicateTimeWindow) {
                this.processedSignals.delete(key);
            }
        }

        // Check if signal already processed
        if (this.processedSignals.has(signalKey)) {
            return true;
        }

        // Add to processed signals
        this.processedSignals.set(signalKey, now);
        return false;
    }

    /**
     * Generate signal key for duplicate detection
     * @param {Object} signal - Normalized signal
     * @returns {string} Signal key
     */
    generateSignalKey(signal) {
        return `${signal.symbol}_${signal.type}_${signal.timeframe}_${signal.direction}_${Math.floor(signal.timestamp / 60000)}`;
    }

    /**
     * Queue signal for batch processing
     * @param {Object} signal - Normalized signal
     * @returns {Object} Queue response
     */
    async queueSignal(signal) {
        if (this.signalQueue.length >= this.options.queueMaxSize) {
            // Remove oldest signal to make room
            const removed = this.signalQueue.shift();
            logger.warn('Signal queue full, removed oldest signal', {
                removedSignal: removed.id,
                newSignal: signal.id
            });
        }

        // Insert based on priority
        const insertIndex = this.findInsertionIndex(signal.priority);
        this.signalQueue.splice(insertIndex, 0, signal);

        this.metrics.queuedSignals++;

        logger.debug('Signal queued for processing', {
            signalId: signal.id,
            symbol: signal.symbol,
            priority: signal.priority,
            queueSize: this.signalQueue.length,
            position: insertIndex
        });

        return {
            status: 'queued',
            id: signal.id,
            queuePosition: insertIndex,
            queueSize: this.signalQueue.length,
            estimatedProcessingTime: insertIndex * (this.options.processingInterval / this.options.processingBatchSize)
        };
    }

    /**
     * Process signal immediately without queueing
     * @param {Object} signal - Normalized signal
     * @returns {Object} Processing result
     */
    async processSignalImmediate(signal) {
        return await this.executeSignalProcessing(signal);
    }

    /**
     * Execute the actual signal processing
     * @param {Object} signal - Normalized signal
     * @returns {Object} Processing result
     */
    async executeSignalProcessing(signal) {
        const startTime = Date.now();

        try {
            logger.info('Executing signal processing', {
                signalId: signal.id,
                symbol: signal.symbol,
                type: signal.type
            });

            signal.status = 'processing';

            // Integrate with analysis engine if enabled
            let analysisResult = null;
            if (this.options.enableAnalysisEngine && this.analysisEngine) {
                analysisResult = await this.triggerAnalysisUpdate(signal);
            }

            // Update active signals tracking
            this.updateActiveSignals(signal);

            // Trigger any configured actions
            const actionResults = await this.triggerSignalActions(signal, analysisResult);

            signal.status = 'processed';
            signal.processedAt = Date.now();
            signal.processingTime = Date.now() - startTime;

            this.metrics.validSignals++;

            const result = {
                status: 'success',
                id: signal.id,
                symbol: signal.symbol,
                type: signal.type,
                processingTime: signal.processingTime,
                analysisTriggered: !!analysisResult,
                actionsTriggered: actionResults.length,
                signal: signal
            };

            logger.info('Signal processing completed', result);

            return result;

        } catch (error) {
            signal.status = 'error';
            signal.error = error.message;
            signal.processingTime = Date.now() - startTime;

            logger.error('Signal processing failed', {
                error: error.message,
                signalId: signal.id,
                symbol: signal.symbol,
                processingTime: signal.processingTime
            });

            throw error;
        }
    }

    /**
     * Trigger analysis engine update with signal data
     * @param {Object} signal - Processed signal
     * @returns {Object} Analysis result
     */
    async triggerAnalysisUpdate(signal) {
        if (!this.options.enableTriggerUpdates) {
            return null;
        }

        try {
            logger.debug('Triggering analysis engine update', {
                signalId: signal.id,
                symbol: signal.symbol
            });

            // Create mock multi-timeframe data from signal
            const multiTimeframeData = this.createAnalysisDataFromSignal(signal);

            // Trigger analysis
            const analysisPromise = this.analysisEngine.analyzeMarket(
                signal.symbol,
                multiTimeframeData,
                {
                    source: 'webhook',
                    signal: signal,
                    timestamp: signal.timestamp
                }
            );

            // Apply timeout
            const analysisResult = await Promise.race([
                analysisPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Analysis timeout')), this.options.analysisTimeout)
                )
            ]);

            logger.debug('Analysis engine update completed', {
                signalId: signal.id,
                symbol: signal.symbol,
                analysisTime: Date.now() - signal.timestamp
            });

            return analysisResult;

        } catch (error) {
            logger.error('Analysis engine update failed', {
                error: error.message,
                signalId: signal.id,
                symbol: signal.symbol
            });
            return null;
        }
    }

    /**
     * Create analysis data from signal for engine integration
     * @param {Object} signal - Processed signal
     * @returns {Object} Multi-timeframe data
     */
    createAnalysisDataFromSignal(signal) {
        const timeframe = signal.timeframe || '1h';

        // Create synthetic candle from signal data
        const candle = {
            timestamp: signal.timestamp,
            open: signal.technicalData.price.open || signal.price,
            high: signal.technicalData.price.high || signal.price,
            low: signal.technicalData.price.low || signal.price,
            close: signal.technicalData.price.close || signal.price,
            volume: signal.technicalData.price.volume || 0
        };

        return {
            [timeframe]: [candle] // Single candle for immediate analysis
        };
    }

    /**
     * Update active signals tracking
     * @param {Object} signal - Processed signal
     */
    updateActiveSignals(signal) {
        if (!this.activeSignals.has(signal.symbol)) {
            this.activeSignals.set(signal.symbol, []);
        }

        const symbolSignals = this.activeSignals.get(signal.symbol);

        // Add new signal
        symbolSignals.push({
            id: signal.id,
            type: signal.type,
            direction: signal.direction,
            timestamp: signal.timestamp,
            expiresAt: signal.expiresAt,
            price: signal.price
        });

        // Remove expired signals
        const now = Date.now();
        const activeSignals = symbolSignals.filter(s => s.expiresAt > now);

        // Limit active signals per symbol
        while (activeSignals.length > this.options.maxSignalsPerSymbol) {
            activeSignals.shift(); // Remove oldest
        }

        this.activeSignals.set(signal.symbol, activeSignals);
    }

    /**
     * Trigger signal-based actions
     * @param {Object} signal - Processed signal
     * @param {Object} analysisResult - Analysis result if available
     * @returns {Array} Action results
     */
    async triggerSignalActions(signal, analysisResult) {
        const actions = [];

        try {
            // Alert generation action
            if (signal.priority >= 8) { // High priority signals
                actions.push(await this.triggerAlertAction(signal, analysisResult));
            }

            // Additional actions can be added here
            // - Database updates
            // - External notifications
            // - Trading signals to other systems

        } catch (error) {
            logger.error('Signal action trigger failed', {
                error: error.message,
                signalId: signal.id
            });
        }

        return actions.filter(action => action !== null);
    }

    /**
     * Trigger alert action for high-priority signals
     * @param {Object} signal - Processed signal
     * @param {Object} analysisResult - Analysis result
     * @returns {Object} Action result
     */
    async triggerAlertAction(signal, analysisResult) {
        try {
            const alertManager = require('../alerts/manager');

            const alertData = {
                type: 'tradingview_signal',
                symbol: signal.symbol,
                signal: signal,
                analysis: analysisResult,
                priority: 'high',
                timestamp: Date.now()
            };

            await alertManager.createAlert(alertData);

            return {
                type: 'alert',
                status: 'success',
                timestamp: Date.now()
            };

        } catch (error) {
            logger.error('Alert action failed', {
                error: error.message,
                signalId: signal.id
            });
            return null;
        }
    }

    /**
     * Start the queue processor
     */
    startQueueProcessor() {
        this.processing = true;

        const processQueue = async () => {
            if (!this.processing || this.signalQueue.length === 0) {
                setTimeout(processQueue, this.options.processingInterval);
                return;
            }

            try {
                const batch = this.signalQueue.splice(0, this.options.processingBatchSize);

                logger.debug('Processing signal batch', {
                    batchSize: batch.length,
                    remainingQueue: this.signalQueue.length
                });

                // Process batch in parallel
                const processingPromises = batch.map(signal =>
                    this.executeSignalProcessing(signal).catch(error => {
                        logger.error('Batch signal processing error', {
                            error: error.message,
                            signalId: signal.id
                        });
                        return { status: 'error', id: signal.id, error: error.message };
                    })
                );

                await Promise.all(processingPromises);

                this.metrics.lastProcessingTime = Date.now();

            } catch (error) {
                logger.error('Queue processing error', { error: error.message });
            }

            setTimeout(processQueue, this.options.processingInterval);
        };

        processQueue();
        logger.info('Signal queue processor started');
    }

    /**
     * Stop the queue processor
     */
    stopQueueProcessor() {
        this.processing = false;
        logger.info('Signal queue processor stopped');
    }

    // Helper methods for normalization

    normalizeSymbol(symbol) {
        if (!symbol) return null;
        return symbol.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    normalizeTimeframe(timeframe) {
        if (!timeframe) return '1h'; // default

        const tfMap = {
            '1': '1m', '1m': '1m', '1min': '1m',
            '5': '5m', '5m': '5m', '5min': '5m',
            '15': '15m', '15m': '15m', '15min': '15m',
            '60': '1h', '1h': '1h', '1H': '1h', '1hour': '1h',
            '240': '4h', '4h': '4h', '4H': '4h',
            '1440': '1d', '1d': '1d', '1D': '1d', '1day': '1d'
        };

        return tfMap[timeframe.toString()] || '1h';
    }

    classifySignalType(alertData) {
        if (alertData.type) return alertData.type.toLowerCase();

        // Classify based on content
        const message = (alertData.message || '').toLowerCase();
        if (message.includes('confluence')) return 'confluence';
        if (message.includes('liquidity')) return 'liquidity';
        if (message.includes('structure') || message.includes('bos')) return 'structure';
        if (message.includes('fvg') || message.includes('gap')) return 'fvg';
        if (message.includes('session')) return 'session';

        return 'general';
    }

    normalizeAction(action) {
        if (!action) return 'monitor';

        const actionStr = action.toString().toLowerCase();
        if (['buy', 'long', 'bullish'].includes(actionStr)) return 'buy';
        if (['sell', 'short', 'bearish'].includes(actionStr)) return 'sell';
        return 'monitor';
    }

    normalizeDirection(direction) {
        if (!direction) return 'neutral';

        const dirStr = direction.toString().toLowerCase();
        if (['up', 'bull', 'bullish', 'long', 'buy'].includes(dirStr)) return 'bullish';
        if (['down', 'bear', 'bearish', 'short', 'sell'].includes(dirStr)) return 'bearish';
        return 'neutral';
    }

    normalizeConfidence(confidence) {
        if (confidence === undefined || confidence === null) return 0.5;

        const conf = parseFloat(confidence);
        if (isNaN(conf)) return 0.5;

        // Ensure between 0 and 1
        return Math.max(0, Math.min(1, conf));
    }

    normalizeConfluence(confluence) {
        if (!confluence) return null;

        return {
            score: parseFloat(confluence.score) || 0,
            factors: Array.isArray(confluence.factors) ? confluence.factors : [],
            levels: Array.isArray(confluence.levels) ? confluence.levels : []
        };
    }

    calculateSignalPriority(alertData) {
        let priority = 1;

        // Base priority from confidence
        if (alertData.confidence) {
            priority += parseFloat(alertData.confidence) * 5;
        }

        // Confluence boost
        if (alertData.confluence && alertData.confluence.score) {
            priority += Math.min(parseFloat(alertData.confluence.score), 5);
        }

        // Structure break boost
        if (alertData.structureBreak || (alertData.type && alertData.type.includes('structure'))) {
            priority += 2;
        }

        // FVG detection boost
        if (alertData.fvgDetected || (alertData.type && alertData.type.includes('fvg'))) {
            priority += 1.5;
        }

        // Liquidity level boost
        if (alertData.liquidityLevel && parseFloat(alertData.liquidityLevel) > 0) {
            priority += 1;
        }

        // Session context boost
        if (alertData.session) {
            priority += 0.5;
        }

        return Math.min(priority, 10); // Cap at 10
    }

    findInsertionIndex(priority) {
        let left = 0;
        let right = this.signalQueue.length;

        while (left < right) {
            const mid = Math.floor((left + right) / 2);
            if (this.signalQueue[mid].priority >= priority) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }

        return left;
    }

    generateSignalId() {
        return `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    cleanObject(obj) {
        Object.keys(obj).forEach(key => {
            if (obj[key] === undefined || obj[key] === null) {
                delete obj[key];
            } else if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                this.cleanObject(obj[key]);
                if (Object.keys(obj[key]).length === 0) {
                    delete obj[key];
                }
            } else if (Array.isArray(obj[key]) && obj[key].length === 0) {
                delete obj[key];
            } else if (typeof obj[key] === 'number' && isNaN(obj[key])) {
                delete obj[key];
            }
        });
    }

    createDuplicateResponse(signal) {
        return {
            status: 'duplicate',
            id: signal.id,
            message: 'Signal already processed',
            originalTimestamp: this.processedSignals.get(this.generateSignalKey(signal))
        };
    }

    createErrorResponse(alertData, error) {
        return {
            status: 'error',
            error: error.message,
            alertId: alertData.alertId,
            timestamp: Date.now()
        };
    }

    updateProcessingMetrics(processingTime) {
        this.metrics.totalProcessed++;

        const currentAvg = this.metrics.averageProcessingTime;
        const total = this.metrics.totalProcessed;

        this.metrics.averageProcessingTime =
            (currentAvg * (total - 1) + processingTime) / total;
    }

    updateErrorRate() {
        const total = this.metrics.totalProcessed;
        const errors = this.metrics.invalidSignals;
        this.metrics.errorRate = total > 0 ? (errors / total) * 100 : 0;
    }

    /**
     * Get processing metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            queueSize: this.signalQueue.length,
            activeSignalsCount: Array.from(this.activeSignals.values())
                .reduce((sum, signals) => sum + signals.length, 0),
            processedSignalsCount: this.processedSignals.size
        };
    }

    /**
     * Get active signals for a symbol
     */
    getActiveSignals(symbol) {
        return this.activeSignals.get(symbol) || [];
    }

    /**
     * Clear expired signals and processed entries
     */
    cleanup() {
        const now = Date.now();

        // Clean processed signals map
        for (const [key, timestamp] of this.processedSignals.entries()) {
            if (now - timestamp > this.options.duplicateTimeWindow) {
                this.processedSignals.delete(key);
            }
        }

        // Clean active signals
        for (const [symbol, signals] of this.activeSignals.entries()) {
            const activeSignals = signals.filter(s => s.expiresAt > now);
            if (activeSignals.length === 0) {
                this.activeSignals.delete(symbol);
            } else {
                this.activeSignals.set(symbol, activeSignals);
            }
        }

        logger.debug('Signal processor cleanup completed', {
            processedSignalsCount: this.processedSignals.size,
            activeSignalsCount: Array.from(this.activeSignals.values())
                .reduce((sum, signals) => sum + signals.length, 0)
        });
    }
}

module.exports = SignalProcessor;