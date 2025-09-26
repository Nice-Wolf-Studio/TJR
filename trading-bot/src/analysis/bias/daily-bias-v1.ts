import { MarketBar } from '../../data/providers/types';
import { buildStructureState, resolveStructure } from '../structure';
import {
  ActiveRange,
  DailyBiasLabel,
  DailyBiasResult,
  StructureState,
  TrendDirection
} from '../types';

interface ComputeDailyBiasParams {
  symbol: string;
  asOf: Date;
  price: number;
  bars4H: MarketBar[];
  bars1H: MarketBar[];
}

function determineBiasLabel(trend: TrendDirection, price: number, range: ActiveRange | null): DailyBiasLabel {
  if (trend === 'bullish' && range) {
    return price >= range.eq ? 'long' : 'long-into-eq';
  }

  if (trend === 'bearish' && range) {
    return price <= range.eq ? 'short' : 'short-into-eq';
  }

  return 'neutral';
}

function buildNotes(trend: TrendDirection, range: ActiveRange | null, price: number): string[] {
  if (!range) {
    return ['structure neutral: no confirmed break of structure'];
  }

  const notes: string[] = [];
  const position = price >= range.eq ? 'premium' : 'discount';

  if (trend === 'bullish') {
    notes.push(`4H structure bullish; price in ${position} relative to EQ`);
  } else if (trend === 'bearish') {
    notes.push(`4H structure bearish; price in ${position} relative to EQ`);
  } else {
    notes.push('trend neutral: awaiting clean structure shift');
  }

  return notes;
}

export function computeDailyBias(params: ComputeDailyBiasParams): DailyBiasResult {
  const structure4H = buildStructureState(params.bars4H, '4H');
  const structure1H = buildStructureState(params.bars1H, '1H');
  const activeStructure = resolveStructure(structure4H, structure1H);
  const biasLabel = determineBiasLabel(activeStructure.trend, params.price, activeStructure.activeRange);

  return {
    symbol: params.symbol,
    asOf: params.asOf,
    bias: biasLabel,
    trendTF: activeStructure.timeframe,
    range: activeStructure.activeRange,
    structure: {
      state: activeStructure.trend,
      lastBos: activeStructure.lastBos?.direction ?? null
    },
    notes: buildNotes(activeStructure.trend, activeStructure.activeRange, params.price)
  };
}

export function extractPrice(bars: MarketBar[]): number {
  if (!bars.length) {
    throw new Error('No bars available to determine price');
  }

  return bars[bars.length - 1].close;
}

export function buildStructureSnapshot(
  bars4H: MarketBar[],
  bars1H: MarketBar[]
): { primary: StructureState; secondary: StructureState } {
  const structure4H = buildStructureState(bars4H, '4H');
  const structure1H = buildStructureState(bars1H, '1H');
  return {
    primary: resolveStructure(structure4H, structure1H),
    secondary: structure1H
  };
}
