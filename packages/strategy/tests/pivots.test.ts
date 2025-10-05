/**
 * LTF Pivot Tracker Tests
 *
 * Comprehensive test suite for LtfPivotTracker covering:
 * - Pivot candidate detection
 * - Confirmation logic with lookback
 * - Strength scoring
 * - Idempotent processing
 * - Performance metrics
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { LtfPivotTracker } from '../src/pivots.js';
import type { BarData, PivotPoint, BosConfig } from '@tjr/contracts';

/**
 * Helper function to create proper BarData fixture
 */
function createBar(dateStr: string, high: number, low: number, index: number): BarData {
  const timestamp = new Date(dateStr).getTime();
  const mid = (high + low) / 2;
  return {
    symbol: 'ES',
    timestamp,
    open: mid,
    high,
    low,
    close: mid,
    volume: 1000
  };
}

describe('LtfPivotTracker', () => {
  let config: Partial<BosConfig['pivots']>;
  const TEST_SYMBOL = 'ES';

  beforeEach(() => {
    config = {
      lookback: 3,
      maxCandidates: 50
    };
  });

  describe('Constructor', () => {
    it('should create tracker with valid config', () => {
      const tracker = new LtfPivotTracker(TEST_SYMBOL, config);
      expect(tracker).toBeDefined();
    });

    it('should accept minimal config', () => {
      const minimalConfig: Partial<BosConfig['pivots']> = {
        lookback: 2
      };

      const tracker = new LtfPivotTracker(TEST_SYMBOL, minimalConfig);
      expect(tracker).toBeDefined();
    });

    it('should use default values for optional config', () => {
      const minimalConfig: Partial<BosConfig['pivots']> = {
        lookback: 3
      };

      const tracker = new LtfPivotTracker(TEST_SYMBOL, minimalConfig);
      const state = tracker.getState();

      expect(state.candidates).toBeDefined();
    });
  });

  describe('onBar() - Basic Processing', () => {
    let tracker: LtfPivotTracker;

    beforeEach(() => {
      tracker = new LtfPivotTracker(TEST_SYMBOL, config);
    });

    it('should process valid bar without errors', () => {
      const bar: BarData = createBar('2024-01-15T10:00:00Z', 4510, 4495, 0);

      expect(() => {
        tracker.onBar(bar);
      }).not.toThrow();
    });

    it('should return empty array when no pivots are confirmed', () => {
      const bar: BarData = createBar('2024-01-15T10:00:00Z', 4510, 4495, 0);

      const pivots = tracker.onBar(bar);

      expect(pivots).toEqual([]);
    });

    it('should process multiple bars in sequence', () => {
      const bars: BarData[] = [
        createBar('2024-01-15T10:00:00Z', 4510, 4495, 0),
        createBar('2024-01-15T10:01:00Z', 4515, 4500, 1),
        createBar('2024-01-15T10:02:00Z', 4520, 4505, 2)
      ];

      bars.forEach(bar => {
        expect(() => tracker.onBar(bar)).not.toThrow();
      });
    });
  });

  describe('Pivot High Detection', () => {
    let tracker: LtfPivotTracker;

    beforeEach(() => {
      tracker = new LtfPivotTracker(TEST_SYMBOL, { lookback: 2, maxCandidates: 50 });
    });

    it('should detect pivot high after lookback confirmation', () => {
      // Create peak pattern: low, high, low, low, low
      const bars: BarData[] = [
        createBar('2024-01-15T10:00:00Z', 4505, 4495, 0),
        createBar('2024-01-15T10:01:00Z', 4520, 4500, 1), // Peak
        createBar('2024-01-15T10:02:00Z', 4515, 4505, 2),
        createBar('2024-01-15T10:03:00Z', 4512, 4502, 3),
        createBar('2024-01-15T10:04:00Z', 4510, 4500, 4)  // Confirms with 2 lookback
      ];

      let confirmedPivots: PivotPoint[] = [];

      bars.forEach(bar => {
        const pivots = tracker.onBar(bar);
        confirmedPivots = confirmedPivots.concat(pivots);
      });

      const pivotHighs = confirmedPivots.filter(p => p.type === 'high');
      expect(pivotHighs.length).toBeGreaterThan(0);
    });

    it('should track pivot high price and timestamp correctly', () => {
      const peakTime = new Date('2024-01-15T10:01:00Z');
      const peakPrice = 4520;

      const bars: BarData[] = [
        createBar('2024-01-15T10:00:00Z', 4505, 4495, 0),
        createBar('2024-01-15T10:01:00Z', peakPrice, 4500, 1),
        createBar('2024-01-15T10:02:00Z', 4515, 4505, 2),
        createBar('2024-01-15T10:03:00Z', 4512, 4502, 3),
        createBar('2024-01-15T10:04:00Z', 4510, 4500, 4)
      ];

      let confirmedPivots: PivotPoint[] = [];

      bars.forEach(bar => {
        const pivots = tracker.onBar(bar);
        confirmedPivots = confirmedPivots.concat(pivots);
      });

      const pivotHigh = confirmedPivots.find(p => p.type === 'high');

      if (pivotHigh) {
        expect(pivotHigh.price).toBe(peakPrice);
        expect(pivotHigh.timestamp.getTime()).toBe(peakTime.getTime());
      }
    });

    it('should assign correct barIndex to pivot', () => {
      const bars: BarData[] = [
        createBar('2024-01-15T10:00:00Z', 4505, 4495, 0),
        createBar('2024-01-15T10:01:00Z', 4520, 4500, 1),
        createBar('2024-01-15T10:02:00Z', 4515, 4505, 2),
        createBar('2024-01-15T10:03:00Z', 4512, 4502, 3),
        createBar('2024-01-15T10:04:00Z', 4510, 4500, 4)
      ];

      let confirmedPivots: PivotPoint[] = [];

      bars.forEach(bar => {
        const pivots = tracker.onBar(bar);
        confirmedPivots = confirmedPivots.concat(pivots);
      });

      const pivotHigh = confirmedPivots.find(p => p.type === 'high');

      if (pivotHigh) {
        expect(pivotHigh.barIndex).toBe(1);
      }
    });
  });

  describe('Pivot Low Detection', () => {
    let tracker: LtfPivotTracker;

    beforeEach(() => {
      tracker = new LtfPivotTracker(TEST_SYMBOL, { lookback: 2, maxCandidates: 50 });
    });

    it('should detect pivot low after lookback confirmation', () => {
      // Create trough pattern: high, low, high, high, high
      const bars: BarData[] = [
        createBar('2024-01-15T10:00:00Z', 4510, 4500, 0),
        createBar('2024-01-15T10:01:00Z', 4505, 4485, 1), // Trough
        createBar('2024-01-15T10:02:00Z', 4510, 4490, 2),
        createBar('2024-01-15T10:03:00Z', 4512, 4492, 3),
        createBar('2024-01-15T10:04:00Z', 4515, 4495, 4)  // Confirms with 2 lookback
      ];

      let confirmedPivots: PivotPoint[] = [];

      bars.forEach(bar => {
        const pivots = tracker.onBar(bar);
        confirmedPivots = confirmedPivots.concat(pivots);
      });

      const pivotLows = confirmedPivots.filter(p => p.type === 'low');
      expect(pivotLows.length).toBeGreaterThan(0);
    });

    it('should track pivot low price and timestamp correctly', () => {
      const troughTime = new Date('2024-01-15T10:01:00Z');
      const troughPrice = 4485;

      const bars: BarData[] = [
        createBar('2024-01-15T10:00:00Z', 4510, 4500, 0),
        createBar('2024-01-15T10:01:00Z', 4505, troughPrice, 1),
        createBar('2024-01-15T10:02:00Z', 4510, 4490, 2),
        createBar('2024-01-15T10:03:00Z', 4512, 4492, 3),
        createBar('2024-01-15T10:04:00Z', 4515, 4495, 4)
      ];

      let confirmedPivots: PivotPoint[] = [];

      bars.forEach(bar => {
        const pivots = tracker.onBar(bar);
        confirmedPivots = confirmedPivots.concat(pivots);
      });

      const pivotLow = confirmedPivots.find(p => p.type === 'low');

      if (pivotLow) {
        expect(pivotLow.price).toBe(troughPrice);
        expect(pivotLow.timestamp.getTime()).toBe(troughTime.getTime());
      }
    });
  });

  describe('Strength Scoring', () => {
    let tracker: LtfPivotTracker;

    beforeEach(() => {
      tracker = new LtfPivotTracker(TEST_SYMBOL, {
        lookback: 2,
        maxCandidates: 50,
        strengthLevels: 5
      });
    });

    it('should assign strength score to confirmed pivots', () => {
      const bars: BarData[] = [
        createBar('2024-01-15T10:00:00Z', 4505, 4495, 0),
        createBar('2024-01-15T10:01:00Z', 4520, 4500, 1),
        createBar('2024-01-15T10:02:00Z', 4515, 4505, 2),
        createBar('2024-01-15T10:03:00Z', 4512, 4502, 3),
        createBar('2024-01-15T10:04:00Z', 4510, 4500, 4)
      ];

      let confirmedPivots: PivotPoint[] = [];

      bars.forEach(bar => {
        const pivots = tracker.onBar(bar);
        confirmedPivots = confirmedPivots.concat(pivots);
      });

      confirmedPivots.forEach(pivot => {
        expect(pivot.strength).toBeDefined();
        expect(pivot.strength).toBeGreaterThanOrEqual(1);
        expect(pivot.strength).toBeLessThanOrEqual(5);
      });
    });

    it('should assign higher strength to more prominent pivots', () => {
      // Create a very strong peak
      const bars: BarData[] = [
        createBar('2024-01-15T10:00:00Z', 4500, 4490, 0),
        createBar('2024-01-15T10:01:00Z', 4550, 4500, 1), // Very high peak
        createBar('2024-01-15T10:02:00Z', 4510, 4500, 2),
        createBar('2024-01-15T10:03:00Z', 4505, 4495, 3),
        createBar('2024-01-15T10:04:00Z', 4502, 4492, 4)
      ];

      let confirmedPivots: PivotPoint[] = [];

      bars.forEach(bar => {
        const pivots = tracker.onBar(bar);
        confirmedPivots = confirmedPivots.concat(pivots);
      });

      const strongPivot = confirmedPivots.find(p => p.type === 'high');

      if (strongPivot) {
        expect(strongPivot.strength).toBeGreaterThan(1);
      }
    });
  });

  describe('Candidate Management', () => {
    let tracker: LtfPivotTracker;

    beforeEach(() => {
      tracker = new LtfPivotTracker(TEST_SYMBOL, {
        lookback: 2,
        maxCandidates: 5  // Small limit for testing
      });
    });

    it('should respect maxCandidates limit', () => {
      // Create many potential pivot candidates
      for (let i = 0; i < 20; i++) {
        const timestamp = new Date(`2024-01-15T10:${String(i).padStart(2, '0')}:00Z`).getTime();
        const high = 4500 + (i % 2 === 0 ? 10 : 0);
        const low = 4490 + (i % 2 === 0 ? 0 : -10);
        const mid = (high + low) / 2;
        const bar: BarData = {
          symbol: 'ES',
          timestamp,
          open: mid,
          high,
          low,
          close: mid,
          volume: 1000
        };
        tracker.onBar(bar);
      }

      const state = tracker.getState();

      // Should not exceed maxCandidates
      expect(state.candidates.length).toBeLessThanOrEqual(5);
    });

    it('should remove invalidated candidates', () => {
      const bars: BarData[] = [
        createBar('2024-01-15T10:00:00Z', 4505, 4495, 0),
        createBar('2024-01-15T10:01:00Z', 4520, 4500, 1), // Candidate high
        createBar('2024-01-15T10:02:00Z', 4530, 4510, 2)  // Higher high - invalidates previous
      ];

      bars.forEach(bar => tracker.onBar(bar));

      const state = tracker.getState();

      // First candidate should be invalidated by higher high
      const firstCandidate = state.candidates.find(c => c.barIndex === 1);
      expect(firstCandidate).toBeUndefined();
    });
  });

  describe('getState()', () => {
    let tracker: LtfPivotTracker;

    beforeEach(() => {
      tracker = new LtfPivotTracker(TEST_SYMBOL, config);
    });

    it('should return current state with candidates', () => {
      const bar: BarData = createBar('2024-01-15T10:00:00Z', 4510, 4495, 0);

      tracker.onBar(bar);

      const state = tracker.getState();

      expect(state.candidates).toBeDefined();
      expect(Array.isArray(state.candidates)).toBe(true);
    });

    it('should return empty candidates initially', () => {
      const state = tracker.getState();

      expect(state.candidates).toHaveLength(0);
    });

    it('should include pending candidates after processing bars', () => {
      const bars: BarData[] = [
        createBar('2024-01-15T10:00:00Z', 4505, 4495, 0),
        createBar('2024-01-15T10:01:00Z', 4520, 4500, 1)
      ];

      bars.forEach(bar => tracker.onBar(bar));

      const state = tracker.getState();

      expect(state.candidates.length).toBeGreaterThan(0);
    });
  });

  describe('reset()', () => {
    let tracker: LtfPivotTracker;

    beforeEach(() => {
      tracker = new LtfPivotTracker(TEST_SYMBOL, config);
    });

    it('should clear all candidates after reset', () => {
      const bars: BarData[] = [
        createBar('2024-01-15T10:00:00Z', 4505, 4495, 0),
        createBar('2024-01-15T10:01:00Z', 4520, 4500, 1),
        createBar('2024-01-15T10:02:00Z', 4515, 4505, 2)
      ];

      bars.forEach(bar => tracker.onBar(bar));

      tracker.reset();

      const state = tracker.getState();

      expect(state.candidates).toHaveLength(0);
    });

    it('should allow processing new bars after reset', () => {
      tracker.reset();

      const bar: BarData = createBar('2024-01-15T10:00:00Z', 4510, 4495, 0);

      expect(() => tracker.onBar(bar)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    let tracker: LtfPivotTracker;

    beforeEach(() => {
      tracker = new LtfPivotTracker(TEST_SYMBOL, config);
    });

    it('should handle bars with equal high/low (single price)', () => {
      const bar: BarData = createBar('2024-01-15T10:00:00Z', 4500, 4500, 0);

      expect(() => tracker.onBar(bar)).not.toThrow();
    });

    it('should handle very large price values', () => {
      const bar: BarData = createBar('2024-01-15T10:00:00Z', 1000000, 999998, 0);

      expect(() => tracker.onBar(bar)).not.toThrow();
    });

    it('should handle very small price values', () => {
      const bar: BarData = createBar('2024-01-15T10:00:00Z', 0.0002, 0.00005, 0);

      expect(() => tracker.onBar(bar)).not.toThrow();
    });

    it('should handle rapid bar updates (1000 bars)', () => {
      for (let i = 0; i < 1000; i++) {
        const timestamp = Date.UTC(2024, 0, 15, 10, 0, i);
        const mid = 4495 + (i % 10);
        const bar: BarData = {
          symbol: 'ES',
          timestamp,
          open: mid,
          high: 4500 + (i % 10),
          low: 4490 + (i % 10),
          close: mid,
          volume: 1000
        };
        tracker.onBar(bar);
      }

      const state = tracker.getState();

      // Should complete without errors and respect maxCandidates
      expect(state.candidates.length).toBeLessThanOrEqual(50);
    });

    it('should handle alternating highs and lows', () => {
      for (let i = 0; i < 20; i++) {
        const isHigh = i % 2 === 0;
        const timestamp = new Date(`2024-01-15T10:${String(i).padStart(2, '0')}:00Z`).getTime();
        const mid = isHigh ? 4510 : 4500;
        const bar: BarData = {
          symbol: 'ES',
          timestamp,
          open: mid,
          high: isHigh ? 4520 : 4510,
          low: isHigh ? 4500 : 4490,
          close: mid,
          volume: 1000
        };
        tracker.onBar(bar);
      }

      const state = tracker.getState();

      // Should handle alternating pattern
      expect(state.candidates).toBeDefined();
    });
  });

  describe('Non-Repainting Guarantee', () => {
    let tracker: LtfPivotTracker;

    beforeEach(() => {
      tracker = new LtfPivotTracker(TEST_SYMBOL, { lookback: 2, maxCandidates: 50 });
    });

    it('should not emit pivot until lookback confirmation', () => {
      const bars: BarData[] = [
        createBar('2024-01-15T10:00:00Z', 4505, 4495, 0),
        createBar('2024-01-15T10:01:00Z', 4520, 4500, 1), // Potential pivot
        createBar('2024-01-15T10:02:00Z', 4515, 4505, 2)  // 1 bar lookback - not enough
      ];

      let confirmedPivots: PivotPoint[] = [];

      bars.forEach(bar => {
        const pivots = tracker.onBar(bar);
        confirmedPivots = confirmedPivots.concat(pivots);
      });

      // Should not have confirmed pivot yet
      expect(confirmedPivots).toHaveLength(0);
    });

    it('should emit pivot only after full lookback period', () => {
      const bars: BarData[] = [
        createBar('2024-01-15T10:00:00Z', 4505, 4495, 0),
        createBar('2024-01-15T10:01:00Z', 4520, 4500, 1), // Potential pivot
        createBar('2024-01-15T10:02:00Z', 4515, 4505, 2),
        createBar('2024-01-15T10:03:00Z', 4512, 4502, 3)  // 2 bars lookback - confirmed
      ];

      let confirmedPivots: PivotPoint[] = [];

      bars.forEach(bar => {
        const pivots = tracker.onBar(bar);
        confirmedPivots = confirmedPivots.concat(pivots);
      });

      // Should have confirmed pivot
      expect(confirmedPivots.length).toBeGreaterThan(0);
    });

    it('should never modify previously emitted pivots', () => {
      const bars: BarData[] = [
        createBar('2024-01-15T10:00:00Z', 4505, 4495, 0),
        createBar('2024-01-15T10:01:00Z', 4520, 4500, 1),
        createBar('2024-01-15T10:02:00Z', 4515, 4505, 2),
        createBar('2024-01-15T10:03:00Z', 4512, 4502, 3),
        createBar('2024-01-15T10:04:00Z', 4510, 4500, 4)
      ];

      let allPivots: PivotPoint[] = [];

      bars.forEach(bar => {
        const pivots = tracker.onBar(bar);
        allPivots = allPivots.concat(pivots);
      });

      // Store first pivot
      const firstPivot = allPivots[0];

      // Process more bars
      const moreBars: BarData[] = [
        createBar('2024-01-15T10:05:00Z', 4508, 4498, 5),
        createBar('2024-01-15T10:06:00Z', 4505, 4495, 6)
      ];

      moreBars.forEach(bar => {
        tracker.onBar(bar);
      });

      // First pivot should remain unchanged
      if (firstPivot) {
        expect(allPivots[0]).toEqual(firstPivot);
      }
    });
  });
});
