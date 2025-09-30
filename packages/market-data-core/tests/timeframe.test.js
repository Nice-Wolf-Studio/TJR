/**
 * Tests for timeframe utilities (normalization, conversion, alignment).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toMillis, normalizeTimeframe, alignTimestamp, isAligned } from "../dist/timeframe.js";

/**
 * Test Suite: toMillis()
 */
describe("toMillis()", () => {
  it("should convert canonical timeframes to milliseconds", () => {
    assert.equal(toMillis("1m"), 60_000);
    assert.equal(toMillis("5m"), 300_000);
    assert.equal(toMillis("10m"), 600_000);
    assert.equal(toMillis("15m"), 900_000);
    assert.equal(toMillis("30m"), 1_800_000);
    assert.equal(toMillis("1h"), 3_600_000);
    assert.equal(toMillis("2h"), 7_200_000);
    assert.equal(toMillis("4h"), 14_400_000);
    assert.equal(toMillis("1D"), 86_400_000);
  });
});

/**
 * Test Suite: normalizeTimeframe()
 */
describe("normalizeTimeframe()", () => {
  it("should return canonical timeframes unchanged", () => {
    assert.equal(normalizeTimeframe("1m"), "1m");
    assert.equal(normalizeTimeframe("5m"), "5m");
    assert.equal(normalizeTimeframe("1h"), "1h");
    assert.equal(normalizeTimeframe("4h"), "4h");
    assert.equal(normalizeTimeframe("1D"), "1D");
  });

  it("should normalize common aliases", () => {
    // Minute aliases
    assert.equal(normalizeTimeframe("1min"), "1m");
    assert.equal(normalizeTimeframe("60s"), "1m");
    assert.equal(normalizeTimeframe("minute"), "1m");

    // Hour aliases
    assert.equal(normalizeTimeframe("1hour"), "1h");
    assert.equal(normalizeTimeframe("hour"), "1h");
    assert.equal(normalizeTimeframe("60m"), "1h");

    // Daily aliases
    assert.equal(normalizeTimeframe("D"), "1D");
    assert.equal(normalizeTimeframe("day"), "1D");
    assert.equal(normalizeTimeframe("daily"), "1D");
  });

  it("should throw error for unsupported timeframes", () => {
    assert.throws(() => normalizeTimeframe("3m"), /Unsupported timeframe: 3m/);
    assert.throws(() => normalizeTimeframe("7m"), /Unsupported timeframe: 7m/);
    assert.throws(() => normalizeTimeframe("999h"), /Unsupported timeframe: 999h/);
  });
});

/**
 * Test Suite: alignTimestamp()
 */
describe("alignTimestamp()", () => {
  const ts = (isoString) => new Date(isoString).getTime();

  it("should align timestamps to 1-minute boundaries (floor)", () => {
    const timestamp = ts("2025-09-29T14:32:45.123Z"); // 14:32:45.123
    const aligned = alignTimestamp(timestamp, "1m", "floor");
    assert.equal(aligned, ts("2025-09-29T14:32:00.000Z")); // 14:32:00.000
  });

  it("should align timestamps to 5-minute boundaries (floor)", () => {
    const timestamp = ts("2025-09-29T14:32:45.123Z"); // 14:32:45
    const aligned = alignTimestamp(timestamp, "5m", "floor");
    assert.equal(aligned, ts("2025-09-29T14:30:00.000Z")); // 14:30:00
  });

  it("should align timestamps to hourly boundaries (floor)", () => {
    const timestamp = ts("2025-09-29T14:32:45.123Z"); // 14:32:45
    const aligned = alignTimestamp(timestamp, "1h", "floor");
    assert.equal(aligned, ts("2025-09-29T14:00:00.000Z")); // 14:00:00
  });

  it("should align timestamps to 4-hour boundaries (floor)", () => {
    const timestamp = ts("2025-09-29T14:32:45.123Z"); // 14:32:45
    const aligned = alignTimestamp(timestamp, "4h", "floor");
    assert.equal(aligned, ts("2025-09-29T12:00:00.000Z")); // 12:00:00 (nearest 4h boundary: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00)
  });

  it("should align timestamps to daily boundaries (floor)", () => {
    const timestamp = ts("2025-09-29T14:32:45.123Z"); // 2025-09-29 14:32:45
    const aligned = alignTimestamp(timestamp, "1D", "floor");
    assert.equal(aligned, ts("2025-09-29T00:00:00.000Z")); // 2025-09-29 00:00:00
  });

  it("should align timestamps to 5-minute boundaries (ceil)", () => {
    const timestamp = ts("2025-09-29T14:32:45.123Z"); // 14:32:45
    const aligned = alignTimestamp(timestamp, "5m", "ceil");
    assert.equal(aligned, ts("2025-09-29T14:35:00.000Z")); // 14:35:00 (next boundary)
  });

  it("should return same timestamp if already aligned (floor)", () => {
    const timestamp = ts("2025-09-29T14:30:00.000Z"); // 14:30:00 (already aligned to 5m)
    const aligned = alignTimestamp(timestamp, "5m", "floor");
    assert.equal(aligned, timestamp);
  });

  it("should return next boundary if already aligned (ceil)", () => {
    const timestamp = ts("2025-09-29T14:30:00.000Z"); // 14:30:00 (already aligned to 5m)
    const aligned = alignTimestamp(timestamp, "5m", "ceil");
    assert.equal(aligned, timestamp); // ceil of aligned timestamp is itself
  });
});

/**
 * Test Suite: isAligned()
 */
describe("isAligned()", () => {
  const ts = (isoString) => new Date(isoString).getTime();

  it("should return true for aligned timestamps", () => {
    assert.equal(isAligned(ts("2025-09-29T14:00:00.000Z"), "1m"), true);
    assert.equal(isAligned(ts("2025-09-29T14:00:00.000Z"), "5m"), true);
    assert.equal(isAligned(ts("2025-09-29T14:00:00.000Z"), "1h"), true);
    assert.equal(isAligned(ts("2025-09-29T14:00:00.000Z"), "4h"), false); // 14:00 is not a 4h boundary
    assert.equal(isAligned(ts("2025-09-29T12:00:00.000Z"), "4h"), true); // 12:00 is a 4h boundary
    assert.equal(isAligned(ts("2025-09-29T00:00:00.000Z"), "1D"), true);
  });

  it("should return false for unaligned timestamps", () => {
    assert.equal(isAligned(ts("2025-09-29T14:32:45.123Z"), "1m"), false);
    assert.equal(isAligned(ts("2025-09-29T14:32:00.000Z"), "5m"), false); // 14:32 is not a 5m boundary
    assert.equal(isAligned(ts("2025-09-29T14:32:00.000Z"), "1h"), false); // 14:32 is not an hourly boundary
  });
});