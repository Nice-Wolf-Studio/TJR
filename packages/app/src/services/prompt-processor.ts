/**
 * Prompt processor service
 * Processes natural language prompts and routes them to appropriate handlers
 */

import type { Logger } from '@tjr/logger';
import { calculateDailyBias } from '@tjr/analysis-kit';
import { extractSessionExtremes } from '@tjr/analysis-kit';
import type { Bar, SessionExtremes } from '@tjr/analysis-kit';
import { getQuote, getRecentBars } from '@tjr/databento';

export interface PromptProcessorConfig {
  logger: Logger;
}

export interface PromptContext {
  userId?: string;
  channelId?: string;
}

/**
 * Service for processing natural language prompts
 */
export class PromptProcessor {
  private logger: Logger;

  constructor(config: PromptProcessorConfig) {
    this.logger = config.logger;
  }

  /**
   * Process a prompt and return a response
   */
  async process(prompt: string, context: PromptContext): Promise<string> {
    this.logger.info('Processing prompt', { prompt: prompt.substring(0, 100), context });

    const normalizedPrompt = prompt.toLowerCase().trim();

    // Detect intent from prompt
    if (this.matchesBiasIntent(normalizedPrompt)) {
      return await this.handleBiasQuery(normalizedPrompt, context);
    }

    if (this.matchesQuoteIntent(normalizedPrompt)) {
      return await this.handleQuoteQuery(normalizedPrompt, context);
    }

    if (this.matchesSessionIntent(normalizedPrompt)) {
      return await this.handleSessionQuery(normalizedPrompt, context);
    }

    // Default response
    return this.getDefaultResponse(prompt);
  }

  /**
   * Check if prompt is asking about bias
   */
  private matchesBiasIntent(prompt: string): boolean {
    const biasKeywords = ['bias', 'bullish', 'bearish', 'direction', 'trend'];
    return biasKeywords.some((keyword) => prompt.includes(keyword));
  }

  /**
   * Check if prompt is asking for a quote
   */
  private matchesQuoteIntent(prompt: string): boolean {
    const quoteKeywords = ['quote', 'price', 'current', 'what is', 'trading at'];
    return quoteKeywords.some((keyword) => prompt.includes(keyword));
  }

  /**
   * Check if prompt is asking about session info
   */
  private matchesSessionIntent(prompt: string): boolean {
    const sessionKeywords = ['session', 'asian', 'london', 'ny', 'new york', 'market hours'];
    return sessionKeywords.some((keyword) => prompt.includes(keyword));
  }

  /**
   * Extract symbol from prompt (defaults to ES)
   * Supports any valid futures symbol (ES, NQ, CL, GC, ZB, etc.)
   */
  private extractSymbol(prompt: string): string {
    // Common symbol mappings
    const symbolMappings: Record<string, string> = {
      'nasdaq': 'NQ',
      'nasdaq 100': 'NQ',
      'e-mini nasdaq': 'NQ',
      's&p': 'ES',
      's&p 500': 'ES',
      'e-mini s&p': 'ES',
      'crude': 'CL',
      'crude oil': 'CL',
      'oil': 'CL',
      'gold': 'GC',
      'bonds': 'ZB',
      'treasuries': 'ZB',
      '10-year': 'ZN',
      'euro': '6E',
      'eurodollar': '6E',
    };

    // Try to find symbol mappings first
    for (const [key, symbol] of Object.entries(symbolMappings)) {
      if (prompt.includes(key)) {
        return symbol;
      }
    }

    // Look for uppercase 2-3 letter symbols (ES, NQ, CL, GC, etc.)
    const symbolMatch = prompt.match(/\b([A-Z]{2,3})\b/);
    if (symbolMatch) {
      return symbolMatch[1];
    }

    // Default to ES if no symbol found
    return 'ES';
  }

  /**
   * Handle bias-related queries
   */
  private async handleBiasQuery(
    prompt: string,
    _context: PromptContext
  ): Promise<string> {
    try {
      const symbol = this.extractSymbol(prompt);

      this.logger.info('Fetching data for bias calculation', { symbol });

      // Fetch 24 hours of 1h bars from Databento
      const bars = await getRecentBars(symbol, '1h', 24);

      if (bars.length === 0) {
        this.logger.warn('No bars returned from Databento', { symbol });
        return `Sorry, no data available for ${symbol} at this time.`;
      }

      this.logger.info('Bars fetched from Databento', {
        symbol,
        barCount: bars.length,
        firstBar: bars[0]?.timestamp ? new Date(bars[0].timestamp).toISOString() : 'none',
        lastBar: bars[bars.length - 1]?.timestamp ? new Date(bars[bars.length - 1].timestamp).toISOString() : 'none',
      });

      // Convert Databento bars to analysis-kit format
      const analysisBars: Bar[] = bars.map((b) => ({
        timestamp: b.timestamp, // Already in Unix epoch milliseconds
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }));

      // Find the most recent RTH session within the bars we have
      // RTH hours: 13:30-20:00 UTC (9:30 AM - 4:00 PM ET)

      // Get the date of the last bar to find which trading day to use
      const lastBarDate = new Date(analysisBars[analysisBars.length - 1].timestamp);
      const lastBarDayUTC = new Date(Date.UTC(
        lastBarDate.getUTCFullYear(),
        lastBarDate.getUTCMonth(),
        lastBarDate.getUTCDate()
      ));

      // Try current day first, then work backwards to find an RTH session
      let rthWindow: { start: Date; end: Date } | null = null;

      for (let daysBack = 0; daysBack <= 3; daysBack++) {
        const candidateDate = new Date(lastBarDayUTC.getTime() - daysBack * 24 * 3600 * 1000);
        const candidateStart = new Date(candidateDate.getTime() + 13.5 * 3600 * 1000); // 13:30 UTC
        const candidateEnd = new Date(candidateDate.getTime() + 20 * 3600 * 1000); // 20:00 UTC

        // Check if any bars fall within this RTH window
        const barsInWindow = analysisBars.filter(
          (b) => b.timestamp >= candidateStart.getTime() && b.timestamp <= candidateEnd.getTime()
        );

        if (barsInWindow.length > 0) {
          rthWindow = { start: candidateStart, end: candidateEnd };
          this.logger.info('Found RTH session with data', {
            date: candidateDate.toISOString().split('T')[0],
            start: candidateStart.toISOString(),
            end: candidateEnd.toISOString(),
            barsInWindow: barsInWindow.length,
          });
          break;
        }
      }

      if (!rthWindow) {
        this.logger.warn('No RTH session found in available bars', {
          symbol,
          barDateRange: `${new Date(analysisBars[0].timestamp).toISOString()} to ${new Date(analysisBars[analysisBars.length - 1].timestamp).toISOString()}`,
        });
        return `Unable to calculate ${symbol} bias - no RTH session data in available bars.`;
      }

      // Extract session extremes
      const sessionExtremes = extractSessionExtremes(analysisBars, rthWindow);

      if (!sessionExtremes) {
        this.logger.info('No bars found in RTH window', { symbol, rthWindow });
        return `Unable to calculate ${symbol} bias - no RTH session data available.`;
      }

      // Calculate bias
      const biasResult = calculateDailyBias(analysisBars, sessionExtremes);

      this.logger.info('Bias query processed', { symbol, bias: biasResult.bias, confidence: biasResult.confidence });

      return formatBiasResult(biasResult, sessionExtremes, symbol);
    } catch (error) {
      this.logger.error('Error handling bias query', { error });
      return `Sorry, I encountered an error calculating the bias: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Handle quote-related queries
   */
  private async handleQuoteQuery(
    prompt: string,
    _context: PromptContext
  ): Promise<string> {
    try {
      const symbol = this.extractSymbol(prompt);

      this.logger.info('Fetching quote', { symbol });

      // Fetch live quote from Databento
      const quote = await getQuote(symbol);

      this.logger.info('Quote fetched', { symbol, price: quote.price, timestamp: quote.timestamp });

      return formatQuoteResult(symbol, quote.price, quote.timestamp);
    } catch (error) {
      this.logger.error('Error handling quote query', { error });
      return `Sorry, I encountered an error fetching the quote: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Handle session-related queries
   */
  private async handleSessionQuery(
    _prompt: string,
    _context: PromptContext
  ): Promise<string> {
    try {
      this.logger.info('Fetching session info');

      // Calculate current session based on UTC time
      const now = new Date();
      const sessionInfo = getCurrentSession(now);

      this.logger.info('Session info calculated', sessionInfo);

      return formatSessionResult(sessionInfo);
    } catch (error) {
      this.logger.error('Error handling session query', { error });
      return `Sorry, I encountered an error fetching session info: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Get default response for unrecognized prompts
   */
  private getDefaultResponse(prompt: string): string {
    return `I received your message: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"\n\nI can help you with:\n- Market bias (e.g., "what's the ES bias?")\n- Live quotes (e.g., "what's the current ES price?")\n- Session info (e.g., "what session are we in?")\n\nWhat would you like to know?`;
  }
}

/**
 * Format bias result for display
 */
function formatBiasResult(
  biasResult: { bias: string; confidence: number; reason: string },
  sessionExtremes: SessionExtremes,
  symbol: string
): string {
  const emoji = biasResult.bias === 'bullish' ? '🟢' : biasResult.bias === 'bearish' ? '🔴' : '⚪';

  return `${emoji} **${symbol} ${biasResult.bias.toUpperCase()} BIAS** (${(biasResult.confidence * 100).toFixed(0)}% confidence)

**Session Extremes:**
• Open: ${sessionExtremes.rthOpen.toFixed(2)}
• High: ${sessionExtremes.rthHigh.toFixed(2)}
• Low: ${sessionExtremes.rthLow.toFixed(2)}
• Close: ${sessionExtremes.rthClose.toFixed(2)}
• Range: ${(sessionExtremes.rthHigh - sessionExtremes.rthLow).toFixed(2)} pts

**Analysis:**
${biasResult.reason}`;
}

/**
 * Format quote result for display
 */
function formatQuoteResult(symbol: string, price: number, timestamp: Date): string {
  return `📊 **${symbol} Quote**

**Price:** ${price.toFixed(2)}
**Time:** ${timestamp.toISOString()}

_Data from Databento_`;
}

/**
 * Session info type
 */
interface SessionInfo {
  current: 'Asian' | 'London' | 'New York' | 'Off-hours';
  startTime: string;
  endTime: string;
}

/**
 * Get current trading session based on UTC time
 * Asian: 00:00-08:00 UTC
 * London: 08:00-16:00 UTC
 * New York: 13:30-20:00 UTC (overlaps with London)
 */
function getCurrentSession(now: Date): SessionInfo {
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  const totalMinutes = utcHour * 60 + utcMinute;

  // Asian session: 00:00-08:00 UTC
  if (totalMinutes >= 0 && totalMinutes < 480) {
    return {
      current: 'Asian',
      startTime: '00:00 UTC',
      endTime: '08:00 UTC',
    };
  }

  // London session: 08:00-13:30 UTC (before NY overlap)
  if (totalMinutes >= 480 && totalMinutes < 810) {
    return {
      current: 'London',
      startTime: '08:00 UTC',
      endTime: '16:00 UTC',
    };
  }

  // New York session: 13:30-20:00 UTC (overlaps with London 13:30-16:00)
  if (totalMinutes >= 810 && totalMinutes < 1200) {
    return {
      current: 'New York',
      startTime: '13:30 UTC (9:30 AM ET)',
      endTime: '20:00 UTC (4:00 PM ET)',
    };
  }

  // Off-hours: 20:00-00:00 UTC
  return {
    current: 'Off-hours',
    startTime: '20:00 UTC',
    endTime: '00:00 UTC',
  };
}

/**
 * Format session result for display
 */
function formatSessionResult(sessionInfo: SessionInfo): string {
  const emoji = sessionInfo.current === 'New York' ? '🇺🇸' :
                sessionInfo.current === 'London' ? '🇬🇧' :
                sessionInfo.current === 'Asian' ? '🇯🇵' : '🌙';

  return `${emoji} **Trading Session: ${sessionInfo.current}**

**Hours:** ${sessionInfo.startTime} - ${sessionInfo.endTime}
**Current Time:** ${new Date().toISOString()}

_Major trading sessions rotate every 8 hours globally._`;
}
