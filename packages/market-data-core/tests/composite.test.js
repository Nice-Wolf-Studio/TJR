/**
 * Test suite for composite provider selection.
 *
 * These tests verify that selectProvider() implements deterministic provider
 * selection based on capabilities, freshness constraints, and priority overrides.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectProvider, loadCapabilities } from "../dist/composite.js";

/**
 * Test fixture: Mock provider capabilities
 */
const mockProviders = [
  {
    providerId: "yahoo",
    timeframes: ["1m", "5m", "15m", "30m", "1h", "1D"],
    assetClasses: ["stocks", "etf", "index"],
    maxLookbackDays: 7,
    priority: 20,
    freshnessSeconds: 900,
  },
  {
    providerId: "polygon",
    timeframes: ["1m", "5m", "10m", "15m", "30m", "1h", "2h", "4h", "1D"],
    assetClasses: ["stocks", "etf", "crypto", "forex"],
    maxLookbackDays: 730,
    priority: 10,
    freshnessSeconds: 0,
  },
  {
    providerId: "alpaca",
    timeframes: ["1m", "5m", "15m", "1h", "1D"],
    assetClasses: ["stocks", "crypto"],
    maxLookbackDays: 365,
    priority: 15,
    freshnessSeconds: 0,
  },
  {
    providerId: "coinbase",
    timeframes: ["1m", "5m", "15m", "1h", "1D"],
    assetClasses: ["crypto"],
    maxLookbackDays: 180,
    priority: 12,
    freshnessSeconds: 0,
  },
  {
    providerId: "binance",
    timeframes: ["1m", "5m", "15m", "30m", "1h", "4h", "1D"],
    assetClasses: ["crypto"],
    maxLookbackDays: 365,
    priority: 8,
    freshnessSeconds: 0,
  },
];

// ============================================================================
// Capability Filtering Tests
// ============================================================================

describe("Capability Filtering: Timeframe Support", () => {
  it("should select provider that supports required timeframe", () => {
    const result = selectProvider(mockProviders, {
      timeframe: "10m",
      assetClass: "stocks",
      lookbackDays: 30,
    });

    assert.equal(result.providerId, "polygon", "Polygon is the only provider supporting 10m");
    assert.match(result.reason, /supports 10m timeframe/);
  });

  it("should exclude providers that do not support required timeframe", () => {
    const result = selectProvider(mockProviders, {
      timeframe: "2h",
      assetClass: "stocks",
      lookbackDays: 30,
    });

    assert.equal(result.providerId, "polygon", "Polygon is the only provider supporting 2h");
    const excluded = result.excluded.filter((e) => e.reason.includes("does not support 2h"));
    assert.ok(excluded.length > 0, "Should exclude providers without 2h support");
  });
});

describe("Capability Filtering: Asset Class Support", () => {
  it("should select provider that supports required asset class", () => {
    const result = selectProvider(mockProviders, {
      timeframe: "1m",
      assetClass: "forex",
      lookbackDays: 30,
    });

    assert.equal(result.providerId, "polygon", "Polygon is the only provider supporting forex");
    assert.match(result.reason, /forex asset class/);
  });

  it("should exclude providers that do not support required asset class", () => {
    const result = selectProvider(mockProviders, {
      timeframe: "1m",
      assetClass: "forex",
      lookbackDays: 30,
    });

    const excluded = result.excluded.filter((e) => e.reason.includes("does not support forex"));
    assert.ok(excluded.length >= 4, "Should exclude at least 4 providers without forex support");
  });
});

describe("Capability Filtering: Lookback Period", () => {
  it("should select provider with sufficient lookback period", () => {
    const result = selectProvider(mockProviders, {
      timeframe: "1D",
      assetClass: "stocks",
      lookbackDays: 365,
    });

    // Should select polygon (priority 10) over alpaca (priority 15)
    assert.equal(result.providerId, "polygon", "Polygon has higher priority among capable providers");
    assert.match(result.reason, /365d lookback/);
  });

  it("should exclude providers with insufficient lookback period", () => {
    const result = selectProvider(mockProviders, {
      timeframe: "1D",
      assetClass: "stocks",
      lookbackDays: 365,
    });

    const yahooExcluded = result.excluded.find((e) => e.providerId === "yahoo");
    assert.ok(yahooExcluded, "Yahoo should be excluded");
    assert.match(yahooExcluded.reason, /max lookback 7d < required 365d/);
  });
});

// ============================================================================
// Freshness Filtering Tests
// ============================================================================

describe("Freshness Filtering", () => {
  it("should select provider meeting freshness constraint", () => {
    const result = selectProvider(mockProviders, {
      timeframe: "1m",
      assetClass: "stocks",
      lookbackDays: 30,
      maxStalenessSec: 60,
    });

    // Should select polygon (real-time, priority 10) over alpaca (real-time, priority 15)
    assert.equal(result.providerId, "polygon");
    assert.match(result.reason, /freshness 0s <= 60s max/);
  });

  it("should exclude providers exceeding freshness constraint", () => {
    const result = selectProvider(mockProviders, {
      timeframe: "1m",
      assetClass: "stocks",
      lookbackDays: 7,
      maxStalenessSec: 60,
    });

    const yahooExcluded = result.excluded.find((e) => e.providerId === "yahoo");
    assert.ok(yahooExcluded, "Yahoo should be excluded due to freshness");
    assert.match(yahooExcluded.reason, /freshness 900s exceeds max staleness 60s/);
  });

  it("should not filter by freshness if constraint not specified", () => {
    const result = selectProvider(mockProviders, {
      timeframe: "1D",
      assetClass: "stocks",
      lookbackDays: 7,
    });

    // Without freshness constraint, yahoo is capable and should be considered
    // But polygon has higher priority (10 < 20), so polygon should be selected
    assert.equal(result.providerId, "polygon");
  });

  it("should return null if no providers meet freshness constraint", () => {
    const result = selectProvider(mockProviders, {
      timeframe: "1m",
      assetClass: "stocks",
      lookbackDays: 7,
      maxStalenessSec: -1, // Negative staleness (impossible)
    });

    assert.equal(result.providerId, null);
    assert.match(result.reason, /No providers meet freshness constraint/);
  });
});

// ============================================================================
// Priority Override Tests
// ============================================================================

describe("Priority Override", () => {
  it("should select preferred provider if capable", () => {
    const result = selectProvider(mockProviders, {
      timeframe: "1m",
      assetClass: "stocks",
      lookbackDays: 30,
      preferProviderId: "alpaca",
    });

    assert.equal(result.providerId, "alpaca");
    assert.match(result.reason, /Selected alpaca \(preferred\)/);
  });

  it("should fallback to priority selection if preferred provider not capable", () => {
    const result = selectProvider(mockProviders, {
      timeframe: "10m", // Alpaca doesn't support 10m
      assetClass: "stocks",
      lookbackDays: 30,
      preferProviderId: "alpaca",
    });

    assert.equal(result.providerId, "polygon", "Should fallback to polygon");
    assert.ok(!result.reason.includes("preferred"), "Reason should not mention preferred");

    const alpacaExcluded = result.excluded.find((e) => e.providerId === "alpaca");
    assert.ok(alpacaExcluded, "Alpaca should be in excluded list");
  });

  it("should respect freshness constraint even with preference", () => {
    const result = selectProvider(mockProviders, {
      timeframe: "1m",
      assetClass: "stocks",
      lookbackDays: 7,
      maxStalenessSec: 60,
      preferProviderId: "yahoo", // Yahoo has 900s freshness
    });

    assert.notEqual(result.providerId, "yahoo", "Yahoo should not be selected due to freshness");
    const yahooExcluded = result.excluded.find((e) => e.providerId === "yahoo");
    assert.ok(yahooExcluded);
    assert.match(yahooExcluded.reason, /freshness.*exceeds/);
  });
});

// ============================================================================
// Priority Selection Tests
// ============================================================================

describe("Priority Selection", () => {
  it("should select single capable provider", () => {
    const result = selectProvider(mockProviders, {
      timeframe: "2h",
      assetClass: "stocks",
      lookbackDays: 30,
    });

    assert.equal(result.providerId, "polygon", "Polygon is the only capable provider");
  });

  it("should select provider with lowest priority value among capable providers", () => {
    const result = selectProvider(mockProviders, {
      timeframe: "1m",
      assetClass: "crypto",
      lookbackDays: 180,
    });

    // Capable providers: binance (8), coinbase (12), alpaca (15), polygon (10)
    assert.equal(result.providerId, "binance", "Binance has lowest priority (8)");
  });

  it("should return null if no providers are capable", () => {
    const result = selectProvider(mockProviders, {
      timeframe: "1m",
      assetClass: "commodities", // No provider supports commodities
      lookbackDays: 30,
    });

    assert.equal(result.providerId, null);
    assert.match(result.reason, /No capable providers found/);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
  it("should handle empty provider list", () => {
    const result = selectProvider([], {
      timeframe: "1m",
      assetClass: "stocks",
      lookbackDays: 30,
    });

    assert.equal(result.providerId, null);
    assert.match(result.reason, /No capable providers found/);
  });

  it("should handle all providers excluded by capability", () => {
    const result = selectProvider(mockProviders, {
      timeframe: "1m",
      assetClass: "stocks",
      lookbackDays: 1000, // Exceeds all providers' lookback
    });

    assert.equal(result.providerId, null);
    assert.equal(result.excluded.length, mockProviders.length, "All providers should be excluded");
  });

  it("should handle all providers excluded by freshness", () => {
    const result = selectProvider(mockProviders, {
      timeframe: "1m",
      assetClass: "stocks",
      lookbackDays: 7,
      maxStalenessSec: -1, // Negative staleness (impossible)
    });

    assert.equal(result.providerId, null);
    assert.match(result.reason, /No providers meet freshness constraint/);
  });
});

// ============================================================================
// Determinism Tests
// ============================================================================

describe("Determinism", () => {
  it("should produce identical results for identical inputs", () => {
    const options = {
      timeframe: "5m",
      assetClass: "stocks",
      lookbackDays: 30,
      maxStalenessSec: 60,
    };

    const result1 = selectProvider(mockProviders, options);
    const result2 = selectProvider(mockProviders, options);
    const result3 = selectProvider(mockProviders, options);

    assert.deepEqual(result1, result2, "First and second calls should match");
    assert.deepEqual(result2, result3, "Second and third calls should match");
  });

  it("should be order-independent for provider list", () => {
    const shuffled = [...mockProviders].reverse();

    const result1 = selectProvider(mockProviders, {
      timeframe: "1m",
      assetClass: "crypto",
      lookbackDays: 180,
    });

    const result2 = selectProvider(shuffled, {
      timeframe: "1m",
      assetClass: "crypto",
      lookbackDays: 180,
    });

    assert.equal(result1.providerId, result2.providerId, "Selection should not depend on provider order");
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("loadCapabilities Integration", () => {
  it("should load capabilities from config object", () => {
    const config = {
      providers: [
        {
          providerId: "test-provider",
          timeframes: ["1m", "5m"],
          assetClasses: ["stocks"],
          maxLookbackDays: 30,
          priority: 10,
          freshnessSeconds: 0,
        },
      ],
    };

    const capabilities = loadCapabilities(config);

    assert.equal(capabilities.length, 1);
    assert.equal(capabilities[0].providerId, "test-provider");
  });

  it("should work with selectProvider", () => {
    const config = {
      providers: [
        {
          providerId: "test-provider",
          timeframes: ["1m", "5m"],
          assetClasses: ["stocks"],
          maxLookbackDays: 30,
          priority: 10,
          freshnessSeconds: 0,
        },
      ],
    };

    const capabilities = loadCapabilities(config);
    const result = selectProvider(capabilities, {
      timeframe: "1m",
      assetClass: "stocks",
      lookbackDays: 10,
    });

    assert.equal(result.providerId, "test-provider");
  });
});