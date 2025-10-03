/**
 * Health check command implementation
 */

import type { Command, CommandOptions, CommandResult } from './types.js';
import type { IContainer } from '../container/types.js';
import type { Logger } from '@tjr/logger';

export interface HealthCommandConfig {
  container: IContainer;
  logger: Logger;
}

/**
 * /health command - checks health of all services
 */
export class HealthCommand implements Command {
  name = 'health';
  description = 'Check health status of all services';
  aliases = ['status', 'check'];

  private container: IContainer;
  private logger: Logger;

  constructor(config: HealthCommandConfig) {
    this.container = config.container;
    this.logger = config.logger;
  }

  async execute(args: string[], options: CommandOptions): Promise<CommandResult> {
    const startTime = Date.now();

    try {
      this.logger.info('Executing health command', { args, options });

      // Get health status from all services
      const healthChecks = await this.container.healthCheckAll();

      // Build response
      const services: any[] = [];
      let allHealthy = true;

      for (const [name, status] of healthChecks) {
        services.push({
          name,
          healthy: status.healthy,
          message: status.message,
          details: status.details,
          lastCheck: status.lastCheck,
        });

        if (!status.healthy) {
          allHealthy = false;
        }
      }

      // Get wiring graph if verbose
      let wiringGraph: string | undefined;
      if (options.verbose) {
        wiringGraph = this.container.getWiringGraph();
      }

      const output = {
        status: allHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        services,
        summary: {
          total: services.length,
          healthy: services.filter((s) => s.healthy).length,
          unhealthy: services.filter((s) => !s.healthy).length,
        },
        wiringGraph,
      };

      // Format output based on options
      const formattedOutput = this.formatOutput(output, options.format);

      return {
        success: allHealthy,
        output: formattedOutput,
        duration: Date.now() - startTime,
        metadata: {
          servicesChecked: services.length,
        },
      };
    } catch (error) {
      this.logger.error('Health command failed', { error });

      return {
        success: false,
        output: null,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - startTime,
      };
    }
  }

  private formatOutput(output: any, format?: string): any {
    switch (format) {
      case 'json':
        return JSON.stringify(output, null, 2);

      case 'table':
        return this.formatAsTable(output);

      case 'text':
      default:
        return this.formatAsText(output);
    }
  }

  private formatAsText(output: any): string {
    const lines: string[] = [];

    lines.push(`Health Status: ${output.status.toUpperCase()}`);
    lines.push(`Timestamp: ${output.timestamp}`);
    lines.push('');
    lines.push('Services:');

    for (const service of output.services) {
      const icon = service.healthy ? '✓' : '✗';
      lines.push(`  ${icon} ${service.name}: ${service.message || 'OK'}`);

      if (service.details) {
        for (const [key, value] of Object.entries(service.details)) {
          lines.push(`      ${key}: ${JSON.stringify(value)}`);
        }
      }
    }

    lines.push('');
    lines.push('Summary:');
    lines.push(`  Total Services: ${output.summary.total}`);
    lines.push(`  Healthy: ${output.summary.healthy}`);
    lines.push(`  Unhealthy: ${output.summary.unhealthy}`);

    if (output.wiringGraph) {
      lines.push('');
      lines.push('Service Wiring:');
      lines.push(output.wiringGraph);
    }

    return lines.join('\n');
  }

  private formatAsTable(output: any): string {
    const lines: string[] = [];
    const colWidths = { name: 20, status: 10, message: 40 };

    // Header
    lines.push(
      '┌' +
        '─'.repeat(colWidths.name + 2) +
        '┬' +
        '─'.repeat(colWidths.status + 2) +
        '┬' +
        '─'.repeat(colWidths.message + 2) +
        '┐'
    );
    lines.push(
      '│ ' +
        'Service'.padEnd(colWidths.name) +
        ' │ ' +
        'Status'.padEnd(colWidths.status) +
        ' │ ' +
        'Message'.padEnd(colWidths.message) +
        ' │'
    );
    lines.push(
      '├' +
        '─'.repeat(colWidths.name + 2) +
        '┼' +
        '─'.repeat(colWidths.status + 2) +
        '┼' +
        '─'.repeat(colWidths.message + 2) +
        '┤'
    );

    // Rows
    for (const service of output.services) {
      const name = service.name.substring(0, colWidths.name).padEnd(colWidths.name);
      const status = (service.healthy ? 'OK' : 'FAIL').padEnd(colWidths.status);
      const message = (service.message || 'Healthy')
        .substring(0, colWidths.message)
        .padEnd(colWidths.message);

      lines.push('│ ' + name + ' │ ' + status + ' │ ' + message + ' │');
    }

    // Footer
    lines.push(
      '└' +
        '─'.repeat(colWidths.name + 2) +
        '┴' +
        '─'.repeat(colWidths.status + 2) +
        '┴' +
        '─'.repeat(colWidths.message + 2) +
        '┘'
    );

    return lines.join('\n');
  }
}
