/**
 * Composite provider with fallback chain and circuit breaker
 */

import type { Logger } from '@tjr/logger';
import type { MarketBar, GetBarsParams, ProviderCapabilities } from '@tjr/contracts';
import type { ProviderService, ProviderStats } from './types.js';
import type { CacheService } from '../cache/types.js';
import type { HealthStatus } from '../../container/types.js';

export interface CompositeProviderConfig {
  logger: Logger;
  cacheService: CacheService;
  providers: ProviderChainItem[];
  timeout?: number;
  cacheEnabled?: boolean;
  cacheTTL?: {
    historical: number;
    realtime: number;
  };
}

export interface ProviderChainItem {
  provider: ProviderService;
  name: string;
  timeout: number;
  priority: number;
}

export enum ProviderErrorType {
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  AUTH_FAILED = 'AUTH_FAILED',
  INVALID_SYMBOL = 'INVALID_SYMBOL',
  NO_DATA = 'NO_DATA',
  NETWORK = 'NETWORK',
  UNKNOWN = 'UNKNOWN',
}

interface ProviderError extends Error {
  type: ProviderErrorType;
  provider: string;
  retryable: boolean;
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

/**
 * Composite provider that implements fallback chain with timeout handling
 */
export class CompositeProvider implements ProviderService {
  readonly name = 'ProviderService';
  readonly dependencies = ['Logger', 'CacheService'];

  private logger: Logger;
  private cacheService: CacheService;
  private providers: ProviderChainItem[];
  private timeout: number;
  private cacheEnabled: boolean;
  private cacheTTL: {
    historical: number;
    realtime: number;
  };
  private stats: ProviderStats = {
    requests: 0,
    errors: 0,
    latencyMs: 0,
    cacheHits: 0,
    cacheMisses: 0,
    subscriptions: 0,
  };
  private circuitBreakers = new Map<string, CircuitBreakerState>();
  private subscriptions = new Map<string, Set<(bar: MarketBar) => void>>();

  // Circuit breaker configuration
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute
  private readonly CIRCUIT_BREAKER_HALF_OPEN_REQUESTS = 3;

  constructor(config: CompositeProviderConfig) {
    this.logger = config.logger;
    this.cacheService = config.cacheService;
    this.providers = config.providers.sort((a, b) => a.priority - b.priority);
    this.timeout = config.timeout ?? 5000;
    this.cacheEnabled = config.cacheEnabled ?? true;
    this.cacheTTL = config.cacheTTL ?? {
      historical: 3600000, // 1 hour for historical data
      realtime: 60000, // 1 minute for recent data
    };

    // Initialize circuit breakers
    for (const provider of this.providers) {
      this.circuitBreakers.set(provider.name, {
        failures: 0,
        lastFailure: 0,
        state: 'CLOSED',
      });
    }
  }

  async initialize(): Promise<void> {
    this.logger.info('Composite provider initializing', {
      providers: this.providers.map((p) => p.name),
      cacheEnabled: this.cacheEnabled,
    });

    // Initialize all providers
    for (const item of this.providers) {
      try {
        await item.provider.initialize();
        this.logger.info('Provider initialized', { name: item.name });
      } catch (error) {
        this.logger.error('Provider initialization failed', {
          name: item.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Composite provider shutting down');

    // Shutdown all providers
    for (const item of this.providers) {
      try {
        await item.provider.shutdown();
      } catch (error) {
        this.logger.error('Provider shutdown failed', {
          name: item.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.unsubscribeAll();
  }

  healthCheck(): HealthStatus {
    const providerHealth = this.providers.map((item) => {
      const breaker = this.circuitBreakers.get(item.name);
      return {
        name: item.name,
        status: item.provider.healthCheck(),
        circuitBreaker: breaker?.state,
      };
    });

    const allHealthy = providerHealth.every(
      (p) => p.status.healthy && p.circuitBreaker === 'CLOSED'
    );

    return {
      healthy: allHealthy,
      message: allHealthy
        ? 'All providers healthy'
        : 'Some providers unhealthy or circuit breakers open',
      details: {
        providers: providerHealth,
        stats: this.stats,
        cacheEnabled: this.cacheEnabled,
      },
    };
  }

  async getBars(params: GetBarsParams): Promise<MarketBar[]> {
    this.stats.requests++;
    const startTime = Date.now();

    try {
      // Check cache first if enabled
      if (this.cacheEnabled) {
        const cacheKey = this.buildCacheKey(params);
        const cached = await this.cacheService.get<MarketBar[]>(cacheKey);

        if (cached) {
          this.stats.cacheHits++;
          this.stats.latencyMs = Date.now() - startTime;
          this.logger.debug('Cache hit for bars', {
            symbol: params.symbol,
            key: cacheKey,
            count: cached.length,
          });
          return cached;
        }

        this.stats.cacheMisses++;
      }

      // Try providers in order with fallback
      const errors: ProviderError[] = [];

      for (const item of this.providers) {
        // Check circuit breaker
        if (!this.canAttemptProvider(item.name)) {
          this.logger.warn('Provider circuit breaker open', {
            provider: item.name,
            state: this.circuitBreakers.get(item.name)?.state,
          });
          continue;
        }

        try {
          this.logger.debug('Attempting provider', {
            provider: item.name,
            timeout: item.timeout,
          });

          const bars = await this.executeWithTimeout(
            item.provider.getBars(params),
            item.timeout,
            item.name
          );

          // Success - record and cache
          this.recordProviderSuccess(item.name);
          this.stats.latencyMs = Date.now() - startTime;

          if (this.cacheEnabled && bars.length > 0) {
            const cacheKey = this.buildCacheKey(params);
            const ttl = this.selectCacheTTL(params);
            await this.cacheService.set(cacheKey, bars, ttl);
            this.logger.debug('Cached bars', {
              key: cacheKey,
              count: bars.length,
              ttl,
            });
          }

          this.logger.info('Provider succeeded', {
            provider: item.name,
            count: bars.length,
            latencyMs: this.stats.latencyMs,
          });

          return bars;
        } catch (error) {
          const providerError = this.classifyError(error, item.name);
          errors.push(providerError);
          this.recordProviderFailure(item.name);

          this.logger.warn('Provider failed, trying next', {
            provider: item.name,
            errorType: providerError.type,
            retryable: providerError.retryable,
            message: providerError.message,
          });

          // Continue to next provider if retryable
          if (!providerError.retryable) {
            break;
          }
        }
      }

      // All providers failed
      this.stats.errors++;
      this.stats.latencyMs = Date.now() - startTime;

      const errorMessage = `All providers failed: ${errors.map((e) => `${e.provider}(${e.type})`).join(', ')}`;
      this.logger.error('All providers exhausted', {
        errors: errors.map((e) => ({
          provider: e.provider,
          type: e.type,
          message: e.message,
        })),
      });

      throw new Error(errorMessage);
    } catch (error) {
      this.stats.errors++;
      this.stats.latencyMs = Date.now() - startTime;
      throw error;
    }
  }

  getCapabilities(): ProviderCapabilities {
    // Return capabilities from primary provider
    if (this.providers.length > 0) {
      return this.providers[0]!.provider.getCapabilities();
    }

    throw new Error('No providers available');
  }

  subscribe(symbol: string, handler: (bar: MarketBar) => void): () => void {
    if (!this.subscriptions.has(symbol)) {
      this.subscriptions.set(symbol, new Set());
    }

    const handlers = this.subscriptions.get(symbol)!;
    handlers.add(handler);
    this.stats.subscriptions++;

    // Subscribe to primary provider
    const primaryProvider = this.providers[0];
    let unsubscribe: (() => void) | undefined;

    if (primaryProvider) {
      unsubscribe = primaryProvider.provider.subscribe(symbol, handler);
    }

    // Return unsubscribe function
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.subscriptions.delete(symbol);
      }
      this.stats.subscriptions--;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }

  unsubscribeAll(): void {
    const count = this.subscriptions.size;
    this.subscriptions.clear();
    this.stats.subscriptions = 0;

    // Unsubscribe from all providers
    for (const item of this.providers) {
      try {
        item.provider.unsubscribeAll();
      } catch (error) {
        this.logger.error('Provider unsubscribe failed', {
          provider: item.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info('Composite provider unsubscribed all', { count });
  }

  getSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  async validateSymbol(symbol: string): Promise<boolean> {
    // Try each provider until one succeeds
    for (const item of this.providers) {
      try {
        const valid = await item.provider.validateSymbol(symbol);
        if (valid) {
          return true;
        }
      } catch (error) {
        this.logger.debug('Symbol validation failed', {
          provider: item.name,
          symbol,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return false;
  }

  getStats(): ProviderStats {
    return { ...this.stats };
  }

  /**
   * Build deterministic cache key
   */
  private buildCacheKey(params: GetBarsParams): string {
    const date = params.from ? new Date(params.from).toISOString().split('T')[0] : 'latest';
    return `daily:${params.symbol}:${date}:${params.timeframe}:v1`;
  }

  /**
   * Select appropriate cache TTL based on data recency
   */
  private selectCacheTTL(params: GetBarsParams): number {
    if (!params.from) {
      return this.cacheTTL.realtime;
    }

    const fromDate = new Date(params.from);
    const now = new Date();
    const daysDiff = (now.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);

    // Use historical TTL if data is more than 2 days old
    return daysDiff > 2 ? this.cacheTTL.historical : this.cacheTTL.realtime;
  }

  /**
   * Execute promise with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    providerName: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          const error = new Error(`Provider timeout after ${timeoutMs}ms`) as ProviderError;
          error.type = ProviderErrorType.TIMEOUT;
          error.provider = providerName;
          error.retryable = true;
          reject(error);
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * Classify error type for appropriate handling
   */
  private classifyError(error: unknown, providerName: string): ProviderError {
    const baseError = error instanceof Error ? error : new Error(String(error));
    const providerError = baseError as ProviderError;

    providerError.provider = providerName;

    // Check if already classified
    if (providerError.type) {
      return providerError;
    }

    // Classify based on message
    const message = baseError.message.toLowerCase();

    if (message.includes('timeout')) {
      providerError.type = ProviderErrorType.TIMEOUT;
      providerError.retryable = true;
    } else if (message.includes('rate limit') || message.includes('429')) {
      providerError.type = ProviderErrorType.RATE_LIMIT;
      providerError.retryable = true;
    } else if (message.includes('auth') || message.includes('401') || message.includes('403')) {
      providerError.type = ProviderErrorType.AUTH_FAILED;
      providerError.retryable = false;
    } else if (message.includes('symbol') || message.includes('404')) {
      providerError.type = ProviderErrorType.INVALID_SYMBOL;
      providerError.retryable = false;
    } else if (message.includes('no data')) {
      providerError.type = ProviderErrorType.NO_DATA;
      providerError.retryable = true;
    } else if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    ) {
      providerError.type = ProviderErrorType.NETWORK;
      providerError.retryable = true;
    } else {
      providerError.type = ProviderErrorType.UNKNOWN;
      providerError.retryable = true;
    }

    return providerError;
  }

  /**
   * Check if provider can be attempted based on circuit breaker state
   */
  private canAttemptProvider(providerName: string): boolean {
    const breaker = this.circuitBreakers.get(providerName);
    if (!breaker) return true;

    const now = Date.now();

    switch (breaker.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        // Check if timeout has passed
        if (now - breaker.lastFailure > this.CIRCUIT_BREAKER_TIMEOUT) {
          breaker.state = 'HALF_OPEN';
          breaker.failures = 0;
          return true;
        }
        return false;

      case 'HALF_OPEN':
        return breaker.failures < this.CIRCUIT_BREAKER_HALF_OPEN_REQUESTS;

      default:
        return true;
    }
  }

  /**
   * Record provider success
   */
  private recordProviderSuccess(providerName: string): void {
    const breaker = this.circuitBreakers.get(providerName);
    if (breaker) {
      breaker.failures = 0;
      breaker.state = 'CLOSED';
    }
  }

  /**
   * Record provider failure
   */
  private recordProviderFailure(providerName: string): void {
    const breaker = this.circuitBreakers.get(providerName);
    if (!breaker) return;

    breaker.failures++;
    breaker.lastFailure = Date.now();

    if (breaker.state === 'HALF_OPEN') {
      // Failed during half-open, reopen circuit
      breaker.state = 'OPEN';
      this.logger.warn('Circuit breaker reopened', { provider: providerName });
    } else if (breaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      // Too many failures, open circuit
      breaker.state = 'OPEN';
      this.logger.warn('Circuit breaker opened', {
        provider: providerName,
        failures: breaker.failures,
      });
    }
  }
}
