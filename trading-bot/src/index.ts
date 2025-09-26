import TradingBot from './bot';
import logger from './utils/logger';

async function main(): Promise<void> {
  const bot = new TradingBot();

  const shutdown = async () => {
    logger.info('Shutting down trading bot');
    await bot.shutdown();
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  try {
    await bot.start();
  } catch (error) {
    logger.error('Failed to start trading bot', error);
    process.exit(1);
  }
}

main();
