/**
 * Fixture-based provider for deterministic testing
 */

import type { Logger } from '@tjr/logger';
import type { MarketBar, GetBarsParams, ProviderCapabilities } from '@tjr/contracts';
import { Timeframe } from '@tjr/contracts';
import type { ProviderService, ProviderStats } from './types.js';
import type { HealthStatus } from '../../container/types.js';

export interface FixtureProviderConfig {
  logger: Logger;
  fixturesPath?: string;
  simulateLatency?: boolean;
  latencyMs?: number;
}

/**
 * Provider that returns fixture data for testing
 */
export class FixtureProvider implements ProviderService {
  readonly name = 'ProviderService';
  readonly dependencies = ['Logger', 'CacheService'];

  private logger: Logger;
  private fixtures: Map<string, MarketBar[]> = new Map();
  private subscriptions = new Map<string, Set<(bar: MarketBar) => void>>();
  private stats: ProviderStats = {
    requests: 0,
    errors: 0,
    latencyMs: 0,
    cacheHits: 0,
    cacheMisses: 0,
    subscriptions: 0
  };
  private simulateLatency: boolean;
  private latencyMs: number;

  constructor(config: FixtureProviderConfig) {
    this.logger = config.logger;
    this.simulateLatency = config.simulateLatency ?? false;
    this.latencyMs = config.latencyMs ?? 50;
  }

  async initialize(): Promise<void> {
    this.logger.info('Fixture provider initializing');
    await this.loadFixtures();
  }

  async shutdown(): Promise<void> {
    this.logger.info('Fixture provider shutting down');
    this.unsubscribeAll();
    this.fixtures.clear();
  }

  healthCheck(): HealthStatus {
    return {
      healthy: true,
      message: 'Fixture provider is healthy',
      details: {
        fixturesLoaded: this.fixtures.size,
        subscriptions: this.subscriptions.size,
        stats: this.stats
      }
    };
  }

  async getBars(params: GetBarsParams): Promise<MarketBar[]> {
    this.stats.requests++;
    const startTime = Date.now();

    try {
      await this.simulateDelay();

      // Get fixtures for symbol
      const bars = this.fixtures.get(params.symbol) || this.generateDefaultBars(params);

      // Filter by date range if provided
      let filtered = bars;
      if (params.from || params.to) {
        filtered = bars.filter(bar => {
          const barTime = new Date(bar.timestamp);
          if (params.from && barTime < new Date(params.from)) return false;
          if (params.to && barTime > new Date(params.to)) return false;
          return true;
        });
      }

      // Apply limit if specified
      if (params.limit) {
        filtered = filtered.slice(-params.limit);
      }

      this.stats.latencyMs = Date.now() - startTime;
      this.logger.debug('Fixture provider returning bars', {
        symbol: params.symbol,
        count: filtered.length,
        latencyMs: this.stats.latencyMs
      });

      return filtered;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsTimeframes: [Timeframe.M1, Timeframe.M5, Timeframe.M10, Timeframe.H1, Timeframe.H4, Timeframe.D1],
      maxBarsPerRequest: 5000,
      requiresAuthentication: false,
      rateLimits: {
        requestsPerMinute: 1000
      },
      supportsExtendedHours: false,
      historicalDataFrom: '2020-01-01T00:00:00.000Z'
    };
  }

  subscribe(symbol: string, handler: (bar: MarketBar) => void): () => void {
    if (!this.subscriptions.has(symbol)) {
      this.subscriptions.set(symbol, new Set());
    }

    const handlers = this.subscriptions.get(symbol)!;
    handlers.add(handler);
    this.stats.subscriptions++;

    this.logger.debug('Fixture provider subscription added', { symbol });

    // Return unsubscribe function
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.subscriptions.delete(symbol);
      }
      this.stats.subscriptions--;
      this.logger.debug('Fixture provider subscription removed', { symbol });
    };
  }

  unsubscribeAll(): void {
    const count = this.subscriptions.size;
    this.subscriptions.clear();
    this.stats.subscriptions = 0;
    this.logger.info('Fixture provider unsubscribed all', { count });
  }

  getSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  async validateSymbol(symbol: string): Promise<boolean> {
    // For fixture provider, allow common symbols
    const supportedSymbols = ['SPY', 'QQQ', 'IWM', 'ES', 'NQ', 'RTY'];
    return supportedSymbols.includes(symbol);
  }

  getStats(): ProviderStats {
    return { ...this.stats };
  }

  /**
   * Simulate real-time bar update
   */
  simulateBarUpdate(symbol: string, bar: MarketBar): void {
    const handlers = this.subscriptions.get(symbol);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(bar);
        } catch (error) {
          this.logger.error('Fixture provider handler error', {
            symbol,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });
    }
  }

  private async loadFixtures(): Promise<void> {
    // Load default fixture data
    const spy5min = this.generateDefaultBars({
      symbol: 'SPY',
      timeframe: Timeframe.M5,
      from: new Date(Date.now() - 86400000).toISOString(),
      limit: 390 // Full trading day
    });

    this.fixtures.set('SPY', spy5min);
    this.fixtures.set('QQQ', this.adjustPrices(spy5min, 0.8));
    this.fixtures.set('IWM', this.adjustPrices(spy5min, 0.4));

    this.logger.info('Fixture provider loaded fixtures', {
      symbols: Array.from(this.fixtures.keys())
    });
  }

  private generateDefaultBars(params: GetBarsParams): MarketBar[] {
    const bars: MarketBar[] = [];
    const now = new Date();
    const intervalMinutes = this.timeframeToMinutes(params.timeframe);
    const count = params.limit || 100;

    for (let i = count - 1; i >= 0; i--) {
      const time = new Date(now.getTime() - i * intervalMinutes * 60000);
      const basePrice = 400 + Math.sin(i / 10) * 5; // Oscillating price

      bars.push({
        timestamp: time.toISOString(),
        open: basePrice + Math.random() * 2 - 1,
        high: basePrice + Math.random() * 3,
        low: basePrice - Math.random() * 3,
        close: basePrice + Math.random() * 2 - 1,
        volume: Math.floor(1000000 + Math.random() * 500000)
      });
    }

    return bars;
  }

  private adjustPrices(bars: MarketBar[], multiplier: number): MarketBar[] {
    return bars.map(bar => ({
      ...bar,
      open: bar.open * multiplier,
      high: bar.high * multiplier,
      low: bar.low * multiplier,
      close: bar.close * multiplier
    }));
  }

  private timeframeToMinutes(timeframe: Timeframe): number {
    const map: Record<Timeframe, number> = {
      [Timeframe.M1]: 1,
      [Timeframe.M5]: 5,
      [Timeframe.M10]: 10,
      [Timeframe.H1]: 60,
      [Timeframe.H4]: 240,
      [Timeframe.D1]: 1440
    };
    return map[timeframe] || 5;
  }

  private async simulateDelay(): Promise<void> {
    if (this.simulateLatency) {
      await new Promise(resolve => setTimeout(resolve, this.latencyMs));
    }
  }
}