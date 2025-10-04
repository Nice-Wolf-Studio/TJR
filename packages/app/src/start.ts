#!/usr/bin/env node

/**
 * Main application entry point
 * Wires all services together and starts the application
 */

// Load environment variables from .env file
import 'dotenv/config';

import {
  createLogger,
  attachGlobalHandlers,
  withRequestContext,
  startTimer,
  type Logger,
} from '@tjr/logger';
import { Container, TOKENS, type IContainer } from './container/index.js';
import { loadConfig, getConfigSummary, type Config } from './config/index.js';
import { DiscordStub } from './services/discord/discord.stub.js';
import { DiscordBot } from './services/discord/discord-bot.js';
import { FixtureProvider } from './services/providers/fixture-provider.js';
import { MemoryCache } from './services/cache/memory-cache.js';
import { HealthCommand } from './commands/health.command.js';
import { DailyCommand } from './commands/daily.command.js';
import { HttpServer } from './server/http-server.js';
import type { Command } from './commands/types.js';
import type { ProviderService } from './services/providers/types.js';
import type { DiscordService } from './services/discord/types.js';

/**
 * Main startup function
 */
async function start(): Promise<void> {
  let logger: Logger | undefined;
  let container: IContainer | undefined;

  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const flags = {
      dryRun: args.includes('--dry-run'),
      verbose: args.includes('--verbose') || args.includes('-v'),
      help: args.includes('--help') || args.includes('-h'),
      version: args.includes('--version'),
    };

    // Show help if requested
    if (flags.help) {
      showHelp();
      process.exit(0);
    }

    // Show version if requested
    if (flags.version) {
      console.log('TJR Suite v0.1.0');
      process.exit(0);
    }

    // Override environment with command line flags
    if (flags.dryRun) process.env['DRY_RUN'] = 'true';
    if (flags.verbose) process.env['VERBOSE'] = 'true';

    // Load configuration
    const config = loadConfig();

    // Create root logger
    logger = createLogger({
      level: config.logging.level,
      json: config.logging.format === 'json',
    });

    // Attach global error handlers
    attachGlobalHandlers(logger);

    // Wrap startup in request context for observability
    await withRequestContext(async () => {
      const startupTimer = startTimer();

      // Assert logger is defined within the context
      if (!logger) throw new Error('Logger not initialized');

      logger.info('Starting TJR Suite', {
        ...getConfigSummary(config),
        operation: 'app_startup',
      });

      // Create DI container
      container = new Container();

      // Register services
      await registerServices(container, config, logger);

      // Initialize all services
      logger.info('Initializing services...', { operation: 'service_init' });
      const initTimer = startTimer();
      await container.initializeAll();
      logger.info('Services initialized', {
        operation: 'service_init',
        duration_ms: initTimer.stop(),
        result: 'success',
      });

      logger.info('TJR Suite startup complete', {
        operation: 'app_startup',
        duration_ms: startupTimer.stop(),
        result: 'success',
      });
    });

    // Assert container is defined
    if (!container) throw new Error('Container not initialized');
    if (!logger) throw new Error('Logger not initialized');

    // Print wiring graph
    if (config.app.verbose) {
      console.log('\nService Wiring Graph:');
      console.log('='.repeat(50));
      console.log(container.getWiringGraph());
      console.log('='.repeat(50));
      console.log('');
    }

    // Start HTTP server if enabled
    let httpServer: HttpServer | undefined;
    if (config.server.enabled) {
      logger.info('Starting HTTP API server...');
      httpServer = new HttpServer({
        port: config.server.port,
        host: config.server.host,
        logger: logger.child({ service: 'http-server' }),
        container,
        databaseUrl: config.database.url,
        anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
      });
      await httpServer.start();
    }

    // Start appropriate interface
    if (config.discord.enabled) {
      logger.info('Starting Discord bot interface...');
      await startDiscordBot(container, config, logger, httpServer);
    } else {
      logger.info('Starting CLI interface...');
      await startCLI(container, config, logger);
    }
  } catch (error) {
    if (logger) {
      logger.error('Application startup failed', { error });
    } else {
      console.error('Application startup failed:', error);
    }

    // Cleanup
    if (container) {
      try {
        await container.shutdownAll();
      } catch (shutdownError) {
        console.error('Error during shutdown:', shutdownError);
      }
    }

    process.exit(1);
  }
}

/**
 * Register all services in the container
 */
async function registerServices(
  container: IContainer,
  config: Config,
  logger: Logger
): Promise<void> {
  // Core services
  container.register(TOKENS.Logger, () => logger);
  container.register(TOKENS.Config, () => config);

  // Cache service
  container.register(TOKENS.CacheService, () => {
    return new MemoryCache({
      logger: logger.child({ service: 'cache' }),
      defaultTTL: config.cache.defaultTTL,
      maxSize: config.cache.maxSize,
    });
  });

  // Provider service
  container.register(TOKENS.ProviderService, () => {
    return new FixtureProvider({
      logger: logger.child({ service: 'provider' }),
      simulateLatency: !config.app.dryRun,
      latencyMs: 50,
    });
  });

  // Discord service (use real bot if token provided, otherwise use stub)
  container.register(TOKENS.DiscordService, () => {
    if (config.discord.enabled && config.discord.token && config.discord.clientId) {
      return new DiscordBot({
        logger: logger.child({ service: 'discord' }),
        token: config.discord.token,
        clientId: config.discord.clientId,
        guildId: config.discord.guildId,
        enabled: config.discord.enabled,
      });
    } else {
      return new DiscordStub({
        logger: logger.child({ service: 'discord' }),
        enabled: config.discord.enabled,
        simulateLatency: !config.app.dryRun,
      });
    }
  });

  // Commands
  container.register(TOKENS.HealthCommand, () => {
    return new HealthCommand({
      container,
      logger: logger.child({ service: 'health-command' }),
    });
  });

  container.register(TOKENS.DailyCommand, () => {
    const providerService = container.resolve(TOKENS.ProviderService) as ProviderService;
    return new DailyCommand({
      providerService,
      logger: logger.child({ service: 'daily-command' }),
    });
  });

  logger.info('Services registered', {
    count: 7,
  });
}

/**
 * Start Discord bot interface
 */
async function startDiscordBot(
  container: IContainer,
  _config: Config,
  logger: Logger,
  httpServer?: HttpServer
): Promise<void> {
  const discord = container.resolve(TOKENS.DiscordService) as DiscordService;
  const healthCommand = container.resolve<Command>(TOKENS.HealthCommand);
  const dailyCommand = container.resolve<Command>(TOKENS.DailyCommand);

  // Register commands
  discord.registerCommand(healthCommand);
  discord.registerCommand(dailyCommand);

  logger.info('Discord bot started with commands', {
    commands: ['health', 'daily'],
  });

  // Keep process alive
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    if (httpServer) {
      await httpServer.stop();
    }
    await container.shutdownAll();
    process.exit(0);
  });
}

/**
 * Start CLI interface
 */
async function startCLI(container: IContainer, config: Config, logger: Logger): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));

  if (args.length === 0) {
    // Interactive mode
    logger.info('Starting interactive CLI mode');
    await startInteractiveCLI(container, config, logger);
  } else {
    // Command mode
    const commandName = args[0];
    const commandArgs = args.slice(1);

    if (commandName) {
      await executeCommand(container, commandName, commandArgs, config, logger);
    } else {
      logger.error('No command provided');
      showHelp();
      process.exit(1);
    }
  }
}

/**
 * Start interactive CLI
 */
async function startInteractiveCLI(
  container: IContainer,
  config: Config,
  logger: Logger
): Promise<void> {
  const healthCommand = container.resolve<Command>(TOKENS.HealthCommand);
  const dailyCommand = container.resolve<Command>(TOKENS.DailyCommand);

  console.log('\nTJR Suite Interactive CLI');
  console.log('Available commands:');
  console.log('  /health - Check system health');
  console.log('  /daily [symbol] [date] - Run daily analysis');
  console.log('  /exit - Exit the application');
  console.log('');

  // Simple command loop using readline
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'tjr> ',
  });

  rl.prompt();

  rl.on('line', async (input) => {
    const parts = input.trim().split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);

    try {
      switch (cmd) {
        case '/health':
          const healthResult = await healthCommand.execute(args, {
            format: 'text',
            verbose: config.app.verbose,
          });
          console.log(healthResult.output);
          break;

        case '/daily':
          const dailyResult = await dailyCommand.execute(args, {
            format: 'text',
            dryRun: config.app.dryRun,
          });
          console.log(dailyResult.output);
          break;

        case '/exit':
        case '/quit':
          console.log('Goodbye!');
          rl.close();
          await container.shutdownAll();
          process.exit(0);
          break;

        case '':
          break;

        default:
          console.log(`Unknown command: ${cmd}`);
          console.log('Type /health, /daily, or /exit');
      }
    } catch (error) {
      logger.error('Command execution failed', { error });
      console.error('Error:', error instanceof Error ? error.message : String(error));
    }

    rl.prompt();
  });

  rl.on('close', async () => {
    logger.info('CLI shutting down');
    await container.shutdownAll();
    process.exit(0);
  });
}

/**
 * Execute a single command
 */
async function executeCommand(
  container: IContainer,
  commandName: string,
  args: string[],
  config: Config,
  _logger: Logger
): Promise<void> {
  let command: Command | undefined;

  switch (commandName) {
    case 'health':
      command = container.resolve<Command>(TOKENS.HealthCommand);
      break;
    case 'daily':
      command = container.resolve<Command>(TOKENS.DailyCommand);
      break;
    default:
      console.error(`Unknown command: ${commandName}`);
      showHelp();
      process.exit(1);
  }

  if (command) {
    const result = await command.execute(args, {
      format: 'text',
      dryRun: config.app.dryRun,
      verbose: config.app.verbose,
    });

    if (result.output) {
      console.log(String(result.output));
    }

    if (!result.success) {
      process.exit(1);
    }
  }

  // Shutdown after command execution
  await container.shutdownAll();
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
TJR Suite - Trading Journal & Analysis Platform

Usage: tjr [command] [options]

Commands:
  health              Check health of all services
  daily [symbol]      Analyze daily market structure

Options:
  --dry-run          Run in deterministic test mode
  --verbose, -v      Enable verbose logging
  --help, -h         Show this help message
  --version          Show version information

Environment Variables:
  NODE_ENV           Environment (development/staging/production)
  DRY_RUN            Enable dry run mode
  LOG_LEVEL          Logging level (error/warn/info/debug/trace)
  PROVIDER_TYPE      Data provider (fixture/polygon/alpaca)
  CACHE_TYPE         Cache type (memory/redis)
  DATABASE_TYPE      Database type (sqlite/postgres)
  DATABASE_URL       Database connection URL
  DISCORD_ENABLED    Enable Discord bot interface
  DISCORD_TOKEN      Discord bot token
  ANTHROPIC_API_KEY  Anthropic API key for Claude integration

Examples:
  tjr health                    Check system health
  tjr daily SPY                 Analyze SPY for today
  tjr daily QQQ 2025-09-29      Analyze QQQ for specific date
  tjr --dry-run health          Run health check with fixtures
`);
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
