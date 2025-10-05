/**
 * @fileoverview Supabase Market Data Cache - Usage Examples
 *
 * Demonstrates how to use SupabaseMarketCacheService and DatabentoCacheWrapper
 * for caching Databento MCP historical bars.
 *
 * To run this demo:
 * 1. Set SUPABASE_URL and SUPABASE_KEY in .env
 * 2. Ensure .mcp.json has databento server configured
 * 3. Run: pnpm tsx examples/supabase-cache-demo.ts
 */

import { SupabaseMarketCacheService } from '../src/services/supabase-market-cache.service.js';
import { DatabentoCacheWrapper } from '../src/services/databento-cache-wrapper.js';
import { McpClientService } from '../src/services/mcp-client.service.js';
import { createLogger } from '@tjr/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function demonstrateCacheUsage() {
  const logger = createLogger({ module: 'cache-demo', level: 'info' });

  // Validate environment
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    logger.error('Missing Supabase credentials', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey,
    });
    throw new Error('SUPABASE_URL and SUPABASE_KEY must be set in .env');
  }

  // ========================================================================
  // Example 1: Direct SupabaseMarketCacheService Usage
  // ========================================================================
  logger.info('=== Example 1: Direct Cache Service ===');

  const cacheService = new SupabaseMarketCacheService({
    supabaseUrl,
    supabaseKey,
    logger: logger.child({ service: 'cache' }),
  });

  // Simulate fetching bars with cache-first strategy
  const symbol = 'ES';
  const timeframe = '1h';
  const count = 24;

  logger.info('Fetching historical bars (cache-first)', { symbol, timeframe, count });

  const bars = await cacheService.getHistoricalBars(symbol, timeframe, count, async () => {
    // Simulate Databento MCP call
    logger.info('Cache miss - simulating Databento fetch');

    // Mock data (in production, this would be actual Databento MCP call)
    const mockBars = Array.from({ length: count }, (_, i) => ({
      timestamp: new Date(Date.now() - (count - i) * 60 * 60 * 1000).toISOString(),
      open: 5700 + Math.random() * 10,
      high: 5710 + Math.random() * 10,
      low: 5690 + Math.random() * 10,
      close: 5700 + Math.random() * 10,
      volume: Math.floor(Math.random() * 100000),
    }));

    return mockBars;
  });

  logger.info('Bars fetched', {
    count: bars.length,
    firstBar: bars[0]?.timestamp,
    lastBar: bars[bars.length - 1]?.timestamp,
  });

  // ========================================================================
  // Example 2: Cache Hit Demonstration
  // ========================================================================
  logger.info('=== Example 2: Cache Hit ===');

  // Fetch same data again - should hit cache
  const cachedBars = await cacheService.getHistoricalBars(symbol, timeframe, count, async () => {
    logger.warn('This should not be called (cache hit expected)');
    return [];
  });

  logger.info('Second fetch completed', {
    count: cachedBars.length,
    wasFromCache: cachedBars.length === bars.length,
  });

  // ========================================================================
  // Example 3: Cache Statistics
  // ========================================================================
  logger.info('=== Example 3: Cache Statistics ===');

  const stats = await cacheService.getCacheStats();
  logger.info('Cache statistics', stats);

  // ========================================================================
  // Example 4: DatabentoCacheWrapper with MCP Client
  // ========================================================================
  logger.info('=== Example 4: DatabentoCacheWrapper ===');

  // Initialize MCP client
  const mcpClient = new McpClientService(logger.child({ service: 'mcp' }));
  await mcpClient.initialize(); // Loads .mcp.json

  // Wrap MCP client with caching
  const cachedClient = new DatabentoCacheWrapper({
    mcpClient,
    supabaseUrl,
    supabaseKey,
    logger: logger.child({ service: 'wrapper' }),
  });

  logger.info('MCP client initialized with cache wrapper');

  // Execute cached tool call
  try {
    const result = await cachedClient.executeTool('databento__get_historical_bars', {
      symbol: 'NQ',
      timeframe: '1h',
      count: 12,
    });

    if (!result.isError) {
      const nqBars = JSON.parse(result.content[0].text);
      logger.info('NQ bars fetched via cached wrapper', {
        count: nqBars.length,
      });
    } else {
      logger.error('Tool execution failed', {
        error: result.content[0].text,
      });
    }
  } catch (error) {
    logger.error('MCP tool call failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // ========================================================================
  // Example 5: Cache Cleanup
  // ========================================================================
  logger.info('=== Example 5: Cache Cleanup ===');

  const deletedCount = await cacheService.cleanupExpiredCache();
  logger.info('Cache cleanup completed', { deletedCount });

  // Final stats
  const finalStats = await cacheService.getCacheStats();
  logger.info('Final cache statistics', finalStats);

  // Close MCP client
  await mcpClient.close();
  logger.info('Demo completed successfully');
}

// ============================================================================
// Main Execution
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateCacheUsage()
    .then(() => {
      console.log('\n✅ Demo completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Demo failed:', error);
      process.exit(1);
    });
}

export { demonstrateCacheUsage };
