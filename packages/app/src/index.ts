/**
 * Main exports for @tjr/app package
 */

// Container exports
export { Container } from './container/index.js';
export { TOKENS } from './container/tokens.js';
export type {
  Service,
  ServiceConfig,
  HealthStatus,
  IContainer,
  DependencyNode,
  ServiceFactory,
  ServiceRegistration,
} from './container/types.js';

// Configuration exports
export { loadConfig, getConfigSummary } from './config/index.js';
export type { Config } from './config/schema.js';

// Service exports
export { DiscordStub } from './services/discord/discord.stub.js';
export type { DiscordService, DiscordEmbed, DiscordStatus } from './services/discord/types.js';

export { FixtureProvider } from './services/providers/fixture-provider.js';
export type { ProviderService, ProviderStats, ProviderConfig } from './services/providers/types.js';

export { MemoryCache } from './services/cache/memory-cache.js';
export type { CacheService, CacheStats, CacheConfig } from './services/cache/types.js';

// Command exports
export { HealthCommand } from './commands/health.command.js';
export { DailyCommand } from './commands/daily.command.js';
export type { Command, CommandOptions, CommandResult, CommandRegistry } from './commands/types.js';

// Fixture exports
export {
  generateFixtureBars,
  generateSessionBars,
  generateTrendDay,
  loadFixtures,
} from './fixtures/index.js';
