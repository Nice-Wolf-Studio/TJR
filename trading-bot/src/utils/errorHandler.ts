// @ts-nocheck
const logger = require('./logger');
const config = require('../config/bot');

/**
 * Centralized error handling utility
 * Provides consistent error handling across the application
 */
class ErrorHandler {
  constructor() {
    this.errorCounts = new Map();
    this.setupGlobalHandlers();
  }

  /**
   * Setup global error handlers
   */
  setupGlobalHandlers() {
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Promise Rejection:', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        promise: promise.toString()
      });

      // Don't exit in production, but log for monitoring
      if (config.isDevelopment) {
        console.error('Unhandled Promise Rejection - terminating process');
        process.exit(1);
      }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });

      // Graceful shutdown for uncaught exceptions
      this.gracefulShutdown('uncaught exception');
    });

    // Handle process warnings
    process.on('warning', (warning) => {
      logger.warn('Process Warning:', {
        name: warning.name,
        message: warning.message,
        stack: warning.stack
      });
    });
  }

  /**
   * Handle Discord client errors
   */
  handleDiscordError(error, context = {}) {
    const errorInfo = this.extractErrorInfo(error);

    logger.discordError(error, {
      ...context,
      errorType: 'discord',
      code: error.code,
      httpStatus: error.httpStatus,
      requestPath: error.path
    });

    // Track error frequency
    this.incrementErrorCount('discord', errorInfo.type);

    // Handle specific Discord errors
    switch (error.code) {
      case 50013: // Missing Permissions
        logger.warn('Bot missing permissions', context);
        break;
      case 50001: // Missing Access
        logger.warn('Bot missing access to resource', context);
        break;
      case 429: // Rate Limited
        logger.warn('Discord API rate limit hit', {
          ...context,
          retryAfter: error.retry_after
        });
        break;
      case 10008: // Unknown Message
        logger.debug('Message not found (possibly deleted)', context);
        break;
      default:
        if (error.httpStatus >= 500) {
          logger.error('Discord API server error', context);
        }
    }

    return this.createUserFriendlyError(error, 'discord');
  }

  /**
   * Handle command execution errors
   */
  handleCommandError(error, commandName, message, context = {}) {
    const errorInfo = this.extractErrorInfo(error);

    logger.commandError(error, commandName, message.author, message.guild, {
      ...context,
      errorType: 'command',
      commandName,
      channelType: message.channel.type
    });

    // Track command error frequency
    this.incrementErrorCount('command', commandName);

    // Create user-friendly error message
    const userError = this.createUserFriendlyError(error, 'command');

    // Send error message to user (if not too frequent)
    if (!this.isErrorTooFrequent('command', commandName)) {
      return message.reply({
        content: userError.message,
        ephemeral: true
      }).catch(replyError => {
        logger.error('Failed to send error message to user:', replyError);
      });
    }
  }

  /**
   * Handle database errors
   */
  handleDatabaseError(error, operation, context = {}) {
    const errorInfo = this.extractErrorInfo(error);

    logger.database(`Database error during ${operation}`, {
      ...context,
      errorType: 'database',
      operation,
      code: error.code,
      constraint: error.constraint,
      table: error.table,
      column: error.column
    });

    // Track database error frequency
    this.incrementErrorCount('database', operation);

    // Handle specific database errors
    switch (error.code) {
      case '23505': // Unique violation
        return { message: 'Duplicate entry detected', recoverable: true };
      case '23503': // Foreign key violation
        return { message: 'Referenced data not found', recoverable: true };
      case '42P01': // Undefined table
        return { message: 'Database structure error', recoverable: false };
      case 'ECONNREFUSED':
        return { message: 'Database connection failed', recoverable: false };
      default:
        return { message: 'Database operation failed', recoverable: false };
    }
  }

  /**
   * Handle API errors (external services)
   */
  handleApiError(error, service, endpoint, context = {}) {
    const errorInfo = this.extractErrorInfo(error);

    logger.api(`API error for ${service}`, {
      ...context,
      errorType: 'api',
      service,
      endpoint,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data
    });

    // Track API error frequency
    this.incrementErrorCount('api', service);

    // Handle HTTP errors
    if (error.response) {
      const status = error.response.status;
      switch (status) {
        case 400:
          return { message: 'Invalid request to service', recoverable: true };
        case 401:
          return { message: 'API authentication failed', recoverable: false };
        case 403:
          return { message: 'API access forbidden', recoverable: false };
        case 429:
          return {
            message: 'API rate limit exceeded',
            recoverable: true,
            retryAfter: error.response.headers['retry-after']
          };
        case 500:
        case 502:
        case 503:
          return { message: 'Service temporarily unavailable', recoverable: true };
        default:
          return { message: 'External service error', recoverable: false };
      }
    }

    return { message: 'Network error occurred', recoverable: true };
  }

  /**
   * Extract useful information from error objects
   */
  extractErrorInfo(error) {
    return {
      type: error.constructor.name,
      message: error.message,
      code: error.code,
      status: error.status || error.httpStatus,
      stack: error.stack,
      isAxiosError: error.isAxiosError || false,
      isDiscordError: error.name?.includes('Discord') || false
    };
  }

  /**
   * Create user-friendly error messages
   */
  createUserFriendlyError(error, type) {
    const messages = {
      discord: 'There was a Discord-related error. Please try again.',
      command: 'Command execution failed. Please check your input and try again.',
      database: 'Data storage error occurred. Please try again later.',
      api: 'External service error. Please try again later.',
      network: 'Network error occurred. Please check your connection.',
      validation: 'Invalid input provided. Please check your command syntax.',
      permission: 'You don\'t have permission to perform this action.',
      ratelimit: 'You\'re sending commands too quickly. Please wait before trying again.',
      maintenance: 'The bot is currently under maintenance. Please try again later.'
    };

    const fallbackMessage = 'An unexpected error occurred. Please try again.';

    return {
      message: messages[type] || fallbackMessage,
      type,
      timestamp: new Date().toISOString(),
      recoverable: this.isRecoverableError(error)
    };
  }

  /**
   * Check if error is recoverable
   */
  isRecoverableError(error) {
    const nonRecoverableTypes = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'TypeError',
      'SyntaxError'
    ];

    const nonRecoverableCodes = [
      401, // Unauthorized
      403, // Forbidden
      404, // Not Found
      50001, // Discord: Missing Access
      50013  // Discord: Missing Permissions
    ];

    return !(
      nonRecoverableTypes.includes(error.code) ||
      nonRecoverableTypes.includes(error.name) ||
      nonRecoverableCodes.includes(error.status) ||
      nonRecoverableCodes.includes(error.httpStatus) ||
      nonRecoverableCodes.includes(error.code)
    );
  }

  /**
   * Track error frequency
   */
  incrementErrorCount(category, identifier) {
    const key = `${category}:${identifier}`;
    const current = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, current + 1);

    // Log if error is becoming frequent
    if (current > 0 && current % 10 === 0) {
      logger.warn(`Frequent error detected: ${key} occurred ${current + 1} times`);
    }

    // Clean up old entries periodically
    if (this.errorCounts.size > 1000) {
      this.cleanupErrorCounts();
    }
  }

  /**
   * Check if error is occurring too frequently
   */
  isErrorTooFrequent(category, identifier, threshold = 5) {
    const key = `${category}:${identifier}`;
    const count = this.errorCounts.get(key) || 0;
    return count >= threshold;
  }

  /**
   * Clean up old error counts
   */
  cleanupErrorCounts() {
    // Keep only the most recent 500 error entries
    const entries = Array.from(this.errorCounts.entries())
      .slice(-500);

    this.errorCounts.clear();
    entries.forEach(([key, value]) => {
      this.errorCounts.set(key, value);
    });

    logger.debug('Error counts cleaned up');
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    const stats = {
      totalErrors: 0,
      byCategory: {},
      mostFrequent: []
    };

    for (const [key, count] of this.errorCounts.entries()) {
      const [category] = key.split(':');
      stats.totalErrors += count;
      stats.byCategory[category] = (stats.byCategory[category] || 0) + count;
    }

    // Get most frequent errors
    stats.mostFrequent = Array.from(this.errorCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([key, count]) => ({ error: key, count }));

    return stats;
  }

  /**
   * Graceful shutdown on critical errors
   */
  gracefulShutdown(reason) {
    logger.error(`Initiating graceful shutdown due to: ${reason}`);

    // Give some time for logging to complete
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  }

  /**
   * Reset error counts (useful for testing or periodic cleanup)
   */
  resetErrorCounts() {
    this.errorCounts.clear();
    logger.info('Error counts reset');
  }
}

// Export singleton instance
module.exports = new ErrorHandler();