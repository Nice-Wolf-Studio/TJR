/**
 * TJR Confluences Command
 *
 * Displays confluence analysis including:
 * - Fair Value Gap (FVG) detection
 * - Order Block detection
 * - Weighted confluence scoring
 * - Zone overlap analysis
 */

import type { CommandOptions } from './types.js';
import type { UserConfig } from '../services/config/types.js';
import type { ConfluenceReport, OutputFormat } from '../reports/types.js';
import { Timeframe } from '@tjr/contracts';
import { analyze, type TJRToolsResult } from '@tjr/tjr-tools';
import { BaseTJRCommand, type BaseTJRCommandConfig } from './base-tjr.command.js';
import { ConfluenceFormatter } from '../formatters/confluence-formatter.js';
import { TJRCommandError, TJRErrorCode, wrapError } from './errors.js';

/**
 * Parsed arguments for tjr-confluences command
 */
interface ConfluencesArgs {
  /** Trading symbol */
  symbol: string;
  /** Timeframe (default: M5) */
  timeframe: Timeframe;
  /** Date for analysis (default: today) */
  date?: Date;
}

/**
 * /tjr-confluences command - Confluence analysis and scoring
 *
 * Usage:
 *   tjr-confluences <symbol> [timeframe]
 *
 * Examples:
 *   tjr-confluences SPY
 *   tjr-confluences SPY M5
 *   tjr-confluences ES M15
 *
 * Options:
 *   --format <text|json|table|markdown>  - Output format (default: text)
 *   --no-cache                           - Skip cache lookup
 *   --weights <json>                     - Override confluence weights
 *   --verbose                            - Include detailed information
 */
export class TJRConfluencesCommand extends BaseTJRCommand {
  readonly name = 'tjr-confluences';
  readonly description = 'Analyze TJR confluences (FVG, Order Blocks, scoring)';
  readonly aliases = ['confluences', 'tjr-zones'];

  private formatter: ConfluenceFormatter;

  constructor(config: BaseTJRCommandConfig) {
    super(config);
    this.formatter = new ConfluenceFormatter();
  }

  /**
   * Parse and validate command arguments
   */
  protected async parseArgs(args: string[], options: CommandOptions): Promise<ConfluencesArgs> {
    // Symbol is required
    const symbol = args[0] || '';
    this.validateRequired(symbol, 'symbol');

    // Timeframe is optional (default: M5)
    const timeframeStr = args[1] || 'M5';
    const timeframe = this.parseTimeframe(timeframeStr);

    // Date is optional (default: today)
    const date = options['date'] ? this.parseDate(options['date'] as string) : undefined;

    return {
      symbol: symbol.toUpperCase(),
      timeframe,
      date,
    };
  }

  /**
   * Execute confluence analysis
   */
  protected async executeCommand(
    parsedArgs: ConfluencesArgs,
    options: CommandOptions,
    userConfig: UserConfig
  ): Promise<{ output: any; metadata?: Record<string, any> }> {
    const { symbol, timeframe, date } = parsedArgs;

    // Get output format from options or user config
    const format = (options.format as OutputFormat) || userConfig.formatting.defaultFormat;
    const useCache = !options['noCache'] && userConfig.cache.enabled;

    // Build cache key
    const cacheKey = this.buildCacheKey('confluences', {
      symbol,
      timeframe,
      date: date?.toISOString() || 'today',
      weights: JSON.stringify(userConfig.confluence.weights),
    });

    // Check cache if enabled
    if (useCache) {
      const cached = await this.getCached<ConfluenceReport>(cacheKey);
      if (cached) {
        const output = this.formatter.format(cached, format);
        return {
          output,
          metadata: {
            cacheHit: true,
            symbol,
            timeframe,
          },
        };
      }
    }

    // Fetch market data
    const bars = await this.fetchBars(symbol, timeframe, date);

    if (bars.length === 0) {
      throw new TJRCommandError(
        TJRErrorCode.MISSING_DATA,
        `No market data available for ${symbol} on ${timeframe}`,
        { symbol, timeframe, date: date?.toISOString() }
      );
    }

    // Override weights if provided in options
    let weights = userConfig.confluence.weights;
    if (options['weights']) {
      try {
        weights = typeof options['weights'] === 'string'
          ? JSON.parse(options['weights'] as string)
          : options['weights'];
      } catch (error) {
        throw new TJRCommandError(
          TJRErrorCode.INVALID_ARGS,
          'Invalid weights JSON format',
          { weights: options['weights'] }
        );
      }
    }

    // Run TJR analysis
    let analysisResult: TJRToolsResult;
    try {
      analysisResult = analyze(
        {
          symbol,
          timeframe,
          bars,
          timestamp: new Date().toISOString(),
        },
        {
          fvg: userConfig.confluence.fvg,
          orderBlock: userConfig.confluence.orderBlock,
          weights,
          enableFVG: true,
          enableOrderBlock: true,
        }
      );
    } catch (error) {
      throw wrapError(error, TJRErrorCode.ANALYSIS_ERROR, { symbol, timeframe });
    }

    // Transform to ConfluenceReport
    const report = this.transformToReport(analysisResult, symbol, timeframe);

    // Cache result if enabled
    if (useCache) {
      await this.setCached(cacheKey, report, userConfig.cache.ttl.confluence);
    }

    // Format output
    const output = this.formatter.format(report, format);

    return {
      output,
      metadata: {
        cacheHit: false,
        symbol,
        timeframe,
        barsAnalyzed: bars.length,
        confluenceScore: report.confluenceScore,
      },
    };
  }

  /**
   * Fetch market bars for analysis
   */
  private async fetchBars(
    symbol: string,
    timeframe: Timeframe,
    date?: Date
  ): Promise<any[]> {
    try {
      // Determine date range
      const targetDate = date || new Date();

      // For intraday timeframes, fetch trading day
      // For SPY: 9:30 AM - 4:00 PM ET
      const from = new Date(targetDate);
      from.setHours(9, 30, 0, 0);

      const to = new Date(targetDate);
      to.setHours(16, 0, 0, 0);

      this.logger.info('Fetching bars for confluence analysis', {
        symbol,
        timeframe,
        from: from.toISOString(),
        to: to.toISOString(),
      });

      // Fetch bars from provider
      const bars = await this.providerService.getBars({
        symbol,
        timeframe,
        from: from.toISOString(),
        to: to.toISOString(),
      });

      this.logger.info('Fetched bars for analysis', {
        symbol,
        timeframe,
        count: bars.length,
      });

      return bars;
    } catch (error) {
      throw wrapError(error, TJRErrorCode.PROVIDER_ERROR, { symbol, timeframe });
    }
  }

  /**
   * Transform TJRToolsResult to ConfluenceReport
   */
  private transformToReport(
    result: TJRToolsResult,
    symbol: string,
    timeframe: Timeframe
  ): ConfluenceReport {
    // Calculate overlaps between FVG zones and Order Blocks
    const overlaps = this.calculateOverlaps(result.fvgZones, result.orderBlocks);

    return {
      symbol,
      timeframe,
      timestamp: new Date().toISOString(),
      confluenceScore: result.confluence.score,
      factors: result.confluence.factors,
      fvgZones: result.fvgZones,
      orderBlocks: result.orderBlocks,
      overlaps,
      warnings: result.warnings,
      metadata: {
        barsAnalyzed: result.input.bars.length,
        cacheHit: false,
      },
    };
  }

  /**
   * Calculate overlaps between FVG zones and Order Blocks
   */
  private calculateOverlaps(fvgZones: any[], orderBlocks: any[]): Array<{
    fvgIndex: number;
    orderBlockIndex: number;
    overlapHigh: number;
    overlapLow: number;
    overlapSize: number;
  }> {
    const overlaps: Array<{
      fvgIndex: number;
      orderBlockIndex: number;
      overlapHigh: number;
      overlapLow: number;
      overlapSize: number;
    }> = [];

    // Only check unfilled FVGs and unmitigated OBs
    const unfilledFVGs = fvgZones.filter(z => !z.filled);
    const unmitigatedOBs = orderBlocks.filter(b => !b.mitigated);

    for (let i = 0; i < unfilledFVGs.length; i++) {
      const fvg = unfilledFVGs[i];
      for (let j = 0; j < unmitigatedOBs.length; j++) {
        const ob = unmitigatedOBs[j];

        // Check for overlap
        if (fvg.low <= ob.high && fvg.high >= ob.low) {
          const overlapHigh = Math.min(fvg.high, ob.high);
          const overlapLow = Math.max(fvg.low, ob.low);
          const overlapSize = overlapHigh - overlapLow;

          overlaps.push({
            fvgIndex: fvgZones.indexOf(fvg),
            orderBlockIndex: orderBlocks.indexOf(ob),
            overlapHigh,
            overlapLow,
            overlapSize,
          });
        }
      }
    }

    return overlaps;
  }

  /**
   * Parse timeframe string to Timeframe enum
   */
  private parseTimeframe(timeframeStr: string): Timeframe {
    const upper = timeframeStr.toUpperCase();

    // Map common formats
    const timeframeMap: Record<string, Timeframe> = {
      '1M': Timeframe.M1,
      'M1': Timeframe.M1,
      '5M': Timeframe.M5,
      'M5': Timeframe.M5,
      '1H': Timeframe.H1,
      'H1': Timeframe.H1,
      '4H': Timeframe.H4,
      'H4': Timeframe.H4,
      '1D': Timeframe.D1,
      'D1': Timeframe.D1,
    };

    const timeframe = timeframeMap[upper];
    if (!timeframe) {
      throw new TJRCommandError(
        TJRErrorCode.INVALID_ARGS,
        `Invalid timeframe: ${timeframeStr}. Supported: 1M, 5M, 1H, 4H, 1D`,
        { timeframe: timeframeStr }
      );
    }

    return timeframe;
  }
}