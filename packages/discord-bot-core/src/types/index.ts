/**
 * Core types for Discord bot commands
 */

import type { SlashCommandBuilder } from 'discord.js';

/**
 * Represents a Discord command schema
 */
export interface CommandSchema {
  /** Command name (lowercase, no spaces) */
  name: string;

  /** Command description */
  description: string;

  /** Command options */
  options?: CommandOption[];

  /** Default member permissions required */
  defaultMemberPermissions?: bigint | string | null;

  /** Whether command is available in DMs */
  dmPermission?: boolean;

  /** Whether command is NSFW */
  nsfw?: boolean;
}

/**
 * Command option types matching Discord API
 */
export enum CommandOptionType {
  SUB_COMMAND = 1,
  SUB_COMMAND_GROUP = 2,
  STRING = 3,
  INTEGER = 4,
  BOOLEAN = 5,
  USER = 6,
  CHANNEL = 7,
  ROLE = 8,
  MENTIONABLE = 9,
  NUMBER = 10,
  ATTACHMENT = 11,
}

/**
 * Command option structure
 */
export interface CommandOption {
  type: CommandOptionType;
  name: string;
  description: string;
  required?: boolean;
  choices?: CommandChoice[];
  options?: CommandOption[]; // For subcommands
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
  autocomplete?: boolean;
}

/**
 * Command choice for string/number options
 */
export interface CommandChoice {
  name: string;
  value: string | number;
}

/**
 * Command handler function type
 */
export type CommandHandler = (interaction: any) => Promise<void>;

/**
 * Complete command definition
 */
export interface Command {
  schema: CommandSchema;
  handler: CommandHandler;
  builder?: SlashCommandBuilder;
}

/**
 * Command manifest for registration
 */
export interface CommandManifest {
  /** Manifest version */
  version: string;

  /** Generated timestamp */
  generatedAt: string;

  /** Commands to register */
  commands: CommandSchema[];

  /** Hash of commands for comparison */
  hash: string;
}

/**
 * Registration result
 */
export interface RegistrationResult {
  /** Whether registration was successful */
  success: boolean;

  /** Commands that were registered */
  registered: string[];

  /** Commands that were skipped (no changes) */
  skipped: string[];

  /** Commands that failed */
  failed: Array<{
    command: string;
    error: string;
  }>;

  /** Total time taken */
  duration: number;
}

/**
 * Diff result for dry-run
 */
export interface DiffResult {
  /** Commands to add */
  toAdd: CommandSchema[];

  /** Commands to update */
  toUpdate: Array<{
    name: string;
    changes: string[];
  }>;

  /** Commands to remove */
  toRemove: string[];

  /** Commands with no changes */
  unchanged: string[];
}
