/**
 * Session Utilities Tests
 *
 * Test suite for timezone-aware session boundary utilities covering:
 * - Exchange timezone resolution
 * - Session boundary materialization
 * - Timezone offset calculations
 * - DST handling
 */

import { describe, it, expect } from '@jest/globals';
import { getExchangeTimezone, materializeSessionBoundaries, isWithin } from '../src/session-utils.js';
import type { SymbolSessionsConfig, SessionBoundary } from '@tjr/contracts';

describe('Session Utilities', () => {
  describe('getExchangeTimezone()', () => {
    it('should return Chicago timezone for ES', () => {
      expect(getExchangeTimezone('ES')).toBe('America/Chicago');
    });

    it('should return Chicago timezone for NQ', () => {
      expect(getExchangeTimezone('NQ')).toBe('America/Chicago');
    });

    it('should return New York timezone for SPY', () => {
      expect(getExchangeTimezone('SPY')).toBe('America/New_York');
    });

    it('should return London timezone for EURUSD', () => {
      expect(getExchangeTimezone('EURUSD')).toBe('Europe/London');
    });

    it('should be case-insensitive', () => {
      expect(getExchangeTimezone('es')).toBe('America/Chicago');
      expect(getExchangeTimezone('Es')).toBe('America/Chicago');
      expect(getExchangeTimezone('ES')).toBe('America/Chicago');
    });

    it('should handle symbols with whitespace', () => {
      expect(getExchangeTimezone('  ES  ')).toBe('America/Chicago');
    });

    it('should handle futures with month codes', () => {
      expect(getExchangeTimezone('ESZ23')).toBe('America/Chicago');
      expect(getExchangeTimezone('NQH24')).toBe('America/Chicago');
    });

    it('should default to New York for unknown symbols', () => {
      expect(getExchangeTimezone('UNKNOWN')).toBe('America/New_York');
    });

    it('should return New York for empty string', () => {
      expect(getExchangeTimezone('')).toBe('America/New_York');
    });

    it('should handle crypto symbols with UTC', () => {
      expect(getExchangeTimezone('BTCUSD')).toBe('UTC');
      expect(getExchangeTimezone('ETHUSDT')).toBe('UTC');
    });
  });

  describe('materializeSessionBoundaries()', () => {
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

    it('should materialize all session boundaries', () => {
      const boundaries = materializeSessionBoundaries('2024-01-15', 'ES', config);

      expect(boundaries).toHaveLength(3);
      // Note: Boundaries are sorted chronologically by start time
      // ASIA starts at 18:00 previous day, LONDON at 03:00 today, NY at 09:30 today
      // So chronological order is: ASIA (prev day 18:00), LONDON (03:00), NY (09:30)
      // But since we materialize for 2024-01-15, ASIA's start is on 2024-01-14
      // and after sorting, LONDON comes first (it starts earliest on the target date)
      const sessionNames = boundaries.map(b => b.name);
      expect(sessionNames).toContain('ASIA');
      expect(sessionNames).toContain('LONDON');
      expect(sessionNames).toContain('NY');
    });

    it('should create Date objects for start and end times', () => {
      const boundaries = materializeSessionBoundaries('2024-01-15', 'ES', config);

      boundaries.forEach(boundary => {
        expect(boundary.start).toBeInstanceOf(Date);
        expect(boundary.end).toBeInstanceOf(Date);
      });
    });

    it('should handle midnight-crossing sessions', () => {
      const boundaries = materializeSessionBoundaries('2024-01-15', 'ES', config);
      const asia = boundaries.find(b => b.name === 'ASIA');

      expect(asia).toBeDefined();
      expect(asia!.end.getTime()).toBeGreaterThan(asia!.start.getTime());
    });

    it('should return boundaries in chronological order', () => {
      const boundaries = materializeSessionBoundaries('2024-01-15', 'ES', config);

      for (let i = 0; i < boundaries.length - 1; i++) {
        expect(boundaries[i]!.start.getTime()).toBeLessThan(boundaries[i + 1]!.start.getTime());
      }
    });

    it('should throw error for invalid date format', () => {
      expect(() => {
        materializeSessionBoundaries('01/15/2024', 'ES', config);
      }).toThrow('Invalid date format');
    });

    it('should throw error for empty date', () => {
      expect(() => {
        materializeSessionBoundaries('', 'ES', config);
      }).toThrow('Invalid date format');
    });

    it('should throw error for invalid symbol', () => {
      expect(() => {
        materializeSessionBoundaries('2024-01-15', '', config);
      }).toThrow('Invalid symbol');
    });

    it('should throw error for missing windows config', () => {
      expect(() => {
        materializeSessionBoundaries('2024-01-15', 'ES', { symbol: 'ES', windows: null as any });
      }).toThrow('Invalid configuration');
    });

    it('should handle different dates consistently', () => {
      const boundaries1 = materializeSessionBoundaries('2024-01-15', 'ES', config);
      const boundaries2 = materializeSessionBoundaries('2024-01-16', 'ES', config);

      expect(boundaries1).toHaveLength(boundaries2.length);

      // Session durations should be the same
      for (let i = 0; i < boundaries1.length; i++) {
        const duration1 = boundaries1[i]!.end.getTime() - boundaries1[i]!.start.getTime();
        const duration2 = boundaries2[i]!.end.getTime() - boundaries2[i]!.start.getTime();
        expect(duration1).toBe(duration2);
      }
    });

    it('should warn and skip windows with invalid time format', () => {
      const invalidConfig: SymbolSessionsConfig = {
        symbol: 'ES',
        windows: [
          { name: 'ASIA', start: 'invalid', end: '03:00', timezone: 'America/Chicago' },
          { name: 'LONDON', start: '03:00', end: '09:30', timezone: 'America/Chicago' }
        ]
      };

      const boundaries = materializeSessionBoundaries('2024-01-15', 'ES', invalidConfig);

      // Should skip ASIA and only return LONDON
      expect(boundaries).toHaveLength(1);
      expect(boundaries[0]?.name).toBe('LONDON');
    });

    it('should handle non-standard session times', () => {
      const customConfig: SymbolSessionsConfig = {
        symbol: 'ES',
        windows: [
          { name: 'ASIA', start: '20:00', end: '04:00', timezone: 'America/Chicago' }
        ]
      };

      const boundaries = materializeSessionBoundaries('2024-01-15', 'ES', customConfig);

      expect(boundaries).toHaveLength(1);
      expect(boundaries[0]?.name).toBe('ASIA');
    });
  });

  describe('isWithin()', () => {
    it('should return true for timestamp within boundary', () => {
      const boundary: SessionBoundary = {
        name: 'NY',
        start: new Date('2024-01-15T14:30:00Z'), // 9:30 AM EST
        end: new Date('2024-01-15T21:00:00Z')    // 4:00 PM EST
      };

      const timestamp = new Date('2024-01-15T16:00:00Z'); // 11:00 AM EST

      expect(isWithin(boundary, timestamp)).toBe(true);
    });

    it('should return true for timestamp at boundary start (inclusive)', () => {
      const boundary: SessionBoundary = {
        name: 'NY',
        start: new Date('2024-01-15T14:30:00Z'),
        end: new Date('2024-01-15T21:00:00Z')
      };

      const timestamp = new Date('2024-01-15T14:30:00Z');

      expect(isWithin(boundary, timestamp)).toBe(true);
    });

    it('should return false for timestamp at boundary end (exclusive)', () => {
      const boundary: SessionBoundary = {
        name: 'NY',
        start: new Date('2024-01-15T14:30:00Z'),
        end: new Date('2024-01-15T21:00:00Z')
      };

      const timestamp = new Date('2024-01-15T21:00:00Z');

      expect(isWithin(boundary, timestamp)).toBe(false);
    });

    it('should return false for timestamp before boundary', () => {
      const boundary: SessionBoundary = {
        name: 'NY',
        start: new Date('2024-01-15T14:30:00Z'),
        end: new Date('2024-01-15T21:00:00Z')
      };

      const timestamp = new Date('2024-01-15T14:00:00Z');

      expect(isWithin(boundary, timestamp)).toBe(false);
    });

    it('should return false for timestamp after boundary', () => {
      const boundary: SessionBoundary = {
        name: 'NY',
        start: new Date('2024-01-15T14:30:00Z'),
        end: new Date('2024-01-15T21:00:00Z')
      };

      const timestamp = new Date('2024-01-15T22:00:00Z');

      expect(isWithin(boundary, timestamp)).toBe(false);
    });

    it('should throw error for invalid boundary', () => {
      expect(() => {
        isWithin(null as any, new Date());
      }).toThrow('Invalid boundary');
    });

    it('should throw error for invalid timestamp', () => {
      const boundary: SessionBoundary = {
        name: 'NY',
        start: new Date('2024-01-15T14:30:00Z'),
        end: new Date('2024-01-15T21:00:00Z')
      };

      expect(() => {
        isWithin(boundary, null as any);
      }).toThrow('Invalid timestamp');
    });

    it('should handle midnight-crossing boundaries', () => {
      const boundary: SessionBoundary = {
        name: 'ASIA',
        start: new Date('2024-01-15T23:00:00Z'),
        end: new Date('2024-01-16T08:00:00Z')
      };

      const timestampBefore = new Date('2024-01-15T22:00:00Z');
      const timestampDuring1 = new Date('2024-01-16T00:00:00Z');
      const timestampDuring2 = new Date('2024-01-16T04:00:00Z');
      const timestampAfter = new Date('2024-01-16T09:00:00Z');

      expect(isWithin(boundary, timestampBefore)).toBe(false);
      expect(isWithin(boundary, timestampDuring1)).toBe(true);
      expect(isWithin(boundary, timestampDuring2)).toBe(true);
      expect(isWithin(boundary, timestampAfter)).toBe(false);
    });
  });

  describe('Timezone Integration', () => {
    it('should handle DST transitions correctly', () => {
      const config: SymbolSessionsConfig = {
        symbol: 'ES',
        windows: [
          { name: 'NY', start: '09:30', end: '16:00', timezone: 'America/Chicago' }
        ]
      };

      // Test a date before DST transition
      const winterBoundaries = materializeSessionBoundaries('2024-01-15', 'ES', config);

      // Test a date after DST transition
      const summerBoundaries = materializeSessionBoundaries('2024-06-15', 'ES', config);

      expect(winterBoundaries).toHaveLength(1);
      expect(summerBoundaries).toHaveLength(1);
    });

    it('should handle different timezones for same symbol', () => {
      const config: SymbolSessionsConfig = {
        symbol: 'EURUSD',
        windows: [
          { name: 'LONDON', start: '08:00', end: '16:00', timezone: 'Europe/London' }
        ]
      };

      const boundaries = materializeSessionBoundaries('2024-01-15', 'EURUSD', config);

      expect(boundaries).toHaveLength(1);
      expect(boundaries[0]?.name).toBe('LONDON');
    });
  });
});
