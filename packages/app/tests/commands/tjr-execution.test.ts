/**
 * Tests for TJRExecutionCommand
 *
 * Tests execution recommendations including:
 * - Argument parsing (symbol)
 * - 5m confirmation check
 * - 1m entry trigger (optional)
 * - Price level calculations (entry, stop, TP)
 * - Position sizing
 * - Risk management
 * - All output formats (text, JSON, table, markdown)
 * - Cache integration
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TJRExecutionCommand } from '../../src/commands/tjr-execution.command.js';
import { FileConfigService } from '../../src/services/config/config.service.js';
import { createLogger } from '@tjr/logger';
import type { ProviderService } from '../../src/services/providers/types.js';
import type { CacheService } from '../../src/services/cache/types.js';
import { Timeframe } from '@tjr/contracts';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Load fixtures
const executionConfirmedFixture = JSON.parse(
  await fs.readFile(
    new URL('./fixtures/execution/btc-usdt-execution-confirmed.json', import.meta.url),
    'utf-8'
  )
);

const executionNoEntryFixture = JSON.parse(
  await fs.readFile(
    new URL('./fixtures/execution/btc-usdt-execution-no-entry.json', import.meta.url),
    'utf-8'
  )
);

describe('TJRExecutionCommand', () => {
  let configService: FileConfigService;
  let providerService: ProviderService;
  let cacheService: CacheService;
  let logger: any;
  let executionCommand: TJRExecutionCommand;
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

    // Mock provider service
    let fixtureMode = 'confirmed';
    providerService = {
      getBars: vi.fn(async ({ symbol, timeframe }) => {
        if (symbol === 'BTC-USDT') {
          if (timeframe === Timeframe.M5) {
            return fixtureMode === 'confirmed'
              ? executionConfirmedFixture.bars5m
              : executionNoEntryFixture.bars5m;
          } else if (timeframe === Timeframe.M1) {
            return fixtureMode === 'confirmed' ? executionConfirmedFixture.bars1m : [];
          }
        }
        return [];
      }),
      setFixtureMode: (mode: string) => {
        fixtureMode = mode;
      },
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

    executionCommand = new TJRExecutionCommand({
      providerService,
      configService,
      cacheService,
      logger: logger.child({ service: 'tjr-execution' }),
      userId: 'test-user',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Command Properties', () => {
    it('should have correct command name', () => {
      expect(executionCommand.name).toBe('tjr-execution');
    });

    it('should have description', () => {
      expect(executionCommand.description).toBeTruthy();
      expect(executionCommand.description).toContain('execution');
    });

    it('should have aliases', () => {
      expect(executionCommand.aliases).toContain('execution');
      expect(executionCommand.aliases).toContain('tjr-trade');
    });
  });

  describe('Argument Parsing - Symbol', () => {
    it('should parse symbol argument', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], {});
      expect(result.success).toBe(true);
      expect(result.metadata?.symbol).toBe('BTC-USDT');
    });

    it('should convert symbol to uppercase', async () => {
      const result = await executionCommand.execute(['btc-usdt'], {});
      expect(result.success).toBe(true);
      expect(result.metadata?.symbol).toBe('BTC-USDT');
    });

    it('should error on missing symbol', async () => {
      const result = await executionCommand.execute([], {});
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('symbol');
    });
  });

  describe('5m Confirmation Check', () => {
    it('should check 5m confirmation', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      expect(result.success).toBe(true);

      const output = JSON.parse(result.output);
      expect(output.confirmation).toBeDefined();
      expect(output.confirmation.confirmed).toBeTypeOf('boolean');
    });

    it('should confirm when confluence score meets threshold', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.confirmation.confirmed).toBe(true);
      expect(output.confirmation.confluenceScore).toBeGreaterThanOrEqual(70);
    });

    it('should not confirm when confluence score below threshold', async () => {
      (providerService as any).setFixtureMode('no-entry');

      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.confirmation.confirmed).toBe(false);
      expect(output.confirmation.reason).toContain('threshold');
    });

    it('should include confluence score in confirmation', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.confirmation.confluenceScore).toBeTypeOf('number');
    });

    it('should provide confirmation reason', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.confirmation.reason).toBeTypeOf('string');
      expect(output.confirmation.reason.length).toBeGreaterThan(0);
    });
  });

  describe('1m Entry Trigger', () => {
    it('should skip 1m check by default', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.entryTrigger).toBeUndefined();
    });

    it('should check 1m entry when include1m option set', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], {
        format: 'json',
        include1m: true,
      });
      const output = JSON.parse(result.output);

      expect(output.entryTrigger).toBeDefined();
      expect(output.entryTrigger.triggered).toBeTypeOf('boolean');
    });

    it('should trigger entry on valid 1m signal', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], {
        format: 'json',
        include1m: true,
      });
      const output = JSON.parse(result.output);

      if (output.confirmation.confirmed) {
        expect(output.entryTrigger.triggered).toBe(true);
        expect(output.entryTrigger.entryPrice).toBeTypeOf('number');
        expect(output.entryTrigger.direction).toMatch(/long|short/);
      }
    });

    it('should not trigger entry when no 1m signal', async () => {
      (providerService as any).setFixtureMode('no-entry');

      const result = await executionCommand.execute(['BTC-USDT'], {
        format: 'json',
        include1m: true,
      });
      const output = JSON.parse(result.output);

      if (!output.confirmation.confirmed) {
        expect(output.entryTrigger).toBeUndefined();
      }
    });

    it('should handle missing 1m data gracefully', async () => {
      providerService.getBars = vi.fn(async ({ timeframe }) => {
        if (timeframe === Timeframe.M5) {
          return executionConfirmedFixture.bars5m;
        }
        return []; // No 1m data
      });

      const result = await executionCommand.execute(['BTC-USDT'], {
        format: 'json',
        include1m: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Execution Parameters', () => {
    it('should provide execution params when confirmed', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      if (output.confirmation.confirmed) {
        expect(output.execution).toBeDefined();
        expect(output.execution.direction).toMatch(/long|short/);
        expect(output.execution.entryPrice).toBeTypeOf('number');
        expect(output.execution.stopLoss).toBeTypeOf('number');
        expect(output.execution.takeProfit).toBeTypeOf('number');
      }
    });

    it('should not provide execution params when not confirmed', async () => {
      (providerService as any).setFixtureMode('no-entry');

      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.execution).toBeNull();
    });

    it('should calculate entry price correctly', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      if (output.execution) {
        expect(output.execution.entryPrice).toBeGreaterThan(0);
      }
    });

    it('should calculate stop loss correctly', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      if (output.execution) {
        expect(output.execution.stopLoss).toBeGreaterThan(0);
        if (output.execution.direction === 'long') {
          expect(output.execution.stopLoss).toBeLessThan(output.execution.entryPrice);
        } else {
          expect(output.execution.stopLoss).toBeGreaterThan(output.execution.entryPrice);
        }
      }
    });

    it('should calculate take profit correctly', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      if (output.execution) {
        expect(output.execution.takeProfit).toBeGreaterThan(0);
        if (output.execution.direction === 'long') {
          expect(output.execution.takeProfit).toBeGreaterThan(output.execution.entryPrice);
        } else {
          expect(output.execution.takeProfit).toBeLessThan(output.execution.entryPrice);
        }
      }
    });

    it('should calculate position size', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      if (output.execution) {
        expect(output.execution.positionSize).toBeTypeOf('number');
        expect(output.execution.positionSize).toBeGreaterThan(0);
      }
    });
  });

  describe('Risk/Reward Calculations', () => {
    it('should calculate risk amount', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      if (output.execution) {
        expect(output.execution.riskAmount).toBeTypeOf('number');
        expect(output.execution.riskAmount).toBeGreaterThan(0);
      }
    });

    it('should calculate reward amount', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      if (output.execution) {
        expect(output.execution.rewardAmount).toBeTypeOf('number');
        expect(output.execution.rewardAmount).toBeGreaterThan(0);
      }
    });

    it('should calculate risk/reward ratio', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      if (output.execution) {
        expect(output.execution.riskRewardRatio).toBeTypeOf('number');
        expect(output.execution.riskRewardRatio).toBeGreaterThan(0);

        // Verify calculation
        const calculatedRR = output.execution.rewardAmount / output.execution.riskAmount;
        expect(Math.abs(output.execution.riskRewardRatio - calculatedRR)).toBeLessThan(0.01);
      }
    });

    it('should meet minimum risk/reward ratio', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      if (output.execution) {
        expect(output.execution.riskRewardRatio).toBeGreaterThanOrEqual(1.5);
      }
    });
  });

  describe('Risk Management', () => {
    it('should include risk management when configured', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      if (output.execution) {
        expect(output.riskManagement).toBeDefined();
      }
    });

    it('should calculate max risk per trade', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      if (output.riskManagement) {
        expect(output.riskManagement.maxRiskPerTrade).toBeTypeOf('number');
        expect(output.riskManagement.maxRiskPerTrade).toBeGreaterThan(0);
      }
    });

    it('should calculate max risk amount', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      if (output.riskManagement) {
        expect(output.riskManagement.maxRiskAmount).toBeTypeOf('number');
        expect(output.riskManagement.maxRiskAmount).toBeGreaterThan(0);
      }
    });

    it('should determine if can take new trade', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      if (output.riskManagement) {
        expect(output.riskManagement.canTakeNewTrade).toBeTypeOf('boolean');
      }
    });

    it('should provide partial exit levels', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      if (output.riskManagement?.partialExits) {
        expect(output.riskManagement.partialExits).toBeInstanceOf(Array);

        if (output.riskManagement.partialExits.length > 0) {
          const exit = output.riskManagement.partialExits[0];
          expect(exit.percentage).toBeTypeOf('number');
          expect(exit.price).toBeTypeOf('number');
          expect(exit.description).toBeTypeOf('string');
        }
      }
    });

    it('should override risk config from options', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], {
        format: 'json',
        risk: '{"perTrade":{"maxRiskPercent":2.0}}',
      });

      expect(result.success).toBe(true);
    });

    it('should error on invalid risk JSON', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], {
        risk: '{invalid json}',
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid risk configuration');
    });
  });

  describe('Confluence Factors', () => {
    it('should list active confluence factors', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      if (output.execution) {
        expect(output.execution.confluenceFactors).toBeInstanceOf(Array);
        expect(output.execution.confluenceFactors.length).toBeGreaterThan(0);
      }
    });

    it('should include relevant factor names', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      if (output.execution?.confluenceFactors) {
        for (const factor of output.execution.confluenceFactors) {
          expect(factor).toBeTypeOf('string');
          expect(factor.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Cache Integration', () => {
    it('should cache results when enabled', async () => {
      const result1 = await executionCommand.execute(['BTC-USDT'], {});
      expect(result1.metadata?.cacheHit).toBe(false);

      const result2 = await executionCommand.execute(['BTC-USDT'], {});
      expect(result2.metadata?.cacheHit).toBe(true);
    });

    it('should skip cache when disabled', async () => {
      await configService.set('test-user', 'cache.enabled', false);

      const result1 = await executionCommand.execute(['BTC-USDT'], {});
      const result2 = await executionCommand.execute(['BTC-USDT'], {});

      expect(result1.metadata?.cacheHit).toBe(false);
      expect(result2.metadata?.cacheHit).toBe(false);
    });

    it('should skip cache with --no-cache option', async () => {
      await executionCommand.execute(['BTC-USDT'], {});

      const result = await executionCommand.execute(['BTC-USDT'], { noCache: true });
      expect(result.metadata?.cacheHit).toBe(false);
    });

    it('should have different cache keys with/without 1m data', async () => {
      await executionCommand.execute(['BTC-USDT'], {});
      const result = await executionCommand.execute(['BTC-USDT'], { include1m: true });

      expect(result.metadata?.cacheHit).toBe(false);
    });
  });

  describe('Output Formats - Text', () => {
    it('should format as text by default', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], {});
      expect(typeof result.output).toBe('string');
      expect(result.output).toContain('TJR Execution Analysis');
    });

    it('should display symbol', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'text' });
      expect(result.output).toContain('BTC-USDT');
    });

    it('should display 5m confirmation status', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'text' });
      expect(result.output).toContain('5-Minute Confirmation');
      expect(result.output).toMatch(/CONFIRMED|NOT CONFIRMED/);
    });

    it('should display execution parameters when available', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'text' });

      if (result.output.includes('CONFIRMED')) {
        expect(result.output).toContain('Execution Parameters');
        expect(result.output).toContain('Entry Price');
        expect(result.output).toContain('Stop Loss');
        expect(result.output).toContain('Take Profit');
      }
    });

    it('should display risk/reward analysis', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'text' });

      if (result.output.includes('Execution Parameters')) {
        expect(result.output).toContain('Risk/Reward Analysis');
        expect(result.output).toContain('Risk Amount');
        expect(result.output).toContain('Reward Amount');
      }
    });
  });

  describe('Output Formats - JSON', () => {
    it('should format as valid JSON', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      expect(() => JSON.parse(result.output)).not.toThrow();
    });

    it('should include all required fields', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.symbol).toBe('BTC-USDT');
      expect(output.timestamp).toBeDefined();
      expect(output.confirmation).toBeDefined();
    });

    it('should be deterministic for same input', async () => {
      const result1 = await executionCommand.execute(['BTC-USDT'], {
        format: 'json',
        noCache: true,
      });
      const result2 = await executionCommand.execute(['BTC-USDT'], {
        format: 'json',
        noCache: true,
      });

      const output1 = JSON.parse(result1.output);
      const output2 = JSON.parse(result2.output);

      expect(output1.confirmation.confirmed).toBe(output2.confirmation.confirmed);
      if (output1.execution && output2.execution) {
        expect(output1.execution.entryPrice).toBe(output2.execution.entryPrice);
      }
    });
  });

  describe('Output Formats - Table', () => {
    it('should format as table with box drawing', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'table' });
      expect(result.output).toContain('┌');
      expect(result.output).toContain('│');
      expect(result.output).toContain('─');
    });

    it('should display summary table', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'table' });
      expect(result.output).toContain('Execution Analysis Summary');
      expect(result.output).toContain('Symbol');
      expect(result.output).toContain('5m Confirmed');
    });

    it('should display execution table when available', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'table' });

      if (result.output.includes('Yes')) {
        // Confirmed
        expect(result.output).toContain('Execution Parameter');
        expect(result.output).toContain('Value');
      }
    });
  });

  describe('Output Formats - Markdown', () => {
    it('should format as markdown', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'markdown' });
      expect(result.output).toContain('#');
      expect(result.output).toContain('##');
    });

    it('should use markdown headings', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'markdown' });
      expect(result.output).toContain('# TJR Execution Analysis');
      expect(result.output).toContain('## BTC-USDT');
    });

    it('should use markdown tables for execution params', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'markdown' });

      if (result.output.includes('✅ CONFIRMED')) {
        expect(result.output).toContain('| Parameter | Value |');
      }
    });

    it('should use status indicators', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'markdown' });
      expect(result.output).toMatch(/✅|❌/);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing 5m data', async () => {
      providerService.getBars = vi.fn(async () => []);

      const result = await executionCommand.execute(['BTC-USDT'], {});
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('No 5-minute market data');
    });

    it('should handle provider errors', async () => {
      providerService.getBars = vi.fn(async () => {
        throw new Error('Provider connection failed');
      });

      const result = await executionCommand.execute(['BTC-USDT'], {});
      expect(result.success).toBe(false);
    });

    it('should measure execution duration', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], {});
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Execution Scenarios', () => {
    it('should handle confirmed setup with entry', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.confirmation.confirmed).toBe(true);
      expect(output.execution).toBeDefined();
    });

    it('should handle not confirmed scenario', async () => {
      (providerService as any).setFixtureMode('no-entry');

      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.confirmation.confirmed).toBe(false);
      expect(output.execution).toBeNull();
    });

    it('should provide clear reason for no entry', async () => {
      (providerService as any).setFixtureMode('no-entry');

      const result = await executionCommand.execute(['BTC-USDT'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.confirmation.reason).toBeTruthy();
      expect(output.confirmation.reason.length).toBeGreaterThan(0);
    });
  });

  describe('Metadata', () => {
    it('should include bars analyzed metadata', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], {});

      expect(result.metadata?.bars5mAnalyzed).toBeTypeOf('number');
      expect(result.metadata?.bars5mAnalyzed).toBeGreaterThan(0);
    });

    it('should include 1m bars metadata when requested', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], { include1m: true });

      if (result.metadata?.bars1mAnalyzed) {
        expect(result.metadata.bars1mAnalyzed).toBeTypeOf('number');
      }
    });

    it('should indicate execution availability', async () => {
      const result = await executionCommand.execute(['BTC-USDT'], {});

      expect(result.metadata?.hasExecution).toBeTypeOf('boolean');
    });
  });

  describe('Deterministic Results', () => {
    it('should produce same results for same input', async () => {
      const result1 = await executionCommand.execute(['BTC-USDT'], {
        format: 'json',
        noCache: true,
      });
      const result2 = await executionCommand.execute(['BTC-USDT'], {
        format: 'json',
        noCache: true,
      });

      const output1 = JSON.parse(result1.output);
      const output2 = JSON.parse(result2.output);

      expect(output1.confirmation.confirmed).toBe(output2.confirmation.confirmed);
      expect(output1.confirmation.confluenceScore).toBe(output2.confirmation.confluenceScore);
    });
  });
});
