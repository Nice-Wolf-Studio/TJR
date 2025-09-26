import { Client, Events, GatewayIntentBits } from 'discord.js';
import config from '../config/bot';
import logger from '../utils/logger';
import CommandHandler from './handlers/commandHandler';

class TradingBot {
  private readonly client: Client;
  private readonly commandHandler: CommandHandler;

  constructor() {
    if (!config.discord.token) {
      throw new Error('DISCORD_TOKEN is required');
    }

    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
    this.commandHandler = new CommandHandler(this.client);
  }

  async start(): Promise<void> {
    await this.commandHandler.loadCommands();
    this.commandHandler.attachInteractionListener();

    this.client.once(Events.ClientReady, async (client) => {
      logger.info(`Discord client ready as ${client.user.tag}`);
      try {
        await this.commandHandler.registerSlashCommands();
        logger.info('Slash commands registered');
      } catch (error) {
        logger.error('Failed to register slash commands', error);
      }
    });

    this.client.on(Events.Error, (error) => {
      logger.error('Discord client error', error);
    });

    await this.client.login(config.discord.token);
    logger.info('Discord login initiated');
  }

  async shutdown(): Promise<void> {
    await this.client.destroy();
    logger.info('Discord client destroyed');
  }
}

export default TradingBot;
