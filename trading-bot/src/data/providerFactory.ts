import { MarketDataProvider, ProviderFactory } from './providers/types';
import { SYMBOL_REGISTRY } from '../config/markets';
import { DatabentoProvider, DatabentoProviderOptions } from './providers/databento';

function buildSymbolMap(
  selector: (entry: typeof SYMBOL_REGISTRY[keyof typeof SYMBOL_REGISTRY]) => string | undefined
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [key, entry] of Object.entries(SYMBOL_REGISTRY)) {
    const value = selector(entry);
    if (!value) {
      continue;
    }

    map[key] = value;
    map[entry.canonical] = value;
    map[entry.canonical.toUpperCase()] = value;
  }
  return map;
}

function makeDatabentoProvider(): MarketDataProvider | null {
  const apiKey = process.env.DATABENTO_API_KEY;
  if (!apiKey) {
    return null;
  }

  const options: DatabentoProviderOptions = {
    apiKey,
    symbolMap: buildSymbolMap(entry => entry.databento)
  };

  try {
    return new DatabentoProvider(options);
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn('[data] Databento provider unavailable:', error);
    }
    return null;
  }
}

export const defaultProviderFactory: ProviderFactory = () => {
  const databentoProvider = makeDatabentoProvider();

  if (!databentoProvider) {
    throw new Error('Databento provider unavailable: set DATABENTO_API_KEY');
  }

  return databentoProvider;
};

export function createProvider(): MarketDataProvider {
  return defaultProviderFactory();
}
