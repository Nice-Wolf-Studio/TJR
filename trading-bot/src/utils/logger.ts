import fs from 'fs';
import path from 'path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import config from '../config/bot';

type LogMeta = Record<string, unknown>;

interface CommandUser {
  id: string;
  tag: string;
}

interface CommandGuild {
  id: string;
  name: string;
}

interface ExtendedLogger extends winston.Logger {
  discord: (message: string, meta?: LogMeta) => void;
  command: (command: string, user: CommandUser, guild?: CommandGuild | null, meta?: LogMeta) => void;
  trading: (message: string, meta?: LogMeta) => void;
  database: (message: string, meta?: LogMeta) => void;
  api: (message: string, meta?: LogMeta) => void;
  discordError: (error: Error, context?: LogMeta) => void;
  commandError: (error: Error, command: string, user: CommandUser, guild?: CommandGuild | null, meta?: LogMeta) => void;
  performance: (operation: string, duration: number, meta?: LogMeta) => void;
  security: (message: string, meta?: LogMeta) => void;
}

const logsDir = path.resolve(config.logging.dir);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

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

const transports: winston.transport[] = [];

if (config.isDevelopment) {
  transports.push(
    new winston.transports.Console({
      level: 'debug',
      format: consoleFormat
    })
  );
}

transports.push(
  new DailyRotateFile({
    filename: path.join(logsDir, 'trading-bot-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: config.logging.maxFiles,
    maxSize: config.logging.maxSize,
    level: config.logging.level,
    format: logFormat
  }),
  new DailyRotateFile({
    filename: path.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: config.logging.maxFiles,
    maxSize: config.logging.maxSize,
    level: 'error',
    format: logFormat
  }),
  new DailyRotateFile({
    filename: path.join(logsDir, 'discord-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: config.logging.maxFiles,
    maxSize: config.logging.maxSize,
    level: 'info',
    format: logFormat
  })
);

const baseLogger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports,
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: config.logging.maxFiles,
      maxSize: config.logging.maxSize,
      format: logFormat
    })
  ],
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

const logger = baseLogger as ExtendedLogger;

logger.discord = (message: string, meta: LogMeta = {}) => {
  logger.info(message, { category: 'discord', ...meta });
};

logger.command = (command: string, user: CommandUser, guild: CommandGuild | null = null, meta: LogMeta = {}) => {
  logger.info(`Command executed: ${command}`, {
    category: 'command',
    user: user.tag,
    userId: user.id,
    guild: guild?.name ?? 'DM',
    guildId: guild?.id ?? null,
    ...meta
  });
};

logger.trading = (message: string, meta: LogMeta = {}) => {
  logger.info(message, { category: 'trading', ...meta });
};

logger.database = (message: string, meta: LogMeta = {}) => {
  logger.info(message, { category: 'database', ...meta });
};

logger.api = (message: string, meta: LogMeta = {}) => {
  logger.info(message, { category: 'api', ...meta });
};

logger.discordError = (error: Error, context: LogMeta = {}) => {
  logger.error('Discord Error', {
    category: 'discord',
    error: error.message,
    stack: error.stack,
    ...context
  });
};

logger.commandError = (
  error: Error,
  command: string,
  user: CommandUser,
  guild: CommandGuild | null = null,
  meta: LogMeta = {}
) => {
  logger.error(`Command error: ${command}`, {
    category: 'command',
    error: error.message,
    stack: error.stack,
    user: user.tag,
    userId: user.id,
    guild: guild?.name ?? 'DM',
    guildId: guild?.id ?? null,
    ...meta
  });
};

logger.performance = (operation: string, duration: number, meta: LogMeta = {}) => {
  logger.info(`Performance: ${operation} took ${duration}ms`, {
    category: 'performance',
    operation,
    duration,
    ...meta
  });
};

logger.security = (message: string, meta: LogMeta = {}) => {
  logger.warn(message, { category: 'security', ...meta });
};

export = logger;
