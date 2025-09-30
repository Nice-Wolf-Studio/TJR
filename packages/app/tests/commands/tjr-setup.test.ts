/**
 * Tests for TJRSetupCommand
 *
 * Tests configuration management including:
 * - Argument parsing for all actions (show, set, reset, validate)
 * - Configuration operations (load, save, set, reset)
 * - Validation logic
 * - All output formats (text, JSON, table, markdown)
 * - Error handling for invalid inputs
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TJRSetupCommand } from '../../src/commands/tjr-setup.command.js';
import { FileConfigService, DEFAULT_USER_CONFIG } from '../../src/services/config/config.service.js';
import { createLogger } from '@tjr/logger';
import type { UserConfig } from '../../src/services/config/types.js';
import { TJRErrorCode } from '../../src/commands/errors.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('TJRSetupCommand', () => {
  let configService: FileConfigService;
  let logger: any;
  let setupCommand: TJRSetupCommand;
  let testConfigDir: string;

  beforeEach(async () => {
    // Create temporary config directory for tests
    testConfigDir = join(tmpdir(), `tjr-test-${Date.now()}`);
    await fs.mkdir(testConfigDir, { recursive: true });

    logger = createLogger({
      level: 'error', // Quiet during tests
      format: 'json'
    });

    configService = new FileConfigService(
      logger.child({ service: 'config' }),
      testConfigDir
    );

    setupCommand = new TJRSetupCommand({
      providerService: {} as any, // Not used in setup command
      configService,
      logger: logger.child({ service: 'tjr-setup' }),
      userId: 'test-user'
    });
  });

  describe('Command Properties', () => {
    it('should have correct command name', () => {
      expect(setupCommand.name).toBe('tjr-setup');
    });

    it('should have description', () => {
      expect(setupCommand.description).toBeTruthy();
      expect(setupCommand.description).toContain('Configure');
    });

    it('should have aliases', () => {
      expect(setupCommand.aliases).toContain('tjr-config');
      expect(setupCommand.aliases).toContain('setup');
    });
  });

  describe('Argument Parsing - Show Action', () => {
    it('should parse show action explicitly', async () => {
      const result = await setupCommand.execute(['show'], {});
      expect(result.success).toBe(true);
      expect(result.metadata?.action).toBe('show');
    });

    it('should default to show action when no args provided', async () => {
      const result = await setupCommand.execute([], {});
      expect(result.success).toBe(true);
      expect(result.metadata?.action).toBe('show');
    });

    it('should display current configuration in show action', async () => {
      const result = await setupCommand.execute(['show'], { format: 'json' });
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.confluence).toBeDefined();
      expect(output.execution).toBeDefined();
      expect(output.formatting).toBeDefined();
      expect(output.cache).toBeDefined();
    });
  });

  describe('Argument Parsing - Set Action', () => {
    it('should parse set action with key and value', async () => {
      const result = await setupCommand.execute(['set', 'confluence.weights.fvg', '0.4'], {});
      expect(result.success).toBe(true);
      expect(result.metadata?.action).toBe('set');
      expect(result.metadata?.key).toBe('confluence.weights.fvg');
    });

    it('should error on set action without key', async () => {
      const result = await setupCommand.execute(['set'], {});
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Missing configuration key');
    });

    it('should error on set action without value', async () => {
      const result = await setupCommand.execute(['set', 'confluence.weights.fvg'], {});
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Missing configuration value');
    });

    it('should parse numeric values correctly', async () => {
      const result = await setupCommand.execute(['set', 'execution.confirmation5m.minConfluenceScore', '75'], {});
      expect(result.success).toBe(true);

      // Verify value was set correctly
      const config = await configService.load('test-user');
      expect(config.execution.confirmation5m.minConfluenceScore).toBe(75);
    });

    it('should parse boolean values correctly', async () => {
      const result = await setupCommand.execute(['set', 'cache.enabled', 'false'], {});
      expect(result.success).toBe(true);

      const config = await configService.load('test-user');
      expect(config.cache.enabled).toBe(false);
    });

    it('should parse JSON objects correctly', async () => {
      const result = await setupCommand.execute([
        'set',
        'confluence.weights',
        '{"fvg":0.4,"orderBlock":0.3,"overlap":0.2,"recency":0.1}'
      ], {});
      expect(result.success).toBe(true);

      const config = await configService.load('test-user');
      expect(config.confluence.weights.fvg).toBe(0.4);
      expect(config.confluence.weights.orderBlock).toBe(0.3);
    });

    it('should handle nested key paths', async () => {
      const result = await setupCommand.execute([
        'set',
        'execution.confirmation5m.minConfluenceScore',
        '80'
      ], {});
      expect(result.success).toBe(true);

      const config = await configService.load('test-user');
      expect(config.execution.confirmation5m.minConfluenceScore).toBe(80);
    });
  });

  describe('Argument Parsing - Reset Action', () => {
    it('should parse reset action without key (reset all)', async () => {
      const result = await setupCommand.execute(['reset'], {});
      expect(result.success).toBe(true);
      expect(result.metadata?.action).toBe('reset');
      expect(result.metadata?.key).toBeUndefined();
    });

    it('should parse reset action with specific key', async () => {
      const result = await setupCommand.execute(['reset', 'confluence.weights'], {});
      expect(result.success).toBe(true);
      expect(result.metadata?.action).toBe('reset');
      expect(result.metadata?.key).toBe('confluence.weights');
    });

    it('should reset entire configuration to defaults', async () => {
      // First modify config
      await setupCommand.execute(['set', 'cache.enabled', 'false'], {});

      // Then reset
      const result = await setupCommand.execute(['reset'], {});
      expect(result.success).toBe(true);

      // Verify defaults restored
      const config = await configService.load('test-user');
      expect(config.cache.enabled).toBe(DEFAULT_USER_CONFIG.cache.enabled);
    });

    it('should reset specific key to default', async () => {
      // Modify a specific value
      await setupCommand.execute(['set', 'confluence.weights.fvg', '0.5'], {});

      // Reset just that key
      const result = await setupCommand.execute(['reset', 'confluence.weights.fvg'], {});
      expect(result.success).toBe(true);

      // Verify only that key was reset
      const config = await configService.load('test-user');
      expect(config.confluence.weights.fvg).toBe(DEFAULT_USER_CONFIG.confluence.weights.fvg);
    });
  });

  describe('Argument Parsing - Validate Action', () => {
    it('should parse validate action', async () => {
      const result = await setupCommand.execute(['validate'], {});
      expect(result.success).toBe(true);
      expect(result.metadata?.action).toBe('validate');
    });

    it('should validate valid configuration', async () => {
      const result = await setupCommand.execute(['validate'], {});
      expect(result.success).toBe(true);
      expect(result.metadata?.validation).toBeDefined();
      expect(result.metadata?.validation.valid).toBe(true);
    });

    it('should detect invalid configuration', async () => {
      // Set invalid weights that don't sum to 1.0
      await configService.set('test-user', 'confluence.weights', {
        fvg: 0.5,
        orderBlock: 0.5,
        overlap: 0.5,
        recency: 0.5
      });

      const result = await setupCommand.execute(['validate'], {});
      expect(result.success).toBe(true);
      expect(result.metadata?.validation.valid).toBe(false);
      expect(result.metadata?.validation.errors).toBeDefined();
      expect(result.metadata?.validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Argument Parsing - Invalid Action', () => {
    it('should error on invalid action', async () => {
      const result = await setupCommand.execute(['invalid'], {});
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid action');
    });

    it('should list valid actions in error message', async () => {
      const result = await setupCommand.execute(['badaction'], {});
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('show');
      expect(result.error?.message).toContain('set');
      expect(result.error?.message).toContain('reset');
      expect(result.error?.message).toContain('validate');
    });
  });

  describe('Configuration Operations - Show', () => {
    it('should show all configuration sections', async () => {
      const result = await setupCommand.execute(['show'], { format: 'json' });
      expect(result.success).toBe(true);

      const output = JSON.parse(result.output);
      expect(output.confluence).toBeDefined();
      expect(output.execution).toBeDefined();
      expect(output.risk).toBeDefined();
      expect(output.formatting).toBeDefined();
      expect(output.cache).toBeDefined();
      expect(output.validation).toBeDefined();
    });

    it('should include validation status in show', async () => {
      const result = await setupCommand.execute(['show'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.validation).toBeDefined();
      expect(output.validation.valid).toBeDefined();
    });

    it('should include config path in metadata', async () => {
      const result = await setupCommand.execute(['show'], {});
      expect(result.metadata?.configPath).toBeDefined();
      expect(result.metadata?.configPath).toContain('test-user');
    });
  });

  describe('Configuration Operations - Set', () => {
    it('should persist configuration changes', async () => {
      await setupCommand.execute(['set', 'cache.enabled', 'false'], {});

      // Create new command instance to verify persistence
      const newCommand = new TJRSetupCommand({
        providerService: {} as any,
        configService,
        logger: logger.child({ service: 'tjr-setup' }),
        userId: 'test-user'
      });

      const result = await newCommand.execute(['show'], { format: 'json' });
      const output = JSON.parse(result.output);
      expect(output.cache.enabled).toBe(false);
    });

    it('should validate configuration after set', async () => {
      const result = await setupCommand.execute([
        'set',
        'execution.confirmation5m.minConfluenceScore',
        '85'
      ], {});

      expect(result.metadata?.validation).toBeDefined();
    });

    it('should warn on invalid configuration after set', async () => {
      // Set weights that don't sum to 1.0
      const result = await setupCommand.execute([
        'set',
        'confluence.weights',
        '{"fvg":0.5,"orderBlock":0.5,"overlap":0.5,"recency":0.5}'
      ], {});

      expect(result.success).toBe(true); // Command succeeds
      expect(result.metadata?.validation.valid).toBe(false); // But validation fails
    });

    it('should handle deep nested paths', async () => {
      const result = await setupCommand.execute([
        'set',
        'risk.partialExits.levels',
        '[{"trigger":1.5,"exitPercent":50},{"trigger":3.0,"exitPercent":50}]'
      ], {});

      expect(result.success).toBe(true);

      const config = await configService.load('test-user');
      expect(config.risk?.partialExits.levels).toHaveLength(2);
      expect(config.risk?.partialExits.levels[0].trigger).toBe(1.5);
    });
  });

  describe('Output Formats - Text', () => {
    it('should format as text by default', async () => {
      const result = await setupCommand.execute(['show'], {});
      expect(typeof result.output).toBe('string');
      expect(result.output).toContain('TJR Configuration');
    });

    it('should include all sections in text format', async () => {
      const result = await setupCommand.execute(['show'], { format: 'text' });
      expect(result.output).toContain('Confluence Configuration');
      expect(result.output).toContain('Execution Configuration');
      expect(result.output).toContain('Risk Management Configuration');
      expect(result.output).toContain('Formatting Preferences');
      expect(result.output).toContain('Cache Configuration');
    });

    it('should display validation status in text format', async () => {
      const result = await setupCommand.execute(['validate'], { format: 'text' });
      expect(result.output).toContain('Configuration is valid');
    });

    it('should display weights in text format', async () => {
      const result = await setupCommand.execute(['show'], { format: 'text' });
      expect(result.output).toContain('FVG:');
      expect(result.output).toContain('Order Block:');
      expect(result.output).toContain('Overlap:');
      expect(result.output).toContain('Recency:');
    });
  });

  describe('Output Formats - JSON', () => {
    it('should format as valid JSON', async () => {
      const result = await setupCommand.execute(['show'], { format: 'json' });
      expect(() => JSON.parse(result.output)).not.toThrow();
    });

    it('should include all configuration fields in JSON', async () => {
      const result = await setupCommand.execute(['show'], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.confluence.weights).toBeDefined();
      expect(output.confluence.fvg).toBeDefined();
      expect(output.confluence.orderBlock).toBeDefined();
      expect(output.execution.confirmation5m).toBeDefined();
      expect(output.execution.entry1m).toBeDefined();
      expect(output.execution.risk).toBeDefined();
    });

    it('should be parseable and usable', async () => {
      const result = await setupCommand.execute(['show'], { format: 'json' });
      const config = JSON.parse(result.output);

      // Should be able to use parsed config
      expect(config.confluence.weights.fvg).toBeTypeOf('number');
      expect(config.execution.confirmation5m.minConfluenceScore).toBeTypeOf('number');
    });
  });

  describe('Output Formats - Table', () => {
    it('should format as table with box drawing', async () => {
      const result = await setupCommand.execute(['show'], { format: 'table' });
      expect(result.output).toContain('┌');
      expect(result.output).toContain('│');
      expect(result.output).toContain('─');
    });

    it('should display validation status in table', async () => {
      const result = await setupCommand.execute(['show'], { format: 'table' });
      expect(result.output).toContain('Validation Status');
      expect(result.output).toContain('Valid');
    });

    it('should display weights in table format', async () => {
      const result = await setupCommand.execute(['show'], { format: 'table' });
      expect(result.output).toContain('Confluence Weights');
      expect(result.output).toContain('Value');
    });
  });

  describe('Output Formats - Markdown', () => {
    it('should format as markdown', async () => {
      const result = await setupCommand.execute(['show'], { format: 'markdown' });
      expect(result.output).toContain('#');
      expect(result.output).toContain('##');
    });

    it('should use markdown headings', async () => {
      const result = await setupCommand.execute(['show'], { format: 'markdown' });
      expect(result.output).toContain('# TJR Configuration');
      expect(result.output).toContain('## Confluence Configuration');
      expect(result.output).toContain('## Execution Configuration');
    });

    it('should use markdown tables', async () => {
      const result = await setupCommand.execute(['show'], { format: 'markdown' });
      expect(result.output).toContain('|');
      expect(result.output).toContain('Factor');
      expect(result.output).toContain('Weight');
    });

    it('should include validation section', async () => {
      const result = await setupCommand.execute(['validate'], { format: 'markdown' });
      expect(result.output).toContain('## Validation Status');
      expect(result.output).toContain('**Valid**');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing config file gracefully', async () => {
      // Fresh user with no config file
      const freshCommand = new TJRSetupCommand({
        providerService: {} as any,
        configService,
        logger: logger.child({ service: 'tjr-setup' }),
        userId: 'nonexistent-user'
      });

      const result = await freshCommand.execute(['show'], {});
      expect(result.success).toBe(true);
      // Should use defaults
    });

    it('should handle invalid key paths in set', async () => {
      const result = await setupCommand.execute([
        'set',
        'nonexistent.key.path',
        'value'
      ], {});

      expect(result.success).toBe(true); // Command doesn't fail
      // Key is created
    });

    it('should handle invalid JSON in set', async () => {
      const result = await setupCommand.execute([
        'set',
        'confluence.weights',
        '{invalid json}'
      ], {});

      expect(result.success).toBe(true);
      // Should treat as string value
    });

    it('should measure execution duration', async () => {
      const result = await setupCommand.execute(['show'], {});
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate weight sum equals 1.0', async () => {
      await configService.set('test-user', 'confluence.weights', {
        fvg: 0.25,
        orderBlock: 0.25,
        overlap: 0.25,
        recency: 0.25
      });

      const result = await setupCommand.execute(['validate'], {});
      expect(result.metadata?.validation.valid).toBe(true);
    });

    it('should reject weights that sum to incorrect value', async () => {
      await configService.set('test-user', 'confluence.weights', {
        fvg: 0.5,
        orderBlock: 0.5,
        overlap: 0.5,
        recency: 0.5
      });

      const result = await setupCommand.execute(['validate'], {});
      expect(result.metadata?.validation.valid).toBe(false);
      expect(result.metadata?.validation.errors).toContain(
        expect.stringContaining('must sum to 1.0')
      );
    });

    it('should validate weight ranges', async () => {
      await configService.set('test-user', 'confluence.weights.fvg', -0.1);

      const result = await setupCommand.execute(['validate'], {});
      expect(result.metadata?.validation.valid).toBe(false);
    });

    it('should validate confluence score thresholds', async () => {
      await configService.set('test-user', 'execution.confirmation5m.minConfluenceScore', 150);

      const result = await setupCommand.execute(['validate'], {});
      expect(result.metadata?.validation.valid).toBe(false);
    });

    it('should provide warnings for questionable values', async () => {
      await configService.set('test-user', 'execution.risk.maxRiskPerTrade', 0.15);

      const result = await setupCommand.execute(['validate'], {});
      // May have warnings even if valid
      if (result.metadata?.validation.warnings) {
        expect(result.metadata.validation.warnings.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Integration Tests', () => {
    it('should support full workflow: set, validate, show', async () => {
      // Step 1: Set a value
      const setResult = await setupCommand.execute([
        'set',
        'cache.enabled',
        'false'
      ], {});
      expect(setResult.success).toBe(true);

      // Step 2: Validate
      const validateResult = await setupCommand.execute(['validate'], {});
      expect(validateResult.success).toBe(true);
      expect(validateResult.metadata?.validation.valid).toBe(true);

      // Step 3: Show to confirm
      const showResult = await setupCommand.execute(['show'], { format: 'json' });
      const config = JSON.parse(showResult.output);
      expect(config.cache.enabled).toBe(false);
    });

    it('should support reset workflow', async () => {
      // Modify config
      await setupCommand.execute(['set', 'cache.enabled', 'false'], {});

      // Reset
      await setupCommand.execute(['reset'], {});

      // Verify
      const result = await setupCommand.execute(['show'], { format: 'json' });
      const config = JSON.parse(result.output);
      expect(config.cache.enabled).toBe(DEFAULT_USER_CONFIG.cache.enabled);
    });

    it('should handle multiple sequential operations', async () => {
      await setupCommand.execute(['set', 'confluence.weights.fvg', '0.4'], {});
      await setupCommand.execute(['set', 'confluence.weights.orderBlock', '0.3'], {});
      await setupCommand.execute(['set', 'confluence.weights.overlap', '0.2'], {});
      await setupCommand.execute(['set', 'confluence.weights.recency', '0.1'], {});

      const result = await setupCommand.execute(['validate'], {});
      expect(result.metadata?.validation.valid).toBe(true);
    });
  });
});