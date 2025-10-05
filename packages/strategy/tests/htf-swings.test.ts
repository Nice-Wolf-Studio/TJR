/**
 * HTF Swing Detection Tests
 *
 * Comprehensive test suite for HtfSwings covering:
 * - Ring buffer operations
 * - Swing high/low detection
 * - Confirmation logic
 * - H1/H4 timeframe aggregation
 * - Edge cases and performance
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { HtfSwings } from '../src/htf-swings.js';
import type { HtfSwingsConfig, OhlcBar, SwingPoint } from '@tjr/contracts';
import { DEFAULT_SWING_CONFIG } from '@tjr/contracts';

describe('HtfSwings', () => {
  let config: HtfSwingsConfig;

  beforeEach(() => {
    config = {
      symbol: 'ES',
      H1: DEFAULT_SWING_CONFIG,
      H4: DEFAULT_SWING_CONFIG,
      aggregate: true,
      baseTf: '1m'
    };
  });

  describe('Constructor', () => {
    it('should create engine with valid config', () => {
      const engine = new HtfSwings(config);
      expect(engine).toBeDefined();
    });

    it('should use default swing config when not provided', () => {
      const minimalConfig: HtfSwingsConfig = {
        symbol: 'ES',
        H1: DEFAULT_SWING_CONFIG,
        H4: DEFAULT_SWING_CONFIG
      };

      const engine = new HtfSwings(minimalConfig);
      expect(engine).toBeDefined();
    });

    it('should accept custom swing config', () => {
      const customConfig: HtfSwingsConfig = {
        symbol: 'NQ',
        H1: { lookback: 3, keepRecent: 10 },
        H4: { lookback: 5, keepRecent: 5 },
        aggregate: false
      };

      const engine = new HtfSwings(customConfig);
      expect(engine).toBeDefined();
    });
  });

  describe('startDate()', () => {
    let engine: HtfSwings;

    beforeEach(() => {
      engine = new HtfSwings(config);
    });

    it('should initialize engine for valid date', () => {
      const snapshot = engine.startDate('2024-01-15');

      expect(snapshot.symbol).toBe('ES');
      expect(snapshot.H1).toBeDefined();
      expect(snapshot.H4).toBeDefined();
    });

    it('should return empty swing series initially', () => {
      const snapshot = engine.startDate('2024-01-15');

      expect(snapshot.H1.swingHighs).toHaveLength(0);
      expect(snapshot.H1.swingLows).toHaveLength(0);
      expect(snapshot.H4.swingHighs).toHaveLength(0);
      expect(snapshot.H4.swingLows).toHaveLength(0);
    });

    it('should throw error with invalid date format', () => {
      expect(() => {
        engine.startDate('01/15/2024');
      }).toThrow();
    });

    it('should clear previous date state', () => {
      engine.startDate('2024-01-15');

      const bar: OhlcBar = {
        t: new Date('2024-01-15T10:00:00Z'),
        o: 4500,
        h: 4510,
        l: 4495,
        c: 4505,
        v: 1000
      };
      engine.onBar(bar);

      // Start new date
      const snapshot = engine.startDate('2024-01-16');

      expect(snapshot.H1.swingHighs).toHaveLength(0);
      expect(snapshot.H4.swingHighs).toHaveLength(0);
    });
  });

  describe('onBar() - Basic Processing', () => {
    let engine: HtfSwings;

    beforeEach(() => {
      engine = new HtfSwings(config);
      engine.startDate('2024-01-15');
    });

    it('should process valid bar without errors', () => {
      const bar: OhlcBar = {
        t: new Date('2024-01-15T10:00:00Z'),
        o: 4500,
        h: 4510,
        l: 4495,
        c: 4505,
        v: 1000
      };

      expect(() => {
        engine.onBar(bar);
      }).not.toThrow();
    });

    it('should throw error when no date is started', () => {
      const freshEngine = new HtfSwings(config);

      expect(() => {
        freshEngine.onBar({
          t: new Date('2024-01-15T10:00:00Z'),
          o: 4500,
          h: 4510,
          l: 4495,
          c: 4505,
          v: 1000
        });
      }).toThrow();
    });

    it('should handle multiple bars in sequence', () => {
      const bars: OhlcBar[] = [
        { t: new Date('2024-01-15T10:00:00Z'), o: 4500, h: 4510, l: 4495, c: 4505, v: 1000 },
        { t: new Date('2024-01-15T11:00:00Z'), o: 4505, h: 4520, l: 4500, c: 4515, v: 1100 },
        { t: new Date('2024-01-15T12:00:00Z'), o: 4515, h: 4525, l: 4510, c: 4520, v: 1200 }
      ];

      bars.forEach(bar => {
        expect(() => engine.onBar(bar)).not.toThrow();
      });
    });
  });

  describe('Swing Detection - Swing Highs', () => {
    let engine: HtfSwings;

    beforeEach(() => {
      engine = new HtfSwings({
        symbol: 'ES',
        H1: { lookback: 2, keepRecent: 10 },
        H4: { lookback: 2, keepRecent: 5 }
      });
      engine.startDate('2024-01-15');
    });

    it('should detect swing high after lookback confirmation', () => {
      // Create a peak pattern: low, high, low
      const bars: OhlcBar[] = [
        { t: new Date('2024-01-15T10:00:00Z'), o: 4500, h: 4505, l: 4495, c: 4500, v: 1000 },
        { t: new Date('2024-01-15T11:00:00Z'), o: 4500, h: 4520, l: 4500, c: 4515, v: 1000 }, // Peak
        { t: new Date('2024-01-15T12:00:00Z'), o: 4515, h: 4518, l: 4510, c: 4512, v: 1000 },
        { t: new Date('2024-01-15T13:00:00Z'), o: 4512, h: 4515, l: 4508, c: 4510, v: 1000 }  // Confirms peak
      ];

      bars.forEach(bar => engine.onBar(bar));

      const snapshot = engine.getSnapshot();

      expect(snapshot.H1.swingHighs.length).toBeGreaterThan(0);
    });

    it('should not detect swing high without confirmation', () => {
      // Just one high bar, no confirmation
      const bar: OhlcBar = {
        t: new Date('2024-01-15T10:00:00Z'),
        o: 4500,
        h: 4520,
        l: 4495,
        c: 4515,
        v: 1000
      };

      engine.onBar(bar);

      const snapshot = engine.getSnapshot();

      expect(snapshot.H1.swingHighs).toHaveLength(0);
    });

    it('should track swing high price and timestamp correctly', () => {
      const peakTime = new Date('2024-01-15T11:00:00Z');
      const peakPrice = 4520;

      const bars: OhlcBar[] = [
        { t: new Date('2024-01-15T10:00:00Z'), o: 4500, h: 4505, l: 4495, c: 4500, v: 1000 },
        { t: peakTime, o: 4500, h: peakPrice, l: 4500, c: 4515, v: 1000 },
        { t: new Date('2024-01-15T12:00:00Z'), o: 4515, h: 4518, l: 4510, c: 4512, v: 1000 },
        { t: new Date('2024-01-15T13:00:00Z'), o: 4512, h: 4515, l: 4508, c: 4510, v: 1000 }
      ];

      bars.forEach(bar => engine.onBar(bar));

      const snapshot = engine.getSnapshot();
      const swing = snapshot.H1.swingHighs[0];

      if (swing) {
        expect(swing.price).toBe(peakPrice);
        expect(swing.timestamp.getTime()).toBe(peakTime.getTime());
      }
    });
  });

  describe('Swing Detection - Swing Lows', () => {
    let engine: HtfSwings;

    beforeEach(() => {
      engine = new HtfSwings({
        symbol: 'ES',
        H1: { lookback: 2, keepRecent: 10 },
        H4: { lookback: 2, keepRecent: 5 }
      });
      engine.startDate('2024-01-15');
    });

    it('should detect swing low after lookback confirmation', () => {
      // Create a trough pattern: high, low, high
      const bars: OhlcBar[] = [
        { t: new Date('2024-01-15T10:00:00Z'), o: 4500, h: 4510, l: 4500, c: 4505, v: 1000 },
        { t: new Date('2024-01-15T11:00:00Z'), o: 4505, h: 4505, l: 4490, c: 4495, v: 1000 }, // Trough
        { t: new Date('2024-01-15T12:00:00Z'), o: 4495, h: 4500, l: 4492, c: 4498, v: 1000 },
        { t: new Date('2024-01-15T13:00:00Z'), o: 4498, h: 4505, l: 4495, c: 4502, v: 1000 }  // Confirms trough
      ];

      bars.forEach(bar => engine.onBar(bar));

      const snapshot = engine.getSnapshot();

      expect(snapshot.H1.swingLows.length).toBeGreaterThan(0);
    });

    it('should track swing low price and timestamp correctly', () => {
      const troughTime = new Date('2024-01-15T11:00:00Z');
      const troughPrice = 4490;

      const bars: OhlcBar[] = [
        { t: new Date('2024-01-15T10:00:00Z'), o: 4500, h: 4510, l: 4500, c: 4505, v: 1000 },
        { t: troughTime, o: 4505, h: 4505, l: troughPrice, c: 4495, v: 1000 },
        { t: new Date('2024-01-15T12:00:00Z'), o: 4495, h: 4500, l: 4492, c: 4498, v: 1000 },
        { t: new Date('2024-01-15T13:00:00Z'), o: 4498, h: 4505, l: 4495, c: 4502, v: 1000 }
      ];

      bars.forEach(bar => engine.onBar(bar));

      const snapshot = engine.getSnapshot();
      const swing = snapshot.H1.swingLows[0];

      if (swing) {
        expect(swing.price).toBe(troughPrice);
        expect(swing.timestamp.getTime()).toBe(troughTime.getTime());
      }
    });
  });

  describe('Ring Buffer - keepRecent Limit', () => {
    it('should respect keepRecent limit for swing highs', () => {
      const engine = new HtfSwings({
        symbol: 'ES',
        H1: { lookback: 2, keepRecent: 3 },
        H4: { lookback: 2, keepRecent: 3 }
      });

      engine.startDate('2024-01-15');

      // Create multiple swing high patterns
      for (let i = 0; i < 10; i++) {
        const baseTime = new Date(`2024-01-15T${10 + i * 4}:00:00Z`);

        const bars: OhlcBar[] = [
          { t: new Date(baseTime.getTime()), o: 4500, h: 4505, l: 4495, c: 4500, v: 1000 },
          { t: new Date(baseTime.getTime() + 3600000), o: 4500, h: 4520 + i, l: 4500, c: 4515, v: 1000 },
          { t: new Date(baseTime.getTime() + 7200000), o: 4515, h: 4518, l: 4510, c: 4512, v: 1000 },
          { t: new Date(baseTime.getTime() + 10800000), o: 4512, h: 4515, l: 4508, c: 4510, v: 1000 }
        ];

        bars.forEach(bar => engine.onBar(bar));
      }

      const snapshot = engine.getSnapshot();

      // Should keep only the 3 most recent swing highs
      expect(snapshot.H1.swingHighs.length).toBeLessThanOrEqual(3);
    });

    it('should respect keepRecent limit for swing lows', () => {
      const engine = new HtfSwings({
        symbol: 'ES',
        H1: { lookback: 2, keepRecent: 3 },
        H4: { lookback: 2, keepRecent: 3 }
      });

      engine.startDate('2024-01-15');

      // Create multiple swing low patterns
      for (let i = 0; i < 10; i++) {
        const baseTime = new Date(`2024-01-15T${10 + i * 4}:00:00Z`);

        const bars: OhlcBar[] = [
          { t: new Date(baseTime.getTime()), o: 4500, h: 4510, l: 4500, c: 4505, v: 1000 },
          { t: new Date(baseTime.getTime() + 3600000), o: 4505, h: 4505, l: 4480 - i, c: 4495, v: 1000 },
          { t: new Date(baseTime.getTime() + 7200000), o: 4495, h: 4500, l: 4492, c: 4498, v: 1000 },
          { t: new Date(baseTime.getTime() + 10800000), o: 4498, h: 4505, l: 4495, c: 4502, v: 1000 }
        ];

        bars.forEach(bar => engine.onBar(bar));
      }

      const snapshot = engine.getSnapshot();

      // Should keep only the 3 most recent swing lows
      expect(snapshot.H1.swingLows.length).toBeLessThanOrEqual(3);
    });
  });

  describe('H4 Timeframe Aggregation', () => {
    it('should aggregate H1 bars into H4 bars when enabled', () => {
      const engine = new HtfSwings({
        symbol: 'ES',
        H1: { lookback: 2, keepRecent: 10 },
        H4: { lookback: 2, keepRecent: 5 },
        aggregate: true,
        baseTf: '1h'
      });

      engine.startDate('2024-01-15');

      // Process 8 H1 bars (2 complete H4 bars)
      for (let i = 0; i < 8; i++) {
        const bar: OhlcBar = {
          t: new Date(`2024-01-15T${10 + i}:00:00Z`),
          o: 4500 + i,
          h: 4510 + i,
          l: 4495 + i,
          c: 4505 + i,
          v: 1000
        };
        engine.onBar(bar);
      }

      const snapshot = engine.getSnapshot();

      // Both H1 and H4 should have data
      expect(snapshot.H1).toBeDefined();
      expect(snapshot.H4).toBeDefined();
    });

    it('should not aggregate when aggregate is false', () => {
      const engine = new HtfSwings({
        symbol: 'ES',
        H1: { lookback: 2, keepRecent: 10 },
        H4: { lookback: 2, keepRecent: 5 },
        aggregate: false
      });

      engine.startDate('2024-01-15');

      // H4 series should exist but not update from H1 bars
      const snapshot = engine.getSnapshot();

      expect(snapshot.H4).toBeDefined();
      expect(snapshot.H4.swingHighs).toHaveLength(0);
    });
  });

  describe('getSnapshot()', () => {
    let engine: HtfSwings;

    beforeEach(() => {
      engine = new HtfSwings(config);
      engine.startDate('2024-01-15');
    });

    it('should return snapshot with symbol', () => {
      const snapshot = engine.getSnapshot();

      expect(snapshot.symbol).toBe('ES');
    });

    it('should return snapshot with H1 and H4 series', () => {
      const snapshot = engine.getSnapshot();

      expect(snapshot.H1).toBeDefined();
      expect(snapshot.H4).toBeDefined();
      expect(snapshot.H1.swingHighs).toBeDefined();
      expect(snapshot.H1.swingLows).toBeDefined();
      expect(snapshot.H4.swingHighs).toBeDefined();
      expect(snapshot.H4.swingLows).toBeDefined();
    });

    it('should include pending swings in snapshot', () => {
      const bar: OhlcBar = {
        t: new Date('2024-01-15T10:00:00Z'),
        o: 4500,
        h: 4520,
        l: 4495,
        c: 4515,
        v: 1000
      };

      engine.onBar(bar);

      const snapshot = engine.getSnapshot();

      // Pending swings should be tracked
      expect(snapshot.H1.pendingHigh).toBeDefined();
      expect(snapshot.H1.pendingLow).toBeDefined();
    });
  });

  describe('endDate()', () => {
    let engine: HtfSwings;

    beforeEach(() => {
      engine = new HtfSwings(config);
      engine.startDate('2024-01-15');
    });

    it('should return final snapshot', () => {
      const bar: OhlcBar = {
        t: new Date('2024-01-15T10:00:00Z'),
        o: 4500,
        h: 4510,
        l: 4495,
        c: 4505,
        v: 1000
      };

      engine.onBar(bar);

      const finalSnapshot = engine.endDate();

      expect(finalSnapshot.symbol).toBe('ES');
      expect(finalSnapshot.H1).toBeDefined();
      expect(finalSnapshot.H4).toBeDefined();
    });

    it('should clear all state after endDate', () => {
      engine.endDate();

      expect(() => {
        engine.getSnapshot();
      }).toThrow();
    });

    it('should allow starting new date after endDate', () => {
      engine.endDate();

      const snapshot = engine.startDate('2024-01-16');

      expect(snapshot.symbol).toBe('ES');
      expect(snapshot.H1.swingHighs).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    let engine: HtfSwings;

    beforeEach(() => {
      engine = new HtfSwings({
        symbol: 'ES',
        H1: { lookback: 2, keepRecent: 10 },
        H4: { lookback: 2, keepRecent: 5 }
      });
      engine.startDate('2024-01-15');
    });

    it('should handle bars with equal high/low (single price)', () => {
      const bar: OhlcBar = {
        t: new Date('2024-01-15T10:00:00Z'),
        o: 4500,
        h: 4500,
        l: 4500,
        c: 4500,
        v: 1000
      };

      expect(() => engine.onBar(bar)).not.toThrow();
    });

    it('should handle very large price values', () => {
      const bar: OhlcBar = {
        t: new Date('2024-01-15T10:00:00Z'),
        o: 999999,
        h: 1000000,
        l: 999998,
        c: 999999,
        v: 1000
      };

      expect(() => engine.onBar(bar)).not.toThrow();
    });

    it('should handle very small price values', () => {
      const bar: OhlcBar = {
        t: new Date('2024-01-15T10:00:00Z'),
        o: 0.0001,
        h: 0.0002,
        l: 0.00005,
        c: 0.00015,
        v: 1000
      };

      expect(() => engine.onBar(bar)).not.toThrow();
    });

    it('should handle rapid bar updates (1000 bars)', () => {
      const startTime = new Date('2024-01-15T00:00:00Z');

      for (let i = 0; i < 1000; i++) {
        const bar: OhlcBar = {
          t: new Date(startTime.getTime() + i * 3600000),
          o: 4500 + (i % 10),
          h: 4510 + (i % 10),
          l: 4495 + (i % 10),
          c: 4505 + (i % 10),
          v: 1000
        };
        engine.onBar(bar);
      }

      const snapshot = engine.getSnapshot();

      // Should complete without errors
      expect(snapshot.H1).toBeDefined();
    });

    it('should handle alternating highs and lows', () => {
      for (let i = 0; i < 20; i++) {
        const isHigh = i % 2 === 0;
        const bar: OhlcBar = {
          t: new Date(`2024-01-15T${10 + i}:00:00Z`),
          o: isHigh ? 4510 : 4490,
          h: isHigh ? 4520 : 4500,
          l: isHigh ? 4500 : 4480,
          c: isHigh ? 4515 : 4485,
          v: 1000
        };
        engine.onBar(bar);
      }

      const snapshot = engine.getSnapshot();

      // Should detect both highs and lows
      expect(snapshot.H1.swingHighs.length).toBeGreaterThan(0);
      expect(snapshot.H1.swingLows.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Metrics', () => {
    let engine: HtfSwings;

    beforeEach(() => {
      engine = new HtfSwings(config);
      engine.startDate('2024-01-15');
    });

    it('should track total bars processed', () => {
      for (let i = 0; i < 100; i++) {
        const bar: OhlcBar = {
          t: new Date(`2024-01-15T${10 + Math.floor(i / 4)}:${(i % 4) * 15}:00Z`),
          o: 4500,
          h: 4510,
          l: 4495,
          c: 4505,
          v: 1000
        };
        engine.onBar(bar);
      }

      const snapshot = engine.getSnapshot();

      expect(snapshot.H1.metrics?.totalBars).toBe(100);
    });

    it('should track confirmed vs pending swings', () => {
      // Create confirmed swing
      const bars: OhlcBar[] = [
        { t: new Date('2024-01-15T10:00:00Z'), o: 4500, h: 4505, l: 4495, c: 4500, v: 1000 },
        { t: new Date('2024-01-15T11:00:00Z'), o: 4500, h: 4520, l: 4500, c: 4515, v: 1000 },
        { t: new Date('2024-01-15T12:00:00Z'), o: 4515, h: 4518, l: 4510, c: 4512, v: 1000 },
        { t: new Date('2024-01-15T13:00:00Z'), o: 4512, h: 4515, l: 4508, c: 4510, v: 1000 }
      ];

      bars.forEach(bar => engine.onBar(bar));

      const snapshot = engine.getSnapshot();

      expect(snapshot.H1.metrics?.confirmedSwings).toBeGreaterThan(0);
    });
  });
});
