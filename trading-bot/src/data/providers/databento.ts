import axios, { AxiosInstance } from 'axios';
import { aggregateBars, clipBars } from './utils';
import { MINUTE, timeframeToInterval } from './timeframe';
import {
  GetBarsParams,
  MarketBar,
  MarketDataProvider,
  ProviderResponse,
  SupportedTimeframe
} from './types';

const DATABENTO_BASE_URL = 'https://hist.databento.com/v0';
const DATASET = 'GLBX.MDP3';

const CONTINUOUS_SYMBOLS: Record<string, string> = {
  ES: 'ES.c.0',
  'ES=F': 'ES.c.0',
  NQ: 'NQ.c.0',
  'NQ=F': 'NQ.c.0'
};

function parseCsv(data: string): MarketBar[] {
  const lines = data.trim().split(/\r?\n/);
  if (lines.length <= 1) {
    return [];
  }

  return lines.slice(1).map((line) => {
    const [tsEvent, , , , open, high, low, close, volume] = line.split(',');
    const timestampMs = Number(BigInt(tsEvent) / BigInt(1_000_000));
    const scale = 1_000_000_000;

    return {
      timestamp: new Date(timestampMs),
      open: Number(open) / scale,
      high: Number(high) / scale,
      low: Number(low) / scale,
      close: Number(close) / scale,
      volume: Number(volume)
    };
  });
}

function timeframeToTargetMs(timeframe: SupportedTimeframe): number {
  if (timeframe === '10m') {
    return 10 * MINUTE;
  }
  if (timeframe === '4h') {
    return 4 * 60 * MINUTE;
  }
  return timeframeToInterval(timeframe);
}

function deriveWindow(timeframe: SupportedTimeframe, lookback: number, asOf: Date): { start: Date; end: Date } {
  const intervalMs = timeframeToTargetMs(timeframe);
  const bufferBars = 48;
  const totalBars = lookback + bufferBars;
  const start = new Date(asOf.getTime() - intervalMs * totalBars);
  const cappedEnd = Math.min(asOf.getTime(), Date.now());
  const end = new Date(cappedEnd);
  return { start, end };
}

export interface DatabentoProviderOptions {
  apiKey?: string;
  symbolMap?: Record<string, string>;
  dataset?: string;
}

export class DatabentoProvider implements MarketDataProvider {
  readonly id = 'databento';

  private readonly apiKey: string;
  private readonly http: AxiosInstance;
  private readonly symbolMap: Record<string, string>;
  private readonly dataset: string;

  constructor(options: DatabentoProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.DATABENTO_API_KEY ?? '';
    if (!this.apiKey) {
      throw new Error('Databento API key not provided');
    }

    this.dataset = options.dataset ?? DATASET;
    this.symbolMap = options.symbolMap ?? {};

    this.http = axios.create({
      baseURL: DATABENTO_BASE_URL,
      auth: {
        username: this.apiKey,
        password: ''
      },
      responseType: 'text'
    });
  }

  isTimeframeSupported(timeframe: SupportedTimeframe): boolean {
    return timeframe === '10m' || timeframe === '1h' || timeframe === '4h' || timeframe === '60m';
  }

  async getBars(params: GetBarsParams): Promise<ProviderResponse> {
    const symbol = this.symbolMap[params.symbol]
      ?? CONTINUOUS_SYMBOLS[params.symbol]
      ?? params.symbol;
    const window = deriveWindow(params.timeframe, params.lookback, params.asOf);

    const csv = await this.fetchCsv(symbol, window.start, window.end);
    const minuteBars = parseCsv(csv);

    if (!minuteBars.length) {
      throw new Error('No data returned from Databento');
    }

    const aggregated = aggregateBars(minuteBars, MINUTE, timeframeToTargetMs(params.timeframe));
    const clipped = clipBars(aggregated, params.asOf, params.lookback);

    return {
      provider: this.id,
      symbol: params.symbol,
      timeframe: params.timeframe,
      bars: clipped,
      metadata: {
        symbol,
        dataset: this.dataset
      }
    };
  }

  private async fetchCsv(symbol: string, start: Date, end: Date): Promise<string> {
    const response = await this.http.get<string>('/timeseries.get_range', {
      params: {
        dataset: this.dataset,
        symbols: symbol,
        schema: 'ohlcv-1m',
        stype_in: 'continuous',
        stype_out: 'instrument_id',
        start: start.toISOString(),
        end: end.toISOString(),
        encoding: 'csv',
        compression: 'none',
        map_symbols: false,
        pretty_px: false,
        pretty_ts: false,
        limit: 10000
      }
    });

    return response.data;
  }
}
