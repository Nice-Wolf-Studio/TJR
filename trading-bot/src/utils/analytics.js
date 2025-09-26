/**
 * Performance Analytics - Comprehensive trading performance tracking and analysis
 * Win rate tracking, R multiple analysis, and optimal session identification
 */
class PerformanceAnalytics {
    constructor(config = {}) {
        this.config = {
            // Analysis periods
            analysisWindow: config.analysisWindow || 90, // days
            minTradesForAnalysis: config.minTradesForAnalysis || 10,

            // Performance thresholds
            excellentWinRate: config.excellentWinRate || 0.75, // 75%
            goodWinRate: config.goodWinRate || 0.65, // 65%
            acceptableWinRate: config.acceptableWinRate || 0.55, // 55%

            // R multiple thresholds
            excellentAvgR: config.excellentAvgR || 1.5,
            goodAvgR: config.goodAvgR || 1.0,
            acceptableAvgR: config.acceptableAvgR || 0.5,

            // Drawdown limits
            maxAcceptableDrawdown: config.maxAcceptableDrawdown || 0.20, // 20%
            warningDrawdown: config.warningDrawdown || 0.15, // 15%

            ...config
        };

        // Data storage
        this.trades = new Map(); // tradeId -> trade data
        this.dailyMetrics = new Map(); // date -> daily metrics
        this.sessionMetrics = new Map(); // session -> metrics
        this.setupMetrics = new Map(); // setupType -> metrics
        this.pairMetrics = new Map(); // pair -> metrics

        // Performance tracking
        this.performanceHistory = [];
        this.drawdownPeriods = [];
        this.optimalConditions = new Map();
    }

    /**
     * Record a completed trade
     */
    recordTrade(trade) {
        const {
            id,
            symbol,
            setupType,
            session,
            entryTime,
            exitTime,
            entryPrice,
            exitPrice,
            direction,
            positionSize,
            pnl,
            pnlR, // P&L in R multiples
            maxFavorableExcursion,
            maxAdverseExcursion,
            confluence,
            holdTime,
            commission = 0,
            metadata = {}
        } = trade;

        // Validate trade data
        if (!this.validateTradeData(trade)) {
            throw new Error('Invalid trade data provided');
        }

        const tradeRecord = {
            id,
            symbol: symbol.toUpperCase(),
            setupType,
            session,
            entryTime: new Date(entryTime),
            exitTime: new Date(exitTime),
            entryPrice: parseFloat(entryPrice),
            exitPrice: parseFloat(exitPrice),
            direction: direction.toUpperCase(),
            positionSize: parseFloat(positionSize),
            pnl: parseFloat(pnl),
            pnlR: parseFloat(pnlR),
            netPnl: parseFloat(pnl) - parseFloat(commission),
            maxFavorableExcursion: parseFloat(maxFavorableExcursion || 0),
            maxAdverseExcursion: parseFloat(maxAdverseExcursion || 0),
            confluence: parseFloat(confluence),
            holdTime: parseInt(holdTime), // minutes
            commission: parseFloat(commission),
            isWinner: parseFloat(pnlR) > 0,
            outcome: parseFloat(pnlR) > 0 ? 'WIN' : 'LOSS',
            quality: this.assessTradeQuality(trade),
            timestamp: Date.now(),
            ...metadata
        };

        // Store trade
        this.trades.set(id, tradeRecord);

        // Update metrics
        this.updateDailyMetrics(tradeRecord);
        this.updateSessionMetrics(tradeRecord);
        this.updateSetupMetrics(tradeRecord);
        this.updatePairMetrics(tradeRecord);
        this.updatePerformanceHistory(tradeRecord);

        // Analyze for insights
        this.analyzeTradePatterns(tradeRecord);

        return tradeRecord;
    }

    /**
     * Validate trade data
     */
    validateTradeData(trade) {
        const required = [
            'id', 'symbol', 'setupType', 'session', 'entryTime', 'exitTime',
            'entryPrice', 'exitPrice', 'direction', 'pnl', 'pnlR'
        ];

        for (const field of required) {
            if (!trade.hasOwnProperty(field) || trade[field] === undefined) {
                return false;
            }
        }

        // Validate data types
        if (typeof trade.pnlR !== 'number') return false;
        if (!['BUY', 'SELL'].includes(trade.direction.toUpperCase())) return false;
        if (new Date(trade.exitTime) <= new Date(trade.entryTime)) return false;

        return true;
    }

    /**
     * Assess trade quality
     */
    assessTradeQuality(trade) {
        let score = 0;

        // P&L quality
        if (trade.pnlR >= 3) score += 3;
        else if (trade.pnlR >= 2) score += 2;
        else if (trade.pnlR >= 1) score += 1;
        else if (trade.pnlR >= 0) score += 0;
        else score -= Math.abs(trade.pnlR);

        // Confluence quality
        if (trade.confluence >= 9) score += 2;
        else if (trade.confluence >= 8) score += 1;
        else if (trade.confluence < 6) score -= 1;

        // Execution quality (based on MAE/MFE if available)
        if (trade.maxAdverseExcursion !== undefined) {
            const maeRatio = trade.maxAdverseExcursion / Math.abs(trade.pnl || 1);
            if (maeRatio < 0.5) score += 1; // Good execution
            else if (maeRatio > 2) score -= 1; // Poor execution
        }

        if (score >= 4) return 'EXCELLENT';
        if (score >= 2) return 'GOOD';
        if (score >= 0) return 'ACCEPTABLE';
        return 'POOR';
    }

    /**
     * Update daily metrics
     */
    updateDailyMetrics(trade) {
        const date = trade.entryTime.toISOString().split('T')[0];

        if (!this.dailyMetrics.has(date)) {
            this.dailyMetrics.set(date, {
                date,
                totalTrades: 0,
                winningTrades: 0,
                losingTrades: 0,
                totalPnL: 0,
                totalPnLR: 0,
                bestTrade: 0,
                worstTrade: 0,
                totalVolume: 0,
                commission: 0,
                trades: []
            });
        }

        const metrics = this.dailyMetrics.get(date);

        metrics.totalTrades++;
        metrics.totalPnL += trade.netPnl;
        metrics.totalPnLR += trade.pnlR;
        metrics.totalVolume += trade.positionSize;
        metrics.commission += trade.commission;
        metrics.trades.push(trade.id);

        if (trade.isWinner) {
            metrics.winningTrades++;
            metrics.bestTrade = Math.max(metrics.bestTrade, trade.pnlR);
        } else {
            metrics.losingTrades++;
            metrics.worstTrade = Math.min(metrics.worstTrade, trade.pnlR);
        }

        // Update calculated metrics
        metrics.winRate = metrics.winningTrades / metrics.totalTrades;
        metrics.averageR = metrics.totalPnLR / metrics.totalTrades;
        metrics.profitFactor = this.calculateProfitFactor(metrics.trades.map(id => this.trades.get(id)));

        this.dailyMetrics.set(date, metrics);
    }

    /**
     * Update session metrics
     */
    updateSessionMetrics(trade) {
        if (!this.sessionMetrics.has(trade.session)) {
            this.sessionMetrics.set(trade.session, {
                session: trade.session,
                totalTrades: 0,
                winningTrades: 0,
                totalPnLR: 0,
                bestStreak: 0,
                currentStreak: 0,
                trades: [],
                pairs: new Set(),
                setups: new Map()
            });
        }

        const metrics = this.sessionMetrics.get(trade.session);

        metrics.totalTrades++;
        metrics.totalPnLR += trade.pnlR;
        metrics.trades.push(trade.id);
        metrics.pairs.add(trade.symbol);

        // Update setup tracking within session
        if (!metrics.setups.has(trade.setupType)) {
            metrics.setups.set(trade.setupType, { count: 0, winRate: 0, totalR: 0 });
        }
        const setupData = metrics.setups.get(trade.setupType);
        setupData.count++;
        setupData.totalR += trade.pnlR;

        if (trade.isWinner) {
            metrics.winningTrades++;
            metrics.currentStreak = metrics.currentStreak >= 0 ? metrics.currentStreak + 1 : 1;
            setupData.winRate = (setupData.winRate * (setupData.count - 1) + 1) / setupData.count;
        } else {
            metrics.currentStreak = metrics.currentStreak <= 0 ? metrics.currentStreak - 1 : -1;
        }

        metrics.bestStreak = Math.max(metrics.bestStreak, Math.abs(metrics.currentStreak));
        metrics.winRate = metrics.winningTrades / metrics.totalTrades;
        metrics.averageR = metrics.totalPnLR / metrics.totalTrades;

        this.sessionMetrics.set(trade.session, metrics);
    }

    /**
     * Update setup type metrics
     */
    updateSetupMetrics(trade) {
        if (!this.setupMetrics.has(trade.setupType)) {
            this.setupMetrics.set(trade.setupType, {
                setupType: trade.setupType,
                totalTrades: 0,
                winningTrades: 0,
                totalPnLR: 0,
                bestTrade: 0,
                worstTrade: 0,
                averageConfluence: 0,
                sessions: new Map(),
                pairs: new Map(),
                trades: []
            });
        }

        const metrics = this.setupMetrics.get(trade.setupType);

        metrics.totalTrades++;
        metrics.totalPnLR += trade.pnlR;
        metrics.trades.push(trade.id);

        // Update session performance within setup
        if (!metrics.sessions.has(trade.session)) {
            metrics.sessions.set(trade.session, { trades: 0, winRate: 0, totalR: 0 });
        }
        const sessionData = metrics.sessions.get(trade.session);
        sessionData.trades++;
        sessionData.totalR += trade.pnlR;

        // Update pair performance within setup
        if (!metrics.pairs.has(trade.symbol)) {
            metrics.pairs.set(trade.symbol, { trades: 0, winRate: 0, totalR: 0 });
        }
        const pairData = metrics.pairs.get(trade.symbol);
        pairData.trades++;
        pairData.totalR += trade.pnlR;

        if (trade.isWinner) {
            metrics.winningTrades++;
            metrics.bestTrade = Math.max(metrics.bestTrade, trade.pnlR);

            sessionData.winRate = (sessionData.winRate * (sessionData.trades - 1) + 1) / sessionData.trades;
            pairData.winRate = (pairData.winRate * (pairData.trades - 1) + 1) / pairData.trades;
        } else {
            metrics.worstTrade = Math.min(metrics.worstTrade, trade.pnlR);
        }

        // Update calculated metrics
        metrics.winRate = metrics.winningTrades / metrics.totalTrades;
        metrics.averageR = metrics.totalPnLR / metrics.totalTrades;
        metrics.averageConfluence = (metrics.averageConfluence * (metrics.totalTrades - 1) + trade.confluence) / metrics.totalTrades;

        this.setupMetrics.set(trade.setupType, metrics);
    }

    /**
     * Update pair metrics
     */
    updatePairMetrics(trade) {
        if (!this.pairMetrics.has(trade.symbol)) {
            this.pairMetrics.set(trade.symbol, {
                symbol: trade.symbol,
                totalTrades: 0,
                winningTrades: 0,
                totalPnLR: 0,
                totalVolume: 0,
                sessions: new Map(),
                setups: new Map(),
                trades: []
            });
        }

        const metrics = this.pairMetrics.get(trade.symbol);

        metrics.totalTrades++;
        metrics.totalPnLR += trade.pnlR;
        metrics.totalVolume += trade.positionSize;
        metrics.trades.push(trade.id);

        if (trade.isWinner) {
            metrics.winningTrades++;
        }

        // Session tracking for pair
        if (!metrics.sessions.has(trade.session)) {
            metrics.sessions.set(trade.session, { trades: 0, totalR: 0 });
        }
        metrics.sessions.get(trade.session).trades++;
        metrics.sessions.get(trade.session).totalR += trade.pnlR;

        // Setup tracking for pair
        if (!metrics.setups.has(trade.setupType)) {
            metrics.setups.set(trade.setupType, { trades: 0, totalR: 0 });
        }
        metrics.setups.get(trade.setupType).trades++;
        metrics.setups.get(trade.setupType).totalR += trade.pnlR;

        // Update calculated metrics
        metrics.winRate = metrics.winningTrades / metrics.totalTrades;
        metrics.averageR = metrics.totalPnLR / metrics.totalTrades;

        this.pairMetrics.set(trade.symbol, metrics);
    }

    /**
     * Update performance history for trend analysis
     */
    updatePerformanceHistory(trade) {
        const historyEntry = {
            timestamp: trade.timestamp,
            tradeId: trade.id,
            cumulativePnLR: this.calculateCumulativePnL(),
            runningWinRate: this.calculateRunningWinRate(),
            currentDrawdown: this.calculateCurrentDrawdown(),
            tradesThisWeek: this.getTradesThisWeek().length,
            consecutiveWins: this.getConsecutiveWins(),
            consecutiveLosses: this.getConsecutiveLosses()
        };

        this.performanceHistory.push(historyEntry);

        // Keep only recent history to manage memory
        if (this.performanceHistory.length > 10000) {
            this.performanceHistory = this.performanceHistory.slice(-5000);
        }
    }

    /**
     * Calculate profit factor
     */
    calculateProfitFactor(trades) {
        if (!trades || trades.length === 0) return 0;

        const winningTrades = trades.filter(trade => trade.isWinner);
        const losingTrades = trades.filter(trade => !trade.isWinner);

        const grossProfit = winningTrades.reduce((sum, trade) => sum + trade.pnlR, 0);
        const grossLoss = Math.abs(losingTrades.reduce((sum, trade) => sum + trade.pnlR, 0));

        return grossLoss > 0 ? grossProfit / grossLoss : 0;
    }

    /**
     * Calculate cumulative P&L
     */
    calculateCumulativePnL() {
        return Array.from(this.trades.values())
            .reduce((sum, trade) => sum + trade.pnlR, 0);
    }

    /**
     * Calculate running win rate
     */
    calculateRunningWinRate() {
        const trades = Array.from(this.trades.values());
        if (trades.length === 0) return 0;

        const winners = trades.filter(trade => trade.isWinner).length;
        return winners / trades.length;
    }

    /**
     * Calculate current drawdown
     */
    calculateCurrentDrawdown() {
        const cumulativePnL = this.calculateCumulativePnL();
        const peakPnL = this.getPeakPnL();

        if (peakPnL <= 0) return 0;

        return Math.max(0, (peakPnL - cumulativePnL) / peakPnL);
    }

    /**
     * Get peak P&L
     */
    getPeakPnL() {
        let peak = 0;
        let running = 0;

        for (const trade of Array.from(this.trades.values()).sort((a, b) => a.timestamp - b.timestamp)) {
            running += trade.pnlR;
            peak = Math.max(peak, running);
        }

        return peak;
    }

    /**
     * Get trades from this week
     */
    getTradesThisWeek() {
        const now = new Date();
        const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
        weekStart.setHours(0, 0, 0, 0);

        return Array.from(this.trades.values())
            .filter(trade => trade.entryTime >= weekStart);
    }

    /**
     * Get consecutive wins count
     */
    getConsecutiveWins() {
        const recentTrades = Array.from(this.trades.values())
            .sort((a, b) => b.timestamp - a.timestamp);

        let consecutive = 0;
        for (const trade of recentTrades) {
            if (trade.isWinner) {
                consecutive++;
            } else {
                break;
            }
        }

        return consecutive;
    }

    /**
     * Get consecutive losses count
     */
    getConsecutiveLosses() {
        const recentTrades = Array.from(this.trades.values())
            .sort((a, b) => b.timestamp - a.timestamp);

        let consecutive = 0;
        for (const trade of recentTrades) {
            if (!trade.isWinner) {
                consecutive++;
            } else {
                break;
            }
        }

        return consecutive;
    }

    /**
     * Identify optimal trading conditions
     */
    identifyOptimalConditions() {
        const conditions = {
            bestSessions: this.getBestSessions(),
            bestSetups: this.getBestSetups(),
            bestPairs: this.getBestPairs(),
            optimalConfluence: this.getOptimalConfluenceRange(),
            timePatterns: this.analyzeTimePatterns(),
            recommendations: []
        };

        // Generate recommendations
        conditions.recommendations = this.generateRecommendations(conditions);

        return conditions;
    }

    /**
     * Get best performing sessions
     */
    getBestSessions() {
        const sessions = Array.from(this.sessionMetrics.entries())
            .filter(([_, metrics]) => metrics.totalTrades >= this.config.minTradesForAnalysis)
            .map(([session, metrics]) => ({
                session,
                winRate: metrics.winRate,
                averageR: metrics.averageR,
                totalTrades: metrics.totalTrades,
                score: (metrics.winRate * 0.6) + (Math.max(0, metrics.averageR) * 0.4)
            }))
            .sort((a, b) => b.score - a.score);

        return sessions;
    }

    /**
     * Get best performing setups
     */
    getBestSetups() {
        const setups = Array.from(this.setupMetrics.entries())
            .filter(([_, metrics]) => metrics.totalTrades >= this.config.minTradesForAnalysis)
            .map(([setupType, metrics]) => ({
                setupType,
                winRate: metrics.winRate,
                averageR: metrics.averageR,
                totalTrades: metrics.totalTrades,
                averageConfluence: metrics.averageConfluence,
                score: (metrics.winRate * 0.5) + (Math.max(0, metrics.averageR) * 0.3) + (metrics.averageConfluence / 10 * 0.2)
            }))
            .sort((a, b) => b.score - a.score);

        return setups;
    }

    /**
     * Get best performing pairs
     */
    getBestPairs() {
        const pairs = Array.from(this.pairMetrics.entries())
            .filter(([_, metrics]) => metrics.totalTrades >= this.config.minTradesForAnalysis)
            .map(([symbol, metrics]) => ({
                symbol,
                winRate: metrics.winRate,
                averageR: metrics.averageR,
                totalTrades: metrics.totalTrades,
                score: (metrics.winRate * 0.7) + (Math.max(0, metrics.averageR) * 0.3)
            }))
            .sort((a, b) => b.score - a.score);

        return pairs;
    }

    /**
     * Get optimal confluence range
     */
    getOptimalConfluenceRange() {
        const trades = Array.from(this.trades.values());

        // Group by confluence ranges
        const ranges = {
            '6-7': trades.filter(t => t.confluence >= 6 && t.confluence < 7),
            '7-8': trades.filter(t => t.confluence >= 7 && t.confluence < 8),
            '8-9': trades.filter(t => t.confluence >= 8 && t.confluence < 9),
            '9-10': trades.filter(t => t.confluence >= 9)
        };

        const results = Object.entries(ranges)
            .filter(([_, trades]) => trades.length >= 5)
            .map(([range, trades]) => {
                const winners = trades.filter(t => t.isWinner).length;
                const avgR = trades.reduce((sum, t) => sum + t.pnlR, 0) / trades.length;

                return {
                    range,
                    winRate: winners / trades.length,
                    averageR: avgR,
                    totalTrades: trades.length,
                    score: (winners / trades.length * 0.6) + (Math.max(0, avgR) * 0.4)
                };
            })
            .sort((a, b) => b.score - a.score);

        return results;
    }

    /**
     * Analyze time-based patterns
     */
    analyzeTimePatterns() {
        const trades = Array.from(this.trades.values());

        // Analyze by day of week
        const dayOfWeek = {};
        for (let i = 0; i < 7; i++) {
            dayOfWeek[i] = trades.filter(t => t.entryTime.getDay() === i);
        }

        // Analyze by hour of day
        const hourOfDay = {};
        for (let i = 0; i < 24; i++) {
            hourOfDay[i] = trades.filter(t => t.entryTime.getUTCHours() === i);
        }

        return {
            bestDays: this.analyzePeriodPerformance(dayOfWeek, ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']),
            bestHours: this.analyzePeriodPerformance(hourOfDay, Array.from({length: 24}, (_, i) => `${i}:00`))
        };
    }

    /**
     * Analyze performance by time period
     */
    analyzePeriodPerformance(periods, labels) {
        return Object.entries(periods)
            .filter(([_, trades]) => trades.length >= 5)
            .map(([period, trades]) => {
                const winners = trades.filter(t => t.isWinner).length;
                const avgR = trades.reduce((sum, t) => sum + t.pnlR, 0) / trades.length;

                return {
                    period: labels[parseInt(period)] || period,
                    winRate: winners / trades.length,
                    averageR: avgR,
                    totalTrades: trades.length,
                    score: (winners / trades.length * 0.6) + (Math.max(0, avgR) * 0.4)
                };
            })
            .sort((a, b) => b.score - a.score);
    }

    /**
     * Generate performance-based recommendations
     */
    generateRecommendations(conditions) {
        const recommendations = [];

        // Session recommendations
        if (conditions.bestSessions.length > 0) {
            const bestSession = conditions.bestSessions[0];
            if (bestSession.winRate > this.config.goodWinRate) {
                recommendations.push({
                    type: 'SESSION_FOCUS',
                    priority: 'HIGH',
                    message: `Focus on ${bestSession.session} session (${(bestSession.winRate * 100).toFixed(1)}% WR, ${bestSession.averageR.toFixed(2)} avg R)`
                });
            }
        }

        // Setup recommendations
        if (conditions.bestSetups.length > 0) {
            const bestSetup = conditions.bestSetups[0];
            if (bestSetup.winRate > this.config.goodWinRate) {
                recommendations.push({
                    type: 'SETUP_FOCUS',
                    priority: 'HIGH',
                    message: `Prioritize ${bestSetup.setupType} setups (${(bestSetup.winRate * 100).toFixed(1)}% WR)`
                });
            }

            // Identify underperforming setups
            const worstSetup = conditions.bestSetups[conditions.bestSetups.length - 1];
            if (worstSetup.winRate < this.config.acceptableWinRate) {
                recommendations.push({
                    type: 'SETUP_AVOID',
                    priority: 'MEDIUM',
                    message: `Consider avoiding ${worstSetup.setupType} setups (${(worstSetup.winRate * 100).toFixed(1)}% WR)`
                });
            }
        }

        // Confluence recommendations
        if (conditions.optimalConfluence.length > 0) {
            const optimalRange = conditions.optimalConfluence[0];
            recommendations.push({
                type: 'CONFLUENCE_RANGE',
                priority: 'MEDIUM',
                message: `Focus on confluence range ${optimalRange.range} for best results (${(optimalRange.winRate * 100).toFixed(1)}% WR)`
            });
        }

        // Risk management recommendations
        const currentDrawdown = this.calculateCurrentDrawdown();
        if (currentDrawdown > this.config.warningDrawdown) {
            recommendations.push({
                type: 'RISK_WARNING',
                priority: 'CRITICAL',
                message: `High drawdown detected (${(currentDrawdown * 100).toFixed(1)}%) - consider reducing position size`
            });
        }

        // Consecutive loss warning
        const consecutiveLosses = this.getConsecutiveLosses();
        if (consecutiveLosses >= 3) {
            recommendations.push({
                type: 'STREAK_WARNING',
                priority: 'HIGH',
                message: `${consecutiveLosses} consecutive losses - consider taking a break or reducing size`
            });
        }

        return recommendations;
    }

    /**
     * Get comprehensive performance report
     */
    getPerformanceReport(period = 30) { // days
        const cutoffDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000);
        const trades = Array.from(this.trades.values())
            .filter(trade => trade.entryTime >= cutoffDate);

        if (trades.length === 0) {
            return {
                error: 'No trades found in the specified period',
                period,
                cutoffDate
            };
        }

        const winners = trades.filter(trade => trade.isWinner);
        const losers = trades.filter(trade => !trade.isWinner);

        const totalPnL = trades.reduce((sum, trade) => sum + trade.pnlR, 0);
        const winRate = winners.length / trades.length;
        const avgWin = winners.length > 0 ? winners.reduce((sum, trade) => sum + trade.pnlR, 0) / winners.length : 0;
        const avgLoss = losers.length > 0 ? losers.reduce((sum, trade) => sum + trade.pnlR, 0) / losers.length : 0;
        const profitFactor = this.calculateProfitFactor(trades);

        return {
            period,
            summary: {
                totalTrades: trades.length,
                winningTrades: winners.length,
                losingTrades: losers.length,
                winRate: winRate,
                totalPnL: totalPnL,
                averageR: totalPnL / trades.length,
                bestTrade: Math.max(...trades.map(t => t.pnlR)),
                worstTrade: Math.min(...trades.map(t => t.pnlR)),
                averageWin: avgWin,
                averageLoss: avgLoss,
                profitFactor: profitFactor,
                payoffRatio: avgWin / Math.abs(avgLoss),
                currentDrawdown: this.calculateCurrentDrawdown(),
                maxDrawdown: this.getMaxDrawdownInPeriod(trades),
                tradingDays: this.getTradingDaysInPeriod(trades)
            },
            breakdown: {
                bySetup: this.getSetupBreakdownForPeriod(trades),
                bySession: this.getSessionBreakdownForPeriod(trades),
                byPair: this.getPairBreakdownForPeriod(trades),
                byConfluence: this.getConfluenceBreakdownForPeriod(trades)
            },
            insights: this.identifyOptimalConditions(),
            trends: this.analyzeTrends(trades),
            quality: this.assessOverallQuality(trades)
        };
    }

    /**
     * Get setup breakdown for period
     */
    getSetupBreakdownForPeriod(trades) {
        const setupGroups = trades.reduce((groups, trade) => {
            if (!groups[trade.setupType]) {
                groups[trade.setupType] = [];
            }
            groups[trade.setupType].push(trade);
            return groups;
        }, {});

        return Object.entries(setupGroups).map(([setupType, setupTrades]) => {
            const winners = setupTrades.filter(t => t.isWinner);
            const totalR = setupTrades.reduce((sum, t) => sum + t.pnlR, 0);

            return {
                setupType,
                totalTrades: setupTrades.length,
                winRate: winners.length / setupTrades.length,
                totalR: totalR,
                averageR: totalR / setupTrades.length,
                profitFactor: this.calculateProfitFactor(setupTrades)
            };
        }).sort((a, b) => b.averageR - a.averageR);
    }

    /**
     * Get session breakdown for period
     */
    getSessionBreakdownForPeriod(trades) {
        const sessionGroups = trades.reduce((groups, trade) => {
            if (!groups[trade.session]) {
                groups[trade.session] = [];
            }
            groups[trade.session].push(trade);
            return groups;
        }, {});

        return Object.entries(sessionGroups).map(([session, sessionTrades]) => {
            const winners = sessionTrades.filter(t => t.isWinner);
            const totalR = sessionTrades.reduce((sum, t) => sum + t.pnlR, 0);

            return {
                session,
                totalTrades: sessionTrades.length,
                winRate: winners.length / sessionTrades.length,
                totalR: totalR,
                averageR: totalR / sessionTrades.length
            };
        }).sort((a, b) => b.averageR - a.averageR);
    }

    /**
     * Get pair breakdown for period
     */
    getPairBreakdownForPeriod(trades) {
        const pairGroups = trades.reduce((groups, trade) => {
            if (!groups[trade.symbol]) {
                groups[trade.symbol] = [];
            }
            groups[trade.symbol].push(trade);
            return groups;
        }, {});

        return Object.entries(pairGroups).map(([symbol, pairTrades]) => {
            const winners = pairTrades.filter(t => t.isWinner);
            const totalR = pairTrades.reduce((sum, t) => sum + t.pnlR, 0);

            return {
                symbol,
                totalTrades: pairTrades.length,
                winRate: winners.length / pairTrades.length,
                totalR: totalR,
                averageR: totalR / pairTrades.length
            };
        }).sort((a, b) => b.averageR - a.averageR);
    }

    /**
     * Get confluence breakdown for period
     */
    getConfluenceBreakdownForPeriod(trades) {
        const confluenceRanges = {
            'High (8-10)': trades.filter(t => t.confluence >= 8),
            'Medium (6-7)': trades.filter(t => t.confluence >= 6 && t.confluence < 8),
            'Low (0-5)': trades.filter(t => t.confluence < 6)
        };

        return Object.entries(confluenceRanges)
            .filter(([_, rangeTrades]) => rangeTrades.length > 0)
            .map(([range, rangeTrades]) => {
                const winners = rangeTrades.filter(t => t.isWinner);
                const totalR = rangeTrades.reduce((sum, t) => sum + t.pnlR, 0);

                return {
                    range,
                    totalTrades: rangeTrades.length,
                    winRate: winners.length / rangeTrades.length,
                    averageR: totalR / rangeTrades.length
                };
            });
    }

    /**
     * Analyze trends in performance
     */
    analyzeTrends(trades) {
        if (trades.length < 10) {
            return { insufficient_data: true };
        }

        // Sort trades by time
        const sortedTrades = trades.sort((a, b) => a.entryTime - b.entryTime);

        // Calculate moving averages
        const windowSize = Math.min(10, Math.floor(trades.length / 3));
        const movingWinRates = [];
        const movingAvgR = [];

        for (let i = windowSize - 1; i < sortedTrades.length; i++) {
            const window = sortedTrades.slice(i - windowSize + 1, i + 1);
            const winners = window.filter(t => t.isWinner).length;
            const totalR = window.reduce((sum, t) => sum + t.pnlR, 0);

            movingWinRates.push(winners / window.length);
            movingAvgR.push(totalR / window.length);
        }

        // Determine trends
        const recentWinRate = movingWinRates.slice(-3).reduce((a, b) => a + b, 0) / 3;
        const earlyWinRate = movingWinRates.slice(0, 3).reduce((a, b) => a + b, 0) / 3;

        const recentAvgR = movingAvgR.slice(-3).reduce((a, b) => a + b, 0) / 3;
        const earlyAvgR = movingAvgR.slice(0, 3).reduce((a, b) => a + b, 0) / 3;

        return {
            winRateTrend: recentWinRate > earlyWinRate ? 'IMPROVING' : 'DECLINING',
            winRateChange: ((recentWinRate - earlyWinRate) * 100).toFixed(1) + '%',
            avgRTrend: recentAvgR > earlyAvgR ? 'IMPROVING' : 'DECLINING',
            avgRChange: (recentAvgR - earlyAvgR).toFixed(2) + 'R',
            consistency: this.calculateConsistency(movingAvgR),
            momentum: this.calculateMomentum(sortedTrades)
        };
    }

    /**
     * Calculate performance consistency
     */
    calculateConsistency(values) {
        if (values.length < 3) return 'INSUFFICIENT_DATA';

        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        const coefficientOfVariation = stdDev / Math.abs(mean);

        if (coefficientOfVariation < 0.5) return 'HIGH';
        if (coefficientOfVariation < 1.0) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * Calculate momentum score
     */
    calculateMomentum(trades) {
        const recent = trades.slice(-5); // Last 5 trades
        const winners = recent.filter(t => t.isWinner).length;
        const totalR = recent.reduce((sum, t) => sum + t.pnlR, 0);

        if (winners >= 4 && totalR > 2) return 'STRONG_POSITIVE';
        if (winners >= 3 && totalR > 0) return 'POSITIVE';
        if (winners <= 1 && totalR < -2) return 'STRONG_NEGATIVE';
        if (totalR < 0) return 'NEGATIVE';
        return 'NEUTRAL';
    }

    /**
     * Assess overall trading quality
     */
    assessOverallQuality(trades) {
        const winRate = trades.filter(t => t.isWinner).length / trades.length;
        const avgR = trades.reduce((sum, t) => sum + t.pnlR, 0) / trades.length;
        const profitFactor = this.calculateProfitFactor(trades);

        let score = 0;

        // Win rate scoring
        if (winRate >= this.config.excellentWinRate) score += 3;
        else if (winRate >= this.config.goodWinRate) score += 2;
        else if (winRate >= this.config.acceptableWinRate) score += 1;

        // Average R scoring
        if (avgR >= this.config.excellentAvgR) score += 3;
        else if (avgR >= this.config.goodAvgR) score += 2;
        else if (avgR >= this.config.acceptableAvgR) score += 1;

        // Profit factor scoring
        if (profitFactor >= 2.0) score += 2;
        else if (profitFactor >= 1.5) score += 1;

        // Risk management scoring
        const drawdown = this.calculateCurrentDrawdown();
        if (drawdown < 0.05) score += 2; // Less than 5% drawdown
        else if (drawdown < 0.10) score += 1; // Less than 10% drawdown
        else if (drawdown > 0.20) score -= 2; // More than 20% drawdown

        if (score >= 8) return 'EXCELLENT';
        if (score >= 6) return 'VERY_GOOD';
        if (score >= 4) return 'GOOD';
        if (score >= 2) return 'ACCEPTABLE';
        return 'NEEDS_IMPROVEMENT';
    }

    /**
     * Analyze trade patterns for insights
     */
    analyzeTradePatterns(trade) {
        // This could be expanded to identify patterns like:
        // - Time-based performance variations
        // - Confluence correlation with outcomes
        // - Setup type performance by session
        // - Pair correlation analysis
        // etc.

        // For now, just emit event for external analysis
        this.emit('trade_recorded', {
            trade,
            currentMetrics: this.getBasicMetrics()
        });
    }

    /**
     * Get basic metrics summary
     */
    getBasicMetrics() {
        const trades = Array.from(this.trades.values());

        if (trades.length === 0) {
            return {
                totalTrades: 0,
                winRate: 0,
                totalPnL: 0,
                averageR: 0
            };
        }

        const winners = trades.filter(t => t.isWinner).length;
        const totalPnL = trades.reduce((sum, t) => sum + t.pnlR, 0);

        return {
            totalTrades: trades.length,
            winRate: winners / trades.length,
            totalPnL: totalPnL,
            averageR: totalPnL / trades.length,
            currentDrawdown: this.calculateCurrentDrawdown(),
            consecutiveWins: this.getConsecutiveWins(),
            consecutiveLosses: this.getConsecutiveLosses()
        };
    }

    /**
     * Export performance data
     */
    exportPerformanceData(format = 'json') {
        const data = {
            trades: Array.from(this.trades.values()),
            dailyMetrics: Object.fromEntries(this.dailyMetrics),
            sessionMetrics: Object.fromEntries(this.sessionMetrics),
            setupMetrics: Object.fromEntries(this.setupMetrics),
            pairMetrics: Object.fromEntries(this.pairMetrics),
            performanceHistory: this.performanceHistory,
            exportDate: new Date().toISOString(),
            totalTrades: this.trades.size
        };

        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        }

        // Could add CSV export or other formats here
        return data;
    }

    /**
     * Clear all performance data
     */
    clearAllData() {
        this.trades.clear();
        this.dailyMetrics.clear();
        this.sessionMetrics.clear();
        this.setupMetrics.clear();
        this.pairMetrics.clear();
        this.performanceHistory = [];
        this.drawdownPeriods = [];
        this.optimalConditions.clear();

        this.emit('data_cleared');
    }

    // Additional helper methods...

    getMaxDrawdownInPeriod(trades) {
        // Calculate max drawdown for specific trades
        let peak = 0;
        let maxDrawdown = 0;
        let running = 0;

        for (const trade of trades.sort((a, b) => a.timestamp - b.timestamp)) {
            running += trade.pnlR;
            if (running > peak) {
                peak = running;
            } else {
                const drawdown = (peak - running) / peak;
                maxDrawdown = Math.max(maxDrawdown, drawdown);
            }
        }

        return maxDrawdown;
    }

    getTradingDaysInPeriod(trades) {
        const uniqueDates = new Set(
            trades.map(trade => trade.entryTime.toISOString().split('T')[0])
        );
        return uniqueDates.size;
    }
}

module.exports = PerformanceAnalytics;