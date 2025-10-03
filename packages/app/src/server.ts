import { createServer as httpCreateServer, IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { CompositeProvider } from '@tjr/provider-composite';
import {
  extractSessionExtremes,
  calculateDailyBias,
  classifyDayProfile,
  detectSwings,
} from '@tjr/analysis-kit';

type Mode = 'live' | 'fixture';

interface AppConfig {
  port?: number;
  mode: Mode;
  fixturePath?: string; // required in fixture mode
}

function parseQuery(req: IncomingMessage) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const q = Object.fromEntries(url.searchParams.entries());
  return { pathname: url.pathname, q } as { pathname: string; q: Record<string, string> };
}

function ok(res: ServerResponse, body: unknown) {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function bad(res: ServerResponse, status: number, message: string) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ error: message }));
}

// (fixture file reading handled by provider-composite)

export function createServer(config: AppConfig) {
  const port = config.port ?? Number(process.env['PORT'] || 8080);
  const mode: Mode = config.mode ?? (process.env['DATABENTO_API_KEY'] ? 'live' : 'fixture');

  const cp = new CompositeProvider({ mode, fixturePath: config.fixturePath });
  const server = httpCreateServer(async (req, res) => {
    try {
      const { pathname, q } = parseQuery(req);
      if (pathname === '/health') {
        return ok(res, { status: 'ok', mode, time: new Date().toISOString() });
      }
      if (pathname === '/daily') {
        const symbol = (q['symbol'] || 'ES').toUpperCase();
        const timeframe = (q['timeframe'] || '1m') as '1m' | '1h' | '4h';
        const count = Number(q['count'] || 390);

        const quote = await cp.getQuote(symbol as any);
        const bars = await cp.getBars(symbol as any, timeframe, count);

        const end = new Date();
        const start = new Date(end.getTime() - 6 * 3600 * 1000);
        const extremes = extractSessionExtremes(
          bars.map((b: any) => ({
            timestamp: b.timestamp,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
          })),
          { start, end }
        );
        const bias = extremes
          ? calculateDailyBias(bars as any, extremes)
          : { bias: 'neutral', confidence: 0, reason: 'no extremes' };
        const profile = extremes
          ? classifyDayProfile(bars as any, extremes)
          : { type: 'K', characteristics: ['insufficient data'], volatility: 0 };
        const swings = detectSwings(bars as any, 5);

        return ok(res, {
          symbol,
          timeframe,
          quote: quote ? { price: quote.price, timestamp: quote.timestamp.toISOString() } : null,
          extremes,
          bias,
          profile,
          swingsCount: swings.length,
        });
      }
      bad(res, 404, 'not found');
    } catch (err: any) {
      bad(res, 500, err?.message || 'internal error');
    }
  });

  return {
    listen() {
      server.listen(port, () =>
        console.log(JSON.stringify({ level: 'info', event: 'listening', port, mode }))
      );
    },
    server,
  };
}

if (require.main === module) {
  const mode: Mode =
    (process.env['MODE'] as Mode) || (process.env['DATABENTO_API_KEY'] ? 'live' : 'fixture');
  const fixturePath = process.env['FIXTURE'];
  createServer({ mode, fixturePath }).listen();
}
