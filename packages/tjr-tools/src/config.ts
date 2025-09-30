/**
 * @fileoverview TJR analysis configuration types.
 *
 * Defines configuration options for TJR analysis engine including
 * confluence thresholds, risk management parameters, and feature toggles.
 *
 * @module @tjr/tjr-tools/config
 */

/**
 * Configuration for TJR analysis.
 *
 * Controls analysis behavior, confluence thresholds, and risk parameters.
 * All fields are optional with sensible defaults.
 *
 * @example
 * ```typescript
 * const config: TJRConfig = {
 *   confluenceThreshold: 70,
 *   maxRisk: 0.02,
 *   enableFVG: true,
 *   enableOrderBlock: true
 * };
 * ```
 */
export interface TJRConfig {
  /**
   * Minimum confluence score required to generate execution parameters.
   * @default 75
   */
  confluenceThreshold?: number;

  /**
   * Maximum risk per trade as a fraction (e.g., 0.02 = 2%).
   * @default 0.01
   */
  maxRisk?: number;

  /**
   * Default risk-reward ratio if not calculated from levels.
   * @default 2.0
   */
  defaultRiskReward?: number;

  /**
   * Enable Fair Value Gap (FVG) analysis.
   * @default true
   */
  enableFVG?: boolean;

  /**
   * Enable Order Block analysis.
   * @default true
   */
  enableOrderBlock?: boolean;

  /**
   * Enable trend analysis.
   * @default true
   */
  enableTrend?: boolean;

  /**
   * Enable support/resistance level detection.
   * @default true
   */
  enableSupportResistance?: boolean;

  /**
   * Enable volume profile analysis.
   * @default true
   */
  enableVolumeProfile?: boolean;

  /**
   * Minimum number of bars required for analysis.
   * @default 50
   */
  minBarsRequired?: number;

  /**
   * Debug mode for additional logging/information.
   * @default false
   */
  debug?: boolean;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Required<TJRConfig> = {
  confluenceThreshold: 75,
  maxRisk: 0.01,
  defaultRiskReward: 2.0,
  enableFVG: true,
  enableOrderBlock: true,
  enableTrend: true,
  enableSupportResistance: true,
  enableVolumeProfile: true,
  minBarsRequired: 50,
  debug: false
};

/**
 * Merges user config with defaults.
 *
 * @param userConfig - User-provided configuration
 * @returns Complete configuration with defaults
 */
export function mergeConfig(userConfig?: TJRConfig): Required<TJRConfig> {
  return {
    ...DEFAULT_CONFIG,
    ...userConfig
  };
}