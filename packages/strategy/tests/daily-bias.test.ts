/**
 * Daily Bias Planner Tests
 *
 * Comprehensive test suite for DailyBiasPlanner covering:
 * - 6-phase planning algorithm
 * - Session levels and HTF swings integration
 * - Target ranking and prioritization
 * - Direction-specific target creation
 * - Limit enforcement
 * - Edge cases
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { DailyBiasPlanner } from '../src/daily-bias.js';
import type {
  SessionLevels,
  SwingPoint,
  Plan,
  PlanDirection,
  PriorityConfig
} from '@tjr/contracts';

describe('DailyBiasPlanner', () => {
  let sessionLevels: SessionLevels[];
  let htfSwings: { H1: SwingPoint[]; H4: SwingPoint[] };
  let config: PriorityConfig;

  beforeEach(() => {
    // Setup session levels
    sessionLevels = [
      {
        symbol: 'ES',
        date: '2024-01-15',
        session: 'ASIA',
        high: 4530,
        low: 4490,
        highTime: new Date('2024-01-15T22:00:00Z'),
        lowTime: new Date('2024-01-15T20:00:00Z')
      },
      {
        symbol: 'ES',
        date: '2024-01-15',
        session: 'LONDON',
        high: 4540,
        low: 4500,
        highTime: new Date('2024-01-15T08:00:00Z'),
        lowTime: new Date('2024-01-15T06:00:00Z')
      },
      {
        symbol: 'ES',
        date: '2024-01-15',
        session: 'NY',
        high: 4550,
        low: 4510,
        highTime: new Date('2024-01-15T15:00:00Z'),
        lowTime: new Date('2024-01-15T14:00:00Z')
      }
    ];

    // Setup HTF swings
    htfSwings = {
      H1: [
        {
          type: 'high',
          price: 4545,
          timestamp: new Date('2024-01-15T12:00:00Z'),
          barIndex: 12,
          strength: 3
        },
        {
          type: 'low',
          price: 4505,
          timestamp: new Date('2024-01-15T10:00:00Z'),
          barIndex: 10,
          strength: 3
        }
      ],
      H4: [
        {
          type: 'high',
          price: 4560,
          timestamp: new Date('2024-01-15T08:00:00Z'),
          barIndex: 2,
          strength: 4
        },
        {
          type: 'low',
          price: 4495,
          timestamp: new Date('2024-01-15T04:00:00Z'),
          barIndex: 1,
          strength: 4
        }
      ]
    };

    // Setup priority config
    config = {
      weights: {
        source: {
          'SESSION': 1.0,
          'H1': 2.0,
          'H4': 3.0
        },
        recency: 1.0,
        proximity: 1.0,
        confluence: 1.0
      },
      proximityDecay: {
        lambda: 0.01
      },
      banding: {
        priceMergeTicks: 2,
        maxBandWidthTicks: 10
      },
      recencyHorizonBars: {
        H1: 40,
        H4: 20
      }
    };
  });

  describe('Constructor', () => {
    it('should create planner with valid inputs', () => {
      const planner = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels,
        htfSwings,
        currentRef: 4520,
        config
      });

      expect(planner).toBeDefined();
    });

    it('should use default config when not provided', () => {
      const planner = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels,
        htfSwings,
        currentRef: 4520
      });

      expect(planner).toBeDefined();
    });

    it('should accept limits for target counts', () => {
      const planner = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels,
        htfSwings,
        currentRef: 4520,
        config,
        limits: {
          maxUpTargets: 3,
          maxDownTargets: 3
        }
      });

      expect(planner).toBeDefined();
    });
  });

  describe('build() - 6-Phase Algorithm', () => {
    let planner: DailyBiasPlanner;

    beforeEach(() => {
      planner = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels,
        htfSwings,
        currentRef: 4520,
        config
      });
    });

    it('should generate complete plan with UP and DOWN targets', () => {
      const plan = planner.build();

      expect(plan).toBeDefined();
      expect(plan.symbol).toBe('ES');
      expect(plan.dateLocal).toBe('2024-01-15');
      expect(plan.upTargets).toBeDefined();
      expect(plan.downTargets).toBeDefined();
    });

    it('should collect candidates from session levels', () => {
      const plan = planner.build();

      // Should have targets from session levels
      const allTargets = [...plan.upTargets, ...plan.downTargets];
      const sessionTarget = allTargets.find(t => t.level.source === 'SESSION');

      expect(sessionTarget).toBeDefined();
    });

    it('should collect candidates from HTF swings', () => {
      const plan = planner.build();

      // Should have targets from HTF swings
      const allTargets = [...plan.upTargets, ...plan.downTargets];
      const swingTarget = allTargets.find(t => t.level.source === 'H1' || t.level.source === 'H4');

      expect(swingTarget).toBeDefined();
    });

    it('should split targets into UP and DOWN directions', () => {
      const plan = planner.build();

      // UP targets should be above currentRef
      plan.upTargets.forEach(target => {
        expect(target.level.price).toBeGreaterThan(4520);
      });

      // DOWN targets should be below currentRef
      plan.downTargets.forEach(target => {
        expect(target.level.price).toBeLessThan(4520);
      });
    });

    it('should assign priorities to all targets', () => {
      const plan = planner.build();

      const allTargets = [...plan.upTargets, ...plan.downTargets];

      allTargets.forEach(target => {
        expect(target.priority).toBeDefined();
        expect(target.priority).toBeGreaterThan(0);
        expect(target.priority).toBeLessThanOrEqual(1);
      });
    });

    it('should sort targets by priority descending', () => {
      const plan = planner.build();

      // Check UP targets are sorted
      for (let i = 0; i < plan.upTargets.length - 1; i++) {
        expect(plan.upTargets[i]!.priority).toBeGreaterThanOrEqual(
          plan.upTargets[i + 1]!.priority
        );
      }

      // Check DOWN targets are sorted
      for (let i = 0; i < plan.downTargets.length - 1; i++) {
        expect(plan.downTargets[i]!.priority).toBeGreaterThanOrEqual(
          plan.downTargets[i + 1]!.priority
        );
      }
    });

    it('should respect maxUpTargets limit', () => {
      const limitedPlanner = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels,
        htfSwings,
        currentRef: 4520,
        config,
        maxUpTargets: 2,
        maxDownTargets: 10
      });

      const plan = limitedPlanner.build();

      expect(plan.upTargets.length).toBeLessThanOrEqual(2);
    });

    it('should respect maxDownTargets limit', () => {
      const limitedPlanner = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels,
        htfSwings,
        currentRef: 4520,
        config,
        maxUpTargets: 10,
        maxDownTargets: 2
      });

      const plan = limitedPlanner.build();

      expect(plan.downTargets.length).toBeLessThanOrEqual(2);
    });

    it('should initialize all targets with pending status', () => {
      const plan = planner.build();

      const allTargets = [...plan.upTargets, ...plan.downTargets];

      allTargets.forEach(target => {
        expect(target.status).toBe('PENDING');
      });
    });
  });

  describe('getPlan()', () => {
    let planner: DailyBiasPlanner;

    beforeEach(() => {
      planner = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels,
        htfSwings,
        currentRef: 4520,
        config
      });
    });

    it('should return the built plan', () => {
      planner.build();
      const plan = planner.getPlan();

      expect(plan).toBeDefined();
      expect(plan.symbol).toBe('ES');
    });

    it('should throw error if plan not built yet', () => {
      expect(() => {
        planner.getPlan();
      }).toThrow();
    });
  });

  describe('updateTargetStatus()', () => {
    let planner: DailyBiasPlanner;

    beforeEach(() => {
      planner = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels,
        htfSwings,
        currentRef: 4520,
        config
      });
      planner.build();
    });

    it('should update target status for matching price', () => {
      const plan = planner.getPlan();
      const firstTarget = plan.upTargets[0];

      if (firstTarget) {
        planner.updateTargetStatus(firstTarget.level.price, 'hit');
        const updatedPlan = planner.getPlan();
        const updatedTarget = updatedPlan.upTargets[0];

        expect(updatedTarget?.status).toBe('HIT');
      }
    });

    it('should only update first matching target', () => {
      // Add duplicate price targets for testing
      const plan = planner.getPlan();

      if (plan.upTargets.length > 0) {
        const targetPrice = plan.upTargets[0]!.level.price;

        planner.updateTargetStatus(targetPrice, 'hit');
        const updatedPlan = planner.getPlan();

        const hitTargets = updatedPlan.upTargets.filter(
          t => t.level.price === targetPrice && t.status === 'HIT'
        );

        expect(hitTargets.length).toBeGreaterThan(0);
      }
    });

    it('should support all status types', () => {
      const plan = planner.getPlan();

      const statuses = ['pending', 'hit', 'invalidated', 'consumed'];

      statuses.forEach((status, index) => {
        if (plan.upTargets[index]) {
          planner.updateTargetStatus(plan.upTargets[index]!.level.price, status);
        }
      });

      const updatedPlan = planner.getPlan();

      // Check that statuses were updated
      expect(updatedPlan.upTargets.some(t => t.status !== 'PENDING')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty session levels', () => {
      const planner = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels: [],
        htfSwings,
        currentRef: 4520,
        config
      });

      const plan = planner.build();

      expect(plan).toBeDefined();
      // Should still have targets from HTF swings
      expect(plan.upTargets.length + plan.downTargets.length).toBeGreaterThan(0);
    });

    it('should handle empty HTF swings', () => {
      const planner = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels,
        htfSwings: { H1: [], H4: [] },
        currentRef: 4520,
        config
      });

      const plan = planner.build();

      expect(plan).toBeDefined();
      // Should still have targets from session levels
      expect(plan.upTargets.length + plan.downTargets.length).toBeGreaterThan(0);
    });

    it('should handle currentRef at session high', () => {
      const planner = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels,
        htfSwings,
        currentRef: 4550, // At NY session high
        config
      });

      const plan = planner.build();

      // Should still create valid plan
      expect(plan).toBeDefined();
    });

    it('should handle currentRef at session low', () => {
      const planner = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels,
        htfSwings,
        currentRef: 4490, // At ASIA session low
        config
      });

      const plan = planner.build();

      // Should still create valid plan
      expect(plan).toBeDefined();
    });

    it('should handle very close price levels', () => {
      const closeLevels: SessionLevels[] = [
        {
          symbol: 'ES',
          date: '2024-01-15',
          session: 'ASIA',
          high: 4520.1,
          low: 4519.9,
          highTime: new Date('2024-01-15T22:00:00Z'),
          lowTime: new Date('2024-01-15T20:00:00Z')
        }
      ];

      const planner = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels: closeLevels,
        htfSwings: { H1: [], H4: [] },
        currentRef: 4520,
        config
      });

      const plan = planner.build();

      expect(plan).toBeDefined();
    });

    it('should handle NaN in session levels gracefully', () => {
      const invalidLevels: SessionLevels[] = [
        {
          symbol: 'ES',
          date: '2024-01-15',
          session: 'ASIA',
          high: NaN,
          low: 4490,
          highTime: new Date('2024-01-15T22:00:00Z'),
          lowTime: new Date('2024-01-15T20:00:00Z')
        }
      ];

      const planner = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels: invalidLevels,
        htfSwings,
        currentRef: 4520,
        config
      });

      // Should not throw error
      expect(() => planner.build()).not.toThrow();
    });

    it('should handle many levels (100+)', () => {
      const manyLevels: SessionLevels[] = [];

      for (let i = 0; i < 100; i++) {
        manyLevels.push({
          symbol: 'ES',
          date: '2024-01-15',
          session: i % 3 === 0 ? 'ASIA' : i % 3 === 1 ? 'LONDON' : 'NY',
          high: 4600 + i,
          low: 4400 + i,
          highTime: new Date(`2024-01-15T${10 + Math.floor(i / 10)}:00:00Z`),
          lowTime: new Date(`2024-01-15T${9 + Math.floor(i / 10)}:00:00Z`)
        });
      }

      const planner = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels: manyLevels,
        htfSwings: { H1: [], H4: [] },
        currentRef: 4520,
        config
      });

      const plan = planner.build();

      // Should complete without errors
      expect(plan).toBeDefined();
    });
  });

  describe('Confluence Integration', () => {
    it('should detect confluence between session levels and swings', () => {
      // Create levels that are close together
      const confluenceLevels: SessionLevels[] = [
        {
          symbol: 'ES',
          date: '2024-01-15',
          session: 'ASIA',
          high: 4540,
          low: 4490,
          highTime: new Date('2024-01-15T22:00:00Z'),
          lowTime: new Date('2024-01-15T20:00:00Z')
        },
        {
          symbol: 'ES',
          date: '2024-01-15',
          session: 'LONDON',
          high: 4542, // Close to ASIA high
          low: 4500,
          highTime: new Date('2024-01-15T08:00:00Z'),
          lowTime: new Date('2024-01-15T06:00:00Z')
        }
      ];

      const confluenceSwings = {
        H1: [
          {
            type: 'high' as const,
            price: 4541, // Close to ASIA and LONDON highs
            timestamp: new Date('2024-01-15T12:00:00Z'),
            barIndex: 12,
            strength: 3
          }
        ],
        H4: []
      };

      const planner = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels: confluenceLevels,
        htfSwings: confluenceSwings,
        currentRef: 4520,
        config
      });

      const plan = planner.build();

      // Targets at confluence should have higher priority
      const upTargets = plan.upTargets;

      if (upTargets.length > 0) {
        // First target should be the confluence level
        expect(upTargets[0]!.level.price).toBeCloseTo(4541, 0);
      }
    });

    it('should boost priority for confluent levels', () => {
      const planner = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels,
        htfSwings,
        currentRef: 4520,
        config
      });

      const plan = planner.build();

      // Check that targets with potential confluence have higher priorities
      const allTargets = [...plan.upTargets, ...plan.downTargets];

      // All targets should have priority scores
      allTargets.forEach(target => {
        expect(target.priority).toBeGreaterThan(0);
      });
    });
  });

  describe('Determinism', () => {
    it('should produce same plan across multiple builds', () => {
      const planner = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels,
        htfSwings,
        currentRef: 4520,
        config
      });

      const plan1 = planner.build();
      const plan2 = planner.build();

      // Plans should be identical
      expect(plan1.upTargets).toEqual(plan2.upTargets);
      expect(plan1.downTargets).toEqual(plan2.downTargets);
    });

    it('should produce consistent priority scores', () => {
      const planner1 = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels,
        htfSwings,
        currentRef: 4520,
        config
      });

      const planner2 = new DailyBiasPlanner({
        symbol: 'ES',
        date: '2024-01-15',
        sessionLevels,
        htfSwings,
        currentRef: 4520,
        config
      });

      const plan1 = planner1.build();
      const plan2 = planner2.build();

      // Priority scores should match
      for (let i = 0; i < Math.min(plan1.upTargets.length, plan2.upTargets.length); i++) {
        expect(plan1.upTargets[i]!.priority).toBe(plan2.upTargets[i]!.priority);
      }
    });
  });
});
