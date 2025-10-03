/**
 * TJR Commands Registration
 *
 * Registers all TJR commands with the command registry:
 * - /tjr-setup: Configuration management
 * - /tjr-confluences: Confluence analysis
 * - /tjr-execution: Execution recommendations
 */

import type { Logger } from '@tjr/logger';
import type { CommandRegistry } from './types.js';
import type { ProviderService } from '../services/providers/types.js';
import type { CacheService } from '../services/cache/types.js';
import type { ConfigService } from '../services/config/types.js';
import { TJRSetupCommand } from './tjr-setup.command.js';
import { TJRConfluencesCommand } from './tjr-confluences.command.js';
import { TJRExecutionCommand } from './tjr-execution.command.js';

/**
 * Configuration for TJR command registration
 */
export interface RegisterTJRCommandsConfig {
  /** Command registry to register commands with */
  registry: CommandRegistry;
  /** Provider service for market data */
  providerService: ProviderService;
  /** Configuration service for user preferences */
  configService: ConfigService;
  /** Logger instance */
  logger: Logger;
  /** Optional cache service */
  cacheService?: CacheService;
  /** User ID for configuration (default: 'default') */
  userId?: string;
}

/**
 * Register all TJR commands with the command registry
 *
 * Creates and registers:
 * - TJRSetupCommand: Configuration management
 * - TJRConfluencesCommand: Confluence analysis
 * - TJRExecutionCommand: Execution recommendations
 *
 * Prevents duplicate registration by checking if commands already exist.
 *
 * @param config - Registration configuration
 */
export function registerTJRCommands(config: RegisterTJRCommandsConfig): void {
  const {
    registry,
    providerService,
    configService,
    cacheService,
    logger,
    userId = 'default',
  } = config;

  logger.info('Registering TJR commands', {
    userId,
    hasCache: !!cacheService,
  });

  // Shared command configuration
  const commandConfig = {
    providerService,
    configService,
    cacheService,
    logger,
    userId,
  };

  // Register TJR Setup Command
  const setupCommand = new TJRSetupCommand(commandConfig);
  if (!registry.get(setupCommand.name)) {
    registry.register(setupCommand);
    logger.info('Registered TJR Setup command', {
      name: setupCommand.name,
      aliases: setupCommand.aliases,
    });
  } else {
    logger.debug('TJR Setup command already registered', {
      name: setupCommand.name,
    });
  }

  // Register TJR Confluences Command
  const confluencesCommand = new TJRConfluencesCommand(commandConfig);
  if (!registry.get(confluencesCommand.name)) {
    registry.register(confluencesCommand);
    logger.info('Registered TJR Confluences command', {
      name: confluencesCommand.name,
      aliases: confluencesCommand.aliases,
    });
  } else {
    logger.debug('TJR Confluences command already registered', {
      name: confluencesCommand.name,
    });
  }

  // Register TJR Execution Command
  const executionCommand = new TJRExecutionCommand(commandConfig);
  if (!registry.get(executionCommand.name)) {
    registry.register(executionCommand);
    logger.info('Registered TJR Execution command', {
      name: executionCommand.name,
      aliases: executionCommand.aliases,
    });
  } else {
    logger.debug('TJR Execution command already registered', {
      name: executionCommand.name,
    });
  }

  logger.info('TJR commands registration complete', {
    commandsRegistered: [setupCommand.name, confluencesCommand.name, executionCommand.name],
  });
}

/**
 * Get list of registered TJR command names
 */
export function getTJRCommandNames(): string[] {
  return ['tjr-setup', 'tjr-confluences', 'tjr-execution'];
}

/**
 * Check if a command is a TJR command
 */
export function isTJRCommand(commandName: string): boolean {
  return getTJRCommandNames().includes(commandName);
}
