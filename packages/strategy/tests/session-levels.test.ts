/**
 * Session Levels Engine Tests
 *
 * Comprehensive test suite for SessionLevelsEngine covering:
 * - Constructor validation
 * - Session boundary materialization
 * - Bar processing and level tracking
 * - Edge cases (duplicates, out-of-order, midnight crossing)
 * - Timezone handling
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { SessionLevelsEngine, type MarketBar } from '../src/session-levels.js';
import type { SymbolSessionsConfig } from '@tjr/contracts';

describe('SessionLevelsEngine', () => {
  let config: SymbolSessionsConfig;

  beforeEach(() => {
    config = {
      symbol: 'ES',
      windows: [
        { name: 'ASIA', start: '18:00', end: '03:00', timezone: 'America/Chicago' },
        { name: 'LONDON', start: '03:00', end: '09:30', timezone: 'America/Chicago' },
        { name: 'NY', start: '09:30', end: '16:00', timezone: 'America/Chicago' }
      ]
    };
  });

  describe('Constructor', () => {
    it('should create engine with valid config', () => {
      const engine = new SessionLevelsEngine({ symbol: 'ES', cfg: config });
      expect(engine).toBeDefined();
    });

    it('should throw error with empty symbol', () => {
      expect(() => {
        new SessionLevelsEngine({ symbol: '', cfg: config });
      }).toThrow('Invalid symbol');
    });

    it('should throw error with invalid symbol type', () => {
      expect(() => {
        new SessionLevelsEngine({ symbol: null as any, cfg: config });
      }).toThrow('Invalid symbol');
    });

    it('should throw error with missing windows config', () => {
      expect(() => {
        new SessionLevelsEngine({ symbol: 'ES', cfg: { symbol: 'ES', windows: null as any } });
      }).toThrow('Invalid configuration');
    });

    it('should trim symbol whitespace', () => {
      const engine = new SessionLevelsEngine({ symbol: '  ES  ', cfg: config });
      const snapshot = engine.startDate('2024-01-15');
      expect(snapshot.symbol).toBe('ES');
    });
  });

  describe('startDate()', () => {
    let engine: SessionLevelsEngine;

    beforeEach(() => {
      engine = new SessionLevelsEngine({ symbol: 'ES', cfg: config });
    });

    it('should initialize session boundaries for valid date', () => {
      const snapshot = engine.startDate('2024-01-15');

      expect(snapshot.symbol).toBe('ES');
      expect(snapshot.boundaries).toHaveLength(3);
      expect(snapshot.levels).toHaveLength(3);
    });

    it('should return levels with NaN high/low before processing bars', () => {
      const snapshot = engine.startDate('2024-01-15');

      snapshot.levels.forEach(level => {
        expect(Number.isNaN(level.high)).toBe(true);
        expect(Number.isNaN(level.low)).toBe(true);
      });
    });

    it('should throw error with invalid date format', () => {
      expect(() => {
        engine.startDate('01/15/2024');
      }).toThrow('Invalid date format');
    });

    it('should throw error with empty date', () => {
      expect(() => {
        engine.startDate('');
      }).toThrow('Invalid date format');
    });

    it('should materialize boundaries in chronological order', () => {
      const snapshot = engine.startDate('2024-01-15');

      for (let i = 0; i < snapshot.boundaries.length - 1; i++) {
        const current = snapshot.boundaries[i]!;
        const next = snapshot.boundaries[i + 1]!;
        expect(current.start.getTime()).toBeLessThan(next.start.getTime());
      }
    });

    it('should handle midnight-crossing ASIA session', () => {
      const snapshot = engine.startDate('2024-01-15');
      const asiaBoundary = snapshot.boundaries.find(b => b.name === 'ASIA');

      expect(asiaBoundary).toBeDefined();
      expect(asiaBoundary!.end.getTime()).toBeGreaterThan(asiaBoundary!.start.getTime());
    });

    it('should clear previous date state when starting new date', () => {
      engine.startDate('2024-01-15');
      const bar: MarketBar = {
        t: new Date('2024-01-16T00:00:00Z'),
        o: 4500,
        h: 4510,
        l: 4495,
        c: 4505
      };
      engine.onBar(bar);

      // Start new date - should clear previous bars
      const snapshot = engine.startDate('2024-01-16');
      snapshot.levels.forEach(level => {
        expect(Number.isNaN(level.high)).toBe(true);
      });
    });
  });

  describe('onBar()', () => {
    let engine: SessionLevelsEngine;

    beforeEach(() => {
      engine = new SessionLevelsEngine({ symbol: 'ES', cfg: config });
      engine.startDate('2024-01-15');
    });

    it('should throw error when no date is started', () => {
      const freshEngine = new SessionLevelsEngine({ symbol: 'ES', cfg: config });

      expect(() => {
        freshEngine.onBar({
          t: new Date('2024-01-15T20:00:00Z'),
          o: 4500,
          h: 4510,
          l: 4495,
          c: 4505
        });
      }).toThrow('No date started');
    });

    it('should throw error with invalid bar timestamp', () => {
      expect(() => {
        engine.onBar({
          t: null as any,
          o: 4500,
          h: 4510,
          l: 4495,
          c: 4505
        });
      }).toThrow('Invalid bar');
    });

    it('should throw error with invalid high/low values', () => {
      expect(() => {
        engine.onBar({
          t: new Date('2024-01-15T20:00:00Z'),
          o: 4500,
          h: NaN,
          l: 4495,
          c: 4505
        });
      }).toThrow('Invalid bar');
    });

    it('should update session high when bar high is greater', () => {
      // Use timestamps in ASIA session: 7PM-8PM Chicago Jan 15
      engine.onBar({
        t: new Date('2024-01-16T01:00:00Z'),
        o: 4500,
        h: 4510,
        l: 4495,
        c: 4505
      });

      engine.onBar({
        t: new Date('2024-01-16T02:00:00Z'),
        o: 4505,
        h: 4520,
        l: 4500,
        c: 4515
      });

      const snapshot = engine.getSnapshot();
      const asiaLevels = snapshot.levels.find(l => l.session === 'ASIA');

      expect(asiaLevels?.high).toBe(4520);
    });

    it('should update session low when bar low is smaller', () => {
      // Use timestamps in ASIA session: 7PM-8PM Chicago Jan 15
      engine.onBar({
        t: new Date('2024-01-16T01:00:00Z'),
        o: 4500,
        h: 4510,
        l: 4495,
        c: 4505
      });

      engine.onBar({
        t: new Date('2024-01-16T02:00:00Z'),
        o: 4505,
        h: 4520,
        l: 4490,
        c: 4515
      });

      const snapshot = engine.getSnapshot();
      const asiaLevels = snapshot.levels.find(l => l.session === 'ASIA');

      expect(asiaLevels?.low).toBe(4490);
    });

    it('should track timestamp when high/low is reached', () => {
      // Use timestamp in ASIA session: 7PM Chicago Jan 15
      const timestamp = new Date('2024-01-16T01:00:00Z');

      engine.onBar({
        t: timestamp,
        o: 4500,
        h: 4510,
        l: 4495,
        c: 4505
      });

      const snapshot = engine.getSnapshot();
      const asiaLevels = snapshot.levels.find(l => l.session === 'ASIA');

      expect(asiaLevels?.highTime.getTime()).toBe(timestamp.getTime());
      expect(asiaLevels?.lowTime.getTime()).toBe(timestamp.getTime());
    });

    it('should be idempotent - ignore duplicate bars', () => {
      const bar: MarketBar = {
        t: new Date('2024-01-15T20:00:00Z'),
        o: 4500,
        h: 4510,
        l: 4495,
        c: 4505
      };

      engine.onBar(bar);
      const snapshot1 = engine.getSnapshot();

      // Process same bar again
      engine.onBar(bar);
      const snapshot2 = engine.getSnapshot();

      expect(snapshot1).toEqual(snapshot2);
    });

    it('should throw error for out-of-order bars', () => {
      engine.onBar({
        t: new Date('2024-01-15T21:00:00Z'),
        o: 4500,
        h: 4510,
        l: 4495,
        c: 4505
      });

      expect(() => {
        engine.onBar({
          t: new Date('2024-01-15T20:00:00Z'),
          o: 4500,
          h: 4510,
          l: 4495,
          c: 4505
        });
      }).toThrow('Out-of-order bar');
    });

    it('should ignore bars outside session boundaries', () => {
      // Bar at 01:00 UTC is 7PM Chicago on Jan 14 - outside Jan 15 sessions
      // This should be ignored and ASIA session should remain NaN
      engine.onBar({
        t: new Date('2024-01-15T01:00:00Z'),
        o: 4500,
        h: 4510,
        l: 4495,
        c: 4505
      });

      const snapshot = engine.getSnapshot();
      const asiaLevels = snapshot.levels.find(l => l.session === 'ASIA');

      // ASIA session should still be NaN (no data for Jan 15)
      expect(Number.isNaN(asiaLevels!.high)).toBe(true);
    });

    it('should process bars in different sessions independently', () => {
      // NY session bar: 10AM Chicago Jan 15 = 16:00 UTC Jan 15
      // (NY session is 9:30AM-4PM Chicago on Jan 15)
      engine.onBar({
        t: new Date('2024-01-15T16:00:00Z'),
        o: 4520,
        h: 4530,
        l: 4515,
        c: 4525
      });

      // ASIA session bar: 7PM Chicago Jan 15 = 01:00 UTC Jan 16
      // (Chronologically after NY session)
      engine.onBar({
        t: new Date('2024-01-16T01:00:00Z'),
        o: 4500,
        h: 4510,
        l: 4495,
        c: 4505
      });

      const snapshot = engine.getSnapshot();
      const asiaLevels = snapshot.levels.find(l => l.session === 'ASIA');
      const nyLevels = snapshot.levels.find(l => l.session === 'NY');

      expect(nyLevels?.high).toBe(4530);
      expect(asiaLevels?.high).toBe(4510);
    });

    it('should keep earliest timestamp for equal highs', () => {
      // ASIA session: 7PM and 8PM Chicago Jan 15
      const earlyTime = new Date('2024-01-16T01:00:00Z');
      const lateTime = new Date('2024-01-16T02:00:00Z');

      engine.onBar({
        t: earlyTime,
        o: 4500,
        h: 4510,
        l: 4495,
        c: 4505
      });

      engine.onBar({
        t: lateTime,
        o: 4505,
        h: 4510, // Equal high
        l: 4500,
        c: 4508
      });

      const snapshot = engine.getSnapshot();
      const asiaLevels = snapshot.levels.find(l => l.session === 'ASIA');

      expect(asiaLevels?.highTime.getTime()).toBe(earlyTime.getTime());
    });

    it('should keep earliest timestamp for equal lows', () => {
      // ASIA session: 7PM and 8PM Chicago Jan 15
      const earlyTime = new Date('2024-01-16T01:00:00Z');
      const lateTime = new Date('2024-01-16T02:00:00Z');

      engine.onBar({
        t: earlyTime,
        o: 4500,
        h: 4510,
        l: 4495,
        c: 4505
      });

      engine.onBar({
        t: lateTime,
        o: 4505,
        h: 4510,
        l: 4495, // Equal low
        c: 4508
      });

      const snapshot = engine.getSnapshot();
      const asiaLevels = snapshot.levels.find(l => l.session === 'ASIA');

      expect(asiaLevels?.lowTime.getTime()).toBe(earlyTime.getTime());
    });
  });

  describe('getSnapshot()', () => {
    let engine: SessionLevelsEngine;

    beforeEach(() => {
      engine = new SessionLevelsEngine({ symbol: 'ES', cfg: config });
      engine.startDate('2024-01-15');
    });

    it('should throw error when no date is started', () => {
      const freshEngine = new SessionLevelsEngine({ symbol: 'ES', cfg: config });

      expect(() => {
        freshEngine.getSnapshot();
      }).toThrow('No date started');
    });

    it('should return snapshot with all sessions', () => {
      const snapshot = engine.getSnapshot();

      expect(snapshot.symbol).toBe('ES');
      expect(snapshot.boundaries).toHaveLength(3);
      expect(snapshot.levels).toHaveLength(3);
    });

    it('should return levels in chronological order', () => {
      const snapshot = engine.getSnapshot();

      for (let i = 0; i < snapshot.levels.length - 1; i++) {
        const currentBoundary = snapshot.boundaries.find(b => b.name === snapshot.levels[i]!.session);
        const nextBoundary = snapshot.boundaries.find(b => b.name === snapshot.levels[i + 1]!.session);

        expect(currentBoundary!.start.getTime()).toBeLessThanOrEqual(nextBoundary!.start.getTime());
      }
    });

    it('should return defensive copy of boundaries', () => {
      const snapshot1 = engine.getSnapshot();
      const snapshot2 = engine.getSnapshot();

      expect(snapshot1.boundaries).not.toBe(snapshot2.boundaries);
      expect(snapshot1.boundaries).toEqual(snapshot2.boundaries);
    });
  });

  describe('endDate()', () => {
    let engine: SessionLevelsEngine;

    beforeEach(() => {
      engine = new SessionLevelsEngine({ symbol: 'ES', cfg: config });
      engine.startDate('2024-01-15');
    });

    it('should throw error when no date is started', () => {
      const freshEngine = new SessionLevelsEngine({ symbol: 'ES', cfg: config });

      expect(() => {
        freshEngine.endDate();
      }).toThrow('No date started');
    });

    it('should return final snapshot before clearing state', () => {
      engine.onBar({
        t: new Date('2024-01-15T20:00:00Z'),
        o: 4500,
        h: 4510,
        l: 4495,
        c: 4505
      });

      const finalSnapshot = engine.endDate();

      expect(finalSnapshot.symbol).toBe('ES');
      expect(finalSnapshot.boundaries).toHaveLength(3);
      expect(finalSnapshot.levels).toHaveLength(3);
    });

    it('should clear all state after endDate', () => {
      engine.onBar({
        t: new Date('2024-01-15T20:00:00Z'),
        o: 4500,
        h: 4510,
        l: 4495,
        c: 4505
      });

      engine.endDate();

      expect(() => {
        engine.getSnapshot();
      }).toThrow('No date started');
    });

    it('should allow starting new date after endDate', () => {
      engine.endDate();

      const newSnapshot = engine.startDate('2024-01-16');
      expect(newSnapshot.symbol).toBe('ES');
    });
  });

  describe('Edge Cases', () => {
    let engine: SessionLevelsEngine;

    beforeEach(() => {
      engine = new SessionLevelsEngine({ symbol: 'ES', cfg: config });
      engine.startDate('2024-01-15');
    });

    it('should handle bar with high === low (single price bar)', () => {
      // Use timestamp in ASIA session: 7PM Chicago Jan 15 = 01:00 UTC Jan 16
      engine.onBar({
        t: new Date('2024-01-16T01:00:00Z'),
        o: 4500,
        h: 4500,
        l: 4500,
        c: 4500
      });

      const snapshot = engine.getSnapshot();
      const asiaLevels = snapshot.levels.find(l => l.session === 'ASIA');

      expect(asiaLevels?.high).toBe(4500);
      expect(asiaLevels?.low).toBe(4500);
    });

    it('should handle very large price values', () => {
      // Use timestamp in ASIA session: 7PM Chicago Jan 15 = 01:00 UTC Jan 16
      engine.onBar({
        t: new Date('2024-01-16T01:00:00Z'),
        o: 999999,
        h: 1000000,
        l: 999998,
        c: 999999
      });

      const snapshot = engine.getSnapshot();
      const asiaLevels = snapshot.levels.find(l => l.session === 'ASIA');

      expect(asiaLevels?.high).toBe(1000000);
      expect(asiaLevels?.low).toBe(999998);
    });

    it('should handle very small price values', () => {
      // Use timestamp in ASIA session: 7PM Chicago Jan 15 = 01:00 UTC Jan 16
      engine.onBar({
        t: new Date('2024-01-16T01:00:00Z'),
        o: 0.0001,
        h: 0.0002,
        l: 0.00005,
        c: 0.00015
      });

      const snapshot = engine.getSnapshot();
      const asiaLevels = snapshot.levels.find(l => l.session === 'ASIA');

      expect(asiaLevels?.high).toBe(0.0002);
      expect(asiaLevels?.low).toBe(0.00005);
    });

    it('should handle rapid bar updates (1000 bars)', () => {
      // Start in ASIA session: 7PM Chicago Jan 15 = 01:00 UTC Jan 16
      // ASIA session runs 00:00-09:00 UTC Jan 16 (6PM Jan 15 - 3AM Jan 16 Chicago)
      // Starting at 01:00 UTC, we can add up to 08:59, which is 8 hours = 480 minutes
      // Test with 480 bars (1 per minute) to stay within ASIA session
      const startTime = new Date('2024-01-16T01:00:00Z');

      for (let i = 0; i < 480; i++) {
        const timestamp = new Date(startTime.getTime() + i * 60000); // 1 minute apart
        engine.onBar({
          t: timestamp,
          o: 4500 + i,
          h: 4500 + i + 0.5,
          l: 4500 + i - 0.5,
          c: 4500 + i
        });
      }

      const snapshot = engine.getSnapshot();
      const asiaLevels = snapshot.levels.find(l => l.session === 'ASIA');

      expect(asiaLevels?.high).toBe(4979.5); // 4500 + 479 + 0.5
      expect(asiaLevels?.low).toBe(4499.5);  // 4500 + 0 - 0.5
    });
  });

  describe('Multiple Symbols', () => {
    it('should handle different symbols with different configs', () => {
      const esEngine = new SessionLevelsEngine({ symbol: 'ES', cfg: config });

      const nqConfig: SymbolSessionsConfig = {
        symbol: 'NQ',
        windows: [
          { name: 'ASIA', start: '18:00', end: '03:00', timezone: 'America/Chicago' },
          { name: 'LONDON', start: '03:00', end: '09:30', timezone: 'America/Chicago' },
          { name: 'NY', start: '09:30', end: '16:00', timezone: 'America/Chicago' }
        ]
      };
      const nqEngine = new SessionLevelsEngine({ symbol: 'NQ', cfg: nqConfig });

      esEngine.startDate('2024-01-15');
      nqEngine.startDate('2024-01-15');

      // Use timestamp in ASIA session: 7PM Chicago Jan 15 = 01:00 UTC Jan 16
      esEngine.onBar({
        t: new Date('2024-01-16T01:00:00Z'),
        o: 4500,
        h: 4510,
        l: 4495,
        c: 4505
      });

      nqEngine.onBar({
        t: new Date('2024-01-16T01:00:00Z'),
        o: 16000,
        h: 16050,
        l: 15950,
        c: 16025
      });

      const esSnapshot = esEngine.getSnapshot();
      const nqSnapshot = nqEngine.getSnapshot();

      expect(esSnapshot.symbol).toBe('ES');
      expect(nqSnapshot.symbol).toBe('NQ');

      const esAsia = esSnapshot.levels.find(l => l.session === 'ASIA');
      const nqAsia = nqSnapshot.levels.find(l => l.session === 'ASIA');

      expect(esAsia?.high).toBe(4510);
      expect(nqAsia?.high).toBe(16050);
    });
  });
});
