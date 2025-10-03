/**
 * @fileoverview Public API for @tjr/provider-yahoo package.
 *
 * Exports Yahoo Finance data provider and related types for TJR Suite.
 *
 * @module @tjr/provider-yahoo
 * @example
 * ```typescript
 * import { YahooProvider } from '@tjr/provider-yahoo';
 * import { Timeframe } from '@tjr/contracts';
 *
 * const provider = new YahooProvider();
 * const bars = await provider.getBars({
 *   symbol: 'ES',
 *   timeframe: Timeframe.M5,
 *   from: '2024-01-15T14:00:00.000Z',
 *   to: '2024-01-15T15:00:00.000Z'
 * });
 * ```
 */

// Export main provider class
export { YahooProvider } from './yahoo-provider.js';

// Export parser utilities
export { parseYahooBar, parseYahooBars } from './parser.js';

// Export types
export type { YahooRawBar, YahooProviderOptions } from './types.js';
export type { ParseResult } from './parser.js';
