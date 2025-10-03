/**
 * Tests for TJR Formatters
 *
 * Tests all three formatters:
 * - SetupFormatter
 * - ConfluenceFormatter
 * - ExecutionFormatter
 *
 * Each formatter is tested for:
 * - Text format output
 * - JSON format output
 * - Table format output
 * - Markdown format output
 * - Validation method
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SetupFormatter } from '../../src/formatters/setup-formatter.js';
import { ConfluenceFormatter } from '../../src/formatters/confluence-formatter.js';
import { ExecutionFormatter } from '../../src/formatters/execution-formatter.js';
import type { SetupReport, ConfluenceReport, ExecutionReport } from '../../src/reports/types.js';
import { promises as fs } from 'fs';

// Load config fixtures
const defaultConfig = JSON.parse(
  await fs.readFile(new URL('./fixtures/configs/default-config.json', import.meta.url), 'utf-8')
);

const customConfig = JSON.parse(
  await fs.readFile(new URL('./fixtures/configs/custom-config.json', import.meta.url), 'utf-8')
);

// Load confluence fixture
const btcConfluenceFixture = JSON.parse(
  await fs.readFile(
    new URL('./fixtures/confluences/btc-usdt-5m-confluence.json', import.meta.url),
    'utf-8'
  )
);

// Load execution fixture
const executionConfirmedFixture = JSON.parse(
  await fs.readFile(
    new URL('./fixtures/execution/btc-usdt-execution-confirmed.json', import.meta.url),
    'utf-8'
  )
);

describe('SetupFormatter', () => {
  let formatter: SetupFormatter;
  let sampleReport: SetupReport;

  beforeEach(() => {
    formatter = new SetupFormatter();

    sampleReport = {
      confluence: defaultConfig.confluence,
      execution: defaultConfig.execution,
      risk: defaultConfig.risk,
      formatting: defaultConfig.formatting,
      cache: defaultConfig.cache,
      validation: {
        valid: true,
      },
      timestamp: '2025-09-30T10:00:00Z',
      metadata: {
        configPath: '/tmp/test-user.json',
      },
    };
  });

  describe('Validation', () => {
    it('should validate complete report', () => {
      const result = formatter.validate(sampleReport);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should detect missing sections', () => {
      const invalidReport = { ...sampleReport, execution: undefined } as any;
      const result = formatter.validate(invalidReport);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should detect missing validation status', () => {
      const invalidReport = { ...sampleReport, validation: undefined } as any;
      const result = formatter.validate(invalidReport);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing validation status');
    });
  });

  describe('Text Format', () => {
    it('should format as text', () => {
      const output = formatter.format(sampleReport, 'text');
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });

    it('should include header', () => {
      const output = formatter.format(sampleReport, 'text');
      expect(output).toContain('TJR Configuration');
      expect(output).toContain('='.repeat(50));
    });

    it('should include validation status', () => {
      const output = formatter.format(sampleReport, 'text');
      expect(output).toContain('Validation Status');
      expect(output).toContain('Valid: Yes');
    });

    it('should display confluence weights', () => {
      const output = formatter.format(sampleReport, 'text');
      expect(output).toContain('Confluence Configuration');
      expect(output).toContain('Weights:');
      expect(output).toContain('FVG:');
      expect(output).toContain('Order Block:');
    });

    it('should display execution configuration', () => {
      const output = formatter.format(sampleReport, 'text');
      expect(output).toContain('Execution Configuration');
      expect(output).toContain('5m Confirmation');
      expect(output).toContain('1m Entry');
    });

    it('should display risk configuration', () => {
      const output = formatter.format(sampleReport, 'text');
      expect(output).toContain('Risk Management Configuration');
      expect(output).toContain('Account Size');
    });

    it('should display formatting preferences', () => {
      const output = formatter.format(sampleReport, 'text');
      expect(output).toContain('Formatting Preferences');
      expect(output).toContain('Default Format');
    });

    it('should display cache configuration', () => {
      const output = formatter.format(sampleReport, 'text');
      expect(output).toContain('Cache Configuration');
      expect(output).toContain('Enabled');
    });

    it('should display validation errors when present', () => {
      const invalidReport = {
        ...sampleReport,
        validation: {
          valid: false,
          errors: ['Weight sum incorrect'],
        },
      };

      const output = formatter.format(invalidReport, 'text');
      expect(output).toContain('Valid: No');
      expect(output).toContain('Errors:');
      expect(output).toContain('Weight sum incorrect');
    });
  });

  describe('JSON Format', () => {
    it('should format as valid JSON', () => {
      const output = formatter.format(sampleReport, 'json');
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('should preserve all data', () => {
      const output = formatter.format(sampleReport, 'json');
      const parsed = JSON.parse(output);

      expect(parsed.confluence).toBeDefined();
      expect(parsed.execution).toBeDefined();
      expect(parsed.risk).toBeDefined();
      expect(parsed.formatting).toBeDefined();
      expect(parsed.cache).toBeDefined();
      expect(parsed.validation).toBeDefined();
    });

    it('should be pretty-printed', () => {
      const output = formatter.format(sampleReport, 'json');
      expect(output).toContain('\n');
      expect(output).toContain('  '); // Indentation
    });
  });

  describe('Table Format', () => {
    it('should format as table with box drawing', () => {
      const output = formatter.format(sampleReport, 'table');
      expect(output).toContain('┌');
      expect(output).toContain('│');
      expect(output).toContain('─');
      expect(output).toContain('┘');
    });

    it('should include validation status table', () => {
      const output = formatter.format(sampleReport, 'table');
      expect(output).toContain('Validation Status');
      expect(output).toContain('Valid');
    });

    it('should include weights table', () => {
      const output = formatter.format(sampleReport, 'table');
      expect(output).toContain('Confluence Weights');
      expect(output).toContain('Value');
    });

    it('should include execution thresholds table', () => {
      const output = formatter.format(sampleReport, 'table');
      expect(output).toContain('Execution Thresholds');
    });

    it('should include risk parameters table', () => {
      const output = formatter.format(sampleReport, 'table');
      expect(output).toContain('Risk Parameters');
    });
  });

  describe('Markdown Format', () => {
    it('should format as markdown', () => {
      const output = formatter.format(sampleReport, 'markdown');
      expect(output).toContain('#');
      expect(output).toContain('##');
    });

    it('should use markdown headings', () => {
      const output = formatter.format(sampleReport, 'markdown');
      expect(output).toContain('# TJR Configuration');
      expect(output).toContain('## Confluence Configuration');
      expect(output).toContain('## Execution Configuration');
    });

    it('should use markdown tables', () => {
      const output = formatter.format(sampleReport, 'markdown');
      expect(output).toContain('|');
      expect(output).toContain('Factor');
      expect(output).toContain('Weight');
    });

    it('should use markdown lists', () => {
      const output = formatter.format(sampleReport, 'markdown');
      expect(output).toContain('- ');
    });

    it('should display validation errors in markdown', () => {
      const invalidReport = {
        ...sampleReport,
        validation: {
          valid: false,
          errors: ['Error 1', 'Error 2'],
          warnings: ['Warning 1'],
        },
      };

      const output = formatter.format(invalidReport, 'markdown');
      expect(output).toContain('### Errors');
      expect(output).toContain('### Warnings');
    });
  });
});

describe('ConfluenceFormatter', () => {
  let formatter: ConfluenceFormatter;
  let sampleReport: ConfluenceReport;

  beforeEach(() => {
    formatter = new ConfluenceFormatter();

    sampleReport = {
      symbol: 'BTC-USDT',
      timeframe: 'M5',
      timestamp: '2025-09-30T10:00:00Z',
      confluenceScore: 85.2,
      factors: [
        {
          name: 'Fair Value Gaps',
          weight: 0.35,
          value: 0.9,
          description: 'Strong FVG presence',
        },
        {
          name: 'Order Blocks',
          weight: 0.35,
          value: 0.85,
          description: 'Clear order block formation',
        },
      ],
      fvgZones: btcConfluenceFixture.result.fvgZones,
      orderBlocks: btcConfluenceFixture.result.orderBlocks,
      overlaps: btcConfluenceFixture.result.overlaps,
      metadata: {
        barsAnalyzed: 10,
        cacheHit: false,
      },
    };
  });

  describe('Validation', () => {
    it('should validate complete report', () => {
      const result = formatter.validate(sampleReport);
      expect(result.valid).toBe(true);
    });

    it('should detect missing symbol', () => {
      const invalidReport = { ...sampleReport, symbol: '' };
      const result = formatter.validate(invalidReport);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing symbol');
    });

    it('should detect invalid confluence score', () => {
      const invalidReport = { ...sampleReport, confluenceScore: 150 };
      const result = formatter.validate(invalidReport);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid confluence score (must be 0-100)');
    });

    it('should detect missing factors', () => {
      const invalidReport = { ...sampleReport, factors: [] };
      const result = formatter.validate(invalidReport);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing confluence factors');
    });
  });

  describe('Text Format', () => {
    it('should format as text', () => {
      const output = formatter.format(sampleReport, 'text');
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });

    it('should include header with symbol and timeframe', () => {
      const output = formatter.format(sampleReport, 'text');
      expect(output).toContain('TJR Confluence Analysis: BTC-USDT (M5)');
    });

    it('should display confluence score', () => {
      const output = formatter.format(sampleReport, 'text');
      expect(output).toContain('Confluence Score: 85.2/100');
    });

    it('should display score breakdown', () => {
      const output = formatter.format(sampleReport, 'text');
      expect(output).toContain('Score Breakdown:');
      expect(output).toContain('Fair Value Gaps');
      expect(output).toContain('Order Blocks');
    });

    it('should list FVG zones', () => {
      const output = formatter.format(sampleReport, 'text');
      expect(output).toContain('Fair Value Gaps');
      expect(output).toContain('FVG 1');
      expect(output).toContain('Range:');
      expect(output).toContain('Strength:');
    });

    it('should list Order Blocks', () => {
      const output = formatter.format(sampleReport, 'text');
      expect(output).toContain('Order Blocks');
      expect(output).toContain('OB 1');
      expect(output).toContain('Volume:');
    });

    it('should list overlaps when present', () => {
      const output = formatter.format(sampleReport, 'text');
      if (sampleReport.overlaps.length > 0) {
        expect(output).toContain('Zone Overlaps');
        expect(output).toContain('Overlap Range:');
      }
    });
  });

  describe('JSON Format', () => {
    it('should format as valid JSON', () => {
      const output = formatter.format(sampleReport, 'json');
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('should preserve all data', () => {
      const output = formatter.format(sampleReport, 'json');
      const parsed = JSON.parse(output);

      expect(parsed.symbol).toBe('BTC-USDT');
      expect(parsed.confluenceScore).toBe(85.2);
      expect(parsed.fvgZones).toBeDefined();
      expect(parsed.orderBlocks).toBeDefined();
    });
  });

  describe('Table Format', () => {
    it('should format as table with box drawing', () => {
      const output = formatter.format(sampleReport, 'table');
      expect(output).toContain('┌');
      expect(output).toContain('│');
      expect(output).toContain('─');
    });

    it('should include summary table', () => {
      const output = formatter.format(sampleReport, 'table');
      expect(output).toContain('Confluence Analysis Summary');
      expect(output).toContain('BTC-USDT');
    });

    it('should include factors table', () => {
      const output = formatter.format(sampleReport, 'table');
      expect(output).toContain('Factor');
      expect(output).toContain('Weight');
      expect(output).toContain('Contribution');
    });

    it('should include FVG table when zones present', () => {
      const output = formatter.format(sampleReport, 'table');
      if (sampleReport.fvgZones.length > 0) {
        expect(output).toContain('Type');
        expect(output).toContain('Low');
        expect(output).toContain('High');
      }
    });
  });

  describe('Markdown Format', () => {
    it('should format as markdown', () => {
      const output = formatter.format(sampleReport, 'markdown');
      expect(output).toContain('#');
      expect(output).toContain('##');
    });

    it('should use markdown headings', () => {
      const output = formatter.format(sampleReport, 'markdown');
      expect(output).toContain('# TJR Confluence Analysis');
      expect(output).toContain('## BTC-USDT (M5)');
    });

    it('should use markdown tables', () => {
      const output = formatter.format(sampleReport, 'markdown');
      expect(output).toContain('|');
      expect(output).toContain('Factor');
    });

    it('should format FVG zones as table', () => {
      const output = formatter.format(sampleReport, 'markdown');
      expect(output).toContain('### Fair Value Gaps');

      if (sampleReport.fvgZones.length > 0) {
        expect(output).toContain('| # | Type | Range |');
      }
    });
  });
});

describe('ExecutionFormatter', () => {
  let formatter: ExecutionFormatter;
  let sampleReport: ExecutionReport;

  beforeEach(() => {
    formatter = new ExecutionFormatter();

    sampleReport = {
      symbol: 'BTC-USDT',
      timestamp: '2025-09-30T10:00:00Z',
      confirmation: executionConfirmedFixture.result.confirmation,
      entryTrigger: executionConfirmedFixture.result.entryTrigger,
      execution: executionConfirmedFixture.result.execution,
      riskManagement: executionConfirmedFixture.result.riskManagement,
      metadata: {
        bars5mAnalyzed: 7,
        bars1mAnalyzed: 5,
        cacheHit: false,
      },
    };
  });

  describe('Validation', () => {
    it('should validate complete report', () => {
      const result = formatter.validate(sampleReport);
      expect(result.valid).toBe(true);
    });

    it('should detect missing symbol', () => {
      const invalidReport = { ...sampleReport, symbol: '' };
      const result = formatter.validate(invalidReport);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing symbol');
    });

    it('should detect missing confirmation', () => {
      const invalidReport = { ...sampleReport, confirmation: undefined } as any;
      const result = formatter.validate(invalidReport);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing confirmation status');
    });
  });

  describe('Text Format', () => {
    it('should format as text', () => {
      const output = formatter.format(sampleReport, 'text');
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });

    it('should include header with symbol', () => {
      const output = formatter.format(sampleReport, 'text');
      expect(output).toContain('TJR Execution Analysis: BTC-USDT');
    });

    it('should display 5m confirmation status', () => {
      const output = formatter.format(sampleReport, 'text');
      expect(output).toContain('5-Minute Confirmation:');
      expect(output).toContain('Status: CONFIRMED');
    });

    it('should display 1m entry trigger when present', () => {
      const output = formatter.format(sampleReport, 'text');
      if (sampleReport.entryTrigger) {
        expect(output).toContain('1-Minute Entry Trigger:');
        expect(output).toContain('Status: TRIGGERED');
      }
    });

    it('should display execution parameters when available', () => {
      const output = formatter.format(sampleReport, 'text');
      if (sampleReport.execution) {
        expect(output).toContain('Execution Parameters:');
        expect(output).toContain('Direction:');
        expect(output).toContain('Entry Price:');
        expect(output).toContain('Stop Loss:');
        expect(output).toContain('Take Profit:');
      }
    });

    it('should display risk/reward analysis', () => {
      const output = formatter.format(sampleReport, 'text');
      if (sampleReport.execution) {
        expect(output).toContain('Risk/Reward Analysis:');
        expect(output).toContain('Risk Amount:');
        expect(output).toContain('Reward Amount:');
        expect(output).toContain('Risk/Reward Ratio:');
      }
    });

    it('should display risk management when present', () => {
      const output = formatter.format(sampleReport, 'text');
      if (sampleReport.riskManagement) {
        expect(output).toContain('Risk Management:');
        expect(output).toContain('Max Risk Per Trade:');
      }
    });

    it('should handle no execution scenario', () => {
      const noExecReport = {
        ...sampleReport,
        confirmation: { confirmed: false, reason: 'Score too low' },
        entryTrigger: undefined,
        execution: undefined,
        riskManagement: undefined,
      };

      const output = formatter.format(noExecReport, 'text');
      expect(output).toContain('Status: NOT CONFIRMED');
      expect(output).toContain('Not Available');
    });
  });

  describe('JSON Format', () => {
    it('should format as valid JSON', () => {
      const output = formatter.format(sampleReport, 'json');
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('should preserve all data', () => {
      const output = formatter.format(sampleReport, 'json');
      const parsed = JSON.parse(output);

      expect(parsed.symbol).toBe('BTC-USDT');
      expect(parsed.confirmation).toBeDefined();
      expect(parsed.execution).toBeDefined();
    });
  });

  describe('Table Format', () => {
    it('should format as table with box drawing', () => {
      const output = formatter.format(sampleReport, 'table');
      expect(output).toContain('┌');
      expect(output).toContain('│');
      expect(output).toContain('─');
    });

    it('should include summary table', () => {
      const output = formatter.format(sampleReport, 'table');
      expect(output).toContain('Execution Analysis Summary');
      expect(output).toContain('BTC-USDT');
    });

    it('should include execution table when available', () => {
      const output = formatter.format(sampleReport, 'table');
      if (sampleReport.execution) {
        expect(output).toContain('Execution Parameter');
        expect(output).toContain('Value');
      }
    });

    it('should include risk management table when available', () => {
      const output = formatter.format(sampleReport, 'table');
      if (sampleReport.riskManagement) {
        expect(output).toContain('Risk Management');
      }
    });
  });

  describe('Markdown Format', () => {
    it('should format as markdown', () => {
      const output = formatter.format(sampleReport, 'markdown');
      expect(output).toContain('#');
      expect(output).toContain('##');
    });

    it('should use markdown headings', () => {
      const output = formatter.format(sampleReport, 'markdown');
      expect(output).toContain('# TJR Execution Analysis');
      expect(output).toContain('## BTC-USDT');
    });

    it('should use status indicators', () => {
      const output = formatter.format(sampleReport, 'markdown');
      expect(output).toMatch(/✅|❌/);
    });

    it('should use markdown tables for execution params', () => {
      const output = formatter.format(sampleReport, 'markdown');
      if (sampleReport.execution) {
        expect(output).toContain('| Parameter | Value |');
      }
    });

    it('should display confluence factors as list', () => {
      const output = formatter.format(sampleReport, 'markdown');
      if (sampleReport.execution?.confluenceFactors) {
        expect(output).toContain('**Active Confluence Factors**:');
        expect(output).toContain('- ');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle report without entry trigger', () => {
      const noTriggerReport = {
        ...sampleReport,
        entryTrigger: undefined,
      };

      const output = formatter.format(noTriggerReport, 'text');
      expect(output).not.toContain('1-Minute Entry Trigger');
    });

    it('should handle report without execution', () => {
      const noExecReport = {
        ...sampleReport,
        execution: undefined,
        riskManagement: undefined,
      };

      const output = formatter.format(noExecReport, 'text');
      expect(output).toContain('Not Available');
    });

    it('should handle report without risk management', () => {
      const noRiskReport = {
        ...sampleReport,
        riskManagement: undefined,
      };

      const output = formatter.format(noRiskReport, 'text');
      expect(output).not.toContain('Risk Management:');
    });
  });
});
