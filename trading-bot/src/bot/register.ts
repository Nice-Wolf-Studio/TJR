// @ts-nocheck
/**
 * Discord Bot Command Registration
 * Registers slash commands with Discord API
 */

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class CommandRegistrar {
  constructor() {
    this.commands = [];
    this.clientId = process.env.DISCORD_APP_ID || process.env.DISCORD_CLIENT_ID;
    this.rest = new REST().setToken(process.env.DISCORD_TOKEN);
  }

  /**
   * Load all command definitions from the commands directory
   */
  async loadCommands() {
    const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

    logger.info(`📝 Loading ${commandFiles.length} command definitions...`);

    for (const file of commandFiles) {
      try {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        if ('data' in command && 'execute' in command) {
          this.commands.push(command.data.toJSON());
          logger.info(`✅ Loaded command: ${command.data.name}`);
        } else {
          logger.warn(`⚠️ Command ${file} is missing required "data" or "execute" property`);
        }
      } catch (error) {
        logger.error(`❌ Error loading command ${file}:`, error);
      }
    }

    logger.info(`📋 Successfully loaded ${this.commands.length} commands`);
    return this.commands;
  }

  /**
   * Register commands globally (available in all servers)
   */
  async registerGlobalCommands() {
    try {
      logger.info('🌐 Registering commands globally...');

      const data = await this.rest.put(
        Routes.applicationCommands(this.clientId),
        { body: this.commands }
      );

      logger.info(`✅ Successfully registered ${data.length} global commands`);
      return data;
    } catch (error) {
      logger.error('❌ Error registering global commands:', error);
      throw error;
    }
  }

  /**
   * Register commands for a specific guild (faster deployment for testing)
   */
  async registerGuildCommands(guildId) {
    try {
      logger.info(`🏠 Registering commands for guild ${guildId}...`);

      const data = await this.rest.put(
        Routes.applicationGuildCommands(this.clientId, guildId),
        { body: this.commands }
      );

      logger.info(`✅ Successfully registered ${data.length} guild commands`);
      return data;
    } catch (error) {
      logger.error(`❌ Error registering guild commands for ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Clear all registered commands (useful for cleanup)
   */
  async clearCommands(guildId = null) {
    try {
      if (guildId) {
        logger.info(`🧹 Clearing commands for guild ${guildId}...`);
        await this.rest.put(
          Routes.applicationGuildCommands(this.clientId, guildId),
          { body: [] }
        );
        logger.info('✅ Guild commands cleared');
      } else {
        logger.info('🧹 Clearing global commands...');
        await this.rest.put(
          Routes.applicationCommands(this.clientId),
          { body: [] }
        );
        logger.info('✅ Global commands cleared');
      }
    } catch (error) {
      logger.error('❌ Error clearing commands:', error);
      throw error;
    }
  }

  /**
   * List currently registered commands
   */
  async listCommands(guildId = null) {
    try {
      let commands;

      if (guildId) {
        logger.info(`📋 Fetching guild commands for ${guildId}...`);
        commands = await this.rest.get(
          Routes.applicationGuildCommands(this.clientId, guildId)
        );
      } else {
        logger.info('📋 Fetching global commands...');
        commands = await this.rest.get(
          Routes.applicationCommands(this.clientId)
        );
      }

      logger.info(`📊 Found ${commands.length} registered commands:`);
      commands.forEach(command => {
        logger.info(`   • ${command.name}: ${command.description}`);
      });

      return commands;
    } catch (error) {
      logger.error('❌ Error fetching commands:', error);
      throw error;
    }
  }

  /**
   * Display registration summary
   */
  displaySummary() {
    logger.info('📊 Command Registration Summary:');
    logger.info('═══════════════════════════════════════');

    this.commands.forEach(command => {
      logger.info(`📝 ${command.name}`);
      logger.info(`   Description: ${command.description}`);
      if (command.options && command.options.length > 0) {
        logger.info(`   Options: ${command.options.length}`);
        command.options.forEach(option => {
          logger.info(`     • ${option.name} (${option.type}): ${option.description}`);
        });
      }
      logger.info('───────────────────────────────────────');
    });

    logger.info(`✅ Total Commands: ${this.commands.length}`);
    logger.info('═══════════════════════════════════════');
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const registrar = new CommandRegistrar();

  try {
    // Validate environment
    if (!process.env.DISCORD_TOKEN || !registrar.clientId) {
      logger.error('❌ Missing required environment variables:');
      logger.error('   DISCORD_TOKEN - Your bot token');
      logger.error('   DISCORD_CLIENT_ID or DISCORD_APP_ID - Your application client ID');
      process.exit(1);
    }

    // Load commands
    await registrar.loadCommands();

    if (registrar.commands.length === 0) {
      logger.error('❌ No commands found to register');
      process.exit(1);
    }

    // Parse command line arguments
    const action = args[0] || 'global';
    const guildId = args[1];

    switch (action) {
      case 'global':
        logger.info('🚀 Starting global command registration...');
        await registrar.registerGlobalCommands();
        registrar.displaySummary();
        logger.info('🎉 Global registration completed!');
        logger.info('⏰ Note: Global commands may take up to 1 hour to update');
        break;

      case 'guild':
        if (!guildId) {
          logger.error('❌ Guild ID required for guild registration');
          logger.error('Usage: node register.js guild <GUILD_ID>');
          process.exit(1);
        }
        logger.info(`🚀 Starting guild command registration for ${guildId}...`);
        await registrar.registerGuildCommands(guildId);
        registrar.displaySummary();
        logger.info('🎉 Guild registration completed!');
        logger.info('⚡ Guild commands are available immediately');
        break;

      case 'clear':
        if (guildId) {
          await registrar.clearCommands(guildId);
        } else {
          await registrar.clearCommands();
        }
        break;

      case 'list':
        if (guildId) {
          await registrar.listCommands(guildId);
        } else {
          await registrar.listCommands();
        }
        break;

      case 'help':
        console.log('TJR Trading Bot - Command Registration');
        console.log('════════════════════════════════════');
        console.log('');
        console.log('Usage:');
        console.log('  node register.js [action] [guildId]');
        console.log('');
        console.log('Actions:');
        console.log('  global           Register commands globally (default)');
        console.log('  guild <guildId>  Register commands for specific guild');
        console.log('  clear [guildId]  Clear commands (global or guild)');
        console.log('  list [guildId]   List registered commands');
        console.log('  help             Show this help');
        console.log('');
        console.log('Examples:');
        console.log('  node register.js global');
        console.log('  node register.js guild 123456789012345678');
        console.log('  node register.js clear');
        console.log('  node register.js list 123456789012345678');
        break;

      default:
        logger.error(`❌ Unknown action: ${action}`);
        logger.error('Run "node register.js help" for usage information');
        process.exit(1);
    }

  } catch (error) {
    logger.error('❌ Registration failed:', error);

    if (error.code === 50001) {
      logger.error('🔒 Missing Access: Bot lacks permission to register commands');
      logger.error('   Make sure the bot has been invited with the "applications.commands" scope');
    } else if (error.code === 50035) {
      logger.error('📝 Invalid Form Body: Check command definitions for errors');
    } else if (error.status === 401) {
      logger.error('🔑 Unauthorized: Check your bot token and client ID');
    }

    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = CommandRegistrar;
