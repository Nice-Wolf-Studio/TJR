# 🚀 TJR Trading Bot - Quick Start Guide

## Overview

Your professional trading Discord bot is now complete! This guide will get you up and running in minutes.

## ✅ What's Been Built

### Core System
- **Discord Bot** with 6 trading commands (`!bias`, `!levels`, `!setup`, `!flow`, `!ping`, `!help`)
- **Real-time Analysis Engine** implementing your unified trading methodology
- **TradingView Webhook Integration** for live signal processing
- **PostgreSQL + Redis** data pipeline for high-performance operations
- **Risk Management System** with position sizing and stop loss calculations
- **Smart Alert System** with multi-channel notifications

### Advanced Features
- **Liquidity Detection** - Equal highs/lows, session extremes, psychological levels
- **Structure Analysis** - BOS detection, swing points, trend classification
- **Confluence Scoring** - 3-tier weighted system (Tier 1: 3x, Tier 2: 2x, Tier 3: 1x)
- **Session Analytics** - London/NY/Asian session optimization
- **Multi-timeframe Analysis** - 1m to Daily coordinated analysis
- **Performance Tracking** - Win rates, R multiples, optimal timing analysis

## 🛠️ Installation

### 1. Install Dependencies
```bash
cd trading-bot
npm install
```

### 2. Configure Environment
```bash
# Copy the environment template
cp .env.example .env

# Edit with your settings
nano .env
```

Required environment variables:
```env
# Discord Bot
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_client_id

# Database
DATABASE_URL=postgresql://username:password@localhost:5432/tradingbot

# Redis
REDIS_URL=redis://localhost:6379

# TradingView
TRADINGVIEW_WEBHOOK_SECRET=your_webhook_secret

# Trading Settings
DEFAULT_RISK_PERCENT=1.0
MAX_ALERTS_PER_HOUR=20
```

### 3. Database Setup

#### Option A: Docker (Recommended)
```bash
# Start PostgreSQL + Redis
docker-compose up -d

# Run database migrations
npm run migrate
```

#### Option B: Manual Setup
```bash
# Install PostgreSQL and Redis locally
# Then run the schema
psql -d tradingbot -f database/schema.sql
```

### 4. Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the token to your `.env` file
5. Invite the bot to your server with these permissions:
   - Send Messages
   - Use Slash Commands
   - Embed Links
   - Read Message History

## 🚀 Running the Bot

### Initial Setup
```bash
# 1. Build the project
npm run build

# 2. Run database migrations
npm run migrate

# 3. Register Discord commands
npm run bot:register

# 4. Start the bot
npm run bot
```

### Development Mode
```bash
# After initial setup, just run:
npm run dev
```

### Production Mode
```bash
# Build, register commands, and start
npm run build && npm run bot:register && npm run bot
```

### With Docker
```bash
docker-compose up -d
```

## 📱 Using the Bot

### Basic Commands

**Get daily market bias:**
```
!bias EURUSD
```

**Check key levels:**
```
!levels GBPUSD
```

**Find trading setups:**
```
!setup 15m
```

**Analyze order flow:**
```
!flow XAUUSD
```

### Sample Output

The bot generates professional trading analysis like this:

```
═══════════════════════════════════════
📊 DAILY BIAS REPORT - EUR/USD
📅 Date: 2024-01-15 | Session: London
═══════════════════════════════════════

🎯 BIAS: MODERATE BULLISH (Score: 7/10)

📈 STRUCTURE ANALYSIS:
• Daily: Bullish (HH-HL intact)
• 4H: Bullish (Recent BOS at 1.0850)
• 1H: Corrective (Retracing to support)

💧 LIQUIDITY TARGETS:
• Above: 1.0920 (Yesterday's High) ⚠️
• Above: 1.0945 (Equal Highs) 🎯
• Below: 1.0875 (Asian Low) ✅ SWEPT

⚡ CONFLUENCES PRESENT:
✅ Liquidity Sweep (Asian Low)
✅ Order Block (1.0880)
✅ Fair Value Gap (1.0882-1.0886)
✅ 50% Equilibrium (1.0881)

💡 TRADE PLAN:
Enter long on London open liquidity sweep
with 1M BOS confirmation. Target yesterday's
high initially, then equal highs.
═══════════════════════════════════════
```

## 🎯 TradingView Integration

### 1. Set Up Pine Scripts

Upload the provided Pine Scripts to TradingView:
- `docs/pine-scripts/confluence-detector.pine`
- `docs/pine-scripts/liquidity-sweep-detector.pine`
- `docs/pine-scripts/session-alerts.pine`

### 2. Configure Webhooks

In TradingView alerts, use this webhook URL:
```
https://your-domain.com/webhook/tradingview
```

### 3. Webhook Payload Format

The bot expects this JSON format:
```json
{
  "symbol": "EURUSD",
  "timeframe": "15m",
  "signal_type": "liquidity_sweep",
  "confluence_score": 8,
  "price": 1.0885,
  "levels": {
    "entry": 1.0880,
    "stop": 1.0870,
    "target1": 1.0920,
    "target2": 1.0945
  }
}
```

## 🔧 Testing

### Run All Tests
```bash
npm run test:all
```

### Integration Tests
```bash
npm run test:integration
```

### Performance Tests
```bash
npm run test:performance
```

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:3000/health
```

### System Statistics
The bot logs comprehensive statistics:
- Command usage metrics
- Analysis performance
- Alert delivery rates
- Error rates and recovery

### Log Files
- `logs/bot.log` - Discord bot activities
- `logs/trading.log` - Analysis and signals
- `logs/errors.log` - Error tracking
- `logs/performance.log` - System metrics

## 🚀 Deployment

### Production Checklist

1. **Environment Configuration**
   - [ ] Production database URL
   - [ ] Redis configuration
   - [ ] Discord bot token
   - [ ] TradingView webhook secret
   - [ ] Trading parameters tuned

2. **Security**
   - [ ] Firewall configured
   - [ ] SSL certificates installed
   - [ ] Database access restricted
   - [ ] Rate limiting enabled

3. **Monitoring**
   - [ ] Log rotation configured
   - [ ] Health checks enabled
   - [ ] Backup procedures tested
   - [ ] Alert thresholds set

### Docker Deployment
```bash
# Build and deploy
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f trading-bot
```

### Cloud Deployment

The bot includes deployment configurations for:
- **AWS ECS/Fargate** - Container orchestration
- **DigitalOcean App Platform** - Managed deployment
- **Heroku** - Simple deployment
- **Google Cloud Run** - Serverless containers

See `docs/DEPLOYMENT.md` for detailed cloud deployment guides.

## 🆘 Troubleshooting

### Common Issues

**Bot not responding:**
- Check Discord token and permissions
- Verify bot is online in Discord server
- Check logs for connection errors

**Database connection errors:**
- Verify PostgreSQL is running
- Check connection string in `.env`
- Ensure database exists and migrations ran

**No trading signals:**
- Verify TradingView webhooks are configured
- Check webhook endpoint accessibility
- Validate Pine Script alerts are firing

**High memory usage:**
- Check for data accumulation in Redis
- Monitor log file sizes
- Consider increasing server resources

### Support

For issues or questions:
1. Check the logs in `/logs/` directory
2. Review the comprehensive documentation in `/docs/`
3. Run the integration tests to diagnose issues
4. Check system health at `/health` endpoint

## 🎉 You're Ready!

Your professional trading bot is now operational with:

- ✅ **Real-time market analysis** using advanced ICT concepts
- ✅ **Professional Discord integration** with rich formatting
- ✅ **TradingView signal processing** for automated alerts
- ✅ **Risk management tools** for position sizing
- ✅ **Performance tracking** for strategy optimization
- ✅ **Production-ready architecture** with monitoring and recovery

Start with paper trading to validate signals, then scale up as you gain confidence in the system's performance.

**Happy Trading! 🚀📈**