/**
 * @fileoverview Databento Cache Wrapper
 *
 * Transparent caching layer that intercepts Databento MCP tool calls and
 * caches get_historical_bars requests through SupabaseMarketCacheService.
 *
 * Other Databento MCP tools (get_futures_quote, get_session_info, etc.)
 * are passed through unchanged.
 *
 * @module @tjr/app/services/databento-cache-wrapper
 */

import type { Logger } from '@tjr/logger';
import type { MarketBar } from '@tjr/contracts';
import { SupabaseMarketCacheService, SupabaseMarketCacheConfig } from './supabase-market-cache.service.js';
import type { McpClientService, ToolResult } from './mcp-client.service.js';

/**
 * Configuration for Databento Cache Wrapper
 */
export interface DatabentoCacheWrapperConfig extends SupabaseMarketCacheConfig {
  /** MCP client instance for Databento tool calls */
  mcpClient: McpClientService;
}

/**
 * Databento Cache Wrapper
 *
 * Wraps McpClientService to transparently cache get_historical_bars requests.
 * All other Databento tools are passed through unchanged.
 *
 * @example
 * ```typescript
 * const wrapper = new DatabentoCacheWrapper({
 *   mcpClient: mcpClient,
 *   supabaseUrl: process.env.SUPABASE_URL!,
 *   supabaseKey: process.env.SUPABASE_KEY!,
 *   logger: logger.child({ service: 'cache-wrapper' })
 * });
 *
 * // This call will be cached
 * const result = await wrapper.executeTool('databento__get_historical_bars', {
 *   symbol: 'ES',
 *   timeframe: '1h',
 *   count: 24
 * });
 *
 * // This call passes through (not cached)
 * const quote = await wrapper.executeTool('databento__get_futures_quote', {
 *   symbol: 'ES'
 * });
 * ```
 */
export class DatabentoCacheWrapper {
  private cacheService: SupabaseMarketCacheService;
  private mcpClient: McpClientService;
  private logger: Logger;

  constructor(config: DatabentoCacheWrapperConfig) {
    this.mcpClient = config.mcpClient;
    this.logger = config.logger;

    // Initialize Supabase cache service
    this.cacheService = new SupabaseMarketCacheService({
      supabaseUrl: config.supabaseUrl,
      supabaseKey: config.supabaseKey,
      logger: config.logger.child({ service: 'supabase-cache' }),
      ttlOverrides: config.ttlOverrides,
    });
  }

  /**
   * Execute a Databento MCP tool call with transparent caching
   *
   * Flow:
   * 1. If tool is 'databento__get_historical_bars', use cache-first strategy
   * 2. Otherwise, pass through to MCP client unchanged
   *
   * @param toolName - Full MCP tool name (e.g., 'databento__get_historical_bars')
   * @param toolArguments - Tool arguments
   * @returns Tool execution result
   *
   * @example
   * ```typescript
   * // Cached call
   * const bars = await wrapper.executeTool('databento__get_historical_bars', {
   *   symbol: 'ES',
   *   timeframe: '1h',
   *   count: 24
   * });
   *
   * // Pass-through call
   * const quote = await wrapper.executeTool('databento__get_futures_quote', {
   *   symbol: 'NQ'
   * });
   * ```
   */
  async executeTool(toolName: string, toolArguments: Record<string, unknown>): Promise<ToolResult> {
    // Check if this is a cacheable tool
    if (toolName === 'databento__get_historical_bars') {
      return await this.executeHistoricalBarsWithCache(toolArguments);
    }

    // Pass through all other tools unchanged
    return await this.mcpClient.executeTool(toolName, toolArguments);
  }

  /**
   * Execute get_historical_bars with cache-first strategy
   *
   * @param args - Tool arguments (symbol, timeframe, count)
   * @returns Tool result with cached or fresh data
   */
  private async executeHistoricalBarsWithCache(args: Record<string, unknown>): Promise<ToolResult> {
    // Validate arguments
    const symbol = String(args['symbol'] ?? '');
    const timeframe = String(args['timeframe'] ?? '1h');
    const count = Number(args['count'] ?? 100);

    if (!symbol) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: symbol parameter is required for get_historical_bars',
          },
        ],
        isError: true,
      };
    }

    try {
      // Use cache-first strategy
      const bars = await this.cacheService.getHistoricalBars(symbol, timeframe, count, async () => {
        // Fallback: Call Databento MCP directly
        this.logger.debug('Fetching from Databento MCP', {
          symbol,
          timeframe,
          count,
        });

        const mcpResult = await this.mcpClient.executeTool('databento__get_historical_bars', args);

        // Check for MCP errors
        if (mcpResult.isError) {
          throw new Error(`Databento MCP error: ${mcpResult.content[0]?.text}`);
        }

        // Parse MCP result (assumes JSON response)
        const resultText = mcpResult.content[0]?.text ?? '[]';
        const parsedBars = this.parseMcpBars(resultText);

        return parsedBars;
      });

      // Return bars in MCP tool result format
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(bars, null, 2),
          },
        ],
        isError: false,
      };
    } catch (error) {
      this.logger.error('Cache-wrapped get_historical_bars failed', {
        symbol,
        timeframe,
        count,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        content: [
          {
            type: 'text',
            text: `Error fetching historical bars: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Parse MCP tool result text into MarketBar array
   *
   * Handles both JSON array format and text-based formats.
   *
   * @param resultText - MCP tool result content text
   * @returns Array of market bars
   */
  private parseMcpBars(resultText: string): MarketBar[] {
    try {
      // Try parsing as JSON array
      const parsed = JSON.parse(resultText);

      if (Array.isArray(parsed)) {
        // Validate and transform to MarketBar format
        return parsed.map((bar: any) => ({
          timestamp: bar.timestamp ?? bar.ts_event ?? new Date(bar.time).toISOString(),
          open: Number(bar.open),
          high: Number(bar.high),
          low: Number(bar.low),
          close: Number(bar.close),
          volume: Number(bar.volume ?? 0),
        }));
      }

      // If parsed is not an array, try extracting bars from object
      if (parsed.bars && Array.isArray(parsed.bars)) {
        return parsed.bars.map((bar: any) => ({
          timestamp: bar.timestamp ?? bar.ts_event ?? new Date(bar.time).toISOString(),
          open: Number(bar.open),
          high: Number(bar.high),
          low: Number(bar.low),
          close: Number(bar.close),
          volume: Number(bar.volume ?? 0),
        }));
      }

      this.logger.warn('Unexpected MCP result format, returning empty array', {
        resultText: resultText.substring(0, 200),
      });

      return [];
    } catch (parseError) {
      this.logger.error('Failed to parse MCP bars result', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        resultText: resultText.substring(0, 200),
      });

      return [];
    }
  }

  /**
   * Clean up expired cache entries
   *
   * Delegates to underlying SupabaseMarketCacheService.
   *
   * @returns Number of cache entries deleted
   */
  async cleanupExpiredCache(): Promise<number> {
    return await this.cacheService.cleanupExpiredCache();
  }

  /**
   * Get cache statistics
   *
   * Delegates to underlying SupabaseMarketCacheService.
   *
   * @returns Cache statistics
   */
  async getCacheStats(): Promise<{
    totalBars: number;
    expiredBars: number;
    activeBars: number;
  }> {
    return await this.cacheService.getCacheStats();
  }

  /**
   * Get all available MCP tools (pass-through to MCP client)
   *
   * @returns Array of available tools
   */
  getAllTools(): Array<{ name: string; description: string; input_schema: { type: 'object'; [key: string]: unknown } }> {
    return this.mcpClient.getAllTools();
  }
}

/**
 * Example usage in Discord bot:
 *
 * ```typescript
 * import { McpClientService } from './services/mcp-client.service';
 * import { DatabentoCacheWrapper } from './services/databento-cache-wrapper';
 * import { createLogger } from '@tjr/logger';
 *
 * // Initialize MCP client
 * const logger = createLogger({ module: 'bot' });
 * const mcpClient = new McpClientService(logger.child({ service: 'mcp' }));
 * await mcpClient.initialize(); // Loads .mcp.json config
 *
 * // Wrap MCP client with caching layer
 * const cachedClient = new DatabentoCacheWrapper({
 *   mcpClient: mcpClient,
 *   supabaseUrl: process.env.SUPABASE_URL!,
 *   supabaseKey: process.env.SUPABASE_KEY!,
 *   logger: logger.child({ service: 'cache-wrapper' })
 * });
 *
 * // Use cached client instead of direct MCP client
 * // This call will check cache first
 * const barsResult = await cachedClient.executeTool('databento__get_historical_bars', {
 *   symbol: 'ES',
 *   timeframe: '1h',
 *   count: 24
 * });
 *
 * const bars = JSON.parse(barsResult.content[0].text);
 * console.log(`Fetched ${bars.length} bars`);
 *
 * // Other tools pass through unchanged
 * const quoteResult = await cachedClient.executeTool('databento__get_futures_quote', {
 *   symbol: 'NQ'
 * });
 *
 * // Periodic cleanup (schedule with cron or setInterval)
 * setInterval(async () => {
 *   const deleted = await cachedClient.cleanupExpiredCache();
 *   logger.info('Cache cleanup', { deleted });
 * }, 60 * 60 * 1000); // Every hour
 * ```
 */
