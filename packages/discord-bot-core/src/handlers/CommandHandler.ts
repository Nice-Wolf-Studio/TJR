/**
 * CommandHandler - Central command processing system
 */

import {
  Client,
  Collection,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  REST,
} from 'discord.js';
import type { Command, CommandSchema } from '../types/index.js';

/**
 * Central command handler for Discord bot
 */
export class CommandHandler {
  private commands: Collection<string, Command>;

  constructor(_client: Client) {
    // Client will be used in future implementations
    this.commands = new Collection();
  }

  /**
   * Initialize REST API client
   */
  public initializeRest(token: string): void {
    // REST client will be stored for future use
    new REST({ version: '10' }).setToken(token);
  }

  /**
   * Register a command
   */
  public registerCommand(command: Command): void {
    if (!command.schema.name) {
      throw new Error('Command must have a name');
    }

    this.commands.set(command.schema.name, command);
  }

  /**
   * Register multiple commands
   */
  public registerCommands(commands: Command[]): void {
    commands.forEach(command => this.registerCommand(command));
  }

  /**
   * Get a command by name
   */
  public getCommand(name: string): Command | undefined {
    return this.commands.get(name);
  }

  /**
   * Get all commands
   */
  public getAllCommands(): Command[] {
    return Array.from(this.commands.values());
  }

  /**
   * Handle an interaction
   */
  public async handleInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.isChatInputCommand()) return;

    const command = this.commands.get(interaction.commandName);

    if (!command) {
      await interaction.reply({
        content: `Command ${interaction.commandName} not found`,
        ephemeral: true,
      });
      return;
    }

    try {
      await command.handler(interaction);
    } catch (error) {
      console.error(`Error handling command ${interaction.commandName}:`, error);

      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `Error: ${errorMessage}`,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `Error: ${errorMessage}`,
          ephemeral: true,
        });
      }
    }
  }

  /**
   * Build command for registration
   */
  public buildCommand(schema: CommandSchema): SlashCommandBuilder {
    const builder = new SlashCommandBuilder()
      .setName(schema.name)
      .setDescription(schema.description);

    if (schema.dmPermission !== undefined) {
      builder.setDMPermission(schema.dmPermission);
    }

    if (schema.defaultMemberPermissions !== undefined) {
      builder.setDefaultMemberPermissions(schema.defaultMemberPermissions);
    }

    if (schema.nsfw !== undefined) {
      builder.setNSFW(schema.nsfw);
    }

    // Add options if they exist
    if (schema.options) {
      schema.options.forEach(option => {
        switch (option.type) {
          case 3: // STRING
            builder.addStringOption(opt => {
              opt.setName(option.name).setDescription(option.description);
              if (option.required) opt.setRequired(option.required);
              if (option.choices) {
                opt.addChoices(...option.choices.map(c => ({ name: c.name, value: String(c.value) })));
              }
              if (option.minLength) opt.setMinLength(option.minLength);
              if (option.maxLength) opt.setMaxLength(option.maxLength);
              if (option.autocomplete) opt.setAutocomplete(option.autocomplete);
              return opt;
            });
            break;
          case 4: // INTEGER
            builder.addIntegerOption(opt => {
              opt.setName(option.name).setDescription(option.description);
              if (option.required) opt.setRequired(option.required);
              if (option.choices) {
                opt.addChoices(...option.choices.map(c => ({ name: c.name, value: Number(c.value) })));
              }
              if (option.minValue) opt.setMinValue(option.minValue);
              if (option.maxValue) opt.setMaxValue(option.maxValue);
              return opt;
            });
            break;
          case 5: // BOOLEAN
            builder.addBooleanOption(opt => {
              opt.setName(option.name).setDescription(option.description);
              if (option.required) opt.setRequired(option.required);
              return opt;
            });
            break;
          case 6: // USER
            builder.addUserOption(opt => {
              opt.setName(option.name).setDescription(option.description);
              if (option.required) opt.setRequired(option.required);
              return opt;
            });
            break;
          case 7: // CHANNEL
            builder.addChannelOption(opt => {
              opt.setName(option.name).setDescription(option.description);
              if (option.required) opt.setRequired(option.required);
              return opt;
            });
            break;
          case 8: // ROLE
            builder.addRoleOption(opt => {
              opt.setName(option.name).setDescription(option.description);
              if (option.required) opt.setRequired(option.required);
              return opt;
            });
            break;
          case 10: // NUMBER
            builder.addNumberOption(opt => {
              opt.setName(option.name).setDescription(option.description);
              if (option.required) opt.setRequired(option.required);
              if (option.choices) {
                opt.addChoices(...option.choices.map(c => ({ name: c.name, value: Number(c.value) })));
              }
              if (option.minValue) opt.setMinValue(option.minValue);
              if (option.maxValue) opt.setMaxValue(option.maxValue);
              return opt;
            });
            break;
          case 11: // ATTACHMENT
            builder.addAttachmentOption(opt => {
              opt.setName(option.name).setDescription(option.description);
              if (option.required) opt.setRequired(option.required);
              return opt;
            });
            break;
        }
      });
    }

    return builder;
  }

  /**
   * Convert commands to JSON for registration
   */
  public toJSON(): any[] {
    return this.getAllCommands().map(command => {
      const builder = this.buildCommand(command.schema);
      return builder.toJSON();
    });
  }

  /**
   * Generate command manifest
   */
  public generateManifest(): any {
    const commands = this.getAllCommands().map(cmd => cmd.schema);
    const hash = this.generateHash(JSON.stringify(commands));

    return {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      commands,
      hash,
    };
  }

  /**
   * Generate hash for comparison
   */
  private generateHash(content: string): string {
    // Simple hash for demonstration - in production use crypto
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }
}