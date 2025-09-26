import 'dotenv/config';
import TradingBot from './src/bot';
import logger from './src/utils/logger';

async function start(): Promise<void> {
  try {
    const bot = new TradingBot();
    process.once('SIGINT', async () => {
      await bot.shutdown();
      process.exit(0);
    });
    process.once('SIGTERM', async () => {
      await bot.shutdown();
      process.exit(0);
    });

    await bot.start();
    logger.info('Trading bot started in simple mode');
  } catch (error) {
    logger.error('Failed to start simple bot', error);
    process.exit(1);
  }
}

start();
