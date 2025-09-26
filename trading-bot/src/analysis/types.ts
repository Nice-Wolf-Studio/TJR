import { MarketBar } from '../data/providers/types';

export type TrendDirection = 'bullish' | 'bearish' | 'neutral';
export type BosDirection = 'up' | 'down';
export type DailyBiasLabel = 'long' | 'short' | 'long-into-eq' | 'short-into-eq' | 'neutral';
export type DayProfileLabel = 'P1' | 'P2' | 'P3';

export interface SwingPoint {
  index: number;
  timestamp: Date;
  price: number;
  type: 'high' | 'low';
}

export interface BreakOfStructure {
  direction: BosDirection;
  timestamp: Date;
  swing: SwingPoint;
  reference: SwingPoint;
}

export interface ActiveRange {
  high: number;
  low: number;
  eq: number;
}

export interface StructureState {
  timeframe: '4H' | '1H';
  trend: TrendDirection;
  lastBos: BreakOfStructure | null;
  activeRange: ActiveRange | null;
}

export interface DailyBiasResult {
  symbol: string;
  asOf: Date;
  bias: DailyBiasLabel;
  trendTF: StructureState['timeframe'];
  range: ActiveRange | null;
  structure: {
    state: TrendDirection;
    lastBos: BosDirection | null;
  };
  notes: string[];
}

export interface SessionExtremes {
  name: 'asia' | 'london';
  window: string;
  high: number | null;
  low: number | null;
}

export interface SessionMapResult {
  asia: SessionExtremes;
  london: SessionExtremes;
}

export interface DayProfileResult {
  symbol: string;
  asOf: Date;
  profile: DayProfileLabel;
  sessionMap: SessionMapResult;
  targets: {
    primary: string;
    secondary: string;
  };
  rationale: string[];
}

export interface DailyPlanContext {
  symbol: string;
  asOf: Date;
  price: number;
  structure4H: StructureState;
  structure1H: StructureState;
}

export interface SessionInputs {
  bars10m: MarketBar[];
  asOf: Date;
}

export interface DayProfileInputs {
  bias: DailyBiasResult;
  sessionMap: SessionMapResult;
  lastPrice: number;
}

export type MarketBars = MarketBar[];
