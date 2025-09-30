/**
 * Daily analysis command implementation
 */

import type { Command, CommandOptions, CommandResult } from './types.js';
import type { Logger } from '@tjr/logger';
import type { MarketBar } from '@tjr/contracts';
import { Timeframe } from '@tjr/contracts';
import { calculateDailyBias, classifyDayProfile, extractSessionExtremes } from '@tjr/analysis-kit';
import type { ProviderService } from '../services/providers/types.js';

export interface DailyCommandConfig {
  providerService: ProviderService;
  logger: Logger;
}

/**
 * /daily command - performs daily market analysis using analysis-kit
 */
export class DailyCommand implements Command {
  name = 'daily';
  description = 'Analyze daily market structure and bias';
  aliases = ['analyze', 'bias'];

  private providerService: ProviderService;
  private logger: Logger;

  constructor(config: DailyCommandConfig) {
    this.providerService = config.providerService;
    this.logger = config.logger;
  }

  async execute(args: string[], options: CommandOptions): Promise<CommandResult> {
    const startTime = Date.now();

    try {
      // Parse arguments
      const symbol = args[0] || 'SPY';
      const date = args[1] ? new Date(args[1]) : new Date();

      this.logger.info('Executing daily command', {
        symbol,
        date: date.toISOString(),
        options
      });

      // Get market data for the day
      const bars = await this.fetchDayBars(symbol, date, options.dryRun);

      if (bars.length === 0) {
        return {
          success: false,
          output: 'No data available for specified date',
          duration: Date.now() - startTime
        };
      }

      // Convert bars to analysis-kit format
      const analysisBars = bars.map(bar => ({
        timestamp: new Date(bar.timestamp).getTime(),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume
      }));

      // Calculate session extremes from full day
      const sessionExtremes = {
        rthOpen: analysisBars[0]?.open ?? 0,
        rthClose: analysisBars[analysisBars.length - 1]?.close ?? 0,
        rthHigh: Math.max(...analysisBars.map(b => b.high)),
        rthLow: Math.min(...analysisBars.map(b => b.low))
      };

      // Perform analysis
      const [bias, profile, sessions] = await Promise.all([
        this.runBiasAnalysis(analysisBars, sessionExtremes),
        this.runProfileAnalysis(analysisBars, sessionExtremes),
        this.runSessionAnalysis(analysisBars)
      ]);

      // Build output
      const output = {
        symbol,
        date: date.toISOString().split('T')[0],
        analysis: {
          bias,
          profile,
          sessions
        },
        statistics: {
          barsAnalyzed: bars.length,
          timeframe: '5m',
          range: {
            high: Math.max(...bars.map(b => b.high)),
            low: Math.min(...bars.map(b => b.low)),
            close: bars[bars.length - 1]?.close ?? 0
          }
        },
        timestamp: new Date().toISOString()
      };

      // Format output
      const formattedOutput = this.formatOutput(output, options.format);

      return {
        success: true,
        output: formattedOutput,
        duration: Date.now() - startTime,
        metadata: {
          symbol,
          date: date.toISOString(),
          barsAnalyzed: bars.length
        }
      };
    } catch (error) {
      this.logger.error('Daily command failed', { error });

      return {
        success: false,
        output: null,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - startTime
      };
    }
  }

  private async fetchDayBars(
    symbol: string,
    date: Date,
    dryRun?: boolean
  ): Promise<MarketBar[]> {
    // For dry run, use fixture data
    if (dryRun) {
      this.logger.info('Using fixture data for dry run');
    }

    // Set date range for full trading day
    const from = new Date(date);
    from.setHours(9, 30, 0, 0); // Market open

    const to = new Date(date);
    to.setHours(16, 0, 0, 0); // Market close

    // Fetch 5-minute bars
    const bars = await this.providerService.getBars({
      symbol,
      timeframe: Timeframe.M5,
      from: from.toISOString(),
      to: to.toISOString()
    });

    this.logger.info('Fetched bars for analysis', {
      symbol,
      date: date.toISOString(),
      count: bars.length
    });

    return bars;
  }

  private async runBiasAnalysis(bars: any[], sessionExtremes: any): Promise<any> {
    try {
      const result = calculateDailyBias(bars, sessionExtremes);
      return {
        direction: result.bias,
        confidence: result.confidence,
        reason: result.reason
      };
    } catch (error) {
      this.logger.warn('Bias analysis failed', { error });
      return {
        direction: 'NEUTRAL',
        confidence: 0,
        reason: 'Analysis failed'
      };
    }
  }

  private async runProfileAnalysis(bars: any[], sessionExtremes: any): Promise<any> {
    try {
      const result = classifyDayProfile(bars, sessionExtremes);
      return {
        type: result.type,
        characteristics: result.characteristics,
        volatility: result.volatility
      };
    } catch (error) {
      this.logger.warn('Profile analysis failed', { error });
      return {
        type: 'K',
        characteristics: ['analysis failed'],
        volatility: 0
      };
    }
  }

  private async runSessionAnalysis(bars: any[]): Promise<any> {
    try {
      // Define trading sessions
      const sessions = [
        { name: 'Pre-Market', start: '04:00', end: '09:30' },
        { name: 'Morning', start: '09:30', end: '11:30' },
        { name: 'Lunch', start: '11:30', end: '13:30' },
        { name: 'Afternoon', start: '13:30', end: '15:30' },
        { name: 'Close', start: '15:30', end: '16:00' }
      ];

      const sessionResults: any[] = [];

      for (const session of sessions) {
        const sessionBars = this.filterBarsByTime(bars, session.start, session.end);
        if (sessionBars.length > 0) {
          // Create time window for session
          const now = new Date();
          const [startHour, startMin] = session.start.split(':').map(Number);
          const [endHour, endMin] = session.end.split(':').map(Number);

          const start = new Date(now);
          start.setHours(startHour ?? 0, startMin ?? 0, 0, 0);

          const end = new Date(now);
          end.setHours(endHour ?? 0, endMin ?? 0, 0, 0);

          const extremes = extractSessionExtremes(sessionBars, { start, end });
          if (extremes) {
            sessionResults.push({
              name: session.name,
              high: extremes.rthHigh,
              low: extremes.rthLow,
              range: extremes.rthHigh - extremes.rthLow,
              barCount: sessionBars.length
            });
          }
        }
      }

      return sessionResults;
    } catch (error) {
      this.logger.warn('Session analysis failed', { error });
      return [];
    }
  }

  private filterBarsByTime(bars: any[], startTime: string, endTime: string): any[] {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    return bars.filter(bar => {
      const barDate = new Date(bar.timestamp);
      const barMinutes = barDate.getHours() * 60 + barDate.getMinutes();
      const startMinutes = startHour! * 60 + startMin!;
      const endMinutes = endHour! * 60 + endMin!;

      return barMinutes >= startMinutes && barMinutes < endMinutes;
    });
  }

  private formatOutput(output: any, format?: string): any {
    switch (format) {
      case 'json':
        return JSON.stringify(output, null, 2);

      case 'table':
        return this.formatAsTable(output);

      case 'text':
      default:
        return this.formatAsText(output);
    }
  }

  private formatAsText(output: any): string {
    const lines: string[] = [];

    lines.push(`Daily Analysis: ${output.symbol} - ${output.date}`);
    lines.push('=' .repeat(50));
    lines.push('');

    // Bias Analysis
    lines.push('Market Bias:');
    lines.push(`  Direction: ${output.analysis.bias.direction}`);
    lines.push(`  Strength: ${output.analysis.bias.strength || 'N/A'}`);
    lines.push(`  Confidence: ${output.analysis.bias.confidence || 'N/A'}`);

    if (output.analysis.bias.keyLevels) {
      lines.push('  Key Levels:');
      for (const [key, value] of Object.entries(output.analysis.bias.keyLevels)) {
        lines.push(`    ${key}: ${value}`);
      }
    }

    lines.push('');

    // Profile Analysis
    lines.push('Day Profile:');
    lines.push(`  Type: ${output.analysis.profile.type}`);

    if (output.analysis.profile.characteristics) {
      lines.push('  Characteristics:');
      for (const char of output.analysis.profile.characteristics) {
        lines.push(`    - ${char}`);
      }
    }

    lines.push('');

    // Session Analysis
    if (output.analysis.sessions && output.analysis.sessions.length > 0) {
      lines.push('Session Extremes:');
      for (const session of output.analysis.sessions) {
        lines.push(`  ${session.name}:`);
        lines.push(`    High: ${session.high?.toFixed(2) || 'N/A'}`);
        lines.push(`    Low: ${session.low?.toFixed(2) || 'N/A'}`);
        lines.push(`    Range: ${session.range?.toFixed(2) || 'N/A'}`);
      }
    }

    lines.push('');

    // Statistics
    lines.push('Statistics:');
    lines.push(`  Bars Analyzed: ${output.statistics.barsAnalyzed}`);
    lines.push(`  Day High: ${output.statistics.range.high.toFixed(2)}`);
    lines.push(`  Day Low: ${output.statistics.range.low.toFixed(2)}`);
    lines.push(`  Close: ${output.statistics.range.close.toFixed(2)}`);

    return lines.join('\n');
  }

  private formatAsTable(output: any): string {
    // Simplified table format
    const lines: string[] = [];

    lines.push('┌────────────────┬────────────────────────┐');
    lines.push('│ Metric         │ Value                  │');
    lines.push('├────────────────┼────────────────────────┤');
    lines.push(`│ Symbol         │ ${output.symbol.padEnd(22)} │`);
    lines.push(`│ Date           │ ${output.date.padEnd(22)} │`);
    lines.push(`│ Bias           │ ${output.analysis.bias.direction.padEnd(22)} │`);
    lines.push(`│ Profile        │ ${output.analysis.profile.type.padEnd(22)} │`);
    lines.push(`│ Bars           │ ${String(output.statistics.barsAnalyzed).padEnd(22)} │`);
    lines.push('└────────────────┴────────────────────────┘');

    return lines.join('\n');
  }
}