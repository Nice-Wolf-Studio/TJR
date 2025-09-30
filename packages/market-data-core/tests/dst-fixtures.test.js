/**
 * DST (Daylight Saving Time) boundary test fixtures.
 *
 * These tests verify that the library handles DST transitions correctly
 * by operating exclusively in UTC. Provider adapters are responsible for
 * converting local times to UTC before calling our functions.
 *
 * DST transitions tested:
 * - 2025-03-09 02:00 EST → EDT (Spring Forward: clock jumps ahead 1 hour)
 * - 2025-11-02 02:00 EDT → EST (Fall Back: clock repeats 1 hour)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aggregateBars } from "../dist/aggregate.js";
import { alignTimestamp } from "../dist/timeframe.js";

/**
 * Helper: Create a timestamp from ISO 8601 string (UTC)
 */
function ts(isoString) {
  return new Date(isoString).getTime();
}

/**
 * Test Suite: Spring Forward (2025-03-09 02:00 EST → EDT)
 *
 * In America/New_York timezone:
 * - 01:59:59 EST → 03:00:00 EDT (02:xx does not exist)
 *
 * In UTC:
 * - 06:59:59 UTC → 07:00:00 UTC (no gap, continuous timestamps)
 *
 * Our library operates in UTC, so we should see no gaps or issues.
 */
describe("DST Spring Forward (2025-03-09)", () => {
  it("should handle UTC timestamps across DST boundary without gaps", () => {
    // Bars spanning 2025-03-09 06:00-07:10 UTC (continuous 1-minute bars)
    // In local time: 01:00-02:10 EST/EDT (DST transition at 02:00)
    const bars = [];
    for (let i = 0; i < 70; i++) {
      const timestamp = ts("2025-03-09T06:00:00.000Z") + i * 60_000;
      bars.push({
        timestamp,
        open: 100 + i * 0.1,
        high: 101 + i * 0.1,
        low: 99 + i * 0.1,
        close: 100.5 + i * 0.1,
        volume: 1000 + i * 10
      });
    }

    // Aggregate to 5-minute bars
    const aggregated = aggregateBars(bars, "5m");

    // Verify no gaps: All timestamps should be 5 minutes apart
    for (let i = 1; i < aggregated.length; i++) {
      const gap = aggregated[i].timestamp - aggregated[i - 1].timestamp;
      assert.equal(gap, 300_000, `Gap between bars[${i - 1}] and bars[${i}] should be 5 minutes`);
    }
  });

  it("should align timestamps correctly across DST boundary", () => {
    // Timestamp right before DST transition (06:59:59 UTC = 01:59:59 EST)
    const beforeDST = ts("2025-03-09T06:59:59.000Z");
    const alignedBefore = alignTimestamp(beforeDST, "1h", "floor");
    assert.equal(alignedBefore, ts("2025-03-09T06:00:00.000Z"));

    // Timestamp right after DST transition (07:00:01 UTC = 03:00:01 EDT)
    const afterDST = ts("2025-03-09T07:00:01.000Z");
    const alignedAfter = alignTimestamp(afterDST, "1h", "floor");
    assert.equal(alignedAfter, ts("2025-03-09T07:00:00.000Z"));
  });
});

/**
 * Test Suite: Fall Back (2025-11-02 02:00 EDT → EST)
 *
 * In America/New_York timezone:
 * - 01:59:59 EDT → 01:00:00 EST (01:xx happens twice)
 *
 * In UTC:
 * - 05:59:59 UTC → 06:00:00 UTC (no repetition, continuous timestamps)
 *
 * Our library operates in UTC, so we should see no duplicate timestamps.
 */
describe("DST Fall Back (2025-11-02)", () => {
  it("should handle UTC timestamps across DST boundary without duplicates", () => {
    // Bars spanning 2025-11-02 01:00 EDT to 02:00 EST (in UTC: 05:00 to 07:00)
    const bars = [
      { timestamp: ts("2025-11-02T05:00:00.000Z"), open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
      { timestamp: ts("2025-11-02T05:01:00.000Z"), open: 100.5, high: 102, low: 100, close: 101, volume: 1200 },
      // ... bars continue through the DST transition (no duplication in UTC) ...
      { timestamp: ts("2025-11-02T05:58:00.000Z"), open: 101, high: 102, low: 101, close: 101.5, volume: 1100 },
      { timestamp: ts("2025-11-02T05:59:00.000Z"), open: 101.5, high: 102, low: 101, close: 101.8, volume: 1000 },
      // EDT→EST transition happens here (in local time, not UTC)
      { timestamp: ts("2025-11-02T06:00:00.000Z"), open: 101.8, high: 102.5, low: 101.5, close: 102, volume: 1400 },
      { timestamp: ts("2025-11-02T06:01:00.000Z"), open: 102, high: 102.2, low: 101.8, close: 102, volume: 1000 },
    ];

    // Aggregate to 5-minute bars
    const aggregated = aggregateBars(bars, "5m");

    // Verify no duplicate timestamps
    const timestamps = aggregated.map((b) => b.timestamp);
    const uniqueTimestamps = new Set(timestamps);
    assert.equal(timestamps.length, uniqueTimestamps.size, "All timestamps should be unique (no duplicates)");

    // Verify monotonic increase
    for (let i = 1; i < aggregated.length; i++) {
      assert.ok(
        aggregated[i].timestamp > aggregated[i - 1].timestamp,
        `Timestamp bars[${i}] should be > bars[${i - 1}]`
      );
    }
  });

  it("should align timestamps correctly across DST boundary", () => {
    // Timestamp right before DST transition (05:59:59 UTC = 01:59:59 EDT)
    const beforeDST = ts("2025-11-02T05:59:59.000Z");
    const alignedBefore = alignTimestamp(beforeDST, "1h", "floor");
    assert.equal(alignedBefore, ts("2025-11-02T05:00:00.000Z"));

    // Timestamp right after DST transition (06:00:01 UTC = 01:00:01 EST)
    const afterDST = ts("2025-11-02T06:00:01.000Z");
    const alignedAfter = alignTimestamp(afterDST, "1h", "floor");
    assert.equal(alignedAfter, ts("2025-11-02T06:00:00.000Z"));
  });
});

/**
 * Test Suite: Provider Adapter Responsibility
 *
 * These tests document the expectation that provider adapters convert local
 * times to UTC BEFORE calling our library. This ensures DST transitions are
 * handled at the boundary.
 */
describe("Provider Adapter Contract", () => {
  it("should document that adapters must convert local times to UTC", () => {
    // This test serves as documentation: Adapters are responsible for timezone conversion.
    // Our library assumes all timestamps are in UTC.

    // Example scenario: Provider returns bars in America/New_York time during DST transition.
    // Adapter must:
    // 1. Detect that raw timestamps are in local time
    // 2. Convert each timestamp to UTC using a timezone library (e.g., luxon, date-fns-tz)
    // 3. Pass UTC timestamps to aggregateBars()

    // If adapter fails to convert, results will be incorrect (gaps or duplicates in output).
    assert.ok(true, "This test passes as documentation only");
  });
});