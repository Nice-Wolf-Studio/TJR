/**
 * @fileoverview Default confluence weights.
 * @module @tjr/tjr-tools/scoring/weights
 */

import type { ConfluenceWeights } from '../types.js';

/**
 * Default weights for confluence scoring.
 */
export const DEFAULT_WEIGHTS: ConfluenceWeights = {
  fvg: 0.4,
  orderBlock: 0.3,
  overlap: 0.2,
  recency: 0.1,
};