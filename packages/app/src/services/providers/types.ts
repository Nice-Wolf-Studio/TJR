/**
 * Provider service types and interfaces
 */

import type { MarketBar, GetBarsParams, ProviderCapabilities } from '@tjr/contracts';
import type { Service } from '../../container/types.js';

/**
 * Market data provider service interface
 */
export interface ProviderService extends Service {
  /**
   * Get historical bars
   */
  getBars(params: GetBarsParams): Promise<MarketBar[]>;

  /**
   * Get provider capabilities
   */
  getCapabilities(): ProviderCapabilities;

  /**
   * Subscribe to real-time data
   */
  subscribe(symbol: string, handler: (bar: MarketBar) => void): () => void;

  /**
   * Unsubscribe from all real-time data
   */
  unsubscribeAll(): void;

  /**
   * Get current subscriptions
   */
  getSubscriptions(): string[];

  /**
   * Validate symbol exists
   */
  validateSymbol(symbol: string): Promise<boolean>;

  /**
   * Get provider statistics
   */
  getStats(): ProviderStats;
}

/**
 * Provider statistics
 */
export interface ProviderStats {
  requests: number;
  errors: number;
  latencyMs: number;
  cacheHits: number;
  cacheMisses: number;
  subscriptions: number;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  type: 'fixture' | 'polygon' | 'alpaca';
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  cacheEnabled?: boolean;
}