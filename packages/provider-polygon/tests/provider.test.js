/**
 * Tests for Polygon.io provider adapter.
 *
 * These tests verify the provider interface (getBars, capabilities) with
 * mocked HTTP client to avoid network calls. All tests are deterministic
 * and use fixtures for responses.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPolygonProvider } from '../dist/src/index.js';
import { RateLimitError, ApiError } from '../dist/src/errors.js';
import { PolygonClient } from '../dist/src/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load fixture from __fixtures__ directory
 * @param {string} filename - Fixture filename
 * @returns {object} Parsed JSON fixture
 */
function loadFixture(filename) {
  const fixturePath = join(__dirname, '..', '__fixtures__', filename);
  const content = readFileSync(fixturePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Create a mock logger that does nothing
 * @returns {object} Mock logger
 */
function createMockLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

describe('createPolygonProvider - Configuration', () => {
  it('should create provider with valid config', () => {
    const provider = createPolygonProvider({
      apiKey: 'test-api-key',
      logger: createMockLogger(),
    });

    assert.ok(provider, 'Provider should be created');
    assert.equal(typeof provider.getBars, 'function', 'Provider should have getBars method');
    assert.equal(
      typeof provider.capabilities,
      'function',
      'Provider should have capabilities method'
    );
  });

  it('should throw error for missing API key', () => {
    assert.throws(
      () => createPolygonProvider({ apiKey: '' }),
      /apiKey is required/,
      'Should throw error for empty API key'
    );
  });

  it('should accept optional baseUrl', () => {
    const provider = createPolygonProvider({
      apiKey: 'test-api-key',
      baseUrl: 'https://custom.api.url',
      logger: createMockLogger(),
    });

    assert.ok(provider, 'Provider should be created with custom baseUrl');
  });

  it('should accept optional timeout', () => {
    const provider = createPolygonProvider({
      apiKey: 'test-api-key',
      timeout: 60000,
      logger: createMockLogger(),
    });

    assert.ok(provider, 'Provider should be created with custom timeout');
  });
});

describe('provider.capabilities', () => {
  it('should return correct capabilities', () => {
    const provider = createPolygonProvider({
      apiKey: 'test-api-key',
      logger: createMockLogger(),
    });

    const caps = provider.capabilities();

    assert.ok(Array.isArray(caps.supportsTimeframes), 'supportsTimeframes should be an array');
    assert.ok(caps.supportsTimeframes.includes('1m'), 'Should support 1m timeframe');
    assert.ok(caps.supportsTimeframes.includes('5m'), 'Should support 5m timeframe');
    assert.ok(caps.supportsTimeframes.includes('10m'), 'Should support 10m timeframe (aggregated)');
    assert.ok(caps.supportsTimeframes.includes('4h'), 'Should support 4h timeframe (aggregated)');
    assert.ok(caps.supportsTimeframes.includes('1D'), 'Should support 1D timeframe');

    assert.equal(caps.maxBarsPerRequest, 50000, 'Max bars per request should be 50000');
    assert.equal(caps.requiresAuthentication, true, 'Should require authentication');
    assert.equal(
      caps.rateLimits.requestsPerMinute,
      5,
      'Rate limit should be 5 req/min (free tier)'
    );
    assert.equal(caps.supportsExtendedHours, true, 'Should support extended hours');
    assert.ok(caps.historicalDataFrom, 'Should have historicalDataFrom field');
  });
});

describe('provider.getBars - Native Timeframes (5m)', () => {
  it('should fetch 5m bars with mocked client', async () => {
    // Create provider
    const provider = createPolygonProvider({
      apiKey: 'test-api-key',
      logger: createMockLogger(),
    });

    // Mock the PolygonClient.getAggregates method
    const fixture = loadFixture('polygon-intraday-5m.json');
    mock.method(PolygonClient.prototype, 'getAggregates', async () => fixture);

    // Fetch bars
    const bars = await provider.getBars({
      symbol: 'ES',
      timeframe: '5m',
      from: new Date('2024-10-01T13:30:00Z'),
      to: new Date('2024-10-01T15:00:00Z'),
    });

    assert.ok(Array.isArray(bars), 'Should return array of bars');
    assert.equal(bars.length, 20, 'Should return 20 bars from fixture');
    assert.equal(bars[0].timestamp, 1727787000000, 'First bar timestamp should match fixture');
    assert.equal(bars[0].open, 4500.0, 'First bar open should match fixture');
    assert.equal(bars[0].volume, 75000, 'First bar volume should match fixture');
  });

  it('should fetch daily bars with mocked client', async () => {
    const provider = createPolygonProvider({
      apiKey: 'test-api-key',
      logger: createMockLogger(),
    });

    // Mock the client
    const fixture = loadFixture('polygon-daily-10days.json');
    mock.method(PolygonClient.prototype, 'getAggregates', async () => fixture);

    const bars = await provider.getBars({
      symbol: 'ES',
      timeframe: '1D',
      from: new Date('2024-09-30'),
      to: new Date('2024-10-09'),
    });

    assert.ok(Array.isArray(bars), 'Should return array of bars');
    assert.equal(bars.length, 10, 'Should return 10 daily bars');
    assert.equal(bars[0].timestamp, 1727654400000, 'First bar timestamp should match fixture');
  });
});

describe('provider.getBars - Aggregated Timeframes (10m)', () => {
  it('should fetch and aggregate 5m → 10m', async () => {
    const provider = createPolygonProvider({
      apiKey: 'test-api-key',
      logger: createMockLogger(),
    });

    // Mock the client to return 5m data
    const fixture = loadFixture('polygon-intraday-5m.json');
    mock.method(PolygonClient.prototype, 'getAggregates', async () => fixture);

    // Request 10m bars (will fetch 5m and aggregate)
    const bars = await provider.getBars({
      symbol: 'ES',
      timeframe: '10m',
      from: new Date('2024-10-01T13:30:00Z'),
      to: new Date('2024-10-01T15:00:00Z'),
    });

    assert.ok(Array.isArray(bars), 'Should return array of bars');
    assert.equal(bars.length, 10, 'Should return 10 aggregated bars (20 5m bars → 10 10m bars)');

    // Verify aggregation (first 10m bar should aggregate first 2 5m bars)
    assert.equal(bars[0].open, 4500.0, 'First 10m bar open should match first 5m bar');
    assert.equal(bars[0].close, 4502.0, 'First 10m bar close should match second 5m bar');
    assert.equal(
      bars[0].volume,
      153000,
      'First 10m bar volume should sum first two 5m bars (75000 + 78000)'
    );
  });
});

describe('provider.getBars - Rate Limit Handling', () => {
  it('should propagate RateLimitError from client', async () => {
    const provider = createPolygonProvider({
      apiKey: 'test-api-key',
      logger: createMockLogger(),
    });

    // Mock the client to throw RateLimitError
    mock.method(PolygonClient.prototype, 'getAggregates', async () => {
      throw new RateLimitError({
        retryAfter: 60,
        limitType: 'requests_per_minute',
        requestUrl: 'https://api.polygon.io/v2/aggs/ticker/ES/...',
      });
    });

    await assert.rejects(
      async () => {
        await provider.getBars({
          symbol: 'ES',
          timeframe: '5m',
          from: new Date('2024-10-01'),
          to: new Date('2024-10-02'),
        });
      },
      RateLimitError,
      'Should propagate RateLimitError'
    );
  });
});

describe('provider.getBars - API Error Handling', () => {
  it('should propagate ApiError from client (401 Unauthorized)', async () => {
    const provider = createPolygonProvider({
      apiKey: 'invalid-key',
      logger: createMockLogger(),
    });

    // Mock the client to throw ApiError
    mock.method(PolygonClient.prototype, 'getAggregates', async () => {
      throw new ApiError('Unauthorized', {
        statusCode: 401,
        statusText: 'Unauthorized',
        requestUrl: 'https://api.polygon.io/v2/aggs/ticker/ES/...',
        responseBody: '{"error": "Invalid API key"}',
      });
    });

    await assert.rejects(
      async () => {
        await provider.getBars({
          symbol: 'ES',
          timeframe: '5m',
          from: new Date('2024-10-01'),
          to: new Date('2024-10-02'),
        });
      },
      ApiError,
      'Should propagate ApiError'
    );
  });

  it('should propagate ApiError from client (500 Server Error)', async () => {
    const provider = createPolygonProvider({
      apiKey: 'test-api-key',
      logger: createMockLogger(),
    });

    // Mock the client to throw ApiError
    mock.method(PolygonClient.prototype, 'getAggregates', async () => {
      throw new ApiError('Internal Server Error', {
        statusCode: 500,
        statusText: 'Internal Server Error',
        requestUrl: 'https://api.polygon.io/v2/aggs/ticker/ES/...',
        responseBody: '{"error": "Server error"}',
      });
    });

    await assert.rejects(
      async () => {
        await provider.getBars({
          symbol: 'ES',
          timeframe: '5m',
          from: new Date('2024-10-01'),
          to: new Date('2024-10-02'),
        });
      },
      ApiError,
      'Should propagate ApiError for server errors'
    );
  });
});

describe('provider.getBars - Symbol Normalization', () => {
  it('should normalize symbol to uppercase', async () => {
    const provider = createPolygonProvider({
      apiKey: 'test-api-key',
      logger: createMockLogger(),
    });

    const fixture = loadFixture('polygon-intraday-5m.json');

    // Mock and capture the call
    let capturedSymbol;
    mock.method(PolygonClient.prototype, 'getAggregates', async (symbol) => {
      capturedSymbol = symbol;
      return fixture;
    });

    await provider.getBars({
      symbol: 'es', // lowercase
      timeframe: '5m',
      from: new Date('2024-10-01'),
      to: new Date('2024-10-02'),
    });

    assert.equal(capturedSymbol, 'ES', 'Symbol should be normalized to uppercase');
  });
});

describe('provider.getBars - Date Conversion', () => {
  it('should convert Date objects to Unix milliseconds', async () => {
    const provider = createPolygonProvider({
      apiKey: 'test-api-key',
      logger: createMockLogger(),
    });

    const fixture = loadFixture('polygon-intraday-5m.json');

    // Mock and capture the call
    let capturedFrom, capturedTo;
    mock.method(
      PolygonClient.prototype,
      'getAggregates',
      async (_symbol, _mult, _span, from, to) => {
        capturedFrom = from;
        capturedTo = to;
        return fixture;
      }
    );

    const fromDate = new Date('2024-10-01T00:00:00Z');
    const toDate = new Date('2024-10-02T00:00:00Z');

    await provider.getBars({
      symbol: 'ES',
      timeframe: '5m',
      from: fromDate,
      to: toDate,
    });

    assert.equal(capturedFrom, fromDate.getTime(), 'from should be converted to Unix milliseconds');
    assert.equal(capturedTo, toDate.getTime(), 'to should be converted to Unix milliseconds');
  });
});

describe('provider.getBars - Limit Parameter', () => {
  it('should pass limit parameter to client', async () => {
    const provider = createPolygonProvider({
      apiKey: 'test-api-key',
      logger: createMockLogger(),
    });

    const fixture = loadFixture('polygon-intraday-5m.json');

    // Mock and capture the call
    let capturedLimit;
    mock.method(PolygonClient.prototype, 'getAggregates', async (_s, _m, _t, _f, _to, limit) => {
      capturedLimit = limit;
      return fixture;
    });

    await provider.getBars({
      symbol: 'ES',
      timeframe: '5m',
      from: new Date('2024-10-01'),
      to: new Date('2024-10-02'),
      limit: 1000,
    });

    assert.equal(capturedLimit, 1000, 'limit should be passed to client');
  });

  it('should work without limit parameter', async () => {
    const provider = createPolygonProvider({
      apiKey: 'test-api-key',
      logger: createMockLogger(),
    });

    const fixture = loadFixture('polygon-intraday-5m.json');

    // Mock and capture the call
    let capturedLimit;
    mock.method(PolygonClient.prototype, 'getAggregates', async (_s, _m, _t, _f, _to, limit) => {
      capturedLimit = limit;
      return fixture;
    });

    await provider.getBars({
      symbol: 'ES',
      timeframe: '5m',
      from: new Date('2024-10-01'),
      to: new Date('2024-10-02'),
      // no limit parameter
    });

    assert.equal(capturedLimit, undefined, 'limit should be undefined when not provided');
  });
});

describe('provider.getBars - Retry Logic', () => {
  it('should not retry on success', async () => {
    const provider = createPolygonProvider({
      apiKey: 'test-api-key',
      logger: createMockLogger(),
    });

    const fixture = loadFixture('polygon-intraday-5m.json');

    let callCount = 0;
    mock.method(PolygonClient.prototype, 'getAggregates', async () => {
      callCount++;
      return fixture;
    });

    await provider.getBars({
      symbol: 'ES',
      timeframe: '5m',
      from: new Date('2024-10-01'),
      to: new Date('2024-10-02'),
    });

    assert.equal(callCount, 1, 'Should call client exactly once on success');
  });

  it("should not retry on error (retry logic is caller's responsibility)", async () => {
    const provider = createPolygonProvider({
      apiKey: 'test-api-key',
      logger: createMockLogger(),
    });

    let callCount = 0;
    mock.method(PolygonClient.prototype, 'getAggregates', async () => {
      callCount++;
      throw new RateLimitError({
        retryAfter: 60,
        limitType: 'requests_per_minute',
      });
    });

    await assert.rejects(async () => {
      await provider.getBars({
        symbol: 'ES',
        timeframe: '5m',
        from: new Date('2024-10-01'),
        to: new Date('2024-10-02'),
      });
    }, RateLimitError);

    assert.equal(callCount, 1, 'Should call client exactly once (no automatic retry)');
  });
});

describe('provider.getBars - Empty Results', () => {
  it('should return empty array for empty results', async () => {
    const provider = createPolygonProvider({
      apiKey: 'test-api-key',
      logger: createMockLogger(),
    });

    // Mock empty response
    const emptyResponse = {
      status: 'OK',
      ticker: 'ES',
      resultsCount: 0,
      queryCount: 0,
      adjusted: true,
      results: [],
    };

    mock.method(PolygonClient.prototype, 'getAggregates', async () => emptyResponse);

    const bars = await provider.getBars({
      symbol: 'ES',
      timeframe: '5m',
      from: new Date('2024-10-01'),
      to: new Date('2024-10-02'),
    });

    assert.deepEqual(bars, [], 'Should return empty array for empty results');
  });
});
