import { MarketBar } from './types';

export function aggregateBars(bars: MarketBar[], sourceIntervalMs: number, targetIntervalMs: number): MarketBar[] {
  if (targetIntervalMs <= sourceIntervalMs) {
    return bars;
  }

  const aggregated: MarketBar[] = [];
  let bucket: MarketBar | null = null;
  let bucketStart = 0;

  for (const bar of bars) {
    if (!bucket) {
      bucketStart = Math.floor(bar.timestamp.getTime() / targetIntervalMs) * targetIntervalMs;
      bucket = { ...bar, timestamp: new Date(bucketStart) };
      continue;
    }

    if (bar.timestamp.getTime() >= bucketStart + targetIntervalMs) {
      aggregated.push(bucket);
      bucketStart = Math.floor(bar.timestamp.getTime() / targetIntervalMs) * targetIntervalMs;
      bucket = { ...bar, timestamp: new Date(bucketStart) };
      continue;
    }

    bucket.high = Math.max(bucket.high, bar.high);
    bucket.low = Math.min(bucket.low, bar.low);
    bucket.close = bar.close;
    bucket.volume += bar.volume;
  }

  if (bucket) {
    aggregated.push(bucket);
  }

  return aggregated;
}

export function clipBars(bars: MarketBar[], asOf: Date, lookback: number): MarketBar[] {
  const cutoff = asOf.getTime();
  const subset = bars.filter(bar => bar.timestamp.getTime() <= cutoff);
  return subset.slice(-lookback);
}
