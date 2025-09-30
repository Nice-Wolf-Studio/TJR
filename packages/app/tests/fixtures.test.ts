/**
 * Tests for Fixture Generation
 */

import { describe, it, expect } from 'vitest';
import {
  generateFixtureBars,
  generateSessionBars,
  generateTrendDay,
  loadFixtures
} from '../src/fixtures/index.js';

describe('Fixture Generation', () => {
  describe('generateFixtureBars', () => {
    it('should generate requested number of bars', () => {
      const bars = generateFixtureBars({
        symbol: 'SPY',
        date: new Date('2025-09-29'),
        timeframe: '5m',
        count: 78
      });

      expect(bars).toHaveLength(78);
    });

    it('should generate valid OHLC data', () => {
      const bars = generateFixtureBars({
        symbol: 'SPY',
        date: new Date('2025-09-29'),
        timeframe: '5m',
        count: 10
      });

      for (const bar of bars) {
        expect(bar.high).toBeGreaterThanOrEqual(bar.open);
        expect(bar.high).toBeGreaterThanOrEqual(bar.close);
        expect(bar.low).toBeLessThanOrEqual(bar.open);
        expect(bar.low).toBeLessThanOrEqual(bar.close);
      }
    });

    it('should include all required bar fields', () => {
      const bars = generateFixtureBars({
        symbol: 'SPY',
        date: new Date('2025-09-29'),
        timeframe: '5m',
        count: 1
      });

      const bar = bars[0];
      expect(bar).toHaveProperty('symbol');
      expect(bar).toHaveProperty('time');
      expect(bar).toHaveProperty('open');
      expect(bar).toHaveProperty('high');
      expect(bar).toHaveProperty('low');
      expect(bar).toHaveProperty('close');
      expect(bar).toHaveProperty('volume');
      expect(bar).toHaveProperty('trades');
      expect(bar).toHaveProperty('vwap');
    });

    it('should use correct symbol', () => {
      const bars = generateFixtureBars({
        symbol: 'QQQ',
        date: new Date('2025-09-29'),
        timeframe: '5m',
        count: 5
      });

      expect(bars.every(bar => bar.symbol === 'QQQ')).toBe(true);
    });

    it('should generate prices in reasonable range', () => {
      const bars = generateFixtureBars({
        symbol: 'SPY',
        date: new Date('2025-09-29'),
        timeframe: '5m',
        count: 10
      });

      for (const bar of bars) {
        expect(bar.close).toBeGreaterThan(0);
        expect(bar.close).toBeLessThan(1000); // Reasonable upper bound
      }
    });

    it('should generate positive volume', () => {
      const bars = generateFixtureBars({
        symbol: 'SPY',
        date: new Date('2025-09-29'),
        timeframe: '5m',
        count: 10
      });

      for (const bar of bars) {
        expect(bar.volume).toBeGreaterThan(0);
        expect(bar.trades).toBeGreaterThan(0);
      }
    });
  });

  describe('generateSessionBars', () => {
    it('should generate bars for full trading day', () => {
      const bars = generateSessionBars({
        symbol: 'SPY',
        date: new Date('2025-09-29')
      });

      expect(bars.length).toBeGreaterThan(60); // At least an hour of 5m bars
    });

    it('should include different session characteristics', () => {
      const bars = generateSessionBars({
        symbol: 'SPY',
        date: new Date('2025-09-29')
      });

      // Should have bars across different hours
      const hours = new Set(bars.map(bar => new Date(bar.time).getHours()));
      expect(hours.size).toBeGreaterThan(3); // Multiple trading sessions
    });

    it('should maintain price continuity', () => {
      const bars = generateSessionBars({
        symbol: 'SPY',
        date: new Date('2025-09-29')
      });

      for (let i = 1; i < bars.length; i++) {
        const prevClose = bars[i - 1].close;
        const currentOpen = bars[i].open;

        // Current open should be close to previous close
        const gap = Math.abs(currentOpen - prevClose);
        const avgPrice = (prevClose + currentOpen) / 2;
        const gapPercent = (gap / avgPrice) * 100;

        expect(gapPercent).toBeLessThan(5); // Less than 5% gap
      }
    });

    it('should use correct symbol', () => {
      const bars = generateSessionBars({
        symbol: 'QQQ',
        date: new Date('2025-09-29')
      });

      expect(bars.every(bar => bar.symbol === 'QQQ')).toBe(true);
    });
  });

  describe('generateTrendDay', () => {
    it('should generate upward trend', () => {
      const bars = generateTrendDay({
        symbol: 'SPY',
        date: new Date('2025-09-29'),
        direction: 'up'
      });

      const firstClose = bars[0].close;
      const lastClose = bars[bars.length - 1].close;

      expect(lastClose).toBeGreaterThan(firstClose);
    });

    it('should generate downward trend', () => {
      const bars = generateTrendDay({
        symbol: 'SPY',
        date: new Date('2025-09-29'),
        direction: 'down'
      });

      const firstClose = bars[0].close;
      const lastClose = bars[bars.length - 1].close;

      expect(lastClose).toBeLessThan(firstClose);
    });

    it('should generate full trading day', () => {
      const bars = generateTrendDay({
        symbol: 'SPY',
        date: new Date('2025-09-29'),
        direction: 'up'
      });

      expect(bars).toHaveLength(78); // 6.5 hours * 12 bars/hour
    });

    it('should show increasing volume on trend days', () => {
      const bars = generateTrendDay({
        symbol: 'SPY',
        date: new Date('2025-09-29'),
        direction: 'up'
      });

      const firstVolume = bars[0].volume;
      const lastVolume = bars[bars.length - 1].volume;

      expect(lastVolume).toBeGreaterThan(firstVolume);
    });

    it('should respect symbol parameter', () => {
      const bars = generateTrendDay({
        symbol: 'QQQ',
        date: new Date('2025-09-29'),
        direction: 'up'
      });

      expect(bars.every(bar => bar.symbol === 'QQQ')).toBe(true);
    });
  });

  describe('loadFixtures', () => {
    it('should load fixtures for a symbol and date', () => {
      const bars = loadFixtures('SPY', new Date('2025-09-29'));

      expect(bars).toBeDefined();
      expect(bars.length).toBeGreaterThan(0);
    });

    it('should return deterministic data for same inputs', () => {
      const date = new Date('2025-09-29');
      const bars1 = loadFixtures('SPY', date);
      const bars2 = loadFixtures('SPY', date);

      expect(bars1.length).toBe(bars2.length);
      expect(bars1[0].close).toBe(bars2[0].close);
    });

    it('should support multiple symbols', () => {
      const date = new Date('2025-09-29');
      const spyBars = loadFixtures('SPY', date);
      const qqqBars = loadFixtures('QQQ', date);
      const iwmBars = loadFixtures('IWM', date);

      expect(spyBars).toBeDefined();
      expect(qqqBars).toBeDefined();
      expect(iwmBars).toBeDefined();
    });

    it('should use different patterns for different dates', () => {
      const spy29 = loadFixtures('SPY', new Date('2025-09-29'));
      const spy28 = loadFixtures('SPY', new Date('2025-09-28'));

      // Different dates should potentially have different trends
      const trend29 = spy29[spy29.length - 1].close > spy29[0].close;
      const trend28 = spy28[spy28.length - 1].close > spy28[0].close;

      // At least one should be different (based on our fixture logic)
      expect(trend29).not.toBe(trend28);
    });

    it('should return valid market data', () => {
      const bars = loadFixtures('SPY', new Date('2025-09-29'));

      for (const bar of bars) {
        expect(bar.symbol).toBe('SPY');
        expect(bar.time).toBeDefined();
        expect(bar.open).toBeGreaterThan(0);
        expect(bar.high).toBeGreaterThanOrEqual(bar.low);
        expect(bar.volume).toBeGreaterThan(0);
      }
    });
  });

  describe('Time Sequencing', () => {
    it('should generate bars in chronological order', () => {
      const bars = generateFixtureBars({
        symbol: 'SPY',
        date: new Date('2025-09-29'),
        timeframe: '5m',
        count: 20
      });

      for (let i = 1; i < bars.length; i++) {
        const prevTime = new Date(bars[i - 1].time);
        const currentTime = new Date(bars[i].time);
        expect(currentTime.getTime()).toBeGreaterThan(prevTime.getTime());
      }
    });

    it('should space bars correctly', () => {
      const bars = generateFixtureBars({
        symbol: 'SPY',
        date: new Date('2025-09-29'),
        timeframe: '5m',
        count: 10
      });

      for (let i = 1; i < bars.length; i++) {
        const prevTime = new Date(bars[i - 1].time);
        const currentTime = new Date(bars[i].time);
        const diffMinutes = (currentTime.getTime() - prevTime.getTime()) / 60000;

        expect(diffMinutes).toBe(5); // 5-minute bars
      }
    });

    it('should start at market open', () => {
      const bars = generateFixtureBars({
        symbol: 'SPY',
        date: new Date('2025-09-29'),
        timeframe: '5m',
        count: 1
      });

      const firstBarTime = new Date(bars[0].time);
      expect(firstBarTime.getHours()).toBe(9);
      expect(firstBarTime.getMinutes()).toBe(30);
    });
  });

  describe('Price Realism', () => {
    it('should generate realistic price movements', () => {
      const bars = generateFixtureBars({
        symbol: 'SPY',
        date: new Date('2025-09-29'),
        timeframe: '5m',
        count: 50
      });

      // Calculate max single-bar move
      let maxMove = 0;
      for (const bar of bars) {
        const range = bar.high - bar.low;
        const percentMove = (range / bar.close) * 100;
        maxMove = Math.max(maxMove, percentMove);
      }

      // Single bar shouldn't move more than 2%
      expect(maxMove).toBeLessThan(2);
    });

    it('should maintain VWAP within range', () => {
      const bars = generateFixtureBars({
        symbol: 'SPY',
        date: new Date('2025-09-29'),
        timeframe: '5m',
        count: 10
      });

      for (const bar of bars) {
        if (bar.vwap) {
          expect(bar.vwap).toBeGreaterThanOrEqual(bar.low);
          expect(bar.vwap).toBeLessThanOrEqual(bar.high);
        }
      }
    });
  });
});