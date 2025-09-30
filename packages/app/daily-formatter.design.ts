/**
 * Daily Command Formatter Module Design
 *
 * This module handles all formatting logic for the /daily command output,
 * supporting multiple formats and graceful handling of missing data.
 */

import type { Logger } from '@tjr/logger';

// ============================================================================
// Data Types
// ============================================================================

/**
 * Complete daily analysis result
 */
export interface DailyAnalysis {
  symbol: string;
  date: string;
  bias: BiasAnalysis;
  profile: ProfileAnalysis;
  sessions: SessionAnalysis[];
  statistics: Statistics;
  metadata: Metadata;
}

/**
 * Bias analysis result
 */
export interface BiasAnalysis {
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number; // 0-100
  strength?: 'WEAK' | 'MODERATE' | 'STRONG';
  reason?: string;
  keyLevels?: {
    support?: number;
    resistance?: number;
    pivot?: number;
  };
}

/**
 * Day profile analysis
 */
export interface ProfileAnalysis {
  type: string; // 'TREND_UP', 'TREND_DOWN', 'RANGE', 'VOLATILE', etc.
  characteristics: string[];
  volatility?: number;
  trendStrength?: number;
}

/**
 * Session analysis for time periods
 */
export interface SessionAnalysis {
  name: string; // 'Pre-Market', 'Morning', 'Lunch', 'Afternoon', 'Close'
  high: number;
  low: number;
  open?: number;
  close?: number;
  range: number;
  volume?: number;
  barCount: number;
  timeRange?: {
    start: string;
    end: string;
  };
}

/**
 * Analysis statistics
 */
export interface Statistics {
  barsAnalyzed: number;
  timeframe: string;
  range: {
    high: number;
    low: number;
    open?: number;
    close?: number;
  };
  volume?: {
    total: number;
    average: number;
  };
  dataQuality?: {
    gaps: number;
    missingBars: number;
  };
}

/**
 * Metadata for tracking
 */
export interface Metadata {
  analysisVersion: string;
  timestamp: string;
  provider?: string;
  cached?: boolean;
  processingTimeMs?: number;
}

// ============================================================================
// Formatter Configuration
// ============================================================================

/**
 * Formatter options
 */
export interface FormatterOptions {
  format: OutputFormat;
  verbose?: boolean;
  includeMetadata?: boolean;
  template?: string;
  locale?: string;
  timezone?: string;
  decimals?: number;
}

/**
 * Supported output formats
 */
export type OutputFormat = 'text' | 'json' | 'table' | 'markdown' | 'csv' | 'html';

/**
 * Template configuration
 */
export interface Template {
  name: string;
  format: OutputFormat;
  template: string;
  helpers?: Record<string, TemplateHelper>;
}

/**
 * Template helper function
 */
export type TemplateHelper = (value: any, options?: any) => string;

// ============================================================================
// Formatter Implementation
// ============================================================================

/**
 * Daily analysis formatter
 */
export class DailyFormatter {
  private logger: Logger;
  private templates: Map<string, Template> = new Map();
  private defaultOptions: Partial<FormatterOptions>;

  constructor(logger: Logger, defaultOptions?: Partial<FormatterOptions>) {
    this.logger = logger;
    this.defaultOptions = defaultOptions || {
      format: 'text',
      verbose: false,
      includeMetadata: false,
      locale: 'en-US',
      timezone: 'America/New_York',
      decimals: 2
    };

    this.loadDefaultTemplates();
  }

  /**
   * Format analysis results
   */
  format(analysis: Partial<DailyAnalysis>, options?: Partial<FormatterOptions>): string {
    const opts = { ...this.defaultOptions, ...options } as FormatterOptions;

    // Sanitize and validate data
    const sanitized = this.sanitizeData(analysis);

    // Log formatting request
    this.logger.debug('Formatting daily analysis', {
      format: opts.format,
      symbol: sanitized.symbol,
      date: sanitized.date
    });

    try {
      switch (opts.format) {
        case 'json':
          return this.formatJson(sanitized, opts);
        case 'table':
          return this.formatTable(sanitized, opts);
        case 'markdown':
          return this.formatMarkdown(sanitized, opts);
        case 'csv':
          return this.formatCsv(sanitized, opts);
        case 'html':
          return this.formatHtml(sanitized, opts);
        case 'text':
        default:
          return this.formatText(sanitized, opts);
      }
    } catch (error) {
      this.logger.error('Formatting error', {
        format: opts.format,
        error: error instanceof Error ? error.message : String(error)
      });

      // Fallback to simple JSON
      return JSON.stringify(sanitized, null, 2);
    }
  }

  /**
   * Register custom template
   */
  registerTemplate(template: Template): void {
    this.templates.set(template.name, template);
    this.logger.info('Template registered', { name: template.name });
  }

  // ============================================================================
  // Format Implementations
  // ============================================================================

  /**
   * Format as plain text
   */
  private formatText(analysis: DailyAnalysis, options: FormatterOptions): string {
    const lines: string[] = [];
    const separator = '='.repeat(60);

    // Header
    lines.push(`Daily Analysis: ${analysis.symbol} - ${analysis.date}`);
    lines.push(separator);
    lines.push('');

    // Market Bias
    lines.push('MARKET BIAS');
    lines.push('-'.repeat(20));
    lines.push(`Direction: ${analysis.bias.direction}`);
    if (analysis.bias.strength) {
      lines.push(`Strength: ${analysis.bias.strength}`);
    }
    lines.push(`Confidence: ${analysis.bias.confidence}%`);
    if (analysis.bias.reason) {
      lines.push(`Reason: ${analysis.bias.reason}`);
    }
    if (analysis.bias.keyLevels) {
      lines.push('Key Levels:');
      if (analysis.bias.keyLevels.support) {
        lines.push(`  Support: ${this.formatNumber(analysis.bias.keyLevels.support, options)}`);
      }
      if (analysis.bias.keyLevels.resistance) {
        lines.push(`  Resistance: ${this.formatNumber(analysis.bias.keyLevels.resistance, options)}`);
      }
      if (analysis.bias.keyLevels.pivot) {
        lines.push(`  Pivot: ${this.formatNumber(analysis.bias.keyLevels.pivot, options)}`);
      }
    }
    lines.push('');

    // Day Profile
    lines.push('DAY PROFILE');
    lines.push('-'.repeat(20));
    lines.push(`Type: ${analysis.profile.type}`);
    if (analysis.profile.characteristics.length > 0) {
      lines.push('Characteristics:');
      for (const char of analysis.profile.characteristics) {
        lines.push(`  • ${char}`);
      }
    }
    if (analysis.profile.volatility !== undefined) {
      lines.push(`Volatility: ${analysis.profile.volatility.toFixed(2)}`);
    }
    lines.push('');

    // Session Analysis
    if (analysis.sessions.length > 0) {
      lines.push('SESSION ANALYSIS');
      lines.push('-'.repeat(20));

      for (const session of analysis.sessions) {
        lines.push(`${session.name}:`);
        lines.push(`  High: ${this.formatNumber(session.high, options)}`);
        lines.push(`  Low: ${this.formatNumber(session.low, options)}`);
        lines.push(`  Range: ${this.formatNumber(session.range, options)}`);
        if (session.volume) {
          lines.push(`  Volume: ${this.formatVolume(session.volume)}`);
        }
        lines.push(`  Bars: ${session.barCount}`);
      }
      lines.push('');
    }

    // Statistics
    lines.push('STATISTICS');
    lines.push('-'.repeat(20));
    lines.push(`Bars Analyzed: ${analysis.statistics.barsAnalyzed}`);
    lines.push(`Timeframe: ${analysis.statistics.timeframe}`);
    lines.push(`Day High: ${this.formatNumber(analysis.statistics.range.high, options)}`);
    lines.push(`Day Low: ${this.formatNumber(analysis.statistics.range.low, options)}`);
    if (analysis.statistics.range.close) {
      lines.push(`Close: ${this.formatNumber(analysis.statistics.range.close, options)}`);
    }
    if (analysis.statistics.volume) {
      lines.push(`Total Volume: ${this.formatVolume(analysis.statistics.volume.total)}`);
      lines.push(`Avg Volume: ${this.formatVolume(analysis.statistics.volume.average)}`);
    }

    // Metadata (if requested)
    if (options.includeMetadata && analysis.metadata) {
      lines.push('');
      lines.push('METADATA');
      lines.push('-'.repeat(20));
      lines.push(`Generated: ${analysis.metadata.timestamp}`);
      if (analysis.metadata.provider) {
        lines.push(`Provider: ${analysis.metadata.provider}`);
      }
      if (analysis.metadata.cached !== undefined) {
        lines.push(`Cached: ${analysis.metadata.cached ? 'Yes' : 'No'}`);
      }
      if (analysis.metadata.processingTimeMs) {
        lines.push(`Processing Time: ${analysis.metadata.processingTimeMs}ms`);
      }
    }

    lines.push('');
    lines.push(separator);

    return lines.join('\n');
  }

  /**
   * Format as JSON
   */
  private formatJson(analysis: DailyAnalysis, options: FormatterOptions): string {
    const output = options.includeMetadata ? analysis : {
      symbol: analysis.symbol,
      date: analysis.date,
      bias: analysis.bias,
      profile: analysis.profile,
      sessions: analysis.sessions,
      statistics: analysis.statistics
    };

    return JSON.stringify(output, null, options.verbose ? 2 : 0);
  }

  /**
   * Format as table
   */
  private formatTable(analysis: DailyAnalysis, options: FormatterOptions): string {
    const lines: string[] = [];

    // Summary table
    lines.push('╔══════════════════╤══════════════════════════╗');
    lines.push('║ Metric           │ Value                    ║');
    lines.push('╟──────────────────┼──────────────────────────╢');
    lines.push(`║ Symbol           │ ${this.padRight(analysis.symbol, 24)} ║`);
    lines.push(`║ Date             │ ${this.padRight(analysis.date, 24)} ║`);
    lines.push(`║ Bias             │ ${this.padRight(analysis.bias.direction, 24)} ║`);
    lines.push(`║ Confidence       │ ${this.padRight(`${analysis.bias.confidence}%`, 24)} ║`);
    lines.push(`║ Profile          │ ${this.padRight(analysis.profile.type, 24)} ║`);
    lines.push(`║ Bars Analyzed    │ ${this.padRight(String(analysis.statistics.barsAnalyzed), 24)} ║`);
    lines.push(`║ Day High         │ ${this.padRight(this.formatNumber(analysis.statistics.range.high, options), 24)} ║`);
    lines.push(`║ Day Low          │ ${this.padRight(this.formatNumber(analysis.statistics.range.low, options), 24)} ║`);
    lines.push('╚══════════════════╧══════════════════════════╝');

    if (analysis.sessions.length > 0) {
      lines.push('');
      lines.push('Session Breakdown:');
      lines.push('╔════════════╤═════════╤═════════╤═════════╗');
      lines.push('║ Session    │ High    │ Low     │ Range   ║');
      lines.push('╟────────────┼─────────┼─────────┼─────────╢');

      for (const session of analysis.sessions) {
        const name = this.padRight(session.name, 10);
        const high = this.padRight(this.formatNumber(session.high, options), 7);
        const low = this.padRight(this.formatNumber(session.low, options), 7);
        const range = this.padRight(this.formatNumber(session.range, options), 7);
        lines.push(`║ ${name} │ ${high} │ ${low} │ ${range} ║`);
      }

      lines.push('╚════════════╧═════════╧═════════╧═════════╝');
    }

    return lines.join('\n');
  }

  /**
   * Format as Markdown
   */
  private formatMarkdown(analysis: DailyAnalysis, options: FormatterOptions): string {
    const lines: string[] = [];

    // Header
    lines.push(`# Daily Analysis Report`);
    lines.push('');
    lines.push(`## ${analysis.symbol} - ${analysis.date}`);
    lines.push('');

    // Market Bias
    lines.push('### Market Bias');
    lines.push(`- **Direction**: ${analysis.bias.direction}`);
    if (analysis.bias.strength) {
      lines.push(`- **Strength**: ${analysis.bias.strength}`);
    }
    lines.push(`- **Confidence**: ${analysis.bias.confidence}%`);
    if (analysis.bias.reason) {
      lines.push(`- **Reason**: ${analysis.bias.reason}`);
    }
    if (analysis.bias.keyLevels) {
      lines.push('- **Key Levels**:');
      if (analysis.bias.keyLevels.support) {
        lines.push(`  - Support: ${this.formatNumber(analysis.bias.keyLevels.support, options)}`);
      }
      if (analysis.bias.keyLevels.resistance) {
        lines.push(`  - Resistance: ${this.formatNumber(analysis.bias.keyLevels.resistance, options)}`);
      }
      if (analysis.bias.keyLevels.pivot) {
        lines.push(`  - Pivot: ${this.formatNumber(analysis.bias.keyLevels.pivot, options)}`);
      }
    }
    lines.push('');

    // Day Profile
    lines.push('### Day Profile');
    lines.push(`- **Type**: ${analysis.profile.type}`);
    if (analysis.profile.characteristics.length > 0) {
      lines.push('- **Characteristics**:');
      for (const char of analysis.profile.characteristics) {
        lines.push(`  - ${char}`);
      }
    }
    if (analysis.profile.volatility !== undefined) {
      lines.push(`- **Volatility**: ${analysis.profile.volatility.toFixed(2)}`);
    }
    lines.push('');

    // Session Analysis Table
    if (analysis.sessions.length > 0) {
      lines.push('### Session Analysis');
      lines.push('');
      lines.push('| Session | High | Low | Range | Bars |');
      lines.push('|---------|------|-----|-------|------|');

      for (const session of analysis.sessions) {
        const high = this.formatNumber(session.high, options);
        const low = this.formatNumber(session.low, options);
        const range = this.formatNumber(session.range, options);
        lines.push(`| ${session.name} | ${high} | ${low} | ${range} | ${session.barCount} |`);
      }
      lines.push('');
    }

    // Statistics
    lines.push('### Statistics');
    lines.push(`- **Bars Analyzed**: ${analysis.statistics.barsAnalyzed}`);
    lines.push(`- **Timeframe**: ${analysis.statistics.timeframe}`);
    lines.push(`- **Day Range**: ${this.formatNumber(analysis.statistics.range.low, options)} - ${this.formatNumber(analysis.statistics.range.high, options)}`);
    if (analysis.statistics.range.close) {
      lines.push(`- **Close**: ${this.formatNumber(analysis.statistics.range.close, options)}`);
    }
    if (analysis.statistics.volume) {
      lines.push(`- **Total Volume**: ${this.formatVolume(analysis.statistics.volume.total)}`);
      lines.push(`- **Average Volume**: ${this.formatVolume(analysis.statistics.volume.average)}`);
    }

    // Footer
    if (options.includeMetadata && analysis.metadata) {
      lines.push('');
      lines.push('---');
      lines.push('');
      lines.push(`*Generated at ${analysis.metadata.timestamp}*`);
      if (analysis.metadata.provider) {
        lines.push(`*Data Provider: ${analysis.metadata.provider}*`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format as CSV
   */
  private formatCsv(analysis: DailyAnalysis, options: FormatterOptions): string {
    const rows: string[][] = [];

    // Headers
    rows.push([
      'Symbol',
      'Date',
      'Bias',
      'Confidence',
      'Profile',
      'High',
      'Low',
      'Close',
      'Bars'
    ]);

    // Data row
    rows.push([
      analysis.symbol,
      analysis.date,
      analysis.bias.direction,
      String(analysis.bias.confidence),
      analysis.profile.type,
      this.formatNumber(analysis.statistics.range.high, options),
      this.formatNumber(analysis.statistics.range.low, options),
      analysis.statistics.range.close ? this.formatNumber(analysis.statistics.range.close, options) : '',
      String(analysis.statistics.barsAnalyzed)
    ]);

    // Session rows
    if (analysis.sessions.length > 0) {
      rows.push([]); // Empty row
      rows.push(['Session Analysis']);
      rows.push(['Session', 'High', 'Low', 'Range', 'Bars']);

      for (const session of analysis.sessions) {
        rows.push([
          session.name,
          this.formatNumber(session.high, options),
          this.formatNumber(session.low, options),
          this.formatNumber(session.range, options),
          String(session.barCount)
        ]);
      }
    }

    // Convert to CSV string
    return rows.map(row => row.map(cell => this.escapeCsv(cell)).join(',')).join('\n');
  }

  /**
   * Format as HTML
   */
  private formatHtml(analysis: DailyAnalysis, options: FormatterOptions): string {
    // Simple HTML table format
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Daily Analysis: ${analysis.symbol} - ${analysis.date}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    h2 { color: #666; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .bullish { color: green; font-weight: bold; }
    .bearish { color: red; font-weight: bold; }
    .neutral { color: gray; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Daily Analysis Report</h1>
  <h2>${analysis.symbol} - ${analysis.date}</h2>

  <h3>Market Bias</h3>
  <table>
    <tr><th>Direction</th><td class="${analysis.bias.direction.toLowerCase()}">${analysis.bias.direction}</td></tr>
    <tr><th>Confidence</th><td>${analysis.bias.confidence}%</td></tr>
    ${analysis.bias.reason ? `<tr><th>Reason</th><td>${analysis.bias.reason}</td></tr>` : ''}
  </table>

  <h3>Day Profile</h3>
  <table>
    <tr><th>Type</th><td>${analysis.profile.type}</td></tr>
    <tr><th>Characteristics</th><td>${analysis.profile.characteristics.join(', ')}</td></tr>
  </table>

  ${analysis.sessions.length > 0 ? `
  <h3>Session Analysis</h3>
  <table>
    <tr><th>Session</th><th>High</th><th>Low</th><th>Range</th><th>Bars</th></tr>
    ${analysis.sessions.map(s => `
    <tr>
      <td>${s.name}</td>
      <td>${this.formatNumber(s.high, options)}</td>
      <td>${this.formatNumber(s.low, options)}</td>
      <td>${this.formatNumber(s.range, options)}</td>
      <td>${s.barCount}</td>
    </tr>
    `).join('')}
  </table>
  ` : ''}

  <h3>Statistics</h3>
  <table>
    <tr><th>Bars Analyzed</th><td>${analysis.statistics.barsAnalyzed}</td></tr>
    <tr><th>Timeframe</th><td>${analysis.statistics.timeframe}</td></tr>
    <tr><th>Day High</th><td>${this.formatNumber(analysis.statistics.range.high, options)}</td></tr>
    <tr><th>Day Low</th><td>${this.formatNumber(analysis.statistics.range.low, options)}</td></tr>
    ${analysis.statistics.range.close ? `<tr><th>Close</th><td>${this.formatNumber(analysis.statistics.range.close, options)}</td></tr>` : ''}
  </table>

  ${options.includeMetadata && analysis.metadata ? `
  <footer>
    <p><small>Generated at ${analysis.metadata.timestamp}</small></p>
  </footer>
  ` : ''}
</body>
</html>
    `.trim();
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Sanitize and validate data
   */
  private sanitizeData(analysis: Partial<DailyAnalysis>): DailyAnalysis {
    return {
      symbol: analysis.symbol || 'UNKNOWN',
      date: analysis.date || new Date().toISOString().split('T')[0],
      bias: {
        direction: analysis.bias?.direction || 'NEUTRAL',
        confidence: analysis.bias?.confidence || 0,
        strength: analysis.bias?.strength,
        reason: analysis.bias?.reason,
        keyLevels: analysis.bias?.keyLevels
      },
      profile: {
        type: analysis.profile?.type || 'UNKNOWN',
        characteristics: analysis.profile?.characteristics || [],
        volatility: analysis.profile?.volatility,
        trendStrength: analysis.profile?.trendStrength
      },
      sessions: analysis.sessions || [],
      statistics: {
        barsAnalyzed: analysis.statistics?.barsAnalyzed || 0,
        timeframe: analysis.statistics?.timeframe || '5m',
        range: {
          high: analysis.statistics?.range?.high || 0,
          low: analysis.statistics?.range?.low || 0,
          open: analysis.statistics?.range?.open,
          close: analysis.statistics?.range?.close
        },
        volume: analysis.statistics?.volume,
        dataQuality: analysis.statistics?.dataQuality
      },
      metadata: analysis.metadata || {
        analysisVersion: '1.0.0',
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Format number with locale and decimals
   */
  private formatNumber(value: number, options: FormatterOptions): string {
    return value.toLocaleString(options.locale || 'en-US', {
      minimumFractionDigits: options.decimals || 2,
      maximumFractionDigits: options.decimals || 2
    });
  }

  /**
   * Format volume with abbreviation
   */
  private formatVolume(volume: number): string {
    if (volume >= 1e9) return `${(volume / 1e9).toFixed(2)}B`;
    if (volume >= 1e6) return `${(volume / 1e6).toFixed(2)}M`;
    if (volume >= 1e3) return `${(volume / 1e3).toFixed(2)}K`;
    return String(volume);
  }

  /**
   * Pad string to the right
   */
  private padRight(str: string, length: number): string {
    return str.padEnd(length, ' ').slice(0, length);
  }

  /**
   * Escape CSV value
   */
  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Load default templates
   */
  private loadDefaultTemplates(): void {
    // Default templates can be loaded here
    // This is where you'd load custom handlebars/mustache templates
  }
}