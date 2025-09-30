/**
 * Confluence report formatter
 *
 * Formats confluence analysis reports for the /tjr-confluences command
 * in multiple output formats (text, JSON, table, markdown).
 */

import type { ConfluenceReport, TJRFormatter, OutputFormat, ValidationResult } from '../reports/types.js';

/**
 * Formatter for confluence analysis reports
 */
export class ConfluenceFormatter implements TJRFormatter<ConfluenceReport> {
  /**
   * Format report in specified format
   */
  format(report: ConfluenceReport, format: OutputFormat): string {
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
  validate(report: ConfluenceReport): ValidationResult {
    const errors: string[] = [];

    if (!report.symbol) {
      errors.push('Missing symbol');
    }

    if (report.confluenceScore < 0 || report.confluenceScore > 100) {
      errors.push('Invalid confluence score (must be 0-100)');
    }

    if (!report.factors || report.factors.length === 0) {
      errors.push('Missing confluence factors');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Format as plain text
   */
  private formatAsText(report: ConfluenceReport): string {
    const lines: string[] = [];

    // Header
    lines.push(`TJR Confluence Analysis: ${report.symbol} (${report.timeframe})`);
    lines.push('='.repeat(60));
    lines.push('');

    // Overall Score
    lines.push(`Confluence Score: ${report.confluenceScore.toFixed(1)}/100`);
    lines.push('');

    // Score Breakdown
    lines.push('Score Breakdown:');
    for (const factor of report.factors) {
      const contribution = (factor.weight * factor.value * 100).toFixed(1);
      lines.push(`  ${factor.name}:`);
      lines.push(`    Weight: ${factor.weight.toFixed(2)} | Value: ${factor.value.toFixed(2)} | Contribution: ${contribution}`);
      lines.push(`    ${factor.description}`);
    }
    lines.push('');

    // FVG Zones
    lines.push(`Fair Value Gaps (${report.fvgZones.length} detected):`);
    if (report.fvgZones.length === 0) {
      lines.push('  None detected');
    } else {
      for (let i = 0; i < report.fvgZones.length; i++) {
        const fvg = report.fvgZones[i];
        if (!fvg) continue;
        lines.push(`  FVG ${i + 1} (${fvg.type}):`);
        lines.push(`    Range: ${this.formatPrice(fvg.low)} - ${this.formatPrice(fvg.high)}`);
        lines.push(`    Size: ${this.formatPrice(fvg.size)}`);
        lines.push(`    Strength: ${fvg.strength.toFixed(2)}`);
        lines.push(`    Filled: ${fvg.filled ? 'Yes' : 'No'}`);
        lines.push(`    Bar Index: ${fvg.startIndex}`);
      }
    }
    lines.push('');

    // Order Blocks
    lines.push(`Order Blocks (${report.orderBlocks.length} detected):`);
    if (report.orderBlocks.length === 0) {
      lines.push('  None detected');
    } else {
      for (let i = 0; i < report.orderBlocks.length; i++) {
        const ob = report.orderBlocks[i];
        if (!ob) continue;
        lines.push(`  OB ${i + 1} (${ob.type}):`);
        lines.push(`    Range: ${this.formatPrice(ob.low)} - ${this.formatPrice(ob.high)}`);
        lines.push(`    Volume: ${ob.volume.toLocaleString()}`);
        lines.push(`    Strength: ${ob.strength.toFixed(2)}`);
        lines.push(`    Mitigated: ${ob.mitigated ? 'Yes' : 'No'}`);
        lines.push(`    Bar Index: ${ob.index}`);
      }
    }
    lines.push('');

    // Overlaps
    if (report.overlaps && report.overlaps.length > 0) {
      lines.push(`Zone Overlaps (${report.overlaps.length} found):`);
      for (const overlap of report.overlaps) {
        lines.push(`  FVG ${overlap.fvgIndex + 1} ↔ OB ${overlap.orderBlockIndex + 1}:`);
        lines.push(`    Overlap Range: ${this.formatPrice(overlap.overlapLow)} - ${this.formatPrice(overlap.overlapHigh)}`);
        lines.push(`    Overlap Size: ${this.formatPrice(overlap.overlapSize)}`);
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
      if (report.metadata.barsAnalyzed) {
        lines.push(`  Bars Analyzed: ${report.metadata.barsAnalyzed}`);
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
  private formatAsJSON(report: ConfluenceReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Format as table
   */
  private formatAsTable(report: ConfluenceReport): string {
    const lines: string[] = [];

    // Summary Table
    lines.push('┌─────────────────────────────────────────────┐');
    lines.push('│         Confluence Analysis Summary         │');
    lines.push('├─────────────────────────────────────────────┤');
    lines.push(`│ Symbol:     ${this.padRight(report.symbol, 30)} │`);
    lines.push(`│ Timeframe:  ${this.padRight(report.timeframe, 30)} │`);
    lines.push(`│ Score:      ${this.padRight(report.confluenceScore.toFixed(1) + '/100', 30)} │`);
    lines.push(`│ FVG Zones:  ${this.padRight(String(report.fvgZones.length), 30)} │`);
    lines.push(`│ Order Blocks: ${this.padRight(String(report.orderBlocks.length), 28)} │`);
    lines.push(`│ Overlaps:   ${this.padRight(String(report.overlaps?.length || 0), 30)} │`);
    lines.push('└─────────────────────────────────────────────┘');
    lines.push('');

    // Factors Table
    lines.push('┌─────────────────┬────────┬───────┬──────────────┐');
    lines.push('│ Factor          │ Weight │ Value │ Contribution │');
    lines.push('├─────────────────┼────────┼───────┼──────────────┤');
    for (const factor of report.factors) {
      const contribution = (factor.weight * factor.value * 100).toFixed(1);
      lines.push(
        `│ ${this.padRight(factor.name, 15)} │ ${this.padLeft(factor.weight.toFixed(2), 6)} │ ${this.padLeft(factor.value.toFixed(2), 5)} │ ${this.padLeft(contribution, 12)} │`
      );
    }
    lines.push('└─────────────────┴────────┴───────┴──────────────┘');
    lines.push('');

    // FVG Table
    if (report.fvgZones.length > 0) {
      lines.push('┌────┬──────────┬───────────┬───────────┬──────────┬────────┐');
      lines.push('│ #  │ Type     │ Low       │ High      │ Strength │ Filled │');
      lines.push('├────┼──────────┼───────────┼───────────┼──────────┼────────┤');
      for (let i = 0; i < report.fvgZones.length; i++) {
        const fvg = report.fvgZones[i];
        if (!fvg) continue;
        lines.push(
          `│ ${this.padLeft(String(i + 1), 2)} │ ${this.padRight(fvg.type, 8)} │ ${this.padLeft(this.formatPrice(fvg.low), 9)} │ ${this.padLeft(this.formatPrice(fvg.high), 9)} │ ${this.padLeft(fvg.strength.toFixed(2), 8)} │ ${this.padRight(fvg.filled ? 'Yes' : 'No', 6)} │`
        );
      }
      lines.push('└────┴──────────┴───────────┴───────────┴──────────┴────────┘');
      lines.push('');
    }

    // Order Block Table
    if (report.orderBlocks.length > 0) {
      lines.push('┌────┬─────────┬───────────┬───────────┬──────────┬───────────┐');
      lines.push('│ #  │ Type    │ Low       │ High      │ Strength │ Mitigated │');
      lines.push('├────┼─────────┼───────────┼───────────┼──────────┼───────────┤');
      for (let i = 0; i < report.orderBlocks.length; i++) {
        const ob = report.orderBlocks[i];
        if (!ob) continue;
        lines.push(
          `│ ${this.padLeft(String(i + 1), 2)} │ ${this.padRight(ob.type, 7)} │ ${this.padLeft(this.formatPrice(ob.low), 9)} │ ${this.padLeft(this.formatPrice(ob.high), 9)} │ ${this.padLeft(ob.strength.toFixed(2), 8)} │ ${this.padRight(ob.mitigated ? 'Yes' : 'No', 9)} │`
        );
      }
      lines.push('└────┴─────────┴───────────┴───────────┴──────────┴───────────┘');
    }

    return lines.join('\n');
  }

  /**
   * Format as markdown
   */
  private formatAsMarkdown(report: ConfluenceReport): string {
    const lines: string[] = [];

    // Header
    lines.push('# TJR Confluence Analysis');
    lines.push('');
    lines.push(`## ${report.symbol} (${report.timeframe})`);
    lines.push('');

    // Overall Score
    lines.push(`**Confluence Score**: ${report.confluenceScore.toFixed(1)}/100`);
    lines.push('');

    // Score Breakdown
    lines.push('### Score Breakdown');
    lines.push('');
    lines.push('| Factor | Weight | Value | Contribution | Description |');
    lines.push('|--------|--------|-------|--------------|-------------|');
    for (const factor of report.factors) {
      const contribution = (factor.weight * factor.value * 100).toFixed(1);
      lines.push(
        `| ${factor.name} | ${factor.weight.toFixed(2)} | ${factor.value.toFixed(2)} | ${contribution} | ${factor.description} |`
      );
    }
    lines.push('');

    // FVG Zones
    lines.push(`### Fair Value Gaps (${report.fvgZones.length})`);
    lines.push('');
    if (report.fvgZones.length === 0) {
      lines.push('No FVG zones detected.');
      lines.push('');
    } else {
      lines.push('| # | Type | Range | Size | Strength | Filled | Bar |');
      lines.push('|---|------|-------|------|----------|--------|-----|');
      for (let i = 0; i < report.fvgZones.length; i++) {
        const fvg = report.fvgZones[i];
        if (!fvg) continue;
        const range = `${this.formatPrice(fvg.low)} - ${this.formatPrice(fvg.high)}`;
        lines.push(
          `| ${i + 1} | ${fvg.type} | ${range} | ${this.formatPrice(fvg.size)} | ${fvg.strength.toFixed(2)} | ${fvg.filled ? 'Yes' : 'No'} | ${fvg.startIndex} |`
        );
      }
      lines.push('');
    }

    // Order Blocks
    lines.push(`### Order Blocks (${report.orderBlocks.length})`);
    lines.push('');
    if (report.orderBlocks.length === 0) {
      lines.push('No Order Blocks detected.');
      lines.push('');
    } else {
      lines.push('| # | Type | Range | Volume | Strength | Mitigated | Bar |');
      lines.push('|---|------|-------|--------|----------|-----------|-----|');
      for (let i = 0; i < report.orderBlocks.length; i++) {
        const ob = report.orderBlocks[i];
        if (!ob) continue;
        const range = `${this.formatPrice(ob.low)} - ${this.formatPrice(ob.high)}`;
        lines.push(
          `| ${i + 1} | ${ob.type} | ${range} | ${ob.volume.toLocaleString()} | ${ob.strength.toFixed(2)} | ${ob.mitigated ? 'Yes' : 'No'} | ${ob.index} |`
        );
      }
      lines.push('');
    }

    // Overlaps
    if (report.overlaps && report.overlaps.length > 0) {
      lines.push(`### Zone Overlaps (${report.overlaps.length})`);
      lines.push('');
      lines.push('| FVG | Order Block | Overlap Range | Size |');
      lines.push('|-----|-------------|---------------|------|');
      for (const overlap of report.overlaps) {
        const range = `${this.formatPrice(overlap.overlapLow)} - ${this.formatPrice(overlap.overlapHigh)}`;
        lines.push(
          `| ${overlap.fvgIndex + 1} | ${overlap.orderBlockIndex + 1} | ${range} | ${this.formatPrice(overlap.overlapSize)} |`
        );
      }
      lines.push('');
    }

    // Warnings
    if (report.warnings && report.warnings.length > 0) {
      lines.push('### Warnings');
      lines.push('');
      for (const warning of report.warnings) {
        lines.push(`- ${warning}`);
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