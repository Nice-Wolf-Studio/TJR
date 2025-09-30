/**
 * Configuration schema using Zod
 */

import { z } from 'zod';

/**
 * Application configuration schema
 */
export const configSchema = z.object({
  app: z.object({
    env: z.enum(['development', 'staging', 'production']).default('development'),
    dryRun: z.boolean().default(false),
    verbose: z.boolean().default(false),
    name: z.string().default('TJR Suite'),
    version: z.string().default('0.1.0')
  }),

  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    format: z.enum(['json', 'pretty']).default('pretty'),
    output: z.enum(['console', 'file', 'both']).default('console'),
    filePath: z.string().optional()
  }),

  discord: z.object({
    enabled: z.boolean().default(false),
    token: z.string().optional(),
    clientId: z.string().optional(),
    guildId: z.string().optional(),
    commandPrefix: z.string().default('/')
  }),

  provider: z.object({
    type: z.enum(['fixture', 'polygon', 'alpaca']).default('fixture'),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    timeout: z.number().default(30000),
    retries: z.number().default(3),
    cacheEnabled: z.boolean().default(true)
  }),

  cache: z.object({
    type: z.enum(['memory', 'redis']).default('memory'),
    defaultTTL: z.number().default(300000), // 5 minutes
    maxSize: z.number().default(100 * 1024 * 1024), // 100MB
    evictionPolicy: z.enum(['lru', 'lfu', 'fifo']).default('lru'),
    redis: z.object({
      host: z.string().default('localhost'),
      port: z.number().default(6379),
      password: z.string().optional(),
      db: z.number().default(0)
    }).optional()
  }),

  database: z.object({
    type: z.enum(['sqlite', 'postgres']).default('sqlite'),
    url: z.string().default('sqlite:tjr.db'),
    poolSize: z.number().default(10),
    migrations: z.object({
      enabled: z.boolean().default(true),
      path: z.string().default('./migrations')
    })
  }),

  calendar: z.object({
    timezone: z.string().default('America/New_York'),
    marketOpen: z.string().default('09:30'),
    marketClose: z.string().default('16:00'),
    preMarketOpen: z.string().default('04:00'),
    afterMarketClose: z.string().default('20:00')
  }),

  analysis: z.object({
    defaultSymbol: z.string().default('SPY'),
    defaultTimeframe: z.string().default('5m'),
    barsRequired: z.number().default(78), // Full trading day
    sessionDefinitions: z.array(z.object({
      name: z.string(),
      start: z.string(),
      end: z.string()
    })).default([
      { name: 'Pre-Market', start: '04:00', end: '09:30' },
      { name: 'Morning', start: '09:30', end: '11:30' },
      { name: 'Lunch', start: '11:30', end: '13:30' },
      { name: 'Afternoon', start: '13:30', end: '15:30' },
      { name: 'Close', start: '15:30', end: '16:00' }
    ])
  })
});

/**
 * Inferred configuration type
 */
export type Config = z.infer<typeof configSchema>;

/**
 * Environment variable mapping
 */
export const envMapping: Record<string, string> = {
  'NODE_ENV': 'app.env',
  'DRY_RUN': 'app.dryRun',
  'VERBOSE': 'app.verbose',
  'LOG_LEVEL': 'logging.level',
  'LOG_FORMAT': 'logging.format',
  'DISCORD_ENABLED': 'discord.enabled',
  'DISCORD_TOKEN': 'discord.token',
  'DISCORD_CLIENT_ID': 'discord.clientId',
  'DISCORD_GUILD_ID': 'discord.guildId',
  'PROVIDER_TYPE': 'provider.type',
  'PROVIDER_API_KEY': 'provider.apiKey',
  'CACHE_TYPE': 'cache.type',
  'DATABASE_URL': 'database.url',
  'DATABASE_TYPE': 'database.type'
};