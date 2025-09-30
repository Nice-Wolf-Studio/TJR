/**
 * Configuration service types for TJR commands
 *
 * Defines user configuration structure and service interfaces for
 * loading, saving, and validating configuration.
 */

import type { ConfluenceWeights, ExecutionConfig, FVGOptions, OrderBlockOptions, RiskConfig } from '@tjr/tjr-tools';
import type { OutputFormat, ValidationResult } from '../../reports/types.js';

/**
 * User configuration for TJR commands
 *
 * Persisted to ~/.tjr/config/<userId>.json
 */
export interface UserConfig {
  /** Confluence detection configuration */
  confluence: {
    /** Weights for confluence scoring factors */
    weights: ConfluenceWeights;
    /** FVG detection options */
    fvg: FVGOptions;
    /** Order Block detection options */
    orderBlock: OrderBlockOptions;
  };

  /** Execution trigger configuration */
  execution: ExecutionConfig;

  /** Risk management configuration (optional) */
  risk?: RiskConfig;

  /** Output formatting preferences */
  formatting: {
    /** Default output format for commands */
    defaultFormat: OutputFormat;
    /** Include metadata in output */
    includeMetadata: boolean;
    /** Enable verbose output */
    verbose: boolean;
  };

  /** Cache configuration */
  cache: {
    /** Enable caching */
    enabled: boolean;
    /** TTL values in milliseconds */
    ttl: {
      /** Confluence analysis cache TTL */
      confluence: number;
      /** Execution analysis cache TTL */
      execution: number;
    };
  };
}

/**
 * Parameters for configuration operations
 */
export interface ConfigParams {
  /** Configuration key path (e.g., 'confluence.weights.fvg') */
  key: string;
  /** Value to set (for set operations) */
  value?: any;
  /** Reset to defaults */
  reset?: boolean;
  /** Validate after operation */
  validate?: boolean;
}

/**
 * Configuration service interface
 *
 * Provides methods for loading, saving, and validating user configuration.
 */
export interface ConfigService {
  /**
   * Load user configuration from storage
   *
   * @param userId - User identifier
   * @returns User configuration with defaults applied
   */
  load(userId: string): Promise<UserConfig>;

  /**
   * Save user configuration to storage
   *
   * @param userId - User identifier
   * @param config - Configuration to save
   */
  save(userId: string, config: UserConfig): Promise<void>;

  /**
   * Get a specific configuration value
   *
   * @param userId - User identifier
   * @param key - Configuration key path (e.g., 'confluence.weights.fvg')
   * @returns Configuration value
   */
  get(userId: string, key: string): Promise<any>;

  /**
   * Set a specific configuration value
   *
   * @param userId - User identifier
   * @param key - Configuration key path
   * @param value - Value to set
   */
  set(userId: string, key: string, value: any): Promise<void>;

  /**
   * Reset configuration to defaults
   *
   * @param userId - User identifier
   * @param key - Optional key to reset (resets all if not specified)
   */
  reset(userId: string, key?: string): Promise<void>;

  /**
   * Validate configuration
   *
   * @param config - Configuration to validate
   * @returns Validation result with errors and warnings
   */
  validate(config: UserConfig): ValidationResult;

  /**
   * Get configuration file path
   *
   * @param userId - User identifier
   * @returns Path to configuration file
   */
  getConfigPath(userId: string): string;
}