/**
 * @fileoverview Tests for TJR analysis types and utilities.
 */

import { describe, it, expect } from 'vitest';
import { hasExecution } from '../src/tjr.js';
import type { TJRResult, TJRAnalysisInput, TJRConfluence, TJRExecution } from '../src/tjr.js';
import { Timeframe } from '../src/timeframes.js';

describe('TJR Types', () => {
  const sampleInput: TJRAnalysisInput = {
    symbol: 'SPY',
    timeframe: Timeframe.M5,
    bars: [
      {
        timestamp: '2025-01-15T14:30:00.000Z',
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 1000
      }
    ],
    analysisTimestamp: '2025-01-15T15:00:00.000Z'
  };

  const sampleConfluence: TJRConfluence = {
    score: 85,
    factors: [
      { name: 'Support/Resistance', weight: 0.3, value: 0.9 },
      { name: 'Trend', weight: 0.7, value: 0.8 }
    ]
  };

  const sampleExecution: TJRExecution = {
    entryPrice: 100.5,
    stopLoss: 99,
    takeProfit: 103.5,
    positionSize: 100,
    direction: 'long',
    riskRewardRatio: 2.0,
    confidence: 'high'
  };

  describe('hasExecution', () => {
    it('should return true when result has execution', () => {
      const result: TJRResult = {
        input: sampleInput,
        confluence: sampleConfluence,
        execution: sampleExecution,
        warnings: []
      };

      expect(hasExecution(result)).toBe(true);
    });

    it('should return false when result has no execution', () => {
      const result: TJRResult = {
        input: sampleInput,
        confluence: sampleConfluence,
        warnings: ['Confluence too low']
      };

      expect(hasExecution(result)).toBe(false);
    });

    it('should narrow type when true', () => {
      const result: TJRResult = {
        input: sampleInput,
        confluence: sampleConfluence,
        execution: sampleExecution,
        warnings: []
      };

      if (hasExecution(result)) {
        // TypeScript should know execution exists
        expect(result.execution.entryPrice).toBe(100.5);
        expect(result.execution.direction).toBe('long');
      }
    });
  });

  describe('TJRAnalysisInput', () => {
    it('should be serializable', () => {
      const json = JSON.stringify(sampleInput);
      const parsed = JSON.parse(json);

      expect(parsed.symbol).toBe('SPY');
      expect(parsed.timeframe).toBe('5');
      expect(parsed.bars).toHaveLength(1);
    });
  });

  describe('TJRConfluence', () => {
    it('should have score and factors', () => {
      expect(sampleConfluence.score).toBe(85);
      expect(sampleConfluence.factors).toHaveLength(2);
    });

    it('should be serializable', () => {
      const json = JSON.stringify(sampleConfluence);
      const parsed = JSON.parse(json);

      expect(parsed.score).toBe(85);
      expect(parsed.factors[0].name).toBe('Support/Resistance');
    });
  });

  describe('TJRExecution', () => {
    it('should have all required fields', () => {
      expect(sampleExecution.entryPrice).toBe(100.5);
      expect(sampleExecution.stopLoss).toBe(99);
      expect(sampleExecution.takeProfit).toBe(103.5);
      expect(sampleExecution.positionSize).toBe(100);
      expect(sampleExecution.direction).toBe('long');
      expect(sampleExecution.riskRewardRatio).toBe(2.0);
      expect(sampleExecution.confidence).toBe('high');
    });

    it('should be serializable', () => {
      const json = JSON.stringify(sampleExecution);
      const parsed = JSON.parse(json);

      expect(parsed.direction).toBe('long');
      expect(parsed.confidence).toBe('high');
    });
  });

  describe('TJRResult', () => {
    it('should be fully serializable', () => {
      const result: TJRResult = {
        input: sampleInput,
        confluence: sampleConfluence,
        execution: sampleExecution,
        warnings: ['Test warning'],
        metadata: {
          analysisVersion: '1.0.0',
          computeTimeMs: 45
        }
      };

      const json = JSON.stringify(result);
      const parsed = JSON.parse(json);

      expect(parsed.input.symbol).toBe('SPY');
      expect(parsed.confluence.score).toBe(85);
      expect(parsed.execution.entryPrice).toBe(100.5);
      expect(parsed.warnings).toHaveLength(1);
      expect(parsed.metadata.analysisVersion).toBe('1.0.0');
    });

    it('should work without execution', () => {
      const result: TJRResult = {
        input: sampleInput,
        confluence: { score: 30, factors: [] },
        warnings: ['Score too low']
      };

      const json = JSON.stringify(result);
      const parsed = JSON.parse(json);

      expect(parsed.execution).toBeUndefined();
      expect(parsed.warnings[0]).toBe('Score too low');
    });
  });
});