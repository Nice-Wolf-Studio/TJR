# Trading Bot Configuration Reference

This comprehensive guide covers all configuration options available in the Trading Bot, from basic setup to advanced customizations.

## 📋 Table of Contents

- [Environment Variables](#environment-variables)
- [Configuration Files](#configuration-files)
- [Discord Bot Configuration](#discord-bot-configuration)
- [Database Configuration](#database-configuration)
- [Redis Configuration](#redis-configuration)
- [API Configuration](#api-configuration)
- [Trading Parameters](#trading-parameters)
- [Alert Configuration](#alert-configuration)
- [Security Configuration](#security-configuration)
- [Performance Configuration](#performance-configuration)
- [Logging Configuration](#logging-configuration)
- [Monitoring Configuration](#monitoring-configuration)
- [Environment-Specific Configurations](#environment-specific-configurations)

## 🌍 Environment Variables

Environment variables are the primary method for configuring the Trading Bot. They can be set in the system environment, `.env` files, or container orchestration platforms.

### Core Application Variables

#### Node.js Environment
```env
# Runtime environment (required)
NODE_ENV=production                    # production | development | test

# Server configuration
PORT=3000                             # HTTP server port
HOST=0.0.0.0                          # Bind address (0.0.0.0 for all interfaces)
CLUSTER_MODE=true                     # Enable cluster mode for scaling
WORKER_COUNT=0                        # Number of workers (0 = auto-detect CPU cores)

# Application metadata
APP_NAME=trading-bot                  # Application identifier
APP_VERSION=1.0.0                     # Version number
```

#### Security Variables
```env
# Authentication secrets (required in production)
JWT_SECRET=your_jwt_secret_minimum_32_chars    # JWT signing secret
API_SECRET_KEY=your_api_secret_key            # API authentication key
WEBHOOK_SECRET=your_webhook_secret            # Webhook signature verification
SESSION_SECRET=your_session_secret            # Session cookie secret

# Encryption keys
ENCRYPTION_KEY=your_32_char_encryption_key    # Data encryption key
SALT_ROUNDS=12                               # bcrypt salt rounds
```

### Discord Bot Configuration

```env
# Discord Bot Settings (required)
DISCORD_TOKEN=your_discord_bot_token          # Bot token from Discord Developer Portal
DISCORD_CLIENT_ID=your_discord_client_id      # Application client ID
DISCORD_GUILD_ID=your_guild_id               # Specific guild ID (optional)

# Bot Behavior
COMMAND_PREFIX=!                             # Command prefix character
BOT_ACTIVITY=Watching the markets           # Bot activity status
BOT_STATUS=online                           # online | idle | dnd | invisible

# Bot Features
ENABLE_SLASH_COMMANDS=true                  # Enable slash commands
ENABLE_MESSAGE_COMMANDS=true               # Enable message commands
AUTO_REGISTER_COMMANDS=true                # Auto-register commands on startup
COMMAND_SYNC_GUILD_ONLY=false              # Sync commands to guild only

# Bot Permissions
OWNER_IDS=123456789,987654321              # Comma-separated owner user IDs
ADMIN_ROLES=Admin,Moderator,Trading Admin  # Comma-separated admin roles
ALLOWED_CHANNELS=trading,analysis          # Allowed channel names (optional)
BLOCKED_USERS=                             # Comma-separated blocked user IDs
```

### Database Configuration

#### PostgreSQL Settings
```env
# Primary Database Connection (required)
DB_HOST=localhost                          # Database host
DB_PORT=5432                              # Database port
DB_NAME=trading_bot                       # Database name
DB_USER=trading_bot_user                  # Database username
DB_PASSWORD=secure_database_password      # Database password

# Alternative: Connection URL
DATABASE_URL=postgresql://user:pass@host:port/dbname?sslmode=require

# Connection Pool Settings
DB_POOL_MIN=2                             # Minimum connections in pool
DB_POOL_MAX=20                            # Maximum connections in pool
DB_POOL_IDLE_TIMEOUT=30000               # Idle connection timeout (ms)
DB_POOL_ACQUIRE_TIMEOUT=60000            # Connection acquire timeout (ms)

# SSL Configuration
DB_SSL=require                           # SSL mode: disable | prefer | require
DB_SSL_CERT_PATH=/path/to/client-cert.pem # Client certificate path
DB_SSL_KEY_PATH=/path/to/client-key.pem   # Client key path
DB_SSL_CA_PATH=/path/to/server-ca.pem     # CA certificate path

# Query Configuration
DB_QUERY_TIMEOUT=30000                   # Query timeout (ms)
DB_STATEMENT_TIMEOUT=60000               # Statement timeout (ms)
DB_LOG_QUERIES=false                     # Log all queries (development only)
```

#### TimescaleDB Settings
```env
# TimescaleDB Configuration
TIMESCALEDB_ENABLED=true                 # Enable TimescaleDB features
TIMESCALEDB_CHUNK_INTERVAL=1d            # Chunk interval for hypertables
TIMESCALEDB_COMPRESSION=true             # Enable compression
TIMESCALEDB_RETENTION_DAYS=90            # Data retention period
```

### Redis Configuration

```env
# Redis Connection (required for caching)
REDIS_HOST=localhost                     # Redis host
REDIS_PORT=6379                         # Redis port
REDIS_PASSWORD=redis_password           # Redis password
REDIS_DB=0                              # Redis database number

# Alternative: Connection URL
REDIS_URL=redis://:password@hostname:port/db

# Redis Cluster (for high availability)
REDIS_CLUSTER=false                     # Enable cluster mode
REDIS_CLUSTER_NODES=host1:port1,host2:port2  # Cluster node endpoints

# Connection Settings
REDIS_CONNECT_TIMEOUT=5000              # Connection timeout (ms)
REDIS_COMMAND_TIMEOUT=2000              # Command timeout (ms)
REDIS_MAX_RETRIES=3                     # Maximum retry attempts
REDIS_RETRY_DELAY=1000                  # Delay between retries (ms)

# SSL Configuration
REDIS_SSL=false                         # Enable SSL/TLS
REDIS_SSL_CERT_PATH=/path/to/cert.pem   # Client certificate path
REDIS_SSL_KEY_PATH=/path/to/key.pem     # Client key path

# Performance
REDIS_POOL_SIZE=10                      # Connection pool size
REDIS_KEEPALIVE=true                    # Enable keepalive
```

### API Configuration

```env
# API Server Settings
API_ENABLED=true                        # Enable REST API
API_VERSION=v1                          # API version prefix
API_BASE_PATH=/api                      # API base path
API_DOCS_ENABLED=true                   # Enable API documentation

# CORS Configuration
CORS_ORIGIN=*                          # Allowed origins (* for all)
CORS_METHODS=GET,POST,PUT,DELETE       # Allowed HTTP methods
CORS_HEADERS=Content-Type,Authorization # Allowed headers
CORS_CREDENTIALS=true                  # Allow credentials

# Request Limits
MAX_REQUEST_SIZE=10mb                  # Maximum request body size
MAX_UPLOAD_SIZE=50mb                   # Maximum file upload size
REQUEST_TIMEOUT=30000                  # Request timeout (ms)

# Compression
COMPRESSION_ENABLED=true               # Enable gzip compression
COMPRESSION_LEVEL=6                    # Compression level (1-9)
COMPRESSION_THRESHOLD=1024             # Minimum size to compress (bytes)
```

### External Services Configuration

#### Market Data Providers
```env
# Alpha Vantage
ALPHA_VANTAGE_API_KEY=your_api_key     # API key for Alpha Vantage
ALPHA_VANTAGE_RATE_LIMIT=5             # Requests per minute
ALPHA_VANTAGE_TIMEOUT=10000            # Request timeout (ms)

# Polygon.io
POLYGON_API_KEY=your_api_key           # API key for Polygon.io
POLYGON_RATE_LIMIT=100                 # Requests per minute
POLYGON_TIMEOUT=5000                   # Request timeout (ms)

# Twelve Data
TWELVE_DATA_API_KEY=your_api_key       # API key for Twelve Data
TWELVE_DATA_RATE_LIMIT=800             # Requests per day
TWELVE_DATA_TIMEOUT=8000               # Request timeout (ms)

# TradingView (if using)
TRADINGVIEW_USERNAME=your_username     # TradingView username
TRADINGVIEW_PASSWORD=your_password     # TradingView password
TRADINGVIEW_SESSION_TIMEOUT=3600       # Session timeout (seconds)

# Custom Data Provider
CUSTOM_DATA_PROVIDER=false             # Enable custom data provider
CUSTOM_DATA_ENDPOINT=https://api.custom.com  # Custom API endpoint
CUSTOM_DATA_API_KEY=your_api_key       # Custom API key
```

## 📄 Configuration Files

### Main Configuration (config/index.js)

```javascript
const config = {
  // Application settings
  app: {
    name: process.env.APP_NAME || 'trading-bot',
    version: process.env.APP_VERSION || '1.0.0',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0'
  },

  // Discord bot configuration
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
    prefix: process.env.COMMAND_PREFIX || '!',
    activity: process.env.BOT_ACTIVITY || 'Watching the markets',
    status: process.env.BOT_STATUS || 'online',
    intents: [
      'Guilds',
      'GuildMessages',
      'MessageContent',
      'GuildMembers'
    ]
  },

  // Database configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'trading_bot',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    pool: {
      min: parseInt(process.env.DB_POOL_MIN) || 2,
      max: parseInt(process.env.DB_POOL_MAX) || 20,
      idle: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
      acquire: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT) || 60000
    },
    ssl: process.env.DB_SSL === 'require' ? { rejectUnauthorized: false } : false,
    logging: process.env.DB_LOG_QUERIES === 'true' ? console.log : false
  },

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB) || 0,
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT) || 5000,
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT) || 2000,
    retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY) || 1000,
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES) || 3
  }
};

module.exports = config;
```

### Trading Configuration (config/trading.js)

```javascript
module.exports = {
  // Supported trading pairs
  pairs: {
    major: [
      'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF',
      'AUDUSD', 'USDCAD', 'NZDUSD'
    ],
    minor: [
      'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY',
      'EURCHF', 'GBPCHF', 'AUDCHF'
    ],
    exotic: [
      'USDSEK', 'USDNOK', 'USDDKK', 'USDPLN',
      'USDHUF', 'USDCZK', 'USDTRY'
    ]
  },

  // Supported timeframes
  timeframes: [
    '1M', '5M', '15M', '30M',
    '1H', '4H', '1D', '1W'
  ],

  // Default analysis parameters
  analysis: {
    confluenceScorer: {
      tier1Weight: parseFloat(process.env.TIER1_WEIGHT) || 3.0,
      tier2Weight: parseFloat(process.env.TIER2_WEIGHT) || 2.0,
      tier3Weight: parseFloat(process.env.TIER3_WEIGHT) || 1.0,
      minScore: parseFloat(process.env.MIN_CONFLUENCE_SCORE) || 5.0,
      strongScore: parseFloat(process.env.STRONG_CONFLUENCE_SCORE) || 8.0,
      extremeScore: parseFloat(process.env.EXTREME_CONFLUENCE_SCORE) || 12.0,
      maxDistance: parseFloat(process.env.MAX_CONFLUENCE_DISTANCE) || 0.01,
      maxAge: parseInt(process.env.MAX_CONFLUENCE_AGE) || 48 * 60 * 60 * 1000
    },

    riskManagement: {
      maxRiskPerTrade: parseFloat(process.env.MAX_RISK_PER_TRADE) || 2.0,
      maxDailyRisk: parseFloat(process.env.MAX_DAILY_RISK) || 6.0,
      minRiskReward: parseFloat(process.env.MIN_RISK_REWARD) || 1.5,
      positionSizing: process.env.POSITION_SIZING_METHOD || 'fixed_percentage'
    },

    marketStructure: {
      lookbackPeriod: parseInt(process.env.STRUCTURE_LOOKBACK) || 100,
      significanceThreshold: parseFloat(process.env.SIGNIFICANCE_THRESHOLD) || 0.618,
      trendStrengthPeriod: parseInt(process.env.TREND_STRENGTH_PERIOD) || 50
    }
  },

  // Session times (UTC)
  sessions: {
    asian: { start: '21:00', end: '06:00', timezone: 'UTC' },
    london: { start: '07:00', end: '16:00', timezone: 'UTC' },
    newYork: { start: '12:00', end: '21:00', timezone: 'UTC' },
    sydney: { start: '21:00', end: '06:00', timezone: 'UTC' }
  }
};
```

## 🤖 Discord Bot Configuration

### Command Configuration

#### Command Cooldowns (milliseconds)
```env
# Global cooldown settings
GLOBAL_COOLDOWN=1000                   # Global cooldown between any commands
COMMAND_COOLDOWN_ENABLED=true         # Enable command cooldowns

# Individual command cooldowns
PING_COOLDOWN=5000                    # Ping command (5 seconds)
BIAS_COOLDOWN=10000                   # Bias analysis (10 seconds)
LEVELS_COOLDOWN=15000                 # Levels analysis (15 seconds)
SETUP_COOLDOWN=20000                  # Setup scanner (20 seconds)
FLOW_COOLDOWN=15000                   # Order flow analysis (15 seconds)
HELP_COOLDOWN=3000                    # Help command (3 seconds)
```

#### Command Permissions
```env
# Permission levels
PUBLIC_COMMANDS=ping,help,info                    # Commands available to everyone
REGISTERED_COMMANDS=bias,levels,setup,flow       # Commands for registered users
PREMIUM_COMMANDS=mtf,confluence,advanced         # Premium user commands
ADMIN_COMMANDS=reload,shutdown,config            # Admin-only commands

# Role-based permissions
ADMIN_ROLE_NAMES=Admin,Moderator,Bot Admin      # Admin role names
PREMIUM_ROLE_NAMES=Premium,VIP,Trader           # Premium role names
BLOCKED_ROLE_NAMES=Muted,Banned                 # Blocked role names
```

### Bot Behavior Configuration

```javascript
// config/bot.js
module.exports = {
  // Command handling
  commands: {
    prefix: process.env.COMMAND_PREFIX || '!',
    caseSensitive: false,
    allowDMs: process.env.ALLOW_DM_COMMANDS === 'true',
    deleteInvokingMessage: process.env.DELETE_COMMAND_MESSAGE === 'true',

    // Cooldowns (in milliseconds)
    cooldowns: {
      global: parseInt(process.env.GLOBAL_COOLDOWN) || 1000,
      perUser: parseInt(process.env.USER_COOLDOWN) || 5000,
      commands: {
        ping: parseInt(process.env.PING_COOLDOWN) || 5000,
        bias: parseInt(process.env.BIAS_COOLDOWN) || 10000,
        levels: parseInt(process.env.LEVELS_COOLDOWN) || 15000,
        setup: parseInt(process.env.SETUP_COOLDOWN) || 20000,
        flow: parseInt(process.env.FLOW_COOLDOWN) || 15000
      }
    },

    // Error handling
    errorHandling: {
      showStackTrace: process.env.NODE_ENV === 'development',
      logErrors: true,
      respondToErrors: true,
      errorEmbedColor: '#ff0000'
    }
  },

  // Embed settings
  embeds: {
    defaultColor: process.env.DEFAULT_EMBED_COLOR || '#0099ff',
    successColor: process.env.SUCCESS_EMBED_COLOR || '#00ff00',
    errorColor: process.env.ERROR_EMBED_COLOR || '#ff0000',
    warningColor: process.env.WARNING_EMBED_COLOR || '#ffcc00',
    includeTimestamp: process.env.INCLUDE_EMBED_TIMESTAMP !== 'false',
    includeFooter: process.env.INCLUDE_EMBED_FOOTER !== 'false'
  },

  // Features
  features: {
    slashCommands: process.env.ENABLE_SLASH_COMMANDS === 'true',
    messageCommands: process.env.ENABLE_MESSAGE_COMMANDS !== 'false',
    autoComplete: process.env.ENABLE_AUTO_COMPLETE === 'true',
    contextMenus: process.env.ENABLE_CONTEXT_MENUS === 'true'
  }
};
```

## 🗄️ Database Configuration

### Connection Configuration

```javascript
// config/database.js
const config = {
  development: {
    username: process.env.DB_USER || 'trading_bot_dev',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'trading_bot_dev',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    dialect: 'postgres',

    pool: {
      max: parseInt(process.env.DB_POOL_MAX) || 5,
      min: parseInt(process.env.DB_POOL_MIN) || 1,
      acquire: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT) || 30000,
      idle: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 10000
    },

    logging: process.env.DB_LOG_QUERIES === 'true' ? console.log : false,

    // Development specific
    benchmark: true,
    retry: {
      match: [/ECONNRESET/, /EHOSTUNREACH/, /ETIMEDOUT/],
      max: 3
    }
  },

  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 5432,
    dialect: 'postgres',

    pool: {
      max: parseInt(process.env.DB_POOL_MAX) || 20,
      min: parseInt(process.env.DB_POOL_MIN) || 5,
      acquire: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT) || 60000,
      idle: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 10000
    },

    ssl: process.env.DB_SSL === 'require' ? {
      require: true,
      rejectUnauthorized: false
    } : false,

    logging: false,

    // Production optimizations
    dialectOptions: {
      statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 60000,
      query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 30000,
      ssl: process.env.DB_SSL === 'require' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  }
};

module.exports = config;
```

### Migration Configuration

```javascript
// database/migrations/config.js
module.exports = {
  // Migration settings
  migrations: {
    directory: './database/migrations',
    tableName: 'knex_migrations',
    extension: 'js',
    disableTransactions: false
  },

  // Seed settings
  seeds: {
    directory: './database/seeds',
    extension: 'js'
  },

  // TimescaleDB specific
  timescaledb: {
    enabled: process.env.TIMESCALEDB_ENABLED === 'true',
    chunkTimeInterval: process.env.TIMESCALEDB_CHUNK_INTERVAL || '1 day',
    compressionEnabled: process.env.TIMESCALEDB_COMPRESSION === 'true',
    retentionPolicy: process.env.TIMESCALEDB_RETENTION_DAYS + ' days' || '90 days'
  }
};
```

## 🔴 Redis Configuration

### Connection and Performance Settings

```javascript
// config/redis.js
module.exports = {
  // Connection settings
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB) || 0,

    // Connection options
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT) || 5000,
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT) || 2000,
    lazyConnect: true,
    keepAlive: parseInt(process.env.REDIS_KEEPALIVE) || 30000,

    // Retry strategy
    retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY) || 100,
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES) || 3,
    retryDelayOnClusterDown: 300,
    retryDelayOnClusterDown: 300,
    maxRetriesPerRequest: null
  },

  // Cluster configuration (if using Redis Cluster)
  cluster: {
    enabled: process.env.REDIS_CLUSTER === 'true',
    nodes: process.env.REDIS_CLUSTER_NODES?.split(',').map(node => {
      const [host, port] = node.split(':');
      return { host, port: parseInt(port) };
    }) || [],

    options: {
      enableOfflineQueue: false,
      redisOptions: {
        password: process.env.REDIS_PASSWORD
      }
    }
  },

  // Cache configuration
  cache: {
    defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL) || 300, // 5 minutes
    keyPrefix: process.env.CACHE_KEY_PREFIX || 'trading-bot:',

    // Cache categories with different TTLs
    ttlByType: {
      'user-session': parseInt(process.env.CACHE_SESSION_TTL) || 3600,     // 1 hour
      'market-data': parseInt(process.env.CACHE_MARKET_DATA_TTL) || 60,    // 1 minute
      'analysis-result': parseInt(process.env.CACHE_ANALYSIS_TTL) || 300,  // 5 minutes
      'rate-limit': parseInt(process.env.CACHE_RATE_LIMIT_TTL) || 900,     // 15 minutes
      'command-cooldown': parseInt(process.env.CACHE_COOLDOWN_TTL) || 60   // 1 minute
    }
  }
};
```

## 🚦 Rate Limiting Configuration

### Rate Limit Settings

```env
# Global rate limiting
RATE_LIMITING_ENABLED=true            # Enable rate limiting
RATE_LIMIT_WINDOW=900000              # Time window (15 minutes)
RATE_LIMIT_MAX=100                    # Max requests per window
RATE_LIMIT_SKIP_SUCCESSFUL=false      # Skip counting successful requests
RATE_LIMIT_SKIP_FAILED=false          # Skip counting failed requests

# Command-specific rate limits (per user)
BIAS_RATE_LIMIT=3                     # Bias commands per 15 minutes
LEVELS_RATE_LIMIT=3                   # Levels commands per 15 minutes
SETUP_RATE_LIMIT=2                    # Setup commands per 15 minutes
FLOW_RATE_LIMIT=3                     # Flow commands per 15 minutes

# API rate limits
API_RATE_LIMIT_WINDOW=3600000         # API window (1 hour)
API_RATE_LIMIT_MAX=1000               # API requests per hour
API_RATE_LIMIT_PREMIUM_MAX=5000       # Premium API requests per hour

# WebSocket rate limits
WS_RATE_LIMIT_WINDOW=60000            # WebSocket window (1 minute)
WS_RATE_LIMIT_MAX=50                  # WebSocket messages per minute
```

### Rate Limiter Configuration

```javascript
// config/rateLimiter.js
const { RateLimiterRedis, RateLimiterMemory } = require('rate-limiter-flexible');

const rateLimiterConfig = {
  // Global API rate limiter
  api: new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'api_rate_limit',
    points: parseInt(process.env.API_RATE_LIMIT_MAX) || 1000,
    duration: parseInt(process.env.API_RATE_LIMIT_WINDOW) / 1000 || 3600,
    blockDuration: 3600, // Block for 1 hour if limit exceeded
    execEvenly: true
  }),

  // Discord command rate limiter
  discord: new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: 'discord_rate_limit',
    points: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    duration: parseInt(process.env.RATE_LIMIT_WINDOW) / 1000 || 900,
    blockDuration: 900 // Block for 15 minutes
  }),

  // Command-specific rate limiters
  commands: {
    bias: new RateLimiterMemory({
      keyPrefix: 'cmd_bias',
      points: parseInt(process.env.BIAS_RATE_LIMIT) || 3,
      duration: 900, // 15 minutes
      blockDuration: 900
    }),

    levels: new RateLimiterMemory({
      keyPrefix: 'cmd_levels',
      points: parseInt(process.env.LEVELS_RATE_LIMIT) || 3,
      duration: 900,
      blockDuration: 900
    })
  }
};

module.exports = rateLimiterConfig;
```

## 📊 Trading Parameters Configuration

### Analysis Engine Settings

```env
# Confluence Scoring System
TIER1_WEIGHT=3.0                      # Tier 1 confluence weight
TIER2_WEIGHT=2.0                      # Tier 2 confluence weight
TIER3_WEIGHT=1.0                      # Tier 3 confluence weight
MIN_CONFLUENCE_SCORE=5.0              # Minimum score for trade consideration
STRONG_CONFLUENCE_SCORE=8.0           # Strong confluence threshold
EXTREME_CONFLUENCE_SCORE=12.0         # Extreme confluence threshold
MAX_CONFLUENCE_DISTANCE=0.01          # Maximum distance for confluence (1%)
MAX_CONFLUENCE_AGE=172800000          # Maximum confluence age (48 hours)

# Market Structure Analysis
STRUCTURE_LOOKBACK=100                # Lookback period for structure analysis
SIGNIFICANCE_THRESHOLD=0.618          # Significance threshold (Golden Ratio)
TREND_STRENGTH_PERIOD=50              # Period for trend strength calculation
BOS_CONFIRMATION_BARS=3               # Bars for BOS confirmation

# Risk Management
MAX_RISK_PER_TRADE=2.0               # Maximum risk per trade (%)
MAX_DAILY_RISK=6.0                   # Maximum daily risk (%)
MIN_RISK_REWARD=1.5                  # Minimum risk-reward ratio
POSITION_SIZING_METHOD=fixed_percentage  # Position sizing method

# Pattern Recognition
PATTERN_LOOKBACK=50                   # Lookback for pattern recognition
MIN_PATTERN_STRENGTH=7                # Minimum pattern strength
PATTERN_CONFIRMATION_BARS=2           # Bars for pattern confirmation
```

### Market Data Configuration

```env
# Data Collection
DATA_COLLECTION_ENABLED=true          # Enable market data collection
DATA_UPDATE_INTERVAL=60000            # Update interval (1 minute)
DATA_RETENTION_DAYS=90                # Data retention period
DATA_VALIDATION_ENABLED=true          # Enable data validation

# Mock Data (Development)
ENABLE_MOCK_DATA=false                # Use mock data instead of live
MOCK_VOLATILITY_FACTOR=1.0           # Mock data volatility multiplier
MOCK_TREND_BIAS=0.0                  # Mock data trend bias (-1 to 1)

# Data Sources Priority
PRIMARY_DATA_SOURCE=polygon           # Primary data source
FALLBACK_DATA_SOURCE=alphavantage     # Fallback data source
DATA_SOURCE_TIMEOUT=10000             # Data source timeout (ms)
MAX_DATA_SOURCE_RETRIES=3             # Maximum retry attempts
```

## 🔔 Alert Configuration

### Alert System Settings

```env
# Alert System
ALERTS_ENABLED=true                   # Enable alert system
ALERT_QUEUE_SIZE=1000                # Maximum alerts in queue
ALERT_BATCH_SIZE=10                  # Alerts processed per batch
ALERT_PROCESSING_INTERVAL=5000       # Processing interval (ms)

# Alert Types
PRICE_ALERTS_ENABLED=true            # Enable price alerts
CONFLUENCE_ALERTS_ENABLED=true       # Enable confluence alerts
PATTERN_ALERTS_ENABLED=true          # Enable pattern alerts
NEWS_ALERTS_ENABLED=false            # Enable news alerts

# Alert Channels
DISCORD_ALERTS_ENABLED=true          # Send alerts to Discord
EMAIL_ALERTS_ENABLED=false           # Send email alerts
WEBHOOK_ALERTS_ENABLED=false         # Send webhook alerts
SMS_ALERTS_ENABLED=false             # Send SMS alerts

# Alert Limits
MAX_ALERTS_PER_USER=50               # Maximum alerts per user
MAX_ALERTS_PER_PAIR=20               # Maximum alerts per currency pair
ALERT_EXPIRY_DAYS=30                 # Alert expiry period
```

### Notification Configuration

```javascript
// config/alerts.js
module.exports = {
  // Alert delivery methods
  delivery: {
    discord: {
      enabled: process.env.DISCORD_ALERTS_ENABLED === 'true',
      channelId: process.env.ALERT_CHANNEL_ID,
      mentionRoles: process.env.ALERT_MENTION_ROLES?.split(',') || [],
      embedColor: process.env.ALERT_EMBED_COLOR || '#ffcc00'
    },

    email: {
      enabled: process.env.EMAIL_ALERTS_ENABLED === 'true',
      smtpHost: process.env.EMAIL_SMTP_HOST,
      smtpPort: parseInt(process.env.EMAIL_SMTP_PORT) || 587,
      smtpUser: process.env.EMAIL_SMTP_USER,
      smtpPass: process.env.EMAIL_SMTP_PASS,
      fromAddress: process.env.EMAIL_FROM_ADDRESS,
      replyToAddress: process.env.EMAIL_REPLY_TO_ADDRESS
    },

    webhook: {
      enabled: process.env.WEBHOOK_ALERTS_ENABLED === 'true',
      url: process.env.ALERT_WEBHOOK_URL,
      secret: process.env.ALERT_WEBHOOK_SECRET,
      timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 5000,
      retries: parseInt(process.env.WEBHOOK_RETRIES) || 3
    }
  },

  // Alert templates
  templates: {
    priceAlert: {
      title: 'Price Alert Triggered',
      color: '#ff9900',
      fields: ['pair', 'price', 'direction', 'timestamp']
    },

    confluenceAlert: {
      title: 'Confluence Zone Detected',
      color: '#0099ff',
      fields: ['pair', 'score', 'level', 'confluences', 'timestamp']
    },

    patternAlert: {
      title: 'Pattern Formation',
      color: '#00cc99',
      fields: ['pair', 'pattern', 'strength', 'projection', 'timestamp']
    }
  }
};
```

## 🔒 Security Configuration

### Authentication & Authorization

```env
# JWT Configuration
JWT_SECRET=your_jwt_secret_key_minimum_32_characters  # JWT signing secret
JWT_EXPIRES_IN=24h                    # JWT token expiration
JWT_ISSUER=trading-bot                # JWT issuer
JWT_AUDIENCE=api-users               # JWT audience

# API Key Settings
API_KEY_LENGTH=32                     # Generated API key length
API_KEY_PREFIX=tb_                    # API key prefix
API_KEY_EXPIRES_DAYS=90               # API key expiration (days)
MAX_API_KEYS_PER_USER=5               # Maximum API keys per user

# Session Configuration
SESSION_SECRET=your_session_secret    # Session secret key
SESSION_EXPIRES_HOURS=24              # Session expiration (hours)
SESSION_SECURE=true                   # Secure sessions (HTTPS only)
SESSION_HTTP_ONLY=true                # HTTP-only session cookies

# Password Security
PASSWORD_MIN_LENGTH=8                 # Minimum password length
PASSWORD_REQUIRE_UPPERCASE=true       # Require uppercase letter
PASSWORD_REQUIRE_LOWERCASE=true       # Require lowercase letter
PASSWORD_REQUIRE_NUMBERS=true         # Require numbers
PASSWORD_REQUIRE_SYMBOLS=false        # Require special characters
BCRYPT_SALT_ROUNDS=12                # bcrypt salt rounds
```

### Input Validation & Sanitization

```javascript
// config/validation.js
module.exports = {
  // Request validation
  request: {
    maxBodySize: process.env.MAX_REQUEST_SIZE || '10mb',
    maxParameterLength: parseInt(process.env.MAX_PARAM_LENGTH) || 1000,
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    requireContentType: true
  },

  // Input sanitization
  sanitization: {
    stripHtml: true,
    trimWhitespace: true,
    normalizeEmail: true,
    escapeHtml: true
  },

  // Currency pair validation
  currencyPair: {
    pattern: /^[A-Z]{6}$/,
    allowedPairs: process.env.ALLOWED_PAIRS?.split(',') || [
      'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF',
      'AUDUSD', 'USDCAD', 'NZDUSD'
    ]
  },

  // Timeframe validation
  timeframe: {
    allowed: process.env.ALLOWED_TIMEFRAMES?.split(',') || [
      '1M', '5M', '15M', '30M', '1H', '4H', '1D', '1W'
    ]
  },

  // Price validation
  price: {
    min: parseFloat(process.env.MIN_PRICE) || 0.00001,
    max: parseFloat(process.env.MAX_PRICE) || 999999.99999,
    decimals: parseInt(process.env.PRICE_DECIMALS) || 5
  }
};
```

## ⚡ Performance Configuration

### Caching Strategy

```env
# Cache Configuration
CACHE_ENABLED=true                    # Enable caching system
CACHE_DEFAULT_TTL=300                 # Default TTL (5 minutes)
CACHE_MAX_SIZE=1000                   # Maximum cached items
CACHE_KEY_PREFIX=trading-bot:         # Cache key prefix

# Cache TTL by Type (seconds)
CACHE_SESSION_TTL=3600               # User sessions (1 hour)
CACHE_MARKET_DATA_TTL=60             # Market data (1 minute)
CACHE_ANALYSIS_TTL=300               # Analysis results (5 minutes)
CACHE_RATE_LIMIT_TTL=900             # Rate limit data (15 minutes)
CACHE_COOLDOWN_TTL=60                # Command cooldowns (1 minute)

# Memory Cache
MEMORY_CACHE_ENABLED=true            # Enable in-memory L1 cache
MEMORY_CACHE_MAX_SIZE=500            # L1 cache max items
MEMORY_CACHE_TTL=60                  # L1 cache TTL (1 minute)
```

### Connection Pooling

```env
# Database Connection Pool
DB_POOL_MIN=2                        # Minimum connections
DB_POOL_MAX=20                       # Maximum connections
DB_POOL_IDLE_TIMEOUT=30000          # Idle connection timeout (ms)
DB_POOL_ACQUIRE_TIMEOUT=60000       # Connection acquire timeout (ms)

# Redis Connection Pool
REDIS_POOL_SIZE=10                   # Redis connection pool size
REDIS_KEEPALIVE=30000               # Keep-alive interval (ms)

# HTTP Connection Pool
HTTP_AGENT_KEEPALIVE=true           # Enable HTTP keep-alive
HTTP_AGENT_TIMEOUT=30000            # HTTP agent timeout (ms)
HTTP_AGENT_MAX_SOCKETS=50           # Maximum sockets per host
HTTP_AGENT_MAX_FREE_SOCKETS=10      # Maximum free sockets
```

## 📝 Logging Configuration

### Winston Logger Settings

```env
# Logging Configuration
LOG_LEVEL=info                       # Logging level (error, warn, info, debug)
LOG_FORMAT=json                      # Log format (json, simple, combined)
LOG_COLORIZE=true                    # Colorize console logs
LOG_TIMESTAMP=true                   # Include timestamps

# Log Files
LOG_FILE_ENABLED=true                # Enable file logging
LOG_FILE_MAX_SIZE=20971520          # Max log file size (20MB)
LOG_FILE_MAX_FILES=14               # Max number of log files
LOG_ROTATION_ENABLED=true           # Enable log rotation

# Log Categories
LOG_DISCORD=true                     # Log Discord events
LOG_TRADING=true                     # Log trading activities
LOG_API=true                         # Log API requests
LOG_DATABASE=false                   # Log database queries
LOG_CACHE=false                      # Log cache operations
LOG_ERRORS=true                      # Log errors
```

### Logger Configuration

```javascript
// config/logger.js
const winston = require('winston');
require('winston-daily-rotate-file');

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const createLogger = () => {
  const transports = [];

  // Console transport
  if (process.env.NODE_ENV !== 'production') {
    transports.push(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }));
  }

  // File transports
  if (process.env.LOG_FILE_ENABLED === 'true') {
    // Combined logs
    transports.push(new winston.transports.DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: process.env.LOG_FILE_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_FILE_MAX_FILES || '14d',
      format: logFormat
    }));

    // Error logs
    transports.push(new winston.transports.DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: process.env.LOG_FILE_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_FILE_MAX_FILES || '14d',
      format: logFormat
    }));

    // Trading logs
    transports.push(new winston.transports.DailyRotateFile({
      filename: 'logs/trading-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: process.env.LOG_FILE_MAX_SIZE || '50m',
      maxFiles: process.env.LOG_FILE_MAX_FILES || '30d',
      format: logFormat
    }));
  }

  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports,
    exitOnError: false
  });
};

module.exports = createLogger();
```

## 📊 Monitoring Configuration

### Health Check Settings

```env
# Health Monitoring
HEALTH_CHECK_ENABLED=true            # Enable health checks
HEALTH_CHECK_INTERVAL=30000          # Health check interval (ms)
HEALTH_CHECK_TIMEOUT=5000            # Health check timeout (ms)
HEALTH_CHECK_RETRIES=3               # Health check retry attempts

# Service Health Checks
DISCORD_HEALTH_CHECK=true            # Monitor Discord connection
DATABASE_HEALTH_CHECK=true           # Monitor database connection
REDIS_HEALTH_CHECK=true              # Monitor Redis connection
EXTERNAL_API_HEALTH_CHECK=true       # Monitor external APIs

# Performance Monitoring
MEMORY_MONITORING=true               # Monitor memory usage
CPU_MONITORING=true                  # Monitor CPU usage
DISK_MONITORING=true                 # Monitor disk usage
NETWORK_MONITORING=false             # Monitor network usage

# Alerting Thresholds
MEMORY_ALERT_THRESHOLD=85            # Memory usage alert threshold (%)
CPU_ALERT_THRESHOLD=80               # CPU usage alert threshold (%)
DISK_ALERT_THRESHOLD=90              # Disk usage alert threshold (%)
ERROR_RATE_THRESHOLD=5               # Error rate alert threshold (%)
```

### Metrics Configuration

```javascript
// config/metrics.js
module.exports = {
  // Prometheus metrics
  prometheus: {
    enabled: process.env.PROMETHEUS_ENABLED === 'true',
    endpoint: process.env.PROMETHEUS_ENDPOINT || '/metrics',
    port: parseInt(process.env.PROMETHEUS_PORT) || 9090,

    // Custom metrics
    customMetrics: {
      commandExecutions: {
        name: 'trading_bot_commands_total',
        help: 'Total number of commands executed',
        labelNames: ['command', 'status']
      },

      analysisRequests: {
        name: 'trading_bot_analysis_requests_total',
        help: 'Total number of analysis requests',
        labelNames: ['pair', 'timeframe', 'type']
      },

      responseTime: {
        name: 'trading_bot_response_duration_seconds',
        help: 'Response duration in seconds',
        labelNames: ['method', 'route', 'status']
      }
    }
  },

  // APM Configuration
  apm: {
    enabled: process.env.APM_ENABLED === 'true',
    serviceName: process.env.APM_SERVICE_NAME || 'trading-bot',
    serverUrl: process.env.APM_SERVER_URL,
    secretToken: process.env.APM_SECRET_TOKEN,
    environment: process.env.NODE_ENV || 'development'
  }
};
```

## 🌐 Environment-Specific Configurations

### Development Configuration

```env
# Development Environment
NODE_ENV=development
DEBUG=trading-bot:*
LOG_LEVEL=debug

# Development Features
ENABLE_DEBUG_ENDPOINTS=true          # Enable debug API endpoints
ENABLE_MOCK_DATA=true                # Use mock market data
HOT_RELOAD=true                      # Enable hot reloading
AUTO_RESTART=true                    # Auto-restart on file changes

# Relaxed Security (Development Only)
CORS_ORIGIN=*                        # Allow all origins
JWT_EXPIRES_IN=7d                    # Longer JWT expiration
RATE_LIMITING_ENABLED=false          # Disable rate limiting
SSL_VERIFY=false                     # Skip SSL verification

# Development Database
DB_LOG_QUERIES=true                  # Log all database queries
DB_POOL_MAX=5                        # Smaller connection pool
DB_SSL=disable                       # Disable SSL for local DB
```

### Production Configuration

```env
# Production Environment
NODE_ENV=production
LOG_LEVEL=info

# Production Security
CORS_ORIGIN=https://your-domain.com   # Specific allowed origins
JWT_EXPIRES_IN=1h                     # Shorter JWT expiration
RATE_LIMITING_ENABLED=true            # Enable rate limiting
SSL_VERIFY=true                       # Verify SSL certificates
HELMET_ENABLED=true                   # Enable Helmet security middleware

# Production Performance
CLUSTER_MODE=true                     # Enable cluster mode
WORKER_COUNT=0                        # Auto-detect CPU cores
COMPRESSION_ENABLED=true              # Enable response compression
CACHE_ENABLED=true                    # Enable all caching
DB_POOL_MAX=20                        # Larger connection pool

# Production Monitoring
PROMETHEUS_ENABLED=true               # Enable Prometheus metrics
APM_ENABLED=true                      # Enable APM monitoring
HEALTH_CHECK_ENABLED=true             # Enable health checks
ERROR_REPORTING_ENABLED=true          # Enable error reporting
```

### Testing Configuration

```env
# Test Environment
NODE_ENV=test
LOG_LEVEL=silent

# Test Database
TEST_DB_NAME=trading_bot_test         # Separate test database
DB_LOG_QUERIES=false                 # Disable query logging
DB_POOL_MAX=1                        # Single connection for tests

# Test Settings
ENABLE_MOCK_DATA=true                # Use mock data in tests
CACHE_ENABLED=false                  # Disable caching in tests
RATE_LIMITING_ENABLED=false          # Disable rate limiting
ALERTS_ENABLED=false                 # Disable alerts in tests
EXTERNAL_API_ENABLED=false           # Disable external APIs

# Test Timeouts
TEST_TIMEOUT=30000                   # Test timeout (30 seconds)
SETUP_TIMEOUT=60000                  # Setup timeout (1 minute)
TEARDOWN_TIMEOUT=30000               # Teardown timeout (30 seconds)
```

## 📋 Configuration Validation

### Environment Variable Validation

```javascript
// src/utils/configValidator.js
const joi = require('joi');

const configSchema = joi.object({
  // Required variables
  NODE_ENV: joi.string().valid('development', 'production', 'test').required(),
  DISCORD_TOKEN: joi.string().required(),
  DISCORD_CLIENT_ID: joi.string().required(),
  DB_PASSWORD: joi.string().required(),

  // Optional with defaults
  PORT: joi.number().integer().min(1).max(65535).default(3000),
  LOG_LEVEL: joi.string().valid('error', 'warn', 'info', 'debug').default('info'),

  // Conditional requirements
  DB_SSL: joi.when('NODE_ENV', {
    is: 'production',
    then: joi.string().valid('require', 'prefer', 'disable').default('require'),
    otherwise: joi.string().valid('require', 'prefer', 'disable').default('disable')
  }),

  // Complex validation
  JWT_SECRET: joi.string().min(32).required(),
  API_KEY_LENGTH: joi.number().integer().min(16).max(64).default(32),

  // Array validation
  ALLOWED_PAIRS: joi.string().pattern(/^[A-Z]{6}(,[A-Z]{6})*$/).optional(),
  OWNER_IDS: joi.string().pattern(/^\d+(,\d+)*$/).optional()
});

function validateConfig() {
  const { error, value } = configSchema.validate(process.env, {
    allowUnknown: true,
    stripUnknown: false
  });

  if (error) {
    console.error('Configuration validation failed:', error.details);
    process.exit(1);
  }

  return value;
}

module.exports = { validateConfig, configSchema };
```

### Configuration Loading

```javascript
// src/config/index.js
const { validateConfig } = require('../utils/configValidator');

// Load environment variables
require('dotenv').config({
  path: `.env.${process.env.NODE_ENV || 'development'}`
});

// Validate configuration
const validatedConfig = validateConfig();

// Export merged configuration
module.exports = {
  ...require('./app'),
  ...require('./discord'),
  ...require('./database'),
  ...require('./redis'),
  ...require('./trading'),
  ...require('./alerts'),

  // Runtime configuration
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',

  // Validated environment variables
  env: validatedConfig
};
```

## 🔧 Configuration Best Practices

### Security Best Practices

1. **Never commit secrets**: Use environment variables for all sensitive data
2. **Use strong secrets**: Minimum 32 characters for JWT secrets
3. **Rotate secrets regularly**: Implement secret rotation policies
4. **Validate all inputs**: Always validate configuration values
5. **Use different secrets per environment**: Production, staging, development

### Performance Best Practices

1. **Optimize connection pools**: Set appropriate pool sizes based on load
2. **Configure caching**: Use appropriate TTL values for different data types
3. **Set timeouts**: Configure reasonable timeouts for all operations
4. **Monitor resource usage**: Set up alerts for resource consumption
5. **Use clustering**: Enable cluster mode in production

### Maintainability Best Practices

1. **Document all variables**: Provide clear descriptions and examples
2. **Use consistent naming**: Follow a consistent naming convention
3. **Provide defaults**: Set sensible default values where appropriate
4. **Validate configuration**: Implement configuration validation
5. **Version configuration**: Track configuration changes in version control

---

## 📞 Support

For configuration support:
- **Documentation**: [GitHub Wiki](https://github.com/your-repo/wiki)
- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Discord**: Join our configuration support channel
- **Email**: config-support@trading-bot.com

## 📝 Configuration Checklist

### Pre-Deployment Checklist
- [ ] All required environment variables set
- [ ] Configuration validation passing
- [ ] Database connection tested
- [ ] Redis connection tested
- [ ] Discord bot token valid
- [ ] API keys configured
- [ ] SSL certificates installed (production)
- [ ] Rate limiting configured
- [ ] Logging configured
- [ ] Monitoring enabled
- [ ] Backup strategy configured

### Security Checklist
- [ ] Strong secrets generated
- [ ] No secrets in version control
- [ ] SSL/TLS enabled
- [ ] Rate limiting enabled
- [ ] Input validation enabled
- [ ] CORS properly configured
- [ ] Authentication configured
- [ ] Authorization rules set
- [ ] Audit logging enabled

---

*This configuration guide covers all aspects of Trading Bot configuration. Keep this document updated as new configuration options are added.*