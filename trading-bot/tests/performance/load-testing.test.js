/**
 * Load Testing Suite for Trading Bot
 * Tests system performance under various load conditions
 */

const request = require('supertest');
const { performance } = require('perf_hooks');
const cluster = require('cluster');
const TradingBot = require('../../src/bot/index');
const DatabaseConnection = require('../../src/database/connection');
const logger = require('../../src/utils/logger');

// Mock Discord client for load testing
const mockDiscordClient = {
    user: { tag: 'LoadTestBot#1234' },
    guilds: { cache: { size: 10 } },
    users: { cache: { size: 1000 } },
    ws: { ping: 25 },
    readyAt: new Date(),
    channels: {
        cache: new Map([
            ['channel1', {
                id: 'channel1',
                send: jest.fn().mockResolvedValue({ id: 'msg1' })
            }]
        ])
    }
};

const mockDatabase = {
    connect: jest.fn().mockResolvedValue(),
    query: jest.fn().mockResolvedValue({ rows: [] }),
    insertPriceData: jest.fn().mockResolvedValue(100),
    getPriceData: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue()
};

describe('Load Testing Suite', () => {
    let app;
    let server;
    let bot;

    beforeAll(async () => {
        // Initialize bot for testing
        bot = new TradingBot();
        bot.client = mockDiscordClient;
        app = bot.app;

        // Start server on random port
        server = app.listen(0);

        // Suppress logs during load testing
        logger.level = 'error';
    });

    afterAll(async () => {
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
        logger.level = 'info';
    });

    describe('Webhook Load Testing', () => {
        const generateWebhookPayload = (index) => ({
            symbol: `PAIR${index % 10}`,
            action: index % 2 === 0 ? 'BUY' : 'SELL',
            price: 1.0000 + (index % 1000) * 0.0001,
            time: new Date().toISOString(),
            strategy: 'Load Test Strategy'
        });

        test('should handle 100 concurrent webhook requests', async () => {
            const concurrentRequests = 100;
            const requests = [];
            const startTime = performance.now();

            for (let i = 0; i < concurrentRequests; i++) {
                requests.push(
                    request(app)
                        .post('/webhook')
                        .send(generateWebhookPayload(i))
                );
            }

            const responses = await Promise.allSettled(requests);
            const endTime = performance.now();

            const successful = responses.filter(r => r.status === 'fulfilled' && r.value.status === 200).length;
            const failed = responses.length - successful;
            const totalTime = endTime - startTime;
            const avgResponseTime = totalTime / concurrentRequests;

            console.log(`Load Test Results - 100 Concurrent Webhooks:`);
            console.log(`  Successful: ${successful}/${concurrentRequests}`);
            console.log(`  Failed: ${failed}`);
            console.log(`  Total Time: ${totalTime.toFixed(2)}ms`);
            console.log(`  Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
            console.log(`  Requests/second: ${(concurrentRequests / (totalTime / 1000)).toFixed(2)}`);

            // Performance assertions
            expect(successful).toBeGreaterThan(concurrentRequests * 0.95); // 95% success rate
            expect(avgResponseTime).toBeLessThan(500); // Average response under 500ms
            expect(totalTime).toBeLessThan(5000); // Complete within 5 seconds
        });

        test('should handle sustained load over time', async () => {
            const requestsPerSecond = 10;
            const durationSeconds = 30;
            const totalRequests = requestsPerSecond * durationSeconds;

            const results = {
                successful: 0,
                failed: 0,
                responseTimes: [],
                errors: []
            };

            console.log(`Starting sustained load test: ${requestsPerSecond} req/sec for ${durationSeconds}s`);

            const startTime = performance.now();

            // Send requests at steady rate
            for (let second = 0; second < durationSeconds; second++) {
                const secondStart = performance.now();
                const promises = [];

                for (let req = 0; req < requestsPerSecond; req++) {
                    const requestStart = performance.now();
                    const promise = request(app)
                        .post('/webhook')
                        .send(generateWebhookPayload(second * requestsPerSecond + req))
                        .then(response => {
                            const requestEnd = performance.now();
                            results.responseTimes.push(requestEnd - requestStart);
                            if (response.status === 200) {
                                results.successful++;
                            } else {
                                results.failed++;
                            }
                        })
                        .catch(error => {
                            results.failed++;
                            results.errors.push(error.message);
                        });

                    promises.push(promise);
                }

                await Promise.all(promises);

                // Wait for remainder of second
                const elapsed = performance.now() - secondStart;
                const remainingTime = 1000 - elapsed;
                if (remainingTime > 0) {
                    await new Promise(resolve => setTimeout(resolve, remainingTime));
                }
            }

            const totalTime = performance.now() - startTime;
            const avgResponseTime = results.responseTimes.reduce((a, b) => a + b, 0) / results.responseTimes.length;
            const p95ResponseTime = results.responseTimes.sort((a, b) => a - b)[Math.floor(results.responseTimes.length * 0.95)];

            console.log(`Sustained Load Test Results:`);
            console.log(`  Total Requests: ${totalRequests}`);
            console.log(`  Successful: ${results.successful}`);
            console.log(`  Failed: ${results.failed}`);
            console.log(`  Success Rate: ${(results.successful / totalRequests * 100).toFixed(2)}%`);
            console.log(`  Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
            console.log(`  95th Percentile Response Time: ${p95ResponseTime.toFixed(2)}ms`);
            console.log(`  Actual Duration: ${(totalTime / 1000).toFixed(2)}s`);

            // Performance assertions
            expect(results.successful / totalRequests).toBeGreaterThan(0.98); // 98% success rate
            expect(avgResponseTime).toBeLessThan(300); // Average under 300ms
            expect(p95ResponseTime).toBeLessThan(1000); // 95% under 1s
        });

        test('should handle burst traffic gracefully', async () => {
            // Simulate burst pattern: quiet -> burst -> quiet
            const burstSize = 50;
            const burstInterval = 100; // ms between requests in burst

            console.log(`Testing burst traffic: ${burstSize} requests with ${burstInterval}ms intervals`);

            // Phase 1: Normal load (5 requests)
            const normalRequests = [];
            for (let i = 0; i < 5; i++) {
                normalRequests.push(
                    request(app)
                        .post('/webhook')
                        .send(generateWebhookPayload(i))
                );
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            // Phase 2: Burst load
            const burstStart = performance.now();
            const burstRequests = [];

            for (let i = 0; i < burstSize; i++) {
                burstRequests.push(
                    request(app)
                        .post('/webhook')
                        .send(generateWebhookPayload(i + 100))
                );

                if (i < burstSize - 1) {
                    await new Promise(resolve => setTimeout(resolve, burstInterval));
                }
            }

            const burstResponses = await Promise.allSettled(burstRequests);
            const burstEnd = performance.now();

            const burstSuccessful = burstResponses.filter(
                r => r.status === 'fulfilled' && r.value.status === 200
            ).length;

            console.log(`Burst Test Results:`);
            console.log(`  Burst Requests: ${burstSize}`);
            console.log(`  Burst Successful: ${burstSuccessful}`);
            console.log(`  Burst Success Rate: ${(burstSuccessful / burstSize * 100).toFixed(2)}%`);
            console.log(`  Burst Duration: ${(burstEnd - burstStart).toFixed(2)}ms`);

            // System should handle burst gracefully
            expect(burstSuccessful / burstSize).toBeGreaterThan(0.90); // 90% success rate during burst
        });
    });

    describe('Database Load Testing', () => {
        let dbConnection;

        beforeAll(async () => {
            dbConnection = new DatabaseConnection();
            // Mock the database for load testing
            dbConnection.pool = mockDatabase;
        });

        test('should handle concurrent database operations', async () => {
            const concurrentQueries = 50;
            const queryTypes = ['SELECT', 'INSERT', 'UPDATE'];

            mockDatabase.query.mockImplementation(async (sql) => {
                // Simulate database processing time
                await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
                return { rows: [] };
            });

            const startTime = performance.now();
            const promises = [];

            for (let i = 0; i < concurrentQueries; i++) {
                const queryType = queryTypes[i % queryTypes.length];
                promises.push(
                    dbConnection.query(`${queryType} /* Load test query ${i} */`)
                );
            }

            const results = await Promise.allSettled(promises);
            const endTime = performance.now();

            const successful = results.filter(r => r.status === 'fulfilled').length;
            const totalTime = endTime - startTime;

            console.log(`Database Load Test Results:`);
            console.log(`  Concurrent Queries: ${concurrentQueries}`);
            console.log(`  Successful: ${successful}`);
            console.log(`  Total Time: ${totalTime.toFixed(2)}ms`);
            console.log(`  Average Query Time: ${(totalTime / concurrentQueries).toFixed(2)}ms`);

            expect(successful).toBe(concurrentQueries);
            expect(totalTime).toBeLessThan(3000); // Complete within 3 seconds
        });

        test('should handle bulk data insertion efficiently', async () => {
            const batchSizes = [100, 500, 1000];

            for (const batchSize of batchSizes) {
                const priceData = Array(batchSize).fill().map((_, index) => ({
                    timestamp: new Date(Date.now() + index * 60000),
                    open_price: 1.0000 + Math.random() * 0.01,
                    high_price: 1.0000 + Math.random() * 0.01,
                    low_price: 1.0000 + Math.random() * 0.01,
                    close_price: 1.0000 + Math.random() * 0.01,
                    volume: Math.floor(Math.random() * 1000000)
                }));

                const startTime = performance.now();

                mockDatabase.insertPriceData.mockResolvedValue(batchSize);
                await dbConnection.insertPriceData('EURUSD', '1m', priceData);

                const endTime = performance.now();
                const insertTime = endTime - startTime;
                const recordsPerSecond = (batchSize / (insertTime / 1000)).toFixed(0);

                console.log(`Bulk Insert Test - Batch Size ${batchSize}:`);
                console.log(`  Insert Time: ${insertTime.toFixed(2)}ms`);
                console.log(`  Records/Second: ${recordsPerSecond}`);

                // Performance expectations
                expect(insertTime).toBeLessThan(batchSize * 2); // Max 2ms per record
            }
        });
    });

    describe('Memory Usage Testing', () => {
        test('should maintain stable memory usage under load', async () => {
            const iterations = 100;
            const memorySnapshots = [];

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            const initialMemory = process.memoryUsage();
            memorySnapshots.push(initialMemory.heapUsed);

            console.log(`Initial Memory Usage: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);

            // Simulate load with memory-intensive operations
            for (let i = 0; i < iterations; i++) {
                // Generate large payload
                const largePayload = {
                    symbol: 'EURUSD',
                    data: Array(1000).fill().map((_, index) => ({
                        timestamp: Date.now() + index,
                        price: Math.random() * 2,
                        volume: Math.random() * 1000000
                    }))
                };

                await request(app)
                    .post('/webhook')
                    .send(largePayload);

                // Take memory snapshot every 10 iterations
                if (i % 10 === 0) {
                    const currentMemory = process.memoryUsage();
                    memorySnapshots.push(currentMemory.heapUsed);
                }
            }

            // Force garbage collection
            if (global.gc) {
                global.gc();
            }

            const finalMemory = process.memoryUsage();
            const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
            const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;

            console.log(`Final Memory Usage: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
            console.log(`Memory Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB (${memoryIncreasePercent.toFixed(2)}%)`);

            // Memory should not increase dramatically
            expect(memoryIncreasePercent).toBeLessThan(50); // Less than 50% increase
            expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase
        });

        test('should handle memory pressure gracefully', async () => {
            // Create memory pressure by allocating large objects
            const largeObjects = [];
            const objectSize = 1024 * 1024; // 1MB each

            try {
                // Allocate until we approach memory limit or reach test limit
                for (let i = 0; i < 100; i++) {
                    largeObjects.push(Buffer.alloc(objectSize));

                    // Test system responsiveness under memory pressure
                    const response = await request(app)
                        .post('/health')
                        .timeout(5000);

                    expect(response.status).toBe(200);

                    // Check if response time is still reasonable
                    // (this would need actual timing measurement in real implementation)
                }
            } catch (error) {
                // Expected behavior under extreme memory pressure
                expect(error.message).toMatch(/memory|timeout/i);
            } finally {
                // Clean up
                largeObjects.length = 0;
                if (global.gc) {
                    global.gc();
                }
            }
        });
    });

    describe('Discord Bot Load Testing', () => {
        test('should handle multiple concurrent command requests', async () => {
            const concurrentCommands = 25;
            const commands = ['!ping', '!help', '!bias EURUSD 1h', '!levels GBPUSD 4h'];

            const mockMessages = Array(concurrentCommands).fill().map((_, index) => ({
                id: `msg${index}`,
                content: commands[index % commands.length],
                author: { id: `user${index}`, username: `User${index}`, bot: false },
                channel: mockDiscordClient.channels.cache.get('channel1'),
                guild: { id: 'guild1', name: 'Test Guild' },
                createdTimestamp: Date.now() + index,
                reply: jest.fn().mockResolvedValue({ id: `reply${index}` })
            }));

            const startTime = performance.now();

            const promises = mockMessages.map(message =>
                bot.commandHandler.handleMessage(message)
            );

            await Promise.allSettled(promises);

            const endTime = performance.now();
            const totalTime = endTime - startTime;

            console.log(`Discord Command Load Test Results:`);
            console.log(`  Concurrent Commands: ${concurrentCommands}`);
            console.log(`  Total Time: ${totalTime.toFixed(2)}ms`);
            console.log(`  Average Command Time: ${(totalTime / concurrentCommands).toFixed(2)}ms`);

            // Commands should process efficiently
            expect(totalTime).toBeLessThan(3000); // Complete within 3 seconds
        });

        test('should maintain command cooldowns under load', async () => {
            const userId = 'loadtest_user';
            const commandsToTest = 10;

            const mockMessage = {
                id: 'msg123',
                content: '!bias EURUSD 1h',
                author: { id: userId, username: 'LoadTestUser', bot: false },
                channel: mockDiscordClient.channels.cache.get('channel1'),
                guild: { id: 'guild1', name: 'Test Guild' },
                reply: jest.fn().mockResolvedValue({ id: 'reply123' })
            };

            let rateLimitedCount = 0;
            let successfulCount = 0;

            // Send rapid commands from same user
            for (let i = 0; i < commandsToTest; i++) {
                try {
                    await bot.commandHandler.handleMessage({
                        ...mockMessage,
                        id: `msg${i}`,
                        createdTimestamp: Date.now() + i
                    });
                    successfulCount++;
                } catch (error) {
                    if (error.message.includes('cooldown') || error.message.includes('rate limit')) {
                        rateLimitedCount++;
                    }
                }
            }

            console.log(`Cooldown Test Results:`);
            console.log(`  Commands Sent: ${commandsToTest}`);
            console.log(`  Successful: ${successfulCount}`);
            console.log(`  Rate Limited: ${rateLimitedCount}`);

            // Should enforce cooldowns
            expect(successfulCount).toBeLessThan(commandsToTest);
            expect(rateLimitedCount).toBeGreaterThan(0);
        });
    });

    describe('System Resource Monitoring', () => {
        test('should monitor CPU usage under load', async () => {
            const startUsage = process.cpuUsage();
            const startTime = performance.now();

            // Create CPU-intensive load
            const promises = [];
            for (let i = 0; i < 20; i++) {
                promises.push(
                    request(app)
                        .post('/webhook')
                        .send({
                            symbol: 'EURUSD',
                            action: 'BUY',
                            price: 1.0850,
                            complexAnalysis: Array(100).fill().map(() => Math.random())
                        })
                );
            }

            await Promise.all(promises);

            const endTime = performance.now();
            const endUsage = process.cpuUsage(startUsage);

            const cpuUsageMs = (endUsage.user + endUsage.system) / 1000;
            const wallClockMs = endTime - startTime;
            const cpuUsagePercent = (cpuUsageMs / wallClockMs) * 100;

            console.log(`CPU Usage Test Results:`);
            console.log(`  Wall Clock Time: ${wallClockMs.toFixed(2)}ms`);
            console.log(`  CPU Time: ${cpuUsageMs.toFixed(2)}ms`);
            console.log(`  CPU Usage: ${cpuUsagePercent.toFixed(2)}%`);

            // CPU usage should be reasonable
            expect(cpuUsagePercent).toBeLessThan(80); // Less than 80% CPU usage
        });

        test('should handle graceful degradation under resource constraints', async () => {
            // Simulate high load condition
            const highLoadRequests = 100;
            const promises = [];

            for (let i = 0; i < highLoadRequests; i++) {
                promises.push(
                    request(app)
                        .post('/health')
                        .timeout(10000) // 10 second timeout
                );
            }

            const results = await Promise.allSettled(promises);
            const successful = results.filter(r =>
                r.status === 'fulfilled' && r.value.status === 200
            ).length;

            const successRate = (successful / highLoadRequests) * 100;

            console.log(`Resource Constraint Test Results:`);
            console.log(`  Total Requests: ${highLoadRequests}`);
            console.log(`  Successful: ${successful}`);
            console.log(`  Success Rate: ${successRate.toFixed(2)}%`);

            // System should maintain some level of service
            expect(successRate).toBeGreaterThan(70); // At least 70% success rate
        });
    });
});

/**
 * Performance Test Utilities
 */
class LoadTestUtils {
    static async measureResponseTime(fn) {
        const start = performance.now();
        const result = await fn();
        const end = performance.now();
        return {
            result,
            responseTime: end - start
        };
    }

    static async runLoadTest(testFn, options = {}) {
        const {
            concurrency = 10,
            duration = 5000, // 5 seconds
            rampUp = 1000    // 1 second ramp up
        } = options;

        const results = [];
        const startTime = performance.now();
        let activeRequests = 0;
        let completed = 0;

        return new Promise((resolve) => {
            const interval = rampUp / concurrency;

            // Ramp up requests gradually
            for (let i = 0; i < concurrency; i++) {
                setTimeout(async () => {
                    activeRequests++;

                    while (performance.now() - startTime < duration) {
                        try {
                            const { result, responseTime } = await this.measureResponseTime(testFn);
                            results.push({ success: true, responseTime, result });
                        } catch (error) {
                            results.push({ success: false, error: error.message });
                        }
                        completed++;
                    }

                    activeRequests--;
                    if (activeRequests === 0) {
                        resolve({
                            totalRequests: completed,
                            successfulRequests: results.filter(r => r.success).length,
                            failedRequests: results.filter(r => !r.success).length,
                            averageResponseTime: results
                                .filter(r => r.success)
                                .reduce((sum, r) => sum + r.responseTime, 0) / results.filter(r => r.success).length,
                            results
                        });
                    }
                }, i * interval);
            }
        });
    }

    static generateRealisticWebhookData(count = 100) {
        const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'];
        const actions = ['BUY', 'SELL'];

        return Array(count).fill().map((_, index) => ({
            symbol: symbols[index % symbols.length],
            action: actions[index % actions.length],
            price: 1.0000 + (Math.random() - 0.5) * 0.1,
            timestamp: new Date(Date.now() + index * 1000).toISOString(),
            strategy: `Strategy_${Math.floor(Math.random() * 5) + 1}`,
            confidence: Math.floor(Math.random() * 40) + 60, // 60-100
            volume: Math.floor(Math.random() * 1000000) + 100000
        }));
    }
}

module.exports = { LoadTestUtils };