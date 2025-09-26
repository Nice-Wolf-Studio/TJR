import axios, { AxiosInstance } from 'axios';
import { timeframeToInterval, normalizeTimeframe, MINUTE } from './timeframe';
import { aggregateBars, clipBars } from './utils';
import {
  GetBarsParams,
  MarketBar,
  MarketDataProvider,
  ProviderResponse,
  SupportedTimeframe
} from './types';

const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';
const INTRADAY_FRAMES: Record<string, string> = {
  '1m': '1min',
  '5m': '5min',
  '10m': '5min',
  '15m': '15min',
  '30m': '30min',
  '60m': '60min',
  '240m': '60min',
  '1h': '60min'
};

const DAILY_FUNCTION = 'TIME_SERIES_DAILY_ADJUSTED';
const INTRADAY_FUNCTION = 'TIME_SERIES_INTRADAY';

type RawSeries = Array<MarketBar>;

interface CacheEntry {
  timestamp: number;
  data: RawSeries;
}

const DEFAULT_CACHE_TTL = 60 * 1000; // 1 minute

function parseSeries(series: Record<string, any>): RawSeries {
  return Object.entries(series)
    .map(([timestamp, candle]) => ({
      timestamp: new Date(`${timestamp}Z`),
      open: Number.parseFloat(candle['1. open'] ?? candle.open ?? '0'),
      high: Number.parseFloat(candle['2. high'] ?? candle.high ?? '0'),
      low: Number.parseFloat(candle['3. low'] ?? candle.low ?? '0'),
      close: Number.parseFloat(candle['4. close'] ?? candle.close ?? '0'),
      volume: Number.parseFloat(candle['5. volume'] ?? candle.volume ?? '0')
    }))
    .filter(bar => Number.isFinite(bar.open))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

export interface AlphaVantageProviderOptions {
  apiKey?: string;
  httpClient?: AxiosInstance;
  cacheTtlMs?: number;
  symbolMap?: Record<string, string>;
}

export class AlphaVantageProvider implements MarketDataProvider {
  readonly id = 'alpha-vantage';

  private readonly apiKey: string;
  private readonly http: AxiosInstance;
  private readonly cacheTtl: number;
  private readonly symbolMap: Record<string, string>;
  private readonly cache: Map<string, CacheEntry> = new Map();

  constructor(options: AlphaVantageProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ALPHAVANTAGE_API_KEY ?? '';
    if (!this.apiKey) {
      throw new Error('Alpha Vantage API key not provided');
    }

    this.http = options.httpClient ?? axios.create({ baseURL: ALPHA_VANTAGE_BASE_URL, timeout: 10_000 });
    this.cacheTtl = options.cacheTtlMs ?? DEFAULT_CACHE_TTL;
    this.symbolMap = options.symbolMap ?? {};
  }

  isTimeframeSupported(timeframe: SupportedTimeframe): boolean {
    if (timeframe === '1d') {
      return true;
    }

    const normalized = normalizeTimeframe(timeframe);
    return Boolean(INTRADAY_FRAMES[normalized]);
  }

  async getBars(params: GetBarsParams): Promise<ProviderResponse> {
    if (!this.isTimeframeSupported(params.timeframe)) {
      throw new Error(`Alpha Vantage does not support timeframe ${params.timeframe}`);
    }

    const normalized = normalizeTimeframe(params.timeframe);
    const alphaSymbol = this.symbolMap[params.symbol] ?? params.symbol;

    if (normalized === '1d') {
      const response = await this.fetchDailySeries(alphaSymbol);
      return {
        provider: this.id,
        symbol: params.symbol,
        timeframe: params.timeframe,
        bars: clipBars(response, params.asOf, params.lookback)
      };
    }

    const response = await this.fetchIntradaySeries(alphaSymbol, normalized);
    const intervalMs = timeframeToInterval(normalized);
    const targetInterval = timeframeToInterval(params.timeframe === '10m' ? '10m' : params.timeframe);
    const normalizedBars = params.timeframe === '10m' || params.timeframe === '4h'
      ? aggregateBars(response, intervalMs, params.timeframe === '10m' ? 10 * MINUTE : 4 * 60 * MINUTE)
      : response;

    return {
      provider: this.id,
      symbol: params.symbol,
      timeframe: params.timeframe,
      bars: clipBars(normalizedBars, params.asOf, params.lookback)
    };
  }

  private async fetchDailySeries(symbol: string): Promise<MarketBar[]> {
    const cacheKey = `daily:${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) {
      return cached;
    }

    const { data } = await this.http.get('', {
      params: {
        function: DAILY_FUNCTION,
        symbol,
        outputsize: 'compact',
        apikey: this.apiKey
      }
    });

    const seriesKey = 'Time Series (Daily)';
    const series = data?.[seriesKey];
    if (!series) {
      throw new Error(`Unexpected Alpha Vantage response for ${symbol}: missing ${seriesKey}`);
    }

    const parsed = parseSeries(series);
    this.setCached(cacheKey, parsed);
    return parsed;
  }

  private async fetchIntradaySeries(symbol: string, timeframe: SupportedTimeframe): Promise<MarketBar[]> {
    const frame = INTRADAY_FRAMES[timeframe];
    if (!frame) {
      throw new Error(`Unsupported Alpha Vantage intraday frame ${timeframe}`);
    }

    const cacheKey = `intraday:${symbol}:${frame}`;
    const cached = this.getCached(cacheKey);
    if (cached) {
      return cached;
    }

    const { data } = await this.http.get('', {
      params: {
        function: INTRADAY_FUNCTION,
        symbol,
        interval: frame,
        outputsize: 'compact',
        apikey: this.apiKey
      }
    });

    const seriesKey = `Time Series (${frame})`;
    const series = data?.[seriesKey];
    if (!series) {
      throw new Error(`Unexpected Alpha Vantage response for ${symbol}: missing ${seriesKey}`);
    }

    const parsed = parseSeries(series);
    this.setCached(cacheKey, parsed);
    return parsed;
  }

  private getCached(key: string): MarketBar[] | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() - entry.timestamp > this.cacheTtl) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data;
  }

  private setCached(key: string, data: MarketBar[]): void {
    this.cache.set(key, { timestamp: Date.now(), data });
  }
}
