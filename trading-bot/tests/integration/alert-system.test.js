/**
 * Integration Tests for Alert System
 * Tests end-to-end alert delivery and management
 */

const AlertManager = require('../../src/alerts/manager');
const AlertDelivery = require('../../src/alerts/delivery');
const AlertTemplates = require('../../src/alerts/templates');
const { Client } = require('discord.js');
const logger = require('../../src/utils/logger');

// Mock Discord client
const mockDiscordClient = {
    channels: {
        cache: new Map([
            ['123456789', {
                id: '123456789',
                name: 'trading-alerts',
                send: jest.fn().mockResolvedValue({ id: 'msg123' })
            }],
            ['987654321', {
                id: '987654321',
                name: 'vip-signals',
                send: jest.fn().mockResolvedValue({ id: 'msg456' })
            }]
        ]),
        fetch: jest.fn().mockImplementation(id =>
            Promise.resolve(mockDiscordClient.channels.cache.get(id))
        )
    },
    users: {
        cache: new Map([
            ['user123', {
                id: 'user123',
                username: 'TestUser',
                send: jest.fn().mockResolvedValue({ id: 'dm123' })
            }]
        ]),
        fetch: jest.fn().mockImplementation(id =>
            Promise.resolve(mockDiscordClient.users.cache.get(id))
        )
    }
};

const mockAnalysisData = {
    symbol: 'EURUSD',
    timeframe: '1h',
    bias: 'Bullish',
    confidence: 85,
    keyLevel: 1.0850,
    entryPrice: 1.0855,
    stopLoss: 1.0835,
    takeProfit: 1.0885,
    riskReward: 1.5,
    reasoning: ['Strong bullish momentum', 'Key level break', 'High volume confirmation']
};

const mockAlertConfig = {
    channels: {
        'trading-alerts': '123456789',
        'vip-signals': '987654321'
    },
    users: {
        premium: ['user123']
    },
    templates: {
        bias: 'bias_alert',
        signal: 'trading_signal',
        level: 'key_level_alert'
    }
};

describe('Alert System Integration Tests', () => {
    let alertManager;
    let alertDelivery;
    let alertTemplates;

    beforeEach(async () => {
        alertTemplates = new AlertTemplates();
        alertDelivery = new AlertDelivery(mockDiscordClient, mockAlertConfig);
        alertManager = new AlertManager(alertDelivery, alertTemplates, {
            rateLimiting: {
                enabled: true,
                maxAlertsPerMinute: 10,
                maxAlertsPerSymbol: 3
            },
            duplicateDetection: {
                enabled: true,
                timeWindow: 300000 // 5 minutes
            }
        });

        await alertManager.initialize();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Alert Manager Initialization', () => {
        test('should initialize alert manager successfully', async () => {
            expect(alertManager.isInitialized).toBe(true);
            expect(alertManager.deliveryService).toBeDefined();
            expect(alertManager.templateService).toBeDefined();
        });

        test('should load alert configuration', async () => {
            const config = alertManager.getConfiguration();

            expect(config).toMatchObject({
                channels: expect.any(Object),
                users: expect.any(Object),
                rateLimiting: expect.any(Object)
            });
        });

        test('should validate alert channels on startup', async () => {
            const channelValidation = await alertManager.validateChannels();

            expect(channelValidation).toMatchObject({
                validChannels: ['123456789', '987654321'],
                invalidChannels: []
            });
        });
    });

    describe('Bias Alert Generation and Delivery', () => {
        test('should generate and send bias change alert', async () => {
            const biasAlert = {
                type: 'bias_change',
                symbol: 'EURUSD',
                timeframe: '4h',
                previousBias: 'Neutral',
                newBias: 'Bullish',
                confidence: 80,
                timestamp: new Date()
            };

            const result = await alertManager.sendBiasAlert(biasAlert);

            expect(result.success).toBe(true);
            expect(result.deliveredTo).toContain('123456789');

            const channel = mockDiscordClient.channels.cache.get('123456789');
            expect(channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Bias Change'),
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Symbol',
                                    value: 'EURUSD'
                                }),
                                expect.objectContaining({
                                    name: 'New Bias',
                                    value: 'Bullish'
                                })
                            ])
                        })
                    ])
                })
            );
        });

        test('should handle high confidence bias alerts differently', async () => {
            const highConfidenceAlert = {
                type: 'bias_change',
                symbol: 'GBPUSD',
                timeframe: '1h',
                previousBias: 'Bearish',
                newBias: 'Bullish',
                confidence: 95,
                timestamp: new Date()
            };

            const result = await alertManager.sendBiasAlert(highConfidenceAlert);

            expect(result.priority).toBe('high');
            expect(result.deliveredTo).toContain('987654321'); // VIP channel

            const vipChannel = mockDiscordClient.channels.cache.get('987654321');
            expect(vipChannel.send).toHaveBeenCalled();
        });
    });

    describe('Trading Signal Alerts', () => {
        test('should generate and send trading signal alert', async () => {
            const signalAlert = {
                type: 'trading_signal',
                symbol: 'USDJPY',
                action: 'BUY',
                entryPrice: 149.50,
                stopLoss: 149.20,
                takeProfit: 149.95,
                riskReward: 1.5,
                confidence: 85,
                reasoning: ['Bullish flag breakout', 'Strong volume confirmation'],
                timestamp: new Date()
            };

            const result = await alertManager.sendTradingSignal(signalAlert);

            expect(result.success).toBe(true);

            const channel = mockDiscordClient.channels.cache.get('123456789');
            expect(channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Trading Signal'),
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Action',
                                    value: 'BUY'
                                }),
                                expect.objectContaining({
                                    name: 'Entry Price',
                                    value: '149.50'
                                }),
                                expect.objectContaining({
                                    name: 'Risk/Reward',
                                    value: '1.5'
                                })
                            ])
                        })
                    ])
                })
            );
        });

        test('should add visual indicators for signal strength', async () => {
            const strongSignal = {
                type: 'trading_signal',
                symbol: 'EURUSD',
                action: 'SELL',
                confidence: 95,
                timestamp: new Date()
            };

            const result = await alertManager.sendTradingSignal(strongSignal);

            const channel = mockDiscordClient.channels.cache.get('123456789');
            const sentMessage = channel.send.mock.calls[0][0];

            // Should include visual indicators for strong signals
            expect(sentMessage.embeds[0].title).toContain('🔥');
            expect(sentMessage.embeds[0].color).toBe(0x00FF00); // Green for high confidence
        });
    });

    describe('Key Level Alerts', () => {
        test('should send alert when price approaches key level', async () => {
            const levelAlert = {
                type: 'key_level_approach',
                symbol: 'GBPUSD',
                currentPrice: 1.2795,
                keyLevel: 1.2800,
                levelType: 'resistance',
                distance: 5, // pips
                timeframe: '1h',
                timestamp: new Date()
            };

            const result = await alertManager.sendLevelAlert(levelAlert);

            expect(result.success).toBe(true);

            const channel = mockDiscordClient.channels.cache.get('123456789');
            expect(channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Key Level Alert'),
                            description: expect.stringContaining('approaching resistance')
                        })
                    ])
                })
            );
        });

        test('should send different alert for level break', async () => {
            const breakAlert = {
                type: 'key_level_break',
                symbol: 'AUDUSD',
                keyLevel: 0.6850,
                levelType: 'support',
                breakDirection: 'below',
                volume: 'high',
                timestamp: new Date()
            };

            const result = await alertManager.sendLevelAlert(breakAlert);

            const channel = mockDiscordClient.channels.cache.get('123456789');
            const sentMessage = channel.send.mock.calls[0][0];

            expect(sentMessage.embeds[0].title).toContain('Level Break');
            expect(sentMessage.embeds[0].description).toContain('broke below support');
        });
    });

    describe('Alert Rate Limiting and Deduplication', () => {
        test('should enforce rate limits per symbol', async () => {
            const baseAlert = {
                type: 'bias_change',
                symbol: 'EURUSD',
                timeframe: '1h',
                newBias: 'Bullish',
                confidence: 75,
                timestamp: new Date()
            };

            // Send multiple alerts for same symbol rapidly
            const results = [];
            for (let i = 0; i < 5; i++) {
                results.push(await alertManager.sendBiasAlert({
                    ...baseAlert,
                    timestamp: new Date(Date.now() + i * 1000)
                }));
            }

            // Should limit to 3 alerts per symbol (as configured)
            const successfulAlerts = results.filter(r => r.success).length;
            expect(successfulAlerts).toBeLessThanOrEqual(3);

            const rateLimitedAlerts = results.filter(r => r.rateLimited).length;
            expect(rateLimitedAlerts).toBeGreaterThan(0);
        });

        test('should detect and prevent duplicate alerts', async () => {
            const alert = {
                type: 'trading_signal',
                symbol: 'USDJPY',
                action: 'BUY',
                entryPrice: 149.50,
                confidence: 80,
                timestamp: new Date()
            };

            // Send same alert twice
            const result1 = await alertManager.sendTradingSignal(alert);
            const result2 = await alertManager.sendTradingSignal(alert);

            expect(result1.success).toBe(true);
            expect(result2.duplicate).toBe(true);
            expect(result2.success).toBe(false);

            // Should only send once
            const channel = mockDiscordClient.channels.cache.get('123456789');
            expect(channel.send).toHaveBeenCalledTimes(1);
        });

        test('should allow similar alerts after time window expires', async () => {
            const alert = {
                type: 'bias_change',
                symbol: 'EURUSD',
                newBias: 'Bullish',
                confidence: 75
            };

            await alertManager.sendBiasAlert({
                ...alert,
                timestamp: new Date(Date.now() - 400000) // 6+ minutes ago
            });

            const result = await alertManager.sendBiasAlert({
                ...alert,
                timestamp: new Date() // Now
            });

            expect(result.success).toBe(true);
            expect(result.duplicate).toBe(false);
        });
    });

    describe('Multi-Channel Alert Distribution', () => {
        test('should distribute alerts to appropriate channels', async () => {
            const premiumSignal = {
                type: 'trading_signal',
                symbol: 'EURUSD',
                action: 'BUY',
                confidence: 90,
                premium: true,
                timestamp: new Date()
            };

            const result = await alertManager.sendTradingSignal(premiumSignal);

            expect(result.deliveredTo).toEqual(
                expect.arrayContaining(['123456789', '987654321'])
            );

            // Should send to both regular and VIP channels
            const regularChannel = mockDiscordClient.channels.cache.get('123456789');
            const vipChannel = mockDiscordClient.channels.cache.get('987654321');

            expect(regularChannel.send).toHaveBeenCalled();
            expect(vipChannel.send).toHaveBeenCalled();
        });

        test('should send direct messages to premium users', async () => {
            const urgentAlert = {
                type: 'market_event',
                symbol: 'USDJPY',
                event: 'Major news release',
                impact: 'high',
                directMessage: true,
                timestamp: new Date()
            };

            const result = await alertManager.sendMarketEvent(urgentAlert);

            expect(result.directMessagesSent).toBe(1);

            const user = mockDiscordClient.users.cache.get('user123');
            expect(user.send).toHaveBeenCalled();
        });
    });

    describe('Alert Templates and Formatting', () => {
        test('should use appropriate templates for different alert types', async () => {
            const biasAlert = {
                type: 'bias_change',
                symbol: 'GBPUSD',
                newBias: 'Bearish',
                confidence: 78
            };

            await alertManager.sendBiasAlert(biasAlert);

            const channel = mockDiscordClient.channels.cache.get('123456789');
            const sentMessage = channel.send.mock.calls[0][0];

            // Should use bias template format
            expect(sentMessage.embeds[0]).toMatchObject({
                title: expect.stringContaining('Market Bias'),
                fields: expect.arrayContaining([
                    expect.objectContaining({ name: 'Symbol' }),
                    expect.objectContaining({ name: 'New Bias' }),
                    expect.objectContaining({ name: 'Confidence' })
                ])
            });
        });

        test('should format currency pairs consistently', async () => {
            const alert = {
                type: 'bias_change',
                symbol: 'eurusd',
                newBias: 'Bullish'
            };

            await alertManager.sendBiasAlert(alert);

            const channel = mockDiscordClient.channels.cache.get('123456789');
            const sentMessage = channel.send.mock.calls[0][0];

            // Should format as EURUSD (uppercase)
            expect(sentMessage.embeds[0].fields[0].value).toBe('EURUSD');
        });

        test('should include proper timestamps and metadata', async () => {
            const alert = {
                type: 'trading_signal',
                symbol: 'USDJPY',
                action: 'SELL',
                timestamp: new Date('2024-01-01T10:30:00Z')
            };

            await alertManager.sendTradingSignal(alert);

            const channel = mockDiscordClient.channels.cache.get('123456789');
            const sentMessage = channel.send.mock.calls[0][0];

            expect(sentMessage.embeds[0].timestamp).toBeDefined();
            expect(sentMessage.embeds[0].footer).toMatchObject({
                text: expect.stringContaining('Trading Bot')
            });
        });
    });

    describe('Error Handling and Resilience', () => {
        test('should handle Discord API errors gracefully', async () => {
            const channel = mockDiscordClient.channels.cache.get('123456789');
            channel.send.mockRejectedValue(new Error('Missing Access'));

            const alert = {
                type: 'bias_change',
                symbol: 'EURUSD',
                newBias: 'Bullish'
            };

            const result = await alertManager.sendBiasAlert(alert);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Missing Access');

            // Should log the error
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to send alert'),
                expect.any(Object)
            );
        });

        test('should retry failed alert delivery', async () => {
            const channel = mockDiscordClient.channels.cache.get('123456789');
            channel.send
                .mockRejectedValueOnce(new Error('Rate limited'))
                .mockResolvedValue({ id: 'retry-success' });

            const alert = {
                type: 'trading_signal',
                symbol: 'GBPUSD',
                action: 'BUY'
            };

            const result = await alertManager.sendTradingSignal(alert);

            expect(result.success).toBe(true);
            expect(result.retryCount).toBe(1);
            expect(channel.send).toHaveBeenCalledTimes(2);
        });

        test('should fallback to alternative channels when primary fails', async () => {
            const primaryChannel = mockDiscordClient.channels.cache.get('123456789');
            const fallbackChannel = mockDiscordClient.channels.cache.get('987654321');

            primaryChannel.send.mockRejectedValue(new Error('Channel unavailable'));

            const alert = {
                type: 'urgent_alert',
                symbol: 'EURUSD',
                message: 'Critical market event',
                fallbackChannels: ['987654321']
            };

            const result = await alertManager.sendUrgentAlert(alert);

            expect(result.success).toBe(true);
            expect(result.deliveredTo).toContain('987654321');
            expect(fallbackChannel.send).toHaveBeenCalled();
        });

        test('should handle malformed alert data', async () => {
            const malformedAlert = {
                type: 'bias_change',
                // Missing required fields
            };

            const result = await alertManager.sendBiasAlert(malformedAlert);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid alert data');

            // Should not attempt to send
            const channel = mockDiscordClient.channels.cache.get('123456789');
            expect(channel.send).not.toHaveBeenCalled();
        });
    });

    describe('Alert Analytics and Monitoring', () => {
        test('should track alert delivery statistics', async () => {
            // Send various types of alerts
            await alertManager.sendBiasAlert({
                type: 'bias_change',
                symbol: 'EURUSD',
                newBias: 'Bullish'
            });

            await alertManager.sendTradingSignal({
                type: 'trading_signal',
                symbol: 'GBPUSD',
                action: 'SELL'
            });

            const stats = alertManager.getDeliveryStats();

            expect(stats).toMatchObject({
                totalAlerts: 2,
                successfulDeliveries: 2,
                failedDeliveries: 0,
                rateLimitedAlerts: 0,
                duplicateAlerts: 0,
                averageDeliveryTime: expect.any(Number)
            });
        });

        test('should monitor alert engagement metrics', async () => {
            // Mock message reactions and responses
            const mockMessage = {
                id: 'msg123',
                reactions: {
                    cache: new Map([
                        ['👍', { count: 5 }],
                        ['👎', { count: 1 }]
                    ])
                }
            };

            mockDiscordClient.channels.cache.get('123456789').send
                .mockResolvedValue(mockMessage);

            await alertManager.sendTradingSignal({
                type: 'trading_signal',
                symbol: 'EURUSD',
                action: 'BUY'
            });

            // Simulate tracking engagement after some time
            await new Promise(resolve => setTimeout(resolve, 100));

            const engagement = await alertManager.trackAlertEngagement('msg123');

            expect(engagement).toMatchObject({
                messageId: 'msg123',
                reactions: {
                    positive: 5,
                    negative: 1
                },
                engagementScore: expect.any(Number)
            });
        });
    });

    describe('Alert Configuration Management', () => {
        test('should allow dynamic configuration updates', async () => {
            const newConfig = {
                rateLimiting: {
                    enabled: true,
                    maxAlertsPerMinute: 5, // Reduced from 10
                    maxAlertsPerSymbol: 2  // Reduced from 3
                }
            };

            await alertManager.updateConfiguration(newConfig);

            const updatedConfig = alertManager.getConfiguration();
            expect(updatedConfig.rateLimiting.maxAlertsPerMinute).toBe(5);
            expect(updatedConfig.rateLimiting.maxAlertsPerSymbol).toBe(2);
        });

        test('should validate configuration changes', async () => {
            const invalidConfig = {
                rateLimiting: {
                    maxAlertsPerMinute: -1 // Invalid negative value
                }
            };

            await expect(
                alertManager.updateConfiguration(invalidConfig)
            ).rejects.toThrow('Invalid configuration');
        });
    });
});