const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const logger = require('../../utils/logger');
const config = require('../../../config/bot');

class CommandHandler {
  constructor(client) {
    this.client = client;
    this.commands = new Collection();
    this.aliases = new Collection();
    this.cooldowns = new Collection();
  }

  /**
   * Load all commands from the commands directory
   */
  async loadCommands() {
    const commandsPath = path.join(__dirname, '../commands');

    if (!fs.existsSync(commandsPath)) {
      fs.mkdirSync(commandsPath, { recursive: true });
      logger.warn('Commands directory created');
      return;
    }

    const commandFiles = fs.readdirSync(commandsPath)
      .filter(file => file.endsWith('.js'));

    logger.info(`Loading ${commandFiles.length} commands...`);

    for (const file of commandFiles) {
      try {
        const filePath = path.join(commandsPath, file);
        delete require.cache[require.resolve(filePath)]; // Clear cache for hot reload

        const command = require(filePath);

        if (!this.validateCommand(command)) {
          logger.warn(`Invalid command structure in ${file}`);
          continue;
        }

        const commandName = command.name || command.data?.name;

        if (!commandName) {
          logger.warn(`Unable to determine command name for ${file}`);
          continue;
        }

        command.name = commandName;
        command.description = command.description || command.data?.description;
        command.isSlashCommand = Boolean(command.data && command.data.name);
        command.allowPrefix = command.allowPrefix ?? !command.isSlashCommand;

        this.commands.set(command.name, command);

        // Register aliases for prefix commands only
        if (command.aliases && command.allowPrefix) {
          for (const alias of command.aliases) {
            this.aliases.set(alias, command.name);
          }
        }

        logger.debug(`Command loaded: ${command.name}`, {
          type: command.isSlashCommand ? 'slash' : 'message',
          allowPrefix: command.allowPrefix
        });
      } catch (error) {
        logger.error(`Error loading command ${file}:`, error);
      }
    }

    logger.info(`Successfully loaded ${this.commands.size} commands`);
  }

  /**
   * Validate command structure
   */
  validateCommand(command) {
    if (!command || typeof command.execute !== 'function') {
      return false;
    }

    const hasName = (typeof command.name === 'string' && command.name.length > 0) ||
      (command.data && typeof command.data.name === 'string' && command.data.name.length > 0);

    return hasName;
  }

  /**
   * Handle incoming messages for commands
   */
  async handleMessage(message) {
    // Ignore bots and system messages
    if (message.author.bot || message.system) return;

    const prefix = config.discord.prefix;

    // Check if message starts with prefix
    if (!message.content.startsWith(prefix)) return;

    // Parse command and arguments
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) return;

    // Find command (including aliases)
    const command = this.commands.get(commandName) ||
                   this.commands.get(this.aliases.get(commandName));

    if (!command) return;

    if (!command.allowPrefix) {
      return;
    }

    try {
      // Check permissions
      if (!this.checkPermissions(command, message)) {
        return message.reply('You do not have permission to use this command.');
      }

      // Check cooldown
      if (!this.checkCooldown(command, message)) {
        return; // Cooldown message is handled in checkCooldown
      }

      // Check if command is guild only
      if (command.guildOnly && !message.guild) {
        return message.reply('This command can only be used in a server.');
      }

      // Check required arguments
      if (command.args && !args.length) {
        const usage = command.usage ?
          `\nUsage: \`${prefix}${command.name} ${command.usage}\`` : '';
        return message.reply(`You didn't provide any arguments!${usage}`);
      }

      // Execute command
      const startTime = Date.now();

      await command.execute(message, args, this.client);

      const duration = Date.now() - startTime;

      // Log command execution
      logger.command(command.name, message.author, message.guild, {
        args: args.length > 0 ? args : undefined,
        channel: message.channel.name,
        channelId: message.channel.id
      });

      logger.performance(`Command ${command.name}`, duration);

      // Set cooldown for prefix commands
      this.setCooldown(command, message.author.id);

      if (this.client.app) {
        this.client.app.stats.commandsExecuted++;
      }

    } catch (error) {
      logger.commandError(error, command.name, message.author, message.guild);

      const errorMessage = config.isDevelopment ?
        `There was an error executing that command!\n\`\`\`${error.message}\`\`\`` :
        'There was an error executing that command!';

      message.reply(errorMessage).catch(console.error);
    }
  }

  /**
   * Handle slash command interactions
   */
  async handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = this.commands.get(interaction.commandName);

    if (!command || !command.isSlashCommand) {
      return;
    }

    try {
      const startTime = Date.now();

      await command.execute(interaction, this.client);

      const duration = Date.now() - startTime;

      logger.command(command.name, interaction.user, interaction.guild, {
        channel: interaction.channel?.name,
        channelId: interaction.channelId,
        interaction: true
      });

      logger.performance(`Slash ${command.name}`, duration);

      if (this.client.app) {
        this.client.app.stats.commandsExecuted++;
      }

    } catch (error) {
      logger.commandError(error, command.name, interaction.user, interaction.guild);

      const errorMessage = config.isDevelopment ?
        `There was an error executing that command!\n\`\`\`${error.message}\`\`\`` :
        'There was an error executing that command!';

      if (interaction.deferred || interaction.replied) {
        interaction.followUp({ content: errorMessage, ephemeral: true }).catch(() => {});
      } else {
        interaction.reply({ content: errorMessage, ephemeral: true }).catch(() => {});
      }
    }
  }

  /**
   * Check user permissions for command
   */
  checkPermissions(command, message) {
    // Owner check
    if (command.ownerOnly && !config.commands.ownerOnly.includes(message.author.id)) {
      return false;
    }

    // Admin check
    if (command.adminOnly && message.guild) {
      const member = message.guild.members.cache.get(message.author.id);
      if (!member) return false;

      const hasAdminRole = member.roles.cache.some(role =>
        config.commands.adminRoles.includes(role.name)
      );

      const hasAdminPermission = member.permissions.has('Administrator');

      if (!hasAdminRole && !hasAdminPermission) {
        return false;
      }
    }

    // Discord permissions check
    if (command.permissions && message.guild) {
      const member = message.guild.members.cache.get(message.author.id);
      if (!member || !member.permissions.has(command.permissions)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check command cooldown
   */
  checkCooldown(command, message) {
    const cooldownAmount = (command.cooldown || config.commands.cooldown);
    const userId = message.author.id;
    const commandName = command.name;

    if (!this.cooldowns.has(commandName)) {
      this.cooldowns.set(commandName, new Collection());
    }

    const now = Date.now();
    const timestamps = this.cooldowns.get(commandName);
    const cooldownExpiry = timestamps.get(userId) || 0;

    if (now < cooldownExpiry) {
      const timeLeft = (cooldownExpiry - now) / 1000;
      message.reply(`Please wait ${timeLeft.toFixed(1)} more second(s) before reusing the \`${commandName}\` command.`);
      return false;
    }

    return true;
  }

  /**
   * Set cooldown for user
   */
  setCooldown(command, userId) {
    if (!userId) {
      return;
    }

    const cooldownAmount = (command.cooldown || config.commands.cooldown);
    const commandName = command.name;

    if (!this.cooldowns.has(commandName)) {
      this.cooldowns.set(commandName, new Collection());
    }

    const timestamps = this.cooldowns.get(commandName);
    timestamps.set(userId, Date.now() + cooldownAmount);

    // Clean up expired cooldowns
    setTimeout(() => {
      timestamps.delete(userId);
    }, cooldownAmount);
  }

  /**
   * Reload a specific command
   */
  async reloadCommand(commandName) {
    const command = this.commands.get(commandName) ||
                   this.commands.get(this.aliases.get(commandName));

    if (!command) {
      throw new Error(`Command ${commandName} not found`);
    }

    const commandsPath = path.join(__dirname, '../commands');
    const filePath = path.join(commandsPath, `${command.name}.js`);

    delete require.cache[require.resolve(filePath)];

    try {
      const newCommand = require(filePath);
      this.commands.set(newCommand.name, newCommand);
      logger.info(`Command ${command.name} reloaded successfully`);
      return true;
    } catch (error) {
      logger.error(`Failed to reload command ${command.name}:`, error);
      throw error;
    }
  }

  /**
   * Get command information
   */
  getCommand(name) {
    return this.commands.get(name) || this.commands.get(this.aliases.get(name));
  }

  /**
   * Get all commands
   */
  getAllCommands() {
    return this.commands;
  }
}

module.exports = CommandHandler;
