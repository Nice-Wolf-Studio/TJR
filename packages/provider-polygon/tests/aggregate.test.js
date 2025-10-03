/**
 * Tests for Polygon.io timeframe aggregation.
 *
 * These tests verify that aggregation from native Polygon timeframes (5m, 1h)
 * to non-native timeframes (10m, 2h, 4h) produces correct results with proper
 * OHLC semantics and volume conservation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getSourceTimeframe,
  toPolygonParams,
  aggregateToTimeframe,
  requiresAggregation,
  estimateAggregatedCount,
  POLYGON_NATIVE_TIMEFRAMES,
  POLYGON_AGGREGATED_TIMEFRAMES,
  POLYGON_SUPPORTED_TIMEFRAMES,
} from '../dist/src/aggregate.js';
import { parseAggregatesResponse } from '../dist/src/parse.js';

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

describe('Timeframe Constants', () => {
  it('should define correct native timeframes', () => {
    assert.deepEqual(POLYGON_NATIVE_TIMEFRAMES, ['1m', '5m', '15m', '30m', '1h', '1D']);
  });

  it('should define correct aggregated timeframes', () => {
    assert.deepEqual(POLYGON_AGGREGATED_TIMEFRAMES, ['10m', '2h', '4h']);
  });

  it('should define all supported timeframes', () => {
    const expected = ['1m', '5m', '15m', '30m', '1h', '1D', '10m', '2h', '4h'];
    assert.deepEqual(POLYGON_SUPPORTED_TIMEFRAMES, expected);
  });
});

describe('requiresAggregation', () => {
  it('should return false for native timeframes', () => {
    assert.equal(requiresAggregation('1m'), false);
    assert.equal(requiresAggregation('5m'), false);
    assert.equal(requiresAggregation('15m'), false);
    assert.equal(requiresAggregation('30m'), false);
    assert.equal(requiresAggregation('1h'), false);
    assert.equal(requiresAggregation('1D'), false);
  });

  it('should return true for aggregated timeframes', () => {
    assert.equal(requiresAggregation('10m'), true);
    assert.equal(requiresAggregation('2h'), true);
    assert.equal(requiresAggregation('4h'), true);
  });
});

describe('getSourceTimeframe', () => {
  it('should return same timeframe for native timeframes', () => {
    assert.equal(getSourceTimeframe('1m'), '1m');
    assert.equal(getSourceTimeframe('5m'), '5m');
    assert.equal(getSourceTimeframe('15m'), '15m');
    assert.equal(getSourceTimeframe('30m'), '30m');
    assert.equal(getSourceTimeframe('1h'), '1h');
    assert.equal(getSourceTimeframe('1D'), '1D');
  });

  it('should return correct source timeframe for aggregated timeframes', () => {
    assert.equal(getSourceTimeframe('10m'), '5m', '10m should use 5m source');
    assert.equal(getSourceTimeframe('2h'), '1h', '2h should use 1h source');
    assert.equal(getSourceTimeframe('4h'), '1h', '4h should use 1h source');
  });
});

describe('toPolygonParams', () => {
  it('should convert minute timeframes correctly', () => {
    assert.deepEqual(toPolygonParams('1m'), { multiplier: 1, timespan: 'minute' });
    assert.deepEqual(toPolygonParams('5m'), { multiplier: 5, timespan: 'minute' });
    assert.deepEqual(toPolygonParams('15m'), { multiplier: 15, timespan: 'minute' });
    assert.deepEqual(toPolygonParams('30m'), { multiplier: 30, timespan: 'minute' });
  });

  it('should convert hour timeframes correctly', () => {
    assert.deepEqual(toPolygonParams('1h'), { multiplier: 1, timespan: 'hour' });
  });

  it('should convert daily timeframe correctly', () => {
    assert.deepEqual(toPolygonParams('1D'), { multiplier: 1, timespan: 'day' });
  });

  it('should throw error for unsupported timeframe', () => {
    assert.throws(
      () => toPolygonParams('3h'),
      /Unsupported timeframe/,
      'Should throw for unsupported timeframe'
    );
  });
});

describe('aggregateToTimeframe - Native Timeframes (No Aggregation)', () => {
  it('should return bars as-is for native 5m timeframe', () => {
    const response = loadFixture('polygon-intraday-5m.json');
    const bars = parseAggregatesResponse(response);
    const result = aggregateToTimeframe(bars, '5m');

    assert.equal(result.length, bars.length, 'Should return same number of bars');
    assert.deepEqual(result, bars, 'Should return exact same bars');
  });

  it('should return bars as-is for native 1D timeframe', () => {
    const response = loadFixture('polygon-daily-10days.json');
    const bars = parseAggregatesResponse(response);
    const result = aggregateToTimeframe(bars, '1D');

    assert.equal(result.length, bars.length, 'Should return same number of bars');
    assert.deepEqual(result, bars, 'Should return exact same bars');
  });
});

describe('aggregateToTimeframe - 5m → 10m Aggregation', () => {
  it('should aggregate 20 bars of 5m data into 10 bars of 10m data', () => {
    const response = loadFixture('polygon-intraday-5m.json');
    const bars5m = parseAggregatesResponse(response);
    const bars10m = aggregateToTimeframe(bars5m, '10m');

    assert.equal(bars10m.length, 10, 'Should produce 10 ten-minute bars from 20 five-minute bars');
  });

  it('should preserve OHLC semantics in aggregated 10m bars', () => {
    const response = loadFixture('polygon-intraday-5m.json');
    const bars5m = parseAggregatesResponse(response);
    const bars10m = aggregateToTimeframe(bars5m, '10m');

    // First 10m bar should aggregate first 2 5m bars
    const first10m = bars10m[0];
    const firstTwo5m = bars5m.slice(0, 2);

    // Open should be from first bar
    assert.equal(first10m.open, firstTwo5m[0].open, 'Open should be from first 5m bar');

    // Close should be from last bar
    assert.equal(first10m.close, firstTwo5m[1].close, 'Close should be from last 5m bar');

    // High should be max of all highs
    const expectedHigh = Math.max(...firstTwo5m.map((b) => b.high));
    assert.equal(first10m.high, expectedHigh, 'High should be max of 5m highs');

    // Low should be min of all lows
    const expectedLow = Math.min(...firstTwo5m.map((b) => b.low));
    assert.equal(first10m.low, expectedLow, 'Low should be min of 5m lows');

    // Volume should be sum of all volumes
    const expectedVolume = firstTwo5m.reduce((sum, b) => sum + b.volume, 0);
    assert.equal(first10m.volume, expectedVolume, 'Volume should be sum of 5m volumes');
  });

  it('should conserve total volume in 5m → 10m aggregation', () => {
    const response = loadFixture('polygon-intraday-5m.json');
    const bars5m = parseAggregatesResponse(response);
    const bars10m = aggregateToTimeframe(bars5m, '10m');

    const totalVolume5m = bars5m.reduce((sum, bar) => sum + bar.volume, 0);
    const totalVolume10m = bars10m.reduce((sum, bar) => sum + bar.volume, 0);

    assert.equal(
      totalVolume10m,
      totalVolume5m,
      'Total volume must be conserved during aggregation'
    );
  });

  it('should maintain monotonic timestamps in 10m bars', () => {
    const response = loadFixture('polygon-intraday-5m.json');
    const bars5m = parseAggregatesResponse(response);
    const bars10m = aggregateToTimeframe(bars5m, '10m');

    for (let i = 1; i < bars10m.length; i++) {
      assert.ok(
        bars10m[i].timestamp > bars10m[i - 1].timestamp,
        `Bar ${i} timestamp should be greater than bar ${i - 1}`
      );
    }
  });

  it('should validate OHLC invariants in 10m bars', () => {
    const response = loadFixture('polygon-intraday-5m.json');
    const bars5m = parseAggregatesResponse(response);
    const bars10m = aggregateToTimeframe(bars5m, '10m');

    for (const bar of bars10m) {
      assert.ok(bar.high >= bar.open, 'high should be >= open');
      assert.ok(bar.high >= bar.close, 'high should be >= close');
      assert.ok(bar.low <= bar.open, 'low should be <= open');
      assert.ok(bar.low <= bar.close, 'low should be <= close');
      assert.ok(bar.high >= bar.low, 'high should be >= low');
    }
  });
});

describe('aggregateToTimeframe - Tolerance Checks', () => {
  it('should produce 10m bars within tolerance of expected values', () => {
    const response = loadFixture('polygon-intraday-5m.json');
    const bars5m = parseAggregatesResponse(response);
    const bars10m = aggregateToTimeframe(bars5m, '10m');

    // First 10m bar aggregates bars at indices 0 and 1
    const first10m = bars10m[0];
    const firstTwo5m = bars5m.slice(0, 2);

    // Expected values
    const expectedOpen = firstTwo5m[0].open; // 4500.00
    const expectedClose = firstTwo5m[1].close; // 4502.00
    const expectedHigh = Math.max(firstTwo5m[0].high, firstTwo5m[1].high); // 4503.00
    const expectedLow = Math.min(firstTwo5m[0].low, firstTwo5m[1].low); // 4499.50
    const expectedVolume = firstTwo5m[0].volume + firstTwo5m[1].volume; // 75000 + 78000

    // Tolerance for price: 0.01 (1 cent)
    const priceTolerance = 0.01;

    assert.ok(
      Math.abs(first10m.open - expectedOpen) < priceTolerance,
      `Open should be within tolerance: expected ${expectedOpen}, got ${first10m.open}`
    );

    assert.ok(
      Math.abs(first10m.close - expectedClose) < priceTolerance,
      `Close should be within tolerance: expected ${expectedClose}, got ${first10m.close}`
    );

    assert.ok(
      Math.abs(first10m.high - expectedHigh) < priceTolerance,
      `High should be within tolerance: expected ${expectedHigh}, got ${first10m.high}`
    );

    assert.ok(
      Math.abs(first10m.low - expectedLow) < priceTolerance,
      `Low should be within tolerance: expected ${expectedLow}, got ${first10m.low}`
    );

    // Volume should be exact (no tolerance)
    assert.equal(
      first10m.volume,
      expectedVolume,
      `Volume should be exact: expected ${expectedVolume}, got ${first10m.volume}`
    );
  });

  it('should aggregate all 10m bars within price tolerance', () => {
    const response = loadFixture('polygon-intraday-5m.json');
    const bars5m = parseAggregatesResponse(response);
    const bars10m = aggregateToTimeframe(bars5m, '10m');

    const priceTolerance = 0.01;

    // Verify each 10m bar against its source 5m bars
    for (let i = 0; i < bars10m.length; i++) {
      const bar10m = bars10m[i];
      const source5m = bars5m.slice(i * 2, (i + 1) * 2);

      const expectedOpen = source5m[0].open;
      const expectedClose = source5m[source5m.length - 1].close;
      const expectedHigh = Math.max(...source5m.map((b) => b.high));
      const expectedLow = Math.min(...source5m.map((b) => b.low));

      assert.ok(
        Math.abs(bar10m.open - expectedOpen) < priceTolerance,
        `Bar ${i}: Open within tolerance`
      );

      assert.ok(
        Math.abs(bar10m.close - expectedClose) < priceTolerance,
        `Bar ${i}: Close within tolerance`
      );

      assert.ok(
        Math.abs(bar10m.high - expectedHigh) < priceTolerance,
        `Bar ${i}: High within tolerance`
      );

      assert.ok(
        Math.abs(bar10m.low - expectedLow) < priceTolerance,
        `Bar ${i}: Low within tolerance`
      );
    }
  });
});

describe('estimateAggregatedCount', () => {
  it('should estimate correct count for 5m → 10m', () => {
    const estimated = estimateAggregatedCount(20, '5m', '10m');
    assert.equal(estimated, 10, '20 bars of 5m → 10 bars of 10m');
  });

  it('should estimate correct count for 1h → 2h', () => {
    const estimated = estimateAggregatedCount(10, '1h', '2h');
    assert.equal(estimated, 5, '10 bars of 1h → 5 bars of 2h');
  });

  it('should estimate correct count for 1h → 4h', () => {
    const estimated = estimateAggregatedCount(100, '1h', '4h');
    assert.equal(estimated, 25, '100 bars of 1h → 25 bars of 4h');
  });

  it('should return same count for native timeframes', () => {
    const estimated = estimateAggregatedCount(50, '5m', '5m');
    assert.equal(estimated, 50, '50 bars of 5m → 50 bars of 5m (no aggregation)');
  });
});

describe('aggregateToTimeframe - Edge Cases', () => {
  it('should handle empty input array', () => {
    const result = aggregateToTimeframe([], '10m');
    assert.deepEqual(result, [], 'Should return empty array for empty input');
  });

  it('should handle single bar (insufficient for aggregation)', () => {
    const bars5m = [
      {
        timestamp: 1727787000000,
        open: 4500.0,
        high: 4502.0,
        low: 4499.5,
        close: 4501.0,
        volume: 75000,
      },
    ];

    const bars10m = aggregateToTimeframe(bars5m, '10m');

    // With includePartialLast: false (default), should exclude partial bar
    assert.equal(bars10m.length, 0, 'Should exclude partial bar');
  });

  it('should handle odd number of bars (last bar partial)', () => {
    const response = loadFixture('polygon-intraday-5m.json');
    const bars5m = parseAggregatesResponse(response);

    // Take 19 bars (odd number)
    const bars5m_odd = bars5m.slice(0, 19);
    const bars10m = aggregateToTimeframe(bars5m_odd, '10m');

    // With includePartialLast: false, should produce 9 complete bars (excluding last partial)
    assert.equal(bars10m.length, 9, 'Should produce 9 complete bars, excluding last partial');
  });
});

describe('aggregateToTimeframe - 1h → 4h Aggregation', () => {
  it('should aggregate 1h bars into 4h bars', () => {
    // Create 8 hours of data to test 4h aggregation
    const bars1h = [
      { timestamp: 1727712000000, open: 4500, high: 4502, low: 4498, close: 4501, volume: 100000 },
      { timestamp: 1727715600000, open: 4501, high: 4505, low: 4500, close: 4503, volume: 110000 },
      { timestamp: 1727719200000, open: 4503, high: 4508, low: 4502, close: 4506, volume: 105000 },
      { timestamp: 1727722800000, open: 4506, high: 4510, low: 4505, close: 4508, volume: 115000 },
      { timestamp: 1727726400000, open: 4508, high: 4512, low: 4507, close: 4510, volume: 120000 },
      { timestamp: 1727730000000, open: 4510, high: 4515, low: 4509, close: 4513, volume: 125000 },
      { timestamp: 1727733600000, open: 4513, high: 4518, low: 4512, close: 4516, volume: 130000 },
      { timestamp: 1727737200000, open: 4516, high: 4520, low: 4515, close: 4518, volume: 135000 },
    ];

    const bars4h = aggregateToTimeframe(bars1h, '4h');

    assert.equal(bars4h.length, 2, 'Should produce 2 four-hour bars from 8 one-hour bars');

    // First 4h bar should aggregate first 4 1h bars
    const first4h = bars4h[0];
    assert.equal(first4h.open, 4500, 'First 4h bar open should be from first 1h bar');
    assert.equal(first4h.close, 4508, 'First 4h bar close should be from 4th 1h bar');
    assert.equal(first4h.high, 4510, 'First 4h bar high should be max of first 4 1h bars');
    assert.equal(first4h.low, 4498, 'First 4h bar low should be min of first 4 1h bars');
    assert.equal(first4h.volume, 430000, 'First 4h bar volume should be sum of first 4 1h bars');

    // Second 4h bar should aggregate last 4 1h bars
    const second4h = bars4h[1];
    assert.equal(second4h.open, 4508, 'Second 4h bar open should be from 5th 1h bar');
    assert.equal(second4h.close, 4518, 'Second 4h bar close should be from 8th 1h bar');
    assert.equal(second4h.high, 4520, 'Second 4h bar high should be max of last 4 1h bars');
    assert.equal(second4h.low, 4507, 'Second 4h bar low should be min of last 4 1h bars');
    assert.equal(second4h.volume, 510000, 'Second 4h bar volume should be sum of last 4 1h bars');
  });

  it('should conserve volume in 1h → 4h aggregation', () => {
    const bars1h = [
      { timestamp: 1727712000000, open: 4500, high: 4502, low: 4498, close: 4501, volume: 100000 },
      { timestamp: 1727715600000, open: 4501, high: 4505, low: 4500, close: 4503, volume: 110000 },
      { timestamp: 1727719200000, open: 4503, high: 4508, low: 4502, close: 4506, volume: 105000 },
      { timestamp: 1727722800000, open: 4506, high: 4510, low: 4505, close: 4508, volume: 115000 },
      { timestamp: 1727726400000, open: 4508, high: 4512, low: 4507, close: 4510, volume: 120000 },
      { timestamp: 1727730000000, open: 4510, high: 4515, low: 4509, close: 4513, volume: 125000 },
      { timestamp: 1727733600000, open: 4513, high: 4518, low: 4512, close: 4516, volume: 130000 },
      { timestamp: 1727737200000, open: 4516, high: 4520, low: 4515, close: 4518, volume: 135000 },
    ];

    const bars4h = aggregateToTimeframe(bars1h, '4h');

    const totalVolume1h = bars1h.reduce((sum, bar) => sum + bar.volume, 0);
    const totalVolume4h = bars4h.reduce((sum, bar) => sum + bar.volume, 0);

    assert.equal(totalVolume4h, totalVolume1h, 'Total volume must be conserved');
  });
});
