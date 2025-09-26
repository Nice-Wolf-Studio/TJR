/**
 * Notification Templates - Professional formatting for Discord alerts and reports
 * Implements exact formatting as specified in trading methodology
 */
class NotificationTemplates {
    constructor(config = {}) {
        this.config = {
            timezone: config.timezone || 'America/New_York',
            dateFormat: config.dateFormat || 'MMM DD, YYYY',
            timeFormat: config.timeFormat || 'HH:mm UTC',
            embedColor: config.embedColor || '#2F3136',
            successColor: config.successColor || '#57F287',
            warningColor: config.warningColor || '#FEE75C',
            errorColor: config.errorColor || '#ED4245',
            ...config
        };

        // Emoji mappings for visual appeal
        this.emojis = {
            bullish: '🟢',
            bearish: '🔴',
            neutral: '⚪',
            fire: '🔥',
            warning: '⚠️',
            chart: '📊',
            clock: '🕐',
            money: '💰',
            target: '🎯',
            shield: '🛡️',
            rocket: '🚀',
            crystal: '🔮',
            lightning: '⚡'
        };
    }

    /**
     * Format daily bias report as specified in methodology
     */
    formatDailyBiasReport(biasData) {
        const {
            date,
            symbol,
            bias,
            confidence,
            keyLevels,
            sessionTargets,
            riskEvents,
            confluence,
            marketStructure,
            previousDayAnalysis
        } = biasData;

        const biasEmoji = bias === 'BULLISH' ? this.emojis.bullish :
                         bias === 'BEARISH' ? this.emojis.bearish : this.emojis.neutral;

        const embed = {
            title: `${biasEmoji} Daily Bias Report - ${symbol}`,
            description: `**${bias}** bias with **${confidence}%** confidence`,
            color: this.getColorForBias(bias),
            timestamp: new Date().toISOString(),
            fields: [
                {
                    name: `${this.emojis.chart} Market Structure`,
                    value: this.formatMarketStructure(marketStructure),
                    inline: false
                },
                {
                    name: `${this.emojis.target} Key Levels`,
                    value: this.formatKeyLevels(keyLevels),
                    inline: true
                },
                {
                    name: `${this.emojis.clock} Session Targets`,
                    value: this.formatSessionTargets(sessionTargets),
                    inline: true
                },
                {
                    name: `${this.emojis.crystal} Confluence Analysis`,
                    value: this.formatConfluenceAnalysis(confluence),
                    inline: false
                }
            ],
            footer: {
                text: `Generated ${this.formatTimestamp()} • TJR Trading Bot`,
                icon_url: 'https://cdn.discordapp.com/attachments/123/456/icon.png'
            }
        };

        // Add risk events if any
        if (riskEvents && riskEvents.length > 0) {
            embed.fields.push({
                name: `${this.emojis.warning} Risk Events`,
                value: this.formatRiskEvents(riskEvents),
                inline: false
            });
        }

        // Add previous day analysis
        if (previousDayAnalysis) {
            embed.fields.push({
                name: `${this.emojis.money} Previous Day Review`,
                value: this.formatPreviousDayAnalysis(previousDayAnalysis),
                inline: false
            });
        }

        return {
            embeds: [embed],
            content: `**Daily Bias Update** ${biasEmoji} ${symbol} is showing **${bias}** bias`
        };
    }

    /**
     * Format real-time setup alert
     */
    formatSetupAlert(alertData) {
        const {
            symbol,
            type,
            setupType,
            price,
            stopLoss,
            takeProfit,
            riskReward,
            confluence,
            session,
            reasoning,
            timeframe,
            structureLevels,
            timestamp
        } = alertData;

        const direction = type === 'BUY' ? this.emojis.bullish : this.emojis.bearish;
        const quality = this.getSetupQuality(confluence);

        const embed = {
            title: `${this.emojis.lightning} Live Setup Alert`,
            description: `**${setupType}** setup on ${symbol}`,
            color: type === 'BUY' ? this.config.successColor : this.config.errorColor,
            timestamp: new Date(timestamp).toISOString(),
            fields: [
                {
                    name: `${direction} ${type} Setup`,
                    value: `**Entry:** ${price}\n**Stop Loss:** ${stopLoss}\n**Take Profit:** ${takeProfit}`,
                    inline: true
                },
                {
                    name: `${this.emojis.shield} Risk Management`,
                    value: `**R:R Ratio:** 1:${riskReward}\n**Confluence:** ${confluence}/10\n**Quality:** ${quality}`,
                    inline: true
                },
                {
                    name: `${this.emojis.chart} Setup Context`,
                    value: `**Session:** ${session}\n**Timeframe:** ${timeframe}\n**Type:** ${setupType}`,
                    inline: true
                },
                {
                    name: `${this.emojis.crystal} Analysis`,
                    value: reasoning || 'Multi-confluence setup identified',
                    inline: false
                }
            ],
            footer: {
                text: `Session: ${session} • ${this.formatTimestamp()}`,
                icon_url: 'https://cdn.discordapp.com/attachments/123/456/setup.png'
            }
        };

        // Add structure levels if available
        if (structureLevels && structureLevels.length > 0) {
            embed.fields.push({
                name: `${this.emojis.target} Key Levels`,
                value: this.formatStructureLevels(structureLevels),
                inline: false
            });
        }

        const urgencyText = confluence >= 9 ? `${this.emojis.fire} HIGH PRIORITY` :
                          confluence >= 7 ? `${this.emojis.rocket} GOOD SETUP` : 'Standard Setup';

        return {
            embeds: [embed],
            content: `${urgencyText} - ${symbol} ${type} setup ready!`
        };
    }

    /**
     * Format session level report
     */
    formatSessionReport(sessionData) {
        const {
            session,
            startTime,
            endTime,
            pairs,
            opportunities,
            performance,
            highlights,
            nextSession
        } = sessionData;

        const embed = {
            title: `${this.emojis.clock} ${session} Session Report`,
            description: `Session summary and performance overview`,
            color: this.config.embedColor,
            timestamp: new Date().toISOString(),
            fields: [
                {
                    name: `${this.emojis.chart} Session Overview`,
                    value: `**Duration:** ${startTime} - ${endTime}\n**Pairs Analyzed:** ${pairs.length}\n**Opportunities:** ${opportunities.length}`,
                    inline: true
                },
                {
                    name: `${this.emojis.money} Performance`,
                    value: this.formatSessionPerformance(performance),
                    inline: true
                },
                {
                    name: `${this.emojis.fire} Session Highlights`,
                    value: this.formatSessionHighlights(highlights),
                    inline: false
                }
            ],
            footer: {
                text: `Next Session: ${nextSession.name} in ${nextSession.timeUntil}`,
                icon_url: 'https://cdn.discordapp.com/attachments/123/456/session.png'
            }
        };

        // Add top opportunities
        if (opportunities.length > 0) {
            const topOpportunities = opportunities
                .sort((a, b) => b.confluence - a.confluence)
                .slice(0, 3);

            embed.fields.push({
                name: `${this.emojis.target} Top Opportunities`,
                value: this.formatTopOpportunities(topOpportunities),
                inline: false
            });
        }

        return {
            embeds: [embed],
            content: `${session} session complete. ${opportunities.length} opportunities identified.`
        };
    }

    /**
     * Format performance summary
     */
    formatPerformanceSummary(performanceData) {
        const {
            period,
            totalTrades,
            winningTrades,
            losingTrades,
            winRate,
            totalPnL,
            averageRR,
            maxDrawdown,
            profitFactor,
            setupBreakdown,
            bestSetup,
            worstSetup,
            tradingDays
        } = performanceData;

        const profitEmoji = totalPnL > 0 ? this.emojis.bullish : this.emojis.bearish;
        const winRateEmoji = winRate >= 0.7 ? this.emojis.fire : winRate >= 0.5 ? this.emojis.rocket : this.emojis.warning;

        const embed = {
            title: `${this.emojis.money} Performance Summary - ${period}`,
            description: `Comprehensive trading performance analysis`,
            color: totalPnL > 0 ? this.config.successColor : this.config.errorColor,
            timestamp: new Date().toISOString(),
            fields: [
                {
                    name: `${this.emojis.chart} Overall Statistics`,
                    value: `**Total Trades:** ${totalTrades}\n**Win Rate:** ${(winRate * 100).toFixed(1)}% ${winRateEmoji}\n**Trading Days:** ${tradingDays}`,
                    inline: true
                },
                {
                    name: `${profitEmoji} P&L Performance`,
                    value: `**Total P&L:** ${totalPnL > 0 ? '+' : ''}${totalPnL.toFixed(2)} R\n**Average R:** ${averageRR.toFixed(2)}\n**Profit Factor:** ${profitFactor.toFixed(2)}`,
                    inline: true
                },
                {
                    name: `${this.emojis.shield} Risk Metrics`,
                    value: `**Max Drawdown:** ${(maxDrawdown * 100).toFixed(1)}%\n**Wins:** ${winningTrades}\n**Losses:** ${losingTrades}`,
                    inline: true
                },
                {
                    name: `${this.emojis.crystal} Setup Analysis`,
                    value: this.formatSetupBreakdown(setupBreakdown),
                    inline: false
                }
            ],
            footer: {
                text: `Analysis Period: ${period} • Generated ${this.formatTimestamp()}`,
                icon_url: 'https://cdn.discordapp.com/attachments/123/456/performance.png'
            }
        };

        // Add best and worst performing setups
        if (bestSetup && worstSetup) {
            embed.fields.push({
                name: `${this.emojis.target} Setup Performance`,
                value: `**Best:** ${bestSetup.name} (${(bestSetup.winRate * 100).toFixed(1)}% WR)\n**Needs Work:** ${worstSetup.name} (${(worstSetup.winRate * 100).toFixed(1)}% WR)`,
                inline: false
            });
        }

        return {
            embeds: [embed],
            content: `${period} performance summary: ${(winRate * 100).toFixed(1)}% win rate, ${totalPnL > 0 ? '+' : ''}${totalPnL.toFixed(2)} R total`
        };
    }

    /**
     * Format error/warning notifications
     */
    formatErrorNotification(errorData) {
        const {
            type,
            severity, // 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
            message,
            details,
            timestamp,
            component,
            actionRequired
        } = errorData;

        const severityEmoji = {
            'LOW': '🟡',
            'MEDIUM': '🟠',
            'HIGH': '🔴',
            'CRITICAL': '🚨'
        };

        const embed = {
            title: `${severityEmoji[severity]} ${type} - ${severity} Priority`,
            description: message,
            color: this.getSeverityColor(severity),
            timestamp: new Date(timestamp).toISOString(),
            fields: [
                {
                    name: 'Component',
                    value: component,
                    inline: true
                },
                {
                    name: 'Severity',
                    value: severity,
                    inline: true
                }
            ],
            footer: {
                text: `System Alert • ${this.formatTimestamp()}`
            }
        };

        if (details) {
            embed.fields.push({
                name: 'Details',
                value: details.length > 1024 ? details.substring(0, 1021) + '...' : details,
                inline: false
            });
        }

        if (actionRequired) {
            embed.fields.push({
                name: `${this.emojis.warning} Action Required`,
                value: actionRequired,
                inline: false
            });
        }

        return {
            embeds: [embed],
            content: severity === 'CRITICAL' ? '@here Critical System Alert!' : null
        };
    }

    /**
     * Format market structure analysis
     */
    formatMarketStructure(structure) {
        const {
            trend,
            phase,
            keyLevels,
            strength
        } = structure;

        return `**Trend:** ${trend}\n**Phase:** ${phase}\n**Strength:** ${strength}/10\n**Key Levels:** ${keyLevels}`;
    }

    /**
     * Format key levels display
     */
    formatKeyLevels(levels) {
        if (!levels || levels.length === 0) {
            return 'No significant levels identified';
        }

        return levels
            .slice(0, 5) // Show top 5 levels
            .map(level => `**${level.type}:** ${level.price} (${level.strength})`)
            .join('\n');
    }

    /**
     * Format session targets
     */
    formatSessionTargets(targets) {
        const {
            london,
            newYork,
            asian
        } = targets;

        return `**London:** ${london}\n**New York:** ${newYork}\n**Asian:** ${asian}`;
    }

    /**
     * Format confluence analysis
     */
    formatConfluenceAnalysis(confluence) {
        if (!confluence || confluence.length === 0) {
            return 'Standard confluence setup';
        }

        return confluence
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 5)
            .map(item => `• ${item.type} (${item.weight}x)`)
            .join('\n');
    }

    /**
     * Format risk events
     */
    formatRiskEvents(events) {
        return events
            .map(event => `${this.emojis.warning} **${event.time}** - ${event.event} (${event.impact})`)
            .join('\n');
    }

    /**
     * Format previous day analysis
     */
    formatPreviousDayAnalysis(analysis) {
        const {
            outcome,
            pnl,
            lessons
        } = analysis;

        return `**Outcome:** ${outcome}\n**P&L:** ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)} R\n**Key Lesson:** ${lessons}`;
    }

    /**
     * Format structure levels for setup alerts
     */
    formatStructureLevels(levels) {
        return levels
            .slice(0, 3)
            .map(level => `• ${level.type}: ${level.price}`)
            .join('\n');
    }

    /**
     * Format session performance
     */
    formatSessionPerformance(performance) {
        const {
            trades,
            wins,
            pnl,
            bestTrade
        } = performance;

        const winRate = trades > 0 ? (wins / trades * 100).toFixed(1) : '0';
        return `**Trades:** ${trades}\n**Win Rate:** ${winRate}%\n**P&L:** ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)} R\n**Best:** +${bestTrade.toFixed(2)} R`;
    }

    /**
     * Format session highlights
     */
    formatSessionHighlights(highlights) {
        if (!highlights || highlights.length === 0) {
            return 'No significant highlights';
        }

        return highlights
            .slice(0, 3)
            .map(highlight => `• ${highlight}`)
            .join('\n');
    }

    /**
     * Format top opportunities
     */
    formatTopOpportunities(opportunities) {
        return opportunities
            .map((opp, index) =>
                `${index + 1}. **${opp.symbol}** ${opp.type} (${opp.confluence}/10)`
            )
            .join('\n');
    }

    /**
     * Format setup breakdown
     */
    formatSetupBreakdown(breakdown) {
        if (!breakdown || Object.keys(breakdown).length === 0) {
            return 'No setup data available';
        }

        return Object.entries(breakdown)
            .sort(([,a], [,b]) => b.winRate - a.winRate)
            .slice(0, 4)
            .map(([setup, data]) =>
                `• **${setup}:** ${(data.winRate * 100).toFixed(1)}% (${data.trades} trades)`
            )
            .join('\n');
    }

    /**
     * Get color based on bias
     */
    getColorForBias(bias) {
        switch (bias) {
            case 'BULLISH': return this.config.successColor;
            case 'BEARISH': return this.config.errorColor;
            default: return this.config.embedColor;
        }
    }

    /**
     * Get setup quality based on confluence
     */
    getSetupQuality(confluence) {
        if (confluence >= 9) return 'PREMIUM';
        if (confluence >= 8) return 'HIGH';
        if (confluence >= 7) return 'GOOD';
        if (confluence >= 6) return 'STANDARD';
        return 'LOW';
    }

    /**
     * Get color based on severity
     */
    getSeverityColor(severity) {
        switch (severity) {
            case 'LOW': return '#FEE75C';
            case 'MEDIUM': return '#FF9500';
            case 'HIGH': return '#ED4245';
            case 'CRITICAL': return '#992D22';
            default: return this.config.embedColor;
        }
    }

    /**
     * Format timestamp
     */
    formatTimestamp() {
        return new Date().toLocaleString('en-US', {
            timeZone: this.config.timezone,
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });
    }

    /**
     * Create simple text alert for rate-limited scenarios
     */
    formatSimpleAlert(alertData) {
        const { symbol, type, price, confluence, setupType } = alertData;
        const direction = type === 'BUY' ? '🟢' : '🔴';

        return `${direction} **${symbol}** ${type} setup at ${price} | Confluence: ${confluence}/10 | Setup: ${setupType}`;
    }

    /**
     * Format batch alerts for multiple simultaneous opportunities
     */
    formatBatchAlert(alerts) {
        if (alerts.length === 1) {
            return this.formatSetupAlert(alerts[0]);
        }

        const embed = {
            title: `${this.emojis.lightning} Multiple Setup Alerts`,
            description: `${alerts.length} opportunities identified across different pairs`,
            color: this.config.embedColor,
            timestamp: new Date().toISOString(),
            fields: alerts.slice(0, 10).map((alert, index) => ({
                name: `${index + 1}. ${alert.symbol} ${alert.type}`,
                value: `**Entry:** ${alert.price} | **R:R:** 1:${alert.riskReward} | **Score:** ${alert.confluence}/10`,
                inline: true
            })),
            footer: {
                text: `Batch Alert • ${this.formatTimestamp()}`
            }
        };

        return {
            embeds: [embed],
            content: `🔥 **MULTIPLE SETUPS** - ${alerts.length} opportunities ready!`
        };
    }
}

module.exports = NotificationTemplates;