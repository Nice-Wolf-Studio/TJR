/**
 * Type definitions for Databento provider
 */

import type { Bar, Timeframe } from '@tjr-suite/market-data-core';

/**
 * Provider options for getBars
 */
export interface GetBarsOptions {
  /**
   * Symbol to fetch (e.g., "ES", "NQ")
   */
  symbol: string;

  /**
   * Timeframe for bars
   */
  timeframe: Timeframe;

  /**
   * Start timestamp (UTC milliseconds)
   */
  from: number;

  /**
   * End timestamp (UTC milliseconds)
   */
  to: number;

  /**
   * API key for Databento (if not in env)
   */
  apiKey?: string;

  /**
   * Enable chunking for large windows
   * @default true
   */
  enableChunking?: boolean;

  /**
   * Max days per chunk (for large window requests)
   * @default 30
   */
  maxDaysPerChunk?: number;
}

/**
 * Result from getBars
 */
export interface GetBarsResult {
  /**
   * Fetched bars
   */
  bars: Bar[];

  /**
   * Metadata about the request
   */
  metadata: {
    symbol: string;
    timeframe: Timeframe;
    from: number;
    to: number;
    barCount: number;
    chunksUsed: number;
    source: 'databento' | 'fixture';
  };
}

/**
 * Provider capabilities
 */
export interface DabentoCapabilities {
  providerId: 'databento';
  timeframes: readonly Timeframe[];
  assetClasses: readonly string[];
  maxLookbackDays: number;
  priority: number;
  freshnessSeconds: number;
  supportsChunking: boolean;
  defaultChunkSize: number;
}