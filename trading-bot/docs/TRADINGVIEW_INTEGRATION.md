# TradingView Webhook Integration

This document provides comprehensive information about integrating TradingView alerts with the TJR Trading Bot through webhooks.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Setup Guide](#setup-guide)
4. [Pine Script Templates](#pine-script-templates)
5. [Webhook Configuration](#webhook-configuration)
6. [Signal Processing](#signal-processing)
7. [Security](#security)
8. [Monitoring & Health](#monitoring--health)
9. [Troubleshooting](#troubleshooting)
10. [API Reference](#api-reference)

## Overview

The TradingView webhook integration allows you to receive real-time trading signals from custom Pine Script indicators directly into the TJR Trading Bot. The system processes these signals, validates their quality, and integrates them with the bot's analysis engine to generate high-quality trading alerts.

### Key Features

- **High-frequency signal processing** with rate limiting and DDoS protection
- **Multi-layered security** with HMAC signature validation
- **Signal quality validation** with confluence scoring
- **Duplicate detection** and filtering
- **Analysis engine integration** for enhanced signal analysis
- **Comprehensive monitoring** and health checking
- **Performance tracking** for signal optimization

## Architecture

```
TradingView Pine Script
        ↓ (Webhook Alert)
Webhook Receiver (Express.js)
        ↓ (Validation & Processing)
Signal Processor
        ↓ (Quality Validation)
Analysis Engine Integration
        ↓ (Enhanced Analysis)
Alert Manager
        ↓ (Discord Notification)
Discord Channel
```

### Components

1. **TradingView Webhook Receiver** (`src/webhooks/tradingview.js`)
   - Express.js server for receiving webhook alerts
   - Request validation and security checks
   - Rate limiting and DDoS protection

2. **Signal Processor** (`src/signals/processor.js`)
   - Signal normalization and validation
   - Quality scoring and filtering
   - Queue-based processing for high volume

3. **Webhook Manager** (`src/webhooks/manager.js`)
   - Health monitoring and statistics
   - Multi-provider webhook management
   - Error handling and retry logic

## Setup Guide

### Prerequisites

- Node.js 18+ with npm
- Redis server for rate limiting and caching
- PostgreSQL database for data storage
- TradingView account with alert capabilities

### 1. Environment Configuration

Copy the example environment file and configure webhook settings:

```bash
cp .env.example .env
```

Edit the `.env` file with your webhook configuration:

```bash
# TradingView Webhook Settings
TRADINGVIEW_WEBHOOK_ENABLED=true
TRADINGVIEW_WEBHOOK_PORT=3001
TRADINGVIEW_WEBHOOK_PATH=/webhook/tradingview
TRADINGVIEW_WEBHOOK_SECRET=your_secret_key_here

# Security Settings
TRADINGVIEW_WEBHOOK_SIGNATURE_VALIDATION=true
TRADINGVIEW_WEBHOOK_RATE_LIMIT=true
TRADINGVIEW_WEBHOOK_MAX_ALERTS_PER_MIN=100

# Processing Settings
TRADINGVIEW_WEBHOOK_MIN_CONFIDENCE=0.6
TRADINGVIEW_WEBHOOK_MIN_CONFLUENCE_SCORE=5.0
```

### 2. Installation

Install dependencies and start the webhook server:

```bash
npm install
npm run dev
```

The webhook receiver will start on port 3001 by default.

### 3. TradingView Configuration

1. **Load Pine Script**: Copy one of the provided Pine Script templates to TradingView
2. **Configure Parameters**: Adjust input parameters for your trading style
3. **Create Alert**: Set up alerts using the script's alert conditions
4. **Set Webhook URL**: Enter your webhook URL in the alert configuration

Example webhook URL:
```
https://your-domain.com/webhook/tradingview
```

For local testing:
```
http://localhost:3001/webhook/tradingview
```

### 4. Verification

Test the integration by triggering a manual alert from TradingView. Check the bot logs for successful webhook processing:

```bash
# View logs
tail -f logs/combined.log

# Check webhook health
curl http://localhost:3001/webhook/tradingview/health
```

## Pine Script Templates

The integration includes five comprehensive Pine Script templates:

### 1. Confluence Detector

**Purpose**: Detects high-confluence zones by combining multiple market factors.

**Key Features**:
- Liquidity level detection
- Market structure analysis
- Fair Value Gap identification
- Session-based confluence scoring

**Use Case**: Generate alerts when multiple factors align at key price levels.

### 2. Liquidity Sweep Detector

**Purpose**: Identifies liquidity sweeps and session extreme breaks.

**Key Features**:
- Session high/low tracking
- Equal highs/lows detection
- Sweep confirmation with retests
- Strength-based filtering

**Use Case**: Alert on significant liquidity grabs and false breakouts.

### 3. Session Alerts

**Purpose**: Session-based analysis and transition alerts.

**Key Features**:
- Session transition detection
- Breakout identification
- ICT concept integration
- Overlap tracking

**Use Case**: Time-based trading strategies and session volatility analysis.

### 4. Structure & BOS Detector

**Purpose**: Advanced market structure and Break of Structure detection.

**Key Features**:
- Trend analysis and structure tracking
- BOS, CHOCH, and MSS detection
- Internal structure analysis
- Multi-timeframe coordination

**Use Case**: Structure-based trading and trend confirmation.

### 5. FVG Detector

**Purpose**: Comprehensive Fair Value Gap detection with ICT concepts.

**Key Features**:
- Regular FVG detection
- SIBI/BISI identification
- Breaker block analysis
- Fill tracking and invalidation

**Use Case**: Imbalance-based trading and retracement entries.

## Webhook Configuration

### Webhook URL Structure

```
POST /webhook/tradingview
Content-Type: application/json
X-TradingView-Signature: sha256=<signature>
```

### Request Headers

- `Content-Type`: Must be `application/json`
- `X-TradingView-Signature`: HMAC signature for validation (optional but recommended)
- `User-Agent`: TradingView webhook user agent

### Payload Structure

The Pine Scripts generate structured JSON payloads:

```json
{
  "ticker": "EURUSD",
  "exchange": "FX_IDC",
  "type": "confluence",
  "timeframe": "1h",
  "time": "1640995200000",
  "price": 1.1234,
  "high": 1.1245,
  "low": 1.1220,
  "close": 1.1234,
  "volume": 1000,
  "confluence_score": 8.5,
  "confluence_factors": "Liquidity_5,Structure_High,FVG",
  "direction": "bullish",
  "confidence": 0.85,
  "strategy": "TJR_Confluence_Detector",
  "version": "1.0"
}
```

### Response Format

Successful webhook processing returns:

```json
{
  "status": "success",
  "processingTime": 45,
  "alertId": "tv_1640995200000_abc123def",
  "message": "Alert processed successfully"
}
```

Error responses:

```json
{
  "status": "error",
  "error": "Invalid signature",
  "code": "INVALID_SIGNATURE",
  "processingTime": 12
}
```

## Signal Processing

### Processing Pipeline

1. **Validation**: Request format and signature validation
2. **Normalization**: Convert TradingView data to internal format
3. **Quality Check**: Validate signal quality and confluence
4. **Deduplication**: Filter duplicate signals
5. **Analysis Integration**: Trigger analysis engine updates
6. **Alert Generation**: Create Discord alerts for high-quality signals

### Quality Validation

Signals are scored based on multiple factors:

- **Confidence Level**: Pine Script confidence rating
- **Confluence Score**: Number and strength of confluence factors
- **Technical Confirmation**: RSI, MACD, and other indicators
- **Structure Context**: Market structure alignment
- **Session Context**: Trading session relevance

### Signal Filtering

- **Timeframe Filtering**: Only allowed timeframes are processed
- **Symbol Whitelisting**: Optional symbol restrictions
- **Duplicate Detection**: Time-based deduplication
- **Quality Thresholds**: Minimum confidence and confluence scores

## Security

### HMAC Signature Validation

The webhook receiver validates incoming requests using HMAC-SHA256 signatures:

1. **Generate Secret**: Create a strong webhook secret
2. **Configure Pine Script**: Use the secret in alert configuration
3. **Validate Signature**: Server validates incoming signatures

Example signature generation (Pine Script):
```pinescript
webhook_secret = "your_secret_key"
payload_hash = str.to_hash(alert_message, webhook_secret)
```

### Rate Limiting

Multi-level rate limiting protects against abuse:

- **Per-minute limits**: 100 requests per minute (configurable)
- **Per-hour limits**: 1000 requests per hour (configurable)
- **IP-based limiting**: Redis-backed rate limiting
- **Exponential backoff**: For repeated violations

### DDoS Protection

- **Request size limits**: 1MB maximum payload
- **Connection limits**: Maximum concurrent connections
- **IP blocking**: Automatic blocking of abusive IPs
- **Resource monitoring**: CPU and memory usage tracking

## Monitoring & Health

### Health Endpoints

- `GET /webhook/tradingview/health`: Basic health check
- `GET /webhook/tradingview/metrics`: Detailed metrics

### Metrics Collection

The system tracks comprehensive metrics:

```javascript
{
  "totalAlerts": 1250,
  "validAlerts": 1100,
  "invalidAlerts": 150,
  "duplicateAlerts": 45,
  "rateLimitedAlerts": 12,
  "averageProcessingTime": 23.5,
  "successRate": 88.0,
  "uptime": 86400000
}
```

### Health Monitoring

- **Periodic health checks**: Every 60 seconds
- **Webhook connectivity**: Endpoint availability
- **Performance monitoring**: Response times and throughput
- **Error tracking**: Failed requests and processing errors

### Alerting

The system can alert on:
- Webhook failures and downtime
- High error rates
- Performance degradation
- Rate limit violations

## Troubleshooting

### Common Issues

#### Webhook Not Receiving Alerts

**Symptoms**: No alerts appearing in logs
**Solutions**:
1. Check webhook URL format and accessibility
2. Verify TradingView alert configuration
3. Confirm webhook service is running on correct port
4. Test with curl or Postman

#### High Alert Volume

**Symptoms**: Too many alerts being generated
**Solutions**:
1. Increase confidence thresholds in Pine Scripts
2. Enable deduplication with longer windows
3. Adjust rate limiting settings
4. Review Pine Script sensitivity parameters

#### Signal Quality Issues

**Symptoms**: Low-quality or false signals
**Solutions**:
1. Adjust confluence scoring parameters
2. Increase minimum strength requirements
3. Review timeframe compatibility
4. Validate Pine Script logic

#### Performance Issues

**Symptoms**: Slow webhook processing
**Solutions**:
1. Enable queue-based processing
2. Increase processing batch sizes
3. Optimize Redis configuration
4. Scale horizontally with multiple instances

### Debugging Tools

#### Enable Debug Logging

```bash
LOG_LEVEL=debug
```

#### Webhook Testing

```bash
# Test webhook endpoint
curl -X POST http://localhost:3001/webhook/tradingview \
  -H "Content-Type: application/json" \
  -d '{"ticker":"EURUSD","type":"test"}'

# Check health
curl http://localhost:3001/webhook/tradingview/health
```

#### Monitor Redis

```bash
# Connect to Redis CLI
redis-cli

# Monitor rate limiting keys
KEYS trading_bot:*
```

#### Database Queries

```sql
-- Check recent webhook alerts
SELECT * FROM webhook_alerts
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Alert statistics
SELECT
  alert_type,
  COUNT(*) as count,
  AVG(processing_time) as avg_processing_time
FROM webhook_alerts
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY alert_type;
```

### Log Analysis

Key log patterns to monitor:

```bash
# Successful webhook processing
grep "TradingView alert processed successfully" logs/combined.log

# Rate limiting events
grep "Rate limit exceeded" logs/combined.log

# Signal processing errors
grep "Signal processing error" logs/combined.log

# Webhook validation failures
grep "Webhook processing error" logs/combined.log
```

## API Reference

### Webhook Endpoints

#### POST /webhook/tradingview

Process TradingView webhook alerts.

**Request Headers**:
- `Content-Type: application/json` (required)
- `X-TradingView-Signature: sha256=<signature>` (optional)

**Request Body**: JSON payload from Pine Script

**Response**:
- `200`: Alert processed successfully
- `400`: Invalid request or validation failure
- `429`: Rate limit exceeded
- `500`: Internal server error

#### GET /webhook/tradingview/health

Get webhook health status.

**Response**:
```json
{
  "status": "healthy",
  "timestamp": 1640995200000,
  "metrics": {
    "totalAlerts": 1250,
    "validAlerts": 1100,
    "successRate": 88.0
  },
  "uptime": 86400
}
```

#### GET /webhook/tradingview/metrics

Get detailed webhook metrics.

**Response**:
```json
{
  "metrics": {
    "totalAlerts": 1250,
    "validAlerts": 1100,
    "invalidAlerts": 150,
    "averageProcessingTime": 23.5,
    "cacheSize": 45,
    "memoryUsage": {
      "rss": 123456789,
      "heapTotal": 87654321,
      "heapUsed": 45678912
    }
  },
  "rateLimit": {
    "enabled": true,
    "maxPerMinute": 100,
    "maxPerHour": 1000
  }
}
```

### Configuration API

#### Environment Variables

All configuration options are available through environment variables. See `.env.example` for complete list.

Key variables:
- `TRADINGVIEW_WEBHOOK_ENABLED`: Enable/disable webhook processing
- `TRADINGVIEW_WEBHOOK_SECRET`: Webhook signature secret
- `TRADINGVIEW_WEBHOOK_MAX_ALERTS_PER_MIN`: Rate limit per minute
- `TRADINGVIEW_WEBHOOK_MIN_CONFIDENCE`: Minimum signal confidence

#### Runtime Configuration

Some settings can be modified at runtime through the configuration API:

```javascript
// Update rate limits
config.set('tradingView.webhook.maxAlertsPerMinute', 150);

// Update confidence thresholds
config.set('tradingView.webhook.minConfidenceThreshold', 0.7);
```

### Signal Processing API

#### Signal Quality Metrics

Access signal quality information:

```javascript
// Get signal processor metrics
const processor = require('./src/signals/processor');
const metrics = processor.getMetrics();

// Get active signals for a symbol
const activeSignals = processor.getActiveSignals('EURUSD');
```

#### Performance Tracking

Track signal performance over time:

```javascript
// Update signal outcome
processor.updateSignalPerformance(
  'EURUSD',
  'signal_123',
  { outcome: 0.85, timestamp: Date.now() }
);

// Get performance statistics
const stats = processor.getPerformanceStats('EURUSD', 30);
```

This comprehensive integration provides a robust foundation for receiving and processing TradingView signals in the TJR Trading Bot system.