/**
 * TJR Setup Command
 *
 * Handles configuration management for TJR commands:
 * - Display current configuration
 * - Set confluence weights, thresholds, and risk parameters
 * - Validate configuration
 * - Reset to defaults
 */

import type { CommandOptions } from './types.js';
import type { UserConfig } from '../services/config/types.js';
import type { SetupReport, OutputFormat } from '../reports/types.js';
import { BaseTJRCommand, type BaseTJRCommandConfig } from './base-tjr.command.js';
import { SetupFormatter } from '../formatters/setup-formatter.js';
import { TJRCommandError, TJRErrorCode } from './errors.js';

/**
 * Parsed arguments for tjr-setup command
 */
interface SetupArgs {
  /** Command action: 'show', 'set', 'reset', 'validate' */
  action: 'show' | 'set' | 'reset' | 'validate';
  /** Configuration key (for 'set' and 'reset' actions) */
  key?: string;
  /** Configuration value (for 'set' action) */
  value?: any;
}

/**
 * /tjr-setup command - Configuration management for TJR commands
 *
 * Usage:
 *   tjr-setup show                           - Display current configuration
 *   tjr-setup set <key> <value>              - Set configuration value
 *   tjr-setup reset [key]                    - Reset configuration (all or specific key)
 *   tjr-setup validate                       - Validate current configuration
 *
 * Examples:
 *   tjr-setup show
 *   tjr-setup set confluence.weights.fvg 0.5
 *   tjr-setup set execution.confirmation5m.minConfluenceScore 75
 *   tjr-setup reset confluence.weights
 *   tjr-setup validate
 *
 * Options:
 *   --format <text|json|table|markdown>  - Output format (default: text)
 *   --verbose                            - Include detailed information
 */
export class TJRSetupCommand extends BaseTJRCommand {
  readonly name = 'tjr-setup';
  readonly description = 'Configure TJR analysis parameters and preferences';
  readonly aliases = ['tjr-config', 'setup'];

  private formatter: SetupFormatter;

  constructor(config: BaseTJRCommandConfig) {
    super(config);
    this.formatter = new SetupFormatter();
  }

  /**
   * Parse and validate command arguments
   */
  protected async parseArgs(args: string[], _options: CommandOptions): Promise<SetupArgs> {
    // Default action is 'show'
    if (args.length === 0) {
      return { action: 'show' };
    }

    const action = args[0]?.toLowerCase();

    // Validate action
    if (!['show', 'set', 'reset', 'validate'].includes(action || '')) {
      throw new TJRCommandError(
        TJRErrorCode.INVALID_ARGS,
        `Invalid action: ${action}. Must be one of: show, set, reset, validate`,
        { action }
      );
    }

    // Handle 'show' and 'validate' actions (no additional args)
    if (action === 'show' || action === 'validate') {
      return { action: action as 'show' | 'validate' };
    }

    // Handle 'reset' action (optional key)
    if (action === 'reset') {
      return {
        action: 'reset',
        key: args[1] || undefined,
      };
    }

    // Handle 'set' action (requires key and value)
    if (action === 'set') {
      const key = args[1];
      const valueStr = args[2];

      if (!key) {
        throw new TJRCommandError(
          TJRErrorCode.INVALID_ARGS,
          'Missing configuration key for set command',
          { action }
        );
      }

      if (!valueStr) {
        throw new TJRCommandError(
          TJRErrorCode.INVALID_ARGS,
          'Missing configuration value for set command',
          { action, key }
        );
      }

      // Parse value (try JSON first, then raw string)
      let value: any;
      try {
        value = JSON.parse(valueStr);
      } catch {
        // If JSON parsing fails, treat as string
        value = valueStr;
      }

      return {
        action: 'set',
        key,
        value,
      };
    }

    // Should never reach here
    throw new TJRCommandError(TJRErrorCode.INVALID_ARGS, `Unhandled action: ${action}`);
  }

  /**
   * Execute the setup command
   */
  protected async executeCommand(
    parsedArgs: SetupArgs,
    options: CommandOptions,
    userConfig: UserConfig
  ): Promise<{ output: any; metadata?: Record<string, any> }> {
    const { action, key, value } = parsedArgs;

    // Get output format from options or user config
    const format = (options.format as OutputFormat) || userConfig.formatting.defaultFormat;

    switch (action) {
      case 'show':
        return this.handleShow(userConfig, format);

      case 'set':
        return this.handleSet(key!, value, userConfig, format);

      case 'reset':
        return this.handleReset(key, userConfig, format);

      case 'validate':
        return this.handleValidate(userConfig, format);

      default:
        throw new TJRCommandError(TJRErrorCode.INTERNAL_ERROR, `Unhandled action: ${action}`);
    }
  }

  /**
   * Handle 'show' action - Display current configuration
   */
  private async handleShow(
    _userConfig: UserConfig,
    format: OutputFormat
  ): Promise<{ output: any; metadata?: Record<string, any> }> {
    const userConfig = _userConfig;
    const report = await this.buildSetupReport(userConfig);
    const output = this.formatter.format(report, format);

    return {
      output,
      metadata: {
        action: 'show',
        configPath: this.configService.getConfigPath(this.userId),
      },
    };
  }

  /**
   * Handle 'set' action - Update configuration value
   */
  private async handleSet(
    key: string,
    value: any,
    _userConfig: UserConfig,
    format: OutputFormat
  ): Promise<{ output: any; metadata?: Record<string, any> }> {
    // Set the value
    await this.configService.set(this.userId, key, value);

    // Reload config to verify
    const updatedConfig = await this.configService.load(this.userId);

    // Validate updated config
    const validation = this.configService.validate(updatedConfig);

    if (!validation.valid) {
      this.logger.warn('Configuration validation failed after set', {
        key,
        value,
        errors: validation.errors,
      });
    }

    // Build report
    const report = await this.buildSetupReport(updatedConfig);

    // Add success message to output
    let output = `Configuration updated: ${key} = ${JSON.stringify(value)}\n\n`;
    output += this.formatter.format(report, format);

    return {
      output,
      metadata: {
        action: 'set',
        key,
        value,
        validation,
      },
    };
  }

  /**
   * Handle 'reset' action - Reset configuration to defaults
   */
  private async handleReset(
    key: string | undefined,
    _userConfig: UserConfig,
    format: OutputFormat
  ): Promise<{ output: any; metadata?: Record<string, any> }> {
    // Reset configuration
    await this.configService.reset(this.userId, key);

    // Reload config
    const updatedConfig = await this.configService.load(this.userId);

    // Build report
    const report = await this.buildSetupReport(updatedConfig);

    // Add success message to output
    let output = key ? `Configuration reset: ${key}\n\n` : `Configuration reset to defaults\n\n`;
    output += this.formatter.format(report, format);

    return {
      output,
      metadata: {
        action: 'reset',
        key,
      },
    };
  }

  /**
   * Handle 'validate' action - Validate current configuration
   */
  private async handleValidate(
    userConfig: UserConfig,
    format: OutputFormat
  ): Promise<{ output: any; metadata?: Record<string, any> }> {
    const validation = this.configService.validate(userConfig);

    const report = await this.buildSetupReport(userConfig);

    let output = '';
    if (validation.valid) {
      output = 'Configuration is valid.\n\n';
    } else {
      output = 'Configuration validation failed.\n\n';
    }

    output += this.formatter.format(report, format);

    return {
      output,
      metadata: {
        action: 'validate',
        validation,
      },
    };
  }

  /**
   * Build setup report from user configuration
   */
  private async buildSetupReport(userConfig: UserConfig): Promise<SetupReport> {
    const validation = this.configService.validate(userConfig);

    return {
      confluence: {
        weights: userConfig.confluence.weights,
        fvg: {
          minGapSizeATR: userConfig.confluence.fvg.minGapSizeATR ?? 0,
          checkFilled: userConfig.confluence.fvg.checkFilled ?? true,
        },
        orderBlock: {
          minVolumeRatio: userConfig.confluence.orderBlock.minVolumeRatio ?? 0,
          minRejection: userConfig.confluence.orderBlock.minRejection ?? 0,
          checkMitigated: userConfig.confluence.orderBlock.checkMitigated ?? true,
        },
      },
      execution: userConfig.execution,
      risk: userConfig.risk,
      formatting: userConfig.formatting,
      cache: userConfig.cache,
      validation,
      timestamp: new Date().toISOString(),
      metadata: {
        configPath: this.configService.getConfigPath(this.userId),
      },
    };
  }
}
