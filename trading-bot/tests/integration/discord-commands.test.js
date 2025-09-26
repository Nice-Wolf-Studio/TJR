/**
 * Integration Tests for Discord Commands
 * Tests end-to-end functionality of Discord bot commands
 */

const { Client } = require('discord.js');
const TradingBot = require('../../src/bot/index');
const config = require('../../config/bot');
const logger = require('../../src/utils/logger');

// Mock Discord client for testing
const mockDiscordClient = {
    user: { tag: 'TradingBot#1234' },
    guilds: { cache: { size: 5 } },
    users: { cache: { size: 100 } },
    ws: { ping: 50 },
    readyAt: new Date(),
    login: jest.fn().mockResolvedValue(),
    destroy: jest.fn(),
    on: jest.fn(),
    once: jest.fn()
};

// Mock command responses
const mockChannel = {
    id: '123456789',
    send: jest.fn().mockResolvedValue({ id: 'message123' }),
    type: 0 // Text channel
};

const mockGuild = {
    id: '987654321',
    name: 'Test Guild',
    memberCount: 50
};

const createMockMessage = (content, user = null) => ({
    id: 'msg123',
    content,
    author: user || {
        id: 'user123',
        username: 'TestUser',
        bot: false
    },
    channel: mockChannel,
    guild: mockGuild,
    createdTimestamp: Date.now(),
    delete: jest.fn().mockResolvedValue(),
    reply: jest.fn().mockResolvedValue({ id: 'reply123' })
});

describe('Discord Commands Integration Tests', () => {
    let bot;
    let commandHandler;

    beforeAll(async () => {
        // Override config for testing
        const testConfig = {
            ...config,
            discord: {
                ...config.discord,
                token: 'test-token'
            },
            server: {
                ...config.server,
                port: 0 // Use random port for testing
            }
        };

        // Mock the config module
        jest.doMock('../../config/bot', () => testConfig);

        // Initialize bot with mocked client
        bot = new TradingBot();
        bot.client = mockDiscordClient;
        commandHandler = bot.commandHandler;

        // Load commands
        await commandHandler.loadCommands();
    });

    afterAll(async () => {
        if (bot && bot.server) {
            await new Promise(resolve => bot.server.close(resolve));
        }
        jest.clearAllMocks();
    });

    describe('Help Command', () => {
        test('should respond to !help command', async () => {
            const message = createMockMessage('!help');

            await commandHandler.handleMessage(message);

            expect(message.channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Trading Bot Commands'),
                            fields: expect.any(Array)
                        })
                    ])
                })
            );
        });

        test('should show specific command help', async () => {
            const message = createMockMessage('!help bias');

            await commandHandler.handleMessage(message);

            expect(message.channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('bias'),
                            description: expect.any(String)
                        })
                    ])
                })
            );
        });
    });

    describe('Ping Command', () => {
        test('should respond with bot latency', async () => {
            const message = createMockMessage('!ping');

            await commandHandler.handleMessage(message);

            expect(message.channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Pong!'),
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Bot Latency',
                                    value: expect.stringMatching(/\d+ms/)
                                })
                            ])
                        })
                    ])
                })
            );
        });
    });

    describe('Bias Command', () => {
        test('should analyze market bias for valid symbol', async () => {
            const message = createMockMessage('!bias EURUSD 4h');

            // Mock the analysis engine response
            jest.spyOn(require('../../src/analysis/engine'), 'analyzeBias')
                .mockResolvedValue({
                    symbol: 'EURUSD',
                    timeframe: '4h',
                    bias: 'Bullish',
                    confidence: 75,
                    keyLevels: [1.0850, 1.0900, 1.0950],
                    analysis: {
                        structure: { trend: 'Uptrend', strength: 'Strong' },
                        patterns: [],
                        liquidity: { zones: [] }
                    }
                });

            await commandHandler.handleMessage(message);

            expect(message.channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('EURUSD Market Bias'),
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Current Bias',
                                    value: expect.stringContaining('Bullish')
                                })
                            ])
                        })
                    ])
                })
            );
        });

        test('should handle invalid symbol gracefully', async () => {
            const message = createMockMessage('!bias INVALID 1h');

            // Mock analysis engine to throw error
            jest.spyOn(require('../../src/analysis/engine'), 'analyzeBias')
                .mockRejectedValue(new Error('Invalid symbol'));

            await commandHandler.handleMessage(message);

            expect(message.channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Error'),
                            description: expect.stringContaining('Invalid symbol')
                        })
                    ])
                })
            );
        });
    });

    describe('Levels Command', () => {
        test('should identify key support and resistance levels', async () => {
            const message = createMockMessage('!levels GBPUSD 1h');

            // Mock the analysis engine response
            jest.spyOn(require('../../src/analysis/engine'), 'analyzeLevels')
                .mockResolvedValue({
                    symbol: 'GBPUSD',
                    timeframe: '1h',
                    levels: {
                        resistance: [1.2800, 1.2850, 1.2900],
                        support: [1.2750, 1.2700, 1.2650]
                    },
                    keyLevel: 1.2800,
                    priceAction: {
                        currentPrice: 1.2775,
                        trend: 'Sideways',
                        momentum: 'Neutral'
                    }
                });

            await commandHandler.handleMessage(message);

            expect(message.channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('GBPUSD Key Levels'),
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Resistance Levels',
                                    value: expect.stringContaining('1.2800')
                                }),
                                expect.objectContaining({
                                    name: 'Support Levels',
                                    value: expect.stringContaining('1.2750')
                                })
                            ])
                        })
                    ])
                })
            );
        });
    });

    describe('Flow Command', () => {
        test('should analyze order flow data', async () => {
            const message = createMockMessage('!flow USDJPY 15m');

            // Mock the analysis engine response
            jest.spyOn(require('../../src/analysis/engine'), 'analyzeFlow')
                .mockResolvedValue({
                    symbol: 'USDJPY',
                    timeframe: '15m',
                    flow: {
                        direction: 'Bullish',
                        strength: 'Moderate',
                        volume: 'High',
                        imbalances: [149.50, 149.80]
                    },
                    liquidity: {
                        zones: [
                            { price: 149.25, type: 'demand', strength: 'High' },
                            { price: 150.00, type: 'supply', strength: 'Medium' }
                        ]
                    }
                });

            await commandHandler.handleMessage(message);

            expect(message.channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('USDJPY Order Flow'),
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Flow Direction',
                                    value: expect.stringContaining('Bullish')
                                })
                            ])
                        })
                    ])
                })
            );
        });
    });

    describe('Setup Command', () => {
        test('should configure channel settings', async () => {
            const message = createMockMessage('!setup alerts on');

            await commandHandler.handleMessage(message);

            expect(message.channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Channel Setup'),
                            description: expect.stringContaining('alerts')
                        })
                    ])
                })
            );
        });

        test('should show current channel configuration', async () => {
            const message = createMockMessage('!setup status');

            await commandHandler.handleMessage(message);

            expect(message.channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Channel Configuration'),
                            fields: expect.any(Array)
                        })
                    ])
                })
            );
        });
    });

    describe('Command Cooldowns', () => {
        test('should enforce cooldown periods', async () => {
            const message = createMockMessage('!bias EURUSD 1h');

            // First command should work
            await commandHandler.handleMessage(message);
            expect(message.channel.send).toHaveBeenCalledTimes(1);

            // Second command immediately should be rate limited
            const message2 = createMockMessage('!bias EURUSD 1h');
            await commandHandler.handleMessage(message2);

            expect(message2.channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Rate Limited'),
                            description: expect.stringContaining('cooldown')
                        })
                    ])
                })
            );
        });
    });

    describe('Permission Handling', () => {
        test('should handle missing permissions gracefully', async () => {
            const restrictedChannel = {
                ...mockChannel,
                send: jest.fn().mockRejectedValue(new Error('Missing Access'))
            };

            const message = createMockMessage('!ping');
            message.channel = restrictedChannel;

            await commandHandler.handleMessage(message);

            // Should attempt to send via DM or handle error gracefully
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to send message'),
                expect.any(Object)
            );
        });
    });

    describe('Error Recovery', () => {
        test('should recover from command execution errors', async () => {
            const message = createMockMessage('!bias EURUSD 1h');

            // Mock analysis engine to throw error
            jest.spyOn(require('../../src/analysis/engine'), 'analyzeBias')
                .mockRejectedValue(new Error('Database connection failed'));

            await commandHandler.handleMessage(message);

            expect(message.channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Error'),
                            description: expect.stringContaining('temporarily unavailable')
                        })
                    ])
                })
            );
        });
    });

    describe('Command Statistics', () => {
        test('should track command usage statistics', async () => {
            const initialStats = bot.stats.commandsExecuted;

            const message = createMockMessage('!ping');
            await commandHandler.handleMessage(message);

            expect(bot.stats.commandsExecuted).toBe(initialStats + 1);
        });
    });
});

// Helper functions for integration testing
const IntegrationTestHelpers = {
    /**
     * Create a mock Discord environment
     */
    createMockEnvironment() {
        return {
            client: mockDiscordClient,
            channel: mockChannel,
            guild: mockGuild
        };
    },

    /**
     * Simulate command execution with timing
     */
    async executeCommandWithTiming(commandHandler, message) {
        const start = Date.now();
        await commandHandler.handleMessage(message);
        const end = Date.now();

        return {
            executionTime: end - start,
            success: !message.channel.send.mock.calls.some(call =>
                call[0]?.embeds?.[0]?.title?.includes('Error')
            )
        };
    },

    /**
     * Test command with various invalid inputs
     */
    async testCommandRobustness(commandHandler, command, invalidInputs) {
        const results = [];

        for (const input of invalidInputs) {
            const message = createMockMessage(`!${command} ${input}`);

            try {
                await commandHandler.handleMessage(message);

                results.push({
                    input,
                    handled: true,
                    errorMessage: message.channel.send.mock.calls
                        .find(call => call[0]?.embeds?.[0]?.title?.includes('Error'))
                        ?.[0]?.embeds?.[0]?.description
                });
            } catch (error) {
                results.push({
                    input,
                    handled: false,
                    error: error.message
                });
            }
        }

        return results;
    }
};

module.exports = { IntegrationTestHelpers };