/**
 * Setup report formatter
 *
 * Formats configuration reports for the /tjr-setup command in multiple
 * output formats (text, JSON, table, markdown).
 */

import type { SetupReport, TJRFormatter, OutputFormat, ValidationResult } from '../reports/types.js';

/**
 * Formatter for setup/configuration reports
 */
export class SetupFormatter implements TJRFormatter<SetupReport> {
  /**
   * Format report in specified format
   */
  format(report: SetupReport, format: OutputFormat): string {
    switch (format) {
      case 'json':
        return this.formatAsJSON(report);
      case 'table':
        return this.formatAsTable(report);
      case 'markdown':
        return this.formatAsMarkdown(report);
      case 'text':
      default:
        return this.formatAsText(report);
    }
  }

  /**
   * Validate report structure
   */
  validate(report: SetupReport): ValidationResult {
    const errors: string[] = [];

    if (!report.confluence || !report.execution || !report.formatting || !report.cache) {
      errors.push('Missing required configuration sections');
    }

    if (!report.validation) {
      errors.push('Missing validation status');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Format as plain text
   */
  private formatAsText(report: SetupReport): string {
    const lines: string[] = [];

    // Header
    lines.push('TJR Configuration');
    lines.push('='.repeat(50));
    lines.push('');

    // Validation Status
    if (report.validation) {
      lines.push('Validation Status:');
      lines.push(`  Valid: ${report.validation.valid ? 'Yes' : 'No'}`);

      if (report.validation.errors && report.validation.errors.length > 0) {
        lines.push('  Errors:');
        for (const error of report.validation.errors) {
          lines.push(`    - ${error}`);
        }
      }

      if (report.validation.warnings && report.validation.warnings.length > 0) {
        lines.push('  Warnings:');
        for (const warning of report.validation.warnings) {
          lines.push(`    - ${warning}`);
        }
      }

      lines.push('');
    }

    // Confluence Configuration
    lines.push('Confluence Configuration:');
    lines.push('  Weights:');
    lines.push(`    FVG: ${report.confluence.weights.fvg.toFixed(2)}`);
    lines.push(`    Order Block: ${report.confluence.weights.orderBlock.toFixed(2)}`);
    lines.push(`    Overlap: ${report.confluence.weights.overlap.toFixed(2)}`);
    lines.push(`    Recency: ${report.confluence.weights.recency.toFixed(2)}`);
    lines.push('  FVG Options:');
    lines.push(`    Min Gap Size (ATR): ${report.confluence.fvg.minGapSizeATR}`);
    lines.push(`    Check Filled: ${report.confluence.fvg.checkFilled ? 'Yes' : 'No'}`);
    lines.push('  Order Block Options:');
    lines.push(`    Min Volume Ratio: ${report.confluence.orderBlock.minVolumeRatio}`);
    lines.push(`    Min Rejection: ${report.confluence.orderBlock.minRejection}`);
    lines.push(`    Check Mitigated: ${report.confluence.orderBlock.checkMitigated ? 'Yes' : 'No'}`);
    lines.push('');

    // Execution Configuration
    lines.push('Execution Configuration:');
    lines.push('  5m Confirmation:');
    lines.push(`    Min Confluence Score: ${report.execution.confirmation5m.minConfluenceScore}`);
    if (report.execution.confirmation5m.requiredFactors) {
      lines.push(`    Required Factors: ${report.execution.confirmation5m.requiredFactors.join(', ')}`);
    }
    lines.push(`    Lookback Bars: ${report.execution.confirmation5m.lookbackBars || 20}`);
    lines.push('  1m Entry:');
    lines.push(`    Min Confluence Score: ${report.execution.entry1m.minConfluenceScore}`);
    lines.push(`    Max Bars After Confirmation: ${report.execution.entry1m.maxBarsAfterConfirmation}`);
    lines.push(`    Require Zone Entry: ${report.execution.entry1m.requireZoneEntry ? 'Yes' : 'No'}`);
    lines.push('  Risk:');
    lines.push(`    Max Risk Per Trade: ${(report.execution.risk.maxRiskPerTrade * 100).toFixed(2)}%`);
    lines.push(`    Default Stop Percent: ${(report.execution.risk.defaultStopPercent * 100).toFixed(2)}%`);
    lines.push(`    Default Risk/Reward: ${report.execution.risk.defaultRiskReward.toFixed(1)}`);
    if (report.execution.risk.accountSize) {
      lines.push(`    Account Size: $${report.execution.risk.accountSize.toLocaleString()}`);
    }
    lines.push('');

    // Risk Management Configuration
    if (report.risk) {
      lines.push('Risk Management Configuration:');
      lines.push(`  Max Risk Per Trade: ${(report.risk.maxRiskPerTrade * 100).toFixed(2)}%`);
      lines.push(`  Max Daily Loss: ${(report.risk.maxDailyLoss * 100).toFixed(2)}%`);
      if (report.risk.accountSize) {
        lines.push(`  Account Size: $${report.risk.accountSize.toLocaleString()}`);
      }
      lines.push(`  Default Stop Percent: ${(report.risk.defaultStopPercent * 100).toFixed(2)}%`);
      lines.push(`  Default Risk/Reward: ${report.risk.defaultRiskReward.toFixed(1)}`);
      lines.push(`  Use Trailing Stop: ${report.risk.useTrailingStop ? 'Yes' : 'No'}`);
      if (report.risk.partialExits?.enabled) {
        lines.push('  Partial Exits:');
        lines.push(`    Enabled: Yes`);
        if (report.risk.partialExits.levels) {
          lines.push('    Levels:');
          for (const level of report.risk.partialExits.levels) {
            lines.push(`      - ${(level.percentage * 100).toFixed(0)}% at ${level.atRiskReward}R`);
          }
        }
      }
      lines.push('');
    }

    // Formatting Preferences
    lines.push('Formatting Preferences:');
    lines.push(`  Default Format: ${report.formatting.defaultFormat}`);
    lines.push(`  Include Metadata: ${report.formatting.includeMetadata ? 'Yes' : 'No'}`);
    lines.push(`  Verbose: ${report.formatting.verbose ? 'Yes' : 'No'}`);
    lines.push('');

    // Cache Configuration
    lines.push('Cache Configuration:');
    lines.push(`  Enabled: ${report.cache.enabled ? 'Yes' : 'No'}`);
    lines.push(`  Confluence TTL: ${report.cache.ttl.confluence / 1000}s`);
    lines.push(`  Execution TTL: ${report.cache.ttl.execution / 1000}s`);

    // Metadata
    if (report.metadata) {
      lines.push('');
      lines.push('Metadata:');
      if (report.metadata.configPath) {
        lines.push(`  Config Path: ${report.metadata.configPath}`);
      }
      if (report.metadata.lastModified) {
        lines.push(`  Last Modified: ${report.metadata.lastModified}`);
      }
    }

    lines.push('');
    lines.push(`Generated: ${report.timestamp}`);

    return lines.join('\n');
  }

  /**
   * Format as JSON
   */
  private formatAsJSON(report: SetupReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Format as table
   */
  private formatAsTable(report: SetupReport): string {
    const lines: string[] = [];

    // Validation Status
    lines.push('┌─────────────────────────────────────────────────┐');
    lines.push('│             Validation Status                   │');
    lines.push('├─────────────────────────────────────────────────┤');
    lines.push(`│ Valid: ${this.padRight(report.validation.valid ? 'Yes' : 'No', 42)} │`);
    lines.push('└─────────────────────────────────────────────────┘');
    lines.push('');

    // Confluence Weights
    lines.push('┌────────────────────┬──────────┐');
    lines.push('│ Confluence Weights │  Value   │');
    lines.push('├────────────────────┼──────────┤');
    lines.push(`│ FVG                │ ${this.padLeft(report.confluence.weights.fvg.toFixed(2), 8)} │`);
    lines.push(`│ Order Block        │ ${this.padLeft(report.confluence.weights.orderBlock.toFixed(2), 8)} │`);
    lines.push(`│ Overlap            │ ${this.padLeft(report.confluence.weights.overlap.toFixed(2), 8)} │`);
    lines.push(`│ Recency            │ ${this.padLeft(report.confluence.weights.recency.toFixed(2), 8)} │`);
    lines.push('└────────────────────┴──────────┘');
    lines.push('');

    // Execution Thresholds
    lines.push('┌─────────────────────────┬────────┐');
    lines.push('│ Execution Thresholds    │  Value │');
    lines.push('├─────────────────────────┼────────┤');
    lines.push(`│ 5m Min Confluence       │ ${this.padLeft(String(report.execution.confirmation5m.minConfluenceScore), 6)} │`);
    lines.push(`│ 1m Min Confluence       │ ${this.padLeft(String(report.execution.entry1m.minConfluenceScore), 6)} │`);
    lines.push(`│ Max Bars After Confirm  │ ${this.padLeft(String(report.execution.entry1m.maxBarsAfterConfirmation), 6)} │`);
    lines.push('└─────────────────────────┴────────┘');
    lines.push('');

    // Risk Parameters
    lines.push('┌──────────────────────────┬──────────┐');
    lines.push('│ Risk Parameters          │   Value  │');
    lines.push('├──────────────────────────┼──────────┤');
    lines.push(`│ Max Risk Per Trade       │ ${this.padLeft(`${(report.execution.risk.maxRiskPerTrade * 100).toFixed(2)}%`, 8)} │`);
    lines.push(`│ Default Stop             │ ${this.padLeft(`${(report.execution.risk.defaultStopPercent * 100).toFixed(2)}%`, 8)} │`);
    lines.push(`│ Default Risk/Reward      │ ${this.padLeft(report.execution.risk.defaultRiskReward.toFixed(1), 8)} │`);
    lines.push('└──────────────────────────┴──────────┘');

    return lines.join('\n');
  }

  /**
   * Format as markdown
   */
  private formatAsMarkdown(report: SetupReport): string {
    const lines: string[] = [];

    // Header
    lines.push('# TJR Configuration');
    lines.push('');

    // Validation Status
    if (report.validation) {
      lines.push('## Validation Status');
      lines.push('');
      lines.push(`**Valid**: ${report.validation.valid ? 'Yes' : 'No'}`);
      lines.push('');

      if (report.validation.errors && report.validation.errors.length > 0) {
        lines.push('### Errors');
        for (const error of report.validation.errors) {
          lines.push(`- ${error}`);
        }
        lines.push('');
      }

      if (report.validation.warnings && report.validation.warnings.length > 0) {
        lines.push('### Warnings');
        for (const warning of report.validation.warnings) {
          lines.push(`- ${warning}`);
        }
        lines.push('');
      }
    }

    // Confluence Configuration
    lines.push('## Confluence Configuration');
    lines.push('');
    lines.push('### Weights');
    lines.push('');
    lines.push('| Factor | Weight |');
    lines.push('|--------|--------|');
    lines.push(`| FVG | ${report.confluence.weights.fvg.toFixed(2)} |`);
    lines.push(`| Order Block | ${report.confluence.weights.orderBlock.toFixed(2)} |`);
    lines.push(`| Overlap | ${report.confluence.weights.overlap.toFixed(2)} |`);
    lines.push(`| Recency | ${report.confluence.weights.recency.toFixed(2)} |`);
    lines.push('');

    lines.push('### Options');
    lines.push('');
    lines.push('**FVG**:');
    lines.push(`- Min Gap Size (ATR): ${report.confluence.fvg.minGapSizeATR}`);
    lines.push(`- Check Filled: ${report.confluence.fvg.checkFilled ? 'Yes' : 'No'}`);
    lines.push('');
    lines.push('**Order Block**:');
    lines.push(`- Min Volume Ratio: ${report.confluence.orderBlock.minVolumeRatio}`);
    lines.push(`- Min Rejection: ${report.confluence.orderBlock.minRejection}`);
    lines.push(`- Check Mitigated: ${report.confluence.orderBlock.checkMitigated ? 'Yes' : 'No'}`);
    lines.push('');

    // Execution Configuration
    lines.push('## Execution Configuration');
    lines.push('');
    lines.push('### 5m Confirmation');
    lines.push(`- Min Confluence Score: ${report.execution.confirmation5m.minConfluenceScore}`);
    if (report.execution.confirmation5m.requiredFactors) {
      lines.push(`- Required Factors: ${report.execution.confirmation5m.requiredFactors.join(', ')}`);
    }
    lines.push(`- Lookback Bars: ${report.execution.confirmation5m.lookbackBars || 20}`);
    lines.push('');

    lines.push('### 1m Entry');
    lines.push(`- Min Confluence Score: ${report.execution.entry1m.minConfluenceScore}`);
    lines.push(`- Max Bars After Confirmation: ${report.execution.entry1m.maxBarsAfterConfirmation}`);
    lines.push(`- Require Zone Entry: ${report.execution.entry1m.requireZoneEntry ? 'Yes' : 'No'}`);
    lines.push('');

    lines.push('### Risk');
    lines.push(`- Max Risk Per Trade: ${(report.execution.risk.maxRiskPerTrade * 100).toFixed(2)}%`);
    lines.push(`- Default Stop Percent: ${(report.execution.risk.defaultStopPercent * 100).toFixed(2)}%`);
    lines.push(`- Default Risk/Reward: ${report.execution.risk.defaultRiskReward.toFixed(1)}`);
    lines.push('');

    // Formatting and Cache
    lines.push('## Preferences');
    lines.push('');
    lines.push('**Formatting**:');
    lines.push(`- Default Format: ${report.formatting.defaultFormat}`);
    lines.push(`- Include Metadata: ${report.formatting.includeMetadata ? 'Yes' : 'No'}`);
    lines.push(`- Verbose: ${report.formatting.verbose ? 'Yes' : 'No'}`);
    lines.push('');
    lines.push('**Cache**:');
    lines.push(`- Enabled: ${report.cache.enabled ? 'Yes' : 'No'}`);
    lines.push(`- Confluence TTL: ${report.cache.ttl.confluence / 1000}s`);
    lines.push(`- Execution TTL: ${report.cache.ttl.execution / 1000}s`);
    lines.push('');

    // Footer
    lines.push('---');
    lines.push(`*Generated: ${report.timestamp}*`);

    return lines.join('\n');
  }

  /**
   * Pad string to right with spaces
   */
  private padRight(str: string, length: number): string {
    return str.padEnd(length);
  }

  /**
   * Pad string to left with spaces
   */
  private padLeft(str: string, length: number): string {
    return str.padStart(length);
  }
}