import fs from 'fs';
import path from 'path';
import {
  ChatInputCommandInteraction,
  Client,
  Collection,
  Events,
  REST,
  Routes,
  SlashCommandBuilder
} from 'discord.js';
import logger from '../../utils/logger';
import config from '../../config/bot';

export interface SlashCommandModule {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void> | void;
}

type CommandImport = Partial<SlashCommandModule> & {
  default?: SlashCommandModule;
};

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

class CommandHandler {
  private readonly client: Client;
  private readonly commands = new Collection<string, SlashCommandModule>();

  constructor(client: Client) {
    this.client = client;
  }

  async loadCommands(): Promise<void> {
    if (!fs.existsSync(COMMANDS_DIR)) {
      logger.warn('Commands directory missing, creating placeholder');
      fs.mkdirSync(COMMANDS_DIR, { recursive: true });
      return;
    }

    const files = fs
      .readdirSync(COMMANDS_DIR)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.js'));

    logger.info(`Loading ${files.length} commands`);

    for (const file of files) {
      const filePath = path.join(COMMANDS_DIR, file);
      const modulePath = require.resolve(filePath);
      delete require.cache[modulePath];
      const module = require(modulePath) as CommandImport;
      const command: SlashCommandModule | undefined = module.default ?? (module as SlashCommandModule);

      if (!command?.data || typeof command.execute !== 'function') {
        logger.warn(`Skipping command ${file}: missing data or execute`);
        continue;
      }

      const name = command.data.name;
      this.commands.set(name, command);
      logger.debug(`Command registered: ${name}`);
    }
  }

  attachInteractionListener(): void {
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) {
        return;
      }

      const command = this.commands.get(interaction.commandName);
      if (!command) {
        logger.warn(`Received unknown command: ${interaction.commandName}`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        logger.error('Command execution failed', {
          command: interaction.commandName,
          error
        });

        if (interaction.replied || interaction.deferred) {
          await interaction.editReply('Something went wrong executing that command.');
        } else {
          await interaction.reply({ content: 'Something went wrong executing that command.', ephemeral: true });
        }
      }
    });
  }

  async registerSlashCommands(): Promise<void> {
    const payload = this.commands.map((command) => command.data.toJSON());
    const rest = new REST({ version: '10' }).setToken(config.discord.token);

    try {
      if (config.discord.guildId) {
        logger.info(`Registering ${payload.length} guild commands`);
        await rest.put(
          Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
          { body: payload }
        );
      } else {
        logger.info(`Registering ${payload.length} global commands`);
        await rest.put(Routes.applicationCommands(config.discord.clientId), { body: payload });
      }
    } catch (error) {
      logger.error('Failed to register slash commands', error);
      throw error;
    }
  }

  getCommandList(): SlashCommandModule[] {
    return Array.from(this.commands.values());
  }
}

export default CommandHandler;
