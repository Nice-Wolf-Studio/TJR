/**
 * Tests for bar clipping utilities.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clipBars } from "../dist/clip.js";

/**
 * Helper: Create a timestamp from a time string (UTC, on 2025-09-29)
 */
function ts(time) {
  return new Date(`2025-09-29T${time}:00.000Z`).getTime();
}

/**
 * Test Suite: Basic Clipping
 */
describe("clipBars() - Basic Clipping", () => {
  const bars = [
    { timestamp: ts("14:00"), open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
    { timestamp: ts("14:01"), open: 100.5, high: 102, low: 100, close: 101, volume: 1200 },
    { timestamp: ts("14:02"), open: 101, high: 101.5, low: 100.5, close: 101, volume: 900 },
    { timestamp: ts("14:03"), open: 101, high: 101.8, low: 100.8, close: 101.2, volume: 1100 },
    { timestamp: ts("14:04"), open: 101.2, high: 102, low: 101, close: 101.5, volume: 1300 },
    { timestamp: ts("14:05"), open: 101.5, high: 102, low: 101, close: 101.8, volume: 1000 },
  ];

  it("should clip to range [14:01, 14:04)", () => {
    const clipped = clipBars(bars, ts("14:01"), ts("14:04"));
    assert.equal(clipped.length, 3); // bars at 14:01, 14:02, 14:03
    assert.equal(clipped[0].timestamp, ts("14:01"));
    assert.equal(clipped[1].timestamp, ts("14:02"));
    assert.equal(clipped[2].timestamp, ts("14:03"));
  });

  it("should clip from 14:02 onward (no 'to' specified)", () => {
    const clipped = clipBars(bars, ts("14:02"));
    assert.equal(clipped.length, 4); // bars at 14:02, 14:03, 14:04, 14:05
    assert.equal(clipped[0].timestamp, ts("14:02"));
    assert.equal(clipped[3].timestamp, ts("14:05"));
  });

  it("should clip up to 14:03 (no 'from' specified)", () => {
    const clipped = clipBars(bars, undefined, ts("14:03"));
    assert.equal(clipped.length, 3); // bars at 14:00, 14:01, 14:02
    assert.equal(clipped[0].timestamp, ts("14:00"));
    assert.equal(clipped[2].timestamp, ts("14:02"));
  });

  it("should return all bars when no 'from' or 'to' specified", () => {
    const clipped = clipBars(bars);
    assert.equal(clipped.length, bars.length);
    assert.deepEqual(clipped, bars);
  });
});

/**
 * Test Suite: Edge Cases
 */
describe("clipBars() - Edge Cases", () => {
  const bars = [
    { timestamp: ts("14:00"), open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
    { timestamp: ts("14:01"), open: 100.5, high: 102, low: 100, close: 101, volume: 1200 },
    { timestamp: ts("14:02"), open: 101, high: 101.5, low: 100.5, close: 101, volume: 900 },
  ];

  it("should return empty array for empty input", () => {
    const clipped = clipBars([], ts("14:00"), ts("14:05"));
    assert.deepEqual(clipped, []);
  });

  it("should return empty array when 'from' >= 'to'", () => {
    const clipped = clipBars(bars, ts("14:05"), ts("14:05"));
    assert.deepEqual(clipped, []);
  });

  it("should return empty array when 'from' > 'to'", () => {
    const clipped = clipBars(bars, ts("14:05"), ts("14:00"));
    assert.deepEqual(clipped, []);
  });

  it("should return empty array when no bars in range", () => {
    const clipped = clipBars(bars, ts("15:00"), ts("16:00"));
    assert.deepEqual(clipped, []);
  });

  it("should clip correctly when 'from' is before first bar", () => {
    const clipped = clipBars(bars, ts("13:00"), ts("14:01"));
    assert.equal(clipped.length, 1); // only bar at 14:00
    assert.equal(clipped[0].timestamp, ts("14:00"));
  });

  it("should clip correctly when 'to' is after last bar", () => {
    const clipped = clipBars(bars, ts("14:01"), ts("15:00"));
    assert.equal(clipped.length, 2); // bars at 14:01, 14:02
    assert.equal(clipped[0].timestamp, ts("14:01"));
    assert.equal(clipped[1].timestamp, ts("14:02"));
  });

  it("should handle single bar in range", () => {
    const clipped = clipBars(bars, ts("14:01"), ts("14:02"));
    assert.equal(clipped.length, 1); // only bar at 14:01
    assert.equal(clipped[0].timestamp, ts("14:01"));
  });
});

/**
 * Test Suite: Boundary Conditions
 */
describe("clipBars() - Boundary Conditions", () => {
  const bars = [
    { timestamp: ts("14:00"), open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
    { timestamp: ts("14:01"), open: 100.5, high: 102, low: 100, close: 101, volume: 1200 },
    { timestamp: ts("14:02"), open: 101, high: 101.5, low: 100.5, close: 101, volume: 900 },
  ];

  it("should include bar at 'from' (inclusive)", () => {
    const clipped = clipBars(bars, ts("14:01"), ts("14:03"));
    assert.equal(clipped[0].timestamp, ts("14:01")); // 'from' is inclusive
  });

  it("should exclude bar at 'to' (exclusive)", () => {
    const clipped = clipBars(bars, ts("14:00"), ts("14:02"));
    assert.equal(clipped.length, 2); // bars at 14:00, 14:01 (14:02 excluded)
    assert.equal(clipped[clipped.length - 1].timestamp, ts("14:01"));
  });

  it("should work with exact timestamp match", () => {
    const clipped = clipBars(bars, ts("14:01"), ts("14:02"));
    assert.equal(clipped.length, 1); // only bar at 14:01
    assert.equal(clipped[0].timestamp, ts("14:01"));
  });
});

/**
 * Test Suite: Performance (Binary Search)
 *
 * Verify that clipping large datasets is efficient (should use binary search).
 */
describe("clipBars() - Performance", () => {
  it("should handle large datasets efficiently", () => {
    // Create 10,000 bars (simulating a large dataset)
    const bars = Array.from({ length: 10_000 }, (_, i) => ({
      timestamp: ts("00:00") + i * 60_000, // 1-minute bars starting at 00:00
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 1000,
    }));

    // Clip to a small range (should be fast due to binary search)
    const start = performance.now();
    const clipped = clipBars(bars, ts("05:00"), ts("05:10"));
    const elapsed = performance.now() - start;

    assert.equal(clipped.length, 10); // 10 bars from 05:00 to 05:09
    assert.ok(elapsed < 5, `Clipping should be fast (took ${elapsed}ms)`);
  });
});