/**
 * Risk Management System - Position sizing, dynamic stop loss, and performance tracking
 * Implements comprehensive risk management following professional trading methodology
 */
class RiskManager {
    constructor(config = {}) {
        this.config = {
            // Risk parameters
            maxRiskPerTrade: config.maxRiskPerTrade || 0.01, // 1% per trade
            maxDailyRisk: config.maxDailyRisk || 0.05, // 5% per day
            maxWeeklyRisk: config.maxWeeklyRisk || 0.15, // 15% per week
            maxMonthlyRisk: config.maxMonthlyRisk || 0.40, // 40% per month

            // Position sizing
            minPositionSize: config.minPositionSize || 0.01, // Minimum lot size
            maxPositionSize: config.maxPositionSize || 10.0, // Maximum lot size
            baseAccountSize: config.baseAccountSize || 10000, // $10,000 base

            // Stop loss configuration
            minStopLossPoints: config.minStopLossPoints || 10, // Minimum 10 points
            maxStopLossPoints: config.maxStopLossPoints || 200, // Maximum 200 points
            structureBuffer: config.structureBuffer || 5, // 5 points buffer beyond structure

            // Risk:Reward ratios
            minRiskReward: config.minRiskReward || 1.5, // 1:1.5 minimum
            targetRiskReward: config.targetRiskReward || 3.0, // 1:3 target
            maxRiskReward: config.maxRiskReward || 8.0, // 1:8 maximum

            // Performance tracking
            trackingPeriod: config.trackingPeriod || 30, // Days to track
            drawdownAlertLevel: config.drawdownAlertLevel || 0.15, // 15% drawdown alert

            ...config
        };

        // Internal state
        this.positions = new Map(); // positionId -> position data
        this.dailyPnL = new Map(); // date -> PnL
        this.performanceMetrics = {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            totalPnL: 0,
            maxDrawdown: 0,
            currentDrawdown: 0,
            bestTrade: 0,
            worstTrade: 0,
            averageWin: 0,
            averageLoss: 0
        };

        // Setup type performance tracking
        this.setupPerformance = new Map(); // setupType -> performance data
        this.sessionPerformance = new Map(); // session -> performance data
    }

    /**
     * Calculate optimal position size based on account balance and risk parameters
     */
    calculatePositionSize(accountBalance, entryPrice, stopLoss, riskAmount = null) {
        try {
            // Determine risk amount
            const maxRiskAmount = accountBalance * this.config.maxRiskPerTrade;
            const actualRiskAmount = riskAmount || maxRiskAmount;

            // Calculate stop loss distance in points
            const stopLossPoints = Math.abs(entryPrice - stopLoss);

            if (stopLossPoints < this.config.minStopLossPoints) {
                throw new Error(`Stop loss too tight. Minimum ${this.config.minStopLossPoints} points required`);
            }

            if (stopLossPoints > this.config.maxStopLossPoints) {
                throw new Error(`Stop loss too wide. Maximum ${this.config.maxStopLossPoints} points allowed`);
            }

            // Calculate position size (assuming 1 pip = $1 per lot for EURUSD equivalent)
            // This would need adjustment based on actual pair pip values
            const pointValue = this.getPointValue(entryPrice);
            const positionSize = actualRiskAmount / (stopLossPoints * pointValue);

            // Apply size constraints
            const constrainedSize = Math.max(
                this.config.minPositionSize,
                Math.min(positionSize, this.config.maxPositionSize)
            );

            return {
                positionSize: parseFloat(constrainedSize.toFixed(2)),
                riskAmount: actualRiskAmount,
                stopLossPoints: stopLossPoints,
                pointValue: pointValue,
                maxPotentialLoss: constrainedSize * stopLossPoints * pointValue,
                riskPercentage: (actualRiskAmount / accountBalance) * 100
            };

        } catch (error) {
            throw new Error(`Position sizing error: ${error.message}`);
        }
    }

    /**
     * Calculate dynamic stop loss based on market structure
     */
    calculateDynamicStopLoss(setup) {
        try {
            const {
                symbol,
                direction, // 'BUY' or 'SELL'
                entryPrice,
                structureLevels, // Array of structure levels
                sessionHigh,
                sessionLow,
                setupType
            } = setup;

            let stopLoss;
            let stopLossReason;

            switch (setupType.toUpperCase()) {
                case 'LIQUIDITY_GRAB':
                    stopLoss = this.calculateLiquidityGrabStop(direction, entryPrice, structureLevels);
                    stopLossReason = 'Liquidity grab structure';
                    break;

                case 'BOS_CONFIRMATION':
                    stopLoss = this.calculateBOSStop(direction, entryPrice, structureLevels);
                    stopLossReason = 'Break of structure confirmation';
                    break;

                case 'FAIR_VALUE_GAP':
                    stopLoss = this.calculateFVGStop(direction, entryPrice, structureLevels);
                    stopLossReason = 'Fair value gap boundary';
                    break;

                case 'SESSION_EXTREME':
                    stopLoss = this.calculateSessionStop(direction, entryPrice, sessionHigh, sessionLow);
                    stopLossReason = 'Session extreme';
                    break;

                default:
                    stopLoss = this.calculateStandardStop(direction, entryPrice, structureLevels);
                    stopLossReason = 'Standard structure';
            }

            // Apply buffer
            const buffer = this.config.structureBuffer;
            if (direction === 'BUY') {
                stopLoss -= buffer;
            } else {
                stopLoss += buffer;
            }

            // Validate stop loss distance
            const stopDistance = Math.abs(entryPrice - stopLoss);
            if (stopDistance < this.config.minStopLossPoints) {
                if (direction === 'BUY') {
                    stopLoss = entryPrice - this.config.minStopLossPoints;
                } else {
                    stopLoss = entryPrice + this.config.minStopLossPoints;
                }
                stopLossReason += ' (adjusted to minimum distance)';
            }

            return {
                stopLoss: parseFloat(stopLoss.toFixed(5)),
                stopLossReason,
                stopDistance: Math.abs(entryPrice - stopLoss),
                riskPoints: Math.abs(entryPrice - stopLoss)
            };

        } catch (error) {
            throw new Error(`Dynamic stop loss calculation error: ${error.message}`);
        }
    }

    /**
     * Calculate liquidity grab stop loss
     */
    calculateLiquidityGrabStop(direction, entryPrice, structureLevels) {
        // Find the nearest structure level that was grabbed
        const relevantLevels = structureLevels.filter(level =>
            direction === 'BUY' ? level.price < entryPrice : level.price > entryPrice
        );

        if (relevantLevels.length === 0) {
            // Fallback to percentage-based stop
            return direction === 'BUY' ?
                entryPrice * 0.999 : // 0.1% below entry
                entryPrice * 1.001;   // 0.1% above entry
        }

        // Use the closest grabbed liquidity level
        const closestLevel = relevantLevels.reduce((prev, current) =>
            Math.abs(current.price - entryPrice) < Math.abs(prev.price - entryPrice) ? current : prev
        );

        return closestLevel.price;
    }

    /**
     * Calculate break of structure stop loss
     */
    calculateBOSStop(direction, entryPrice, structureLevels) {
        // Find the structure level that was broken
        const brokenStructure = structureLevels.find(level =>
            level.type === 'BROKEN_STRUCTURE'
        );

        if (brokenStructure) {
            return brokenStructure.price;
        }

        // Fallback to nearest significant level
        return this.calculateStandardStop(direction, entryPrice, structureLevels);
    }

    /**
     * Calculate fair value gap stop loss
     */
    calculateFVGStop(direction, entryPrice, structureLevels) {
        // For FVG, stop goes at the opposite side of the gap
        const fvgLevel = structureLevels.find(level =>
            level.type === 'FAIR_VALUE_GAP'
        );

        if (fvgLevel) {
            // Stop at the opposite boundary of the FVG
            return direction === 'BUY' ? fvgLevel.low : fvgLevel.high;
        }

        return this.calculateStandardStop(direction, entryPrice, structureLevels);
    }

    /**
     * Calculate session extreme stop loss
     */
    calculateSessionStop(direction, entryPrice, sessionHigh, sessionLow) {
        if (direction === 'BUY') {
            return sessionLow; // Stop below session low for long positions
        } else {
            return sessionHigh; // Stop above session high for short positions
        }
    }

    /**
     * Calculate standard structure-based stop loss
     */
    calculateStandardStop(direction, entryPrice, structureLevels) {
        if (!structureLevels || structureLevels.length === 0) {
            // Default percentage-based stop
            return direction === 'BUY' ?
                entryPrice * 0.995 : // 0.5% below entry
                entryPrice * 1.005;   // 0.5% above entry
        }

        // Find nearest structure level on the stop side
        const stopSideLevels = structureLevels.filter(level =>
            direction === 'BUY' ? level.price < entryPrice : level.price > entryPrice
        );

        if (stopSideLevels.length === 0) {
            return direction === 'BUY' ?
                entryPrice * 0.995 :
                entryPrice * 1.005;
        }

        // Use the nearest structure level
        const nearestLevel = stopSideLevels.reduce((prev, current) =>
            Math.abs(current.price - entryPrice) < Math.abs(prev.price - entryPrice) ? current : prev
        );

        return nearestLevel.price;
    }

    /**
     * Calculate risk:reward ratio
     */
    calculateRiskReward(entryPrice, stopLoss, takeProfit) {
        const risk = Math.abs(entryPrice - stopLoss);
        const reward = Math.abs(takeProfit - entryPrice);

        if (risk === 0) {
            throw new Error('Risk cannot be zero');
        }

        const ratio = reward / risk;

        return {
            riskReward: parseFloat(ratio.toFixed(2)),
            riskPoints: risk,
            rewardPoints: reward,
            valid: ratio >= this.config.minRiskReward,
            quality: this.assessRRQuality(ratio)
        };
    }

    /**
     * Assess risk:reward ratio quality
     */
    assessRRQuality(ratio) {
        if (ratio >= 4.0) return 'EXCELLENT';
        if (ratio >= 3.0) return 'VERY_GOOD';
        if (ratio >= 2.0) return 'GOOD';
        if (ratio >= 1.5) return 'ACCEPTABLE';
        return 'POOR';
    }

    /**
     * Calculate optimal take profit levels
     */
    calculateTakeProfitLevels(entryPrice, stopLoss, direction, structureLevels = []) {
        const risk = Math.abs(entryPrice - stopLoss);
        const takeProfitLevels = [];

        // Multiple take profit levels based on risk multiples
        const targetMultiples = [1.5, 2.0, 3.0, 5.0];

        for (const multiple of targetMultiples) {
            let tpPrice;

            if (direction === 'BUY') {
                tpPrice = entryPrice + (risk * multiple);
            } else {
                tpPrice = entryPrice - (risk * multiple);
            }

            // Check if TP level conflicts with structure
            const conflictsWithStructure = this.checkStructureConflict(
                tpPrice, direction, structureLevels
            );

            takeProfitLevels.push({
                level: multiple,
                price: parseFloat(tpPrice.toFixed(5)),
                riskReward: multiple,
                conflictsWithStructure,
                recommended: multiple >= 2.0 && multiple <= 3.0 && !conflictsWithStructure
            });
        }

        return takeProfitLevels;
    }

    /**
     * Check if take profit conflicts with major structure
     */
    checkStructureConflict(tpPrice, direction, structureLevels) {
        const tolerance = 10; // 10 points tolerance

        for (const level of structureLevels) {
            if (Math.abs(level.price - tpPrice) <= tolerance) {
                // Check if this is a level that would block the move
                if ((direction === 'BUY' && level.type === 'RESISTANCE') ||
                    (direction === 'SELL' && level.type === 'SUPPORT')) {
                    return {
                        conflicts: true,
                        level: level.price,
                        type: level.type,
                        strength: level.strength || 'MEDIUM'
                    };
                }
            }
        }

        return { conflicts: false };
    }

    /**
     * Monitor and alert for drawdown levels
     */
    monitorDrawdown(accountBalance, peakBalance) {
        const currentDrawdown = (peakBalance - accountBalance) / peakBalance;

        this.performanceMetrics.currentDrawdown = currentDrawdown;

        if (currentDrawdown > this.performanceMetrics.maxDrawdown) {
            this.performanceMetrics.maxDrawdown = currentDrawdown;
        }

        // Generate alerts for significant drawdown levels
        const alerts = [];

        if (currentDrawdown >= this.config.drawdownAlertLevel) {
            alerts.push({
                type: 'DRAWDOWN_ALERT',
                level: 'HIGH',
                drawdown: currentDrawdown,
                message: `High drawdown detected: ${(currentDrawdown * 100).toFixed(1)}%`
            });
        }

        if (currentDrawdown >= 0.25) { // 25% drawdown
            alerts.push({
                type: 'CRITICAL_DRAWDOWN',
                level: 'CRITICAL',
                drawdown: currentDrawdown,
                message: `Critical drawdown: ${(currentDrawdown * 100).toFixed(1)}% - Consider reducing position sizes`
            });
        }

        return {
            currentDrawdown,
            maxDrawdown: this.performanceMetrics.maxDrawdown,
            alerts
        };
    }

    /**
     * Track performance by setup type
     */
    trackSetupPerformance(setupType, outcome, pnl, riskAmount) {
        if (!this.setupPerformance.has(setupType)) {
            this.setupPerformance.set(setupType, {
                totalTrades: 0,
                wins: 0,
                losses: 0,
                totalPnL: 0,
                winRate: 0,
                averageRR: 0,
                profitFactor: 0,
                totalRisk: 0
            });
        }

        const performance = this.setupPerformance.get(setupType);
        performance.totalTrades++;
        performance.totalPnL += pnl;
        performance.totalRisk += riskAmount;

        if (outcome === 'WIN') {
            performance.wins++;
        } else {
            performance.losses++;
        }

        // Update calculated metrics
        performance.winRate = performance.wins / performance.totalTrades;
        performance.averageRR = performance.totalPnL / performance.totalRisk;

        // Calculate profit factor (gross profit / gross loss)
        const grossProfit = performance.totalPnL > 0 ? performance.totalPnL : 0;
        const grossLoss = performance.totalPnL < 0 ? Math.abs(performance.totalPnL) : 0;
        performance.profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

        this.setupPerformance.set(setupType, performance);

        return performance;
    }

    /**
     * Get point value for position sizing (simplified)
     */
    getPointValue(price) {
        // This is simplified - in reality, this would vary by instrument
        // For major FX pairs, 1 pip is typically $1 per lot for a $10k lot size
        if (price > 100) {
            return 0.1; // JPY pairs
        }
        return 1.0; // Major pairs
    }

    /**
     * Assess overall trading risk
     */
    assessTradingRisk(accountBalance, openPositions, dailyPnL) {
        const assessment = {
            riskLevel: 'LOW',
            warnings: [],
            recommendations: []
        };

        // Check daily risk
        const todayPnL = dailyPnL.get(this.getTodayDateString()) || 0;
        const dailyRisk = Math.abs(todayPnL) / accountBalance;

        if (dailyRisk > this.config.maxDailyRisk) {
            assessment.riskLevel = 'HIGH';
            assessment.warnings.push(`Daily risk exceeded: ${(dailyRisk * 100).toFixed(1)}%`);
            assessment.recommendations.push('Consider closing positions or reducing size');
        }

        // Check position concentration
        const totalExposure = openPositions.reduce((sum, pos) => sum + pos.risk, 0);
        const exposureRisk = totalExposure / accountBalance;

        if (exposureRisk > 0.10) { // 10% total exposure
            assessment.riskLevel = 'MEDIUM';
            assessment.warnings.push(`High position concentration: ${(exposureRisk * 100).toFixed(1)}%`);
        }

        // Check correlation risk (simplified)
        const symbols = [...new Set(openPositions.map(pos => pos.symbol))];
        if (symbols.length > 5) {
            assessment.warnings.push('High number of open symbols may increase correlation risk');
        }

        return assessment;
    }

    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        // Update calculated metrics
        const totalTrades = this.performanceMetrics.totalTrades;

        if (totalTrades > 0) {
            this.performanceMetrics.winRate = this.performanceMetrics.winningTrades / totalTrades;

            if (this.performanceMetrics.losingTrades > 0) {
                this.performanceMetrics.profitFactor =
                    (this.performanceMetrics.averageWin * this.performanceMetrics.winningTrades) /
                    Math.abs(this.performanceMetrics.averageLoss * this.performanceMetrics.losingTrades);
            }
        }

        return {
            ...this.performanceMetrics,
            setupPerformance: Object.fromEntries(this.setupPerformance),
            sessionPerformance: Object.fromEntries(this.sessionPerformance)
        };
    }

    /**
     * Get today's date string
     */
    getTodayDateString() {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Calculate Kelly Criterion position size
     */
    calculateKellyPositionSize(winRate, averageWin, averageLoss, accountBalance) {
        if (averageLoss <= 0 || winRate <= 0 || winRate >= 1) {
            return 0;
        }

        const kellyPercentage = winRate - ((1 - winRate) / (averageWin / Math.abs(averageLoss)));

        // Apply Kelly fraction with safety margin (25% of full Kelly)
        const safeKellyPercentage = Math.max(0, Math.min(kellyPercentage * 0.25, 0.05)); // Max 5%

        return {
            kellyPercentage: kellyPercentage,
            safeKellyPercentage: safeKellyPercentage,
            recommendedRisk: accountBalance * safeKellyPercentage
        };
    }
}

module.exports = RiskManager;