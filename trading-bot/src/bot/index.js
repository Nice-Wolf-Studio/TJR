const {
  Client,
  GatewayIntentBits,
  Events,
  Collection,
  ActivityType,
  Partials
} = require('discord.js');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Import configuration and utilities
const config = require('../../config/bot');
const logger = require('../utils/logger');
const CommandHandler = require('./handlers/commandHandler');

// Validate configuration before starting
try {
  config.validateConfig();
  logger.info('Configuration validation successful');
} catch (error) {
  logger.error('Configuration validation failed:', error);
  process.exit(1);
}

class TradingBot {
  constructor() {
    // Initialize Discord client with configured intents
    const configuredIntents = (config.discord.intents || ['Guilds'])
      .map((intent) => {
        if (typeof intent === 'number') {
          return intent;
        }

        if (typeof intent === 'string' && GatewayIntentBits[intent]) {
          return GatewayIntentBits[intent];
        }

        logger.warn(`Unknown Discord intent configured: ${intent}`);
        return null;
      })
      .filter(Boolean);

    if (configuredIntents.length === 0) {
      configuredIntents.push(GatewayIntentBits.Guilds);
      logger.warn('No valid Discord intents configured. Falling back to Guilds intent.');
    }

    this.client = new Client({
      intents: configuredIntents,
      partials: [Partials.Channel]
    });
    this.client.app = this;

    // Initialize handlers
    this.commandHandler = new CommandHandler(this.client);
    this.client.commandHandler = this.commandHandler;

    // Initialize Express server
    this.app = express();
    this.server = null;
    this.activePort = null;

    // Bot statistics
    this.stats = {
      startTime: Date.now(),
      commandsExecuted: 0,
      messagesProcessed: 0,
      errors: 0
    };

    // Setup bot
    this.setupBot();
    this.setupExpress();
  }

  /**
   * Setup Discord bot events and handlers
   */
  setupBot() {
    // Bot ready event
    this.client.once(Events.ClientReady, async (readyClient) => {
      logger.discord(`Bot is ready! Logged in as ${readyClient.user.tag}`);
      logger.info(`Serving ${readyClient.guilds.cache.size} guilds with ${readyClient.users.cache.size} users`);

      // Set bot activity
      await this.setActivity();

      // Load commands
      try {
        await this.commandHandler.loadCommands();
        logger.info('Command handler initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize command handler:', error);
      }

      // Start Express server
      this.startServer();

      logger.info('Trading Bot fully initialized and ready for use');
    });

    // Message handling
    this.client.on(Events.MessageCreate, async (message) => {
      try {
        this.stats.messagesProcessed++;

        // Handle commands
        await this.commandHandler.handleMessage(message);
      } catch (error) {
        this.stats.errors++;
        logger.discordError(error, {
          event: 'messageCreate',
          messageId: message.id,
          channelId: message.channel.id,
          guildId: message.guild?.id
        });
      }
    });

    // Slash command interactions
    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        await this.commandHandler.handleInteraction(interaction);
      } catch (error) {
        this.stats.errors++;
        logger.discordError(error, {
          event: 'interactionCreate',
          interactionId: interaction.id,
          commandName: interaction.commandName,
          guildId: interaction.guildId
        });
      }
    });

    // Guild join event
    this.client.on(Events.GuildCreate, (guild) => {
      logger.discord(`Joined new guild: ${guild.name} (${guild.id})`, {
        guildId: guild.id,
        memberCount: guild.memberCount
      });
    });

    // Guild leave event
    this.client.on(Events.GuildDelete, (guild) => {
      logger.discord(`Left guild: ${guild.name} (${guild.id})`, {
        guildId: guild.id
      });
    });

    // Rate limit handling
    this.client.on(Events.RateLimited, (rateLimitData) => {
      logger.warn('Rate limited', {
        timeout: rateLimitData.timeout,
        limit: rateLimitData.limit,
        method: rateLimitData.method,
        path: rateLimitData.path,
        route: rateLimitData.route
      });
    });

    // Connection resume
    this.client.on(Events.Resume, (replayed) => {
      logger.discord(`Bot resumed connection, replayed ${replayed} events`);
    });

    // Reconnecting
    this.client.on(Events.Reconnecting, () => {
      logger.discord('Bot is reconnecting...');
    });

    // Error handling
    this.client.on(Events.Error, (error) => {
      this.stats.errors++;
      logger.discordError(error, { event: 'client_error' });
    });

    // Warning handling
    this.client.on(Events.Warn, (warning) => {
      logger.warn('Discord warning:', { warning });
    });

    // Debug logging (only in development)
    if (config.isDevelopment) {
      this.client.on(Events.Debug, (info) => {
        logger.debug('Discord debug:', { info });
      });
    }
  }

  /**
   * Setup Express server for health checks and webhooks
   */
  setupExpress() {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors(config.server.cors));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging middleware
    this.app.use((req, res, next) => {
      logger.api(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentLength: req.get('Content-Length')
      });
      next();
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const uptime = Date.now() - this.stats.startTime;
      const memoryUsage = process.memoryUsage();

      res.json({
        status: 'healthy',
        uptime: uptime,
        uptimeFormatted: this.formatUptime(uptime),
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024)
        },
        discord: {
          status: this.client.readyAt ? 'connected' : 'disconnected',
          guilds: this.client.guilds.cache.size,
          users: this.client.users.cache.size,
          ping: this.client.ws.ping
        },
        stats: this.stats,
        timestamp: new Date().toISOString()
      });
    });

    // Bot info endpoint
    this.app.get('/info', (req, res) => {
      res.json({
        name: 'Trading Bot',
        version: '1.0.0',
        description: 'Professional Trading Discord Bot',
        commands: this.commandHandler.getAllCommands().size,
        features: [
          'Market Bias Analysis',
          'Key Levels Detection',
          'Trade Setup Scanning',
          'Order Flow Analysis',
          'Real-time Alerts',
          'Risk Management'
        ]
      });
    });

    // Commands endpoint
    this.app.get('/commands', (req, res) => {
      const commands = Array.from(this.commandHandler.getAllCommands().values())
        .map(cmd => ({
          name: cmd.name,
          description: cmd.description,
          category: cmd.category,
          aliases: cmd.aliases,
          usage: cmd.usage,
          cooldown: cmd.cooldown
        }));

      res.json({ commands });
    });

    // Webhook endpoint (for external integrations)
    this.app.post('/webhook', (req, res) => {
      try {
        logger.api('Webhook received', {
          body: req.body,
          headers: req.headers
        });

        // Process webhook data here
        // This could be used for trading alerts, market data, etc.

        res.json({ success: true, message: 'Webhook processed' });
      } catch (error) {
        logger.error('Webhook processing error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested endpoint does not exist'
      });
    });

    // Error handling middleware
    this.app.use((error, req, res, next) => {
      logger.error('Express error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: config.isDevelopment ? error.message : 'Something went wrong'
      });
    });
  }

  /**
   * Set bot activity status
   */
  async setActivity() {
    try {
      await this.client.user.setActivity(config.discord.activity.name, {
        type: ActivityType[config.discord.activity.type]
      });
      logger.discord(`Bot activity set: ${config.discord.activity.type} ${config.discord.activity.name}`);
    } catch (error) {
      logger.error('Failed to set bot activity:', error);
    }
  }

  /**
   * Start Express server
   */
  startServer() {
    const desiredPort = Number(config.server.port) || 3000;
    const maxRetries = 5;

    const attemptStart = (port, attempt = 0) => {
      const server = this.app.listen(port, config.server.host, () => {
        this.server = server;
        this.activePort = port;

        if (attempt === 0) {
          logger.info(`Express server started on ${config.server.host}:${port}`);
        } else {
          logger.warn(`Express server started on fallback port ${config.server.host}:${port}`);
        }
      });

      server.once('error', (error) => {
        if (error.code === 'EADDRINUSE' && attempt < maxRetries) {
          logger.warn(`Port ${port} is in use. Trying ${port + 1}...`);

          // Slight delay allows the event loop to settle before retrying
          setTimeout(() => attemptStart(port + 1, attempt + 1), 100);
          return;
        }

        logger.error('Express server error:', error);
      });
    };

    attemptStart(desiredPort);
  }

  /**
   * Format uptime in human readable format
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    return {
      days: days,
      hours: hours % 24,
      minutes: minutes % 60,
      seconds: seconds % 60,
      formatted: `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`
    };
  }

  /**
   * Start the bot
   */
  async start() {
    try {
      logger.info('Starting Trading Bot...');

      // Login to Discord
      await this.client.login(config.discord.token);

    } catch (error) {
      if (error?.code === 4014 || /disallowed intents/i.test(error?.message || '')) {
        logger.error('Discord rejected the configured Gateway intents.');
        logger.error('If you need MessageContent or GuildMembers, enable those Privileged Gateway Intents in the Discord Developer Portal (Bot > Privileged Gateway Intents).');
        logger.error('Alternatively, remove the unsupported intents from config/ environment (config.discord.intents).');
      }

      logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('Initiating graceful shutdown...');

    try {
      // Close Express server
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        logger.info(`Express server closed (port ${this.activePort ?? 'unknown'})`);
        this.server = null;
        this.activePort = null;
      }

      // Close Discord client
      if (this.client) {
        this.client.destroy();
        logger.info('Discord client disconnected');
      }

      logger.info('Graceful shutdown completed');
      process.exit(0);

    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Create and start bot instance
const bot = new TradingBot();

// Graceful shutdown handlers
process.on('SIGINT', () => {
  logger.info('Received SIGINT signal');
  bot.shutdown();
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM signal');
  bot.shutdown();
});

// Unhandled error handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', {
    reason: reason,
    stack: reason?.stack,
    promise: promise
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack
  });
  // Don't exit immediately to allow logging to complete
  setTimeout(() => process.exit(1), 1000);
});

// Start the bot
bot.start().catch(error => {
  logger.error('Failed to start Trading Bot:', error);
  process.exit(1);
});

module.exports = TradingBot;
