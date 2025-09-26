import { MarketBar } from '../data/providers/types';
import {
  ActiveRange,
  BreakOfStructure,
  StructureState,
  SwingPoint,
  TrendDirection
} from './types';

interface StructureOptions {
  swingLookback?: number;
  overrideHours?: number;
}

const DEFAULT_OPTIONS: Required<StructureOptions> = {
  swingLookback: 1,
  overrideHours: 12
};

export function detectSwings(bars: MarketBar[], lookback = DEFAULT_OPTIONS.swingLookback): SwingPoint[] {
  if (bars.length < lookback * 2 + 1) {
    return [];
  }

  const swings: SwingPoint[] = [];

  for (let i = lookback; i < bars.length - lookback; i += 1) {
    const window = bars.slice(i - lookback, i + lookback + 1);
    const candidate = bars[i];

    const isHigh = window.every(bar => candidate.high >= bar.high);
    const isLow = window.every(bar => candidate.low <= bar.low);

    if (isHigh) {
      swings.push({ index: i, timestamp: candidate.timestamp, price: candidate.high, type: 'high' });
    }

    if (isLow) {
      swings.push({ index: i, timestamp: candidate.timestamp, price: candidate.low, type: 'low' });
    }
  }

  return swings
    .sort((a, b) => a.index - b.index)
    .reduce<SwingPoint[]>((deduped, swing) => {
      if (!deduped.length || swing.type !== deduped[deduped.length - 1].type) {
        deduped.push(swing);
      } else {
        const last = deduped[deduped.length - 1];
        if (swing.type === 'high' && swing.price > last.price) {
          deduped[deduped.length - 1] = swing;
        } else if (swing.type === 'low' && swing.price < last.price) {
          deduped[deduped.length - 1] = swing;
        }
      }
      return deduped;
    }, []);
}

export function findLastBos(swings: SwingPoint[]): BreakOfStructure | null {
  let lastHigh: SwingPoint | null = null;
  let lastLow: SwingPoint | null = null;
  let lastBos: BreakOfStructure | null = null;

  for (const swing of swings) {
    if (swing.type === 'high') {
      if (lastHigh && lastLow && swing.price > lastHigh.price) {
        lastBos = {
          direction: 'up',
          timestamp: swing.timestamp,
          swing,
          reference: lastLow
        };
      }
      lastHigh = swing;
    } else {
      if (lastLow && lastHigh && swing.price < lastLow.price) {
        lastBos = {
          direction: 'down',
          timestamp: swing.timestamp,
          swing,
          reference: lastHigh
        };
      }
      lastLow = swing;
    }
  }

  return lastBos;
}

export function selectActiveRange(swings: SwingPoint[], bos: BreakOfStructure | null): ActiveRange | null {
  if (!bos) {
    return null;
  }

  const relevantSwings = swings.filter(swing => swing.timestamp.getTime() <= bos.timestamp.getTime());
  const reference = bos.reference;

  if (bos.direction === 'up') {
    const high = bos.swing.price;
    const low = reference.price;
    return { high, low, eq: (high + low) / 2 };
  }

  const high = reference.price;
  const low = bos.swing.price;
  return { high, low, eq: (high + low) / 2 };
}

export function determineTrend(bos: BreakOfStructure | null): TrendDirection {
  if (!bos) {
    return 'neutral';
  }
  return bos.direction === 'up' ? 'bullish' : 'bearish';
}

export function buildStructureState(
  bars: MarketBar[],
  timeframe: '4H' | '1H',
  options: StructureOptions = {}
): StructureState {
  const params = { ...DEFAULT_OPTIONS, ...options };
  const swings = detectSwings(bars, params.swingLookback);
  const lastBos = findLastBos(swings);
  const activeRange = selectActiveRange(swings, lastBos);

  return {
    timeframe,
    trend: determineTrend(lastBos),
    lastBos,
    activeRange
  };
}

export function resolveStructure(
  structure4H: StructureState,
  structure1H: StructureState,
  options: StructureOptions = {}
): StructureState {
  const params = { ...DEFAULT_OPTIONS, ...options };
  const overrideThresholdMs = params.overrideHours * 60 * 60 * 1000;

  if (!structure4H.lastBos && structure1H.lastBos) {
    return { ...structure1H, timeframe: '1H' };
  }

  if (!structure1H.lastBos) {
    return structure4H;
  }

  const recencyDelta = structure4H.lastBos && structure1H.lastBos
    ? Math.abs(structure1H.lastBos.timestamp.getTime() - structure4H.lastBos.timestamp.getTime())
    : Number.POSITIVE_INFINITY;

  if (recencyDelta <= overrideThresholdMs && structure1H.trend !== structure4H.trend) {
    return { ...structure1H, timeframe: '1H' };
  }

  return structure4H;
}
