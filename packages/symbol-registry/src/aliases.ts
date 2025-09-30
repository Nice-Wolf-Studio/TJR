/**
 * Symbol aliases for vendor-specific formats
 * Maps vendor symbols to canonical format
 */

import type { CanonicalSymbol } from './types';

/**
 * Vendor symbol prefix mappings
 * Key: vendor prefix pattern, Value: removal flag
 */
const VENDOR_PREFIXES: Record<string, boolean> = {
  '@': true,   // IQFeed: @ES → ES
  '/': true,   // TradingView: /ES → ES
};

/**
 * Vendor symbol suffix mappings
 * Key: vendor suffix pattern, Value: removal flag
 */
const VENDOR_SUFFIXES: Record<string, boolean> = {
  '=F': true,  // Yahoo Finance: ES=F → ES
};

/**
 * Explicit symbol alias mappings
 * For cases where simple prefix/suffix removal isn't enough
 */
const ALIAS_MAP: Record<string, CanonicalSymbol> = {
  // Add explicit mappings as needed
  // 'VENDOR_SYMBOL': 'CANONICAL_SYMBOL',
};

/**
 * Resolve a vendor-specific symbol to its canonical form
 *
 * @param raw - Raw symbol from vendor
 * @returns Canonical symbol or null if unresolvable
 *
 * @example
 * ```typescript
 * resolveAlias('ES=F')   // → 'ES' (Yahoo)
 * resolveAlias('@ES')    // → 'ES' (IQFeed)
 * resolveAlias('/ES')    // → 'ES' (TradingView)
 * resolveAlias('ES')     // → 'ES' (pass-through)
 * ```
 */
export function resolveAlias(raw: string): CanonicalSymbol | null {
  if (!raw || typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  // Check explicit alias map first
  if (trimmed in ALIAS_MAP) {
    const mapped = ALIAS_MAP[trimmed];
    if (mapped !== undefined) {
      return mapped;
    }
  }

  let symbol = trimmed;

  // Remove vendor prefixes
  for (const prefix of Object.keys(VENDOR_PREFIXES)) {
    if (symbol.startsWith(prefix)) {
      symbol = symbol.slice(prefix.length);
      break;
    }
  }

  // Remove vendor suffixes
  for (const suffix of Object.keys(VENDOR_SUFFIXES)) {
    if (symbol.endsWith(suffix)) {
      symbol = symbol.slice(0, -suffix.length);
      break;
    }
  }

  // Return null if symbol became empty
  if (symbol.length > 0) {
    return symbol;
  }
  return null;
}

/**
 * Register a new alias mapping
 *
 * @param vendorSymbol - Vendor-specific symbol
 * @param canonical - Canonical symbol to map to
 *
 * @example
 * ```typescript
 * registerAlias('SPX.XO', 'SPX');
 * ```
 */
export function registerAlias(vendorSymbol: string, canonical: CanonicalSymbol): void {
  if (!vendorSymbol || !canonical) {
    throw new Error('Both vendorSymbol and canonical must be non-empty strings');
  }
  ALIAS_MAP[vendorSymbol.trim()] = canonical.trim();
}

/**
 * Get all registered aliases
 *
 * @returns Copy of the alias map
 */
export function getAllAliases(): Record<string, CanonicalSymbol> {
  return { ...ALIAS_MAP };
}