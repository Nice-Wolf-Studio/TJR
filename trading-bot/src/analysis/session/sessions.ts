import moment from 'moment-timezone';
import { MarketBar } from '../../data/providers/types';
import { SessionExtremes, SessionMapResult, SessionInputs } from '../types';

interface SessionConfig {
  name: 'asia' | 'london';
  startHour: number;
  endHour: number;
  windowLabel: string;
}

const SESSION_CONFIG: SessionConfig[] = [
  { name: 'asia', startHour: 18, endHour: 1, windowLabel: '18:00-01:00 ET' },
  { name: 'london', startHour: 3, endHour: 7, windowLabel: '03:00-07:00 ET' }
];

const TZ = 'America/New_York';

function findLatestSessionWindow(asOf: Date, config: SessionConfig): { start: Date; end: Date } {
  const asOfMoment = moment(asOf).tz(TZ);

  for (let offset = 0; offset < 3; offset += 1) {
    const base = asOfMoment.clone().startOf('day').subtract(offset, 'days');

    const start = base.clone().hour(config.startHour).minute(0).second(0).millisecond(0);
    const end = base.clone();

    if (config.endHour <= config.startHour) {
      end.add(1, 'day').hour(config.endHour).minute(0).second(0).millisecond(0);
    } else {
      end.hour(config.endHour).minute(0).second(0).millisecond(0);
    }

    if (end.isSameOrBefore(asOfMoment)) {
      return { start: start.toDate(), end: end.toDate() };
    }
  }

  const fallbackStart = asOfMoment.clone().subtract(12, 'hours');
  return { start: fallbackStart.toDate(), end: asOf }; // fallback to half day window
}

function extractExtremes(bars: MarketBar[], window: { start: Date; end: Date }): { high: number | null; low: number | null } {
  const filtered = bars.filter(bar => bar.timestamp >= window.start && bar.timestamp <= window.end);

  if (!filtered.length) {
    return { high: null, low: null };
  }

  let high = -Infinity;
  let low = Infinity;

  for (const bar of filtered) {
    if (bar.high > high) {
      high = bar.high;
    }
    if (bar.low < low) {
      low = bar.low;
    }
  }

  return {
    high: Number.isFinite(high) ? high : null,
    low: Number.isFinite(low) ? low : null
  };
}

export function buildSessionMap(inputs: SessionInputs): SessionMapResult {
  const bars = inputs.bars10m;
  const result: Partial<SessionMapResult> = {};

  for (const config of SESSION_CONFIG) {
    const window = findLatestSessionWindow(inputs.asOf, config);
    const extremes = extractExtremes(bars, window);

    const session: SessionExtremes = {
      name: config.name,
      window: config.windowLabel,
      high: extremes.high,
      low: extremes.low
    };

    result[config.name] = session;
  }

  return result as SessionMapResult;
}
