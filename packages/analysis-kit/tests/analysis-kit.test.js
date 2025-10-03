/**
 * Test suite for @tjr/analysis-kit
 * Tests all analytics functions with fixtures and property tests
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Import compiled module
const {
  detectSwings,
  calculateDailyBias,
  extractSessionExtremes,
  classifyDayProfile,
} = require('../dist/index.js');

/**
 * Load fixture from JSON file
 */
function loadFixture(name) {
  const fixturePath = path.join(__dirname, '..', '__fixtures__', `${name}.json`);
  const content = fs.readFileSync(fixturePath, 'utf-8');
  return JSON.parse(content);
}

// ============================================================================
// Structure Tests (Swing Detection)
// ============================================================================

describe('detectSwings', () => {
  it('should detect higher highs and higher lows in uptrend', () => {
    const fixture = loadFixture('structure-swings');
    const { bars, lookback } = fixture.input;
    const expected = fixture.expected.swings;

    const result = detectSwings(bars, lookback);

    assert.strictEqual(result.length, expected.length, 'Should detect correct number of swings');

    // Verify each swing point
    for (let i = 0; i < expected.length; i++) {
      const exp = expected[i];
      const res = result[i];

      assert.strictEqual(res.index, exp.index, `Swing ${i} index mismatch`);
      assert.strictEqual(res.timestamp, exp.timestamp, `Swing ${i} timestamp mismatch`);
      assert.strictEqual(res.price, exp.price, `Swing ${i} price mismatch`);
      assert.strictEqual(res.type, exp.type, `Swing ${i} type mismatch`);
    }
  });

  it('should return empty array for insufficient data', () => {
    const bars = [{ timestamp: 1000, open: 100, high: 105, low: 99, close: 104 }];

    const result = detectSwings(bars, 5);
    assert.strictEqual(result.length, 0, 'Should return empty array when insufficient bars');
  });

  it('should handle empty bars array', () => {
    const result = detectSwings([], 5);
    assert.strictEqual(result.length, 0, 'Should return empty array for empty input');
  });

  it('should throw error for invalid lookback', () => {
    const bars = [{ timestamp: 1000, open: 100, high: 105, low: 99, close: 104 }];

    assert.throws(() => detectSwings(bars, 0), /Lookback must be at least 1/);
  });

  // Property test: Repeatability (determinism)
  it('should produce identical results on repeated calls', () => {
    const bars = [
      { timestamp: 1000, open: 100, high: 102, low: 99, close: 101 },
      { timestamp: 2000, open: 101, high: 103, low: 100, close: 102 },
      { timestamp: 3000, open: 102, high: 105, low: 101, close: 104 },
      { timestamp: 4000, open: 104, high: 106, low: 103, close: 105 },
      { timestamp: 5000, open: 105, high: 105, low: 102, close: 103 },
      { timestamp: 6000, open: 103, high: 107, low: 102, close: 106 },
    ];

    const result1 = detectSwings(bars, 2);
    const result2 = detectSwings(bars, 2);
    const result3 = detectSwings(bars, 2);

    assert.deepStrictEqual(result1, result2, 'Results should be identical (call 1 vs 2)');
    assert.deepStrictEqual(result2, result3, 'Results should be identical (call 2 vs 3)');
  });
});

// ============================================================================
// Bias Tests
// ============================================================================

describe('calculateDailyBias', () => {
  it('should detect strong bullish bias', () => {
    const fixture = loadFixture('bias-bullish');
    const { bars, sessionExtremes } = fixture.input;
    const expected = fixture.expected;

    const result = calculateDailyBias(bars, sessionExtremes);

    assert.strictEqual(result.bias, expected.bias, 'Should detect bullish bias');
    assert.ok(
      result.confidence >= expected.confidenceMin,
      `Confidence should be >= ${expected.confidenceMin}`
    );
    assert.ok(
      result.reason.toLowerCase().includes(expected.reasonContains.toLowerCase()),
      'Reason should mention key signal'
    );
  });

  it('should return neutral for empty bars', () => {
    const sessionExtremes = {
      rthOpen: 100,
      rthClose: 100,
      rthHigh: 100,
      rthLow: 100,
    };

    const result = calculateDailyBias([], sessionExtremes);
    assert.strictEqual(result.bias, 'neutral', 'Should return neutral for empty bars');
    assert.strictEqual(result.confidence, 0, 'Should have zero confidence');
  });

  // Property test: Repeatability
  it('should produce identical results on repeated calls', () => {
    const bars = [
      { timestamp: 1000, open: 100, high: 105, low: 99, close: 104 },
      { timestamp: 2000, open: 104, high: 110, low: 103, close: 108 },
    ];

    const sessionExtremes = {
      rthOpen: 100,
      rthClose: 108,
      rthHigh: 110,
      rthLow: 99,
    };

    const result1 = calculateDailyBias(bars, sessionExtremes);
    const result2 = calculateDailyBias(bars, sessionExtremes);
    const result3 = calculateDailyBias(bars, sessionExtremes);

    assert.deepStrictEqual(result1, result2, 'Results should be identical (call 1 vs 2)');
    assert.deepStrictEqual(result2, result3, 'Results should be identical (call 2 vs 3)');
  });
});

// ============================================================================
// Session Extremes Tests
// ============================================================================

describe('extractSessionExtremes', () => {
  it('should extract correct OHLC from RTH window', () => {
    const fixture = loadFixture('session-extraction');
    const { bars, rthWindow } = fixture.input;
    const expected = fixture.expected;

    // Convert window timestamps to Date objects
    const window = {
      start: new Date(rthWindow.start),
      end: new Date(rthWindow.end),
    };

    const result = extractSessionExtremes(bars, window);

    assert.ok(result !== null, 'Should return extremes');
    assert.strictEqual(result.rthOpen, expected.rthOpen, 'Open should match');
    assert.strictEqual(result.rthClose, expected.rthClose, 'Close should match');
    assert.strictEqual(result.rthHigh, expected.rthHigh, 'High should match');
    assert.strictEqual(result.rthLow, expected.rthLow, 'Low should match');
  });

  it('should return null for empty bars', () => {
    const window = {
      start: new Date(1000),
      end: new Date(3000),
    };

    const result = extractSessionExtremes([], window);
    assert.strictEqual(result, null, 'Should return null for empty bars');
  });

  it('should return null when no bars in window', () => {
    const bars = [{ timestamp: 5000, open: 100, high: 105, low: 99, close: 104 }];

    const window = {
      start: new Date(1000),
      end: new Date(2000),
    };

    const result = extractSessionExtremes(bars, window);
    assert.strictEqual(result, null, 'Should return null when no bars in window');
  });

  // Property test: Repeatability
  it('should produce identical results on repeated calls', () => {
    const bars = [
      { timestamp: 1000, open: 100, high: 105, low: 99, close: 104 },
      { timestamp: 2000, open: 104, high: 110, low: 103, close: 108 },
    ];

    const window = {
      start: new Date(1000),
      end: new Date(3000),
    };

    const result1 = extractSessionExtremes(bars, window);
    const result2 = extractSessionExtremes(bars, window);
    const result3 = extractSessionExtremes(bars, window);

    assert.deepStrictEqual(result1, result2, 'Results should be identical (call 1 vs 2)');
    assert.deepStrictEqual(result2, result3, 'Results should be identical (call 2 vs 3)');
  });
});

// ============================================================================
// Day Profile Tests
// ============================================================================

describe('classifyDayProfile', () => {
  it('should classify trend day correctly', () => {
    const fixture = loadFixture('profile-trend-day');
    const { bars, sessionExtremes } = fixture.input;
    const expected = fixture.expected;

    const result = classifyDayProfile(bars, sessionExtremes);

    assert.strictEqual(result.type, expected.type, 'Should classify as trend day (P)');
    assert.ok(
      result.volatility >= expected.volatilityMin,
      `Volatility should be >= ${expected.volatilityMin}`
    );

    // Check that all expected characteristics are present
    for (const char of expected.characteristicsContains) {
      const found = result.characteristics.some((c) =>
        c.toLowerCase().includes(char.toLowerCase())
      );
      assert.ok(found, `Characteristics should include "${char}"`);
    }
  });

  it('should return range day for empty bars', () => {
    const sessionExtremes = {
      rthOpen: 100,
      rthClose: 100,
      rthHigh: 100,
      rthLow: 100,
    };

    const result = classifyDayProfile([], sessionExtremes);
    assert.strictEqual(result.type, 'K', 'Should return range day for empty bars');
    assert.strictEqual(result.volatility, 0, 'Volatility should be zero');
  });

  // Property test: Repeatability
  it('should produce identical results on repeated calls', () => {
    const bars = [
      { timestamp: 1000, open: 100, high: 105, low: 99, close: 104 },
      { timestamp: 2000, open: 104, high: 110, low: 103, close: 108 },
    ];

    const sessionExtremes = {
      rthOpen: 100,
      rthClose: 108,
      rthHigh: 110,
      rthLow: 99,
    };

    const result1 = classifyDayProfile(bars, sessionExtremes);
    const result2 = classifyDayProfile(bars, sessionExtremes);
    const result3 = classifyDayProfile(bars, sessionExtremes);

    assert.deepStrictEqual(result1, result2, 'Results should be identical (call 1 vs 2)');
    assert.deepStrictEqual(result2, result3, 'Results should be identical (call 2 vs 3)');
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration', () => {
  it('should work together: extract extremes, calculate bias, classify profile', () => {
    const bars = [
      { timestamp: 1000, open: 100, high: 105, low: 99, close: 104 },
      { timestamp: 2000, open: 104, high: 110, low: 103, close: 108 },
      { timestamp: 3000, open: 108, high: 115, low: 107, close: 114 },
    ];

    const window = {
      start: new Date(1000),
      end: new Date(4000),
    };

    // 1. Extract session extremes
    const extremes = extractSessionExtremes(bars, window);
    assert.ok(extremes !== null, 'Should extract extremes');

    // 2. Calculate bias
    const bias = calculateDailyBias(bars, extremes);
    assert.strictEqual(bias.bias, 'bullish', 'Should detect bullish bias');

    // 3. Classify profile
    const profile = classifyDayProfile(bars, extremes);
    assert.ok(['P', 'K', 'D'].includes(profile.type), 'Should classify profile');

    // 4. Detect swings
    const swings = detectSwings(bars, 1);
    assert.ok(Array.isArray(swings), 'Should detect swings');
  });
});
