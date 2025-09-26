# Trading Bot API Documentation

This document provides comprehensive documentation for the Trading Bot's RESTful API and Discord bot commands.

## 📋 Table of Contents

- [Discord Bot Commands](#discord-bot-commands)
- [RESTful API Endpoints](#restful-api-endpoints)
- [Webhook Endpoints](#webhook-endpoints)
- [Authentication](#authentication)
- [Response Formats](#response-formats)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Examples](#examples)

## 🤖 Discord Bot Commands

### Command Structure

All Discord commands follow this structure:
```
!<command> [arguments] [options]
```

Default prefix: `!` (configurable via `COMMAND_PREFIX` environment variable)

### Core Trading Commands

#### Market Bias Analysis

**Command:** `!bias <pair>`
**Aliases:** `!b`, `!direction`
**Category:** Trading
**Cooldown:** 10 seconds
**Permissions:** Public

Analyzes daily market bias and directional sentiment for currency pairs.

**Usage:**
```bash
!bias EURUSD        # Get EUR/USD bias
!b GBPUSD          # Short form alias
!direction USDJPY   # Long form alias
```

**Parameters:**
- `pair` (required): 6-character currency pair (e.g., EURUSD, GBPUSD)

**Response Fields:**
- `bias`: Market direction (Bullish/Bearish/Neutral)
- `strength`: Strength rating (1-10 scale)
- `confidence`: Confidence level (1-10 scale)
- `session`: Current trading session
- `currentPrice`: Current market price
- `resistance`: Key resistance level
- `support`: Key support level
- `technicalFactors`: Array of technical analysis factors
- `fundamentalFactors`: Array of fundamental analysis factors
- `lastUpdate`: Timestamp of last analysis

**Example Response:**
```
📊 Daily Bias: EURUSD
🎯 Bias Direction: Bullish 🟢📈
📈 Strength: 8/10 ████████░░
⏰ Session: London
🔍 Key Levels:
  Resistance: 1.0875
  Support: 1.0825
  Current: 1.0850
✅ Confidence Level: High (8/10) - Strong conviction bias
```

---

#### Key Levels Detection

**Command:** `!levels <pair>`
**Aliases:** `!l`, `!keylevels`, `!sr`
**Category:** Trading
**Cooldown:** 15 seconds
**Permissions:** Public

Identifies critical support and resistance levels for currency pairs.

**Usage:**
```bash
!levels EURUSD      # Get EUR/USD levels
!l GBPUSD          # Short form
!sr USDJPY         # Support/resistance alias
```

**Parameters:**
- `pair` (required): 6-character currency pair

**Response Fields:**
- `currentPrice`: Current market price
- `dailyRange`: Daily range in pips
- `volatility`: Volatility level (Low/Medium/High)
- `resistance`: Array of resistance levels with strength
- `support`: Array of support levels with strength
- `pivotPoints`: Pivot point calculations (PP, R1, S1)
- `sessions`: Session-specific levels (Asian, London, NY)

**Example Response:**
```
📊 Key Levels: EURUSD
🎯 Current Price: 1.0850
📈 Daily Range: 75 pips
📊 Volatility: Medium 🟡 (Active)

🔴 Resistance Levels:
R1: 1.0900 🔴🔴🔴 (Strong)
R2: 1.0875 🔴🔴⚪ (Medium)
R3: 1.0860 🔴⚪⚪ (Weak)

🟢 Support Levels:
S1: 1.0840 🟢⚪⚪ (Weak)
S2: 1.0825 🟢🟢⚪ (Medium)
S3: 1.0800 🟢🟢🟢 (Strong)
```

---

#### Trade Setup Scanner

**Command:** `!setup <timeframe> [pair]`
**Aliases:** `!setups`, `!entries`
**Category:** Trading
**Cooldown:** 20 seconds
**Permissions:** Public

Scans for trade setups and entry opportunities across timeframes.

**Usage:**
```bash
!setup 1H           # Scan 1H timeframe (all pairs)
!setup 4H EURUSD    # Scan 4H EUR/USD specific
!setups 15M         # Plural alias
```

**Parameters:**
- `timeframe` (required): Valid timeframe (1M, 5M, 15M, 30M, 1H, 4H, 1D, 1W)
- `pair` (optional): Specific currency pair to analyze

**Supported Timeframes:**
- `1M` - 1 Minute
- `5M` - 5 Minutes
- `15M` - 15 Minutes
- `30M` - 30 Minutes
- `1H` - 1 Hour
- `4H` - 4 Hours
- `1D` - Daily
- `1W` - Weekly

**Setup Types:**
- Breakout
- Pullback
- Reversal
- Flag
- Triangle
- Support Bounce
- Resistance Reject
- Trend Continue

**Response Fields:**
- `setups`: Array of detected setups
  - `pair`: Currency pair
  - `type`: Setup type
  - `entry`: Entry price
  - `stopLoss`: Stop loss price
  - `takeProfit`: Take profit price
  - `riskReward`: Risk/reward ratio
  - `strength`: Setup strength (1-10)
  - `confidence`: Confidence percentage
- `marketConditions`: Current market conditions
- `lastScan`: Timestamp of scan

---

#### Order Flow Analysis

**Command:** `!flow <pair>`
**Aliases:** `!orderflow`
**Category:** Trading
**Cooldown:** 15 seconds
**Permissions:** Public

Analyzes order flow and market sentiment for institutional activity detection.

**Usage:**
```bash
!flow EURUSD        # EUR/USD order flow
!orderflow GBPUSD   # Full form alias
```

**Parameters:**
- `pair` (required): Currency pair to analyze

**Response Fields:**
- `sentiment`: Overall market sentiment
- `institutionalActivity`: Institutional buying/selling pressure
- `liquiditySweeps`: Detected liquidity sweeps
- `smartMoneyFlow`: Smart money movement indicators
- `volumeProfile`: Volume distribution analysis
- `orderBlocks`: Identified order block zones

---

### Utility Commands

#### System Health

**Command:** `!ping`
**Aliases:** None
**Category:** Utility
**Cooldown:** 5 seconds
**Permissions:** Public

Checks bot latency and system health status.

**Response Fields:**
- Bot latency (ms)
- API response time
- Database connection status
- System uptime
- Memory usage

---

#### Help System

**Command:** `!help [command]`
**Aliases:** `!h`
**Category:** Utility
**Cooldown:** 3 seconds
**Permissions:** Public

Displays help information for commands.

**Usage:**
```bash
!help              # Show all commands
!help bias         # Help for specific command
!h setup           # Using alias
```

---

### Advanced Commands

#### Multi-Timeframe Analysis

**Command:** `!mtf <pair>`
**Aliases:** `!confluence`
**Category:** Trading
**Cooldown:** 30 seconds
**Permissions:** Registered

Performs multi-timeframe confluence analysis.

#### Risk Management

**Command:** `!risk <account> <risk%>`
**Aliases:** `!calculator`
**Category:** Risk
**Cooldown:** 10 seconds
**Permissions:** Registered

Calculates position size based on account balance and risk percentage.

#### Alert Management

**Command:** `!alert <pair> <price>`
**Aliases:** `!alerts`
**Category:** Alerts
**Cooldown:** 5 seconds
**Permissions:** Registered

Manages price alerts and notifications.

## 🌐 RESTful API Endpoints

### Base URL
```
https://your-bot-domain.com
```

### Authentication

API endpoints require authentication via Bearer token:

```http
Authorization: Bearer your-api-key
Content-Type: application/json
```

### Health & Monitoring Endpoints

#### GET /health
Basic health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 3600000
}
```

#### GET /health/detailed
Comprehensive health check with system metrics.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 3600000,
  "discord": {
    "status": "connected",
    "guilds": 15,
    "users": 1250,
    "ping": 45
  },
  "database": {
    "status": "connected",
    "pool": {
      "total": 10,
      "idle": 8,
      "waiting": 0
    },
    "latency": 12
  },
  "redis": {
    "status": "connected",
    "memory": "2.1MB",
    "keys": 156
  },
  "system": {
    "memory": {
      "used": "125MB",
      "free": "875MB",
      "percentage": 12.5
    },
    "cpu": 15.3
  },
  "stats": {
    "commandsExecuted": 1520,
    "messagesProcessed": 12500,
    "apiRequestsToday": 450
  }
}
```

#### GET /metrics
Prometheus-formatted metrics.

**Response:**
```prometheus
# HELP trading_bot_commands_total Total number of commands executed
# TYPE trading_bot_commands_total counter
trading_bot_commands_total{command="bias"} 450
trading_bot_commands_total{command="levels"} 320
trading_bot_commands_total{command="setup"} 280

# HELP trading_bot_response_duration_seconds Command response duration
# TYPE trading_bot_response_duration_seconds histogram
trading_bot_response_duration_seconds_bucket{command="bias",le="0.1"} 200
trading_bot_response_duration_seconds_bucket{command="bias",le="0.5"} 380
```

---

### Bot Information Endpoints

#### GET /info
Bot capabilities and feature information.

**Response:**
```json
{
  "name": "Trading Bot",
  "version": "1.0.0",
  "description": "Advanced Discord bot for professional market analysis",
  "features": [
    "Market Bias Analysis",
    "Key Levels Detection",
    "Trade Setup Scanning",
    "Order Flow Analysis",
    "Multi-timeframe Analysis",
    "Risk Management Tools"
  ],
  "supportedPairs": [
    "EURUSD", "GBPUSD", "USDJPY", "USDCHF",
    "AUDUSD", "USDCAD", "NZDUSD"
  ],
  "supportedTimeframes": [
    "1M", "5M", "15M", "30M", "1H", "4H", "1D", "1W"
  ],
  "guilds": 15,
  "users": 1250
}
```

#### GET /commands
List of available Discord commands.

**Response:**
```json
{
  "commands": [
    {
      "name": "bias",
      "aliases": ["b", "direction"],
      "description": "Get daily market bias for currency pair",
      "usage": "!bias <pair>",
      "category": "Trading",
      "cooldown": 10000,
      "permissions": ["public"]
    },
    {
      "name": "levels",
      "aliases": ["l", "keylevels", "sr"],
      "description": "Get key support/resistance levels",
      "usage": "!levels <pair>",
      "category": "Trading",
      "cooldown": 15000,
      "permissions": ["public"]
    }
  ]
}
```

---

### Trading Data Endpoints

#### GET /api/bias/:pair
Get market bias analysis for specific currency pair.

**Parameters:**
- `pair` (path): Currency pair (e.g., EURUSD)

**Query Parameters:**
- `timeframe` (optional): Analysis timeframe (default: 1D)
- `detailed` (optional): Include detailed analysis (default: false)

**Example Request:**
```http
GET /api/bias/EURUSD?timeframe=4H&detailed=true
Authorization: Bearer your-api-key
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "pair": "EURUSD",
    "timeframe": "4H",
    "bias": "bullish",
    "strength": 8,
    "confidence": 85,
    "currentPrice": 1.0850,
    "levels": {
      "resistance": 1.0875,
      "support": 1.0825
    },
    "session": "London",
    "factors": {
      "technical": [
        "Price above 20 EMA",
        "RSI showing momentum",
        "Breaking key resistance",
        "Higher highs pattern"
      ],
      "fundamental": [
        "Central bank policy supportive",
        "Economic data positive",
        "Risk appetite increasing"
      ]
    },
    "lastUpdate": "2024-01-15T10:25:00Z"
  },
  "meta": {
    "responseTime": "245ms",
    "cached": false,
    "rateLimit": {
      "remaining": 48,
      "reset": "2024-01-15T11:00:00Z"
    }
  }
}
```

#### GET /api/levels/:pair
Get key support and resistance levels.

**Parameters:**
- `pair` (path): Currency pair

**Query Parameters:**
- `count` (optional): Number of levels to return (default: 3)
- `type` (optional): Level type (support|resistance|both) (default: both)

**Response:**
```json
{
  "status": "success",
  "data": {
    "pair": "EURUSD",
    "currentPrice": 1.0850,
    "dailyRange": 75,
    "volatility": "medium",
    "resistance": [
      {
        "price": 1.0900,
        "strength": 9,
        "type": "daily_high",
        "touches": 3,
        "lastTouch": "2024-01-15T08:30:00Z"
      },
      {
        "price": 1.0875,
        "strength": 6,
        "type": "pivot_resistance",
        "touches": 2,
        "lastTouch": "2024-01-15T06:15:00Z"
      }
    ],
    "support": [
      {
        "price": 1.0800,
        "strength": 8,
        "type": "weekly_low",
        "touches": 4,
        "lastTouch": "2024-01-14T22:45:00Z"
      }
    ],
    "pivotPoints": {
      "pivot": 1.0850,
      "r1": 1.0875,
      "r2": 1.0900,
      "s1": 1.0825,
      "s2": 1.0800
    }
  }
}
```

#### GET /api/setups/:timeframe
Get trade setups for specified timeframe.

**Parameters:**
- `timeframe` (path): Timeframe (1M, 5M, 15M, 30M, 1H, 4H, 1D, 1W)

**Query Parameters:**
- `pair` (optional): Filter by specific pair
- `type` (optional): Filter by setup type
- `minStrength` (optional): Minimum strength threshold (1-10)

**Response:**
```json
{
  "status": "success",
  "data": {
    "timeframe": "1H",
    "scanTime": "2024-01-15T10:30:00Z",
    "setups": [
      {
        "id": "setup_001",
        "pair": "EURUSD",
        "type": "breakout",
        "direction": "long",
        "entry": 1.0855,
        "stopLoss": 1.0835,
        "takeProfit": 1.0895,
        "riskReward": 2.0,
        "strength": 8,
        "confidence": 85,
        "validUntil": "2024-01-15T14:30:00Z",
        "reasoning": [
          "Clean breakout above resistance",
          "Volume confirmation present",
          "Confluence with trend direction"
        ]
      }
    ],
    "marketConditions": {
      "trend": "uptrend",
      "volatility": "medium",
      "session": "London",
      "sentiment": "risk_on"
    }
  }
}
```

#### POST /api/analyze
Custom analysis request with specific parameters.

**Request Body:**
```json
{
  "pairs": ["EURUSD", "GBPUSD"],
  "timeframes": ["1H", "4H"],
  "analysis": ["bias", "levels", "confluence"],
  "options": {
    "includeRisk": true,
    "minConfidence": 70,
    "maxResults": 5
  }
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "requestId": "req_123456789",
    "results": [
      {
        "pair": "EURUSD",
        "timeframe": "1H",
        "bias": { /* bias data */ },
        "levels": { /* levels data */ },
        "confluence": { /* confluence data */ }
      }
    ]
  }
}
```

---

## 🔗 Webhook Endpoints

### POST /webhook/alerts
Receive external trading alerts.

**Request Body:**
```json
{
  "source": "external_system",
  "type": "price_alert",
  "pair": "EURUSD",
  "message": "EUR/USD reached 1.0900 resistance",
  "price": 1.0900,
  "timestamp": "2024-01-15T10:30:00Z",
  "priority": "high"
}
```

**Response:**
```json
{
  "status": "received",
  "alertId": "alert_123456",
  "processed": true
}
```

### POST /webhook/signals
Receive trading signals from external systems.

**Request Body:**
```json
{
  "source": "mt4_expert",
  "signal": "buy",
  "pair": "EURUSD",
  "entry": 1.0850,
  "stopLoss": 1.0830,
  "takeProfit": 1.0890,
  "confidence": 85,
  "reasoning": "Bullish breakout confirmed"
}
```

### POST /webhook/news
Receive economic news events.

**Request Body:**
```json
{
  "event": "NFP",
  "currency": "USD",
  "importance": "high",
  "actual": 250000,
  "forecast": 200000,
  "previous": 180000,
  "releaseTime": "2024-01-15T13:30:00Z"
}
```

---

## 🔐 Authentication

### API Key Authentication
All API endpoints require a valid API key in the Authorization header:

```http
Authorization: Bearer sk-1234567890abcdef
```

### API Key Management
- Keys are generated via Discord command: `!apikey generate`
- Keys can be revoked: `!apikey revoke <keyId>`
- Keys have configurable expiration and rate limits
- Different permission levels available (public, premium, admin)

### Webhook Authentication
Webhooks use HMAC-SHA256 signature verification:

```javascript
const crypto = require('crypto');
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(JSON.stringify(body))
  .digest('hex');

// Verify signature matches header
const expectedSignature = `sha256=${signature}`;
const receivedSignature = request.headers['x-webhook-signature'];
```

---

## 📋 Response Formats

### Standard Response Structure
All API responses follow this structure:

```json
{
  "status": "success|error",
  "data": { /* response data */ },
  "error": { /* error details (if status=error) */ },
  "meta": {
    "responseTime": "150ms",
    "timestamp": "2024-01-15T10:30:00Z",
    "cached": false,
    "rateLimit": {
      "remaining": 48,
      "reset": "2024-01-15T11:00:00Z"
    }
  }
}
```

### Success Response
```json
{
  "status": "success",
  "data": {
    "result": "Analysis completed successfully"
  }
}
```

### Error Response
```json
{
  "status": "error",
  "error": {
    "code": "INVALID_PAIR",
    "message": "Currency pair 'INVALID' is not supported",
    "details": "Supported pairs: EURUSD, GBPUSD, USDJPY, ..."
  }
}
```

---

## ⚠️ Error Handling

### Discord Bot Errors
Bot commands handle errors gracefully with user-friendly messages:

```
❌ Analysis Error
Unable to fetch bias data at this time. Please try again later.
```

### API Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `INVALID_PAIR` | 400 | Invalid currency pair format |
| `UNSUPPORTED_TIMEFRAME` | 400 | Timeframe not supported |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit exceeded |
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `INSUFFICIENT_PERMISSIONS` | 403 | Insufficient permissions for endpoint |
| `NOT_FOUND` | 404 | Endpoint or resource not found |
| `INTERNAL_ERROR` | 500 | Internal server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

### Example Error Responses

#### Rate Limit Exceeded
```json
{
  "status": "error",
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit of 50 requests per hour exceeded",
    "retryAfter": 1800,
    "resetTime": "2024-01-15T12:00:00Z"
  }
}
```

#### Invalid Parameter
```json
{
  "status": "error",
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "Invalid timeframe specified",
    "parameter": "timeframe",
    "value": "2H",
    "allowedValues": ["1M", "5M", "15M", "30M", "1H", "4H", "1D", "1W"]
  }
}
```

---

## 🚦 Rate Limiting

### Discord Bot Rate Limits
- **Basic commands**: 5 per minute per user
- **Analysis commands**: 3 per minute per user
- **Alert commands**: 10 per hour per user
- **Admin commands**: No limits

### API Rate Limits
- **Public endpoints**: 100 requests per hour per IP
- **Authenticated endpoints**: 1000 requests per hour per API key
- **Premium endpoints**: 5000 requests per hour per API key

### Rate Limit Headers
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642248000
X-RateLimit-RetryAfter: 3600
```

---

## 📖 Examples

### Discord Bot Usage Examples

#### Basic Trading Analysis Flow
```bash
# 1. Check market bias
!bias EURUSD

# 2. Identify key levels
!levels EURUSD

# 3. Scan for setups
!setup 1H EURUSD

# 4. Analyze order flow
!flow EURUSD

# 5. Set price alert
!alert EURUSD 1.0900
```

### API Integration Examples

#### Node.js Example
```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'https://your-bot-domain.com',
  headers: {
    'Authorization': 'Bearer your-api-key',
    'Content-Type': 'application/json'
  }
});

// Get market bias
const bias = await api.get('/api/bias/EURUSD?detailed=true');
console.log(bias.data);

// Get trade setups
const setups = await api.get('/api/setups/1H?pair=EURUSD&minStrength=7');
console.log(setups.data);

// Custom analysis
const analysis = await api.post('/api/analyze', {
  pairs: ['EURUSD', 'GBPUSD'],
  timeframes: ['1H', '4H'],
  analysis: ['bias', 'levels']
});
console.log(analysis.data);
```

#### Python Example
```python
import requests
import json

class TradingBotAPI:
    def __init__(self, base_url, api_key):
        self.base_url = base_url
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }

    def get_bias(self, pair, timeframe='1D'):
        url = f'{self.base_url}/api/bias/{pair}'
        params = {'timeframe': timeframe, 'detailed': 'true'}
        response = requests.get(url, headers=self.headers, params=params)
        return response.json()

    def get_setups(self, timeframe, pair=None, min_strength=5):
        url = f'{self.base_url}/api/setups/{timeframe}'
        params = {
            'minStrength': min_strength
        }
        if pair:
            params['pair'] = pair

        response = requests.get(url, headers=self.headers, params=params)
        return response.json()

# Usage
api = TradingBotAPI('https://your-bot-domain.com', 'your-api-key')

# Get EUR/USD bias
bias = api.get_bias('EURUSD', '4H')
print(f"Bias: {bias['data']['bias']}")

# Get 1H setups
setups = api.get_setups('1H', min_strength=7)
print(f"Found {len(setups['data']['setups'])} setups")
```

#### cURL Examples
```bash
# Health check
curl -X GET https://your-bot-domain.com/health

# Get market bias with authentication
curl -X GET \
  "https://your-bot-domain.com/api/bias/EURUSD?detailed=true" \
  -H "Authorization: Bearer your-api-key"

# Send webhook alert
curl -X POST \
  "https://your-bot-domain.com/webhook/alerts" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: sha256=signature" \
  -d '{
    "source": "mt4",
    "type": "price_alert",
    "pair": "EURUSD",
    "price": 1.0900,
    "message": "Resistance reached"
  }'

# Custom analysis request
curl -X POST \
  "https://your-bot-domain.com/api/analyze" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "pairs": ["EURUSD", "GBPUSD"],
    "timeframes": ["1H", "4H"],
    "analysis": ["bias", "levels", "confluence"]
  }'
```

---

## 📞 Support

For API support and questions:
- Discord: Join our support server
- Email: support@trading-bot.com
- Documentation: [GitHub Wiki](https://github.com/your-repo/wiki)
- Issues: [GitHub Issues](https://github.com/your-repo/issues)

---

## 📝 Changelog

### Version 1.0.0
- Initial API release
- Discord bot commands implementation
- RESTful API endpoints
- Webhook integration
- Authentication system
- Rate limiting
- Comprehensive documentation

---

*This documentation is automatically generated and updated. Last updated: 2024-01-15*