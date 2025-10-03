/**
 * Daily analysis report formatter
 * Supports multiple output formats with deterministic output
 */

export type OutputFormat = 'text' | 'json' | 'table' | 'markdown';

export interface DailyAnalysisReport {
  symbol: string;
  date: string;
  analysis: {
    bias: {
      direction: string;
      confidence?: number;
      strength?: string;
      reason?: string;
      keyLevels?: Record<string, number>;
    };
    profile: {
      type: string;
      characteristics?: string[];
      volatility?: number;
    };
    sessions?: Array<{
      name: string;
      high?: number;
      low?: number;
      range?: number;
      barCount?: number;
    }>;
  };
  statistics: {
    barsAnalyzed: number;
    timeframe: string;
    range: {
      high: number;
      low: number;
      close: number;
    };
  };
  timestamp: string;
  metadata?: {
    provider?: string;
    cacheHit?: boolean;
    latencyMs?: number;
  };
}

/**
 * Formatter for daily analysis reports
 */
export class DailyFormatter {
  /**
   * Format report in specified format
   */
  format(report: DailyAnalysisReport, format: OutputFormat = 'text'): string {
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
   * Format as plain text (default)
   */
  private formatAsText(report: DailyAnalysisReport): string {
    const lines: string[] = [];

    // Header
    lines.push(`Daily Analysis: ${report.symbol} - ${report.date}`);
    lines.push('='.repeat(50));
    lines.push('');

    // Market Bias
    lines.push('Market Bias:');
    lines.push(`  Direction: ${report.analysis.bias.direction}`);

    if (report.analysis.bias.strength !== undefined) {
      lines.push(`  Strength: ${report.analysis.bias.strength}`);
    }

    if (report.analysis.bias.confidence !== undefined) {
      lines.push(`  Confidence: ${report.analysis.bias.confidence}%`);
    }

    if (report.analysis.bias.reason) {
      lines.push(`  Reason: ${report.analysis.bias.reason}`);
    }

    if (report.analysis.bias.keyLevels) {
      lines.push('  Key Levels:');
      for (const [key, value] of Object.entries(report.analysis.bias.keyLevels)) {
        lines.push(`    ${key}: ${this.formatPrice(value)}`);
      }
    }

    lines.push('');

    // Day Profile
    lines.push('Day Profile:');
    lines.push(`  Type: ${report.analysis.profile.type}`);

    if (
      report.analysis.profile.characteristics &&
      report.analysis.profile.characteristics.length > 0
    ) {
      lines.push('  Characteristics:');
      for (const char of report.analysis.profile.characteristics) {
        lines.push(`    - ${char}`);
      }
    }

    if (report.analysis.profile.volatility !== undefined) {
      lines.push(`  Volatility: ${report.analysis.profile.volatility.toFixed(2)}`);
    }

    lines.push('');

    // Session Analysis
    if (report.analysis.sessions && report.analysis.sessions.length > 0) {
      lines.push('Session Extremes:');
      for (const session of report.analysis.sessions) {
        lines.push(`  ${session.name}:`);
        if (session.high !== undefined) {
          lines.push(`    High: ${this.formatPrice(session.high)}`);
        }
        if (session.low !== undefined) {
          lines.push(`    Low: ${this.formatPrice(session.low)}`);
        }
        if (session.range !== undefined) {
          lines.push(`    Range: ${this.formatPrice(session.range)}`);
        }
        if (session.barCount !== undefined) {
          lines.push(`    Bars: ${session.barCount}`);
        }
      }
      lines.push('');
    }

    // Statistics
    lines.push('Statistics:');
    lines.push(`  Bars Analyzed: ${report.statistics.barsAnalyzed}`);
    lines.push(`  Timeframe: ${report.statistics.timeframe}`);
    lines.push(`  Day High: ${this.formatPrice(report.statistics.range.high)}`);
    lines.push(`  Day Low: ${this.formatPrice(report.statistics.range.low)}`);
    lines.push(`  Close: ${this.formatPrice(report.statistics.range.close)}`);

    // Metadata (if verbose)
    if (report.metadata) {
      lines.push('');
      lines.push('Metadata:');
      if (report.metadata.provider) {
        lines.push(`  Provider: ${report.metadata.provider}`);
      }
      if (report.metadata.cacheHit !== undefined) {
        lines.push(`  Cache Hit: ${report.metadata.cacheHit ? 'Yes' : 'No'}`);
      }
      if (report.metadata.latencyMs !== undefined) {
        lines.push(`  Latency: ${report.metadata.latencyMs}ms`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format as JSON
   */
  private formatAsJSON(report: DailyAnalysisReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Format as table
   */
  private formatAsTable(report: DailyAnalysisReport): string {
    const lines: string[] = [];

    // Main info table
    lines.push('┌────────────────┬────────────────────────┐');
    lines.push('│ Metric         │ Value                  │');
    lines.push('├────────────────┼────────────────────────┤');
    lines.push(`│ Symbol         │ ${this.padRight(report.symbol, 22)} │`);
    lines.push(`│ Date           │ ${this.padRight(report.date, 22)} │`);
    lines.push(`│ Bias           │ ${this.padRight(report.analysis.bias.direction, 22)} │`);

    if (report.analysis.bias.confidence !== undefined) {
      lines.push(
        `│ Confidence     │ ${this.padRight(`${report.analysis.bias.confidence}%`, 22)} │`
      );
    }

    lines.push(`│ Profile        │ ${this.padRight(report.analysis.profile.type, 22)} │`);
    lines.push(`│ Bars           │ ${this.padRight(String(report.statistics.barsAnalyzed), 22)} │`);
    lines.push(`│ Timeframe      │ ${this.padRight(report.statistics.timeframe, 22)} │`);
    lines.push('└────────────────┴────────────────────────┘');

    // Price range table
    if (report.statistics.range) {
      lines.push('');
      lines.push('┌────────────────┬────────────────────────┐');
      lines.push('│ Price Level    │ Value                  │');
      lines.push('├────────────────┼────────────────────────┤');
      lines.push(
        `│ High           │ ${this.padRight(this.formatPrice(report.statistics.range.high), 22)} │`
      );
      lines.push(
        `│ Low            │ ${this.padRight(this.formatPrice(report.statistics.range.low), 22)} │`
      );
      lines.push(
        `│ Close          │ ${this.padRight(this.formatPrice(report.statistics.range.close), 22)} │`
      );
      lines.push('└────────────────┴────────────────────────┘');
    }

    // Sessions table
    if (report.analysis.sessions && report.analysis.sessions.length > 0) {
      lines.push('');
      lines.push('┌──────────────┬──────────┬──────────┬──────────┐');
      lines.push('│ Session      │ High     │ Low      │ Range    │');
      lines.push('├──────────────┼──────────┼──────────┼──────────┤');

      for (const session of report.analysis.sessions) {
        const high = session.high !== undefined ? this.formatPrice(session.high) : 'N/A';
        const low = session.low !== undefined ? this.formatPrice(session.low) : 'N/A';
        const range = session.range !== undefined ? this.formatPrice(session.range) : 'N/A';

        lines.push(
          `│ ${this.padRight(session.name, 12)} │ ${this.padRight(high, 8)} │ ${this.padRight(low, 8)} │ ${this.padRight(range, 8)} │`
        );
      }

      lines.push('└──────────────┴──────────┴──────────┴──────────┘');
    }

    return lines.join('\n');
  }

  /**
   * Format as markdown
   */
  private formatAsMarkdown(report: DailyAnalysisReport): string {
    const lines: string[] = [];

    // Header
    lines.push('# Daily Analysis Report');
    lines.push('');
    lines.push(`## ${report.symbol} - ${report.date}`);
    lines.push('');

    // Market Bias
    lines.push('### Market Bias');
    lines.push('');
    lines.push(`- **Direction**: ${report.analysis.bias.direction}`);

    if (report.analysis.bias.confidence !== undefined) {
      lines.push(`- **Confidence**: ${report.analysis.bias.confidence}%`);
    }

    if (report.analysis.bias.strength) {
      lines.push(`- **Strength**: ${report.analysis.bias.strength}`);
    }

    if (report.analysis.bias.reason) {
      lines.push(`- **Reason**: ${report.analysis.bias.reason}`);
    }

    if (report.analysis.bias.keyLevels) {
      lines.push('');
      lines.push('**Key Levels**:');
      for (const [key, value] of Object.entries(report.analysis.bias.keyLevels)) {
        lines.push(`- ${key}: ${this.formatPrice(value)}`);
      }
    }

    lines.push('');

    // Day Profile
    lines.push('### Day Profile');
    lines.push('');
    lines.push(`- **Type**: ${report.analysis.profile.type}`);

    if (report.analysis.profile.volatility !== undefined) {
      lines.push(`- **Volatility**: ${report.analysis.profile.volatility.toFixed(2)}`);
    }

    if (
      report.analysis.profile.characteristics &&
      report.analysis.profile.characteristics.length > 0
    ) {
      lines.push('');
      lines.push('**Characteristics**:');
      for (const char of report.analysis.profile.characteristics) {
        lines.push(`- ${char}`);
      }
    }

    lines.push('');

    // Session Analysis
    if (report.analysis.sessions && report.analysis.sessions.length > 0) {
      lines.push('### Session Analysis');
      lines.push('');
      lines.push('| Session | High | Low | Range | Bars |');
      lines.push('|---------|------|-----|-------|------|');

      for (const session of report.analysis.sessions) {
        const high = session.high !== undefined ? this.formatPrice(session.high) : 'N/A';
        const low = session.low !== undefined ? this.formatPrice(session.low) : 'N/A';
        const range = session.range !== undefined ? this.formatPrice(session.range) : 'N/A';
        const bars = session.barCount !== undefined ? String(session.barCount) : 'N/A';

        lines.push(`| ${session.name} | ${high} | ${low} | ${range} | ${bars} |`);
      }

      lines.push('');
    }

    // Statistics
    lines.push('### Statistics');
    lines.push('');
    lines.push(`- **Bars Analyzed**: ${report.statistics.barsAnalyzed}`);
    lines.push(`- **Timeframe**: ${report.statistics.timeframe}`);
    lines.push(`- **Day High**: ${this.formatPrice(report.statistics.range.high)}`);
    lines.push(`- **Day Low**: ${this.formatPrice(report.statistics.range.low)}`);
    lines.push(`- **Close**: ${this.formatPrice(report.statistics.range.close)}`);

    // Metadata
    if (report.metadata) {
      lines.push('');
      lines.push('### Metadata');
      lines.push('');
      if (report.metadata.provider) {
        lines.push(`- **Provider**: ${report.metadata.provider}`);
      }
      if (report.metadata.cacheHit !== undefined) {
        lines.push(`- **Cache Hit**: ${report.metadata.cacheHit ? 'Yes' : 'No'}`);
      }
      if (report.metadata.latencyMs !== undefined) {
        lines.push(`- **Latency**: ${report.metadata.latencyMs}ms`);
      }
    }

    // Footer
    lines.push('');
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
}
