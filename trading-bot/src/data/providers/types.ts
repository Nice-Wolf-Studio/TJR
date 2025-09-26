export type SupportedTimeframe =
  | '1m'
  | '5m'
  | '10m'
  | '15m'
  | '30m'
  | '60m'
  | '240m'
  | '1h'
  | '4h'
  | '1d';

export interface GetBarsParams {
  symbol: string;
  timeframe: SupportedTimeframe;
  asOf: Date;
  lookback: number; // number of bars to return counting backwards from asOf (inclusive)
}

export interface MarketBar {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ProviderResponse {
  provider: string;
  symbol: string;
  timeframe: SupportedTimeframe;
  bars: MarketBar[];
  metadata?: Record<string, unknown>;
}

export interface MarketDataProvider {
  readonly id: string;
  getBars(params: GetBarsParams): Promise<ProviderResponse>;
  isTimeframeSupported(timeframe: SupportedTimeframe): boolean;
}

export type ProviderFactory = () => MarketDataProvider;
