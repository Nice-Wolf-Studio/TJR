import { getRecentBars as dbGetRecentBars, getQuote as dbGetQuote } from '@tjr/databento';
import { readFileSync } from 'node:fs';

export type FuturesSymbol = 'ES' | 'NQ';

export interface CompositeOptions {
  mode: 'live' | 'fixture';
  fixturePath?: string;
}

export interface Quote { price: number; timestamp: Date }
export interface Bar { timestamp: number; open:number; high:number; low:number; close:number; volume?: number }

export class CompositeProvider {
  constructor(private opts: CompositeOptions) {}

  async getQuote(symbol: FuturesSymbol): Promise<Quote | null> {
    if (this.opts.mode === 'fixture') return null;
    return dbGetQuote(symbol);
  }

  async getBars(symbol: FuturesSymbol, timeframe: '1m'|'1h'|'4h', count: number): Promise<Bar[]> {
    if (this.opts.mode === 'fixture') {
      const path = this.opts.fixturePath;
      if (!path) throw new Error('fixturePath is required in fixture mode');
      const raw = readFileSync(path, 'utf-8');
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) throw new Error('Fixture must be an array');
      return data.map((b: any) => ({
        timestamp: Number(b.timestamp),
        open: Number(b.open),
        high: Number(b.high),
        low: Number(b.low),
        close: Number(b.close),
        volume: b.volume != null ? Number(b.volume) : undefined,
      }));
    }

    return dbGetRecentBars(symbol, timeframe, count);
  }
}

