/**
 * Daily analysis command implementation
 */

import type { Command, CommandOptions, CommandResult } from './types.js';
import type { Logger } from '@tjr/logger';
import type { MarketBar } from '@tjr/contracts';
import { Timeframe } from '@tjr/contracts';
import { calculateDailyBias, classifyDayProfile, extractSessionExtremes } from '@tjr/analysis-kit';
import type { ProviderService } from '../services/providers/types.js';
import type { CacheService } from '../services/cache/types.js';
import { DailyFormatter, type DailyAnalysisReport, type OutputFormat } from '../formatters/daily-formatter.js';
import { sanitizeError } from '../utils/error-sanitizer.js';

export interface DailyCommandConfig {
  providerService: ProviderService;
  cacheService?: CacheService;
  logger: Logger;
  cacheEnabled?: boolean;
  includeMetadata?: boolean;
}

/**
 * /daily command - performs daily market analysis using analysis-kit
 */
export class DailyCommand implements Command {
  name = 'daily';
  description = 'Analyze daily market structure and bias';
  aliases = ['analyze', 'bias'];

  private providerService: ProviderService;
  private cacheService?: CacheService;
  private logger: Logger;
  private formatter: DailyFormatter;
  private cacheEnabled: boolean;
  private includeMetadata: boolean;

  constructor(config: DailyCommandConfig) {
    this.providerService = config.providerService;
    this.cacheService = config.cacheService;
    this.logger = config.logger;
    this.formatter = new DailyFormatter();
    this.cacheEnabled = config.cacheEnabled ?? true;
    this.includeMetadata = config.includeMetadata ?? false;
  }

  async execute(args: string[], options: CommandOptions): Promise<CommandResult> {
    const startTime = Date.now();

    try {
      // Parse arguments
      const symbol = args[0] || 'SPY';
      const date = args[1] ? new Date(args[1]) : new Date();
      const format = (options.format as OutputFormat) || 'text';

      this.logger.info('Executing daily command', {
        symbol,
        date: date.toISOString(),
        format,
        options
      });

      // Check cache first if enabled
      const cacheKey = this.buildCacheKey(symbol, date, 'analysis');
      if (this.cacheEnabled && this.cacheService) {
        const cached = await this.cacheService.get<DailyAnalysisReport>(cacheKey);
        if (cached) {
          this.logger.debug('Cache hit for daily analysis', { symbol, date: date.toISOString() });

          // Update metadata if included
          if (this.includeMetadata) {
            cached.metadata = {
              ...cached.metadata,
              cacheHit: true,
              latencyMs: Date.now() - startTime
            };
          }

          const formattedOutput = this.formatter.format(cached, format);
          return {
            success: true,
            output: formattedOutput,
            duration: Date.now() - startTime,
            metadata: {
              symbol,
              date: date.toISOString(),
              cacheHit: true
            }
          };
        }
      }

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

      // Build analysis report
      const report: DailyAnalysisReport = {
        symbol,
        date: date.toISOString().split('T')[0] ?? '',
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

      // Add metadata if requested
      if (this.includeMetadata) {
        report.metadata = {
          provider: 'composite',
          cacheHit: false,
          latencyMs: Date.now() - startTime
        };
      }

      // Cache the report if enabled
      if (this.cacheEnabled && this.cacheService) {
        const cacheTTL = this.selectCacheTTL(date);
        await this.cacheService.set(cacheKey, report, cacheTTL);
        this.logger.debug('Cached analysis report', {
          key: cacheKey,
          ttl: cacheTTL
        });
      }

      // Format output
      const formattedOutput = this.formatter.format(report, format);

      return {
        success: true,
        output: formattedOutput,
        duration: Date.now() - startTime,
        metadata: {
          symbol,
          date: date.toISOString(),
          barsAnalyzed: bars.length,
          cacheHit: false
        }
      };
    } catch (error) {
      this.logger.error('Daily command failed', { error: sanitizeError(error, options.verbose) });

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

    // Set date range for full trading day (US Eastern Time)
    // Create a new date at start of day, then add hours for market times
    const from = new Date(date);
    from.setHours(9, 30, 0, 0); // Market open (9:30 AM local)

    const to = new Date(date);
    to.setHours(16, 0, 0, 0); // Market close (4:00 PM local)

    this.logger.info('Fetching bars for date range', {
      symbol,
      from: from.toISOString(),
      to: to.toISOString()
    });

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
        direction: typeof result.bias === 'string' ? result.bias.toUpperCase() : result.bias,
        confidence: result.confidence,
        reason: result.reason
      };
    } catch (error) {
      this.logger.warn('Bias analysis failed', { error: sanitizeError(error) });
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

  /**
   * Build deterministic cache key
   */
  private buildCacheKey(symbol: string, date: Date, type: string): string {
    const dateStr = date.toISOString().split('T')[0];
    return `daily:${symbol}:${dateStr}:${type}:v1`;
  }

  /**
   * Select cache TTL based on data recency
   */
  private selectCacheTTL(date: Date): number {
    const now = new Date();
    const daysDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);

    // Historical data (>2 days old) gets longer TTL
    if (daysDiff > 2) {
      return 3600000; // 1 hour
    }

    // Recent data gets shorter TTL
    return 60000; // 1 minute
  }
}