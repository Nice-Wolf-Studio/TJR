/**
 * TJR Execution Command
 *
 * Displays execution recommendations including:
 * - 5-minute confirmation check
 * - 1-minute entry trigger
 * - Price levels (entry, stop, take profit)
 * - Position sizing
 * - Risk management
 */

import type { CommandOptions } from './types.js';
import type { UserConfig } from '../services/config/types.js';
import type { ExecutionReport, OutputFormat } from '../reports/types.js';
import { Timeframe } from '@tjr/contracts';
import { analyze, type TJRToolsResult } from '@tjr/tjr-tools';
import { BaseTJRCommand, type BaseTJRCommandConfig } from './base-tjr.command.js';
import { ExecutionFormatter } from '../formatters/execution-formatter.js';
import { TJRCommandError, TJRErrorCode, wrapError } from './errors.js';

/**
 * Parsed arguments for tjr-execution command
 */
interface ExecutionArgs {
  /** Trading symbol */
  symbol: string;
  /** Date for analysis (default: today) */
  date?: Date;
}

/**
 * /tjr-execution command - Trade execution recommendations
 *
 * Usage:
 *   tjr-execution <symbol>
 *
 * Examples:
 *   tjr-execution SPY
 *   tjr-execution ES
 *
 * Options:
 *   --format <text|json|table|markdown>  - Output format (default: text)
 *   --no-cache                           - Skip cache lookup
 *   --include-1m                         - Include 1-minute bars for entry trigger
 *   --risk <json>                        - Override risk configuration
 *   --verbose                            - Include detailed information
 */
export class TJRExecutionCommand extends BaseTJRCommand {
  readonly name = 'tjr-execution';
  readonly description = 'Generate trade execution recommendations with risk management';
  readonly aliases = ['execution', 'tjr-trade'];

  private formatter: ExecutionFormatter;

  constructor(config: BaseTJRCommandConfig) {
    super(config);
    this.formatter = new ExecutionFormatter();
  }

  /**
   * Parse and validate command arguments
   */
  protected async parseArgs(args: string[], options: CommandOptions): Promise<ExecutionArgs> {
    // Symbol is required
    const symbol = args[0] || '';
    this.validateRequired(symbol, 'symbol');

    // Date is optional (default: today)
    const date = options['date'] ? this.parseDate(options['date'] as string) : undefined;

    return {
      symbol: symbol.toUpperCase(),
      date,
    };
  }

  /**
   * Execute execution analysis
   */
  protected async executeCommand(
    parsedArgs: ExecutionArgs,
    options: CommandOptions,
    userConfig: UserConfig
  ): Promise<{ output: any; metadata?: Record<string, any> }> {
    const { symbol, date } = parsedArgs;

    // Get output format from options or user config
    const format = (options.format as OutputFormat) || userConfig.formatting.defaultFormat;
    const useCache = !options['noCache'] && userConfig.cache.enabled;
    const include1m = options['include1m'] || options['include-1m'];

    // Build cache key
    const cacheKey = this.buildCacheKey('execution', {
      symbol,
      date: date?.toISOString() || 'today',
      include1m: include1m ? 'true' : 'false',
      execution: JSON.stringify(userConfig.execution),
    });

    // Check cache if enabled
    if (useCache) {
      const cached = await this.getCached<ExecutionReport>(cacheKey);
      if (cached) {
        const output = this.formatter.format(cached, format);
        return {
          output,
          metadata: {
            cacheHit: true,
            symbol,
          },
        };
      }
    }

    // Fetch 5-minute bars for confirmation
    const bars5m = await this.fetchBars(symbol, Timeframe.M5, date);

    if (bars5m.length === 0) {
      throw new TJRCommandError(
        TJRErrorCode.MISSING_DATA,
        `No 5-minute market data available for ${symbol}`,
        { symbol, timeframe: 'M5', date: date?.toISOString() }
      );
    }

    // Fetch 1-minute bars if requested
    let bars1m: any[] | undefined;
    if (include1m) {
      bars1m = await this.fetchBars(symbol, Timeframe.M1, date);

      if (bars1m.length === 0) {
        this.logger.warn('No 1-minute bars available, proceeding without entry trigger', {
          symbol,
          date: date?.toISOString(),
        });
        bars1m = undefined;
      }
    }

    // Override risk config if provided in options
    let riskConfig = userConfig.risk;
    if (options['risk']) {
      try {
        const riskOverride = typeof options['risk'] === 'string'
          ? JSON.parse(options['risk'] as string)
          : options['risk'];
        riskConfig = { ...riskConfig, ...riskOverride };
      } catch (error) {
        throw new TJRCommandError(
          TJRErrorCode.INVALID_ARGS,
          'Invalid risk configuration JSON format',
          { risk: options['risk'] }
        );
      }
    }

    // Run TJR analysis with execution and risk configuration
    let analysisResult: TJRToolsResult;
    try {
      analysisResult = analyze(
        {
          symbol,
          timeframe: Timeframe.M5,
          bars: bars5m,
          analysisTimestamp: new Date().toISOString(),
        },
        {
          fvg: userConfig.confluence.fvg,
          orderBlock: userConfig.confluence.orderBlock,
          weights: userConfig.confluence.weights,
          enableFVG: true,
          enableOrderBlock: true,
          execution: userConfig.execution,
          bars1m,
          risk: riskConfig ? {
            symbol,
            entryPrice: 0, // Will be filled by analysis
            stopLoss: 0,   // Will be filled by analysis
            direction: 'long', // Will be filled by analysis
            currentTimestamp: new Date().toISOString(),
            config: riskConfig,
          } : undefined,
        }
      );
    } catch (error) {
      throw wrapError(error, TJRErrorCode.ANALYSIS_ERROR, { symbol });
    }

    // Transform to ExecutionReport
    const report = this.transformToReport(analysisResult, symbol, include1m);

    // Cache result if enabled
    if (useCache) {
      await this.setCached(cacheKey, report, userConfig.cache.ttl.execution);
    }

    // Format output
    const output = this.formatter.format(report, format);

    return {
      output,
      metadata: {
        cacheHit: false,
        symbol,
        bars5mAnalyzed: bars5m.length,
        bars1mAnalyzed: bars1m?.length,
        hasExecution: !!report.execution,
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

      this.logger.info('Fetching bars for execution analysis', {
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
   * Transform TJRToolsResult to ExecutionReport
   */
  private transformToReport(
    result: TJRToolsResult,
    symbol: string,
    include1m: boolean
  ): ExecutionReport {
    // Build confirmation result
    const confirmation = {
      confirmed: !!result.execution,
      confluenceScore: result.confluence.score,
      reason: result.execution
        ? `5m confluence score (${result.confluence.score.toFixed(1)}) meets threshold`
        : result.warnings[0] || 'Confluence score below threshold',
    };

    // Build entry trigger result (if available)
    let entryTrigger: ExecutionReport['entryTrigger'];
    if (include1m && result.execution) {
      entryTrigger = {
        triggered: true,
        entryPrice: result.execution.entryPrice,
        direction: result.execution.direction,
        reason: '1m entry trigger confirmed within confluence zones',
      };
    } else if (include1m && !result.execution) {
      entryTrigger = {
        triggered: false,
        reason: 'No 1m entry trigger detected',
      };
    }

    // Build execution parameters (if available)
    let execution: ExecutionReport['execution'];
    if (result.execution) {
      execution = {
        direction: result.execution.direction,
        entryPrice: result.execution.entryPrice,
        stopLoss: result.execution.stopLoss,
        takeProfit: result.execution.takeProfit,
        positionSize: result.execution.positionSize,
        riskAmount: Math.abs(result.execution.entryPrice - result.execution.stopLoss) * result.execution.positionSize,
        rewardAmount: Math.abs(result.execution.takeProfit - result.execution.entryPrice) * result.execution.positionSize,
        riskRewardRatio: result.execution.riskRewardRatio,
        confluenceFactors: result.confluence.factors.map(f => f.name),
      };
    }

    // Build risk management (if available)
    let riskManagement: ExecutionReport['riskManagement'];
    if (result.riskManagement) {
      riskManagement = {
        accountSize: result.riskManagement.positionSize.positionValue,
        maxRiskPerTrade: result.riskManagement.positionSize.percentRisk,
        maxRiskAmount: result.riskManagement.positionSize.dollarRisk,
        positionSize: result.riskManagement.positionSize.shares,
        dailyLossLimit: result.riskManagement.dailyStop.currentLoss + result.riskManagement.dailyStop.remainingCapacity,
        dailyLossUsed: result.riskManagement.dailyStop.currentLoss,
        canTakeNewTrade: result.riskManagement.recommendation.canTrade,
        partialExits: result.riskManagement.partialExits.map((exit) => ({
          percentage: exit.quantity / result.riskManagement!.positionSize.shares,
          price: exit.price,
          description: `Exit ${exit.quantity} shares at ${exit.rMultiple}R`,
        })),
      };
    }

    return {
      symbol,
      timestamp: new Date().toISOString(),
      confirmation,
      entryTrigger,
      execution,
      riskManagement,
      warnings: result.warnings,
      metadata: {
        bars5mAnalyzed: result.input.bars.length,
        bars1mAnalyzed: include1m ? result.input.bars.length : undefined,
        cacheHit: false,
      },
    };
  }
}