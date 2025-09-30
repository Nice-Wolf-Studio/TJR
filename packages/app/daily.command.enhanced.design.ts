/**
 * Enhanced Daily Command Implementation Design
 *
 * This file shows the complete enhanced implementation of the daily command
 * with all the production features integrated.
 */

import type { Command, CommandOptions, CommandResult } from './types.js';
import type { Logger } from '@tjr/logger';
import type { MarketBar } from '@tjr/contracts';
import type { CacheService } from '../services/cache/types.js';
import type { CompositeProvider } from '../services/providers/composite-provider.js';
import type { DailyFormatter, DailyAnalysis, FormatterOptions } from '../formatters/daily-formatter.js';
import { Timeframe } from '@tjr/contracts';
import { calculateDailyBias, classifyDayProfile, extractSessionExtremes } from '@tjr/analysis-kit';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Enhanced daily command configuration
 */
export interface EnhancedDailyCommandConfig {
  compositeProvider: CompositeProvider;
  cache: CacheService;
  formatter: DailyFormatter;
  logger: Logger;

  // Command-specific settings
  settings: {
    defaultSymbol: string;
    defaultFormat: 'text' | 'json' | 'table' | 'markdown';
    cacheTTL: {
      historical: number; // ms
      realtime: number;   // ms
    };
    sessions: SessionDefinition[];
    errorHandling: {
      allowPartialResults: boolean;
      fallbackToCache: boolean;
      maxRetries: number;
    };
  };
}

/**
 * Session definition for analysis
 */
export interface SessionDefinition {
  name: string;
  start: string; // HH:MM format
  end: string;   // HH:MM format
  required?: boolean;
}

/**
 * Analysis request parsed from command args
 */
export interface AnalysisRequest {
  symbol: string;
  date: Date;
  format: string;
  force: boolean; // Force refresh, ignore cache
  verbose: boolean;
  metadata: boolean;
}

// ============================================================================
// Enhanced Daily Command Implementation
// ============================================================================

/**
 * Production-ready /daily command with full feature set
 */
export class EnhancedDailyCommand implements Command {
  name = 'daily';
  description = 'Analyze daily market structure and bias with production reliability';
  aliases = ['analyze', 'bias', 'd'];

  private compositeProvider: CompositeProvider;
  private cache: CacheService;
  private formatter: DailyFormatter;
  private logger: Logger;
  private settings: EnhancedDailyCommandConfig['settings'];

  constructor(config: EnhancedDailyCommandConfig) {
    this.compositeProvider = config.compositeProvider;
    this.cache = config.cache;
    this.formatter = config.formatter;
    this.logger = config.logger;
    this.settings = config.settings;
  }

  /**
   * Execute the daily command
   */
  async execute(args: string[], options: CommandOptions): Promise<CommandResult> {
    const startTime = Date.now();

    try {
      // 1. Parse and validate request
      const request = this.parseRequest(args, options);

      this.logger.info('Executing daily command', {
        symbol: request.symbol,
        date: request.date.toISOString(),
        format: request.format,
        force: request.force
      });

      // 2. Build cache key
      const cacheKey = this.buildCacheKey(request);

      // 3. Check cache (unless forced refresh)
      if (!request.force) {
        const cached = await this.checkCache(cacheKey);
        if (cached) {
          this.logger.info('Cache hit for daily analysis', { cacheKey });

          const formatted = this.formatter.format(cached, {
            format: request.format as any,
            verbose: request.verbose,
            includeMetadata: request.metadata
          });

          return {
            success: true,
            output: formatted,
            duration: Date.now() - startTime,
            metadata: {
              symbol: request.symbol,
              date: request.date.toISOString(),
              cached: true
            }
          };
        }
      }

      // 4. Fetch market data using composite provider
      const bars = await this.fetchBarsWithFallback(request);

      if (!bars || bars.length === 0) {
        // Handle no data scenario
        return this.handleNoData(request, startTime);
      }

      // 5. Run analysis pipeline
      const analysis = await this.runFullAnalysis(request, bars);

      // 6. Cache the result
      await this.cacheResult(cacheKey, analysis, request);

      // 7. Format output
      const formatted = this.formatter.format(analysis, {
        format: request.format as any,
        verbose: request.verbose,
        includeMetadata: request.metadata
      });

      return {
        success: true,
        output: formatted,
        duration: Date.now() - startTime,
        metadata: {
          symbol: request.symbol,
          date: request.date.toISOString(),
          barsAnalyzed: bars.length,
          cached: false
        }
      };

    } catch (error) {
      return this.handleError(error, args, options, startTime);
    }
  }

  // ============================================================================
  // Core Processing Methods
  // ============================================================================

  /**
   * Parse command arguments into structured request
   */
  private parseRequest(args: string[], options: CommandOptions): AnalysisRequest {
    // Parse symbol (first arg or default)
    const symbol = args[0]?.toUpperCase() || this.settings.defaultSymbol;

    // Parse date (second arg or today)
    let date: Date;
    if (args[1]) {
      date = new Date(args[1]);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date: ${args[1]}`);
      }
    } else {
      date = new Date();
    }

    // Normalize to start of day
    date.setHours(0, 0, 0, 0);

    return {
      symbol,
      date,
      format: options.format || this.settings.defaultFormat,
      force: options.force || false,
      verbose: options.verbose || false,
      metadata: options.metadata || false
    };
  }

  /**
   * Build deterministic cache key
   */
  private buildCacheKey(request: AnalysisRequest): string {
    const dateStr = request.date.toISOString().split('T')[0];
    return `daily:${request.symbol}:${dateStr}:v1`;
  }

  /**
   * Check cache for existing analysis
   */
  private async checkCache(key: string): Promise<DailyAnalysis | null> {
    try {
      return await this.cache.get<DailyAnalysis>(key);
    } catch (error) {
      this.logger.warn('Cache check failed', {
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Fetch market bars with composite provider fallback
   */
  private async fetchBarsWithFallback(request: AnalysisRequest): Promise<MarketBar[]> {
    // Build time range for trading day
    const from = new Date(request.date);
    from.setHours(9, 30, 0, 0); // Market open

    const to = new Date(request.date);
    to.setHours(16, 0, 0, 0); // Market close

    try {
      const bars = await this.compositeProvider.getBars({
        symbol: request.symbol,
        timeframe: Timeframe.M5,
        from: from.toISOString(),
        to: to.toISOString()
      });

      this.logger.info('Fetched bars successfully', {
        symbol: request.symbol,
        date: request.date.toISOString(),
        count: bars.length
      });

      return bars;

    } catch (error) {
      this.logger.error('Failed to fetch bars from all providers', {
        symbol: request.symbol,
        date: request.date.toISOString(),
        error: error instanceof Error ? error.message : String(error)
      });

      // If allowed, try to use stale cache data
      if (this.settings.errorHandling.fallbackToCache) {
        const cacheKey = this.buildCacheKey(request);
        const staleCache = await this.cache.get<DailyAnalysis>(cacheKey);

        if (staleCache) {
          this.logger.warn('Using stale cache data due to provider failure');
          throw new Error('STALE_CACHE_AVAILABLE');
        }
      }

      throw error;
    }
  }

  /**
   * Run complete analysis pipeline
   */
  private async runFullAnalysis(
    request: AnalysisRequest,
    bars: MarketBar[]
  ): Promise<DailyAnalysis> {
    const analysisStart = Date.now();

    // Convert to analysis-kit format
    const analysisBars = bars.map(bar => ({
      timestamp: new Date(bar.timestamp).getTime(),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume
    }));

    // Calculate session extremes
    const sessionExtremes = {
      rthOpen: analysisBars[0]?.open ?? 0,
      rthClose: analysisBars[analysisBars.length - 1]?.close ?? 0,
      rthHigh: Math.max(...analysisBars.map(b => b.high)),
      rthLow: Math.min(...analysisBars.map(b => b.low))
    };

    // Run parallel analysis
    const [bias, profile, sessions] = await Promise.allSettled([
      this.analyzeBias(analysisBars, sessionExtremes),
      this.analyzeProfile(analysisBars, sessionExtremes),
      this.analyzeSessions(analysisBars, request.date)
    ]);

    // Handle partial results if allowed
    const biasResult = bias.status === 'fulfilled' ? bias.value : this.getDefaultBias();
    const profileResult = profile.status === 'fulfilled' ? profile.value : this.getDefaultProfile();
    const sessionsResult = sessions.status === 'fulfilled' ? sessions.value : [];

    // Log any failures
    if (bias.status === 'rejected') {
      this.logger.warn('Bias analysis failed', { error: bias.reason });
    }
    if (profile.status === 'rejected') {
      this.logger.warn('Profile analysis failed', { error: profile.reason });
    }
    if (sessions.status === 'rejected') {
      this.logger.warn('Session analysis failed', { error: sessions.reason });
    }

    // Calculate statistics
    const statistics = this.calculateStatistics(bars);

    // Build complete analysis result
    const analysis: DailyAnalysis = {
      symbol: request.symbol,
      date: request.date.toISOString().split('T')[0],
      bias: biasResult,
      profile: profileResult,
      sessions: sessionsResult,
      statistics,
      metadata: {
        analysisVersion: '1.0.0',
        timestamp: new Date().toISOString(),
        provider: this.compositeProvider.name,
        cached: false,
        processingTimeMs: Date.now() - analysisStart
      }
    };

    return analysis;
  }

  /**
   * Cache analysis result with appropriate TTL
   */
  private async cacheResult(
    key: string,
    analysis: DailyAnalysis,
    request: AnalysisRequest
  ): Promise<void> {
    try {
      const ttl = this.calculateCacheTTL(request);
      await this.cache.set(key, analysis, ttl);

      this.logger.debug('Cached analysis result', {
        key,
        ttl,
        symbol: analysis.symbol,
        date: analysis.date
      });
    } catch (error) {
      // Cache failure is not critical
      this.logger.warn('Failed to cache analysis', {
        key,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Calculate appropriate cache TTL
   */
  private calculateCacheTTL(request: AnalysisRequest): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const requestDate = new Date(request.date);
    requestDate.setHours(0, 0, 0, 0);

    // Historical data can be cached longer
    if (requestDate < now) {
      return this.settings.cacheTTL.historical;
    }

    // Today's data needs shorter TTL
    return this.settings.cacheTTL.realtime;
  }

  // ============================================================================
  // Analysis Methods
  // ============================================================================

  /**
   * Analyze market bias
   */
  private async analyzeBias(bars: any[], sessionExtremes: any): Promise<any> {
    const result = calculateDailyBias(bars, sessionExtremes);

    // Map to our format
    return {
      direction: result.bias,
      confidence: result.confidence,
      strength: this.mapStrength(result.confidence),
      reason: result.reason,
      keyLevels: result.keyLevels
    };
  }

  /**
   * Analyze day profile
   */
  private async analyzeProfile(bars: any[], sessionExtremes: any): Promise<any> {
    const result = classifyDayProfile(bars, sessionExtremes);

    return {
      type: result.type,
      characteristics: result.characteristics,
      volatility: result.volatility,
      trendStrength: result.trendStrength
    };
  }

  /**
   * Analyze trading sessions
   */
  private async analyzeSessions(bars: any[], date: Date): Promise<any[]> {
    const results: any[] = [];

    for (const session of this.settings.sessions) {
      const sessionBars = this.filterBarsBySession(bars, session, date);

      if (sessionBars.length > 0) {
        const extremes = this.calculateSessionExtremes(sessionBars);

        results.push({
          name: session.name,
          high: extremes.high,
          low: extremes.low,
          open: extremes.open,
          close: extremes.close,
          range: extremes.high - extremes.low,
          volume: extremes.totalVolume,
          barCount: sessionBars.length,
          timeRange: {
            start: session.start,
            end: session.end
          }
        });
      } else if (session.required) {
        // Add placeholder for required sessions
        results.push({
          name: session.name,
          high: 0,
          low: 0,
          range: 0,
          barCount: 0,
          timeRange: {
            start: session.start,
            end: session.end
          }
        });
      }
    }

    return results;
  }

  /**
   * Calculate statistics from bars
   */
  private calculateStatistics(bars: MarketBar[]): any {
    const highs = bars.map(b => b.high);
    const lows = bars.map(b => b.low);
    const volumes = bars.map(b => b.volume);

    return {
      barsAnalyzed: bars.length,
      timeframe: '5m',
      range: {
        high: Math.max(...highs),
        low: Math.min(...lows),
        open: bars[0]?.open,
        close: bars[bars.length - 1]?.close
      },
      volume: {
        total: volumes.reduce((a, b) => a + b, 0),
        average: volumes.reduce((a, b) => a + b, 0) / volumes.length
      },
      dataQuality: {
        gaps: this.detectGaps(bars),
        missingBars: this.detectMissingBars(bars)
      }
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Filter bars by session time
   */
  private filterBarsBySession(bars: any[], session: SessionDefinition, date: Date): any[] {
    const [startHour, startMin] = session.start.split(':').map(Number);
    const [endHour, endMin] = session.end.split(':').map(Number);

    return bars.filter(bar => {
      const barTime = new Date(bar.timestamp);
      const minutes = barTime.getHours() * 60 + barTime.getMinutes();
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      return minutes >= startMinutes && minutes < endMinutes;
    });
  }

  /**
   * Calculate session extremes
   */
  private calculateSessionExtremes(bars: any[]): any {
    return {
      high: Math.max(...bars.map(b => b.high)),
      low: Math.min(...bars.map(b => b.low)),
      open: bars[0]?.open || 0,
      close: bars[bars.length - 1]?.close || 0,
      totalVolume: bars.reduce((sum, b) => sum + (b.volume || 0), 0)
    };
  }

  /**
   * Map confidence to strength
   */
  private mapStrength(confidence: number): string {
    if (confidence >= 75) return 'STRONG';
    if (confidence >= 50) return 'MODERATE';
    return 'WEAK';
  }

  /**
   * Detect gaps in data
   */
  private detectGaps(bars: MarketBar[]): number {
    let gaps = 0;
    for (let i = 1; i < bars.length; i++) {
      const prevTime = new Date(bars[i - 1].timestamp).getTime();
      const currTime = new Date(bars[i].timestamp).getTime();
      const expectedInterval = 5 * 60 * 1000; // 5 minutes

      if (currTime - prevTime > expectedInterval * 1.5) {
        gaps++;
      }
    }
    return gaps;
  }

  /**
   * Detect missing bars
   */
  private detectMissingBars(bars: MarketBar[]): number {
    if (bars.length === 0) return 0;

    const first = new Date(bars[0].timestamp);
    const last = new Date(bars[bars.length - 1].timestamp);
    const rangeMinutes = (last.getTime() - first.getTime()) / 60000;
    const expectedBars = Math.floor(rangeMinutes / 5) + 1;

    return Math.max(0, expectedBars - bars.length);
  }

  /**
   * Get default bias when analysis fails
   */
  private getDefaultBias(): any {
    return {
      direction: 'NEUTRAL',
      confidence: 0,
      strength: 'WEAK',
      reason: 'Analysis unavailable'
    };
  }

  /**
   * Get default profile when analysis fails
   */
  private getDefaultProfile(): any {
    return {
      type: 'UNKNOWN',
      characteristics: ['Analysis unavailable'],
      volatility: 0
    };
  }

  // ============================================================================
  // Error Handling
  // ============================================================================

  /**
   * Handle no data scenario
   */
  private handleNoData(request: AnalysisRequest, startTime: number): CommandResult {
    this.logger.warn('No data available for analysis', {
      symbol: request.symbol,
      date: request.date.toISOString()
    });

    const message = `No market data available for ${request.symbol} on ${request.date.toISOString().split('T')[0]}`;

    return {
      success: false,
      output: message,
      duration: Date.now() - startTime,
      metadata: {
        symbol: request.symbol,
        date: request.date.toISOString(),
        error: 'NO_DATA'
      }
    };
  }

  /**
   * Handle command errors
   */
  private handleError(
    error: any,
    args: string[],
    options: CommandOptions,
    startTime: number
  ): CommandResult {
    this.logger.error('Daily command failed', {
      args,
      options,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    // Check for special error cases
    if (error?.message === 'STALE_CACHE_AVAILABLE') {
      return {
        success: false,
        output: 'Data providers unavailable, stale cache data exists',
        error: error,
        duration: Date.now() - startTime
      };
    }

    return {
      success: false,
      output: null,
      error: error instanceof Error ? error : new Error(String(error)),
      duration: Date.now() - startTime
    };
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default sessions for US equity markets
 */
export const DEFAULT_SESSIONS: SessionDefinition[] = [
  { name: 'Pre-Market', start: '04:00', end: '09:30' },
  { name: 'Morning', start: '09:30', end: '11:30', required: true },
  { name: 'Lunch', start: '11:30', end: '13:30', required: true },
  { name: 'Afternoon', start: '13:30', end: '15:30', required: true },
  { name: 'Close', start: '15:30', end: '16:00', required: true },
  { name: 'After-Hours', start: '16:00', end: '20:00' }
];

/**
 * Default command settings
 */
export const DEFAULT_SETTINGS = {
  defaultSymbol: 'SPY',
  defaultFormat: 'text' as const,
  cacheTTL: {
    historical: 86400000,  // 24 hours
    realtime: 300000       // 5 minutes
  },
  sessions: DEFAULT_SESSIONS,
  errorHandling: {
    allowPartialResults: true,
    fallbackToCache: true,
    maxRetries: 3
  }
};