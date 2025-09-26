# Trading Bot - Advanced Discord Bot for Professional Market Analysis

A sophisticated, production-ready Discord bot designed for professional traders and market analysts. Built with modern Node.js architecture, this bot provides real-time market insights, technical analysis, and trading signals directly in Discord channels using advanced algorithmic trading methodologies.

## 🌟 Overview

The Trading Bot implements a unified trading framework based on institutional-grade analysis techniques including Smart Money Concepts (SMC), liquidity analysis, and confluence scoring systems. It's designed to help traders identify high-probability trading opportunities through systematic market structure analysis.

### Key Highlights
- **Institutional-Grade Analysis**: Implements advanced SMC concepts and liquidity analysis
- **Multi-Timeframe Confluence**: Analyzes market structure across multiple timeframes
- **Real-Time Processing**: Live market data integration with millisecond precision
- **Production Ready**: Built with enterprise-level architecture and reliability
- **Highly Configurable**: Extensive customization options for different trading styles

## 🎯 Core Trading Features

### Market Analysis Engine
- **Market Bias Analysis** - Daily directional analysis using institutional methodology
- **Smart Money Concepts** - Break of Structure (BOS), Order Blocks, Fair Value Gaps (FVG)
- **Liquidity Analysis** - Sweep detection, inducement identification, liquidity pools
- **Confluence Scoring** - Weighted scoring system with tier-based analysis (Tier 1-3)
- **Key Levels Detection** - Dynamic support/resistance, pivot points, session levels
- **Trade Setup Scanning** - Automated detection of high-probability opportunities
- **Order Flow Analysis** - Market sentiment and institutional activity monitoring
- **Multi-Timeframe Analysis** - Synchronized analysis across 1M to 1W timeframes

### Risk Management System
- **Position Sizing Calculator** - Risk-based position sizing with customizable parameters
- **Risk/Reward Analysis** - Automated R:R calculation and optimization
- **Drawdown Protection** - Maximum risk per trade and daily limits
- **Portfolio Risk Management** - Account-level risk monitoring and alerts

### Alert and Notification System
- **Real-time Alerts** - Instant notifications for market events and setups
- **Custom Alert Templates** - Configurable alert formats and delivery methods
- **Webhook Integration** - Integration with external systems and platforms
- **Session-Based Alerts** - Time-zone aware session monitoring

## 🤖 Bot Infrastructure

### Command System
- **Comprehensive Command Handler** - Modular command structure with hot-reloading
- **Permission Management** - Role-based access control and user permissions
- **Cooldown Protection** - Anti-spam protection with configurable cooldowns
- **Command Analytics** - Usage tracking and performance metrics
- **Help System** - Interactive help with command examples and usage

### Health Monitoring & Observability
- **Built-in Health Checks** - Comprehensive system health monitoring
- **Performance Metrics** - Real-time performance tracking and alerting
- **Resource Monitoring** - Memory, CPU, and network usage tracking
- **Uptime Monitoring** - Service availability and reliability metrics
- **Error Tracking** - Detailed error logging and notification system

### Security & Reliability
- **Rate Limiting** - Advanced rate limiting with multiple strategies
- **Input Validation** - Comprehensive input sanitization and validation
- **Error Recovery** - Automatic error recovery and graceful degradation
- **Audit Logging** - Complete audit trail for all operations
- **Data Encryption** - Secure storage of sensitive configuration data

## 📊 Technical Architecture

### Backend Infrastructure
- **Node.js 18+** - Modern JavaScript runtime with ES2022 features
- **TypeScript Support** - Full TypeScript configuration for type safety
- **Express.js Server** - RESTful API with middleware support
- **Discord.js v14** - Latest Discord API integration
- **Graceful Shutdown** - Proper cleanup and resource management

### Data Layer
- **PostgreSQL** - Primary database for structured data storage
- **TimescaleDB Extension** - Time-series data optimization for market data
- **Redis Caching** - High-performance caching and session management
- **Connection Pooling** - Optimized database connection management
- **Backup & Recovery** - Automated backup and disaster recovery systems

### Monitoring & Logging
- **Winston Logging** - Structured logging with multiple transports
- **Daily Log Rotation** - Automated log management and archival
- **Distributed Tracing** - Request tracing across system components
- **Metrics Collection** - Prometheus-compatible metrics export
- **Real-time Dashboards** - Grafana integration for monitoring

## Quick Start

### Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v18.0.0 or higher)
- **npm** or **yarn**
- **PostgreSQL** (v13 or higher)
- **Redis** (v6 or higher) - Optional but recommended

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd trading-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` file with your configuration:
   ```env
   DISCORD_TOKEN=your_discord_bot_token
   DISCORD_CLIENT_ID=your_client_id
   DB_PASSWORD=your_database_password
   # ... other configuration options
   ```

4. **Database setup** (if using PostgreSQL)
   ```bash
   # Create database
   createdb trading_bot

   # Run migrations (when available)
   npm run migrate
   ```

5. **Start the bot**
   ```bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   ```

## Configuration

### Discord Bot Setup

1. **Create Discord Application**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create new application
   - Navigate to "Bot" section
   - Create bot and copy token

2. **Bot Permissions**
   Required permissions for full functionality:
   - Send Messages
   - Read Messages
   - Embed Links
   - Attach Files
   - Read Message History
   - Use Slash Commands (if enabled)
   - Manage Messages (for cleanup commands)

3. **Invite Bot to Server**
   ```
   https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=274877906944&scope=bot
   ```

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DISCORD_TOKEN` | Discord bot token | Yes | - |
| `DISCORD_CLIENT_ID` | Discord application client ID | Yes | - |
| `COMMAND_PREFIX` | Bot command prefix | No | `!` |
| `DB_HOST` | PostgreSQL host | No | `localhost` |
| `DB_PORT` | PostgreSQL port | No | `5432` |
| `DB_NAME` | Database name | No | `trading_bot` |
| `DB_USER` | Database user | No | `postgres` |
| `DB_PASSWORD` | Database password | Yes | - |
| `REDIS_HOST` | Redis host | No | `localhost` |
| `REDIS_PORT` | Redis port | No | `6379` |
| `PORT` | Express server port | No | `3000` |
| `LOG_LEVEL` | Logging level | No | `info` |

## 💬 Discord Commands

### Core Trading Commands

#### Market Bias Analysis
```bash
!bias <pair>               # Get daily market bias for currency pair
!bias EURUSD              # Example: EUR/USD bias analysis
!b GBPUSD                 # Alias: short form
```
**Features:**
- Daily directional bias (Bullish/Bearish/Neutral)
- Strength rating (1-10 scale)
- Confidence level assessment
- Technical and fundamental factors
- Key support/resistance levels
- Session-based analysis

#### Key Levels Detection
```bash
!levels <pair>            # Get support/resistance levels
!levels GBPUSD           # Example: GBP/USD levels
!l USDJPY                # Alias: short form
!sr AUDUSD               # Alias: support/resistance
```
**Features:**
- Multi-level support/resistance zones
- Strength indicators for each level
- Pivot point calculations
- Session highs/lows (Asian, London, NY)
- Daily range and volatility metrics
- Price action confirmation levels

#### Trade Setup Scanner
```bash
!setup <timeframe> [pair] # Scan for trade opportunities
!setup 1H                # Scan 1-hour timeframe (all pairs)
!setup 4H EURUSD         # Scan 4-hour EUR/USD specifically
!setups 15M              # Alias: plural form
```
**Features:**
- Multi-pattern recognition (Breakouts, Pullbacks, Reversals)
- Entry/exit price calculations
- Stop-loss and take-profit suggestions
- Risk/reward ratio analysis
- Setup strength scoring
- Market condition assessment

#### Order Flow Analysis
```bash
!flow <pair>              # Analyze order flow and sentiment
!flow USDJPY             # Example: USD/JPY flow analysis
!orderflow EURUSD        # Alias: full form
```
**Features:**
- Institutional activity detection
- Liquidity sweep identification
- Smart Money Concepts analysis
- Volume profile analysis
- Market sentiment indicators
- Commitment of Traders data

### Utility Commands

#### System Health & Status
```bash
!ping                     # Check bot latency and system status
!health                   # Detailed health check report
!stats                    # Usage statistics and metrics
!uptime                   # System uptime information
```

#### Help & Information
```bash
!help                     # Display all available commands
!help <command>           # Get detailed help for specific command
!help bias                # Example: help for bias command
!commands                 # List commands by category
!info                     # Bot information and features
```

#### Configuration & Settings
```bash
!settings                 # View current bot settings
!timezone <zone>          # Set timezone for alerts
!alerts on/off           # Toggle alert notifications
!prefix <symbol>          # Change command prefix (admin only)
```

### Advanced Commands

#### Multi-Timeframe Analysis
```bash
!mtf <pair>               # Multi-timeframe confluence analysis
!mtf EURUSD              # Example: EUR/USD across timeframes
!confluence GBPUSD       # Alias: confluence analysis
```

#### Risk Management
```bash
!risk <account> <risk%>   # Calculate position size
!risk 10000 2            # Example: $10k account, 2% risk
!calculator              # Trading calculator tools
```

#### Alert Management
```bash
!alert <pair> <price>     # Set price alert
!alert EURUSD 1.0800     # Example: EUR/USD at 1.0800
!alerts                  # View active alerts
!alert remove <id>       # Remove specific alert
```

### Supported Instruments

#### Major Currency Pairs
- **EUR/USD** - Euro/US Dollar
- **GBP/USD** - British Pound/US Dollar
- **USD/JPY** - US Dollar/Japanese Yen
- **USD/CHF** - US Dollar/Swiss Franc
- **AUD/USD** - Australian Dollar/US Dollar
- **USD/CAD** - US Dollar/Canadian Dollar
- **NZD/USD** - New Zealand Dollar/US Dollar

#### Minor & Cross Pairs
- **EUR/GBP** - Euro/British Pound
- **EUR/JPY** - Euro/Japanese Yen
- **GBP/JPY** - British Pound/Japanese Yen
- **AUD/JPY** - Australian Dollar/Japanese Yen
- **Additional pairs available via configuration**

#### Supported Timeframes
- **1M** - 1 Minute
- **5M** - 5 Minutes
- **15M** - 15 Minutes
- **30M** - 30 Minutes
- **1H** - 1 Hour
- **4H** - 4 Hours
- **1D** - Daily
- **1W** - Weekly

### Command Permissions & Rate Limits

#### Permission Levels
- **Public**: Basic trading commands (bias, levels, setup)
- **Registered**: Advanced analysis and alerts
- **Premium**: Real-time data and priority processing
- **Admin**: Bot configuration and management

#### Rate Limits
- **Basic commands**: 5 per minute per user
- **Analysis commands**: 3 per minute per user
- **Alert commands**: 10 per hour per user
- **Admin commands**: No limits

## 🔧 Development Workflow

### Project Architecture
```
trading-bot/
├── src/                      # Source code
│   ├── bot/                 # Discord bot implementation
│   │   ├── commands/        # Command implementations
│   │   │   ├── bias.js      # Market bias analysis
│   │   │   ├── levels.js    # Key levels detection
│   │   │   ├── setup.js     # Trade setup scanner
│   │   │   ├── flow.js      # Order flow analysis
│   │   │   ├── ping.js      # Health check command
│   │   │   └── help.js      # Help system
│   │   ├── handlers/        # Event and command handlers
│   │   │   └── commandHandler.js
│   │   └── index.js         # Main bot entry point
│   │
│   ├── analysis/            # Trading analysis engine
│   │   ├── engine.js        # Main analysis engine
│   │   ├── confluence.js    # Confluence scoring system
│   │   ├── structure.js     # Market structure analysis
│   │   ├── liquidity.js     # Liquidity analysis
│   │   └── patterns.js      # Pattern recognition
│   │
│   ├── data/                # Data management
│   │   ├── collector.js     # Data collection service
│   │   ├── storage.js       # Data storage layer
│   │   ├── validator.js     # Data validation
│   │   ├── sources/         # External data sources
│   │   │   ├── alphavantage.js
│   │   │   ├── polygon.js
│   │   │   └── tradingview.js
│   │   └── index.js
│   │
│   ├── alerts/              # Alert system
│   │   ├── manager.js       # Alert management
│   │   ├── delivery.js      # Alert delivery
│   │   └── templates.js     # Alert templates
│   │
│   ├── database/            # Database layer
│   │   ├── connection.js    # Database connection
│   │   └── migrations.js    # Database migrations
│   │
│   ├── monitoring/          # System monitoring
│   │   └── healthCheck.js   # Health check service
│   │
│   └── utils/               # Utility functions
│       ├── logger.js        # Logging system
│       ├── errorHandler.js  # Error handling
│       ├── errorRecovery.js # Error recovery
│       ├── rateLimit.js     # Rate limiting
│       ├── analytics.js     # Analytics tracking
│       ├── math.js          # Mathematical utilities
│       └── risk.js          # Risk management
│
├── config/                  # Configuration files
│   └── bot.js              # Bot configuration
├── database/                # Database setup
├── docs/                    # Documentation
├── tests/                   # Test suites
├── coverage/                # Test coverage reports
├── logs/                    # Log files (auto-generated)
└── dist/                    # Compiled output (auto-generated)
```

### Available Scripts

#### Development Commands
```bash
npm run dev              # Start with nodemon (auto-restart)
npm run dev:debug        # Start with debugging enabled
npm run build            # Compile TypeScript to JavaScript
npm run build:watch      # Watch mode compilation
npm run clean            # Clean build artifacts
```

#### Production Commands
```bash
npm start               # Start production server
npm run start:pm2       # Start with PM2 process manager
npm run restart         # Restart production server
npm run stop            # Stop production server
```

#### Quality Assurance
```bash
npm run lint            # Run ESLint on source code
npm run lint:fix        # Fix ESLint issues automatically
npm run format          # Format code with Prettier
npm test                # Run test suite
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Generate coverage report
npm run audit           # Security audit
```

#### Database Management
```bash
npm run db:migrate      # Run database migrations
npm run db:rollback     # Rollback last migration
npm run db:seed         # Seed database with test data
npm run db:reset        # Reset database
npm run db:backup       # Backup database
npm run db:restore      # Restore database from backup
```

### Development Guidelines

#### Code Standards
- **ES2022+ Features**: Use modern JavaScript features
- **TypeScript**: Strict type checking enabled
- **ESLint**: Follow established coding standards
- **Prettier**: Consistent code formatting
- **JSDoc**: Document all public functions
- **Error Handling**: Comprehensive error handling and recovery

#### Testing Requirements
- **Unit Tests**: 80%+ code coverage required
- **Integration Tests**: API and database integration tests
- **Performance Tests**: Load and stress testing
- **Security Tests**: Vulnerability assessment

#### Git Workflow
```bash
# Feature development
git checkout -b feature/new-analysis-engine
git add .
git commit -m "feat: implement advanced confluence scoring"
git push origin feature/new-analysis-engine

# Code review and merge
gh pr create --title "Feature: Advanced Confluence Scoring"
# After review and approval
git checkout main
git pull origin main
```

### 🔌 API Integration

The bot includes a comprehensive RESTful API for external integrations and monitoring.

#### Core Endpoints

##### Health & Monitoring
```bash
GET /health              # System health check
GET /health/detailed     # Detailed health report
GET /metrics            # Prometheus metrics
GET /status             # Service status
```

##### Bot Information
```bash
GET /info               # Bot capabilities and features
GET /commands           # Available commands list
GET /stats              # Usage statistics
GET /uptime             # System uptime information
```

##### Trading Data
```bash
GET /api/bias/:pair     # Get market bias for pair
GET /api/levels/:pair   # Get key levels for pair
GET /api/setups/:timeframe  # Get trade setups
POST /api/analyze       # Custom analysis request
```

##### Webhook Integration
```bash
POST /webhook/alerts    # External alert webhook
POST /webhook/signals   # Trading signal webhook
POST /webhook/news      # News event webhook
```

#### Authentication
```javascript
// API Key authentication
headers: {
  'Authorization': 'Bearer your-api-key',
  'Content-Type': 'application/json'
}
```

#### Example API Response
```json
{
  "status": "success",
  "data": {
    "pair": "EURUSD",
    "bias": "bullish",
    "strength": 8,
    "confidence": 85,
    "levels": {
      "resistance": [1.0850, 1.0875, 1.0900],
      "support": [1.0800, 1.0775, 1.0750]
    }
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "meta": {
    "response_time": "150ms",
    "cache_hit": false
  }
}
```

### Adding New Features

#### Creating New Commands
```javascript
// src/bot/commands/example.js
module.exports = {
  name: 'example',
  aliases: ['ex', 'test'],
  description: 'Example command description',
  usage: '<required> [optional]',
  category: 'Trading',
  cooldown: 5000,
  permissions: ['SEND_MESSAGES'],
  args: true,

  async execute(message, args, client) {
    try {
      // Command implementation
      const result = await someAnalysisFunction(args[0]);

      const embed = new EmbedBuilder()
        .setTitle('Analysis Result')
        .setDescription(result.summary)
        .setColor('#00ff00');

      await message.reply({ embeds: [embed] });

    } catch (error) {
      logger.error('Error in example command:', error);
      await message.reply('An error occurred processing your request.');
    }
  }
};
```

#### Adding Analysis Modules
```javascript
// src/analysis/custom-indicator.js
class CustomIndicator {
  constructor(options = {}) {
    this.period = options.period || 14;
    this.threshold = options.threshold || 0.5;
  }

  calculate(data) {
    // Implementation
    return {
      value: calculatedValue,
      signal: 'buy' | 'sell' | 'neutral',
      strength: 1-10,
      timestamp: Date.now()
    };
  }
}

module.exports = CustomIndicator;
```

#### Extending Alert System
```javascript
// src/alerts/custom-alert.js
const AlertTemplate = require('./templates');

class CustomAlert extends AlertTemplate {
  constructor(config) {
    super(config);
    this.type = 'custom';
  }

  async trigger(data) {
    const message = this.formatMessage(data);
    await this.deliver(message);
  }

  formatMessage(data) {
    return {
      title: 'Custom Alert',
      description: `Signal: ${data.signal}`,
      color: this.getColor(data.signal)
    };
  }
}

module.exports = CustomAlert;
```

## 🚀 Deployment & Production

For detailed deployment instructions, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

### Quick Production Setup

#### Docker Deployment (Recommended)
```bash
# 1. Clone and configure
git clone <repository-url>
cd trading-bot
cp .env.example .env
# Edit .env with your configuration

# 2. Deploy with Docker Compose
docker-compose up -d

# 3. Verify deployment
curl http://localhost:3000/health
```

#### Manual Deployment
```bash
# 1. Environment setup
NODE_ENV=production npm install --only=production
npm run build

# 2. Database setup
npm run db:migrate
npm run db:seed

# 3. Start with PM2
npm install -g pm2
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

### Environment Configuration

#### Production Environment Variables
```env
# Required
NODE_ENV=production
DISCORD_TOKEN=your_production_token
DB_PASSWORD=secure_password

# Optional but recommended
LOG_LEVEL=info
ENABLE_METRICS=true
HEALTH_CHECK_INTERVAL=30000
```

### 📋 Documentation Links

| Document | Description |
|----------|-------------|
| [API.md](docs/API.md) | Complete API documentation and examples |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment guide |
| [METHODOLOGY.md](docs/METHODOLOGY.md) | Trading methodology and algorithms |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Developer guide and contribution guidelines |
| [CONFIGURATION.md](docs/CONFIGURATION.md) | Configuration reference |

## Troubleshooting

### Common Issues

1. **Bot not responding to commands**
   - Check bot permissions in Discord server
   - Verify DISCORD_TOKEN is correct
   - Check bot is online (green status)

2. **Database connection errors**
   - Ensure PostgreSQL is running
   - Check database credentials in .env
   - Verify database exists and is accessible

3. **High memory usage**
   - Check for memory leaks in custom code
   - Restart bot periodically in production
   - Monitor using `/health` endpoint

4. **Commands timing out**
   - Check external API rate limits
   - Verify network connectivity
   - Review error logs for specific issues

### Log Locations
- Application logs: `./logs/trading-bot-YYYY-MM-DD.log`
- Error logs: `./logs/error-YYYY-MM-DD.log`
- Discord logs: `./logs/discord-YYYY-MM-DD.log`

### Performance Monitoring
```bash
# Check bot health
curl http://localhost:3000/health

# View recent logs
tail -f logs/trading-bot-$(date +%Y-%m-%d).log

# Monitor process
pm2 monit trading-bot
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Code Style
- Follow ESLint configuration
- Use meaningful variable names
- Add JSDoc comments for functions
- Write tests for new features

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- Create an issue for bugs or feature requests
- Join our Discord server for community support
- Check the logs for detailed error information

## Disclaimer

This bot is for educational and informational purposes only. It does not provide financial advice. Always do your own research before making trading decisions. Past performance does not guarantee future results.

## Roadmap

### Upcoming Features
- [ ] Advanced chart analysis integration
- [ ] Machine learning-based predictions
- [ ] Portfolio tracking and management
- [ ] Social trading features
- [ ] Mobile app companion
- [ ] Multi-language support

### Current Status
- ✅ Core bot functionality
- ✅ Basic trading commands
- ✅ Error handling and logging
- ✅ API endpoints
- ✅ Documentation
- 🔄 Database integration (in progress)
- 🔄 Real market data integration (in progress)