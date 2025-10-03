/**
 * Tests for TJRConfluencesCommand
 *
 * Tests confluence analysis including:
 * - Argument parsing (symbol, timeframe)
 * - FVG zone detection
 * - Order Block detection
 * - Confluence scoring
 * - Zone overlaps calculation
 * - All output formats (text, JSON, table, markdown)
 * - Cache integration
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TJRConfluencesCommand } from '../../src/commands/tjr-confluences.command.js';
import { FileConfigService } from '../../src/services/config/config.service.js';
import { createLogger } from '@tjr/logger';
import type { ProviderService } from '../../src/services/providers/types.js';
import type { CacheService } from '../../src/services/cache/types.js';
import { Timeframe } from '@tjr/contracts';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Load fixtures
const btcConfluenceFixture = JSON.parse(
  await fs.readFile(
    new URL('./fixtures/confluences/btc-usdt-5m-confluence.json', import.meta.url),
    'utf-8'
  )
);

const ethConfluenceFixture = JSON.parse(
  await fs.readFile(
    new URL('./fixtures/confluences/eth-usdt-5m-confluence.json', import.meta.url),
    'utf-8'
  )
);

describe('TJRConfluencesCommand', () => {
  let configService: FileConfigService;
  let providerService: ProviderService;
  let cacheService: CacheService;
  let logger: any;
  let confluencesCommand: TJRConfluencesCommand;
  let testConfigDir: string;

  beforeEach(async () => {
    // Create temporary config directory
    testConfigDir = join(tmpdir(), `tjr-test-${Date.now()}`);
    await fs.mkdir(testConfigDir, { recursive: true });

    logger = createLogger({
      level: 'error',
      format: 'json',
    });

    configService = new FileConfigService(logger.child({ service: 'config' }), testConfigDir);

    // Mock provider service that returns fixture data
    providerService = {
      getBars: vi.fn(async ({ symbol }) => {
        if (symbol === 'BTC-USDT') {
          return btcConfluenceFixture.bars;
        } else if (symbol === 'ETH-USDT') {
          return ethConfluenceFixture.bars;
        }
        return [];
      }),
    } as any;

    // Mock cache service
    const cacheStore = new Map<string, any>();
    cacheService = {
      get: vi.fn(async (key: string) => cacheStore.get(key) || null),
      set: vi.fn(async (key: string, value: any) => {
        cacheStore.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        cacheStore.delete(key);
      }),
      clear: vi.fn(async () => {
        cacheStore.clear();
      }),
    } as any;

    confluencesCommand = new TJRConfluencesCommand({
      providerService,
      configService,
      cacheService,
      logger: logger.child({ service: 'tjr-confluences' }),
      userId: 'test-user',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Command Properties', () => {
    it('should have correct command name', () => {
      expect(confluencesCommand.name).toBe('tjr-confluences');
    });

    it('should have description', () => {
      expect(confluencesCommand.description).toBeTruthy();
      expect(confluencesCommand.description).toContain('confluence');
    });

    it('should have aliases', () => {
      expect(confluencesCommand.aliases).toContain('confluences');
      expect(confluencesCommand.aliases).toContain('tjr-zones');
    });
  });

  describe('Argument Parsing - Symbol', () => {
    it('should parse symbol argument', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], {});
      expect(result.success).toBe(true);
      expect(result.metadata?.symbol).toBe('BTC-USDT');
    });

    it('should convert symbol to uppercase', async () => {
      const result = await confluencesCommand.execute(['btc-usdt'], {});
      expect(result.success).toBe(true);
      expect(result.metadata?.symbol).toBe('BTC-USDT');
    });

    it('should error on missing symbol', async () => {
      const result = await confluencesCommand.execute([], {});
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('symbol');
    });
  });

  describe('Argument Parsing - Timeframe', () => {
    it('should default to M5 timeframe', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], {});
      expect(result.success).toBe(true);
      expect(result.metadata?.timeframe).toBe('M5');
    });

    it('should parse M1 timeframe', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT', 'M1'], {});
      expect(result.success).toBe(true);
      expect(result.metadata?.timeframe).toBe('M1');
    });

    it('should parse M5 timeframe explicitly', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT', 'M5'], {});
      expect(result.success).toBe(true);
      expect(result.metadata?.timeframe).toBe('M5');
    });

    it('should parse 5M timeframe format', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT', '5M'], {});
      expect(result.success).toBe(true);
      expect(result.metadata?.timeframe).toBe('M5');
    });

    it('should handle case-insensitive timeframes', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT', 'm5'], {});
      expect(result.success).toBe(true);
      expect(result.metadata?.timeframe).toBe('M5');
    });

    it('should error on invalid timeframe', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT', 'INVALID'], {});
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid timeframe');
    });
  });

  describe('Bar Data Loading', () => {
    it('should call provider service with correct parameters', async () => {
      await confluencesCommand.execute(['BTC-USDT', 'M5'], {});

      expect(providerService.getBars).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTC-USDT',
          timeframe: Timeframe.M5,
        })
      );
    });

    it('should handle empty bar data', async () => {
      providerService.getBars = vi.fn(async () => []);

      const result = await confluencesCommand.execute(['UNKNOWN'], {});
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('No market data');
    });

    it('should handle provider errors', async () => {
      providerService.getBars = vi.fn(async () => {
        throw new Error('Provider connection failed');
      });

      const result = await confluencesCommand.execute(['BTC-USDT'], {});
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('TJR Analysis Integration', () => {
    it('should run analyze() with fixture data', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'json' });
      expect(result.success).toBe(true);

      const output = JSON.parse(result.output);
      expect(output.confluenceScore).toBeDefined();
      expect(output.fvgZones).toBeDefined();
      expect(output.orderBlocks).toBeDefined();
    });

    it('should pass user config to analyze()', async () => {
      // Set custom weights
      await configService.set('test-user', 'confluence.weights.fvg', 0.5);

      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'json' });
      expect(result.success).toBe(true);
    });

    it('should override weights from options', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], {
        format: 'json',
        weights: '{"fvg":0.5,"orderBlock":0.3,"overlap":0.15,"recency":0.05}',
      });

      expect(result.success).toBe(true);
    });

    it('should error on invalid weights JSON', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], {
        weights: '{invalid json}',
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid weights JSON');
    });
  });

  describe('Confluence Report Generation', () => {
    it('should include confluence score', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.confluenceScore).toBeTypeOf('number');
      expect(output.confluenceScore).toBeGreaterThanOrEqual(0);
      expect(output.confluenceScore).toBeLessThanOrEqual(100);
    });

    it('should include score factors', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.factors).toBeInstanceOf(Array);
      expect(output.factors.length).toBeGreaterThan(0);

      const factor = output.factors[0];
      expect(factor.name).toBeDefined();
      expect(factor.weight).toBeTypeOf('number');
      expect(factor.value).toBeTypeOf('number');
      expect(factor.description).toBeTypeOf('string');
    });

    it('should detect FVG zones', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.fvgZones).toBeInstanceOf(Array);
      if (output.fvgZones.length > 0) {
        const fvg = output.fvgZones[0];
        expect(fvg.type).toMatch(/bullish|bearish/);
        expect(fvg.high).toBeTypeOf('number');
        expect(fvg.low).toBeTypeOf('number');
        expect(fvg.size).toBeTypeOf('number');
        expect(fvg.strength).toBeTypeOf('number');
        expect(fvg.filled).toBeTypeOf('boolean');
      }
    });

    it('should detect Order Blocks', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.orderBlocks).toBeInstanceOf(Array);
      if (output.orderBlocks.length > 0) {
        const ob = output.orderBlocks[0];
        expect(ob.type).toMatch(/bullish|bearish/);
        expect(ob.high).toBeTypeOf('number');
        expect(ob.low).toBeTypeOf('number');
        expect(ob.volume).toBeTypeOf('number');
        expect(ob.strength).toBeTypeOf('number');
        expect(ob.mitigated).toBeTypeOf('boolean');
      }
    });

    it('should calculate overlaps', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.overlaps).toBeInstanceOf(Array);
      if (output.overlaps.length > 0) {
        const overlap = output.overlaps[0];
        expect(overlap.fvgIndex).toBeTypeOf('number');
        expect(overlap.orderBlockIndex).toBeTypeOf('number');
        expect(overlap.overlapHigh).toBeTypeOf('number');
        expect(overlap.overlapLow).toBeTypeOf('number');
        expect(overlap.overlapSize).toBeTypeOf('number');
      }
    });

    it('should include metadata', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.metadata).toBeDefined();
      expect(output.metadata.barsAnalyzed).toBeTypeOf('number');
      expect(output.metadata.cacheHit).toBeTypeOf('boolean');
    });
  });

  describe('Cache Integration', () => {
    it('should cache results when enabled', async () => {
      // First call
      const result1 = await confluencesCommand.execute(['BTC-USDT'], {});
      expect(result1.success).toBe(true);
      expect(result1.metadata?.cacheHit).toBe(false);

      // Second call should hit cache
      const result2 = await confluencesCommand.execute(['BTC-USDT'], {});
      expect(result2.success).toBe(true);
      expect(result2.metadata?.cacheHit).toBe(true);
    });

    it('should skip cache when disabled in config', async () => {
      await configService.set('test-user', 'cache.enabled', false);

      const result1 = await confluencesCommand.execute(['BTC-USDT'], {});
      const result2 = await confluencesCommand.execute(['BTC-USDT'], {});

      expect(result1.metadata?.cacheHit).toBe(false);
      expect(result2.metadata?.cacheHit).toBe(false);
    });

    it('should skip cache with --no-cache option', async () => {
      // First call to populate cache
      await confluencesCommand.execute(['BTC-USDT'], {});

      // Second call with noCache should bypass cache
      const result = await confluencesCommand.execute(['BTC-USDT'], { noCache: true });
      expect(result.metadata?.cacheHit).toBe(false);
    });

    it('should have different cache keys for different symbols', async () => {
      await confluencesCommand.execute(['BTC-USDT'], {});
      const result = await confluencesCommand.execute(['ETH-USDT'], {});

      expect(result.metadata?.cacheHit).toBe(false);
    });

    it('should have different cache keys for different timeframes', async () => {
      await confluencesCommand.execute(['BTC-USDT', 'M5'], {});
      const result = await confluencesCommand.execute(['BTC-USDT', 'M1'], {});

      expect(result.metadata?.cacheHit).toBe(false);
    });
  });

  describe('Output Formats - Text', () => {
    it('should format as text by default', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], {});
      expect(typeof result.output).toBe('string');
      expect(result.output).toContain('TJR Confluence Analysis');
    });

    it('should display symbol and timeframe', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT', 'M5'], { format: 'text' });
      expect(result.output).toContain('BTC-USDT');
      expect(result.output).toContain('M5');
    });

    it('should display confluence score', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'text' });
      expect(result.output).toContain('Confluence Score');
    });

    it('should list FVG zones', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'text' });
      expect(result.output).toContain('Fair Value Gaps');
    });

    it('should list Order Blocks', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'text' });
      expect(result.output).toContain('Order Blocks');
    });

    it('should list overlaps when present', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'text' });
      if (result.output.includes('Zone Overlaps')) {
        expect(result.output).toContain('Overlap Range');
      }
    });
  });

  describe('Output Formats - JSON', () => {
    it('should format as valid JSON', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'json' });
      expect(() => JSON.parse(result.output)).not.toThrow();
    });

    it('should include all required fields', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.symbol).toBe('BTC-USDT');
      expect(output.timeframe).toBeDefined();
      expect(output.timestamp).toBeDefined();
      expect(output.confluenceScore).toBeDefined();
      expect(output.factors).toBeDefined();
      expect(output.fvgZones).toBeDefined();
      expect(output.orderBlocks).toBeDefined();
      expect(output.overlaps).toBeDefined();
    });

    it('should be deterministic for same input', async () => {
      const result1 = await confluencesCommand.execute(['BTC-USDT'], {
        format: 'json',
        noCache: true,
      });
      const result2 = await confluencesCommand.execute(['BTC-USDT'], {
        format: 'json',
        noCache: true,
      });

      const output1 = JSON.parse(result1.output);
      const output2 = JSON.parse(result2.output);

      expect(output1.confluenceScore).toBe(output2.confluenceScore);
      expect(output1.fvgZones.length).toBe(output2.fvgZones.length);
      expect(output1.orderBlocks.length).toBe(output2.orderBlocks.length);
    });
  });

  describe('Output Formats - Table', () => {
    it('should format as table with box drawing', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'table' });
      expect(result.output).toContain('┌');
      expect(result.output).toContain('│');
      expect(result.output).toContain('─');
    });

    it('should display summary table', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'table' });
      expect(result.output).toContain('Confluence Analysis Summary');
      expect(result.output).toContain('Symbol');
      expect(result.output).toContain('Score');
    });

    it('should display factors table', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'table' });
      expect(result.output).toContain('Factor');
      expect(result.output).toContain('Weight');
      expect(result.output).toContain('Value');
      expect(result.output).toContain('Contribution');
    });
  });

  describe('Output Formats - Markdown', () => {
    it('should format as markdown', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'markdown' });
      expect(result.output).toContain('#');
      expect(result.output).toContain('##');
    });

    it('should use markdown headings', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'markdown' });
      expect(result.output).toContain('# TJR Confluence Analysis');
      expect(result.output).toContain('## BTC-USDT');
    });

    it('should use markdown tables', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'markdown' });
      expect(result.output).toContain('|');
      expect(result.output).toContain('Factor');
      expect(result.output).toContain('Weight');
    });

    it('should display FVG table in markdown', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'markdown' });
      expect(result.output).toContain('### Fair Value Gaps');
    });

    it('should display Order Blocks table in markdown', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'markdown' });
      expect(result.output).toContain('### Order Blocks');
    });
  });

  describe('Multiple Symbols', () => {
    it('should analyze BTC-USDT correctly', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.symbol).toBe('BTC-USDT');
      expect(result.metadata?.barsAnalyzed).toBe(btcConfluenceFixture.bars.length);
    });

    it('should analyze ETH-USDT correctly', async () => {
      const result = await confluencesCommand.execute(['ETH-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.symbol).toBe('ETH-USDT');
      expect(result.metadata?.barsAnalyzed).toBe(ethConfluenceFixture.bars.length);
    });

    it('should produce different results for different symbols', async () => {
      const btcResult = await confluencesCommand.execute(['BTC-USDT'], { format: 'json' });
      const ethResult = await confluencesCommand.execute(['ETH-USDT'], { format: 'json' });

      const btcOutput = JSON.parse(btcResult.output);
      const ethOutput = JSON.parse(ethResult.output);

      expect(btcOutput.confluenceScore).not.toBe(ethOutput.confluenceScore);
    });
  });

  describe('Error Handling', () => {
    it('should measure execution duration', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], {});
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle analysis errors gracefully', async () => {
      // Return malformed bar data
      providerService.getBars = vi.fn(async () => [
        { timestamp: 'invalid', open: 'bad', high: null } as any,
      ]);

      const result = await confluencesCommand.execute(['BTC-USDT'], {});
      expect(result.success).toBe(false);
    });

    it('should validate output format option', async () => {
      const result = await confluencesCommand.execute(['BTC-USDT'], { format: 'json' });
      expect(result.success).toBe(true);
    });
  });

  describe('Deterministic Results', () => {
    it('should produce same results for same input', async () => {
      const result1 = await confluencesCommand.execute(['BTC-USDT'], {
        format: 'json',
        noCache: true,
      });
      const result2 = await confluencesCommand.execute(['BTC-USDT'], {
        format: 'json',
        noCache: true,
      });

      expect(result1.output).toBe(result2.output);
    });

    it('should produce consistent metadata', async () => {
      const result1 = await confluencesCommand.execute(['BTC-USDT'], { noCache: true });
      const result2 = await confluencesCommand.execute(['BTC-USDT'], { noCache: true });

      expect(result1.metadata?.barsAnalyzed).toBe(result2.metadata?.barsAnalyzed);
      expect(result1.metadata?.confluenceScore).toBe(result2.metadata?.confluenceScore);
    });
  });
});
