/**
 * Stub implementation of Discord service for development
 */

import type { Logger } from '@tjr/logger';
import type { DiscordService, DiscordEmbed, DiscordStatus } from './types.js';
import type { Command } from '../../commands/types.js';
import type { HealthStatus } from '../../container/types.js';

export interface DiscordStubConfig {
  logger: Logger;
  enabled?: boolean;
  simulateLatency?: boolean;
  latencyMs?: number;
}

/**
 * Stub Discord service that logs all operations
 */
export class DiscordStub implements DiscordService {
  readonly name = 'DiscordService';
  readonly dependencies = ['Logger'];

  private logger: Logger;
  private enabled: boolean;
  private simulateLatency: boolean;
  private latencyMs: number;
  private commands = new Map<string, Command>();
  private eventHandlers = new Map<string, Set<Function>>();
  private startTime = Date.now();

  constructor(config: DiscordStubConfig) {
    this.logger = config.logger;
    this.enabled = config.enabled ?? false;
    this.simulateLatency = config.simulateLatency ?? false;
    this.latencyMs = config.latencyMs ?? 100;
  }

  async initialize(): Promise<void> {
    this.logger.info('Discord stub service initializing', {
      enabled: this.enabled,
      simulateLatency: this.simulateLatency,
    });

    if (this.enabled) {
      this.logger.info('Discord stub connected (simulation)');
      this.emit('ready', { timestamp: new Date() });
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Discord stub service shutting down');
    this.commands.clear();
    this.eventHandlers.clear();
  }

  healthCheck(): HealthStatus {
    return {
      healthy: true,
      message: 'Discord stub is healthy',
      details: {
        enabled: this.enabled,
        commandsRegistered: this.commands.size,
        eventHandlers: this.eventHandlers.size,
      },
    };
  }

  async sendMessage(channel: string, message: string): Promise<void> {
    await this.simulateDelay();

    this.logger.info('Discord stub sending message', {
      channel,
      message: message.substring(0, 100), // Log first 100 chars
    });

    // Simulate message sent event
    this.emit('messageSent', {
      channel,
      content: message,
      timestamp: new Date(),
    });
  }

  async sendEmbed(channel: string, embed: DiscordEmbed): Promise<void> {
    await this.simulateDelay();

    this.logger.info('Discord stub sending embed', {
      channel,
      title: embed.title,
      fields: embed.fields?.length || 0,
    });

    // Simulate embed sent event
    this.emit('embedSent', {
      channel,
      embed,
      timestamp: new Date(),
    });
  }

  registerCommand(command: Command): void {
    this.logger.info('Discord stub registering command', {
      name: command.name,
      description: command.description,
    });

    this.commands.set(command.name, command);
  }

  on(event: string, handler: (data: any) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    this.logger.debug('Discord stub event handler registered', { event });
  }

  off(event: string, handler: (data: any) => void): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    }

    this.logger.debug('Discord stub event handler removed', { event });
  }

  getStatus(): DiscordStatus {
    return {
      connected: this.enabled,
      uptime: Date.now() - this.startTime,
      guilds: 1, // Simulated
      channels: 5, // Simulated
      users: 10, // Simulated
    };
  }

  /**
   * Simulate a Discord command (for testing)
   */
  async simulateCommand(commandName: string, args: string[]): Promise<any> {
    const command = this.commands.get(commandName);
    if (!command) {
      throw new Error(`Command not found: ${commandName}`);
    }

    this.logger.info('Discord stub simulating command', {
      command: commandName,
      args,
    });

    const result = await command.execute(args, {});
    return result;
  }

  private async simulateDelay(): Promise<void> {
    if (this.simulateLatency) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
  }

  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          this.logger.error('Discord stub event handler error', {
            event,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }
  }
}
