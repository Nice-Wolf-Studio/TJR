/**
 * Fixture data loader for testing
 */

import type { MarketBar } from '@tjr/contracts';

/**
 * Seeded random number generator for deterministic fixtures
 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return function() {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/**
 * Generate fixture bars for testing
 */
export function generateFixtureBars(config: {
  symbol: string;
  date: Date;
  timeframe: string;
  count: number;
}): MarketBar[] {
  const bars: MarketBar[] = [];
  const { symbol, date, count } = config;

  // Set to market open
  const startTime = new Date(date);
  startTime.setHours(9, 30, 0, 0);

  // Generate bars with realistic price action
  let basePrice = symbol === 'SPY' ? 450 : symbol === 'QQQ' ? 380 : 200;
  const volatility = 0.002; // 0.2% volatility per bar

  for (let i = 0; i < count; i++) {
    const time = new Date(startTime.getTime() + i * 5 * 60000); // 5-minute bars

    // Generate OHLC with realistic patterns
    const drift = Math.sin(i / 10) * basePrice * 0.01; // 1% oscillation
    const noise = (Math.random() - 0.5) * basePrice * volatility;

    const open = basePrice + drift + noise;
    const close = open + (Math.random() - 0.5) * basePrice * volatility * 2;
    const high = Math.max(open, close) + Math.random() * basePrice * volatility;
    const low = Math.min(open, close) - Math.random() * basePrice * volatility;
    const vol = Math.floor(1000000 + Math.random() * 500000);

    bars.push({
      timestamp: time.toISOString(),
      symbol,
      time: time.toISOString(),
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: vol,
      trades: Math.floor(vol / 100),
      vwap: parseFloat(((open + high + low + close) / 4).toFixed(2))
    } as any);

    basePrice = close; // Continue from close price
  }

  return bars;
}

/**
 * Generate session-aware fixture bars
 */
export function generateSessionBars(config: {
  symbol: string;
  date: Date;
}): MarketBar[] {
  const bars: MarketBar[] = [];
  const { symbol, date } = config;

  // Define session characteristics
  const sessions = [
    { start: '09:30', end: '10:30', trend: 'up', volatility: 'high' },    // Open
    { start: '10:30', end: '11:30', trend: 'consolidate', volatility: 'medium' }, // Mid-morning
    { start: '11:30', end: '13:00', trend: 'down', volatility: 'low' },   // Lunch
    { start: '13:00', end: '15:00', trend: 'up', volatility: 'medium' },  // Afternoon
    { start: '15:00', end: '16:00', trend: 'consolidate', volatility: 'high' }  // Close
  ];

  let basePrice = symbol === 'SPY' ? 450 : symbol === 'QQQ' ? 380 : 200;

  for (const session of sessions) {
    const [startHour, startMin] = session.start.split(':').map(Number);
    const [endHour, endMin] = session.end.split(':').map(Number);

    const sessionStart = new Date(date);
    sessionStart.setHours(startHour ?? 0, startMin ?? 0, 0, 0);

    const sessionEnd = new Date(date);
    sessionEnd.setHours(endHour ?? 0, endMin ?? 0, 0, 0);

    const barsInSession = Math.floor((sessionEnd.getTime() - sessionStart.getTime()) / (5 * 60000));

    for (let i = 0; i < barsInSession; i++) {
      const time = new Date(sessionStart.getTime() + i * 5 * 60000);

      // Apply session characteristics
      let drift = 0;
      if (session.trend === 'up') {
        drift = basePrice * 0.001 * (i / barsInSession); // Gradual up
      } else if (session.trend === 'down') {
        drift = -basePrice * 0.001 * (i / barsInSession); // Gradual down
      }

      const volatilityMultiplier =
        session.volatility === 'high' ? 0.003 :
        session.volatility === 'medium' ? 0.002 : 0.001;

      const noise = (Math.random() - 0.5) * basePrice * volatilityMultiplier;

      const open = basePrice;
      const close = open + drift + noise;
      const high = Math.max(open, close) + Math.random() * basePrice * volatilityMultiplier;
      const low = Math.min(open, close) - Math.random() * basePrice * volatilityMultiplier;
      const vol = Math.floor(1000000 + Math.random() * 500000);

      bars.push({
        timestamp: time.toISOString(),
        symbol,
        time: time.toISOString(),
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: vol,
        trades: Math.floor(vol / 100),
        vwap: parseFloat(((open + high + low + close) / 4).toFixed(2))
      } as any);

      basePrice = close;
    }
  }

  return bars;
}

/**
 * Generate trend day fixture
 */
export function generateTrendDay(config: {
  symbol: string;
  date: Date;
  direction: 'up' | 'down';
}): MarketBar[] {
  const bars: MarketBar[] = [];
  const { symbol, date, direction } = config;

  const startTime = new Date(date);
  startTime.setHours(9, 30, 0, 0);

  // Create deterministic seed from symbol and date
  const seed = symbol.charCodeAt(0) + date.getTime() / 1000;
  const rand = seededRandom(seed);

  let basePrice = symbol === 'SPY' ? 450 : 380;
  const trendStrength = direction === 'up' ? 0.0002 : -0.0002; // 0.02% per bar

  for (let i = 0; i < 78; i++) { // Full trading day
    const time = new Date(startTime.getTime() + i * 5 * 60000);

    // Strong trend with small pullbacks
    const trend = basePrice * trendStrength * i;
    const pullback = Math.sin(i / 5) * basePrice * 0.001; // Small pullbacks
    const noise = (rand() - 0.5) * basePrice * 0.001;

    const open = basePrice + trend + pullback;
    const close = open + trend + noise;
    const high = Math.max(open, close) + Math.abs(noise);
    const low = Math.min(open, close) - Math.abs(noise) * 0.5;
    const vol = Math.floor(1500000 + i * 10000); // Increasing volume

    bars.push({
      timestamp: time.toISOString(),
      symbol,
      time: time.toISOString(),
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: vol,
      trades: Math.floor(vol / 100),
      vwap: parseFloat(((open + high + low + close) / 4).toFixed(2))
    } as any);

    basePrice = close;
  }

  return bars;
}

/**
 * Load fixture data for a symbol and date
 */
export function loadFixtures(symbol: string, date: Date): MarketBar[] {
  // For deterministic testing, generate based on symbol and date seed
  const seed = `${symbol}-${date.toISOString().split('T')[0]}`;

  // Use different patterns based on seed
  if (seed.includes('2025-09-29')) {
    return generateTrendDay({ symbol, date, direction: 'up' });
  } else if (seed.includes('2025-09-28')) {
    return generateTrendDay({ symbol, date, direction: 'down' });
  } else {
    return generateSessionBars({ symbol, date });
  }
}