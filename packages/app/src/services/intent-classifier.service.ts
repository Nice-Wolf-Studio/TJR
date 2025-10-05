/**
 * Intent Classification Service
 * Validates user prompts to ensure they are trading-related and secure
 *
 * Phase 1C: Intent-based security validation
 */

export enum PromptIntent {
  TRADING_QUERY = 'TRADING_QUERY',
  ADMIN_QUERY = 'ADMIN_QUERY',
  GENERAL_QUERY = 'GENERAL_QUERY',
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Keywords that indicate trading-related queries
 */
const TRADING_KEYWORDS = [
  // Market identifiers
  'market',
  'bias',
  'session',
  'es',
  'nq',
  'spy',
  'qqq',
  'futures',
  'equity',
  'equities',

  // Trading concepts
  'trade',
  'trading',
  'trader',
  'journal',
  'position',
  'entry',
  'exit',
  'stop',
  'target',
  'risk',
  'reward',
  'profit',
  'loss',
  'pnl',

  // Market structure
  'price',
  'level',
  'support',
  'resistance',
  'trend',
  'breakout',
  'breakdown',
  'reversal',
  'continuation',
  'range',

  // TJR-specific
  'tjr',
  'day profile',
  'session extremes',
  'inventory',
  'value area',
  'poc',
  'point of control',
  'balance',
  'imbalance',

  // Market data
  'quote',
  'bar',
  'candle',
  'ohlc',
  'volume',
  'tick',
  'time and sales',

  // Analysis
  'analyze',
  'analysis',
  'chart',
  'indicator',
  'signal',
  'pattern',
  'setup',
  'strategy',
];

/**
 * Keywords that indicate potentially dangerous admin/system queries
 */
const BLOCKED_KEYWORDS = [
  // Database operations
  'table',
  'schema',
  'database',
  'drop',
  'delete from',
  'truncate',
  'alter table',
  'create table',
  'insert into',
  'update set',

  // Infrastructure
  'deploy',
  'deployment',
  'server',
  'docker',
  'container',
  'kubernetes',
  'aws',
  'azure',
  'gcp',

  // Security/Auth
  'users',
  'user table',
  'credential',
  'credentials',
  'password',
  'token',
  'api key',
  'secret',
  'auth',
  'authentication',
  'authorization',

  // System operations
  'restart',
  'reboot',
  'shutdown',
  'kill process',
  'sudo',
  'chmod',
  'chown',

  // Code/repo operations
  'git push',
  'git commit',
  'git merge',
  'pull request',
  'merge pr',
  'deploy code',

  // File system
  'rm -rf',
  'delete file',
  'remove file',
  'file system',
];

/**
 * Service for classifying and validating user prompts
 */
export class IntentClassifierService {
  /**
   * Classify the intent of a user prompt
   */
  classifyIntent(prompt: string): PromptIntent {
    const normalizedPrompt = prompt.toLowerCase().trim();

    // Check for blocked keywords first
    const hasBlockedKeyword = BLOCKED_KEYWORDS.some(keyword =>
      normalizedPrompt.includes(keyword.toLowerCase())
    );

    if (hasBlockedKeyword) {
      return PromptIntent.ADMIN_QUERY;
    }

    // Check for trading keywords
    const hasTradingKeyword = TRADING_KEYWORDS.some(keyword =>
      normalizedPrompt.includes(keyword.toLowerCase())
    );

    if (hasTradingKeyword) {
      return PromptIntent.TRADING_QUERY;
    }

    // Default to general query
    return PromptIntent.GENERAL_QUERY;
  }

  /**
   * Validate a prompt to ensure it's appropriate for the trading bot
   */
  validatePrompt(prompt: string): ValidationResult {
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return {
        valid: false,
        reason: 'Prompt must be a non-empty string',
      };
    }

    const intent = this.classifyIntent(prompt);

    switch (intent) {
      case PromptIntent.TRADING_QUERY:
        return { valid: true };

      case PromptIntent.ADMIN_QUERY:
        return {
          valid: false,
          reason: 'This bot is designed for trading analysis only. Administrative or system queries are not allowed for security reasons.',
        };

      case PromptIntent.GENERAL_QUERY:
        return {
          valid: false,
          reason: 'This bot is specialized for trading analysis. Please ask questions about markets, trading, or TJR analysis. For general questions, please use a different assistant.',
        };

      default:
        return {
          valid: false,
          reason: 'Unable to classify prompt intent',
        };
    }
  }

  /**
   * Get the matched blocked keywords from a prompt (for debugging/logging)
   */
  getBlockedKeywords(prompt: string): string[] {
    const normalizedPrompt = prompt.toLowerCase().trim();
    return BLOCKED_KEYWORDS.filter(keyword =>
      normalizedPrompt.includes(keyword.toLowerCase())
    );
  }

  /**
   * Get the matched trading keywords from a prompt (for debugging/logging)
   */
  getTradingKeywords(prompt: string): string[] {
    const normalizedPrompt = prompt.toLowerCase().trim();
    return TRADING_KEYWORDS.filter(keyword =>
      normalizedPrompt.includes(keyword.toLowerCase())
    );
  }
}
