/**
 * @fileoverview Tests for Alpha Vantage provider.
 *
 * Comprehensive test suite covering provider capabilities, bar fetching,
 * parsing, aggregation, error handling, and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AlphaVantageProvider } from '../src/index.js';
import { parseIntradayResponse, parseDailyResponse, validateBars } from '../src/parser.js';
import {
  AlphaVantageError,
  RateLimitError,
  ApiError,
  ParseError,
  AuthenticationError,
  SymbolNotFoundError,
  mapAlphaVantageError,
  isRetryableError,
  getRetryDelay,
} from '../src/errors.js';
import type { AlphaVantageIntradayResponse, AlphaVantageDailyResponse } from '../src/types.js';
import { Timeframe } from '@tjr/contracts';

describe('AlphaVantageProvider', () => {
  let provider: AlphaVantageProvider;

  beforeEach(() => {
    provider = new AlphaVantageProvider();
  });

  describe('capabilities', () => {
    it('should return correct provider capabilities', () => {
      const caps = provider.capabilities();

      expect(caps.supportsTimeframes).toContain(Timeframe.M1);
      expect(caps.supportsTimeframes).toContain(Timeframe.M5);
      expect(caps.supportsTimeframes).toContain(Timeframe.M10);
      expect(caps.supportsTimeframes).toContain(Timeframe.H1);
      expect(caps.supportsTimeframes).toContain(Timeframe.H4);
      expect(caps.supportsTimeframes).toContain(Timeframe.D1);
      expect(caps.maxBarsPerRequest).toBe(100);
      expect(caps.requiresAuthentication).toBe(true);
      expect(caps.rateLimits?.requestsPerMinute).toBe(5);
      expect(caps.rateLimits?.requestsPerDay).toBe(500);
    });
  });

  describe('getBars - intraday timeframes', () => {
    it('should fetch 1min bars from fixture', async () => {
      const bars = await provider.getBars({
        symbol: 'ES',
        timeframe: Timeframe.M1,
        from: '2024-01-15T14:30:00.000Z',
        to: '2024-01-15T14:50:00.000Z',
      });

      expect(bars.length).toBeGreaterThan(0);
      expect(bars[0]).toHaveProperty('timestamp');
      expect(bars[0]).toHaveProperty('open');
      expect(bars[0]).toHaveProperty('high');
      expect(bars[0]).toHaveProperty('low');
      expect(bars[0]).toHaveProperty('close');
      expect(bars[0]).toHaveProperty('volume');

      // Verify bar structure
      expect(typeof bars[0].timestamp).toBe('string');
      expect(typeof bars[0].open).toBe('number');
      expect(typeof bars[0].high).toBe('number');
      expect(typeof bars[0].low).toBe('number');
      expect(typeof bars[0].close).toBe('number');
      expect(typeof bars[0].volume).toBe('number');

      // Verify OHLC relationships
      expect(bars[0].high).toBeGreaterThanOrEqual(bars[0].low);
      expect(bars[0].high).toBeGreaterThanOrEqual(bars[0].open);
      expect(bars[0].high).toBeGreaterThanOrEqual(bars[0].close);
      expect(bars[0].low).toBeLessThanOrEqual(bars[0].open);
      expect(bars[0].low).toBeLessThanOrEqual(bars[0].close);
    });

    it('should fetch 5min bars from fixture', async () => {
      const bars = await provider.getBars({
        symbol: 'ES',
        timeframe: Timeframe.M5,
        from: '2024-01-15T14:00:00.000Z',
        to: '2024-01-15T15:00:00.000Z',
      });

      expect(bars.length).toBeGreaterThan(0);
      expect(bars[0].timestamp).toContain('2024-01-15');
    });

    it('should fetch 60min bars from fixture', async () => {
      const bars = await provider.getBars({
        symbol: 'ES',
        timeframe: Timeframe.H1,
        from: '2024-01-15T09:00:00.000Z',
        to: '2024-01-15T16:00:00.000Z',
      });

      expect(bars.length).toBeGreaterThan(0);
    });
  });

  describe('getBars - daily timeframe', () => {
    it('should fetch daily bars from fixture', async () => {
      const bars = await provider.getBars({
        symbol: 'ES',
        timeframe: Timeframe.D1,
        from: '2024-01-08T00:00:00.000Z',
        to: '2024-01-15T23:59:59.999Z',
      });

      expect(bars.length).toBeGreaterThan(0);
      expect(bars[0].timestamp).toContain('2024-01');
    });
  });

  describe('getBars - aggregation', () => {
    it('should aggregate 5m to 10m bars', async () => {
      const bars = await provider.getBars({
        symbol: 'ES',
        timeframe: Timeframe.M10,
        from: '2024-01-15T14:00:00.000Z',
        to: '2024-01-15T15:00:00.000Z',
      });

      expect(bars.length).toBeGreaterThan(0);

      // Verify aggregation properties
      const firstBar = bars[0];
      expect(firstBar.high).toBeGreaterThanOrEqual(firstBar.low);
      expect(firstBar.volume).toBeGreaterThan(0);
    });

    it('should aggregate 1h to 4h bars', async () => {
      const bars = await provider.getBars({
        symbol: 'ES',
        timeframe: Timeframe.H4,
        from: '2024-01-15T08:00:00.000Z',
        to: '2024-01-15T20:00:00.000Z',
      });

      expect(bars.length).toBeGreaterThan(0);

      // 4h bars should have aggregated volume
      const firstBar = bars[0];
      expect(firstBar.volume).toBeGreaterThan(0);
    });
  });

  describe('getBars - filtering and limits', () => {
    it('should apply limit parameter', async () => {
      const bars = await provider.getBars({
        symbol: 'ES',
        timeframe: Timeframe.M1,
        from: '2024-01-15T14:00:00.000Z',
        to: '2024-01-15T16:00:00.000Z',
        limit: 5,
      });

      expect(bars.length).toBeLessThanOrEqual(5);
    });

    it('should filter bars by date range', async () => {
      const fromDate = '2024-01-15T14:30:00.000Z';
      const toDate = '2024-01-15T14:40:00.000Z';

      const bars = await provider.getBars({
        symbol: 'ES',
        timeframe: Timeframe.M1,
        from: fromDate,
        to: toDate,
      });

      // All bars should be within range
      bars.forEach((bar) => {
        const barTime = new Date(bar.timestamp).getTime();
        expect(barTime).toBeGreaterThanOrEqual(new Date(fromDate).getTime());
        expect(barTime).toBeLessThanOrEqual(new Date(toDate).getTime());
      });
    });

    it('should return bars in chronological order', async () => {
      const bars = await provider.getBars({
        symbol: 'ES',
        timeframe: Timeframe.M1,
        from: '2024-01-15T14:00:00.000Z',
        to: '2024-01-15T15:00:00.000Z',
      });

      // Verify chronological order
      for (let i = 1; i < bars.length; i++) {
        const prevTime = new Date(bars[i - 1].timestamp).getTime();
        const currTime = new Date(bars[i].timestamp).getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
    });
  });

  describe('getBars - validation', () => {
    it('should throw error for empty symbol', async () => {
      await expect(
        provider.getBars({
          symbol: '',
          timeframe: Timeframe.M1,
          from: '2024-01-15T14:00:00.000Z',
        })
      ).rejects.toThrow('Invalid symbol');
    });

    it('should throw error for invalid timeframe', async () => {
      await expect(
        provider.getBars({
          symbol: 'ES',
          timeframe: '999' as any,
          from: '2024-01-15T14:00:00.000Z',
        })
      ).rejects.toThrow('Invalid timeframe');
    });

    it('should throw error for missing from date', async () => {
      await expect(
        provider.getBars({
          symbol: 'ES',
          timeframe: Timeframe.M1,
          from: '' as any,
        })
      ).rejects.toThrow('Invalid from date');
    });

    it('should throw error for invalid date range (from > to)', async () => {
      await expect(
        provider.getBars({
          symbol: 'ES',
          timeframe: Timeframe.M1,
          from: '2024-01-15T15:00:00.000Z',
          to: '2024-01-15T14:00:00.000Z',
        })
      ).rejects.toThrow('Invalid date range');
    });

    it('should throw error for negative limit', async () => {
      await expect(
        provider.getBars({
          symbol: 'ES',
          timeframe: Timeframe.M1,
          from: '2024-01-15T14:00:00.000Z',
          limit: -5,
        })
      ).rejects.toThrow('Invalid limit');
    });

    it('should throw error for zero limit', async () => {
      await expect(
        provider.getBars({
          symbol: 'ES',
          timeframe: Timeframe.M1,
          from: '2024-01-15T14:00:00.000Z',
          limit: 0,
        })
      ).rejects.toThrow('Invalid limit');
    });
  });
});

describe('Parser', () => {
  describe('parseIntradayResponse', () => {
    it('should parse valid intraday response', () => {
      const response: AlphaVantageIntradayResponse = {
        'Meta Data': {
          '1. Information': 'Intraday (1min) open, high, low, close prices and volume',
          '2. Symbol': 'ES',
          '3. Last Refreshed': '2024-01-15 16:00:00',
          '4. Interval': '1min',
          '5. Output Size': 'Compact',
          '6. Time Zone': 'US/Eastern',
        },
        'Time Series (1min)': {
          '2024-01-15 14:30:00': {
            '1. open': '4750.00',
            '2. high': '4752.25',
            '3. low': '4749.50',
            '4. close': '4751.75',
            '5. volume': '1250',
          },
          '2024-01-15 14:31:00': {
            '1. open': '4751.75',
            '2. high': '4753.00',
            '3. low': '4751.00',
            '4. close': '4752.50',
            '5. volume': '1100',
          },
        },
      };

      const result = parseIntradayResponse(response);

      expect(result.symbol).toBe('ES');
      expect(result.interval).toBe('1min');
      expect(result.timezone).toBe('US/Eastern');
      expect(result.bars.length).toBe(2);

      // Verify first bar
      expect(result.bars[0].open).toBe(4750.0);
      expect(result.bars[0].high).toBe(4752.25);
      expect(result.bars[0].low).toBe(4749.5);
      expect(result.bars[0].close).toBe(4751.75);
      expect(result.bars[0].volume).toBe(1250);
    });

    it('should throw error for missing metadata', () => {
      const response: any = {
        'Time Series (1min)': {},
      };

      expect(() => parseIntradayResponse(response)).toThrow(ParseError);
      expect(() => parseIntradayResponse(response)).toThrow('Missing Meta Data');
    });

    it('should throw error for missing time series', () => {
      const response: any = {
        'Meta Data': {
          '2. Symbol': 'ES',
          '4. Interval': '1min',
          '6. Time Zone': 'US/Eastern',
        },
      };

      expect(() => parseIntradayResponse(response)).toThrow(ParseError);
      expect(() => parseIntradayResponse(response)).toThrow('No time series data found');
    });

    it('should throw error for empty time series', () => {
      const response: AlphaVantageIntradayResponse = {
        'Meta Data': {
          '1. Information': 'Test',
          '2. Symbol': 'ES',
          '3. Last Refreshed': '2024-01-15 16:00:00',
          '4. Interval': '1min',
          '5. Output Size': 'Compact',
          '6. Time Zone': 'US/Eastern',
        },
        'Time Series (1min)': {},
      };

      expect(() => parseIntradayResponse(response)).toThrow(ParseError);
      expect(() => parseIntradayResponse(response)).toThrow('No valid bars found');
    });
  });

  describe('parseDailyResponse', () => {
    it('should parse valid daily response', () => {
      const response: AlphaVantageDailyResponse = {
        'Meta Data': {
          '1. Information': 'Daily Prices (open, high, low, close) and Volumes',
          '2. Symbol': 'ES',
          '3. Last Refreshed': '2024-01-15',
          '4. Output Size': 'Compact',
          '5. Time Zone': 'US/Eastern',
        },
        'Time Series (Daily)': {
          '2024-01-15': {
            '1. open': '4700.00',
            '2. high': '4760.00',
            '3. low': '4695.00',
            '4. close': '4755.00',
            '5. volume': '500000',
          },
          '2024-01-12': {
            '1. open': '4680.00',
            '2. high': '4705.00',
            '3. low': '4675.00',
            '4. close': '4700.00',
            '5. volume': '450000',
          },
        },
      };

      const result = parseDailyResponse(response);

      expect(result.symbol).toBe('ES');
      expect(result.interval).toBe('1D');
      expect(result.timezone).toBe('US/Eastern');
      expect(result.bars.length).toBe(2);

      // Verify bars are sorted (oldest first)
      expect(new Date(result.bars[0].timestamp).getTime()).toBeLessThan(
        new Date(result.bars[1].timestamp).getTime()
      );
    });

    it('should throw error for missing daily time series', () => {
      const response: any = {
        'Meta Data': {
          '2. Symbol': 'ES',
          '5. Time Zone': 'US/Eastern',
        },
      };

      expect(() => parseDailyResponse(response)).toThrow(ParseError);
      expect(() => parseDailyResponse(response)).toThrow('daily time series');
    });
  });

  describe('validateBars', () => {
    it('should return no warnings for valid bars', () => {
      const bars = [
        {
          timestamp: '2024-01-15T14:30:00.000Z',
          open: 4750.0,
          high: 4752.25,
          low: 4749.5,
          close: 4751.75,
          volume: 1250,
        },
        {
          timestamp: '2024-01-15T14:31:00.000Z',
          open: 4751.75,
          high: 4753.0,
          low: 4751.0,
          close: 4752.5,
          volume: 1100,
        },
      ];

      const warnings = validateBars(bars);
      expect(warnings.length).toBe(0);
    });

    it('should detect duplicate timestamps', () => {
      const bars = [
        {
          timestamp: '2024-01-15T14:30:00.000Z',
          open: 4750.0,
          high: 4752.25,
          low: 4749.5,
          close: 4751.75,
          volume: 1250,
        },
        {
          timestamp: '2024-01-15T14:30:00.000Z', // Duplicate
          open: 4751.0,
          high: 4752.0,
          low: 4750.0,
          close: 4751.5,
          volume: 1000,
        },
      ];

      const warnings = validateBars(bars);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes('Duplicate timestamp'))).toBe(true);
    });

    it('should detect out-of-order timestamps', () => {
      const bars = [
        {
          timestamp: '2024-01-15T14:31:00.000Z', // Later timestamp first
          open: 4751.75,
          high: 4753.0,
          low: 4751.0,
          close: 4752.5,
          volume: 1100,
        },
        {
          timestamp: '2024-01-15T14:30:00.000Z',
          open: 4750.0,
          high: 4752.25,
          low: 4749.5,
          close: 4751.75,
          volume: 1250,
        },
      ];

      const warnings = validateBars(bars);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes('not in chronological order'))).toBe(true);
    });

    it('should detect zero volume bars', () => {
      const bars = [
        {
          timestamp: '2024-01-15T14:30:00.000Z',
          open: 4750.0,
          high: 4752.25,
          low: 4749.5,
          close: 4751.75,
          volume: 0, // Zero volume
        },
      ];

      const warnings = validateBars(bars);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes('zero volume'))).toBe(true);
    });
  });
});

describe('Error Handling', () => {
  describe('Error classes', () => {
    it('should create RateLimitError correctly', () => {
      const error = new RateLimitError('Rate limit exceeded', 60);

      expect(error).toBeInstanceOf(RateLimitError);
      expect(error).toBeInstanceOf(AlphaVantageError);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.retryAfter).toBe(60);
    });

    it('should create ApiError correctly', () => {
      const error = new ApiError('API error', 500, { error: 'Server error' });

      expect(error).toBeInstanceOf(ApiError);
      expect(error.message).toBe('API error');
      expect(error.code).toBe('API_ERROR');
      expect(error.statusCode).toBe(500);
    });

    it('should create ParseError correctly', () => {
      const error = new ParseError('Parse failed', { data: 'invalid' });

      expect(error).toBeInstanceOf(ParseError);
      expect(error.message).toBe('Parse failed');
      expect(error.code).toBe('PARSE_ERROR');
    });

    it('should create AuthenticationError correctly', () => {
      const error = new AuthenticationError('Invalid API key');

      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.message).toBe('Invalid API key');
      expect(error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should create SymbolNotFoundError correctly', () => {
      const error = new SymbolNotFoundError('INVALID', 'Symbol not found: INVALID');

      expect(error).toBeInstanceOf(SymbolNotFoundError);
      expect(error.symbol).toBe('INVALID');
      expect(error.code).toBe('SYMBOL_NOT_FOUND');
    });
  });

  describe('mapAlphaVantageError', () => {
    it('should map rate limit error from Note field', () => {
      const response = {
        Note: 'Thank you for using Alpha Vantage! Our standard API call frequency is 5 calls per minute and 500 calls per day.',
      };

      const error = mapAlphaVantageError(response);

      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.retryAfter).toBe(60);
    });

    it('should map rate limit error from status code 429', () => {
      const error = mapAlphaVantageError({}, 429);

      expect(error).toBeInstanceOf(RateLimitError);
    });

    it('should map authentication error from error message', () => {
      const response = {
        'Error Message': 'Invalid API key',
      };

      const error = mapAlphaVantageError(response);

      expect(error).toBeInstanceOf(AuthenticationError);
    });

    it('should map symbol not found error', () => {
      const response = {
        'Error Message': 'Invalid symbol: INVALID123',
      };

      const error = mapAlphaVantageError(response);

      expect(error).toBeInstanceOf(SymbolNotFoundError);
    });

    it('should map API error for generic errors', () => {
      const response = {
        'Error Message': 'Something went wrong',
      };

      const error = mapAlphaVantageError(response);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.message).toBe('Something went wrong');
    });

    it('should map HTTP status codes correctly', () => {
      const error401 = mapAlphaVantageError({}, 401);
      expect(error401).toBeInstanceOf(AuthenticationError);

      const error404 = mapAlphaVantageError({}, 404);
      expect(error404).toBeInstanceOf(ApiError);
      expect(error404.message).toContain('not found');

      const error500 = mapAlphaVantageError({}, 500);
      expect(error500).toBeInstanceOf(ApiError);
      expect(error500.message).toContain('unavailable');
    });
  });

  describe('isRetryableError', () => {
    it('should identify RateLimitError as retryable', () => {
      const error = new RateLimitError();
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify server errors as retryable', () => {
      const error500 = new ApiError('Server error', 500);
      expect(isRetryableError(error500)).toBe(true);

      const error503 = new ApiError('Service unavailable', 503);
      expect(isRetryableError(error503)).toBe(true);
    });

    it('should identify authentication errors as not retryable', () => {
      const error = new AuthenticationError();
      expect(isRetryableError(error)).toBe(false);
    });

    it('should identify symbol not found as not retryable', () => {
      const error = new SymbolNotFoundError('INVALID');
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    it('should return retry delay for RateLimitError', () => {
      const error = new RateLimitError('Rate limit', 60);
      const delay = getRetryDelay(error);

      expect(delay).toBe(60000); // 60 seconds in milliseconds
    });

    it('should return retry delay for rate limit status code', () => {
      const error = new ApiError('Too many requests', 429);
      const delay = getRetryDelay(error);

      expect(delay).toBe(60000);
    });

    it('should return retry delay for server errors', () => {
      const error = new ApiError('Server error', 500);
      const delay = getRetryDelay(error);

      expect(delay).toBe(5000);
    });

    it('should return undefined for non-retryable errors', () => {
      const error = new AuthenticationError();
      const delay = getRetryDelay(error);

      expect(delay).toBeUndefined();
    });
  });
});
