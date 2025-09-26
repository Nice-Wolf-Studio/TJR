import axios, { AxiosInstance } from 'axios';
import { aggregateBars, clipBars } from './utils';
import {
  GetBarsParams,
  MarketBar,
  MarketDataProvider,
  ProviderResponse,
  SupportedTimeframe
} from './types';
import { timeframeToInterval, MINUTE } from './timeframe';

const POLYGON_BASE_URL = 'https://api.polygon.io';

interface PolygonFrame {
  multiplier: number;
  timespan: 'minute' | 'hour' | 'day';
  aggregate?: number;
  sourceIntervalMs: number;
}

const FRAME_MAP: Record<SupportedTimeframe, PolygonFrame> = {
  '1m': { multiplier: 1, timespan: 'minute', sourceIntervalMs: MINUTE },
  '5m': { multiplier: 5, timespan: 'minute', sourceIntervalMs: 5 * MINUTE },
  '10m': { multiplier: 5, timespan: 'minute', aggregate: 2, sourceIntervalMs: 5 * MINUTE },
  '15m': { multiplier: 15, timespan: 'minute', sourceIntervalMs: 15 * MINUTE },
  '30m': { multiplier: 30, timespan: 'minute', sourceIntervalMs: 30 * MINUTE },
  '60m': { multiplier: 60, timespan: 'minute', sourceIntervalMs: 60 * MINUTE },
  '1h': { multiplier: 60, timespan: 'minute', sourceIntervalMs: 60 * MINUTE },
  '240m': { multiplier: 60, timespan: 'minute', aggregate: 4, sourceIntervalMs: 60 * MINUTE },
  '4h': { multiplier: 60, timespan: 'minute', aggregate: 4, sourceIntervalMs: 60 * MINUTE },
  '1d': { multiplier: 1, timespan: 'day', sourceIntervalMs: 24 * 60 * MINUTE }
};

interface PolygonResponse {
  results?: Array<{
    t: number;
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  }>;
  status?: string;
  error?: string;
  message?: string;
}

export interface PolygonProviderOptions {
  apiKey?: string;
  httpClient?: AxiosInstance;
  symbolMap?: Record<string, string>;
}

export class PolygonProvider implements MarketDataProvider {
  readonly id = 'polygon';

  private readonly apiKey: string;
  private readonly http: AxiosInstance;
  private readonly symbolMap: Record<string, string>;

  constructor(options: PolygonProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.POLYGON_API_KEY ?? '';
    if (!this.apiKey) {
      throw new Error('Polygon API key not provided');
    }

    this.http = options.httpClient ?? axios.create({ baseURL: POLYGON_BASE_URL, timeout: 10_000 });
    this.symbolMap = options.symbolMap ?? {};
  }

  isTimeframeSupported(timeframe: SupportedTimeframe): boolean {
    return Boolean(FRAME_MAP[timeframe]);
  }

  async getBars(params: GetBarsParams): Promise<ProviderResponse> {
    if (!this.isTimeframeSupported(params.timeframe)) {
      throw new Error(`Polygon does not support timeframe ${params.timeframe}`);
    }

    const mapping = FRAME_MAP[params.timeframe];
    const polygonSymbol = this.symbolMap[params.symbol] ?? params.symbol;
    const { results } = await this.fetchSeries(polygonSymbol, mapping, params);
    const bars = results.map(result => ({
      timestamp: new Date(result.t),
      open: result.o,
      high: result.h,
      low: result.l,
      close: result.c,
      volume: result.v
    }));

    const normalizedBars = mapping.aggregate
      ? aggregateBars(bars, mapping.sourceIntervalMs, mapping.sourceIntervalMs * mapping.aggregate)
      : bars;

    const clipped = clipBars(normalizedBars, params.asOf, params.lookback);

    return {
      provider: this.id,
      symbol: params.symbol,
      timeframe: params.timeframe,
      bars: clipped
    };
  }

  private async fetchSeries(
    symbol: string,
    frame: PolygonFrame,
    params: GetBarsParams
  ): Promise<{ results: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }> }> {
    const end = params.asOf;
    const bufferMultiplier = 3;
    const baseInterval = frame.sourceIntervalMs;
    const duration = (params.lookback + bufferMultiplier) * baseInterval;
    const start = new Date(end.getTime() - duration);

    const from = start.toISOString();
    const to = new Date(end.getTime() + baseInterval).toISOString();

    const url = `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${frame.multiplier}/${frame.timespan}/${from}/${to}`;

    const { data } = await this.http.get<PolygonResponse>(url, {
      params: {
        adjusted: true,
        sort: 'asc',
        limit: 5000,
        apiKey: this.apiKey
      }
    });

    if (data.status !== 'OK' || !data.results) {
      const message = data.error ?? data.message ?? 'Unknown Polygon error';
      throw new Error(`Polygon error: ${message}`);
    }

    return { results: data.results };
  }
}
