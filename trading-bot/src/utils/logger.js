const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');
const config = require('../../config/bot');

// Create logs directory if it doesn't exist
const logsDir = path.resolve(config.logging.dir);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (stack) {
      log += `\n${stack}`;
    }
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    return log;
  })
);

// Create transports
const transports = [];

// Console transport (always enabled in development)
if (config.isDevelopment) {
  transports.push(
    new winston.transports.Console({
      level: 'debug',
      format: consoleFormat
    })
  );
}

// File transports
transports.push(
  // All logs
  new DailyRotateFile({
    filename: path.join(logsDir, 'trading-bot-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: config.logging.maxFiles,
    maxSize: config.logging.maxSize,
    level: config.logging.level,
    format: logFormat
  }),

  // Error logs only
  new DailyRotateFile({
    filename: path.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: config.logging.maxFiles,
    maxSize: config.logging.maxSize,
    level: 'error',
    format: logFormat
  }),

  // Discord specific logs
  new DailyRotateFile({
    filename: path.join(logsDir, 'discord-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: config.logging.maxFiles,
    maxSize: config.logging.maxSize,
    level: 'info',
    format: logFormat
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports,
  // Handle uncaught exceptions
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: config.logging.maxFiles,
      maxSize: config.logging.maxSize,
      format: logFormat
    })
  ],
  // Handle unhandled rejections
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: config.logging.maxFiles,
      maxSize: config.logging.maxSize,
      format: logFormat
    })
  ]
});

// Custom logging methods for Discord bot
logger.discord = (message, meta = {}) => {
  logger.info(message, { category: 'discord', ...meta });
};

logger.command = (command, user, guild, meta = {}) => {
  logger.info(`Command executed: ${command}`, {
    category: 'command',
    user: user.tag,
    userId: user.id,
    guild: guild?.name || 'DM',
    guildId: guild?.id || null,
    ...meta
  });
};

logger.trading = (message, meta = {}) => {
  logger.info(message, { category: 'trading', ...meta });
};

logger.database = (message, meta = {}) => {
  logger.info(message, { category: 'database', ...meta });
};

logger.api = (message, meta = {}) => {
  logger.info(message, { category: 'api', ...meta });
};

// Error handling methods
logger.discordError = (error, context = {}) => {
  logger.error('Discord Error', {
    category: 'discord',
    error: error.message,
    stack: error.stack,
    ...context
  });
};

logger.commandError = (error, command, user, guild, meta = {}) => {
  logger.error(`Command error: ${command}`, {
    category: 'command',
    error: error.message,
    stack: error.stack,
    user: user.tag,
    userId: user.id,
    guild: guild?.name || 'DM',
    guildId: guild?.id || null,
    ...meta
  });
};

// Performance logging
logger.performance = (operation, duration, meta = {}) => {
  logger.info(`Performance: ${operation} took ${duration}ms`, {
    category: 'performance',
    operation,
    duration,
    ...meta
  });
};

// Security logging
logger.security = (message, meta = {}) => {
  logger.warn(message, { category: 'security', ...meta });
};

module.exports = logger;