import 'dotenv/config';

type ActivityType = 'PLAYING' | 'STREAMING' | 'LISTENING' | 'WATCHING' | 'COMPETING';

type DiscordIntent =
  | 'Guilds'
  | 'GuildMembers'
  | 'GuildMessages'
  | 'DirectMessages'
  | 'MessageContent';

interface DiscordActivityConfig {
  name: string;
  type: ActivityType;
}

interface DiscordConfig {
  token: string;
  clientId: string;
  guildId?: string;
  prefix: string;
  intents: DiscordIntent[];
  activity: DiscordActivityConfig;
}

interface DatabasePoolConfig {
  max: number;
  idle: number;
  acquire: number;
}

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  ssl: boolean;
  pool: DatabasePoolConfig;
}

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  retryDelayOnFailover: number;
  enableReadyCheck: boolean;
  maxRetriesPerRequest: number | null;
}

interface ServerCorsConfig {
  origin: string;
  credentials: boolean;
}

interface ServerConfig {
  port: number;
  host: string;
  cors: ServerCorsConfig;
}

interface LoggingConfig {
  level: string;
  dir: string;
  maxFiles: string;
  maxSize: string;
  format: string;
}

interface TradingSessionsConfig {
  london: { open: string; close: string };
  newYork: { open: string; close: string };
  asian: { open: string; close: string };
}

interface RateLimitConfig {
  points: number;
  duration: number;
}

interface TradingConfig {
  sessions: TradingSessionsConfig;
  defaultPairs: string[];
  timeframes: string[];
  rateLimits: {
    commands: RateLimitConfig;
    analysis: RateLimitConfig;
  };
}

interface CommandConfig {
  cooldown: number;
  ownerOnly: string[];
  adminRoles: string[];
  enableHelp: boolean;
  caseSensitive: boolean;
}

interface ApiKeysConfig {
  tradingView?: string;
  alphaVantage?: string;
  twelveData?: string;
}

interface WebhookConfig {
  alerts?: string;
  errors?: string;
  logs?: string;
}

export interface BotConfig {
  discord: DiscordConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  server: ServerConfig;
  logging: LoggingConfig;
  trading: TradingConfig;
  commands: CommandConfig;
  environment: string;
  isDevelopment: boolean;
  isProduction: boolean;
  apis: ApiKeysConfig;
  webhooks: WebhookConfig;
}

const resolvedClientId = process.env.DISCORD_APP_ID ?? process.env.DISCORD_CLIENT_ID ?? '';
const nodeEnv = process.env.NODE_ENV ?? 'development';

const config: BotConfig = {
  discord: {
    token: process.env.DISCORD_TOKEN ?? '',
    clientId: resolvedClientId,
    guildId: process.env.DISCORD_GUILD_ID || undefined,
    prefix: process.env.COMMAND_PREFIX ?? '!',
    intents: ['Guilds', 'GuildMessages', 'MessageContent', 'GuildMembers', 'DirectMessages'],
    activity: {
      name: 'Market Analysis',
      type: 'WATCHING'
    }
  },
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'trading_bot',
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: nodeEnv === 'production',
    pool: {
      max: 20,
      idle: 30_000,
      acquire: 60_000
    }
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD,
    db: Number(process.env.REDIS_DB ?? 0),
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxRetriesPerRequest: null
  },
  server: {
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? '0.0.0.0',
    cors: {
      origin: process.env.CORS_ORIGIN ?? '*',
      credentials: true
    }
  },
  logging: {
    level: process.env.LOG_LEVEL ?? 'info',
    dir: './logs',
    maxFiles: '14d',
    maxSize: '20m',
    format: process.env.LOG_FORMAT ?? 'combined'
  },
  trading: {
    sessions: {
      london: { open: '07:00', close: '16:00' },
      newYork: { open: '12:00', close: '21:00' },
      asian: { open: '21:00', close: '06:00' }
    },
    defaultPairs: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'],
    timeframes: ['1M', '5M', '15M', '30M', '1H', '4H', '1D'],
    rateLimits: {
      commands: {
        points: 5,
        duration: 60
      },
      analysis: {
        points: 3,
        duration: 300
      }
    }
  },
  commands: {
    cooldown: 3000,
    ownerOnly: process.env.OWNER_IDS ? process.env.OWNER_IDS.split(',') : [],
    adminRoles: process.env.ADMIN_ROLES ? process.env.ADMIN_ROLES.split(',') : ['Admin', 'Moderator'],
    enableHelp: true,
    caseSensitive: false
  },
  environment: nodeEnv,
  isDevelopment: nodeEnv !== 'production',
  isProduction: nodeEnv === 'production',
  apis: {
    tradingView: process.env.TRADINGVIEW_API_KEY,
    alphaVantage: process.env.ALPHA_VANTAGE_API_KEY ?? process.env.ALPHAVANTAGE_API_KEY,
    twelveData: process.env.TWELVE_DATA_API_KEY
  },
  webhooks: {
    alerts: process.env.ALERT_WEBHOOK_URL,
    errors: process.env.ERROR_WEBHOOK_URL,
    logs: process.env.LOG_WEBHOOK_URL
  }
};

export function validateConfig(target: BotConfig = config): void {
  if (!target.discord.token) {
    throw new Error('Missing required configuration: discord.token');
  }
  if (!target.database.password) {
    throw new Error('Missing required configuration: database.password');
  }
}

const runtimeConfig = {
  ...config,
  validateConfig: () => validateConfig(config)
};

export type BotRuntimeConfig = typeof runtimeConfig;

export default runtimeConfig;

// Preserve CommonJS compatibility for existing requires
module.exports = runtimeConfig;
