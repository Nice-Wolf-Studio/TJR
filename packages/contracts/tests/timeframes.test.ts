/**
 * @fileoverview Tests for timeframe utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  Timeframe,
  isValidTimeframe,
  timeframeToMinutes,
  getTimeframeLabel,
  compareTimeframes,
  parseTimeframe,
  getAllTimeframes,
} from '../src/timeframes.js';

describe('Timeframe', () => {
  it('should have all expected enum values', () => {
    expect(Timeframe.M1).toBe('1');
    expect(Timeframe.M5).toBe('5');
    expect(Timeframe.M10).toBe('10');
    expect(Timeframe.H1).toBe('60');
    expect(Timeframe.H4).toBe('240');
    expect(Timeframe.D1).toBe('1D');
  });

  describe('isValidTimeframe', () => {
    it('should return true for valid timeframes', () => {
      expect(isValidTimeframe('1')).toBe(true);
      expect(isValidTimeframe('5')).toBe(true);
      expect(isValidTimeframe('1D')).toBe(true);
    });

    it('should return false for invalid timeframes', () => {
      expect(isValidTimeframe('15')).toBe(false);
      expect(isValidTimeframe('foo')).toBe(false);
      expect(isValidTimeframe('')).toBe(false);
    });
  });

  describe('timeframeToMinutes', () => {
    it('should convert intraday timeframes to minutes', () => {
      expect(timeframeToMinutes(Timeframe.M1)).toBe(1);
      expect(timeframeToMinutes(Timeframe.M5)).toBe(5);
      expect(timeframeToMinutes(Timeframe.M10)).toBe(10);
      expect(timeframeToMinutes(Timeframe.H1)).toBe(60);
      expect(timeframeToMinutes(Timeframe.H4)).toBe(240);
    });

    it('should return string for daily timeframe', () => {
      expect(timeframeToMinutes(Timeframe.D1)).toBe('1D');
    });
  });

  describe('getTimeframeLabel', () => {
    it('should return human-readable labels', () => {
      expect(getTimeframeLabel(Timeframe.M1)).toBe('1 Minute');
      expect(getTimeframeLabel(Timeframe.M5)).toBe('5 Minutes');
      expect(getTimeframeLabel(Timeframe.H1)).toBe('1 Hour');
      expect(getTimeframeLabel(Timeframe.D1)).toBe('Daily');
    });
  });

  describe('compareTimeframes', () => {
    it('should return negative when first is smaller', () => {
      expect(compareTimeframes(Timeframe.M1, Timeframe.M5)).toBeLessThan(0);
      expect(compareTimeframes(Timeframe.M5, Timeframe.H1)).toBeLessThan(0);
    });

    it('should return positive when first is larger', () => {
      expect(compareTimeframes(Timeframe.H1, Timeframe.M10)).toBeGreaterThan(0);
      expect(compareTimeframes(Timeframe.D1, Timeframe.H4)).toBeGreaterThan(0);
    });

    it('should return zero when equal', () => {
      expect(compareTimeframes(Timeframe.M5, Timeframe.M5)).toBe(0);
      expect(compareTimeframes(Timeframe.D1, Timeframe.D1)).toBe(0);
    });
  });

  describe('parseTimeframe', () => {
    it('should parse valid timeframe strings', () => {
      expect(parseTimeframe('1')).toBe(Timeframe.M1);
      expect(parseTimeframe('5')).toBe(Timeframe.M5);
      expect(parseTimeframe('1D')).toBe(Timeframe.D1);
    });

    it('should throw for invalid timeframe strings', () => {
      expect(() => parseTimeframe('15')).toThrow('Invalid timeframe');
      expect(() => parseTimeframe('foo')).toThrow('Invalid timeframe');
    });
  });

  describe('getAllTimeframes', () => {
    it('should return all timeframes in ascending order', () => {
      const all = getAllTimeframes();
      expect(all).toEqual([
        Timeframe.M1,
        Timeframe.M5,
        Timeframe.M10,
        Timeframe.H1,
        Timeframe.H4,
        Timeframe.D1,
      ]);
    });

    it('should return a new array each time', () => {
      const all1 = getAllTimeframes();
      const all2 = getAllTimeframes();
      expect(all1).toEqual(all2);
      expect(all1).not.toBe(all2); // Different array instances
    });
  });
});
