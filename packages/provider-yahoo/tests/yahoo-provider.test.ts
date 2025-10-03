/**
 * @fileoverview Tests for Yahoo Finance provider.
 *
 * Tests provider capabilities, bar fetching, parsing, and aggregation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { YahooProvider } from '../src/yahoo-provider.js';
import { parseYahooBar } from '../src/parser.js';
import { Timeframe } from '@tjr/contracts';
import type { YahooRawBar } from '../src/types.js';

describe('YahooProvider', () => {
  let provider: YahooProvider;

  beforeEach(() => {
    provider = new YahooProvider();
  });

  describe('capabilities', () => {
    it('should return correct provider capabilities', () => {
      const caps = provider.capabilities();

      expect(caps.supportsTimeframes).toContain(Timeframe.M1);
      expect(caps.supportsTimeframes).toContain(Timeframe.M5);
      expect(caps.supportsTimeframes).toContain(Timeframe.M10);
      expect(caps.supportsTimeframes).toContain(Timeframe.H1);
      expect(caps.supportsTimeframes).toContain(Timeframe.H4);
      expect(caps.supportsTimeframes).toContain(Timeframe.D1);
      expect(caps.maxBarsPerRequest).toBe(10000);
      expect(caps.requiresAuthentication).toBe(false);
      expect(caps.rateLimits.requestsPerMinute).toBe(60);
    });
  });

  describe('getBars', () => {
    it('should fetch 1m bars from fixture', async () => {
      const bars = await provider.getBars({
        symbol: 'ES',
        timeframe: Timeframe.M1,
        from: '2024-01-15T14:30:00.000Z',
        to: '2024-01-15T14:35:00.000Z',
      });

      expect(bars.length).toBeGreaterThan(0);
      expect(bars[0]).toHaveProperty('timestamp');
      expect(bars[0]).toHaveProperty('open');
      expect(bars[0]).toHaveProperty('high');
      expect(bars[0]).toHaveProperty('low');
      expect(bars[0]).toHaveProperty('close');
      expect(bars[0]).toHaveProperty('volume');

      // Verify first bar
      expect(bars[0].timestamp).toBe('2024-01-15T14:30:00.000Z');
      expect(bars[0].open).toBe(4750.0);
      expect(bars[0].close).toBe(4751.75);
    });

    it('should fetch 5m bars from fixture', async () => {
      const bars = await provider.getBars({
        symbol: 'ES',
        timeframe: Timeframe.M5,
        from: '2024-01-15T14:30:00.000Z',
        to: '2024-01-15T14:50:00.000Z',
      });

      expect(bars.length).toBeGreaterThan(0);
      expect(bars[0].timestamp).toBe('2024-01-15T14:30:00.000Z');
      expect(bars[0].open).toBe(4750.0);
    });

    it('should fetch 1h bars from fixture', async () => {
      const bars = await provider.getBars({
        symbol: 'ES',
        timeframe: Timeframe.H1,
        from: '2024-01-15T09:00:00.000Z',
        to: '2024-01-15T15:00:00.000Z',
      });

      expect(bars.length).toBeGreaterThan(0);
      expect(bars[0].timestamp).toBe('2024-01-15T09:00:00.000Z');
    });

    it('should fetch 1D bars from fixture', async () => {
      const bars = await provider.getBars({
        symbol: 'ES',
        timeframe: Timeframe.D1,
        from: '2024-01-08T00:00:00.000Z',
        to: '2024-01-15T23:59:59.999Z',
      });

      expect(bars.length).toBeGreaterThan(0);
      expect(bars[0].timestamp).toBe('2024-01-08T00:00:00.000Z');
    });

    it('should aggregate 1m to 10m bars', async () => {
      const bars = await provider.getBars({
        symbol: 'ES',
        timeframe: Timeframe.M10,
        from: '2024-01-15T14:30:00.000Z',
        to: '2024-01-15T14:50:00.000Z',
      });

      expect(bars.length).toBeGreaterThan(0);

      // Verify aggregation: 10m bars should have aggregated OHLCV
      const firstBar = bars[0];
      expect(firstBar.timestamp).toBe('2024-01-15T14:30:00.000Z');
      expect(firstBar.open).toBe(4750.0); // First bar's open
      expect(firstBar.high).toBeGreaterThanOrEqual(firstBar.low);
      expect(firstBar.volume).toBeGreaterThan(0);
    });

    it('should aggregate 1h to 4h bars', async () => {
      const bars = await provider.getBars({
        symbol: 'ES',
        timeframe: Timeframe.H4,
        from: '2024-01-15T09:00:00.000Z',
        to: '2024-01-15T16:00:00.000Z',
      });

      expect(bars.length).toBeGreaterThan(0);

      // 4h aggregation from 1h should create larger bars
      const firstBar = bars[0];
      expect(firstBar.open).toBe(4700.0); // First hour's open
      expect(firstBar.volume).toBeGreaterThan(100000);
    });

    it('should apply limit parameter', async () => {
      const bars = await provider.getBars({
        symbol: 'ES',
        timeframe: Timeframe.M1,
        from: '2024-01-15T14:30:00.000Z',
        to: '2024-01-15T14:50:00.000Z',
        limit: 5,
      });

      expect(bars.length).toBeLessThanOrEqual(5);
    });

    it('should filter bars by date range', async () => {
      const bars = await provider.getBars({
        symbol: 'ES',
        timeframe: Timeframe.M1,
        from: '2024-01-15T14:30:00.000Z',
        to: '2024-01-15T14:35:00.000Z',
      });

      // All bars should be within range
      bars.forEach((bar) => {
        const barDate = new Date(bar.timestamp);
        expect(barDate.getTime()).toBeGreaterThanOrEqual(
          new Date('2024-01-15T14:30:00.000Z').getTime()
        );
        expect(barDate.getTime()).toBeLessThanOrEqual(
          new Date('2024-01-15T14:35:00.000Z').getTime()
        );
      });
    });

    it('should throw error for invalid symbol', async () => {
      await expect(
        provider.getBars({
          symbol: '',
          timeframe: Timeframe.M1,
          from: '2024-01-15T14:30:00.000Z',
        })
      ).rejects.toThrow('Invalid symbol');
    });

    it('should throw error for invalid timeframe', async () => {
      await expect(
        provider.getBars({
          symbol: 'ES',
          timeframe: '99' as any, // Invalid timeframe
          from: '2024-01-15T14:30:00.000Z',
        })
      ).rejects.toThrow('Invalid timeframe');
    });

    it('should throw error for invalid date range', async () => {
      await expect(
        provider.getBars({
          symbol: 'ES',
          timeframe: Timeframe.M1,
          from: '2024-01-15T15:00:00.000Z',
          to: '2024-01-15T14:00:00.000Z', // to < from
        })
      ).rejects.toThrow('Invalid date range');
    });
  });

  describe('parseYahooBar', () => {
    it('should parse valid Yahoo bar', () => {
      const raw: YahooRawBar = {
        symbol: 'ES',
        date: '2024-01-15T14:30:00.000Z',
        open: 4750.0,
        high: 4752.25,
        low: 4749.5,
        close: 4751.75,
        volume: 1250,
      };

      const bar = parseYahooBar(raw);

      expect(bar.timestamp).toBe('2024-01-15T14:30:00.000Z');
      expect(bar.open).toBe(4750.0);
      expect(bar.high).toBe(4752.25);
      expect(bar.low).toBe(4749.5);
      expect(bar.close).toBe(4751.75);
      expect(bar.volume).toBe(1250);
    });

    it('should throw error for missing date', () => {
      const raw: any = {
        symbol: 'ES',
        open: 4750.0,
        high: 4752.25,
        low: 4749.5,
        close: 4751.75,
        volume: 1250,
      };

      expect(() => parseYahooBar(raw)).toThrow('missing required field: date');
    });

    it('should throw error for invalid OHLC (high < low)', () => {
      const raw: YahooRawBar = {
        symbol: 'ES',
        date: '2024-01-15T14:30:00.000Z',
        open: 4750.0,
        high: 4749.0, // high < low
        low: 4752.0,
        close: 4751.0,
        volume: 1250,
      };

      expect(() => parseYahooBar(raw)).toThrow('high');
    });

    it('should throw error for negative volume', () => {
      const raw: YahooRawBar = {
        symbol: 'ES',
        date: '2024-01-15T14:30:00.000Z',
        open: 4750.0,
        high: 4752.25,
        low: 4749.5,
        close: 4751.75,
        volume: -100,
      };

      expect(() => parseYahooBar(raw)).toThrow('invalid volume');
    });

    it('should throw error for invalid timestamp', () => {
      const raw: YahooRawBar = {
        symbol: 'ES',
        date: 'invalid-date',
        open: 4750.0,
        high: 4752.25,
        low: 4749.5,
        close: 4751.75,
        volume: 1250,
      };

      expect(() => parseYahooBar(raw)).toThrow('Invalid timestamp');
    });
  });
});
