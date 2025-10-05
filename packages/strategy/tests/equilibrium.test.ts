/**
 * Equilibrium Calculator Tests
 *
 * Comprehensive test suite for Premium/Discount equilibrium calculator covering:
 * - Basic equilibrium calculation
 * - Threshold boundaries
 * - Edge cases and invalid inputs
 * - Floating-point precision
 * - Helper functions
 * - SwingRange creation and processing
 * - Batch operations
 * - Configuration validation
 *
 * Total: 27 test cases
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  calculateEquilibrium,
  calculateEquilibriumFromRange,
  batchCalculateEquilibrium,
  validateEquilibriumConfig,
  DEFAULT_EQUILIBRIUM_CONFIG,
} from '../src/equilibrium.js';
import type { SwingRange, EquilibriumLevel, EquilibriumConfig } from '@tjr/contracts';

describe('calculateEquilibrium', () => {
  describe('Category 1: Basic Equilibrium Calculation', () => {
    it('should calculate equilibrium at 50% level', () => {
      const result = calculateEquilibrium(4500, 4600, 4550);

      expect(result).not.toBeNull();
      expect(result!.equilibrium).toBe(4550);
      expect(result!.zone).toBe('EQUILIBRIUM');
      expect(result!.distancePercent).toBe(0);
      expect(result!.distancePoints).toBe(0);
      expect(result!.currentPrice).toBe(4550);
      expect(result!.range.high).toBe(4600);
      expect(result!.range.low).toBe(4500);
    });

    it('should classify price in premium zone (above equilibrium)', () => {
      const result = calculateEquilibrium(4500, 4600, 4580);

      expect(result).not.toBeNull();
      expect(result!.equilibrium).toBe(4550);
      expect(result!.zone).toBe('PREMIUM');
      expect(result!.distancePercent).toBeGreaterThan(0.02); // Above 2% threshold
      expect(result!.distancePoints).toBe(30);
    });

    it('should classify price in discount zone (below equilibrium)', () => {
      const result = calculateEquilibrium(4500, 4600, 4520);

      expect(result).not.toBeNull();
      expect(result!.equilibrium).toBe(4550);
      expect(result!.zone).toBe('DISCOUNT');
      expect(result!.distancePercent).toBeLessThan(-0.02); // Below -2% threshold
      expect(result!.distancePoints).toBe(30);
    });
  });

  describe('Category 2: Threshold Boundaries', () => {
    it('should classify as equilibrium when just inside threshold (1.9% above)', () => {
      const low = 4500;
      const high = 4600;
      const equilibrium = 4550;
      const rangeSize = high - low;
      // 1.9% above equilibrium
      const currentPrice = equilibrium + (rangeSize * 0.019);

      const result = calculateEquilibrium(low, high, currentPrice);

      expect(result).not.toBeNull();
      expect(result!.zone).toBe('EQUILIBRIUM');
      expect(Math.abs(result!.distancePercent)).toBeLessThan(0.02);
    });

    it('should classify as premium when just outside threshold (2.1% above)', () => {
      const low = 4500;
      const high = 4600;
      const equilibrium = 4550;
      const rangeSize = high - low;
      // 2.1% above equilibrium
      const currentPrice = equilibrium + (rangeSize * 0.021);

      const result = calculateEquilibrium(low, high, currentPrice);

      expect(result).not.toBeNull();
      expect(result!.zone).toBe('PREMIUM');
      expect(result!.distancePercent).toBeGreaterThanOrEqual(0.02);
    });

    it('should classify as equilibrium when just inside threshold (1.9% below)', () => {
      const low = 4500;
      const high = 4600;
      const equilibrium = 4550;
      const rangeSize = high - low;
      // 1.9% below equilibrium
      const currentPrice = equilibrium - (rangeSize * 0.019);

      const result = calculateEquilibrium(low, high, currentPrice);

      expect(result).not.toBeNull();
      expect(result!.zone).toBe('EQUILIBRIUM');
      expect(Math.abs(result!.distancePercent)).toBeLessThan(0.02);
    });

    it('should classify as discount when just outside threshold (2.1% below)', () => {
      const low = 4500;
      const high = 4600;
      const equilibrium = 4550;
      const rangeSize = high - low;
      // 2.1% below equilibrium
      const currentPrice = equilibrium - (rangeSize * 0.021);

      const result = calculateEquilibrium(low, high, currentPrice);

      expect(result).not.toBeNull();
      expect(result!.zone).toBe('DISCOUNT');
      expect(result!.distancePercent).toBeLessThanOrEqual(-0.02);
    });
  });

  describe('Category 3: Edge Cases', () => {
    it('should return null for range too small (below minRangeSize)', () => {
      const result = calculateEquilibrium(4500, 4503, 4501, { minRangeSize: 5 });

      expect(result).toBeNull();
    });

    it('should return null for invalid range (low >= high)', () => {
      // Equal values
      let result = calculateEquilibrium(4500, 4500, 4500);
      expect(result).toBeNull();

      // Low > high
      result = calculateEquilibrium(4600, 4500, 4550);
      expect(result).toBeNull();
    });

    it('should return null for invalid inputs (NaN, Infinity)', () => {
      // NaN inputs
      let result = calculateEquilibrium(NaN, 4600, 4550);
      expect(result).toBeNull();

      result = calculateEquilibrium(4500, NaN, 4550);
      expect(result).toBeNull();

      result = calculateEquilibrium(4500, 4600, NaN);
      expect(result).toBeNull();

      // Infinity inputs
      result = calculateEquilibrium(Infinity, 4600, 4550);
      expect(result).toBeNull();

      result = calculateEquilibrium(4500, Infinity, 4550);
      expect(result).toBeNull();

      result = calculateEquilibrium(4500, 4600, Infinity);
      expect(result).toBeNull();

      // -Infinity inputs
      result = calculateEquilibrium(-Infinity, 4600, 4550);
      expect(result).toBeNull();
    });

    it('should return null for zero range (low === high)', () => {
      const result = calculateEquilibrium(4550, 4550, 4550);

      expect(result).toBeNull();
    });

    it('should work with negative prices', () => {
      const result = calculateEquilibrium(-100, -50, -75);

      expect(result).not.toBeNull();
      expect(result!.equilibrium).toBe(-75);
      expect(result!.zone).toBe('EQUILIBRIUM');
    });
  });

  describe('Category 4: Floating-Point Precision', () => {
    it('should handle floating-point arithmetic correctly', () => {
      // Use actual floating-point problematic numbers
      const low = 0.1;
      const high = 0.3;
      const current = low + (high - low) / 2; // Should be 0.2

      const result = calculateEquilibrium(low, high, current, { minRangeSize: 0 });

      expect(result).not.toBeNull();
      expect(result!.zone).toBe('EQUILIBRIUM');
      expect(result!.equilibrium).toBeCloseTo(0.2, 6);
    });

    it('should handle very small differences with epsilon comparisons', () => {
      const low = 4500.123456;
      const high = 4500.223456; // 0.1 difference
      const equilibrium = (low + high) / 2;

      const result = calculateEquilibrium(low, high, equilibrium, { minRangeSize: 0 });

      expect(result).not.toBeNull();
      expect(result!.zone).toBe('EQUILIBRIUM');
      expect(result!.distancePercent).toBeCloseTo(0, 6);
    });
  });

  describe('Category 5: Configuration Options', () => {
    it('should use custom threshold for zone classification', () => {
      const low = 4500;
      const high = 4600;
      const equilibrium = 4550;
      const rangeSize = high - low;
      // 3% above equilibrium
      const currentPrice = equilibrium + (rangeSize * 0.03);

      // With 2% threshold (default), should be premium
      const defaultResult = calculateEquilibrium(low, high, currentPrice);
      expect(defaultResult!.zone).toBe('PREMIUM');

      // With 5% threshold, should be equilibrium
      const customResult = calculateEquilibrium(low, high, currentPrice, { threshold: 0.05 });
      expect(customResult!.zone).toBe('EQUILIBRIUM');
    });

    it('should use custom minRangeSize filter', () => {
      // Range of 8 points
      const result1 = calculateEquilibrium(4500, 4508, 4504, { minRangeSize: 10 });
      expect(result1).toBeNull(); // Below minimum

      const result2 = calculateEquilibrium(4500, 4508, 4504, { minRangeSize: 5 });
      expect(result2).not.toBeNull(); // Above minimum
    });

    it('should use custom precision for rounding', () => {
      const low = 4500.123456789;
      const high = 4600.987654321;
      const currentPrice = 4550.555555555;

      const result = calculateEquilibrium(low, high, currentPrice, { precision: 2 });

      expect(result).not.toBeNull();
      // Check that values are rounded to 2 decimal places
      const equilibriumStr = result!.equilibrium.toString();
      const decimalPart = equilibriumStr.split('.')[1];
      if (decimalPart) {
        expect(decimalPart.length).toBeLessThanOrEqual(2);
      }
    });

    it('should merge custom config with defaults', () => {
      const customConfig: EquilibriumConfig = {
        threshold: 0.03, // Only override threshold
      };

      const result = calculateEquilibrium(4500, 4600, 4550, customConfig);

      expect(result).not.toBeNull();
      // Should still use default minRangeSize (5) and precision (6)
      const result2 = calculateEquilibrium(4500, 4503, 4501, customConfig);
      expect(result2).toBeNull(); // Still filters ranges < 5 points
    });
  });
});

describe('calculateEquilibriumFromRange', () => {
  it('should calculate equilibrium from SwingRange object', () => {
    const range: SwingRange = {
      high: 4600,
      low: 4500,
      timestamp: new Date('2024-01-15T10:00:00Z'),
      timeframe: 'H4',
      source: 'COMPUTED',
    };

    const result = calculateEquilibriumFromRange(range, 4580);

    expect(result).not.toBeNull();
    expect(result!.equilibrium).toBe(4550);
    expect(result!.zone).toBe('PREMIUM');
    expect(result!.range.timeframe).toBe('H4');
    expect(result!.range.source).toBe('COMPUTED');
    expect(result!.range.timestamp).toEqual(range.timestamp);
  });

  it('should preserve range metadata in result', () => {
    const range: SwingRange = {
      high: 4600,
      low: 4500,
      timestamp: new Date('2024-01-15T12:30:00Z'),
      timeframe: 'H1',
      source: 'PROVIDED',
    };

    const result = calculateEquilibriumFromRange(range, 4550);

    expect(result).not.toBeNull();
    expect(result!.range.timeframe).toBe('H1');
    expect(result!.range.source).toBe('PROVIDED');
    expect(result!.range.timestamp).toBe(range.timestamp);
  });

  it('should return null for invalid range', () => {
    const invalidRange: SwingRange = {
      high: 4500,
      low: 4600, // Invalid: low > high
      timestamp: new Date(),
      timeframe: 'H4',
      source: 'COMPUTED',
    };

    const result = calculateEquilibriumFromRange(invalidRange, 4550);

    expect(result).toBeNull();
  });
});

describe('batchCalculateEquilibrium', () => {
  it('should process multiple ranges with same current price', () => {
    const ranges: SwingRange[] = [
      {
        high: 4600,
        low: 4500,
        timestamp: new Date('2024-01-15T10:00:00Z'),
        timeframe: 'H4',
        source: 'COMPUTED',
      },
      {
        high: 4580,
        low: 4520,
        timestamp: new Date('2024-01-15T11:00:00Z'),
        timeframe: 'H1',
        source: 'COMPUTED',
      },
      {
        high: 4560,
        low: 4540,
        timestamp: new Date('2024-01-15T12:00:00Z'),
        timeframe: 'M5',
        source: 'COMPUTED',
      },
    ];

    const results = batchCalculateEquilibrium(ranges, 4550);

    expect(results).toHaveLength(3);
    expect(results[0].equilibrium).toBe(4550);
    expect(results[1].equilibrium).toBe(4550);
    expect(results[2].equilibrium).toBe(4550);
  });

  it('should filter out null results from invalid ranges', () => {
    const ranges: SwingRange[] = [
      {
        high: 4600,
        low: 4500,
        timestamp: new Date(),
        timeframe: 'H4',
        source: 'COMPUTED',
      },
      {
        high: 4500,
        low: 4600, // Invalid: low > high
        timestamp: new Date(),
        timeframe: 'H1',
        source: 'COMPUTED',
      },
      {
        high: 4560,
        low: 4558, // Too small (< 5 points)
        timestamp: new Date(),
        timeframe: 'M5',
        source: 'COMPUTED',
      },
    ];

    const results = batchCalculateEquilibrium(ranges, 4550);

    // Should only return 1 valid result
    expect(results).toHaveLength(1);
    expect(results[0].equilibrium).toBe(4550);
  });

  it('should return empty array for no valid ranges', () => {
    const ranges: SwingRange[] = [
      {
        high: 4500,
        low: 4600, // Invalid
        timestamp: new Date(),
        timeframe: 'H4',
        source: 'COMPUTED',
      },
    ];

    const results = batchCalculateEquilibrium(ranges, 4550);

    expect(results).toEqual([]);
  });

  it('should apply custom config to all ranges', () => {
    const ranges: SwingRange[] = [
      {
        high: 4508,
        low: 4500,
        timestamp: new Date(),
        timeframe: 'H4',
        source: 'COMPUTED',
      },
      {
        high: 4507,
        low: 4500,
        timestamp: new Date(),
        timeframe: 'H1',
        source: 'COMPUTED',
      },
    ];

    // With minRangeSize of 10, both ranges should be filtered
    const results = batchCalculateEquilibrium(ranges, 4504, { minRangeSize: 10 });

    expect(results).toEqual([]);
  });
});

describe('validateEquilibriumConfig', () => {
  it('should validate valid configuration without errors', () => {
    const config: EquilibriumConfig = {
      threshold: 0.02,
      minRangeSize: 5,
      precision: 6,
    };

    expect(() => validateEquilibriumConfig(config)).not.toThrow();
  });

  it('should throw error for invalid threshold (negative)', () => {
    const config: EquilibriumConfig = {
      threshold: -0.5,
    };

    expect(() => validateEquilibriumConfig(config)).toThrow(/Invalid threshold/);
  });

  it('should throw error for invalid threshold (> 1)', () => {
    const config: EquilibriumConfig = {
      threshold: 1.5,
    };

    expect(() => validateEquilibriumConfig(config)).toThrow(/Invalid threshold/);
  });

  it('should throw error for invalid minRangeSize (negative)', () => {
    const config: EquilibriumConfig = {
      minRangeSize: -10,
    };

    expect(() => validateEquilibriumConfig(config)).toThrow(/Invalid minRangeSize/);
  });

  it('should throw error for invalid precision (negative)', () => {
    const config: EquilibriumConfig = {
      precision: -1,
    };

    expect(() => validateEquilibriumConfig(config)).toThrow(/Invalid precision/);
  });

  it('should throw error for invalid precision (> 15)', () => {
    const config: EquilibriumConfig = {
      precision: 20,
    };

    expect(() => validateEquilibriumConfig(config)).toThrow(/Invalid precision/);
  });

  it('should accept partial config with only valid fields', () => {
    const config: EquilibriumConfig = {
      threshold: 0.05,
    };

    expect(() => validateEquilibriumConfig(config)).not.toThrow();
  });

  it('should accept empty config', () => {
    const config: EquilibriumConfig = {};

    expect(() => validateEquilibriumConfig(config)).not.toThrow();
  });
});

describe('DEFAULT_EQUILIBRIUM_CONFIG', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_EQUILIBRIUM_CONFIG.threshold).toBe(0.02);
    expect(DEFAULT_EQUILIBRIUM_CONFIG.minRangeSize).toBe(5);
    expect(DEFAULT_EQUILIBRIUM_CONFIG.precision).toBe(6);
  });
});
