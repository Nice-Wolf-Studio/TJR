import axios, { AxiosInstance } from 'axios';
import { timeframeToInterval, MINUTE } from './timeframe';
import { aggregateBars, clipBars } from './utils';
import {
  GetBarsParams,
  MarketBar,
  MarketDataProvider,
  ProviderResponse,
  SupportedTimeframe
} from './types';

const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

const INTRADAY_INTERVALS: Record<SupportedTimeframe, string | undefined> = {
  '1m': '1m',
  '5m': '5m',
  '10m': '5m',
  '15m': '15m',
  '30m': '30m',
  '60m': '60m',
  '240m': '60m',
  '1h': '60m',
  '4h': '60m',
  '1d': '1d'
};

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp: number[];
      indicators?: {
        quote?: Array<{
          open: Array<number | null>;
          high: Array<number | null>;
          low: Array<number | null>;
          close: Array<number | null>;
          volume: Array<number | null>;
        }>;
      };
    }>;
    error?: {
      code?: string;
      description?: string;
    };
  };
}

export interface YahooFinanceProviderOptions {
  httpClient?: AxiosInstance;
  symbolMap?: Record<string, string>;
}

export class YahooFinanceProvider implements MarketDataProvider {
  readonly id = 'yahoo-finance';

  private readonly http: AxiosInstance;
  private readonly symbolMap: Record<string, string>;

  constructor(options: YahooFinanceProviderOptions = {}) {
    this.http = options.httpClient ?? axios.create({ baseURL: YAHOO_BASE_URL, timeout: 10_000 });
    this.symbolMap = options.symbolMap ?? {};
  }

  isTimeframeSupported(timeframe: SupportedTimeframe): boolean {
    return Boolean(INTRADAY_INTERVALS[timeframe]);
  }

  private getTargetIntervalMs(timeframe: SupportedTimeframe): number {
    if (timeframe === '10m') {
      return 10 * MINUTE;
    }

    if (timeframe === '4h') {
      return 4 * 60 * MINUTE;
    }

    return timeframeToInterval(timeframe);
  }

  private deriveWindow(
    timeframe: SupportedTimeframe,
    lookback: number,
    asOf: Date
  ): { start: Date; end: Date } {
    const intervalMs = this.getTargetIntervalMs(timeframe);
    const bufferBars = 24;
    const totalBars = lookback + bufferBars;
    const start = new Date(asOf.getTime() - intervalMs * totalBars);
    const end = new Date(asOf.getTime() + intervalMs * 6);
    return { start, end };
  }

  async getBars(params: GetBarsParams): Promise<ProviderResponse> {
    if (!this.isTimeframeSupported(params.timeframe)) {
      throw new Error(`Yahoo Finance does not support timeframe ${params.timeframe}`);
    }

    const yahooSymbol = this.symbolMap[params.symbol] ?? params.symbol;
    const interval = INTRADAY_INTERVALS[params.timeframe];
    if (!interval) {
      throw new Error(`Interval mapping missing for ${params.timeframe}`);
    }

    const window = this.deriveWindow(params.timeframe, params.lookback, params.asOf);

    const bars = await this.fetchSeries({
      symbol: yahooSymbol,
      interval,
      start: window.start,
      end: window.end
    });

    const normalized = this.normalizeInterval(params.timeframe, bars);
    const clipped = this.clipBars(normalized, params.asOf, params.lookback);

    return {
      provider: this.id,
      symbol: params.symbol,
      timeframe: params.timeframe,
      bars: clipped
    };
  }

  private async fetchSeries(params: { symbol: string; interval: string; start: Date; end: Date }): Promise<MarketBar[]> {
    const { data } = await this.http.get<YahooChartResponse>(`/${encodeURIComponent(params.symbol)}`, {
      params: {
        interval: params.interval,
        period1: Math.floor(params.start.getTime() / 1000),
        period2: Math.floor(params.end.getTime() / 1000),
        includePrePost: false,
        events: 'div,splits'
      }
    });

    const result = data.chart?.result?.[0];
    if (!result || !result.timestamp) {
      const errorMessage = data.chart?.error?.description ?? 'Unknown Yahoo Finance error';
      throw new Error(`Yahoo Finance response invalid: ${errorMessage}`);
    }

    const quote = result.indicators?.quote?.[0];
    if (!quote) {
      throw new Error('Yahoo Finance response missing quote data');
    }

    const bars: MarketBar[] = [];
    for (let i = 0; i < result.timestamp.length; i += 1) {
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const close = quote.close?.[i];
      const volume = quote.volume?.[i];

      if ([open, high, low, close].some(value => value == null)) {
        continue;
      }

      bars.push({
        timestamp: new Date(result.timestamp[i] * 1000),
        open: open as number,
        high: high as number,
        low: low as number,
        close: close as number,
        volume: (volume ?? 0) as number
      });
    }

    return bars;
  }

  private normalizeInterval(timeframe: SupportedTimeframe, bars: MarketBar[]): MarketBar[] {
    if (timeframe !== '10m' && timeframe !== '4h') {
      return bars;
    }

    const intervalMs = timeframe === '10m' ? 10 * MINUTE : 4 * 60 * MINUTE;
    const sourceInterval = timeframe === '10m' ? 5 * MINUTE : 60 * MINUTE;
    return aggregateBars(bars, sourceInterval, intervalMs);
  }
  
  private clipBars(bars: MarketBar[], asOf: Date, lookback: number): MarketBar[] {
    return clipBars(bars, asOf, lookback);
  }
}
