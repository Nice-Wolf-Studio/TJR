/**
 * @tjr/provider-databento
 *
 * Databento provider with large-window chunking support
 *
 * @packageDocumentation
 */

// Export main functions
export { getBars, capabilities, aggregateToTimeframe, calculateChunks } from './databento.js';

// Export types
export type { GetBarsOptions, GetBarsResult, DabentoCapabilities } from './types.js';
