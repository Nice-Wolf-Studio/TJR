export type FuturesSymbol = 'ES' | 'NQ';

export interface BarData {
  symbol: FuturesSymbol;
  timestamp: number; // ms epoch
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

const DATABENTO_BASE = 'https://hist.databento.com';

const SYMBOL_MAP: Record<FuturesSymbol, string> = {
  ES: 'ES.c.0',
  NQ: 'NQ.c.0',
};

function requireKey(): string {
  const key = process.env['DATABENTO_API_KEY'] || '';
  if (!key || !key.startsWith('db-')) {
    throw new Error('DATABENTO_API_KEY must be set and start with "db-"');
  }
  return key;
}

function toAuthHeader(key: string): string {
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

async function httpGetCsv(endpoint: string, params: Record<string, string | number | undefined>, timeoutMs = 15000): Promise<string> {
  const key = requireKey();
  const url = new URL(endpoint, DATABENTO_BASE);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.append(k, String(v));
  });
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': toAuthHeader(key),
      'Accept': 'text/csv',
      'User-Agent': 'tjr-suite/0.0.1',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Databento HTTP ${res.status}: ${res.statusText}`);
  return await res.text();
}

function parseCsv(csv: string): string[][] {
  const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) { // skip header
    const line = lines[i];
    if (!line) continue;
    rows.push(line.split(','));
  }
  return rows;
}

function price(p: string): number {
  const v = parseFloat(p);
  return Number.isFinite(v) ? v / 1e9 : NaN;
}

function nsToMs(n: string): number {
  const v = parseInt(n, 10);
  return Math.floor(v / 1_000_000);
}

export async function getQuote(symbol: FuturesSymbol): Promise<{ price: number; timestamp: Date }> {
  const dbSymbol = SYMBOL_MAP[symbol];
  // Use mbp-1 and a 7-day range to ensure data on weekends/holidays
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 3600 * 1000);
  const csv = await httpGetCsv('/v0/timeseries.get_range', {
    dataset: 'GLBX.MDP3',
    symbols: dbSymbol,
    stype_in: 'continuous',
    stype_out: 'instrument_id',
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    schema: 'mbp-1',
    limit: 200,
  });
  const rows = parseCsv(csv);
  if (rows.length === 0) throw new Error(`No quote rows for ${symbol}`);
  const last = rows[rows.length - 1];
  if (!last || last.length < 15) throw new Error('Unexpected quote CSV format');
  const bidPx = price(last[13] ?? 'NaN');
  const askPx = price(last[14] ?? 'NaN');
  const ts = nsToMs(last[1] ?? '0');
  return { price: (bidPx + askPx) / 2, timestamp: new Date(ts) };
}

export async function getRecentBars(symbol: FuturesSymbol, timeframe: '1m' | '1h' | '4h', count: number): Promise<BarData[]> {
  const dbSymbol = SYMBOL_MAP[symbol];
  // Pull enough history by days heuristic
  const end = new Date();
  const daysBack = timeframe === '1h' ? Math.max(count, 7) : timeframe === '4h' ? Math.max(count * 2, 14) : Math.max(count * 2, 30);
  const start = new Date(end.getTime() - daysBack * 24 * 3600 * 1000);
  const schema = timeframe === '1m' ? 'ohlcv-1m' : 'ohlcv-1h';
  const csv = await httpGetCsv('/v0/timeseries.get_range', {
    dataset: 'GLBX.MDP3',
    symbols: dbSymbol,
    stype_in: 'continuous',
    stype_out: 'instrument_id',
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    schema,
    limit: 2000,
  });
  const rows = parseCsv(csv);
  const bars: BarData[] = rows
    .filter((r) => Array.isArray(r) && r.length >= 9)
    .map((r) => ({
      symbol,
      timestamp: nsToMs(r[0] ?? '0'),
      open: price(r[4] ?? 'NaN'),
      high: price(r[5] ?? 'NaN'),
      low: price(r[6] ?? 'NaN'),
      close: price(r[7] ?? 'NaN'),
      volume: Number.parseInt(r[8] || '0', 10) || 0,
    }))
    .filter((b) => Number.isFinite(b.open) && Number.isFinite(b.close));
  if (timeframe === '4h') return resampleToH4(bars);
  return bars.slice(-count);
}

export function resampleToH4(hourly: BarData[]): BarData[] {
  const out: BarData[] = [];
  for (let i = 0; i < hourly.length; i += 4) {
    const chunk = hourly.slice(i, i + 4);
    if (chunk.length === 0) continue;
    const first = chunk[0]!;
    const last = chunk[chunk.length - 1]!;
    out.push({
      symbol: first.symbol,
      timestamp: first.timestamp,
      open: first.open,
      high: Math.max(...chunk.map(b => b.high)),
      low: Math.min(...chunk.map(b => b.low)),
      close: last.close,
      volume: chunk.reduce((s, b) => s + (b.volume || 0), 0),
    });
  }
  return out;
}
