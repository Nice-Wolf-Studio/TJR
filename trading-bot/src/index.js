/**
 * TJR Trading Bot - Main Application Entry Point
 * Professional Discord Trading Assistant with Advanced Market Analysis
 */

require('dotenv').config();
const logger = require('./utils/logger');
const errorHandler = require('./utils/errorHandler');

// Core components
const DiscordBot = require('./bot');
const DataCollector = require('./data/collector');
const AnalysisEngine = require('./analysis/engine');
const AlertManager = require('./alerts/manager');
const TradingViewWebhook = require('./webhooks/tradingview');
const DatabaseConnection = require('./database/simple-connection');
const RedisConnection = require('./data/redis');

class TradingBotApplication {
  constructor() {
    this.components = {
      database: null,
      redis: null,
      bot: null,
      dataCollector: null,
      analysisEngine: null,
      alertManager: null,
      webhook: null
    };

    this.isRunning = false;
    this.startTime = null;
  }

  /**
   * Initialize all system components
   */
  async initialize() {
    try {
      logger.info('🚀 Initializing TJR Trading Bot System...');

      // 1. Initialize Database Connection
      logger.info('📀 Connecting to PostgreSQL database...');
      this.components.database = new DatabaseConnection();
      await this.components.database.initialize();
      logger.info('✅ Database connection established');

      // 2. Initialize Redis Connection
      logger.info('🔄 Connecting to Redis cache...');
      this.components.redis = new RedisConnection();
      await this.components.redis.initialize();
      logger.info('✅ Redis connection established');

      // 3. Initialize Analysis Engine
      logger.info('🧠 Initializing analysis engine...');
      this.components.analysisEngine = new AnalysisEngine({
        database: this.components.database,
        redis: this.components.redis
      });
      await this.components.analysisEngine.initialize();
      logger.info('✅ Analysis engine ready');

      // 4. Initialize Alert Manager
      logger.info('📢 Initializing alert manager...');
      this.components.alertManager = new AlertManager({
        database: this.components.database,
        redis: this.components.redis,
        analysisEngine: this.components.analysisEngine
      });
      await this.components.alertManager.initialize();
      logger.info('✅ Alert manager ready');

      // 5. Initialize Data Collector
      logger.info('📊 Initializing data collector...');
      this.components.dataCollector = new DataCollector({
        database: this.components.database,
        redis: this.components.redis,
        analysisEngine: this.components.analysisEngine,
        alertManager: this.components.alertManager
      });
      await this.components.dataCollector.initialize();
      logger.info('✅ Data collector ready');

      // 6. Initialize Discord Bot
      logger.info('🤖 Initializing Discord bot...');
      this.components.bot = new DiscordBot({
        database: this.components.database,
        redis: this.components.redis,
        analysisEngine: this.components.analysisEngine,
        alertManager: this.components.alertManager,
        dataCollector: this.components.dataCollector
      });
      await this.components.bot.initialize();
      logger.info('✅ Discord bot ready');

      // 7. Initialize TradingView Webhook
      logger.info('📡 Initializing TradingView webhook...');
      this.components.webhook = new TradingViewWebhook({
        database: this.components.database,
        redis: this.components.redis,
        analysisEngine: this.components.analysisEngine,
        alertManager: this.components.alertManager
      });
      await this.components.webhook.initialize();
      logger.info('✅ TradingView webhook ready');

      logger.info('🎉 All components initialized successfully!');

    } catch (error) {
      logger.error('❌ Failed to initialize system:', error);
      await this.shutdown();
      throw error;
    }
  }

  /**
   * Start all system components
   */
  async start() {
    try {
      if (this.isRunning) {
        logger.warn('⚠️ System is already running');
        return;
      }

      await this.initialize();

      logger.info('🚀 Starting TJR Trading Bot System...');
      this.startTime = new Date();

      // Start components in dependency order
      await this.components.dataCollector.start();
      await this.components.analysisEngine.start();
      await this.components.alertManager.start();
      await this.components.bot.start();
      await this.components.webhook.start();

      this.isRunning = true;

      // Log system startup success
      logger.info('🎯 TJR Trading Bot System Started Successfully!');
      logger.info(`📊 System Statistics:`);
      logger.info(`   - Start Time: ${this.startTime.toISOString()}`);
      logger.info(`   - Node.js Version: ${process.version}`);
      logger.info(`   - Process PID: ${process.pid}`);
      logger.info(`   - Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

      // Setup health monitoring
      this.setupHealthMonitoring();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('❌ Failed to start system:', error);
      await this.shutdown();
      throw error;
    }
  }

  /**
   * Setup health monitoring
   */
  setupHealthMonitoring() {
    const healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.getSystemHealth();

        if (health.status !== 'healthy') {
          logger.warn('⚠️ System health issue detected:', health);

          // Trigger recovery if needed
          if (health.critical) {
            logger.error('🚨 Critical system health issue - initiating recovery');
            await this.recoverSystem();
          }
        }

      } catch (error) {
        logger.error('❌ Health check failed:', error);
      }
    }, 30000); // Check every 30 seconds

    // Store interval for cleanup
    this.healthCheckInterval = healthCheckInterval;
  }

  /**
   * Get system health status
   */
  async getSystemHealth() {
    const health = {
      status: 'healthy',
      timestamp: new Date(),
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      components: {},
      critical: false
    };

    try {
      // Check each component
      for (const [name, component] of Object.entries(this.components)) {
        if (component && typeof component.getHealth === 'function') {
          const componentHealth = await component.getHealth();
          health.components[name] = componentHealth;

          if (componentHealth.status !== 'healthy') {
            health.status = 'degraded';
            if (componentHealth.critical) {
              health.critical = true;
            }
          }
        }
      }

      // Check system resources
      const memUsage = process.memoryUsage();
      health.memory = {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      };

      // Memory warning threshold (500MB)
      if (health.memory.heapUsed > 500) {
        health.status = 'degraded';
        logger.warn(`⚠️ High memory usage: ${health.memory.heapUsed}MB`);
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
      logger.error('❌ Health check error:', error);
    }

    return health;
  }

  /**
   * Attempt system recovery
   */
  async recoverSystem() {
    logger.info('🔧 Attempting system recovery...');

    try {
      // Restart failed components
      for (const [name, component] of Object.entries(this.components)) {
        if (component && typeof component.getHealth === 'function') {
          const health = await component.getHealth();

          if (health.status === 'unhealthy' && typeof component.restart === 'function') {
            logger.info(`🔄 Restarting ${name} component...`);
            await component.restart();
            logger.info(`✅ ${name} component restarted`);
          }
        }
      }

      logger.info('✅ System recovery completed');

    } catch (error) {
      logger.error('❌ System recovery failed:', error);
      // If recovery fails, initiate graceful shutdown
      await this.shutdown();
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`📴 Received ${signal} - initiating graceful shutdown...`);
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      logger.error('🚨 Uncaught Exception:', error);
      await this.shutdown();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('🚨 Unhandled Promise Rejection:', reason);
      await this.shutdown();
      process.exit(1);
    });
  }

  /**
   * Shutdown all system components gracefully
   */
  async shutdown() {
    if (!this.isRunning && !this.components.database) {
      return;
    }

    logger.info('📴 Shutting down TJR Trading Bot System...');

    // Clear health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Shutdown components in reverse dependency order
    const shutdownOrder = [
      'webhook',
      'bot',
      'alertManager',
      'analysisEngine',
      'dataCollector',
      'redis',
      'database'
    ];

    for (const componentName of shutdownOrder) {
      try {
        const component = this.components[componentName];
        if (component && typeof component.shutdown === 'function') {
          logger.info(`📴 Shutting down ${componentName}...`);
          await component.shutdown();
          logger.info(`✅ ${componentName} shut down`);
        }
      } catch (error) {
        logger.error(`❌ Error shutting down ${componentName}:`, error);
      }
    }

    this.isRunning = false;
    logger.info('✅ TJR Trading Bot System shut down successfully');
  }

  /**
   * Get system status information
   */
  getStatus() {
    return {
      running: this.isRunning,
      startTime: this.startTime,
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      components: Object.keys(this.components).reduce((status, name) => {
        const component = this.components[name];
        status[name] = {
          initialized: !!component,
          running: component && typeof component.isRunning === 'function' ? component.isRunning() : false
        };
        return status;
      }, {}),
      memory: process.memoryUsage(),
      pid: process.pid,
      version: require('../package.json').version
    };
  }
}

// Create and start the application
const app = new TradingBotApplication();

// Start the system
app.start().catch(error => {
  logger.error('🚨 Failed to start TJR Trading Bot System:', error);
  process.exit(1);
});

// Export for testing
module.exports = TradingBotApplication;