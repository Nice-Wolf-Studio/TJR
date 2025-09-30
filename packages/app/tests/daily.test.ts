/**
 * Tests for Daily Command
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DailyCommand } from '../src/commands/daily.command.js';
import { FixtureProvider } from '../src/services/providers/fixture-provider.js';
import { createLogger } from '@tjr/logger';
import type { MarketBar } from '@tjr/contracts';

describe('DailyCommand', () => {
  let providerService: FixtureProvider;
  let logger: any;
  let dailyCommand: DailyCommand;

  beforeEach(() => {
    logger = createLogger({
      level: 'error', // Quiet during tests
      format: 'json'
    });

    providerService = new FixtureProvider({
      logger: logger.child({ service: 'provider' }),
      simulateLatency: false
    });

    dailyCommand = new DailyCommand({
      providerService,
      logger: logger.child({ service: 'daily-command' })
    });
  });

  describe('Basic Execution', () => {
    it('should execute successfully', async () => {
      await providerService.initialize();

      const result = await dailyCommand.execute(['SPY'], { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
    });

    it('should have correct command properties', () => {
      expect(dailyCommand.name).toBe('daily');
      expect(dailyCommand.description).toBeTruthy();
      expect(dailyCommand.aliases).toContain('analyze');
    });

    it('should return metadata', async () => {
      await providerService.initialize();

      const result = await dailyCommand.execute(['SPY'], { dryRun: true });

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.symbol).toBe('SPY');
      expect(result.metadata?.barsAnalyzed).toBeGreaterThan(0);
    });

    it('should measure execution duration', async () => {
      await providerService.initialize();

      const result = await dailyCommand.execute(['SPY'], { dryRun: true });

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Symbol Handling', () => {
    beforeEach(async () => {
      await providerService.initialize();
    });

    it('should use SPY as default symbol', async () => {
      const result = await dailyCommand.execute([], { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.metadata?.symbol).toBe('SPY');
    });

    it('should accept custom symbol', async () => {
      const result = await dailyCommand.execute(['QQQ'], { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.metadata?.symbol).toBe('QQQ');
    });

    it('should handle multiple supported symbols', async () => {
      const symbols = ['SPY', 'QQQ', 'IWM'];

      for (const symbol of symbols) {
        const result = await dailyCommand.execute([symbol], { dryRun: true });
        expect(result.success).toBe(true);
        expect(result.metadata?.symbol).toBe(symbol);
      }
    });
  });

  describe('Date Handling', () => {
    beforeEach(async () => {
      await providerService.initialize();
    });

    it('should use current date by default', async () => {
      const result = await dailyCommand.execute(['SPY'], { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.metadata?.date).toBeDefined();
    });

    it('should accept custom date', async () => {
      const testDate = '2025-09-29';
      const result = await dailyCommand.execute(['SPY', testDate], { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.metadata?.date).toContain('2025-09-29');
    });

    it('should handle various date formats', async () => {
      const dates = ['2025-09-29', '2025-09-28'];

      for (const date of dates) {
        const result = await dailyCommand.execute(['SPY', date], { dryRun: true });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Analysis Results', () => {
    beforeEach(async () => {
      await providerService.initialize();
    });

    it('should include bias analysis', async () => {
      const result = await dailyCommand.execute(['SPY'], {
        dryRun: true,
        format: 'json'
      });

      const output = JSON.parse(result.output);
      expect(output.analysis.bias).toBeDefined();
      expect(output.analysis.bias.direction).toBeDefined();
    });

    it('should include profile classification', async () => {
      const result = await dailyCommand.execute(['SPY'], {
        dryRun: true,
        format: 'json'
      });

      const output = JSON.parse(result.output);
      expect(output.analysis.profile).toBeDefined();
      expect(output.analysis.profile.type).toBeDefined();
    });

    it('should include session analysis', async () => {
      const result = await dailyCommand.execute(['SPY'], {
        dryRun: true,
        format: 'json'
      });

      const output = JSON.parse(result.output);
      expect(output.analysis.sessions).toBeDefined();
      expect(Array.isArray(output.analysis.sessions)).toBe(true);
    });

    it('should include statistics', async () => {
      const result = await dailyCommand.execute(['SPY'], {
        dryRun: true,
        format: 'json'
      });

      const output = JSON.parse(result.output);
      expect(output.statistics).toBeDefined();
      expect(output.statistics.barsAnalyzed).toBeGreaterThan(0);
      expect(output.statistics.range).toBeDefined();
    });
  });

  describe('Output Formatting', () => {
    beforeEach(async () => {
      await providerService.initialize();
    });

    it('should format as JSON', async () => {
      const result = await dailyCommand.execute(['SPY'], {
        dryRun: true,
        format: 'json'
      });

      expect(() => JSON.parse(result.output)).not.toThrow();
      const output = JSON.parse(result.output);
      expect(output.symbol).toBe('SPY');
      expect(output.analysis).toBeDefined();
    });

    it('should format as text', async () => {
      const result = await dailyCommand.execute(['SPY'], {
        dryRun: true,
        format: 'text'
      });

      expect(typeof result.output).toBe('string');
      expect(result.output).toContain('Daily Analysis');
      expect(result.output).toContain('Market Bias');
      expect(result.output).toContain('Day Profile');
    });

    it('should format as table', async () => {
      const result = await dailyCommand.execute(['SPY'], {
        dryRun: true,
        format: 'table'
      });

      expect(typeof result.output).toBe('string');
      expect(result.output).toContain('┌');
      expect(result.output).toContain('Symbol');
      expect(result.output).toContain('SPY');
    });

    it('should include all sections in text format', async () => {
      const result = await dailyCommand.execute(['SPY'], {
        dryRun: true,
        format: 'text'
      });

      expect(result.output).toContain('Market Bias');
      expect(result.output).toContain('Day Profile');
      expect(result.output).toContain('Session Extremes');
      expect(result.output).toContain('Statistics');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await providerService.initialize();
    });

    it('should handle no data gracefully', async () => {
      // Create a provider that returns no data
      const emptyProvider = new FixtureProvider({
        logger: logger.child({ service: 'provider' }),
        simulateLatency: false
      });

      emptyProvider.getBars = async () => [];

      const emptyCommand = new DailyCommand({
        providerService: emptyProvider,
        logger: logger.child({ service: 'daily-command' })
      });

      const result = await emptyCommand.execute(['SPY'], { dryRun: true });

      expect(result.success).toBe(false);
      expect(result.output).toContain('No data available');
    });

    it('should handle provider errors', async () => {
      const errorProvider = new FixtureProvider({
        logger: logger.child({ service: 'provider' }),
        simulateLatency: false
      });

      errorProvider.getBars = async () => {
        throw new Error('Provider error');
      };

      const errorCommand = new DailyCommand({
        providerService: errorProvider,
        logger: logger.child({ service: 'daily-command' })
      });

      const result = await errorCommand.execute(['SPY'], { dryRun: true });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Dry Run Mode', () => {
    beforeEach(async () => {
      await providerService.initialize();
    });

    it('should use fixtures in dry run mode', async () => {
      const result = await dailyCommand.execute(['SPY'], { dryRun: true });

      expect(result.success).toBe(true);
      // In dry run, we should get consistent fixture data
      expect(result.metadata?.barsAnalyzed).toBeGreaterThan(0);
    });

    it('should provide deterministic results', async () => {
      const result1 = await dailyCommand.execute(['SPY', '2025-09-29'], {
        dryRun: true,
        format: 'json'
      });
      const result2 = await dailyCommand.execute(['SPY', '2025-09-29'], {
        dryRun: true,
        format: 'json'
      });

      const output1 = JSON.parse(result1.output);
      const output2 = JSON.parse(result2.output);

      // Same date should give same number of bars
      expect(output1.statistics.barsAnalyzed).toBe(output2.statistics.barsAnalyzed);
    });
  });

  describe('Integration with analysis-kit', () => {
    beforeEach(async () => {
      await providerService.initialize();
    });

    it('should call bias calculation', async () => {
      const result = await dailyCommand.execute(['SPY'], {
        dryRun: true,
        format: 'json'
      });

      const output = JSON.parse(result.output);
      expect(output.analysis.bias.direction).toBeDefined();
      const direction = output.analysis.bias.direction.toUpperCase();
      expect(['BULLISH', 'BEARISH', 'NEUTRAL']).toContain(direction);
    });

    it('should call profile classification', async () => {
      const result = await dailyCommand.execute(['SPY'], {
        dryRun: true,
        format: 'json'
      });

      const output = JSON.parse(result.output);
      expect(output.analysis.profile.type).toBeDefined();
    });

    it('should call session analysis', async () => {
      const result = await dailyCommand.execute(['SPY'], {
        dryRun: true,
        format: 'json'
      });

      const output = JSON.parse(result.output);
      expect(output.analysis.sessions).toBeDefined();
      expect(output.analysis.sessions.length).toBeGreaterThan(0);
    });
  });
});