/**
 * Health Check and Monitoring System
 * Comprehensive health monitoring for all system components
 */

const EventEmitter = require('events');
const os = require('os');
const process = require('process');
const dbConnection = require('../database/connection');
const storage = require('../data/storage');
const collector = require('../data/collector');
const rateLimit = require('../utils/rateLimit');
const logger = require('../utils/logger');

class HealthCheckManager extends EventEmitter {
    constructor() {
        super();
        this.checks = new Map();
        this.lastResults = new Map();
        this.isRunning = false;
        this.checkInterval = null;
        this.alertThresholds = {
            memory: 0.9, // 90% memory usage
            cpu: 0.8, // 80% CPU usage
            disk: 0.9, // 90% disk usage
            responseTime: 5000, // 5 seconds
            errorRate: 0.1 // 10% error rate
        };

        this.initializeChecks();
    }

    /**
     * Initialize all health checks
     */
    initializeChecks() {
        // System health checks
        this.registerCheck('system', 'System Resources', this.checkSystemHealth.bind(this), 30);
        this.registerCheck('process', 'Node.js Process', this.checkProcessHealth.bind(this), 30);

        // Database health checks
        this.registerCheck('database', 'Database Connection', this.checkDatabaseHealth.bind(this), 15);
        this.registerCheck('redis', 'Redis Connection', this.checkRedisHealth.bind(this), 15);

        // Application health checks
        this.registerCheck('data_collector', 'Data Collector', this.checkDataCollectorHealth.bind(this), 30);
        this.registerCheck('storage', 'Storage System', this.checkStorageHealth.bind(this), 30);
        this.registerCheck('rate_limits', 'Rate Limiting', this.checkRateLimitHealth.bind(this), 60);

        // External dependencies
        this.registerCheck('data_sources', 'Data Sources', this.checkDataSourcesHealth.bind(this), 60);

        logger.info(`Initialized ${this.checks.size} health checks`);
    }

    /**
     * Register a health check
     */
    registerCheck(id, name, checkFunction, intervalSeconds = 60) {
        this.checks.set(id, {
            id,
            name,
            check: checkFunction,
            interval: intervalSeconds * 1000,
            lastRun: null,
            nextRun: null,
            enabled: true
        });

        logger.debug(`Registered health check: ${name} (${intervalSeconds}s interval)`);
    }

    /**
     * Start health check monitoring
     */
    start(intervalSeconds = 30) {
        if (this.isRunning) {
            logger.warn('Health check manager is already running');
            return;
        }

        logger.info('Starting health check monitoring...');

        this.checkInterval = setInterval(async () => {
            await this.runDueChecks();
        }, intervalSeconds * 1000);

        this.isRunning = true;

        // Run initial checks
        setTimeout(() => this.runAllChecks(), 1000);

        logger.info('Health check monitoring started');
        this.emit('started');
    }

    /**
     * Stop health check monitoring
     */
    stop() {
        if (!this.isRunning) {
            logger.warn('Health check manager is not running');
            return;
        }

        logger.info('Stopping health check monitoring...');

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        this.isRunning = false;

        logger.info('Health check monitoring stopped');
        this.emit('stopped');
    }

    /**
     * Run all health checks
     */
    async runAllChecks() {
        logger.debug('Running all health checks');

        const results = {};
        const promises = [];

        for (const [id, check] of this.checks) {
            if (check.enabled) {
                promises.push(this.runSingleCheck(id, check));
            }
        }

        const checkResults = await Promise.allSettled(promises);

        checkResults.forEach((result, index) => {
            const checkId = Array.from(this.checks.keys())[index];
            if (result.status === 'fulfilled') {
                results[checkId] = result.value;
            } else {
                results[checkId] = {
                    status: 'error',
                    message: result.reason?.message || 'Check failed',
                    timestamp: new Date().toISOString()
                };
            }
        });

        this.processResults(results);
        return results;
    }

    /**
     * Run checks that are due
     */
    async runDueChecks() {
        const now = Date.now();
        const dueChecks = [];

        for (const [id, check] of this.checks) {
            if (!check.enabled) continue;

            const shouldRun = !check.lastRun ||
                             (now - check.lastRun) >= check.interval;

            if (shouldRun) {
                dueChecks.push({ id, check });
            }
        }

        if (dueChecks.length === 0) {
            return;
        }

        logger.debug(`Running ${dueChecks.length} due health checks`);

        const promises = dueChecks.map(({ id, check }) =>
            this.runSingleCheck(id, check)
        );

        const results = await Promise.allSettled(promises);

        const checkResults = {};
        results.forEach((result, index) => {
            const checkId = dueChecks[index].id;
            if (result.status === 'fulfilled') {
                checkResults[checkId] = result.value;
            } else {
                checkResults[checkId] = {
                    status: 'error',
                    message: result.reason?.message || 'Check failed',
                    timestamp: new Date().toISOString()
                };
            }
        });

        this.processResults(checkResults);
    }

    /**
     * Run a single health check
     */
    async runSingleCheck(id, check) {
        const startTime = Date.now();

        try {
            logger.debug(`Running health check: ${check.name}`);

            const result = await Promise.race([
                check.check(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Health check timeout')), 30000)
                )
            ]);

            const duration = Date.now() - startTime;

            check.lastRun = Date.now();
            check.nextRun = check.lastRun + check.interval;

            const healthResult = {
                id: id,
                name: check.name,
                status: result.status || 'healthy',
                message: result.message || 'Check passed',
                duration: duration,
                timestamp: new Date().toISOString(),
                details: result.details || {}
            };

            if (duration > this.alertThresholds.responseTime) {
                healthResult.warnings = [`Slow response time: ${duration}ms`];
            }

            return healthResult;

        } catch (error) {
            const duration = Date.now() - startTime;

            check.lastRun = Date.now();
            check.nextRun = check.lastRun + check.interval;

            logger.error(`Health check failed: ${check.name}`, error);

            return {
                id: id,
                name: check.name,
                status: 'error',
                message: error.message,
                duration: duration,
                timestamp: new Date().toISOString(),
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                }
            };
        }
    }

    /**
     * Process and store health check results
     */
    processResults(results) {
        const timestamp = new Date().toISOString();
        const summary = {
            timestamp: timestamp,
            overallStatus: 'healthy',
            totalChecks: Object.keys(results).length,
            healthyChecks: 0,
            warningChecks: 0,
            errorChecks: 0,
            checks: results
        };

        // Calculate summary statistics
        Object.values(results).forEach(result => {
            switch (result.status) {
                case 'healthy':
                    summary.healthyChecks++;
                    break;
                case 'warning':
                    summary.warningChecks++;
                    break;
                case 'error':
                    summary.errorChecks++;
                    break;
            }
        });

        // Determine overall status
        if (summary.errorChecks > 0) {
            summary.overallStatus = 'error';
        } else if (summary.warningChecks > 0) {
            summary.overallStatus = 'warning';
        }

        // Store results
        this.lastResults.set('latest', summary);

        // Emit events for status changes
        const previousSummary = this.lastResults.get('previous');
        if (previousSummary && previousSummary.overallStatus !== summary.overallStatus) {
            this.emit('statusChange', {
                from: previousSummary.overallStatus,
                to: summary.overallStatus,
                timestamp: timestamp
            });
        }

        this.lastResults.set('previous', previousSummary);

        // Log summary
        if (summary.overallStatus === 'healthy') {
            logger.info(`Health check completed: ${summary.healthyChecks}/${summary.totalChecks} healthy`);
        } else {
            logger.warn(`Health check completed: ${summary.overallStatus} - ${summary.healthyChecks} healthy, ${summary.warningChecks} warnings, ${summary.errorChecks} errors`);
        }

        this.emit('checkCompleted', summary);
    }

    // Individual health check implementations

    /**
     * Check system resource health
     */
    async checkSystemHealth() {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const memoryUsage = usedMemory / totalMemory;

        const cpuUsage = await this.getCpuUsage();
        const loadAverage = os.loadavg();

        const details = {
            memory: {
                total: totalMemory,
                used: usedMemory,
                free: freeMemory,
                usage: memoryUsage
            },
            cpu: {
                usage: cpuUsage,
                loadAverage: loadAverage,
                cores: os.cpus().length
            },
            uptime: os.uptime()
        };

        let status = 'healthy';
        const warnings = [];

        if (memoryUsage > this.alertThresholds.memory) {
            status = 'warning';
            warnings.push(`High memory usage: ${(memoryUsage * 100).toFixed(1)}%`);
        }

        if (cpuUsage > this.alertThresholds.cpu) {
            status = 'warning';
            warnings.push(`High CPU usage: ${(cpuUsage * 100).toFixed(1)}%`);
        }

        return {
            status: status,
            message: status === 'healthy' ? 'System resources normal' : 'System resource warnings',
            details: details,
            warnings: warnings
        };
    }

    /**
     * Check Node.js process health
     */
    async checkProcessHealth() {
        const memoryUsage = process.memoryUsage();
        const uptime = process.uptime();

        const details = {
            pid: process.pid,
            uptime: uptime,
            memory: memoryUsage,
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch
        };

        let status = 'healthy';
        const warnings = [];

        // Check for memory leaks
        const heapUsage = memoryUsage.heapUsed / memoryUsage.heapTotal;
        if (heapUsage > 0.9) {
            status = 'warning';
            warnings.push(`High heap usage: ${(heapUsage * 100).toFixed(1)}%`);
        }

        return {
            status: status,
            message: status === 'healthy' ? 'Process health normal' : 'Process health warnings',
            details: details,
            warnings: warnings
        };
    }

    /**
     * Check database connection health
     */
    async checkDatabaseHealth() {
        try {
            const healthCheck = await dbConnection.healthCheck();
            const stats = dbConnection.getPoolStats();

            return {
                status: healthCheck.status === 'healthy' ? 'healthy' : 'error',
                message: healthCheck.message,
                details: {
                    ...healthCheck,
                    poolStats: stats
                }
            };
        } catch (error) {
            return {
                status: 'error',
                message: 'Database health check failed: ' + error.message,
                details: { error: error.message }
            };
        }
    }

    /**
     * Check Redis connection health
     */
    async checkRedisHealth() {
        try {
            // Initialize Redis if not already done
            if (!storage.isRedisConnected) {
                await storage.initializeRedis();
            }

            const stats = await storage.getStorageStats();

            return {
                status: stats.redis.connected ? 'healthy' : 'warning',
                message: stats.redis.connected ? 'Redis connection healthy' : 'Redis not connected',
                details: stats.redis
            };
        } catch (error) {
            return {
                status: 'error',
                message: 'Redis health check failed: ' + error.message,
                details: { error: error.message }
            };
        }
    }

    /**
     * Check data collector health
     */
    async checkDataCollectorHealth() {
        try {
            const healthCheck = await collector.healthCheck();

            return {
                status: healthCheck.status,
                message: healthCheck.status === 'healthy' ?
                    'Data collector running normally' :
                    'Data collector issues detected',
                details: healthCheck
            };
        } catch (error) {
            return {
                status: 'error',
                message: 'Data collector health check failed: ' + error.message,
                details: { error: error.message }
            };
        }
    }

    /**
     * Check storage system health
     */
    async checkStorageHealth() {
        try {
            const stats = await storage.getStorageStats();

            let status = 'healthy';
            const warnings = [];

            if (!stats.redis.connected) {
                status = 'warning';
                warnings.push('Redis cache not available');
            }

            return {
                status: status,
                message: status === 'healthy' ?
                    'Storage system healthy' :
                    'Storage system warnings',
                details: stats,
                warnings: warnings
            };
        } catch (error) {
            return {
                status: 'error',
                message: 'Storage health check failed: ' + error.message,
                details: { error: error.message }
            };
        }
    }

    /**
     * Check rate limiting health
     */
    async checkRateLimitHealth() {
        try {
            const healthCheck = await rateLimit.healthCheck();

            return {
                status: healthCheck.status,
                message: healthCheck.status === 'healthy' ?
                    'Rate limiting system healthy' :
                    'Rate limiting issues detected',
                details: healthCheck
            };
        } catch (error) {
            return {
                status: 'error',
                message: 'Rate limit health check failed: ' + error.message,
                details: { error: error.message }
            };
        }
    }

    /**
     * Check data sources health
     */
    async checkDataSourcesHealth() {
        const sources = collector.getStats().activeSources;
        const sourceStats = collector.getStats().sources;

        let status = 'healthy';
        const warnings = [];
        const errors = [];

        Object.entries(sourceStats).forEach(([sourceName, stats]) => {
            if (stats.status === 'error') {
                status = 'error';
                errors.push(`${sourceName}: ${stats.status}`);
            } else if (stats.errors > 0) {
                if (status !== 'error') status = 'warning';
                warnings.push(`${sourceName}: ${stats.errors} errors`);
            }
        });

        return {
            status: status,
            message: status === 'healthy' ?
                `${sources.length} data sources healthy` :
                'Data source issues detected',
            details: {
                activeSources: sources.length,
                sources: sourceStats
            },
            warnings: warnings,
            errors: errors
        };
    }

    /**
     * Get CPU usage percentage
     */
    async getCpuUsage() {
        return new Promise((resolve) => {
            const startUsage = process.cpuUsage();
            const startTime = process.hrtime.bigint();

            setTimeout(() => {
                const currentUsage = process.cpuUsage(startUsage);
                const currentTime = process.hrtime.bigint();

                const elapsedTime = Number(currentTime - startTime) / 1000000; // Convert to milliseconds
                const elapsedUserTime = currentUsage.user / 1000; // Convert to milliseconds
                const elapsedSystemTime = currentUsage.system / 1000; // Convert to milliseconds

                const cpuPercent = (elapsedUserTime + elapsedSystemTime) / elapsedTime;

                resolve(Math.min(cpuPercent, 1)); // Cap at 100%
            }, 100);
        });
    }

    /**
     * Get latest health check results
     */
    getLatestResults() {
        return this.lastResults.get('latest') || {
            timestamp: new Date().toISOString(),
            overallStatus: 'unknown',
            message: 'No health checks run yet'
        };
    }

    /**
     * Get health check configuration
     */
    getConfiguration() {
        const checks = {};

        for (const [id, check] of this.checks) {
            checks[id] = {
                name: check.name,
                interval: check.interval,
                enabled: check.enabled,
                lastRun: check.lastRun,
                nextRun: check.nextRun
            };
        }

        return {
            isRunning: this.isRunning,
            totalChecks: this.checks.size,
            alertThresholds: this.alertThresholds,
            checks: checks
        };
    }

    /**
     * Enable or disable a specific health check
     */
    setCheckEnabled(checkId, enabled) {
        const check = this.checks.get(checkId);
        if (check) {
            check.enabled = enabled;
            logger.info(`Health check ${checkId} ${enabled ? 'enabled' : 'disabled'}`);
        } else {
            throw new Error(`Health check not found: ${checkId}`);
        }
    }

    /**
     * Update alert thresholds
     */
    updateThresholds(thresholds) {
        this.alertThresholds = { ...this.alertThresholds, ...thresholds };
        logger.info('Health check alert thresholds updated:', thresholds);
    }
}

module.exports = new HealthCheckManager();