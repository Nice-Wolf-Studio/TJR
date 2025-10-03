/**
 * @tjr/analysis-kit
 *
 * Pure-function analytics for market structure, bias, sessions, and profiles
 *
 * This package provides deterministic analytics functions with no I/O operations.
 * All functions are pure: same inputs always produce same outputs.
 *
 * @packageDocumentation
 */

// Export types
export type {
  Bar,
  TimeWindow,
  SwingPoint,
  SwingType,
  Bias,
  BiasResult,
  SessionExtremes,
  ProfileType,
  DayProfile,
} from './types.js';

// Export structure analysis
export { detectSwings } from './structure.js';

// Export bias analysis
export { calculateDailyBias } from './bias/daily-bias-v1.js';

// Export session analysis
export { extractSessionExtremes } from './session/sessions.js';

// Export profile analysis
export { classifyDayProfile } from './profile/day-profile-v1.js';
