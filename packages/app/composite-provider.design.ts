/**
 * Composite Provider Service Design
 *
 * This file contains the complete design specification for the composite provider
 * that will manage multiple data providers with fallback chains.
 */

import type { MarketBar, GetBarsParams, ProviderCapabilities } from '@tjr/contracts';
import type { ProviderService, ProviderStats } from './types.js';
import type { Logger } from '@tjr/logger';
import type { CacheService } from '../cache/types.js';
import type { HealthStatus } from '../../container/types.js';

// ============================================================================
// Configuration Interfaces
// ============================================================================

/**
 * Configuration for the composite provider
 */
export interface CompositeProviderConfig {
  logger: Logger;
  cache: CacheService;
  providers: ProviderChain[];
  defaultTimeout: number;
  retryPolicy: RetryPolicy;
  circuitBreaker?: CircuitBreakerConfig;
}

/**
 * Individual provider in the chain
 */
export interface ProviderChain {
  name: string;
  provider: ProviderService;
  priority: number;
  timeout?: number;
  weight?: number; // For load balancing
  healthThreshold?: number; // Min health score to use
  fallbackOnly?: boolean; // Only use as fallback
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
  jitterMs?: number;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  enabled: boolean;
  threshold: number; // Failure threshold
  resetTimeMs: number;
  halfOpenRequests: number;
}

// ============================================================================
// Provider Health Tracking
// ============================================================================

/**
 * Provider health metrics
 */
export interface ProviderHealth {
  provider: string;
  healthy: boolean;
  successRate: number;
  avgLatencyMs: number;
  lastError?: string;
  lastSuccess?: Date;
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

// ============================================================================
// Composite Provider Implementation
// ============================================================================

/**
 * Composite provider that manages multiple data providers with intelligent fallback
 */
export class CompositeProvider implements ProviderService {
  readonly name = 'CompositeProvider';
  readonly dependencies = ['Logger', 'CacheService'];

  private providers: Map<string, ProviderChain> = new Map();
  private logger: Logger;
  private cache: CacheService;
  private defaultTimeout: number;
  private retryPolicy: RetryPolicy;
  private healthTracking: Map<string, ProviderHealth> = new Map();
  private stats: CompositeProviderStats;

  constructor(config: CompositeProviderConfig) {
    this.logger = config.logger;
    this.cache = config.cache;
    this.defaultTimeout = config.defaultTimeout;
    this.retryPolicy = config.retryPolicy;

    // Initialize providers
    this.initializeProviders(config.providers);

    // Initialize stats
    this.stats = {
      requests: 0,
      errors: 0,
      latencyMs: 0,
      cacheHits: 0,
      cacheMisses: 0,
      subscriptions: 0,
      providerFailures: new Map(),
      providerSuccesses: new Map()
    };
  }

  /**
   * Initialize lifecycle
   */
  async initialize(): Promise<void> {
    this.logger.info('Composite provider initializing', {
      providers: Array.from(this.providers.keys()),
      defaultTimeout: this.defaultTimeout
    });

    // Initialize all providers
    for (const chain of this.providers.values()) {
      try {
        await chain.provider.initialize();
        this.updateHealth(chain.name, true);
      } catch (error) {
        this.logger.warn('Provider initialization failed', {
          provider: chain.name,
          error: error instanceof Error ? error.message : String(error)
        });
        this.updateHealth(chain.name, false, error);
      }
    }
  }

  /**
   * Shutdown lifecycle
   */
  async shutdown(): Promise<void> {
    this.logger.info('Composite provider shutting down');

    // Shutdown all providers
    const shutdownPromises = Array.from(this.providers.values()).map(chain =>
      chain.provider.shutdown().catch(error => {
        this.logger.error('Provider shutdown error', {
          provider: chain.name,
          error
        });
      })
    );

    await Promise.all(shutdownPromises);
  }

  /**
   * Health check
   */
  healthCheck(): HealthStatus {
    const healthyProviders = Array.from(this.healthTracking.values())
      .filter(h => h.healthy).length;

    const totalProviders = this.providers.size;
    const healthPercent = (healthyProviders / totalProviders) * 100;

    return {
      healthy: healthPercent > 50, // At least half should be healthy
      message: `${healthyProviders}/${totalProviders} providers healthy`,
      details: {
        providers: Object.fromEntries(
          Array.from(this.healthTracking.entries()).map(([name, health]) => [
            name,
            {
              healthy: health.healthy,
              successRate: health.successRate,
              avgLatencyMs: health.avgLatencyMs,
              circuitState: health.circuitState
            }
          ])
        ),
        stats: this.stats
      }
    };
  }

  /**
   * Get market bars with fallback chain
   */
  async getBars(params: GetBarsParams): Promise<MarketBar[]> {
    const startTime = Date.now();
    this.stats.requests++;

    // Check cache first
    const cacheKey = this.buildCacheKey(params);
    const cached = await this.cache.get<MarketBar[]>(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      this.logger.debug('Cache hit for bars request', { cacheKey });
      return cached;
    }
    this.stats.cacheMisses++;

    // Sort providers by priority
    const sortedProviders = this.getSortedProviders();

    // Try each provider in order
    let lastError: Error | undefined;
    for (const chain of sortedProviders) {
      // Skip unhealthy providers unless they're the last option
      if (!this.shouldUseProvider(chain, sortedProviders)) {
        continue;
      }

      try {
        const result = await this.tryProvider(chain, params);

        if (result && result.length > 0) {
          // Cache successful result
          await this.cache.set(cacheKey, result, this.calculateCacheTTL(params));

          // Update stats
          this.stats.latencyMs = Date.now() - startTime;
          this.updateProviderStats(chain.name, true, this.stats.latencyMs);

          this.logger.info('Provider succeeded', {
            provider: chain.name,
            symbol: params.symbol,
            bars: result.length,
            latencyMs: this.stats.latencyMs
          });

          return result;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.handleProviderError(chain.name, lastError);
      }
    }

    // All providers failed
    this.stats.errors++;
    const errorMessage = lastError?.message || 'All providers failed';
    throw new Error(`CompositeProvider: ${errorMessage}`);
  }

  /**
   * Get provider capabilities (union of all providers)
   */
  getCapabilities(): ProviderCapabilities {
    const capabilities: ProviderCapabilities[] = [];

    for (const chain of this.providers.values()) {
      capabilities.push(chain.provider.getCapabilities());
    }

    // Merge capabilities (simplified - take most permissive)
    return {
      supportsTimeframes: Array.from(new Set(
        capabilities.flatMap(c => c.supportsTimeframes)
      )),
      maxBarsPerRequest: Math.max(...capabilities.map(c => c.maxBarsPerRequest)),
      requiresAuthentication: capabilities.some(c => c.requiresAuthentication),
      rateLimits: {
        requestsPerMinute: Math.min(
          ...capabilities.map(c => c.rateLimits?.requestsPerMinute || Infinity)
        )
      },
      supportsExtendedHours: capabilities.some(c => c.supportsExtendedHours),
      historicalDataFrom: capabilities
        .map(c => c.historicalDataFrom)
        .sort()[0] // Earliest date
    };
  }

  /**
   * Subscribe to real-time data (uses first available provider)
   */
  subscribe(symbol: string, handler: (bar: MarketBar) => void): () => void {
    // Find first healthy provider that supports subscriptions
    const provider = this.getHealthyProviders().find(chain => {
      const caps = chain.provider.getCapabilities();
      return caps.supportsRealtime !== false;
    });

    if (!provider) {
      throw new Error('No healthy providers available for real-time subscription');
    }

    this.stats.subscriptions++;
    return provider.provider.subscribe(symbol, handler);
  }

  /**
   * Unsubscribe from all real-time data
   */
  unsubscribeAll(): void {
    for (const chain of this.providers.values()) {
      chain.provider.unsubscribeAll();
    }
    this.stats.subscriptions = 0;
  }

  /**
   * Get current subscriptions
   */
  getSubscriptions(): string[] {
    const allSubscriptions = new Set<string>();

    for (const chain of this.providers.values()) {
      const subs = chain.provider.getSubscriptions();
      subs.forEach(s => allSubscriptions.add(s));
    }

    return Array.from(allSubscriptions);
  }

  /**
   * Validate symbol using available providers
   */
  async validateSymbol(symbol: string): Promise<boolean> {
    for (const chain of this.getHealthyProviders()) {
      try {
        const valid = await chain.provider.validateSymbol(symbol);
        if (valid) return true;
      } catch {
        // Try next provider
      }
    }
    return false;
  }

  /**
   * Get composite statistics
   */
  getStats(): ProviderStats & CompositeProviderStats {
    return { ...this.stats };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private initializeProviders(chains: ProviderChain[]): void {
    for (const chain of chains) {
      this.providers.set(chain.name, chain);
      this.healthTracking.set(chain.name, {
        provider: chain.name,
        healthy: true,
        successRate: 100,
        avgLatencyMs: 0,
        circuitState: 'CLOSED'
      });
    }
  }

  private getSortedProviders(): ProviderChain[] {
    return Array.from(this.providers.values())
      .sort((a, b) => a.priority - b.priority);
  }

  private getHealthyProviders(): ProviderChain[] {
    return this.getSortedProviders().filter(chain => {
      const health = this.healthTracking.get(chain.name);
      return health?.healthy && health.circuitState !== 'OPEN';
    });
  }

  private shouldUseProvider(chain: ProviderChain, allProviders: ProviderChain[]): boolean {
    const health = this.healthTracking.get(chain.name);

    // Always try if it's the last provider
    const isLastProvider = allProviders.indexOf(chain) === allProviders.length - 1;
    if (isLastProvider) return true;

    // Check health status
    if (!health?.healthy && !chain.fallbackOnly) return false;

    // Check circuit breaker
    if (health?.circuitState === 'OPEN') return false;

    // Check health threshold
    if (chain.healthThreshold && health) {
      return health.successRate >= chain.healthThreshold;
    }

    return true;
  }

  private async tryProvider(
    chain: ProviderChain,
    params: GetBarsParams
  ): Promise<MarketBar[]> {
    const timeout = chain.timeout || this.defaultTimeout;

    // Apply retry logic
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= this.retryPolicy.maxAttempts; attempt++) {
      try {
        return await this.withTimeout(
          chain.provider.getBars(params),
          timeout
        );
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.retryPolicy.maxAttempts) {
          const delay = this.calculateRetryDelay(attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Provider failed after retries');
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Provider timeout after ${timeoutMs}ms`)), timeoutMs)
    );
    return Promise.race([promise, timeout]);
  }

  private calculateRetryDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      this.retryPolicy.initialDelayMs * Math.pow(this.retryPolicy.exponentialBase, attempt - 1),
      this.retryPolicy.maxDelayMs
    );

    // Add jitter if configured
    const jitter = this.retryPolicy.jitterMs
      ? Math.random() * this.retryPolicy.jitterMs
      : 0;

    return exponentialDelay + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private buildCacheKey(params: GetBarsParams): string {
    return `composite:bars:${params.symbol}:${params.timeframe}:${params.from || 'null'}:${params.to || 'null'}:${params.limit || 'null'}`;
  }

  private calculateCacheTTL(params: GetBarsParams): number {
    // Historical data can be cached longer
    const to = params.to ? new Date(params.to) : new Date();
    const isHistorical = to < new Date(Date.now() - 86400000); // More than 24 hours old

    return isHistorical ? 3600000 : 60000; // 1 hour for historical, 1 minute for recent
  }

  private updateHealth(provider: string, success: boolean, error?: any): void {
    const health = this.healthTracking.get(provider);
    if (!health) return;

    // Update success rate (simple moving average)
    const alpha = 0.1; // Smoothing factor
    health.successRate = success
      ? health.successRate * (1 - alpha) + 100 * alpha
      : health.successRate * (1 - alpha);

    health.healthy = health.successRate > 50;

    if (success) {
      health.lastSuccess = new Date();
      health.lastError = undefined;
    } else {
      health.lastError = error?.message || 'Unknown error';
    }

    // Update circuit breaker state
    this.updateCircuitBreaker(health);
  }

  private updateCircuitBreaker(health: ProviderHealth): void {
    // Simple circuit breaker logic
    if (health.successRate < 30) {
      health.circuitState = 'OPEN';
    } else if (health.successRate > 70) {
      health.circuitState = 'CLOSED';
    } else {
      health.circuitState = 'HALF_OPEN';
    }
  }

  private handleProviderError(provider: string, error: Error): void {
    this.logger.warn('Provider failed', {
      provider,
      error: error.message
    });

    this.updateHealth(provider, false, error);
    this.updateProviderStats(provider, false, 0);

    // Update failure count
    const failures = this.stats.providerFailures.get(provider) || 0;
    this.stats.providerFailures.set(provider, failures + 1);
  }

  private updateProviderStats(provider: string, success: boolean, latencyMs: number): void {
    if (success) {
      const successes = this.stats.providerSuccesses.get(provider) || 0;
      this.stats.providerSuccesses.set(provider, successes + 1);

      // Update latency tracking
      const health = this.healthTracking.get(provider);
      if (health) {
        // Exponential moving average for latency
        health.avgLatencyMs = health.avgLatencyMs * 0.9 + latencyMs * 0.1;
      }
    }
  }
}

// ============================================================================
// Extended Statistics Interface
// ============================================================================

interface CompositeProviderStats extends ProviderStats {
  providerFailures: Map<string, number>;
  providerSuccesses: Map<string, number>;
}