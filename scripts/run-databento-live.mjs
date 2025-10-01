#!/usr/bin/env node
import { getRecentBars, getQuote } from '../packages/databento/dist/index.js';
import { extractSessionExtremes, calculateDailyBias, classifyDayProfile, detectSwings } from '../packages/analysis-kit/dist/index.js';

function parseArgs(argv) {
  const out = { symbol: 'ES', timeframe: '1m', count: 390 };
  for (const a of argv) {
    if (a.startsWith('--symbol=')) out.symbol = a.slice(9);
    else if (a.startsWith('--timeframe=')) out.timeframe = a.slice(12);
    else if (a.startsWith('--count=')) out.count = Number(a.slice(8));
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const quote = await getQuote(args.symbol);
  const bars = await getRecentBars(args.symbol, /** @type {any} */(args.timeframe), args.count);

  const end = new Date();
  const start = new Date(end.getTime() - 6 * 3600 * 1000);
  const extremes = extractSessionExtremes(
    bars.map(b => ({ timestamp: b.timestamp, open: b.open, high: b.high, low: b.low, close: b.close })),
    { start, end }
  );
  const bias = extremes ? calculateDailyBias(bars, extremes) : { bias: 'neutral', confidence: 0, reason: 'no extremes' };
  const profile = extremes ? classifyDayProfile(bars, extremes) : { type: 'K', characteristics: ['insufficient data'], volatility: 0 };
  const swings = detectSwings(bars, 5);

  console.log(JSON.stringify({
    provider: 'databento',
    symbol: args.symbol,
    timeframe: args.timeframe,
    quote: { price: quote.price, timestamp: quote.timestamp.toISOString() },
    extremes,
    bias,
    profile,
    swingsCount: swings.length
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });

