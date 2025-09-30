/**
 * Service tokens for dependency injection
 *
 * Use symbols to ensure uniqueness and avoid naming conflicts
 */

// Core services
export const TOKENS = {
  // Core infrastructure
  Logger: Symbol('Logger'),
  Config: Symbol('Config'),
  Container: Symbol('Container'),

  // Application services
  DiscordService: Symbol('DiscordService'),
  ProviderService: Symbol('ProviderService'),
  CacheService: Symbol('CacheService'),
  AnalysisService: Symbol('AnalysisService'),
  CalendarService: Symbol('CalendarService'),
  DatabaseService: Symbol('DatabaseService'),

  // Command services
  CommandRegistry: Symbol('CommandRegistry'),
  HealthCommand: Symbol('HealthCommand'),
  DailyCommand: Symbol('DailyCommand'),

  // Utility services
  FixtureLoader: Symbol('FixtureLoader'),
  WiringGraphRenderer: Symbol('WiringGraphRenderer'),
} as const;

/**
 * Type-safe token type
 */
export type ServiceToken = typeof TOKENS[keyof typeof TOKENS];

/**
 * Get token name for debugging
 */
export function getTokenName(token: symbol): string {
  const entry = Object.entries(TOKENS).find(([_, t]) => t === token);
  return entry ? entry[0] : token.toString();
}