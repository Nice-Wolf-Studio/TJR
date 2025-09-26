import { MarketBar } from '../data/providers/types';
import { marketDataService } from '../data/marketData';
import { computeDailyBias, extractPrice } from './bias/daily-bias-v1';
import { buildSessionMap } from './session/sessions';
import { computeDayProfile } from './profile/day-profile-v1';
import { DailyBiasResult, DayProfileResult } from './types';

export interface DailyPlanInputs {
  symbol: string;
  asOf: Date;
}

export interface DailyPlanOutputs {
  bias: DailyBiasResult;
  profile: DayProfileResult;
}

function ensureBarCount(bars: MarketBar[], timeframe: string, lookback: number): void {
  if (bars.length < lookback) {
    throw new Error(`Insufficient ${timeframe} bars returned (${bars.length})`);
  }
}

export async function generateDailyPlan(inputs: DailyPlanInputs): Promise<DailyPlanOutputs> {
  const asOf = inputs.asOf;

  const [bars4H, bars1H, bars10m] = await Promise.all([
    marketDataService.getBars({ symbol: inputs.symbol, timeframe: '4h', asOf, lookback: 120 }),
    marketDataService.getBars({ symbol: inputs.symbol, timeframe: '1h', asOf, lookback: 250 }),
    marketDataService.getBars({ symbol: inputs.symbol, timeframe: '10m', asOf, lookback: 144 })
  ]);

  ensureBarCount(bars4H.bars, '4H', 30);
  ensureBarCount(bars1H.bars, '1H', 50);
  ensureBarCount(bars10m.bars, '10m', 50);

  const latestPrice = extractPrice(bars1H.bars);

  const bias = computeDailyBias({
    symbol: inputs.symbol,
    asOf,
    price: latestPrice,
    bars4H: bars4H.bars,
    bars1H: bars1H.bars
  });

  const sessionMap = buildSessionMap({ bars10m: bars10m.bars, asOf });
  const profile = computeDayProfile({ bias, sessionMap, lastPrice: latestPrice });

  return {
    bias,
    profile
  };
}
