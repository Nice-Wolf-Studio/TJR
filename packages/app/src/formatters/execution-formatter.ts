/**
 * Execution report formatter
 *
 * Formats execution recommendation reports for the /tjr-execution command
 * in multiple output formats (text, JSON, table, markdown).
 */

import type { ExecutionReport, TJRFormatter, OutputFormat, ValidationResult } from '../reports/types.js';

/**
 * Formatter for execution recommendation reports
 */
export class ExecutionFormatter implements TJRFormatter<ExecutionReport> {
  /**
   * Format report in specified format
   */
  format(report: ExecutionReport, format: OutputFormat): string {
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
  validate(report: ExecutionReport): ValidationResult {
    const errors: string[] = [];

    if (!report.symbol) {
      errors.push('Missing symbol');
    }

    if (!report.confirmation) {
      errors.push('Missing confirmation status');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Format as plain text
   */
  private formatAsText(report: ExecutionReport): string {
    const lines: string[] = [];

    // Header
    lines.push(`TJR Execution Analysis: ${report.symbol}`);
    lines.push('='.repeat(60));
    lines.push('');

    // 5-minute Confirmation Status
    lines.push('5-Minute Confirmation:');
    lines.push(`  Status: ${report.confirmation.confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'}`);
    lines.push(`  Reason: ${report.confirmation.reason}`);
    if (report.confirmation.confluenceScore !== undefined) {
      lines.push(`  Confluence Score: ${report.confirmation.confluenceScore.toFixed(1)}/100`);
    }
    if (report.confirmation.timestamp) {
      lines.push(`  Timestamp: ${report.confirmation.timestamp}`);
    }
    if (report.confirmation.barIndex !== undefined) {
      lines.push(`  Bar Index: ${report.confirmation.barIndex}`);
    }
    lines.push('');

    // 1-minute Entry Trigger Status
    if (report.entryTrigger) {
      lines.push('1-Minute Entry Trigger:');
      lines.push(`  Status: ${report.entryTrigger.triggered ? 'TRIGGERED' : 'NOT TRIGGERED'}`);
      lines.push(`  Reason: ${report.entryTrigger.reason}`);
      if (report.entryTrigger.direction) {
        lines.push(`  Direction: ${report.entryTrigger.direction.toUpperCase()}`);
      }
      if (report.entryTrigger.entryPrice !== undefined) {
        lines.push(`  Entry Price: ${this.formatPrice(report.entryTrigger.entryPrice)}`);
      }
      if (report.entryTrigger.timestamp) {
        lines.push(`  Timestamp: ${report.entryTrigger.timestamp}`);
      }
      if (report.entryTrigger.barIndex !== undefined) {
        lines.push(`  Bar Index: ${report.entryTrigger.barIndex}`);
      }
      lines.push('');
    }

    // Execution Parameters
    if (report.execution) {
      lines.push('Execution Parameters:');
      lines.push(`  Direction: ${report.execution.direction.toUpperCase()}`);
      lines.push(`  Entry Price: ${this.formatPrice(report.execution.entryPrice)}`);
      lines.push(`  Stop Loss: ${this.formatPrice(report.execution.stopLoss)}`);
      lines.push(`  Take Profit: ${this.formatPrice(report.execution.takeProfit)}`);
      lines.push(`  Position Size: ${report.execution.positionSize} shares`);
      lines.push('');

      lines.push('Risk/Reward Analysis:');
      lines.push(`  Risk Amount: $${report.execution.riskAmount.toFixed(2)}`);
      lines.push(`  Reward Amount: $${report.execution.rewardAmount.toFixed(2)}`);
      lines.push(`  Risk/Reward Ratio: ${report.execution.riskRewardRatio.toFixed(2)}R`);
      lines.push('');

      lines.push('Active Confluence Factors:');
      for (const factor of report.execution.confluenceFactors) {
        lines.push(`  - ${factor}`);
      }
      lines.push('');
    } else {
      lines.push('Execution Parameters: Not Available');
      lines.push('  No viable trade setup detected.');
      lines.push('');
    }

    // Risk Management
    if (report.riskManagement) {
      lines.push('Risk Management:');
      if (report.riskManagement.accountSize) {
        lines.push(`  Account Size: $${report.riskManagement.accountSize.toLocaleString()}`);
      }
      lines.push(`  Max Risk Per Trade: ${(report.riskManagement.maxRiskPerTrade * 100).toFixed(2)}%`);
      lines.push(`  Max Risk Amount: $${report.riskManagement.maxRiskAmount.toFixed(2)}`);
      lines.push(`  Position Size: ${report.riskManagement.positionSize} shares`);

      if (report.riskManagement.dailyLossLimit !== undefined) {
        lines.push(`  Daily Loss Limit: $${report.riskManagement.dailyLossLimit.toFixed(2)}`);
      }
      if (report.riskManagement.dailyLossUsed !== undefined) {
        lines.push(`  Daily Loss Used: $${report.riskManagement.dailyLossUsed.toFixed(2)}`);
      }
      lines.push(`  Can Take New Trade: ${report.riskManagement.canTakeNewTrade ? 'Yes' : 'No'}`);

      if (report.riskManagement.partialExits && report.riskManagement.partialExits.length > 0) {
        lines.push('  Partial Exit Levels:');
        for (const exit of report.riskManagement.partialExits) {
          lines.push(`    - ${exit.description}: ${this.formatPrice(exit.price)} (${exit.percentage * 100}% position)`);
        }
      }
      lines.push('');
    }

    // Warnings
    if (report.warnings && report.warnings.length > 0) {
      lines.push('Warnings:');
      for (const warning of report.warnings) {
        lines.push(`  - ${warning}`);
      }
      lines.push('');
    }

    // Metadata
    if (report.metadata) {
      lines.push('Analysis Details:');
      if (report.metadata.bars5mAnalyzed) {
        lines.push(`  5m Bars Analyzed: ${report.metadata.bars5mAnalyzed}`);
      }
      if (report.metadata.bars1mAnalyzed) {
        lines.push(`  1m Bars Analyzed: ${report.metadata.bars1mAnalyzed}`);
      }
      if (report.metadata.provider) {
        lines.push(`  Provider: ${report.metadata.provider}`);
      }
      if (report.metadata.cacheHit !== undefined) {
        lines.push(`  Cache Hit: ${report.metadata.cacheHit ? 'Yes' : 'No'}`);
      }
      if (report.metadata.latencyMs) {
        lines.push(`  Latency: ${report.metadata.latencyMs}ms`);
      }
      lines.push('');
    }

    lines.push(`Generated: ${report.timestamp}`);

    return lines.join('\n');
  }

  /**
   * Format as JSON
   */
  private formatAsJSON(report: ExecutionReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Format as table
   */
  private formatAsTable(report: ExecutionReport): string {
    const lines: string[] = [];

    // Summary Table
    lines.push('┌─────────────────────────────────────────────┐');
    lines.push('│        Execution Analysis Summary           │');
    lines.push('├─────────────────────────────────────────────┤');
    lines.push(`│ Symbol:        ${this.padRight(report.symbol, 27)} │`);
    lines.push(`│ 5m Confirmed:  ${this.padRight(report.confirmation.confirmed ? 'Yes' : 'No', 27)} │`);
    if (report.entryTrigger) {
      lines.push(`│ 1m Triggered:  ${this.padRight(report.entryTrigger.triggered ? 'Yes' : 'No', 27)} │`);
    }
    lines.push(`│ Trade Setup:   ${this.padRight(report.execution ? 'Available' : 'Not Available', 27)} │`);
    lines.push('└─────────────────────────────────────────────┘');
    lines.push('');

    // Execution Table
    if (report.execution) {
      lines.push('┌─────────────────────┬───────────────────┐');
      lines.push('│ Execution Parameter │       Value       │');
      lines.push('├─────────────────────┼───────────────────┤');
      lines.push(`│ Direction           │ ${this.padLeft(report.execution.direction.toUpperCase(), 17)} │`);
      lines.push(`│ Entry Price         │ ${this.padLeft(this.formatPrice(report.execution.entryPrice), 17)} │`);
      lines.push(`│ Stop Loss           │ ${this.padLeft(this.formatPrice(report.execution.stopLoss), 17)} │`);
      lines.push(`│ Take Profit         │ ${this.padLeft(this.formatPrice(report.execution.takeProfit), 17)} │`);
      lines.push(`│ Position Size       │ ${this.padLeft(String(report.execution.positionSize), 17)} │`);
      lines.push(`│ Risk Amount         │ ${this.padLeft(`$${report.execution.riskAmount.toFixed(2)}`, 17)} │`);
      lines.push(`│ Reward Amount       │ ${this.padLeft(`$${report.execution.rewardAmount.toFixed(2)}`, 17)} │`);
      lines.push(`│ Risk/Reward Ratio   │ ${this.padLeft(`${report.execution.riskRewardRatio.toFixed(2)}R`, 17)} │`);
      lines.push('└─────────────────────┴───────────────────┘');
      lines.push('');
    }

    // Risk Management Table
    if (report.riskManagement) {
      lines.push('┌──────────────────────────┬──────────────┐');
      lines.push('│ Risk Management          │    Value     │');
      lines.push('├──────────────────────────┼──────────────┤');
      if (report.riskManagement.accountSize) {
        lines.push(`│ Account Size             │ ${this.padLeft(`$${report.riskManagement.accountSize.toLocaleString()}`, 12)} │`);
      }
      lines.push(`│ Max Risk Per Trade       │ ${this.padLeft(`${(report.riskManagement.maxRiskPerTrade * 100).toFixed(2)}%`, 12)} │`);
      lines.push(`│ Max Risk Amount          │ ${this.padLeft(`$${report.riskManagement.maxRiskAmount.toFixed(2)}`, 12)} │`);
      lines.push(`│ Can Take New Trade       │ ${this.padLeft(report.riskManagement.canTakeNewTrade ? 'Yes' : 'No', 12)} │`);
      lines.push('└──────────────────────────┴──────────────┘');
    }

    return lines.join('\n');
  }

  /**
   * Format as markdown
   */
  private formatAsMarkdown(report: ExecutionReport): string {
    const lines: string[] = [];

    // Header
    lines.push('# TJR Execution Analysis');
    lines.push('');
    lines.push(`## ${report.symbol}`);
    lines.push('');

    // Confirmation Status
    lines.push('### 5-Minute Confirmation');
    lines.push('');
    lines.push(`**Status**: ${report.confirmation.confirmed ? '✅ CONFIRMED' : '❌ NOT CONFIRMED'}`);
    lines.push('');
    lines.push(`**Reason**: ${report.confirmation.reason}`);
    lines.push('');
    if (report.confirmation.confluenceScore !== undefined) {
      lines.push(`**Confluence Score**: ${report.confirmation.confluenceScore.toFixed(1)}/100`);
      lines.push('');
    }

    // Entry Trigger Status
    if (report.entryTrigger) {
      lines.push('### 1-Minute Entry Trigger');
      lines.push('');
      lines.push(`**Status**: ${report.entryTrigger.triggered ? '✅ TRIGGERED' : '❌ NOT TRIGGERED'}`);
      lines.push('');
      lines.push(`**Reason**: ${report.entryTrigger.reason}`);
      lines.push('');
      if (report.entryTrigger.direction) {
        lines.push(`**Direction**: ${report.entryTrigger.direction.toUpperCase()}`);
        lines.push('');
      }
    }

    // Execution Parameters
    if (report.execution) {
      lines.push('### Execution Parameters');
      lines.push('');
      lines.push('| Parameter | Value |');
      lines.push('|-----------|-------|');
      lines.push(`| Direction | ${report.execution.direction.toUpperCase()} |`);
      lines.push(`| Entry Price | ${this.formatPrice(report.execution.entryPrice)} |`);
      lines.push(`| Stop Loss | ${this.formatPrice(report.execution.stopLoss)} |`);
      lines.push(`| Take Profit | ${this.formatPrice(report.execution.takeProfit)} |`);
      lines.push(`| Position Size | ${report.execution.positionSize} shares |`);
      lines.push(`| Risk Amount | $${report.execution.riskAmount.toFixed(2)} |`);
      lines.push(`| Reward Amount | $${report.execution.rewardAmount.toFixed(2)} |`);
      lines.push(`| Risk/Reward Ratio | ${report.execution.riskRewardRatio.toFixed(2)}R |`);
      lines.push('');

      lines.push('**Active Confluence Factors**:');
      for (const factor of report.execution.confluenceFactors) {
        lines.push(`- ${factor}`);
      }
      lines.push('');
    } else {
      lines.push('### Execution Parameters');
      lines.push('');
      lines.push('**No viable trade setup detected.**');
      lines.push('');
    }

    // Risk Management
    if (report.riskManagement) {
      lines.push('### Risk Management');
      lines.push('');
      if (report.riskManagement.accountSize) {
        lines.push(`- **Account Size**: $${report.riskManagement.accountSize.toLocaleString()}`);
      }
      lines.push(`- **Max Risk Per Trade**: ${(report.riskManagement.maxRiskPerTrade * 100).toFixed(2)}%`);
      lines.push(`- **Max Risk Amount**: $${report.riskManagement.maxRiskAmount.toFixed(2)}`);
      lines.push(`- **Can Take New Trade**: ${report.riskManagement.canTakeNewTrade ? 'Yes' : 'No'}`);

      if (report.riskManagement.partialExits && report.riskManagement.partialExits.length > 0) {
        lines.push('');
        lines.push('**Partial Exit Levels**:');
        for (const exit of report.riskManagement.partialExits) {
          lines.push(`- ${exit.description}: ${this.formatPrice(exit.price)} (${exit.percentage * 100}%)`);
        }
      }
      lines.push('');
    }

    // Warnings
    if (report.warnings && report.warnings.length > 0) {
      lines.push('### Warnings');
      lines.push('');
      for (const warning of report.warnings) {
        lines.push(`- ⚠️ ${warning}`);
      }
      lines.push('');
    }

    // Footer
    lines.push('---');
    lines.push(`*Generated: ${report.timestamp}*`);

    return lines.join('\n');
  }

  /**
   * Format price with 2 decimal places
   */
  private formatPrice(value: number): string {
    return value.toFixed(2);
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