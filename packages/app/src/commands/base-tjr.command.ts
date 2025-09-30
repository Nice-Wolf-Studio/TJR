/**
 * Base command class for TJR commands
 *
 * Implements the template method pattern with shared functionality for
 * configuration loading, caching, error handling, and metadata building.
 */

import type { Command, CommandOptions, CommandResult } from './types.js';
import type { Logger } from '@tjr/logger';
import type { ProviderService } from '../services/providers/types.js';
import type { CacheService } from '../services/cache/types.js';
import type { ConfigService } from '../services/config/types.js';
import { TJRCommandError, TJRErrorCode, formatCommandError, wrapError } from './errors.js';
import { Timeframe } from '@tjr/contracts';

/**
 * Configuration for base TJR command
 */
export interface BaseTJRCommandConfig {
  /** Provider service for market data */
  providerService: ProviderService;
  /** Configuration service for user preferences */
  configService: ConfigService;
  /** Logger instance */
  logger: Logger;
  /** Optional cache service */
  cacheService?: CacheService;
  /** User ID for configuration (default: 'default') */
  userId?: string;
}

/**
 * Abstract base class for all TJR commands
 *
 * Provides common functionality:
 * - Configuration loading and management
 * - Cache integration
 * - Error handling
 * - Metadata building
 * - Structured logging
 *
 * Subclasses must implement:
 * - parseArgs: Parse and validate command arguments
 * - executeCommand: Execute the command logic
 */
export abstract class BaseTJRCommand implements Command {
  abstract readonly name: string;
  abstract readonly description: string;
  readonly aliases?: string[];

  protected providerService: ProviderService;
  protected configService: ConfigService;
  protected cacheService?: CacheService;
  protected logger: Logger;
  protected userId: string;

  constructor(config: BaseTJRCommandConfig) {
    this.providerService = config.providerService;
    this.configService = config.configService;
    this.cacheService = config.cacheService;
    this.logger = config.logger;
    this.userId = config.userId || 'default';
  }

  /**
   * Execute command with error handling and logging
   */
  async execute(args: string[], options: CommandOptions): Promise<CommandResult> {
    const startTime = Date.now();

    try {
      this.logger.info(`Executing ${this.name} command`, {
        args,
        options,
        userId: this.userId,
      });

      // Parse and validate arguments (implemented by subclass)
      const parsedArgs = await this.parseArgs(args, options);

      // Load user configuration
      const userConfig = await this.configService.load(this.userId);

      // Execute command logic (implemented by subclass)
      const result = await this.executeCommand(parsedArgs, options, userConfig);

      // Build metadata
      const metadata = this.buildMetadata(startTime, parsedArgs, result);

      this.logger.info(`${this.name} command completed successfully`, {
        duration: Date.now() - startTime,
        userId: this.userId,
      });

      return {
        success: true,
        output: result.output,
        duration: Date.now() - startTime,
        metadata,
      };
    } catch (error) {
      return this.handleError(error, startTime, options.verbose);
    }
  }

  /**
   * Parse and validate command arguments
   *
   * @param args - Raw command arguments
   * @param options - Command options
   * @returns Parsed arguments
   * @throws TJRCommandError if arguments are invalid
   */
  protected abstract parseArgs(args: string[], options: CommandOptions): Promise<any>;

  /**
   * Execute the command logic
   *
   * @param parsedArgs - Parsed and validated arguments
   * @param options - Command options
   * @param userConfig - User configuration
   * @returns Command result with output and metadata
   */
  protected abstract executeCommand(
    parsedArgs: any,
    options: CommandOptions,
    userConfig: any
  ): Promise<{ output: any; metadata?: Record<string, any> }>;

  /**
   * Build metadata for command result
   */
  protected buildMetadata(
    startTime: number,
    _parsedArgs: any,
    result: { metadata?: Record<string, any> }
  ): Record<string, any> {
    return {
      command: this.name,
      userId: this.userId,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      ...result.metadata,
    };
  }

  /**
   * Handle command errors with friendly messages
   */
  protected handleError(error: unknown, startTime: number, verbose?: boolean): CommandResult {
    this.logger.error(`${this.name} command failed`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId: this.userId,
    });

    const formattedError = formatCommandError(error, verbose);

    return {
      success: false,
      output: null,
      error: error instanceof Error ? error : new Error(String(error)),
      duration: Date.now() - startTime,
      metadata: {
        command: this.name,
        userId: this.userId,
        errorMessage: formattedError,
      },
    };
  }

  /**
   * Build cache key for result
   */
  protected buildCacheKey(prefix: string, params: Record<string, any>): string {
    const paramStr = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(':');

    return `${prefix}:${paramStr}:v1`;
  }

  /**
   * Get cached result if available
   */
  protected async getCached<T>(cacheKey: string): Promise<T | null> {
    if (!this.cacheService) {
      return null;
    }

    try {
      const cached = await this.cacheService.get<T>(cacheKey);
      if (cached) {
        this.logger.debug('Cache hit', { cacheKey });
        return cached;
      }
    } catch (error) {
      this.logger.warn('Cache get failed', {
        cacheKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }

  /**
   * Store result in cache
   */
  protected async setCached<T>(cacheKey: string, value: T, ttl: number): Promise<void> {
    if (!this.cacheService) {
      return;
    }

    try {
      await this.cacheService.set(cacheKey, value, ttl);
      this.logger.debug('Cached result', { cacheKey, ttl });
    } catch (error) {
      this.logger.warn('Cache set failed', {
        cacheKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Validate required arguments
   */
  protected validateRequired(value: any, name: string): void {
    if (value === undefined || value === null || value === '') {
      throw new TJRCommandError(
        TJRErrorCode.INVALID_ARGS,
        `Missing required argument: ${name}`,
        { argument: name }
      );
    }
  }

  /**
   * Parse date string to Date object
   */
  protected parseDate(dateStr: string, name: string = 'date'): Date {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new TJRCommandError(
        TJRErrorCode.INVALID_ARGS,
        `Invalid date format: ${dateStr}`,
        { argument: name, value: dateStr }
      );
    }
    return date;
  }

  /**
   * Parse number with validation
   */
  protected parseNumber(value: string, name: string, min?: number, max?: number): number {
    const num = Number(value);
    if (isNaN(num)) {
      throw new TJRCommandError(
        TJRErrorCode.INVALID_ARGS,
        `Invalid number: ${value}`,
        { argument: name, value }
      );
    }

    if (min !== undefined && num < min) {
      throw new TJRCommandError(
        TJRErrorCode.INVALID_ARGS,
        `${name} must be >= ${min}`,
        { argument: name, value: num, min }
      );
    }

    if (max !== undefined && num > max) {
      throw new TJRCommandError(
        TJRErrorCode.INVALID_ARGS,
        `${name} must be <= ${max}`,
        { argument: name, value: num, max }
      );
    }

    return num;
  }

  /**
   * Fetch bars for analysis
   *
   * Shared method used by both confluence and execution commands
   */
  protected async fetchBars(
    symbol: string,
    timeframe: Timeframe,
    date?: Date
  ): Promise<any[]> {
    try {
      // Determine date range
      const targetDate = date || new Date();

      // For intraday timeframes, fetch trading day
      // For SPY: 9:30 AM - 4:00 PM ET
      const from = new Date(targetDate);
      from.setHours(9, 30, 0, 0);

      const to = new Date(targetDate);
      to.setHours(16, 0, 0, 0);

      this.logger.info('Fetching bars for analysis', {
        symbol,
        timeframe,
        from: from.toISOString(),
        to: to.toISOString(),
      });

      // Fetch bars from provider
      const bars = await this.providerService.getBars({
        symbol,
        timeframe,
        from: from.toISOString(),
        to: to.toISOString(),
      });

      this.logger.info('Fetched bars', {
        symbol,
        timeframe,
        count: bars.length,
      });

      return bars;
    } catch (error) {
      throw wrapError(error, TJRErrorCode.PROVIDER_ERROR, { symbol, timeframe });
    }
  }
}