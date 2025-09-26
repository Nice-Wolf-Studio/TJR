export interface SymbolMapping {
  canonical: string;
  alphaVantage: string;
  yahooFinance: string;
  polygon: string;
  databento?: string;
}

export const SYMBOL_REGISTRY: Record<string, SymbolMapping> = {
  ES: {
    canonical: 'ES1!',
    alphaVantage: 'SPY',
    yahooFinance: 'ES=F',
    polygon: 'C:ES',
    databento: 'ES.c.0'
  },
  'ES=F': {
    canonical: 'ES1!',
    alphaVantage: 'SPY',
    yahooFinance: 'ES=F',
    polygon: 'C:ES',
    databento: 'ES.c.0'
  },
  NQ: {
    canonical: 'NQ1!',
    alphaVantage: 'QQQ',
    yahooFinance: 'NQ=F',
    polygon: 'C:NQ',
    databento: 'NQ.c.0'
  },
  'NQ=F': {
    canonical: 'NQ1!',
    alphaVantage: 'QQQ',
    yahooFinance: 'NQ=F',
    polygon: 'C:NQ',
    databento: 'NQ.c.0'
  },
  EQ: {
    canonical: 'NQ1!',
    alphaVantage: 'QQQ',
    yahooFinance: 'NQ=F',
    polygon: 'C:NQ'
  }
};

export function resolveSymbol(symbol: string): SymbolMapping | undefined {
  const upper = symbol.toUpperCase();
  return (
    SYMBOL_REGISTRY[upper] ||
    Object.values(SYMBOL_REGISTRY).find(entry => entry.canonical.toUpperCase() === upper)
  );
}
