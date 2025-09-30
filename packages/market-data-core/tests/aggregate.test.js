/**
 * Golden test cases for bar aggregation.
 *
 * These tests verify that aggregateBars() produces correct output for known
 * input/output pairs. All test cases use fixed timestamps and values to ensure
 * deterministic behavior.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aggregateBars } from "../dist/aggregate.js";

/**
 * Helper: Create a timestamp from a time string (UTC, on 2025-09-29)
 * @param {string} time - Time in HH:MM format
 * @returns {number} Unix epoch milliseconds
 */
function ts(time) {
  return new Date(`2025-09-29T${time}:00.000Z`).getTime();
}

/**
 * Golden Case 1: 10× 1m bars (14:00-14:09) → 2× 5m bars (14:00, 14:05)
 */
describe("Golden Case: 1m → 5m (10 bars → 2 bars)", () => {
  it("should aggregate 10 one-minute bars into 2 five-minute bars", () => {
    const bars1m = [
      { timestamp: ts("14:00"), open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
      { timestamp: ts("14:01"), open: 100.5, high: 102, low: 100, close: 101, volume: 1200 },
      { timestamp: ts("14:02"), open: 101, high: 101.5, low: 100.5, close: 101, volume: 900 },
      { timestamp: ts("14:03"), open: 101, high: 101.8, low: 100.8, close: 101.2, volume: 1100 },
      { timestamp: ts("14:04"), open: 101.2, high: 102, low: 101, close: 101.5, volume: 1300 },
      { timestamp: ts("14:05"), open: 101.5, high: 102, low: 101, close: 101.8, volume: 1000 },
      { timestamp: ts("14:06"), open: 101.8, high: 102.5, low: 101.5, close: 102, volume: 1400 },
      { timestamp: ts("14:07"), open: 102, high: 102.2, low: 101.8, close: 102, volume: 1000 },
      { timestamp: ts("14:08"), open: 102, high: 102.5, low: 102, close: 102.3, volume: 1200 },
      { timestamp: ts("14:09"), open: 102.3, high: 103, low: 102, close: 102.8, volume: 1500 },
    ];

    const bars5m = aggregateBars(bars1m, "5m");

    assert.equal(bars5m.length, 2, "Should produce 2 five-minute bars");

    // First bar: 14:00-14:05 (includes bars at 14:00, 14:01, 14:02, 14:03, 14:04)
    assert.deepEqual(bars5m[0], {
      timestamp: ts("14:00"),
      open: 100, // First bar's open
      high: 102, // Max of all highs (102 at 14:01)
      low: 99, // Min of all lows (99 at 14:00)
      close: 101.5, // Last bar's close (14:04)
      volume: 5500, // Sum: 1000+1200+900+1100+1300
    });

    // Second bar: 14:05-14:10 (includes bars at 14:05, 14:06, 14:07, 14:08, 14:09)
    assert.deepEqual(bars5m[1], {
      timestamp: ts("14:05"),
      open: 101.5, // First bar's open
      high: 103, // Max of all highs (103 at 14:09)
      low: 101, // Min of all lows (101 at 14:05)
      close: 102.8, // Last bar's close (14:09)
      volume: 6100, // Sum: 1000+1400+1000+1200+1500
    });
  });
});

/**
 * Golden Case 2: 10× 1m bars (14:00-14:09) → 1× 10m bar (14:00)
 */
describe("Golden Case: 1m → 10m (10 bars → 1 bar)", () => {
  it("should aggregate 10 one-minute bars into 1 ten-minute bar", () => {
    const bars1m = [
      { timestamp: ts("14:00"), open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
      { timestamp: ts("14:01"), open: 100.5, high: 102, low: 100, close: 101, volume: 1200 },
      { timestamp: ts("14:02"), open: 101, high: 101.5, low: 100.5, close: 101, volume: 900 },
      { timestamp: ts("14:03"), open: 101, high: 101.8, low: 100.8, close: 101.2, volume: 1100 },
      { timestamp: ts("14:04"), open: 101.2, high: 102, low: 101, close: 101.5, volume: 1300 },
      { timestamp: ts("14:05"), open: 101.5, high: 102, low: 101, close: 101.8, volume: 1000 },
      { timestamp: ts("14:06"), open: 101.8, high: 102.5, low: 101.5, close: 102, volume: 1400 },
      { timestamp: ts("14:07"), open: 102, high: 102.2, low: 101.8, close: 102, volume: 1000 },
      { timestamp: ts("14:08"), open: 102, high: 102.5, low: 102, close: 102.3, volume: 1200 },
      { timestamp: ts("14:09"), open: 102.3, high: 103, low: 102, close: 102.8, volume: 1500 },
    ];

    const bars10m = aggregateBars(bars1m, "10m");

    assert.equal(bars10m.length, 1, "Should produce 1 ten-minute bar");

    // Single bar: 14:00-14:10 (all 10 bars)
    assert.deepEqual(bars10m[0], {
      timestamp: ts("14:00"),
      open: 100, // First bar's open
      high: 103, // Max of all highs (103 at 14:09)
      low: 99, // Min of all lows (99 at 14:00)
      close: 102.8, // Last bar's close (14:09)
      volume: 11600, // Sum of all volumes
    });
  });
});

/**
 * Golden Case 3: 6× 1h bars (00:00-05:00) → 1× 4h bar (00:00) + partial excluded
 */
describe("Golden Case: 1h → 4h (6 bars → 1 bar, partial excluded)", () => {
  it("should aggregate 6 one-hour bars into 1 four-hour bar, excluding partial", () => {
    const bars1h = [
      { timestamp: ts("00:00"), open: 100, high: 102, low: 99, close: 101, volume: 10000 },
      { timestamp: ts("01:00"), open: 101, high: 103, low: 100, close: 102, volume: 12000 },
      { timestamp: ts("02:00"), open: 102, high: 104, low: 101, close: 103, volume: 11000 },
      { timestamp: ts("03:00"), open: 103, high: 105, low: 102, close: 104, volume: 13000 },
      { timestamp: ts("04:00"), open: 104, high: 106, low: 103, close: 105, volume: 14000 },
      { timestamp: ts("05:00"), open: 105, high: 107, low: 104, close: 106, volume: 15000 },
    ];

    const bars4h = aggregateBars(bars1h, "4h");

    assert.equal(bars4h.length, 1, "Should produce 1 four-hour bar (partial at 04:00 excluded)");

    // First complete bar: 00:00-04:00 (includes bars at 00:00, 01:00, 02:00, 03:00)
    assert.deepEqual(bars4h[0], {
      timestamp: ts("00:00"),
      open: 100,
      high: 105, // Max of highs (105 at 03:00)
      low: 99, // Min of lows (99 at 00:00)
      close: 104, // Last bar's close (03:00)
      volume: 46000, // Sum: 10000+12000+11000+13000
    });

    // Note: Bars at 04:00 and 05:00 are excluded because they don't form a complete 4h bar
  });

  it("should include partial last bar when includePartialLast=true", () => {
    const bars1h = [
      { timestamp: ts("00:00"), open: 100, high: 102, low: 99, close: 101, volume: 10000 },
      { timestamp: ts("01:00"), open: 101, high: 103, low: 100, close: 102, volume: 12000 },
      { timestamp: ts("02:00"), open: 102, high: 104, low: 101, close: 103, volume: 11000 },
      { timestamp: ts("03:00"), open: 103, high: 105, low: 102, close: 104, volume: 13000 },
      { timestamp: ts("04:00"), open: 104, high: 106, low: 103, close: 105, volume: 14000 },
      { timestamp: ts("05:00"), open: 105, high: 107, low: 104, close: 106, volume: 15000 },
    ];

    const bars4h = aggregateBars(bars1h, "4h", { includePartialLast: true });

    assert.equal(bars4h.length, 2, "Should produce 2 bars (second is partial)");

    // Second partial bar: 04:00-08:00 (only includes bars at 04:00, 05:00)
    assert.deepEqual(bars4h[1], {
      timestamp: ts("04:00"),
      open: 104,
      high: 107, // Max of highs (107 at 05:00)
      low: 103, // Min of lows (103 at 04:00)
      close: 106, // Last bar's close (05:00)
      volume: 29000, // Sum: 14000+15000
    });
  });
});

/**
 * Property Test: Volume Conservation
 *
 * The sum of all input volumes must equal the sum of all output volumes.
 */
describe("Property: Volume Conservation", () => {
  it("should conserve total volume across aggregation", () => {
    const bars1m = Array.from({ length: 60 }, (_, i) => ({
      timestamp: ts("14:00") + i * 60_000,
      open: 100 + i * 0.1,
      high: 101 + i * 0.1,
      low: 99 + i * 0.1,
      close: 100.5 + i * 0.1,
      volume: 1000 + i * 10,
    }));

    const bars5m = aggregateBars(bars1m, "5m");

    const totalVolumeInput = bars1m.reduce((sum, bar) => sum + bar.volume, 0);
    const totalVolumeOutput = bars5m.reduce((sum, bar) => sum + bar.volume, 0);

    assert.equal(totalVolumeOutput, totalVolumeInput, "Total volume must be conserved");
  });
});

/**
 * Property Test: Monotonicity
 *
 * Output timestamps must be strictly increasing.
 */
describe("Property: Monotonicity", () => {
  it("should produce strictly increasing timestamps", () => {
    const bars1m = Array.from({ length: 60 }, (_, i) => ({
      timestamp: ts("14:00") + i * 60_000,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 1000,
    }));

    const bars5m = aggregateBars(bars1m, "5m");

    for (let i = 1; i < bars5m.length; i++) {
      assert.ok(
        bars5m[i].timestamp > bars5m[i - 1].timestamp,
        `bars5m[${i}].timestamp should be > bars5m[${i - 1}].timestamp`
      );
    }
  });
});

/**
 * Property Test: OHLC Invariants
 *
 * For each bar: high >= max(open, close) and low <= min(open, close)
 */
describe("Property: OHLC Invariants", () => {
  it("should preserve OHLC relationships in aggregated bars", () => {
    const bars1m = Array.from({ length: 60 }, (_, i) => ({
      timestamp: ts("14:00") + i * 60_000,
      open: 100 + Math.random() * 2,
      high: 102 + Math.random() * 2,
      low: 98 + Math.random() * 2,
      close: 100 + Math.random() * 2,
      volume: 1000,
    }));

    const bars5m = aggregateBars(bars1m, "5m");

    for (const bar of bars5m) {
      assert.ok(bar.high >= bar.open, "high should be >= open");
      assert.ok(bar.high >= bar.close, "high should be >= close");
      assert.ok(bar.low <= bar.open, "low should be <= open");
      assert.ok(bar.low <= bar.close, "low should be <= close");
    }
  });
});

/**
 * Edge Case: Empty Input
 */
describe("Edge Case: Empty Input", () => {
  it("should return empty array for empty input", () => {
    const result = aggregateBars([], "5m");
    assert.deepEqual(result, []);
  });
});

/**
 * Edge Case: Single Bar
 */
describe("Edge Case: Single Bar", () => {
  it("should return single bar if aligned and complete", () => {
    const bars = [{ timestamp: ts("14:00"), open: 100, high: 101, low: 99, close: 100.5, volume: 1000 }];
    const result = aggregateBars(bars, "1m");
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], bars[0]);
  });
});