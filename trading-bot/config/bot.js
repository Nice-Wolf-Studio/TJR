require('dotenv').config();

/**
 * Discord Bot Configuration
 * Centralized configuration management for the trading bot
 */
const resolvedClientId = process.env.DISCORD_APP_ID || process.env.DISCORD_CLIENT_ID;

const config = {
  // Discord Bot Settings
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: resolvedClientId,
    guildId: process.env.DISCORD_GUILD_ID, // Optional: for guild-specific commands
    prefix: process.env.COMMAND_PREFIX || '!',
    intents: [
      'Guilds',
      'GuildMessages',
      'MessageContent',
      'GuildMembers',
      'DirectMessages'
    ],
    // Bot status settings
    activity: {
      name: 'Market Analysis',
      type: 'WATCHING' // PLAYING, STREAMING, LISTENING, WATCHING, COMPETING
    }
  },

  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'trading_bot',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: process.env.NODE_ENV === 'production',
    pool: {
      max: 20,
      idle: 30000,
      acquire: 60000
    }
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB || 0,
    // Connection options
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxRetriesPerRequest: null
  },

  // Express Server Configuration
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    }
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: './logs',
    maxFiles: '14d',
    maxSize: '20m',
    format: process.env.LOG_FORMAT || 'combined'
  },

  // Trading Bot Specific Settings
  trading: {
    // Market sessions (UTC times)
    sessions: {
      london: { open: '07:00', close: '16:00' },
      newYork: { open: '12:00', close: '21:00' },
      asian: { open: '21:00', close: '06:00' }
    },
    // Default trading pairs
    defaultPairs: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'],
    // Supported timeframes
    timeframes: ['1M', '5M', '15M', '30M', '1H', '4H', '1D'],
    // Rate limiting
    rateLimits: {
      commands: {
        points: 5, // Number of commands
        duration: 60 // Per 60 seconds
      },
      analysis: {
        points: 3, // Number of analysis requests
        duration: 300 // Per 5 minutes
      }
    }
  },

  // Command Settings
  commands: {
    cooldown: 3000, // 3 seconds default cooldown
    ownerOnly: process.env.OWNER_IDS ? process.env.OWNER_IDS.split(',') : [],
    adminRoles: process.env.ADMIN_ROLES ? process.env.ADMIN_ROLES.split(',') : ['Admin', 'Moderator'],
    enableHelp: true,
    caseSensitive: false
  },

  // Environment
  environment: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV !== 'production',
  isProduction: process.env.NODE_ENV === 'production',

  // API Keys (for external services)
  apis: {
    // Add your API keys here
    tradingView: process.env.TRADINGVIEW_API_KEY,
    alphaVantage: process.env.ALPHA_VANTAGE_API_KEY,
    twelveData: process.env.TWELVE_DATA_API_KEY
  },

  // Webhook Configuration
  webhooks: {
    alerts: process.env.ALERT_WEBHOOK_URL,
    errors: process.env.ERROR_WEBHOOK_URL,
    logs: process.env.LOG_WEBHOOK_URL
  }
};

// Validation function
function validateConfig() {
  const required = [
    'discord.token',
    'database.password'
  ];

  const missing = required.filter(path => {
    const keys = path.split('.');
    let value = config;
    for (const key of keys) {
      value = value[key];
      if (value === undefined || value === null) return true;
    }
    return false;
  });

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
}

// Export configuration with validation
module.exports = {
  ...config,
  validateConfig
};
