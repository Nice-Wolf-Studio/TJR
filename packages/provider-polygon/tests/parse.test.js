/**
 * Tests for Polygon.io response parsing.
 *
 * These tests verify that parseAggregatesResponse() correctly converts
 * Polygon API responses into canonical Bar format, with proper validation
 * and error handling.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseAggregatesResponse,
  parseAggregate,
  parseIntraday,
  parseDaily,
  ParseError,
} from "../dist/src/parse.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load fixture from __fixtures__ directory
 * @param {string} filename - Fixture filename
 * @returns {object} Parsed JSON fixture
 */
function loadFixture(filename) {
  const fixturePath = join(__dirname, "..", "__fixtures__", filename);
  const content = readFileSync(fixturePath, "utf-8");
  return JSON.parse(content);
}

describe("parseAggregatesResponse - Happy Path", () => {
  it("should parse 1-minute intraday bars from fixture", () => {
    const response = loadFixture("polygon-intraday-1m.json");
    const bars = parseAggregatesResponse(response);

    assert.equal(bars.length, 10, "Should parse 10 bars");
    assert.equal(bars[0].timestamp, 1727787000000, "First bar timestamp should match");
    assert.equal(bars[0].open, 4500.00, "First bar open should match");
    assert.equal(bars[0].high, 4502.00, "First bar high should match");
    assert.equal(bars[0].low, 4499.50, "First bar low should match");
    assert.equal(bars[0].close, 4501.50, "First bar close should match");
    assert.equal(bars[0].volume, 15000, "First bar volume should match");
  });

  it("should parse daily bars from fixture", () => {
    const response = loadFixture("polygon-daily-10days.json");
    const bars = parseAggregatesResponse(response);

    assert.equal(bars.length, 10, "Should parse 10 daily bars");
    assert.equal(bars[0].timestamp, 1727654400000, "First bar timestamp should match");
    assert.equal(bars[0].open, 4495.00, "First bar open should match");
    assert.equal(bars[0].high, 4510.00, "First bar high should match");
    assert.equal(bars[0].low, 4490.00, "First bar low should match");
    assert.equal(bars[0].close, 4505.00, "First bar close should match");
    assert.equal(bars[0].volume, 2500000, "First bar volume should match");
  });

  it("should parse 5-minute bars from fixture", () => {
    const response = loadFixture("polygon-intraday-5m.json");
    const bars = parseAggregatesResponse(response);

    assert.equal(bars.length, 20, "Should parse 20 bars");
    assert.equal(bars[0].timestamp, 1727787000000, "First bar timestamp should match");
    assert.equal(bars[0].volume, 75000, "First bar volume should match");
  });

  it("should return bars sorted by timestamp ascending", () => {
    const response = loadFixture("polygon-intraday-1m.json");
    const bars = parseAggregatesResponse(response);

    for (let i = 1; i < bars.length; i++) {
      assert.ok(
        bars[i].timestamp > bars[i - 1].timestamp,
        `Bar ${i} timestamp should be greater than bar ${i - 1}`
      );
    }
  });
});

describe("parseAggregatesResponse - OHLC Validation", () => {
  it("should validate high >= low", () => {
    const response = {
      status: "OK",
      ticker: "ES",
      resultsCount: 1,
      queryCount: 1,
      adjusted: true,
      results: [
        {
          t: 1727787000000,
          o: 4500.00,
          h: 4499.00, // high < low (invalid)
          l: 4500.00,
          c: 4500.00,
          v: 1000,
          vw: 4500.00,
          n: 100,
        },
      ],
    };

    assert.throws(
      () => parseAggregatesResponse(response),
      ParseError,
      "Should throw ParseError for high < low"
    );
  });

  it("should validate high >= open", () => {
    const response = {
      status: "OK",
      ticker: "ES",
      resultsCount: 1,
      queryCount: 1,
      adjusted: true,
      results: [
        {
          t: 1727787000000,
          o: 4502.00,
          h: 4501.00, // high < open (invalid)
          l: 4500.00,
          c: 4500.00,
          v: 1000,
          vw: 4500.00,
          n: 100,
        },
      ],
    };

    assert.throws(
      () => parseAggregatesResponse(response),
      ParseError,
      "Should throw ParseError for high < open"
    );
  });

  it("should validate high >= close", () => {
    const response = {
      status: "OK",
      ticker: "ES",
      resultsCount: 1,
      queryCount: 1,
      adjusted: true,
      results: [
        {
          t: 1727787000000,
          o: 4500.00,
          h: 4501.00, // high < close (invalid)
          l: 4500.00,
          c: 4502.00,
          v: 1000,
          vw: 4500.00,
          n: 100,
        },
      ],
    };

    assert.throws(
      () => parseAggregatesResponse(response),
      ParseError,
      "Should throw ParseError for high < close"
    );
  });

  it("should validate low <= open", () => {
    const response = {
      status: "OK",
      ticker: "ES",
      resultsCount: 1,
      queryCount: 1,
      adjusted: true,
      results: [
        {
          t: 1727787000000,
          o: 4500.00,
          h: 4502.00,
          l: 4501.00, // low > open (invalid)
          c: 4502.00,
          v: 1000,
          vw: 4500.00,
          n: 100,
        },
      ],
    };

    assert.throws(
      () => parseAggregatesResponse(response),
      ParseError,
      "Should throw ParseError for low > open"
    );
  });

  it("should validate low <= close", () => {
    const response = {
      status: "OK",
      ticker: "ES",
      resultsCount: 1,
      queryCount: 1,
      adjusted: true,
      results: [
        {
          t: 1727787000000,
          o: 4502.00,
          h: 4503.00,
          l: 4502.00, // low > close (invalid)
          c: 4501.00,
          v: 1000,
          vw: 4500.00,
          n: 100,
        },
      ],
    };

    assert.throws(
      () => parseAggregatesResponse(response),
      ParseError,
      "Should throw ParseError for low > close"
    );
  });

  it("should validate volume is non-negative", () => {
    const response = {
      status: "OK",
      ticker: "ES",
      resultsCount: 1,
      queryCount: 1,
      adjusted: true,
      results: [
        {
          t: 1727787000000,
          o: 4500.00,
          h: 4502.00,
          l: 4499.00,
          c: 4501.00,
          v: -1000, // negative volume (invalid)
          vw: 4500.00,
          n: 100,
        },
      ],
    };

    assert.throws(
      () => parseAggregatesResponse(response),
      ParseError,
      "Should throw ParseError for negative volume"
    );
  });
});

describe("parseAggregatesResponse - Error Cases", () => {
  it("should throw ParseError for non-OK status", () => {
    const response = {
      status: "ERROR",
      ticker: "ES",
      resultsCount: 0,
      queryCount: 0,
      adjusted: true,
      error: "Invalid API key",
    };

    assert.throws(
      () => parseAggregatesResponse(response),
      ParseError,
      "Should throw ParseError for non-OK status"
    );
  });

  it("should throw ParseError for missing results field", () => {
    const response = {
      status: "OK",
      ticker: "ES",
      resultsCount: 0,
      queryCount: 0,
      adjusted: true,
      // results field is missing
    };

    assert.throws(
      () => parseAggregatesResponse(response),
      ParseError,
      "Should throw ParseError for missing results field"
    );
  });

  it("should throw ParseError for non-array results", () => {
    const response = {
      status: "OK",
      ticker: "ES",
      resultsCount: 1,
      queryCount: 1,
      adjusted: true,
      results: "not-an-array", // invalid type
    };

    assert.throws(
      () => parseAggregatesResponse(response),
      ParseError,
      "Should throw ParseError for non-array results"
    );
  });

  it("should throw ParseError for missing required field (timestamp)", () => {
    const response = {
      status: "OK",
      ticker: "ES",
      resultsCount: 1,
      queryCount: 1,
      adjusted: true,
      results: [
        {
          // t (timestamp) is missing
          o: 4500.00,
          h: 4502.00,
          l: 4499.00,
          c: 4501.00,
          v: 1000,
          vw: 4500.00,
          n: 100,
        },
      ],
    };

    assert.throws(
      () => parseAggregatesResponse(response),
      ParseError,
      "Should throw ParseError for missing timestamp"
    );
  });

  it("should throw ParseError for missing required field (open)", () => {
    const response = {
      status: "OK",
      ticker: "ES",
      resultsCount: 1,
      queryCount: 1,
      adjusted: true,
      results: [
        {
          t: 1727787000000,
          // o (open) is missing
          h: 4502.00,
          l: 4499.00,
          c: 4501.00,
          v: 1000,
          vw: 4500.00,
          n: 100,
        },
      ],
    };

    assert.throws(
      () => parseAggregatesResponse(response),
      ParseError,
      "Should throw ParseError for missing open"
    );
  });

  it("should throw ParseError for invalid field type (timestamp)", () => {
    const response = {
      status: "OK",
      ticker: "ES",
      resultsCount: 1,
      queryCount: 1,
      adjusted: true,
      results: [
        {
          t: "invalid-timestamp", // should be number
          o: 4500.00,
          h: 4502.00,
          l: 4499.00,
          c: 4501.00,
          v: 1000,
          vw: 4500.00,
          n: 100,
        },
      ],
    };

    assert.throws(
      () => parseAggregatesResponse(response),
      ParseError,
      "Should throw ParseError for invalid timestamp type"
    );
  });

  it("should throw ParseError for invalid field type (volume)", () => {
    const response = {
      status: "OK",
      ticker: "ES",
      resultsCount: 1,
      queryCount: 1,
      adjusted: true,
      results: [
        {
          t: 1727787000000,
          o: 4500.00,
          h: 4502.00,
          l: 4499.00,
          c: 4501.00,
          v: "invalid-volume", // should be number
          vw: 4500.00,
          n: 100,
        },
      ],
    };

    assert.throws(
      () => parseAggregatesResponse(response),
      ParseError,
      "Should throw ParseError for invalid volume type"
    );
  });
});

describe("parseAggregatesResponse - Empty Results", () => {
  it("should return empty array for empty results", () => {
    const response = {
      status: "OK",
      ticker: "ES",
      resultsCount: 0,
      queryCount: 0,
      adjusted: true,
      results: [],
    };

    const bars = parseAggregatesResponse(response);
    assert.deepEqual(bars, [], "Should return empty array");
  });

  it("should skip undefined entries in results array", () => {
    const response = {
      status: "OK",
      ticker: "ES",
      resultsCount: 2,
      queryCount: 2,
      adjusted: true,
      results: [
        {
          t: 1727787000000,
          o: 4500.00,
          h: 4502.00,
          l: 4499.00,
          c: 4501.00,
          v: 1000,
          vw: 4500.00,
          n: 100,
        },
        undefined, // should be skipped
        {
          t: 1727787060000,
          o: 4501.00,
          h: 4503.00,
          l: 4500.00,
          c: 4502.00,
          v: 1200,
          vw: 4501.50,
          n: 120,
        },
      ],
    };

    const bars = parseAggregatesResponse(response);
    assert.equal(bars.length, 2, "Should parse 2 bars, skipping undefined");
  });
});

describe("parseAggregate - Individual Aggregate", () => {
  it("should parse a valid aggregate", () => {
    const aggregate = {
      t: 1727787000000,
      o: 4500.00,
      h: 4502.00,
      l: 4499.00,
      c: 4501.00,
      v: 1000,
      vw: 4500.50,
      n: 100,
    };

    const bar = parseAggregate(aggregate);

    assert.deepEqual(bar, {
      timestamp: 1727787000000,
      open: 4500.00,
      high: 4502.00,
      low: 4499.00,
      close: 4501.00,
      volume: 1000,
    });
  });

  it("should throw ParseError for missing fields", () => {
    const aggregate = {
      t: 1727787000000,
      o: 4500.00,
      // h, l, c, v are missing
    };

    assert.throws(
      () => parseAggregate(aggregate),
      ParseError,
      "Should throw ParseError for missing required fields"
    );
  });
});

describe("parseIntraday - Alias Function", () => {
  it("should parse intraday data (alias for parseAggregatesResponse)", () => {
    const response = loadFixture("polygon-intraday-1m.json");
    const bars = parseIntraday(response);

    assert.equal(bars.length, 10, "Should parse 10 bars");
    assert.equal(bars[0].timestamp, 1727787000000, "First bar timestamp should match");
  });
});

describe("parseDaily - Alias Function", () => {
  it("should parse daily data (alias for parseAggregatesResponse)", () => {
    const response = loadFixture("polygon-daily-10days.json");
    const bars = parseDaily(response);

    assert.equal(bars.length, 10, "Should parse 10 bars");
    assert.equal(bars[0].timestamp, 1727654400000, "First bar timestamp should match");
  });
});

describe("parseAggregatesResponse - Timezone Handling", () => {
  it("should preserve Unix millisecond timestamps without timezone conversion", () => {
    const response = loadFixture("polygon-intraday-1m.json");
    const bars = parseAggregatesResponse(response);

    // Polygon API returns Unix milliseconds in UTC
    // We should preserve these exactly without timezone conversion
    assert.equal(
      bars[0].timestamp,
      1727787000000,
      "Timestamp should be preserved as-is from API"
    );

    // Verify all timestamps are numbers (not Date objects)
    for (const bar of bars) {
      assert.equal(
        typeof bar.timestamp,
        "number",
        "Timestamp should be a number (Unix milliseconds)"
      );
    }
  });
});