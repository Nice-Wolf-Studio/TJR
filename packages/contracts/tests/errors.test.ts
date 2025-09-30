/**
 * @fileoverview Tests for error classes and serialization.
 */

import { describe, it, expect } from 'vitest';
import {
  TJRError,
  ProviderRateLimitError,
  InsufficientBarsError,
  SymbolResolutionError,
  isTJRError,
  isProviderRateLimitError,
  isInsufficientBarsError,
  isSymbolResolutionError
} from '../src/errors.js';
import { Timeframe } from '../src/timeframes.js';

describe('TJRError', () => {
  it('should create error with code and message', () => {
    const error = new TJRError('TEST_CODE', 'Test message');

    expect(error.name).toBe('TJRError');
    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test message');
    expect(error.timestamp).toBeDefined();
    expect(error.stack).toBeDefined();
  });

  it('should include optional data', () => {
    const data = { foo: 'bar', count: 42 };
    const error = new TJRError('TEST_CODE', 'Test message', data);

    expect(error.data).toEqual(data);
  });

  it('should have valid ISO timestamp', () => {
    const error = new TJRError('TEST_CODE', 'Test message');
    const timestamp = new Date(error.timestamp);

    expect(timestamp.toISOString()).toBe(error.timestamp);
    expect(timestamp.getTime()).toBeGreaterThan(0);
  });

  it('should serialize to JSON correctly', () => {
    const error = new TJRError('TEST_CODE', 'Test message', { key: 'value' });
    const json = error.toJSON();

    expect(json.name).toBe('TJRError');
    expect(json.code).toBe('TEST_CODE');
    expect(json.message).toBe('Test message');
    expect(json.data).toEqual({ key: 'value' });
    expect(json.timestamp).toBe(error.timestamp);
    expect(json.stack).toBeDefined();
  });

  it('should be JSON stringifiable', () => {
    const error = new TJRError('TEST_CODE', 'Test message', { key: 'value' });
    const jsonString = JSON.stringify(error);
    const parsed = JSON.parse(jsonString);

    expect(parsed.name).toBe('TJRError');
    expect(parsed.code).toBe('TEST_CODE');
    expect(parsed.message).toBe('Test message');
  });
});

describe('ProviderRateLimitError', () => {
  it('should create rate limit error with provider data', () => {
    const error = new ProviderRateLimitError(
      'Rate limit exceeded',
      { provider: 'alpaca', retryAfter: 60 }
    );

    expect(error.name).toBe('ProviderRateLimitError');
    expect(error.code).toBe('PROVIDER_RATE_LIMIT');
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.data?.provider).toBe('alpaca');
    expect(error.data?.retryAfter).toBe(60);
  });

  it('should include optional limitType', () => {
    const error = new ProviderRateLimitError(
      'Rate limit exceeded',
      {
        provider: 'tradier',
        retryAfter: 30,
        limitType: 'requests_per_minute'
      }
    );

    expect(error.data?.limitType).toBe('requests_per_minute');
  });

  it('should serialize correctly', () => {
    const error = new ProviderRateLimitError(
      'Rate limit exceeded',
      { provider: 'alpaca', retryAfter: 60 }
    );

    const jsonString = JSON.stringify(error.toJSON());
    const parsed = JSON.parse(jsonString);

    expect(parsed.code).toBe('PROVIDER_RATE_LIMIT');
    expect(parsed.data.provider).toBe('alpaca');
    expect(parsed.data.retryAfter).toBe(60);
  });
});

describe('InsufficientBarsError', () => {
  it('should create insufficient bars error with context', () => {
    const error = new InsufficientBarsError(
      'Need more bars',
      {
        required: 50,
        received: 30,
        symbol: 'SPY',
        timeframe: Timeframe.M5
      }
    );

    expect(error.name).toBe('InsufficientBarsError');
    expect(error.code).toBe('INSUFFICIENT_BARS');
    expect(error.message).toBe('Need more bars');
    expect(error.data?.required).toBe(50);
    expect(error.data?.received).toBe(30);
    expect(error.data?.symbol).toBe('SPY');
    expect(error.data?.timeframe).toBe(Timeframe.M5);
  });

  it('should serialize correctly', () => {
    const error = new InsufficientBarsError(
      'Need more bars',
      {
        required: 50,
        received: 30,
        symbol: 'SPY',
        timeframe: Timeframe.M5
      }
    );

    const jsonString = JSON.stringify(error.toJSON());
    const parsed = JSON.parse(jsonString);

    expect(parsed.code).toBe('INSUFFICIENT_BARS');
    expect(parsed.data.required).toBe(50);
    expect(parsed.data.received).toBe(30);
    expect(parsed.data.symbol).toBe('SPY');
    expect(parsed.data.timeframe).toBe('5');
  });
});

describe('SymbolResolutionError', () => {
  it('should create symbol resolution error', () => {
    const error = new SymbolResolutionError(
      'Symbol not found',
      {
        symbol: 'INVALID',
        provider: 'alpaca',
        suggestion: 'SPY'
      }
    );

    expect(error.name).toBe('SymbolResolutionError');
    expect(error.code).toBe('SYMBOL_RESOLUTION');
    expect(error.message).toBe('Symbol not found');
    expect(error.data?.symbol).toBe('INVALID');
    expect(error.data?.provider).toBe('alpaca');
    expect(error.data?.suggestion).toBe('SPY');
  });

  it('should work without suggestion', () => {
    const error = new SymbolResolutionError(
      'Symbol not found',
      {
        symbol: 'INVALID',
        provider: 'alpaca'
      }
    );

    expect(error.data?.suggestion).toBeUndefined();
  });

  it('should serialize correctly', () => {
    const error = new SymbolResolutionError(
      'Symbol not found',
      {
        symbol: 'INVALID',
        provider: 'alpaca',
        suggestion: 'SPY'
      }
    );

    const jsonString = JSON.stringify(error.toJSON());
    const parsed = JSON.parse(jsonString);

    expect(parsed.code).toBe('SYMBOL_RESOLUTION');
    expect(parsed.data.symbol).toBe('INVALID');
    expect(parsed.data.provider).toBe('alpaca');
    expect(parsed.data.suggestion).toBe('SPY');
  });
});

describe('Type Guards', () => {
  const tjrError = new TJRError('TEST', 'message');
  const rateLimitError = new ProviderRateLimitError('message', { provider: 'test' });
  const insufficientBarsError = new InsufficientBarsError('message', {
    required: 50,
    received: 30,
    symbol: 'SPY',
    timeframe: Timeframe.M5
  });
  const symbolError = new SymbolResolutionError('message', {
    symbol: 'TEST',
    provider: 'test'
  });
  const nativeError = new Error('native');
  const notError = { code: 'FAKE' };

  describe('isTJRError', () => {
    it('should return true for TJRError instances', () => {
      expect(isTJRError(tjrError)).toBe(true);
      expect(isTJRError(rateLimitError)).toBe(true);
      expect(isTJRError(insufficientBarsError)).toBe(true);
      expect(isTJRError(symbolError)).toBe(true);
    });

    it('should return false for non-TJRError', () => {
      expect(isTJRError(nativeError)).toBe(false);
      expect(isTJRError(notError)).toBe(false);
      expect(isTJRError(null)).toBe(false);
      expect(isTJRError(undefined)).toBe(false);
    });
  });

  describe('isProviderRateLimitError', () => {
    it('should return true only for ProviderRateLimitError', () => {
      expect(isProviderRateLimitError(rateLimitError)).toBe(true);
      expect(isProviderRateLimitError(tjrError)).toBe(false);
      expect(isProviderRateLimitError(insufficientBarsError)).toBe(false);
      expect(isProviderRateLimitError(nativeError)).toBe(false);
    });
  });

  describe('isInsufficientBarsError', () => {
    it('should return true only for InsufficientBarsError', () => {
      expect(isInsufficientBarsError(insufficientBarsError)).toBe(true);
      expect(isInsufficientBarsError(tjrError)).toBe(false);
      expect(isInsufficientBarsError(rateLimitError)).toBe(false);
      expect(isInsufficientBarsError(nativeError)).toBe(false);
    });
  });

  describe('isSymbolResolutionError', () => {
    it('should return true only for SymbolResolutionError', () => {
      expect(isSymbolResolutionError(symbolError)).toBe(true);
      expect(isSymbolResolutionError(tjrError)).toBe(false);
      expect(isSymbolResolutionError(rateLimitError)).toBe(false);
      expect(isSymbolResolutionError(nativeError)).toBe(false);
    });
  });
});