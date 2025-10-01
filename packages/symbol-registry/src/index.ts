/**
 * @tjr/symbol-registry
 *
 * Canonical symbol registry with continuous futures mapping and rollover rules
 *
 * @example
 * ```typescript
 * import { normalizeSymbol, resolveContinuous, resolveAlias } from '@tjr/symbol-registry';
 *
 * // Normalize vendor-specific symbols
 * const normalized = normalizeSymbol('ES=F');
 * console.log(normalized.canonical); // → 'ES'
 *
 * // Resolve continuous futures to specific contracts
 * const contract = resolveContinuous('ES', new Date('2025-01-15'));
 * console.log(contract); // → 'ESH25'
 *
 * // Handle vendor aliases
 * const canonical = resolveAlias('@ES');
 * console.log(canonical); // → 'ES'
 * ```
 */

// Export types
export type {
  CanonicalSymbol,
  ContractCode,
  FuturesRoot,
  RolloverType,
  ExpirationDay,
  RolloverRule,
  RolloverRules,
  NormalizedSymbol,
} from './types';

// Export normalization functions
export {
  normalizeSymbol,
  extractFuturesRoot,
  isValidContractMonth,
  registerFuturesRoot,
  getKnownFuturesRoots,
} from './normalize';

// Export continuous futures resolution
export {
  resolveContinuous,
  getFrontMonth,
  clearRolloverRulesCache,
} from './continuous';

// Export alias functions
export {
  resolveAlias,
  registerAlias,
  getAllAliases,
} from './aliases';
