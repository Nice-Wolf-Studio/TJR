/**
 * Configuration loading and management
 */

import { configSchema, envMapping, type Config } from './schema.js';
import type { Logger } from '@tjr/logger';

/**
 * Load configuration from environment and defaults
 */
export function loadConfig(logger?: Logger): Config {
  const rawConfig: any = {};

  // Load from environment variables
  for (const [envKey, configPath] of Object.entries(envMapping)) {
    const value = process.env[envKey];
    if (value !== undefined) {
      setNestedProperty(rawConfig, configPath, parseEnvValue(value));
    }
  }

  // Parse and validate
  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  if (logger) {
    logger.info('Configuration loaded', {
      env: result.data.app.env,
      dryRun: result.data.app.dryRun,
      provider: result.data.provider.type,
      cache: result.data.cache.type,
      database: result.data.database.type
    });
  }

  return result.data;
}

/**
 * Set nested property in object
 */
function setNestedProperty(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!key) continue;
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  if (lastKey) {
    current[lastKey] = value;
  }
}

/**
 * Parse environment variable value to appropriate type
 */
function parseEnvValue(value: string): any {
  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Number
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;

  // String
  return value;
}

/**
 * Get configuration summary for logging
 */
export function getConfigSummary(config: Config): Record<string, any> {
  return {
    environment: config.app.env,
    dryRun: config.app.dryRun,
    verbose: config.app.verbose,
    services: {
      discord: config.discord.enabled ? 'enabled' : 'disabled',
      provider: config.provider.type,
      cache: config.cache.type,
      database: config.database.type
    },
    logging: {
      level: config.logging.level,
      format: config.logging.format,
      output: config.logging.output
    }
  };
}

// Re-export types
export type { Config } from './schema.js';