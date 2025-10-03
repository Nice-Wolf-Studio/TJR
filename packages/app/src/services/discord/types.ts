/**
 * Discord service types and interfaces
 */

import type { Service } from '../../container/types.js';
import type { Command } from '../../commands/types.js';

/**
 * Discord message event
 */
export interface DiscordMessage {
  channel: string;
  author: string;
  content: string;
  timestamp: Date;
}

/**
 * Discord service interface
 */
export interface DiscordService extends Service {
  /**
   * Send a message to a Discord channel
   */
  sendMessage(channel: string, message: string): Promise<void>;

  /**
   * Send an embed message to a Discord channel
   */
  sendEmbed(channel: string, embed: DiscordEmbed): Promise<void>;

  /**
   * Register a slash command
   */
  registerCommand(command: Command): void;

  /**
   * Listen for Discord events
   */
  on(event: string, handler: (data: any) => void): void;

  /**
   * Remove event listener
   */
  off(event: string, handler: (data: any) => void): void;

  /**
   * Get bot status
   */
  getStatus(): DiscordStatus;
}

/**
 * Discord embed structure
 */
export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
  };
  timestamp?: Date;
}

/**
 * Discord bot status
 */
export interface DiscordStatus {
  connected: boolean;
  uptime: number;
  guilds: number;
  channels: number;
  users: number;
}
