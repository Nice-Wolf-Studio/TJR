/**
 * File-based configuration service implementation
 *
 * Provides persistent storage for user configuration in ~/.tjr/config/
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Logger } from '@tjr/logger';
import { DEFAULT_WEIGHTS } from '@tjr/tjr-tools';
import type { ConfigService, UserConfig } from './types.js';
import type { ValidationResult } from '../../reports/types.js';

/**
 * Default user configuration
 *
 * Applied when no user configuration exists or for missing fields.
 */
export const DEFAULT_USER_CONFIG: UserConfig = {
  confluence: {
    weights: DEFAULT_WEIGHTS,
    fvg: {
      minGapSizeATR: 0.5,
      checkFilled: true,
    },
    orderBlock: {
      minVolumeRatio: 1.5,
      minRejection: 0.3,
      checkMitigated: true,
    },
  },
  execution: {
    confirmation5m: {
      minConfluenceScore: 70,
      requiredFactors: ['Fair Value Gaps', 'Order Blocks'],
      lookbackBars: 20,
    },
    entry1m: {
      minConfluenceScore: 60,
      maxBarsAfterConfirmation: 5,
      requireZoneEntry: true,
    },
    risk: {
      maxRiskPerTrade: 0.01,
      defaultStopPercent: 0.015,
      defaultRiskReward: 2.0,
    },
  },
  risk: {
    maxRiskPerTrade: 0.01,
    maxDailyLoss: 0.05,
    accountSize: 100000,
    defaultStopPercent: 0.015,
    defaultRiskReward: 2.0,
    useTrailingStop: true,
    partialExits: {
      enabled: true,
      levels: [
        { percentage: 0.5, atRiskReward: 1.0 },
        { percentage: 0.25, atRiskReward: 2.0 },
      ],
    },
  },
  formatting: {
    defaultFormat: 'text',
    includeMetadata: false,
    verbose: false,
  },
  cache: {
    enabled: true,
    ttl: {
      confluence: 300000, // 5 minutes
      execution: 60000,   // 1 minute
    },
  },
};

/**
 * File-based configuration service
 *
 * Stores user configuration in JSON files at ~/.tjr/config/<userId>.json
 */
export class FileConfigService implements ConfigService {
  private logger: Logger;
  private configDir: string;

  constructor(logger: Logger, configDir?: string) {
    this.logger = logger;
    this.configDir = configDir || join(homedir(), '.tjr', 'config');
  }

  /**
   * Load user configuration from file
   */
  async load(userId: string): Promise<UserConfig> {
    const configPath = this.getConfigPath(userId);

    try {
      // Ensure config directory exists
      await fs.mkdir(this.configDir, { recursive: true });

      // Try to read existing config
      const data = await fs.readFile(configPath, 'utf-8');
      const userConfig = JSON.parse(data);

      // Merge with defaults to ensure all fields exist
      const config = this.mergeWithDefaults(userConfig);

      this.logger.debug('Loaded user configuration', { userId, configPath });

      return config;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Config file doesn't exist, return defaults
        this.logger.info('No config file found, using defaults', { userId });
        return DEFAULT_USER_CONFIG;
      }

      this.logger.warn('Failed to load config, using defaults', { userId, error: error.message });
      return DEFAULT_USER_CONFIG;
    }
  }

  /**
   * Save user configuration to file
   */
  async save(userId: string, config: UserConfig): Promise<void> {
    const configPath = this.getConfigPath(userId);

    try {
      // Ensure config directory exists
      await fs.mkdir(this.configDir, { recursive: true });

      // Write config file
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

      this.logger.info('Saved user configuration', { userId, configPath });
    } catch (error: any) {
      this.logger.error('Failed to save configuration', { userId, error: error.message });
      throw new Error(`Failed to save configuration: ${error.message}`);
    }
  }

  /**
   * Get a specific configuration value by key path
   */
  async get(userId: string, key: string): Promise<any> {
    const config = await this.load(userId);
    return this.getNestedValue(config, key);
  }

  /**
   * Set a specific configuration value by key path
   */
  async set(userId: string, key: string, value: any): Promise<void> {
    const config = await this.load(userId);
    this.setNestedValue(config, key, value);
    await this.save(userId, config);

    this.logger.info('Updated configuration value', { userId, key, value });
  }

  /**
   * Reset configuration to defaults
   */
  async reset(userId: string, key?: string): Promise<void> {
    if (key) {
      // Reset specific key
      const defaultValue = this.getNestedValue(DEFAULT_USER_CONFIG, key);
      await this.set(userId, key, defaultValue);
      this.logger.info('Reset configuration key to default', { userId, key });
    } else {
      // Reset entire config
      await this.save(userId, DEFAULT_USER_CONFIG);
      this.logger.info('Reset entire configuration to defaults', { userId });
    }
  }

  /**
   * Validate configuration structure and values
   */
  validate(config: UserConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate confluence weights sum to 1.0
    const weights = config.confluence.weights;
    const weightSum = weights.fvg + weights.orderBlock + weights.overlap + weights.recency;
    if (Math.abs(weightSum - 1.0) > 0.001) {
      errors.push(`Confluence weights must sum to 1.0 (current: ${weightSum.toFixed(3)})`);
    }

    // Validate weight ranges
    Object.entries(weights).forEach(([key, value]) => {
      const numValue = value as number;
      if (numValue < 0 || numValue > 1) {
        errors.push(`Weight ${key} must be between 0 and 1 (current: ${numValue})`);
      }
    });

    // Validate FVG options
    if (config.confluence.fvg.minGapSizeATR <= 0) {
      errors.push('FVG minGapSizeATR must be positive');
    }

    // Validate Order Block options
    if (config.confluence.orderBlock.minVolumeRatio < 1) {
      warnings.push('Order Block minVolumeRatio below 1.0 may produce many false positives');
    }
    if (config.confluence.orderBlock.minRejection < 0 || config.confluence.orderBlock.minRejection > 1) {
      errors.push('Order Block minRejection must be between 0 and 1');
    }

    // Validate execution thresholds
    if (config.execution.confirmation5m.minConfluenceScore < 0 || config.execution.confirmation5m.minConfluenceScore > 100) {
      errors.push('5m minConfluenceScore must be between 0 and 100');
    }
    if (config.execution.entry1m.minConfluenceScore < 0 || config.execution.entry1m.minConfluenceScore > 100) {
      errors.push('1m minConfluenceScore must be between 0 and 100');
    }

    // Validate risk parameters
    if (config.execution.risk.maxRiskPerTrade <= 0 || config.execution.risk.maxRiskPerTrade > 0.1) {
      warnings.push('maxRiskPerTrade outside typical range (0-10%)');
    }
    if (config.execution.risk.defaultStopPercent <= 0 || config.execution.risk.defaultStopPercent > 0.1) {
      warnings.push('defaultStopPercent outside typical range (0-10%)');
    }
    if (config.execution.risk.defaultRiskReward < 1) {
      warnings.push('defaultRiskReward below 1.0 means taking less profit than risk');
    }

    // Validate cache TTL
    if (config.cache.ttl.confluence < 0) {
      errors.push('Cache TTL values must be non-negative');
    }
    if (config.cache.ttl.execution < 0) {
      errors.push('Cache TTL values must be non-negative');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Get configuration file path for user
   */
  getConfigPath(userId: string): string {
    return join(this.configDir, `${userId}.json`);
  }

  /**
   * Merge user config with defaults to ensure all fields exist
   */
  private mergeWithDefaults(userConfig: Partial<UserConfig>): UserConfig {
    return {
      confluence: {
        weights: { ...DEFAULT_USER_CONFIG.confluence.weights, ...userConfig.confluence?.weights },
        fvg: { ...DEFAULT_USER_CONFIG.confluence.fvg, ...userConfig.confluence?.fvg },
        orderBlock: { ...DEFAULT_USER_CONFIG.confluence.orderBlock, ...userConfig.confluence?.orderBlock },
      },
      execution: {
        confirmation5m: {
          ...DEFAULT_USER_CONFIG.execution.confirmation5m,
          ...userConfig.execution?.confirmation5m,
        },
        entry1m: {
          ...DEFAULT_USER_CONFIG.execution.entry1m,
          ...userConfig.execution?.entry1m,
        },
        risk: {
          ...DEFAULT_USER_CONFIG.execution.risk,
          ...userConfig.execution?.risk,
        },
        dryRun: userConfig.execution?.dryRun,
      },
      risk: userConfig.risk ? { ...DEFAULT_USER_CONFIG.risk, ...userConfig.risk } : DEFAULT_USER_CONFIG.risk,
      formatting: { ...DEFAULT_USER_CONFIG.formatting, ...userConfig.formatting },
      cache: {
        ...DEFAULT_USER_CONFIG.cache,
        ...userConfig.cache,
        ttl: {
          ...DEFAULT_USER_CONFIG.cache.ttl,
          ...userConfig.cache?.ttl,
        },
      },
    };
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Set nested value in object using dot notation
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      if (!(key in current)) {
        current[key] = {};
      }
      return current[key];
    }, obj);
    target[lastKey] = value;
  }
}