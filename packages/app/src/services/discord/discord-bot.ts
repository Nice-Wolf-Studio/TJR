/**
 * Real Discord bot implementation using discord.js
 */

import { Client, GatewayIntentBits, Events, Routes, type Interaction } from 'discord.js';
import { REST } from '@discordjs/rest';
import type { Logger } from '@tjr/logger';
import { CommandHandler, commands, type Command as DiscordCommand } from '@tjr/discord-bot-core';
import type { DiscordService, DiscordEmbed, DiscordStatus } from './types.js';
import type { Command } from '../../commands/types.js';
import type { HealthStatus } from '../../container/types.js';

export interface DiscordBotConfig {
  logger: Logger;
  token: string;
  clientId: string;
  guildId?: string;
  enabled?: boolean;
}

/**
 * Real Discord bot service powered by discord.js
 */
export class DiscordBot implements DiscordService {
  readonly name = 'DiscordService';
  readonly dependencies = ['Logger'];

  private logger: Logger;
  private client: Client;
  private commandHandler: CommandHandler;
  private rest: REST;
  private config: DiscordBotConfig;
  private startTime = Date.now();
  private eventHandlers = new Map<string, Set<Function>>();
  private ready = false;

  constructor(config: DiscordBotConfig) {
    this.config = config;
    this.logger = config.logger;

    // Create Discord client with necessary intents
    // For slash commands, we only need Guilds intent
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
      ],
    });

    // Create command handler
    // Type assertion needed due to potential discord.js version conflicts
    this.commandHandler = new CommandHandler(this.client as any);

    // Initialize REST client for command registration
    this.rest = new REST({ version: '10' }).setToken(config.token);

    // Setup internal event handlers
    this.setupEventHandlers();
  }

  /**
   * Initialize Discord bot and connect
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info('Discord bot is disabled, skipping initialization');
      return;
    }

    this.logger.info('Discord bot service initializing', {
      clientId: this.config.clientId,
      guildId: this.config.guildId || 'global',
    });

    try {
      // Register commands from discord-bot-core package
      this.logger.info('Registering commands from discord-bot-core', {
        count: commands.length,
        commands: commands.map((cmd: DiscordCommand) => cmd.schema.name),
      });

      this.commandHandler.registerCommands(commands);

      // Login to Discord
      await this.client.login(this.config.token);

      // Wait for ready event (with timeout)
      await this.waitForReady(30000);

      // Register slash commands with Discord API
      await this.registerSlashCommands();

      this.logger.info('Discord bot connected successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Discord bot', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Shutdown Discord bot
   */
  async shutdown(): Promise<void> {
    this.logger.info('Discord bot service shutting down');

    try {
      this.ready = false;
      this.eventHandlers.clear();
      await this.client.destroy();
      this.logger.info('Discord bot disconnected successfully');
    } catch (error) {
      this.logger.error('Error during Discord bot shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Health check
   */
  healthCheck(): HealthStatus {
    const isHealthy = this.ready && this.client.ws.status === 0;

    return {
      healthy: isHealthy,
      message: isHealthy ? 'Discord bot is healthy' : 'Discord bot is not connected',
      details: {
        ready: this.ready,
        wsStatus: this.client.ws.status,
        ping: this.client.ws.ping,
        uptime: Date.now() - this.startTime,
        guilds: this.client.guilds.cache.size,
        channels: this.client.channels.cache.size,
      },
    };
  }

  /**
   * Send a message to a Discord channel
   */
  async sendMessage(channelId: string, message: string): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);

      if (!channel || !channel.isTextBased()) {
        throw new Error(`Channel ${channelId} not found or not text-based`);
      }

      // Type guard for channels that can send messages
      if ('send' in channel) {
        await channel.send(message);
      } else {
        throw new Error(`Channel ${channelId} does not support sending messages`);
      }

      this.logger.debug('Message sent to channel', {
        channelId,
        messageLength: message.length,
      });

      this.emit('messageSent', {
        channel: channelId,
        content: message,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to send message', {
        channelId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Send an embed message to a Discord channel
   */
  async sendEmbed(channelId: string, embed: DiscordEmbed): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);

      if (!channel || !channel.isTextBased()) {
        throw new Error(`Channel ${channelId} not found or not text-based`);
      }

      // Type guard for channels that can send messages
      if ('send' in channel) {
        // Cast embed to any to satisfy discord.js type requirements
        await channel.send({ embeds: [embed as any] });
      } else {
        throw new Error(`Channel ${channelId} does not support sending messages`);
      }

      this.logger.debug('Embed sent to channel', {
        channelId,
        title: embed.title,
      });

      this.emit('embedSent', {
        channel: channelId,
        embed,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to send embed', {
        channelId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Register a command
   * Note: This registers commands in the local command handler only.
   * Slash commands are registered separately via registerSlashCommands()
   */
  registerCommand(command: Command): void {
    this.logger.warn('registerCommand() called but Discord bot uses discord-bot-core commands', {
      name: command.name,
      description: command.description,
    });
    // Discord bot uses commands from @tjr/discord-bot-core package
    // Local commands are not currently supported
  }

  /**
   * Listen for Discord events
   */
  on(event: string, handler: (data: any) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    this.logger.debug('Discord event handler registered', { event });
  }

  /**
   * Remove event listener
   */
  off(event: string, handler: (data: any) => void): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    }

    this.logger.debug('Discord event handler removed', { event });
  }

  /**
   * Get bot status
   */
  getStatus(): DiscordStatus {
    return {
      connected: this.ready,
      uptime: Date.now() - this.startTime,
      guilds: this.client.guilds.cache.size,
      channels: this.client.channels.cache.size,
      users: this.client.users.cache.size,
    };
  }

  /**
   * Setup internal event handlers for Discord events
   */
  private setupEventHandlers(): void {
    // Ready event
    this.client.on(Events.ClientReady, () => {
      this.ready = true;
      this.logger.info('Discord bot ready', {
        username: this.client.user?.tag,
        guilds: this.client.guilds.cache.size,
      });

      this.emit('ready', { timestamp: new Date() });
    });

    // Interaction create event (slash commands)
    this.client.on(Events.InteractionCreate, async (interaction: Interaction) => {
      if (!interaction.isChatInputCommand()) return;

      this.logger.info('Command received', {
        command: interaction.commandName,
        user: interaction.user.tag,
        channel: interaction.channelId,
        guild: interaction.guildId,
      });

      try {
        // Type assertion needed due to potential discord.js version conflicts
        await this.commandHandler.handleInteraction(interaction as any);
      } catch (error) {
        this.logger.error('Error handling interaction', {
          command: interaction.commandName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Error handling
    this.client.on(Events.Error, (error) => {
      this.logger.error('Discord client error', {
        error: error.message,
        stack: error.stack,
      });
    });

    // Warn handling
    this.client.on(Events.Warn, (info) => {
      this.logger.warn('Discord client warning', { info });
    });

    // Shard disconnect handling
    this.client.on(Events.ShardDisconnect, () => {
      this.ready = false;
      this.logger.warn('Discord client disconnected');
      this.emit('disconnect', { timestamp: new Date() });
    });

    // Shard reconnect handling
    this.client.on(Events.ShardReconnecting, () => {
      this.logger.info('Discord client reconnecting');
    });

    // Shard resume handling
    this.client.on(Events.ShardResume, () => {
      this.ready = true;
      this.logger.info('Discord client resumed');
      this.emit('reconnect', { timestamp: new Date() });
    });
  }

  /**
   * Register slash commands with Discord API
   */
  private async registerSlashCommands(): Promise<void> {
    try {
      const commandsJSON = this.commandHandler.toJSON();

      this.logger.info('Registering slash commands', {
        count: commandsJSON.length,
        commands: commandsJSON.map((cmd: any) => cmd.name),
        scope: this.config.guildId ? 'guild' : 'global',
      });

      if (this.config.guildId) {
        // Guild-specific commands (faster propagation, good for development)
        await this.rest.put(
          Routes.applicationGuildCommands(this.config.clientId, this.config.guildId),
          { body: commandsJSON }
        );

        this.logger.info('Slash commands registered to guild', {
          guildId: this.config.guildId,
        });
      } else {
        // Global commands (slower propagation, up to 1 hour)
        await this.rest.put(Routes.applicationCommands(this.config.clientId), {
          body: commandsJSON,
        });

        this.logger.info('Slash commands registered globally');
      }
    } catch (error) {
      this.logger.error('Failed to register slash commands', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Wait for the bot to be ready
   */
  private async waitForReady(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ready) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Discord bot ready timeout'));
      }, timeoutMs);

      const readyHandler = () => {
        clearTimeout(timeout);
        resolve();
      };

      this.client.once(Events.ClientReady, readyHandler);
    });
  }

  /**
   * Emit custom events
   */
  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          this.logger.error('Discord event handler error', {
            event,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }
  }
}
