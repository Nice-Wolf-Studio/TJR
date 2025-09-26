import {
  GetBarsParams,
  MarketDataProvider,
  ProviderResponse,
  SupportedTimeframe
} from './types';

export interface CompositeProviderOptions {
  providers: MarketDataProvider[];
}

export class CompositeMarketDataProvider implements MarketDataProvider {
  readonly id = 'composite';

  private readonly providers: MarketDataProvider[];

  constructor(options: CompositeProviderOptions) {
    if (!options.providers.length) {
      throw new Error('Composite provider requires at least one underlying provider');
    }

    this.providers = options.providers;
  }

  isTimeframeSupported(timeframe: SupportedTimeframe): boolean {
    return this.providers.some(provider => provider.isTimeframeSupported(timeframe));
  }

  async getBars(params: GetBarsParams): Promise<ProviderResponse> {
    const errors: Array<{ provider: string; error: unknown }> = [];

    for (const provider of this.providers) {
      if (!provider.isTimeframeSupported(params.timeframe)) {
        continue;
      }

      try {
        const response = await provider.getBars(params);

        if (response.bars.length < params.lookback) {
          errors.push({
            provider: provider.id,
            error: new Error(`insufficient bars (${response.bars.length}/${params.lookback})`)
          });
          continue;
        }

        return {
          ...response,
          metadata: {
            ...(response.metadata ?? {}),
            attemptedProviders: errors,
            resolvedBy: provider.id
          }
        };
      } catch (error) {
        errors.push({ provider: provider.id, error });
      }
    }

    const message = errors.length
      ? `All providers failed: ${errors.map(entry => `${entry.provider}: ${this.stringifyError(entry.error)}`).join('; ')}`
      : 'No providers were able to service the request';
    throw new Error(message);
  }

  private stringifyError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return 'unknown error';
    }
  }
}
