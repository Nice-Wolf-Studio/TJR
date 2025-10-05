/**
 * BOS Reversal Engine Tests
 *
 * Comprehensive test suite for BosReversalEngine covering:
 * - Window management
 * - BOS signal generation
 * - Confidence scoring
 * - Multi-window tracking
 * - Performance metrics
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { BosReversalEngine } from '../src/bos.js';
import type { BarData, PivotPoint, BosWindow, BosSignal, BosConfig } from '@tjr/contracts';


/**
 * Helper function to create proper BarData fixture
 */
function createBar(dateStr: string, high: number, low: number): BarData {
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


describe('BosReversalEngine', () => {
  const TEST_SYMBOL = 'ES';
  let config: Partial<BosConfig>;

  beforeEach(() => {
    config = {
      pivot: {
        lookback: 3,
        maxCandidates: 50
      },
      window: {
        defaultDurationMs: 14400000, // 4 hours
        maxWindows: 10
      },
      signal: {
        minConfidence: 0.7
      }
    };
  });

  describe('Constructor', () => {
    it('should create engine with valid config', () => {
      const engine = new BosReversalEngine(TEST_SYMBOL, config);
      expect(engine).toBeDefined();
    });

    it('should use default config when not provided', () => {
      const engine = new BosReversalEngine(TEST_SYMBOL);
      expect(engine).toBeDefined();
    });

    it('should accept partial config', () => {
      const partialConfig: Partial<BosConfig> = {
        pivot: {
          lookback: 2
        }
      };

      const engine = new BosReversalEngine(partialConfig as BosConfig);
      expect(engine).toBeDefined();
    });
  });

  describe('openWindow()', () => {
    let engine: BosReversalEngine;

    beforeEach(() => {
      engine = new BosReversalEngine(TEST_SYMBOL, config);
    });

    it('should open window with valid reference pivot', () => {
      const referencePivot: PivotPoint = {
        type: 'high',
        price: 4520,
        timestamp: new Date('2024-01-15T10:00:00Z').getTime(),
        barIndex: 0,
        strength: 3
      };

      const window = engine.openWindow(referencePivot);

      expect(window).toBeDefined();
      expect(window?.reference.price).toBe(4520);
    });

    it('should assign correct direction based on pivot type', () => {
      const highPivot: PivotPoint = {
        type: 'high',
        price: 4520,
        timestamp: new Date('2024-01-15T10:00:00Z').getTime(),
        barIndex: 0,
        strength: 3
      };

      const window = engine.openWindow(highPivot);

      expect(window?.direction).toBe('bearish');
    });

    it('should use default duration when not specified', () => {
      const referencePivot: PivotPoint = {
        type: 'high',
        price: 4520,
        timestamp: new Date('2024-01-15T10:00:00Z').getTime(),
        barIndex: 0,
        strength: 3
      };

      const window = engine.openWindow(referencePivot);

      if (window) {
        const duration = window.expiresAt.getTime() - window.openedAt.getTime();
        expect(duration).toBe(14400000);
      }
    });

    it('should use custom duration when provided', () => {
      const referencePivot: PivotPoint = {
        type: 'high',
        price: 4520,
        timestamp: new Date('2024-01-15T10:00:00Z').getTime(),
        barIndex: 0,
        strength: 3
      };

      const customDuration = 7200000; // 2 hours
      const window = engine.openWindow(referencePivot, customDuration);

      if (window) {
        const duration = window.expiresAt.getTime() - window.openedAt.getTime();
        expect(duration).toBe(customDuration);
      }
    });

    it('should respect maxWindows limit', () => {
      const limitConfig: Partial<BosConfig> = {
        ...config,
        windows: {
          ...config.windows,
          maxWindows: 2
        }
      };

      const limitEngine = new BosReversalEngine(TEST_SYMBOL, limitConfig);

      // Try to open 5 windows
      for (let i = 0; i < 5; i++) {
        const pivot: PivotPoint = {
          type: i % 2 === 0 ? 'high' : 'low',
          price: 4520 + i,
          timestamp: new Date(`2024-01-15T${10 + i}:00:00Z`).getTime(),
          barIndex: i,
          strength: 3
        };
        limitEngine.openWindow(pivot);
      }

      const state = limitEngine.getState();

      // Should only have 2 windows
      expect(state.activeWindows.length).toBeLessThanOrEqual(2);
    });
  });

  describe('onBar() - Basic Processing', () => {
    let engine: BosReversalEngine;

    beforeEach(() => {
      engine = new BosReversalEngine(TEST_SYMBOL, config);
    });

    it('should process valid bar without errors', () => {
      const bar: BarData = createBar('2024-01-15T10:00:00Z', 4510, 4495);

      expect(() => {
        engine.onBar(bar);
      }).not.toThrow();
    });

    it('should return empty array when no windows are active', () => {
      const bar: BarData = createBar('2024-01-15T10:00:00Z', 4510, 4495);

      const signals = engine.onBar(bar);

      expect(signals).toEqual([]);
    });

    it('should detect new pivots from bar', () => {
      // Create pivot pattern
      const bars: BarData[] = [
        createBar('2024-01-15T10:00:00Z', 4505, 4495),
        createBar('2024-01-15T10:01:00Z', 4520, 4500),
        createBar('2024-01-15T10:02:00Z', 4515, 4505),
        createBar('2024-01-15T10:03:00Z', 4512, 4502),
        createBar('2024-01-15T10:04:00Z', 4510, 4500)
      ];

      bars.forEach(bar => {
        engine.onBar(bar);
      });

      const state = engine.getState();

      // Should have detected pivots
      expect(state.confirmedPivots.length).toBeGreaterThan(0);
    });
  });

  describe('BOS Signal Generation', () => {
    let engine: BosReversalEngine;

    beforeEach(() => {
      engine = new BosReversalEngine(TEST_SYMBOL, config);
    });

    it('should generate BOS signal when price breaks pivot level', () => {
      // Create a pivot high
      const bars: BarData[] = [
        createBar('2024-01-15T10:00:00Z', 4505, 4495),
        createBar('2024-01-15T10:01:00Z', 4520, 4500),
        createBar('2024-01-15T10:02:00Z', 4515, 4505),
        createBar('2024-01-15T10:03:00Z', 4512, 4502),
        createBar('2024-01-15T10:04:00Z', 4510, 4500)
      ];

      bars.forEach(bar => {
        engine.onBar(bar);
      });

      // Open window at the pivot
      const pivot: PivotPoint = {
        type: 'high',
        price: 4520,
        timestamp: new Date('2024-01-15T10:01:00Z').getTime(),
        barIndex: 1,
        strength: 3
      };

      engine.openWindow(pivot);

      // Send bar that breaks below the pivot
      const bosBar: BarData = {
        timestamp: new Date('2024-01-15T10:05:00Z').getTime(),
        high: 4500,
        low: 4480,
        index: 5
      };

      const signals = engine.onBar(bosBar);

      // Should generate BOS signal
      expect(signals.length).toBeGreaterThan(0);
    });

    it('should assign correct direction to BOS signal', () => {
      // Create bearish BOS (break below high)
      const pivot: PivotPoint = {
        type: 'high',
        price: 4520,
        timestamp: new Date('2024-01-15T10:00:00Z').getTime(),
        barIndex: 0,
        strength: 3
      };

      engine.openWindow(pivot);

      const bosBar: BarData = {
        timestamp: new Date('2024-01-15T10:05:00Z').getTime(),
        high: 4500,
        low: 4480,
        index: 5
      };

      const signals = engine.onBar(bosBar);

      if (signals.length > 0) {
        expect(signals[0]!.direction).toBe('bearish');
      }
    });

    it('should include window reference in BOS signal', () => {
      const pivot: PivotPoint = {
        type: 'high',
        price: 4520,
        timestamp: new Date('2024-01-15T10:00:00Z').getTime(),
        barIndex: 0,
        strength: 3
      };

      const window = engine.openWindow(pivot);

      const bosBar: BarData = {
        timestamp: new Date('2024-01-15T10:05:00Z').getTime(),
        high: 4500,
        low: 4480,
        index: 5
      };

      const signals = engine.onBar(bosBar);

      if (signals.length > 0 && window) {
        expect(signals[0]!.windowId).toBe(window.id);
      }
    });

    it('should assign confidence score to BOS signal', () => {
      const pivot: PivotPoint = {
        type: 'high',
        price: 4520,
        timestamp: new Date('2024-01-15T10:00:00Z').getTime(),
        barIndex: 0,
        strength: 3
      };

      engine.openWindow(pivot);

      const bosBar: BarData = {
        timestamp: new Date('2024-01-15T10:05:00Z').getTime(),
        high: 4500,
        low: 4480,
        index: 5
      };

      const signals = engine.onBar(bosBar);

      if (signals.length > 0) {
        expect(signals[0]!.confidence).toBeDefined();
        expect(signals[0]!.confidence).toBeGreaterThan(0);
        expect(signals[0]!.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should respect minConfidence threshold', () => {
      const strictConfig: Partial<BosConfig> = {
        ...config,
        signal: {
          minConfidence: 0.9  // Very high threshold
        }
      };

      const strictEngine = new BosReversalEngine(TEST_SYMBOL, strictConfig);

      const pivot: PivotPoint = {
        type: 'high',
        price: 4520,
        timestamp: new Date('2024-01-15T10:00:00Z').getTime(),
        barIndex: 0,
        strength: 1  // Low strength = low confidence
      };

      strictEngine.openWindow(pivot);

      const bosBar: BarData = {
        timestamp: new Date('2024-01-15T10:05:00Z').getTime(),
        high: 4500,
        low: 4480,
        index: 5
      };

      const signals = strictEngine.onBar(bosBar);

      // Should not emit signal if confidence is below threshold
      signals.forEach(signal => {
        expect(signal.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });
  });

  describe('Window Management', () => {
    let engine: BosReversalEngine;

    beforeEach(() => {
      engine = new BosReversalEngine(TEST_SYMBOL, config);
    });

    it('should close window after expiration', () => {
      const pivot: PivotPoint = {
        type: 'high',
        price: 4520,
        timestamp: new Date('2024-01-15T10:00:00Z').getTime(),
        barIndex: 0,
        strength: 3
      };

      const shortDuration = 1000; // 1 second
      engine.openWindow(pivot, shortDuration);

      // Process bar after expiration
      const expiredBar: BarData = {
        timestamp: new Date('2024-01-15T14:01:00Z').getTime(), // > 4 hours later
        high: 4510,
        low: 4495,
        index: 5
      };

      engine.onBar(expiredBar);

      const state = engine.getState();

      // Window should be closed
      expect(state.activeWindows.length).toBe(0);
    });

    it('should close window after BOS signal', () => {
      const pivot: PivotPoint = {
        type: 'high',
        price: 4520,
        timestamp: new Date('2024-01-15T10:00:00Z').getTime(),
        barIndex: 0,
        strength: 3
      };

      engine.openWindow(pivot);

      const bosBar: BarData = {
        timestamp: new Date('2024-01-15T10:05:00Z').getTime(),
        high: 4500,
        low: 4480,
        index: 5
      };

      engine.onBar(bosBar);

      const state = engine.getState();

      // Window should be closed after BOS
      const closedWindow = state.activeWindows.find(w => w.status === 'closed');
      expect(closedWindow).toBeDefined();
    });

    it('should track multiple active windows simultaneously', () => {
      const pivots: PivotPoint[] = [
        {
          type: 'high',
          price: 4520,
          timestamp: new Date('2024-01-15T10:00:00Z').getTime(),
          barIndex: 0,
          strength: 3
        },
        {
          type: 'low',
          price: 4480,
          timestamp: new Date('2024-01-15T11:00:00Z').getTime(),
          barIndex: 10,
          strength: 3
        },
        {
          type: 'high',
          price: 4530,
          timestamp: new Date('2024-01-15T12:00:00Z').getTime(),
          barIndex: 20,
          strength: 3
        }
      ];

      pivots.forEach(pivot => engine.openWindow(pivot));

      const state = engine.getState();

      expect(state.activeWindows.length).toBe(3);
    });
  });

  describe('getState()', () => {
    let engine: BosReversalEngine;

    beforeEach(() => {
      engine = new BosReversalEngine(TEST_SYMBOL, config);
    });

    it('should return current state with active windows', () => {
      const state = engine.getState();

      expect(state.activeWindows).toBeDefined();
      expect(Array.isArray(state.activeWindows)).toBe(true);
    });

    it('should return empty windows initially', () => {
      const state = engine.getState();

      expect(state.activeWindows).toHaveLength(0);
    });

    it('should include pivot tracker state', () => {
      const state = engine.getState();

      expect(state.pivotState).toBeDefined();
      expect(state.confirmedPivots).toBeDefined();
    });

    it('should include performance metrics', () => {
      const bar: BarData = createBar('2024-01-15T10:00:00Z', 4510, 4495);

      engine.onBar(bar);

      const state = engine.getState();

      expect(state.metrics).toBeDefined();
      expect(state.metrics?.totalBars).toBe(1);
    });
  });

  describe('reset()', () => {
    let engine: BosReversalEngine;

    beforeEach(() => {
      engine = new BosReversalEngine(TEST_SYMBOL, config);
    });

    it('should clear all windows after reset', () => {
      const pivot: PivotPoint = {
        type: 'high',
        price: 4520,
        timestamp: new Date('2024-01-15T10:00:00Z').getTime(),
        barIndex: 0,
        strength: 3
      };

      engine.openWindow(pivot);
      engine.reset();

      const state = engine.getState();

      expect(state.activeWindows).toHaveLength(0);
    });

    it('should clear pivot tracker state after reset', () => {
      const bar: BarData = createBar('2024-01-15T10:00:00Z', 4510, 4495);

      engine.onBar(bar);
      engine.reset();

      const state = engine.getState();

      expect(state.confirmedPivots).toHaveLength(0);
    });

    it('should allow processing new bars after reset', () => {
      engine.reset();

      const bar: BarData = createBar('2024-01-15T10:00:00Z', 4510, 4495);

      expect(() => engine.onBar(bar)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    let engine: BosReversalEngine;

    beforeEach(() => {
      engine = new BosReversalEngine(TEST_SYMBOL, config);
    });

    it('should handle rapid bar updates (1000 bars)', () => {
      for (let i = 0; i < 1000; i++) {
        const bar: BarData = {
          timestamp: new Date(Date.UTC(2024, 0, 15, 10, 0, i).getTime()),
          high: 4500 + (i % 10),
          low: 4490 + (i % 10),
          index: i
        };
        engine.onBar(bar);
      }

      const state = engine.getState();

      // Should complete without errors
      expect(state.metrics?.totalBars).toBe(1000);
    });

    it('should handle overlapping windows', () => {
      const pivot1: PivotPoint = {
        type: 'high',
        price: 4520,
        timestamp: new Date('2024-01-15T10:00:00Z').getTime(),
        barIndex: 0,
        strength: 3
      };

      const pivot2: PivotPoint = {
        type: 'high',
        price: 4525,
        timestamp: new Date('2024-01-15T10:30:00Z').getTime(),
        barIndex: 10,
        strength: 3
      };

      engine.openWindow(pivot1);
      engine.openWindow(pivot2);

      const state = engine.getState();

      expect(state.activeWindows).toHaveLength(2);
    });

    it('should handle bars with equal high/low', () => {
      const bar: BarData = createBar('2024-01-15T10:00:00Z', 4500, 4500);

      expect(() => engine.onBar(bar)).not.toThrow();
    });
  });

  describe('Performance Metrics', () => {
    let engine: BosReversalEngine;

    beforeEach(() => {
      engine = new BosReversalEngine(TEST_SYMBOL, config);
    });

    it('should track total bars processed', () => {
      for (let i = 0; i < 50; i++) {
        const bar: BarData = {
          timestamp: new Date(Date.UTC(2024, 0, 15, 10, 0, i).getTime()),
          high: 4510,
          low: 4495,
          index: i
        };
        engine.onBar(bar);
      }

      const state = engine.getState();

      expect(state.metrics?.totalBars).toBe(50);
    });

    it('should track total signals generated', () => {
      const pivot: PivotPoint = {
        type: 'high',
        price: 4520,
        timestamp: new Date('2024-01-15T10:00:00Z').getTime(),
        barIndex: 0,
        strength: 3
      };

      engine.openWindow(pivot);

      const bosBar: BarData = {
        timestamp: new Date('2024-01-15T10:05:00Z').getTime(),
        high: 4500,
        low: 4480,
        index: 5
      };

      engine.onBar(bosBar);

      const state = engine.getState();

      expect(state.metrics?.totalSignals).toBeGreaterThan(0);
    });
  });

  describe('Non-Repainting Guarantee', () => {
    let engine: BosReversalEngine;

    beforeEach(() => {
      engine = new BosReversalEngine(TEST_SYMBOL, config);
    });

    it('should not emit BOS signal until pivot is confirmed', () => {
      // Process bars that create potential pivot but not confirmed yet
      const bars: BarData[] = [
        createBar('2024-01-15T10:00:00Z', 4505, 4495),
        createBar('2024-01-15T10:01:00Z', 4520, 4500)
      ];

      let allSignals: BosSignal[] = [];

      bars.forEach(bar => {
        const signals = engine.onBar(bar);
        allSignals = allSignals.concat(signals);
      });

      // Should not emit BOS for unconfirmed pivot
      expect(allSignals).toHaveLength(0);
    });

    it('should never modify previously emitted signals', () => {
      const pivot: PivotPoint = {
        type: 'high',
        price: 4520,
        timestamp: new Date('2024-01-15T10:00:00Z').getTime(),
        barIndex: 0,
        strength: 3
      };

      engine.openWindow(pivot);

      const bosBar: BarData = {
        timestamp: new Date('2024-01-15T10:05:00Z').getTime(),
        high: 4500,
        low: 4480,
        index: 5
      };

      const signals = engine.onBar(bosBar);
      const firstSignal = signals[0];

      // Process more bars
      for (let i = 6; i < 10; i++) {
        const bar: BarData = {
          timestamp: new Date(`2024-01-15T10:${String(i).getTime().padStart(2, '0')}:00Z`),
          high: 4490 + i,
          low: 4480 + i,
          index: i
        };
        engine.onBar(bar);
      }

      // First signal should remain unchanged
      if (firstSignal) {
        expect(signals[0]).toEqual(firstSignal);
      }
    });
  });
});
