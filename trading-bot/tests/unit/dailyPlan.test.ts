import fs from 'fs';
import path from 'path';
import moment from 'moment-timezone';
import { computeDailyBias } from '../../src/analysis/bias/daily-bias-v1';
import { computeDayProfile } from '../../src/analysis/profile/day-profile-v1';
import { buildSessionMap } from '../../src/analysis/session/sessions';
import { MarketBar } from '../../src/data/providers/types';
import { DailyBiasResult } from '../../src/analysis/types';

function loadFixture(name: string) {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'fixtures', `${name}.json`), 'utf8');
  return JSON.parse(raw);
}

function parseBars(raw: any[]): MarketBar[] {
  return raw.map(item => ({
    timestamp: new Date(item.timestamp),
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume
  }));
}

describe('Daily Plan deterministic fixtures', () => {
  const fixtures = ['p1', 'p2', 'p3'];

  for (const name of fixtures) {
    it(`matches expected bias/profile for ${name}`, () => {
      const fixture = loadFixture(name);
      const asOf = moment.tz(fixture.asOf, 'America/New_York').toDate();
      const bars4h = parseBars(fixture.bars4h);
      const bars1h = parseBars(fixture.bars1h);
      const bars10m = parseBars(fixture.bars10m);

      const price = bars1h[bars1h.length - 1].close;

      const bias = computeDailyBias({
        symbol: fixture.symbol,
        asOf,
        price,
        bars4H: bars4h,
        bars1H: bars1h
      });

      expect(bias.bias).toBe(fixture.expectedBias.bias);
      expect(bias.trendTF).toBe(fixture.expectedBias.trendTF);
      expect(bias.structure.state).toBe(fixture.expectedBias.structure.state);
      expect(bias.structure.lastBos).toBe(fixture.expectedBias.structure.lastBos);

      if (fixture.expectedBias.range) {
        expect(bias.range?.low).toBeCloseTo(fixture.expectedBias.range.low, 2);
        expect(bias.range?.eq).toBeCloseTo(fixture.expectedBias.range.eq, 2);
        expect(bias.range?.high).toBeCloseTo(fixture.expectedBias.range.high, 2);
      }

      const sessionMap = buildSessionMap({ bars10m, asOf });
      const profile = computeDayProfile({
        bias: bias as DailyBiasResult,
        sessionMap,
        lastPrice: price
      });

      expect(profile.profile).toBe(fixture.expectedProfile.profile);
      expect(profile.targets.primary).toBe(fixture.expectedProfile.targets.primary);
      expect(profile.targets.secondary).toBe(fixture.expectedProfile.targets.secondary);
    });
  }
});
