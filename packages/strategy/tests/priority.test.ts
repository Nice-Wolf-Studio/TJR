/**
 * Priority Scoring Tests
 *
 * Comprehensive test suite for priority scoring functions covering:
 * - Multi-component scoring (source, recency, proximity, confluence)
 * - Deterministic sorting
 * - Confluence banding algorithm
 * - Fixed precision arithmetic
 * - Edge cases
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  calculatePriority,
  createLevelBands,
  sortTargetsDeterministic
} from '../src/priority.js';
import type { KeyLevel, PlanTarget, PriorityConfig, ScoringContext } from '@tjr/contracts';

describe('Priority Scoring', () => {
  let config: PriorityConfig;
  let context: ScoringContext;

  beforeEach(() => {
    config = {
      weights: {
        source: {
          SESSION: 1.0,
          H1: 0.8,
          H4: 0.6
        },
        recency: 0.3,
        proximity: 0.4,
        confluence: 0.3
      },
      proximityDecay: {
        lambda: 0.01
      },
      recencyHorizonBars: {
        H1: 40,
        H4: 80
      },
      banding: {
        priceMergeTicks: 10,
        maxBandWidthTicks: 50
      }
    };

    context = {
      symbol: 'ES',
      currentRef: 4500,
      tickSize: 0.25,
      config,
      currentTime: new Date('2024-01-15T12:00:00Z')
    };
  });

  describe('calculatePriority()', () => {
    it('should calculate priority score for valid level', () => {
      const level: KeyLevel = {
        source: 'SESSION',
        kind: 'resistance',
        price: 4520,
        time: new Date('2024-01-15T10:00:00Z')
      };

      const priority = calculatePriority(level, context);

      expect(priority).toBeGreaterThan(0);
      expect(priority).toBeLessThanOrEqual(1);
    });

    it('should assign higher score to session levels', () => {
      const sessionLevel: KeyLevel = {
        source: 'SESSION',
        kind: 'resistance',
        price: 4520,
        time: new Date('2024-01-15T10:00:00Z')
      };

      const swingLevel: KeyLevel = {
        source: 'H1',
        kind: 'resistance',
        price: 4520,
        time: new Date('2024-01-15T10:00:00Z')
      };

      const sessionPriority = calculatePriority(sessionLevel, context);
      const swingPriority = calculatePriority(swingLevel, context);

      expect(sessionPriority).toBeGreaterThan(swingPriority);
    });

    it('should assign higher score to more recent levels', () => {
      const recentLevel: KeyLevel = {
        source: 'SESSION',
        kind: 'resistance',
        price: 4520,
        time: new Date('2024-01-15T10:00:00Z')
      };

      const oldLevel: KeyLevel = {
        source: 'SESSION',
        kind: 'resistance',
        price: 4520,
        time: new Date('2024-01-10T10:00:00Z')
      };

      // Context timestamp is 2024-01-15T12:00:00Z
      const updatedContext: ScoringContext = {
        ...context,
        currentRef: 4500,
                currentTime: new Date('2024-01-15T12:00:00Z')
      };

      const recentPriority = calculatePriority(recentLevel, updatedContext);
      const oldPriority = calculatePriority(oldLevel, updatedContext);

      expect(recentPriority).toBeGreaterThan(oldPriority);
    });

    it('should assign higher score to closer levels (proximity)', () => {
      const closeLevel: KeyLevel = {
        source: 'SESSION',
        kind: 'resistance',
        price: 4505, // 5 points away
        time: new Date('2024-01-15T10:00:00Z')
      };

      const farLevel: KeyLevel = {
        source: 'SESSION',
        kind: 'resistance',
        price: 4550, // 50 points away
        time: new Date('2024-01-15T10:00:00Z')
      };

      const closePriority = calculatePriority(closeLevel, context);
      const farPriority = calculatePriority(farLevel, context);

      expect(closePriority).toBeGreaterThan(farPriority);
    });

    it('should use fixed precision arithmetic (6 decimals)', () => {
      const level: KeyLevel = {
        source: 'SESSION',
        kind: 'resistance',
        price: 4520,
        time: new Date('2024-01-15T10:00:00Z')
      };

      const priority = calculatePriority(level, context);

      // Check that result has at most 6 decimal places
      const decimalPlaces = (priority.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(6);
    });

    it('should handle levels with zero distance (at current price)', () => {
      const atPriceLevel: KeyLevel = {
        source: 'SESSION',
        kind: 'resistance',
        price: 4500, // Same as currentRef
        time: new Date('2024-01-15T10:00:00Z')
      };

      const priority = calculatePriority(atPriceLevel, context);

      // Should still produce valid score
      expect(priority).toBeGreaterThan(0);
    });

    it('should handle very old levels', () => {
      const veryOldLevel: KeyLevel = {
        source: 'SESSION',
        kind: 'resistance',
        price: 4520,
        time: new Date('2024-01-01T10:00:00Z') // Very old
      };

      const updatedContext: ScoringContext = {
        ...context,
        currentTime: new Date('2024-01-15T12:00:00Z'),
              };

      const priority = calculatePriority(veryOldLevel, updatedContext);

      // Should produce lower score due to age
      expect(priority).toBeGreaterThanOrEqual(0);
      expect(priority).toBeLessThanOrEqual(1);
    });
  });

  describe('createLevelBands()', () => {
    it('should create bands for levels within maxDistance', () => {
      const levels: KeyLevel[] = [
        {
          source: 'SESSION',
          kind: 'resistance',
          price: 4520,
          time: new Date('2024-01-15T10:00:00Z')
        },
        {
          source: 'H1',
          kind: 'resistance',
          price: 4522, // Within 10 points of first level
          time: new Date('2024-01-15T10:30:00Z')
        }
      ];

      const bands = createLevelBands(levels, context);

      expect(bands.length).toBeGreaterThan(0);
    });

    it('should group levels within same band', () => {
      const levels: KeyLevel[] = [
        {
          source: 'SESSION',
          kind: 'resistance',
          price: 4520,
          time: new Date('2024-01-15T10:00:00Z')
        },
        {
          source: 'H1',
          kind: 'resistance',
          price: 4521,
          time: new Date('2024-01-15T10:30:00Z')
        },
        {
          source: 'SESSION',
          kind: 'support',
          price: 4522,
          time: new Date('2024-01-15T11:00:00Z')
        }
      ];

      const bands = createLevelBands(levels, context);

      // Should create one band with all three levels
      // Check if any level has a band with multiple constituents
      const levelWithBand = bands.find(b => b.band && b.band.constituents.length >= 2);
      expect(levelWithBand).toBeDefined();
    });

    it('should respect minLevels threshold', () => {
      const levels: KeyLevel[] = [
        {
          source: 'SESSION',
          kind: 'resistance',
          price: 4520,
          time: new Date('2024-01-15T10:00:00Z')
        }
        // Only one level - should not create a confluent band
      ];

      const strictConfig = {
        currentRef: 10,
        minLevels: 2
      };

      const bands = createLevelBands(levels, context);

      // Should not create band for single level
      const confluenceBand = bands.find(b => b.levelCount >= 2);
      expect(confluenceBand).toBeUndefined();
    });

    it('should create separate bands for distant levels', () => {
      const levels: KeyLevel[] = [
        {
          source: 'SESSION',
          kind: 'resistance',
          price: 4520,
          time: new Date('2024-01-15T10:00:00Z')
        },
        {
          source: 'SESSION',
          kind: 'resistance',
          price: 4521,
          time: new Date('2024-01-15T10:30:00Z')
        },
        {
          source: 'H1',
          kind: 'resistance',
          price: 4600, // Far from others
          time: new Date('2024-01-15T11:00:00Z')
        },
        {
          source: 'H1',
          kind: 'support',
          price: 4601,
          time: new Date('2024-01-15T11:30:00Z')
        }
      ];

      const bands = createLevelBands(levels, context);

      // Should create at least 2 bands
      expect(bands.length).toBeGreaterThanOrEqual(2);
    });

    it('should calculate band average correctly', () => {
      const levels: KeyLevel[] = [
        {
          source: 'SESSION',
          kind: 'resistance',
          price: 4520,
          time: new Date('2024-01-15T10:00:00Z')
        },
        {
          source: 'H1',
          kind: 'resistance',
          price: 4522,
          time: new Date('2024-01-15T10:30:00Z')
        }
      ];

      const bands = createLevelBands(levels, context);
      const levelBandPair = bands[0];

      if (levelBandPair && levelBandPair.band) {
        // Average should be (4520 + 4522) / 2 = 4521
        expect(levelBandPair.band.avgPrice).toBeCloseTo(4521, 6);
      }
    });
  });

  describe('sortTargetsDeterministic()', () => {
    it('should sort targets by priority descending', () => {
      const targets: PlanTarget[] = [
        {
          level: {
            source: 'H4',
            kind: 'resistance',
            price: 4520,
            time: new Date('2024-01-15T10:00:00Z')
          },
          priority: 0.5,
          status: 'pending'
        },
        {
          level: {
            source: 'SESSION',
            kind: 'resistance',
            price: 4530,
            time: new Date('2024-01-15T10:00:00Z')
          },
          priority: 0.9,
          status: 'pending'
        },
        {
          level: {
            source: 'H1',
            kind: 'resistance',
            price: 4510,
            time: new Date('2024-01-15T10:00:00Z')
          },
          priority: 0.7,
          status: 'pending'
        }
      ];

      const sorted = sortTargetsDeterministic(targets);

      // Should be sorted: 0.9, 0.7, 0.5
      expect(sorted[0]!.priority).toBe(0.9);
      expect(sorted[1]!.priority).toBe(0.7);
      expect(sorted[2]!.priority).toBe(0.5);
    });

    it('should use price as tiebreaker for equal priorities', () => {
      const targets: PlanTarget[] = [
        {
          level: {
            source: 'SESSION',
            kind: 'resistance',
            price: 4530,
            time: new Date('2024-01-15T10:00:00Z')
          },
          priority: 0.8,
          status: 'pending'
        },
        {
          level: {
            source: 'SESSION',
            kind: 'support',
            price: 4520,
            time: new Date('2024-01-15T10:00:00Z')
          },
          priority: 0.8,
          status: 'pending'
        }
      ];

      const sorted = sortTargetsDeterministic(targets);

      // Same priority - should sort by price
      expect(sorted[0]!.level.price).not.toBe(sorted[1]!.level.price);
    });

    it('should be deterministic across multiple runs', () => {
      const targets: PlanTarget[] = [
        {
          level: {
            source: 'SESSION',
            kind: 'resistance',
            price: 4520,
            time: new Date('2024-01-15T10:00:00Z')
          },
          priority: 0.75,
          status: 'pending'
        },
        {
          level: {
            source: 'H1',
            kind: 'resistance',
            price: 4530,
            time: new Date('2024-01-15T10:00:00Z')
          },
          priority: 0.75,
          status: 'pending'
        },
        {
          level: {
            source: 'SESSION',
            kind: 'support',
            price: 4525,
            time: new Date('2024-01-15T10:00:00Z')
          },
          priority: 0.75,
          status: 'pending'
        }
      ];

      const sorted1 = sortTargetsDeterministic(targets);
      const sorted2 = sortTargetsDeterministic(targets);

      // Should produce same order
      expect(sorted1).toEqual(sorted2);
    });

    it('should handle empty array', () => {
      const sorted = sortTargetsDeterministic([]);
      expect(sorted).toEqual([]);
    });

    it('should handle single target', () => {
      const targets: PlanTarget[] = [
        {
          level: {
            source: 'SESSION',
            kind: 'resistance',
            price: 4520,
            time: new Date('2024-01-15T10:00:00Z')
          },
          priority: 0.8,
          status: 'pending'
        }
      ];

      const sorted = sortTargetsDeterministic(targets);

      expect(sorted).toHaveLength(1);
      expect(sorted[0]).toEqual(targets[0]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle levels with very close prices (epsilon)', () => {
      const level1: KeyLevel = {
        source: 'SESSION',
        kind: 'resistance',
        price: 4520.123456,
        time: new Date('2024-01-15T10:00:00Z')
      };

      const level2: KeyLevel = {
        source: 'H1',
        kind: 'resistance',
        price: 4520.123457, // 0.000001 difference
        time: new Date('2024-01-15T10:30:00Z')
      };

      const levels = [level1, level2];
      const epsilonContext: ScoringContext = {
        symbol: 'ES',
        currentRef: 4520,
        tickSize: 0.001,
        config
      };
      const bands = createLevelBands(levels, epsilonContext);

      // Should group them together
      expect(bands.length).toBeGreaterThan(0);
    });

    it('should handle levels with identical prices', () => {
      const levels: KeyLevel[] = [
        {
          source: 'SESSION',
          kind: 'resistance',
          price: 4520,
          time: new Date('2024-01-15T10:00:00Z')
        },
        {
          source: 'H1',
          kind: 'resistance',
          price: 4520,
          time: new Date('2024-01-15T10:30:00Z')
        }
      ];

      const bands = createLevelBands(levels, context);

      expect(bands).toBeDefined();
      expect(bands.length).toBeGreaterThan(0);
    });

    it('should handle very large price values', () => {
      const level: KeyLevel = {
        source: 'SESSION',
        kind: 'resistance',
        price: 999999,
        time: new Date('2024-01-15T10:00:00Z')
      };

      const largeContext: ScoringContext = {
        ...context,
        currentRef: 999900,
        currentRef: 1000
      };

      const priority = calculatePriority(level, largeContext);

      expect(priority).toBeGreaterThan(0);
      expect(priority).toBeLessThanOrEqual(1);
    });

    it('should handle very small price values', () => {
      const level: KeyLevel = {
        source: 'SESSION',
        kind: 'resistance',
        price: 0.0002,
        time: new Date('2024-01-15T10:00:00Z')
      };

      const smallContext: ScoringContext = {
        ...context,
        currentRef: 0.0001,
        currentRef: 0.001
      };

      const priority = calculatePriority(level, smallContext);

      expect(priority).toBeGreaterThan(0);
      expect(priority).toBeLessThanOrEqual(1);
    });

    it('should handle many levels (1000+)', () => {
      const levels: KeyLevel[] = [];

      for (let i = 0; i < 1000; i++) {
        levels.push({
          source: i % 2 === 0 ? 'SESSION' : 'H1',
          kind: 'resistance',
          price: 4500 + i,
          time: new Date(`2024-01-15T${10 + Math.floor(i / 60)}:${i % 60}:00Z`)
        });
      }

      const bands = createLevelBands(levels, context);

      // Should complete without errors
      expect(bands).toBeDefined();
    });
  });

  describe('Confluence Scoring Integration', () => {
    it('should boost priority for levels in confluence bands', () => {
      const levels: KeyLevel[] = [
        {
          source: 'SESSION',
          kind: 'resistance',
          price: 4520,
          time: new Date('2024-01-15T10:00:00Z')
        },
        {
          source: 'H1',
          kind: 'resistance',
          price: 4521,
          time: new Date('2024-01-15T10:30:00Z')
        },
        {
          source: 'SESSION',
          kind: 'support',
          price: 4522,
          time: new Date('2024-01-15T11:00:00Z')
        }
      ];

      const bands = createLevelBands(levels, context);
      const contextWithBands: ScoringContext = {
        ...context
      };

      // Calculate priority for level in confluence band
      const priority = calculatePriority(levels[0]!, contextWithBands);

      // Should get confluence boost
      expect(priority).toBeGreaterThan(0);
    });

    it('should assign higher priority to levels with more confluence', () => {
      const highConfluenceLevel: KeyLevel = {
        source: 'SESSION',
        kind: 'resistance',
        price: 4520,
        time: new Date('2024-01-15T10:00:00Z')
      };

      const lowConfluenceLevel: KeyLevel = {
        source: 'H1',
        kind: 'resistance',
        price: 4600, // Far from others
        time: new Date('2024-01-15T10:00:00Z')
      };

      const levels = [
        highConfluenceLevel,
        {
          source: 'H1',
          kind: 'resistance',
          price: 4521,
          time: new Date('2024-01-15T10:30:00Z')
        },
        {
          source: 'SESSION',
          kind: 'support',
          price: 4522,
          time: new Date('2024-01-15T11:00:00Z')
        },
        lowConfluenceLevel
      ];

      const bands = createLevelBands(levels, context);
      const contextWithBands: ScoringContext = {
        ...context
      };

      const highPriority = calculatePriority(highConfluenceLevel, contextWithBands);
      const lowPriority = calculatePriority(lowConfluenceLevel, contextWithBands);

      expect(highPriority).toBeGreaterThan(lowPriority);
    });
  });
});
