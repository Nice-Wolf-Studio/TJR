import { SupportedTimeframe } from './types';

export const MINUTE = 60 * 1000;

const timeframeToMillis: Record<SupportedTimeframe, number> = {
  '1m': MINUTE,
  '5m': 5 * MINUTE,
  '10m': 10 * MINUTE,
  '15m': 15 * MINUTE,
  '30m': 30 * MINUTE,
  '60m': 60 * MINUTE,
  '240m': 240 * MINUTE,
  '1h': 60 * MINUTE,
  '4h': 240 * MINUTE,
  '1d': 24 * 60 * MINUTE
};

export function timeframeToInterval(timeframe: SupportedTimeframe): number {
  return timeframeToMillis[timeframe];
}

export function normalizeTimeframe(timeframe: SupportedTimeframe): SupportedTimeframe {
  if (timeframe === '4h') {
    return '240m';
  }

  if (timeframe === '1h') {
    return '60m';
  }

  return timeframe;
}
