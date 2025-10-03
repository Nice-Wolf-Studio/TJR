/**
 * @fileoverview Tests for TJR analysis function.
 *
 * Verifies deterministic behavior, API surface stability, and error handling.
 *
 * @module @tjr/tjr-tools/tests
 */

import { describe, it, expect } from 'vitest';
import { analyze } from '../src/analyze.js';
import type { TJRAnalysisInput, MarketBar } from '@tjr/contracts';
import { Timeframe } from '@tjr/contracts';
import type { TJRConfig } from '../src/config.js';

/**
 * Creates test market bars.
 */
function createTestBars(count: number): MarketBar[] {
  const bars: MarketBar[] = [];
  const baseTime = new Date('2025-01-15T14:30:00Z');

  for (let i = 0; i < count; i++) {
    const timestamp = new Date(baseTime.getTime() + i * 5 * 60 * 1000); // 5-minute bars
    bars.push({
      timestamp: timestamp.toISOString(),
      open: 100 + Math.sin(i * 0.1) * 2,
      high: 102 + Math.sin(i * 0.1) * 2,
      low: 99 + Math.sin(i * 0.1) * 2,
      close: 101 + Math.sin(i * 0.1) * 2,
      volume: 1000 + i * 10,
    });
  }

  return bars;
}

describe('TJR Analysis', () => {
  describe('analyze()', () => {
    it('should return a valid TJRResult structure', () => {
      const input: TJRAnalysisInput = {
        symbol: 'SPY',
        timeframe: Timeframe.M5,
        bars: createTestBars(60),
        analysisTimestamp: '2025-01-15T15:00:00.000Z',
      };

      const result = analyze(input);

      // Check structure
      expect(result).toBeDefined();
      expect(result.input).toBeDefined();
      expect(result.confluence).toBeDefined();
      expect(result.warnings).toBeDefined();
      expect(result.metadata).toBeDefined();

      // Input should be preserved
      expect(result.input).toEqual(input);

      // Confluence should have score and factors
      expect(typeof result.confluence.score).toBe('number');
      expect(Array.isArray(result.confluence.factors)).toBe(true);
      expect(result.confluence.score).toBeGreaterThanOrEqual(0);
      expect(result.confluence.score).toBeLessThanOrEqual(100);

      // Warnings should be an array
      expect(Array.isArray(result.warnings)).toBe(true);

      // Metadata should include version and compute time
      expect(result.metadata?.analysisVersion).toBe('0.1.0');
      expect(typeof result.metadata?.computeTimeMs).toBe('number');
      expect(result.metadata.computeTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return deterministic results for same input', () => {
      const input: TJRAnalysisInput = {
        symbol: 'AAPL',
        timeframe: Timeframe.M15,
        bars: createTestBars(100),
        analysisTimestamp: '2025-01-15T16:00:00.000Z',
      };

      const result1 = analyze(input);
      const result2 = analyze(input);

      // Results should be identical (except compute time)
      expect(result1.confluence).toEqual(result2.confluence);
      expect(result1.warnings).toEqual(result2.warnings);
      expect(result1.execution).toEqual(result2.execution);
    });

    it('should not include execution when confluence is zero', () => {
      const input: TJRAnalysisInput = {
        symbol: 'TSLA',
        timeframe: Timeframe.H1,
        bars: createTestBars(50),
        analysisTimestamp: '2025-01-15T17:00:00.000Z',
      };

      const result = analyze(input);

      // No execution should be present in skeleton implementation
      expect(result.execution).toBeUndefined();
      expect(result.confluence.score).toBe(0);
    });

    it('should warn about insufficient bars', () => {
      const input: TJRAnalysisInput = {
        symbol: 'GOOGL',
        timeframe: Timeframe.M30,
        bars: createTestBars(10), // Less than default minimum
        analysisTimestamp: '2025-01-15T18:00:00.000Z',
      };

      const result = analyze(input);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Insufficient bars');
    });

    it('should respect configuration options', () => {
      const input: TJRAnalysisInput = {
        symbol: 'MSFT',
        timeframe: Timeframe.M5,
        bars: createTestBars(60),
        analysisTimestamp: '2025-01-15T19:00:00.000Z',
      };

      const config: TJRConfig = {
        enableFVG: false,
        enableOrderBlock: false,
        enableTrend: true,
        enableSupportResistance: true,
        enableVolumeProfile: true,
      };

      const result = analyze(input, config);

      // Should have 3 factors (trend, S/R, volume)
      expect(result.confluence.factors.length).toBe(3);

      // Should not have FVG or Order Block factors
      const factorNames = result.confluence.factors.map((f) => f.name);
      expect(factorNames).not.toContain('Fair Value Gap');
      expect(factorNames).not.toContain('Order Block');
      expect(factorNames).toContain('Trend Alignment');
      expect(factorNames).toContain('Support/Resistance');
      expect(factorNames).toContain('Volume Profile');
    });

    it('should normalize factor weights to sum to 1.0', () => {
      const input: TJRAnalysisInput = {
        symbol: 'NVDA',
        timeframe: Timeframe.M5,
        bars: createTestBars(60),
        analysisTimestamp: '2025-01-15T20:00:00.000Z',
      };

      const result = analyze(input);

      const totalWeight = result.confluence.factors.reduce((sum, f) => sum + f.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 5);
    });

    it('should include all enabled confluences as factors', () => {
      const input: TJRAnalysisInput = {
        symbol: 'AMZN',
        timeframe: Timeframe.M5,
        bars: createTestBars(60),
        analysisTimestamp: '2025-01-15T21:00:00.000Z',
      };

      const config: TJRConfig = {
        enableFVG: true,
        enableOrderBlock: true,
        enableTrend: true,
        enableSupportResistance: true,
        enableVolumeProfile: true,
      };

      const result = analyze(input, config);

      expect(result.confluence.factors.length).toBe(5);

      const expectedFactors = [
        'Fair Value Gap',
        'Order Block',
        'Trend Alignment',
        'Support/Resistance',
        'Volume Profile',
      ];

      const actualFactors = result.confluence.factors.map((f) => f.name);
      expectedFactors.forEach((expected) => {
        expect(actualFactors).toContain(expected);
      });
    });

    it('should handle empty configuration gracefully', () => {
      const input: TJRAnalysisInput = {
        symbol: 'META',
        timeframe: Timeframe.M5,
        bars: createTestBars(60),
        analysisTimestamp: '2025-01-15T22:00:00.000Z',
      };

      const result = analyze(input, {});

      // Should use defaults
      expect(result).toBeDefined();
      expect(result.confluence.factors.length).toBeGreaterThan(0);
    });

    it('should validate minimum bars requirement from config', () => {
      const input: TJRAnalysisInput = {
        symbol: 'NFLX',
        timeframe: Timeframe.M5,
        bars: createTestBars(25),
        analysisTimestamp: '2025-01-15T23:00:00.000Z',
      };

      const config: TJRConfig = {
        minBarsRequired: 30,
      };

      const result = analyze(input, config);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('25 provided, 30 required');
    });
  });
});
