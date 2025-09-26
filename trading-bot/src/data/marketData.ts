import { createProvider } from './providerFactory';
import {
  GetBarsParams,
  MarketBar,
  ProviderResponse,
  SupportedTimeframe
} from './providers/types';
import { resolveSymbol } from '../config/markets';

export interface MarketDataRequest {
  symbol: string;
  timeframe: SupportedTimeframe;
  asOf: Date;
  lookback: number;
}

export interface MarketDataResult extends ProviderResponse {
  canonicalSymbol: string;
}

export class MarketDataService {
  private readonly provider = createProvider();

  async getBars(request: MarketDataRequest): Promise<MarketDataResult> {
    const mapping = resolveSymbol(request.symbol);
    const canonicalSymbol = mapping?.canonical ?? request.symbol;

    const params: GetBarsParams = {
      symbol: canonicalSymbol,
      timeframe: request.timeframe,
      asOf: request.asOf,
      lookback: request.lookback
    };

    const response = await this.provider.getBars(params);

    return {
      ...response,
      canonicalSymbol,
      bars: this.normalizeBars(response.bars)
    };
  }

  private normalizeBars(bars: MarketBar[]): MarketBar[] {
    return bars.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
}

export const marketDataService = new MarketDataService();
