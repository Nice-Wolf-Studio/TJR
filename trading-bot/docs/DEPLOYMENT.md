# Trading Bot Deployment Guide

This comprehensive guide covers all aspects of deploying the Trading Bot in production environments, from basic setup to advanced enterprise configurations.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Database Configuration](#database-configuration)
- [Redis Configuration](#redis-configuration)
- [Docker Deployment](#docker-deployment)
- [Manual Deployment](#manual-deployment)
- [Load Balancer Setup](#load-balancer-setup)
- [Monitoring & Logging](#monitoring--logging)
- [Security Configuration](#security-configuration)
- [Backup & Recovery](#backup--recovery)
- [Performance Tuning](#performance-tuning)
- [Troubleshooting](#troubleshooting)

## 🔧 Prerequisites

### System Requirements

#### Minimum Requirements
- **CPU**: 2 cores (2.4GHz)
- **RAM**: 4GB
- **Storage**: 20GB SSD
- **Network**: 10Mbps stable connection

#### Recommended Production Requirements
- **CPU**: 4+ cores (3.0GHz+)
- **RAM**: 8GB+
- **Storage**: 50GB+ NVMe SSD
- **Network**: 100Mbps+ with low latency

### Software Dependencies
- **Node.js**: 18.0.0 or higher (LTS recommended)
- **PostgreSQL**: 13.0 or higher
- **Redis**: 6.0 or higher
- **Docker**: 20.0+ (optional but recommended)
- **PM2**: Latest version (for process management)
- **Git**: Latest version

### Operating System Support
- **Linux**: Ubuntu 20.04+, CentOS 8+, Debian 11+
- **Windows**: Server 2019+, Windows 10/11
- **macOS**: 11.0+ (development only)

---

## 🌍 Environment Setup

### Development Environment

```bash
# 1. Clone repository
git clone https://github.com/your-repo/trading-bot.git
cd trading-bot

# 2. Install Node.js dependencies
npm install

# 3. Copy environment template
cp .env.example .env

# 4. Configure environment variables
nano .env  # Or your preferred editor

# 5. Start development server
npm run dev
```

### Production Environment

```bash
# 1. Set production environment
export NODE_ENV=production

# 2. Install production dependencies only
npm ci --only=production

# 3. Build application
npm run build

# 4. Set up environment variables
cp .env.example .env.production
# Configure production values in .env.production
```

### Environment Variables Configuration

#### Core Configuration
```env
# Node.js Environment
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Discord Bot Configuration
DISCORD_TOKEN=your_production_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_guild_id_optional
COMMAND_PREFIX=!

# Security
JWT_SECRET=your_jwt_secret_here
API_SECRET_KEY=your_api_secret_key
WEBHOOK_SECRET=your_webhook_secret
```

#### Database Configuration
```env
# PostgreSQL Primary Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=trading_bot_prod
DB_USER=trading_bot_user
DB_PASSWORD=secure_production_password
DB_POOL_MIN=2
DB_POOL_MAX=20
DB_SSL=require

# Database Connection String (alternative)
DATABASE_URL=postgresql://user:pass@host:port/dbname?sslmode=require
```

#### Redis Configuration
```env
# Redis Cache/Session Store
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis_production_password
REDIS_DB=0
REDIS_CLUSTER=false
REDIS_SSL=false

# Redis Connection String (alternative)
REDIS_URL=redis://:password@hostname:port/db
```

#### External Services
```env
# Market Data Providers
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
POLYGON_API_KEY=your_polygon_key
TWELVE_DATA_API_KEY=your_twelve_data_key
TRADINGVIEW_USERNAME=your_tv_username
TRADINGVIEW_PASSWORD=your_tv_password

# Monitoring & Analytics
SENTRY_DSN=your_sentry_dsn
NEW_RELIC_LICENSE_KEY=your_new_relic_key
DATADOG_API_KEY=your_datadog_key
```

#### Performance & Scaling
```env
# Rate Limiting
RATE_LIMIT_WINDOW=900000  # 15 minutes
RATE_LIMIT_MAX=100        # Max requests per window
RATE_LIMIT_SKIP_FAILED_REQUESTS=true

# Caching
CACHE_TTL=300            # 5 minutes default TTL
CACHE_MAX_SIZE=1000      # Max cached items
ENABLE_RESPONSE_CACHE=true

# Worker Processes
CLUSTER_MODE=true
WORKER_COUNT=0           # 0 = auto-detect CPU cores
```

---

## 🗄️ Database Configuration

### PostgreSQL Setup

#### Installation (Ubuntu/Debian)
```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### Database Creation
```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE trading_bot_prod;
CREATE USER trading_bot_user WITH ENCRYPTED PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE trading_bot_prod TO trading_bot_user;

# Grant additional permissions
ALTER USER trading_bot_user CREATEDB;
GRANT ALL ON SCHEMA public TO trading_bot_user;

# Exit psql
\q
```

#### TimescaleDB Extension (for time-series data)
```sql
-- Connect to your database
\c trading_bot_prod

-- Create TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create hypertables for market data
SELECT create_hypertable('market_data', 'timestamp');
SELECT create_hypertable('price_history', 'timestamp');
```

#### Performance Optimization
```sql
-- postgresql.conf optimizations
shared_buffers = 256MB                # 25% of RAM
effective_cache_size = 1GB            # 75% of RAM
work_mem = 64MB                       # Per connection
maintenance_work_mem = 256MB
wal_buffers = 16MB
checkpoint_completion_target = 0.7
random_page_cost = 1.1               # For SSD storage

-- Connection settings
max_connections = 200
shared_preload_libraries = 'timescaledb'
```

### Database Migrations

#### Run Initial Migrations
```bash
# Development
npm run db:migrate

# Production
NODE_ENV=production npm run db:migrate

# Rollback if needed
npm run db:rollback
```

#### Custom Migration Example
```javascript
// database/migrations/001_create_users.js
exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.increments('id').primary();
    table.string('discord_id').unique().notNullable();
    table.string('username').notNullable();
    table.json('preferences').defaultTo('{}');
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('users');
};
```

---

## 🔴 Redis Configuration

### Redis Installation

#### Ubuntu/Debian
```bash
# Install Redis
sudo apt update
sudo apt install redis-server

# Configure Redis for production
sudo nano /etc/redis/redis.conf

# Key configurations:
# bind 127.0.0.1
# requirepass your_strong_password
# maxmemory 2gb
# maxmemory-policy allkeys-lru

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

#### Production Redis Configuration
```conf
# /etc/redis/redis.conf

# Network Security
bind 127.0.0.1 10.0.0.5  # Bind to specific IPs
protected-mode yes
port 6379
requirepass your_very_strong_password

# Memory Management
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000

# Logging
loglevel notice
logfile /var/log/redis/redis-server.log

# Performance
tcp-backlog 511
timeout 0
tcp-keepalive 300
```

### Redis Cluster Setup (Optional)

For high availability and scaling:

```bash
# Create cluster directories
mkdir -p /etc/redis/cluster/{7000,7001,7002}

# Configure each node
# /etc/redis/cluster/7000/redis.conf
port 7000
cluster-enabled yes
cluster-config-file nodes-7000.conf
cluster-node-timeout 5000
appendonly yes
```

---

## 🐳 Docker Deployment

### Docker Compose Setup (Recommended)

#### docker-compose.yml
```yaml
version: '3.8'

services:
  # Trading Bot Application
  trading-bot:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - REDIS_HOST=redis
    env_file:
      - .env.production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    volumes:
      - ./logs:/app/logs
      - /etc/timezone:/etc/timezone:ro
    restart: unless-stopped
    networks:
      - trading-bot-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # PostgreSQL Database
  postgres:
    image: timescale/timescaledb:latest-pg14
    environment:
      POSTGRES_DB: trading_bot_prod
      POSTGRES_USER: trading_bot_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256"
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/init:/docker-entrypoint-initdb.d
    restart: unless-stopped
    networks:
      - trading-bot-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U trading_bot_user -d trading_bot_prod"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis Cache
  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
      - ./config/redis.conf:/usr/local/etc/redis/redis.conf
    restart: unless-stopped
    networks:
      - trading-bot-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

  # Nginx Load Balancer
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./config/nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - trading-bot
    restart: unless-stopped
    networks:
      - trading-bot-network

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local

networks:
  trading-bot-network:
    driver: bridge
```

#### Production Dockerfile
```dockerfile
# Multi-stage build for production optimization
FROM node:18-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Development stage
FROM base AS development
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Build stage
FROM base AS build
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine AS production
RUN apk add --no-cache curl dumb-init
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S trading-bot -u 1001

# Copy built application
COPY --from=build --chown=trading-bot:nodejs /app/dist ./dist
COPY --from=build --chown=trading-bot:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=trading-bot:nodejs /app/package*.json ./

# Create logs directory
RUN mkdir -p logs && chown -R trading-bot:nodejs logs

USER trading-bot

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/bot/index.js"]
```

### Docker Deployment Commands

```bash
# Build and start services
docker-compose -f docker-compose.yml up -d --build

# View logs
docker-compose logs -f trading-bot

# Scale the application
docker-compose up -d --scale trading-bot=3

# Update deployment
docker-compose pull
docker-compose up -d --build

# Backup volumes
docker run --rm -v trading-bot_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz /data

# Restore volumes
docker run --rm -v trading-bot_postgres_data:/data -v $(pwd):/backup alpine tar xzf /backup/postgres-backup.tar.gz -C /
```

---

## 🔧 Manual Deployment

### System Preparation

#### Ubuntu Server Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Create application user
sudo adduser --system --group --home /opt/trading-bot trading-bot

# Create application directory
sudo mkdir -p /opt/trading-bot
sudo chown -R trading-bot:trading-bot /opt/trading-bot
```

#### Application Deployment
```bash
# Switch to application user
sudo -u trading-bot -i

# Clone application
cd /opt/trading-bot
git clone https://github.com/your-repo/trading-bot.git .

# Install dependencies
NODE_ENV=production npm ci --only=production

# Build application
npm run build

# Set up environment
cp .env.example .env.production
# Edit .env.production with production values
```

### PM2 Configuration

#### ecosystem.config.js
```javascript
module.exports = {
  apps: [
    {
      name: 'trading-bot',
      script: 'dist/bot/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      // Logging
      log_file: '/opt/trading-bot/logs/combined.log',
      out_file: '/opt/trading-bot/logs/out.log',
      error_file: '/opt/trading-bot/logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Process management
      max_memory_restart: '1G',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',

      // Monitoring
      monitor: true,
      merge_logs: true,

      // Health check
      health_check_grace_period: 3000
    }
  ],

  deploy: {
    production: {
      user: 'trading-bot',
      host: ['production-server-1', 'production-server-2'],
      ref: 'origin/main',
      repo: 'https://github.com/your-repo/trading-bot.git',
      path: '/opt/trading-bot',
      'pre-deploy': 'git fetch --all',
      'post-deploy': 'npm ci --only=production && npm run build && pm2 reload ecosystem.config.js --env production && pm2 save',
      'pre-setup': 'mkdir -p /opt/trading-bot'
    }
  }
};
```

#### PM2 Management Commands
```bash
# Start application
pm2 start ecosystem.config.js --env production

# Monitor processes
pm2 monit

# View logs
pm2 logs trading-bot

# Reload without downtime
pm2 reload trading-bot

# Save current process list
pm2 save

# Set up auto-start on boot
pm2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u trading-bot --hp /opt/trading-bot

# Deploy updates
pm2 deploy production
```

---

## ⚖️ Load Balancer Setup

### Nginx Configuration

#### /etc/nginx/sites-available/trading-bot
```nginx
upstream trading_bot_backend {
    least_conn;
    server 127.0.0.1:3000 weight=1 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3001 weight=1 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3002 weight=1 max_fails=3 fail_timeout=30s;
}

# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=webhook:10m rate=30r/s;

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json;

    # API endpoints
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://trading_bot_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # Webhook endpoints
    location /webhook/ {
        limit_req zone=webhook burst=50 nodelay;
        proxy_pass http://trading_bot_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_send_timeout 10s;
        proxy_read_timeout 10s;
    }

    # Health check
    location /health {
        proxy_pass http://trading_bot_backend;
        access_log off;
    }

    # Static files (if any)
    location /static/ {
        alias /opt/trading-bot/public/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Default location
    location / {
        proxy_pass http://trading_bot_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Enable Nginx Configuration
```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/trading-bot /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### SSL Certificate Setup (Let's Encrypt)

```bash
# Install Certbot
sudo apt install snapd
sudo snap install core; sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Set up auto-renewal
sudo systemctl enable snap.certbot.renew.timer
```

---

## 📊 Monitoring & Logging

### Application Logging

#### Winston Configuration
```javascript
// src/utils/logger.js
const winston = require('winston');
require('winston-daily-rotate-file');

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'trading-bot' },
  transports: [
    // Error logs
    new winston.transports.DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d'
    }),

    // Combined logs
    new winston.transports.DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d'
    }),

    // Trading-specific logs
    new winston.transports.DailyRotateFile({
      filename: 'logs/trading-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'info',
      maxSize: '50m',
      maxFiles: '90d'
    })
  ]
});

// Console logging for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

module.exports = logger;
```

### System Monitoring

#### Prometheus Configuration
```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'trading-bot'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']

  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['localhost:9187']

  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['localhost:9121']
```

#### Grafana Dashboard
```json
{
  "dashboard": {
    "title": "Trading Bot Monitoring",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{route}}"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "stat",
        "targets": [
          {
            "expr": "rate(http_requests_total{status=~\"5..\"}[5m])",
            "legendFormat": "5xx errors"
          }
        ]
      }
    ]
  }
}
```

### Log Management

#### Logrotate Configuration
```bash
# /etc/logrotate.d/trading-bot
/opt/trading-bot/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 trading-bot trading-bot
    postrotate
        pm2 reloadLogs
    endscript
}
```

#### ELK Stack Integration
```javascript
// Elasticsearch transport
const { ElasticsearchTransport } = require('winston-elasticsearch');

logger.add(new ElasticsearchTransport({
  level: 'info',
  clientOpts: {
    node: 'http://localhost:9200',
    auth: {
      username: 'elastic',
      password: 'password'
    }
  },
  index: 'trading-bot-logs',
  indexTemplate: {
    settings: {
      number_of_shards: 1,
      number_of_replicas: 1
    }
  }
}));
```

---

## 🔒 Security Configuration

### SSL/TLS Configuration

#### Generate SSL Certificates
```bash
# Self-signed certificate (development)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Let's Encrypt (production)
certbot certonly --standalone -d your-domain.com
```

#### SSL Configuration in Application
```javascript
// src/server.js
const https = require('https');
const fs = require('fs');

if (process.env.NODE_ENV === 'production') {
  const privateKey = fs.readFileSync('/path/to/private-key.pem', 'utf8');
  const certificate = fs.readFileSync('/path/to/certificate.pem', 'utf8');
  const credentials = { key: privateKey, cert: certificate };

  const httpsServer = https.createServer(credentials, app);
  httpsServer.listen(443, () => {
    console.log('HTTPS Server running on port 443');
  });
}
```

### Firewall Configuration

#### UFW Setup (Ubuntu)
```bash
# Reset UFW to default
sudo ufw --force reset

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow specific services
sudo ufw allow ssh
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow from 10.0.0.0/8 to any port 5432  # PostgreSQL (internal only)
sudo ufw allow from 127.0.0.1 to any port 6379   # Redis (localhost only)

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status verbose
```

### Application Security

#### Environment Variable Security
```bash
# Use secrets management
export DISCORD_TOKEN=$(cat /run/secrets/discord_token)
export DB_PASSWORD=$(cat /run/secrets/db_password)

# Or use external secret management
export DISCORD_TOKEN=$(aws ssm get-parameter --name "/trading-bot/discord-token" --with-decryption --query "Parameter.Value" --output text)
```

#### Input Validation & Sanitization
```javascript
// src/middleware/validation.js
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', apiLimiter);
```

---

## 💾 Backup & Recovery

### Database Backup Strategy

#### Automated PostgreSQL Backups
```bash
#!/bin/bash
# backup-postgres.sh

BACKUP_DIR="/opt/backups/postgres"
DB_NAME="trading_bot_prod"
DB_USER="trading_bot_user"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/trading_bot_${DATE}.sql"

# Create backup directory
mkdir -p $BACKUP_DIR

# Create backup
pg_dump -U $DB_USER -h localhost $DB_NAME > $BACKUP_FILE

# Compress backup
gzip $BACKUP_FILE

# Remove backups older than 30 days
find $BACKUP_DIR -name "*.sql.gz" -type f -mtime +30 -delete

# Upload to S3 (optional)
aws s3 cp $BACKUP_FILE.gz s3://your-backup-bucket/postgres/
```

#### Automated Redis Backup
```bash
#!/bin/bash
# backup-redis.sh

BACKUP_DIR="/opt/backups/redis"
DATE=$(date +%Y%m%d_%H%M%S)
REDIS_DATA_DIR="/var/lib/redis"

mkdir -p $BACKUP_DIR

# Create Redis backup
redis-cli BGSAVE
sleep 10

# Copy RDB file
cp $REDIS_DATA_DIR/dump.rdb $BACKUP_DIR/redis_${DATE}.rdb
gzip $BACKUP_DIR/redis_${DATE}.rdb

# Remove old backups
find $BACKUP_DIR -name "*.rdb.gz" -type f -mtime +7 -delete
```

#### Backup Scheduling with Cron
```bash
# Edit crontab
crontab -e

# Add backup jobs
0 2 * * * /opt/trading-bot/scripts/backup-postgres.sh
0 3 * * * /opt/trading-bot/scripts/backup-redis.sh

# Application logs backup
0 4 * * 0 tar -czf /opt/backups/logs/logs_$(date +\%Y\%m\%d).tar.gz /opt/trading-bot/logs/
```

### Disaster Recovery Plan

#### Recovery Procedures
```bash
# 1. PostgreSQL Recovery
createdb trading_bot_prod_recovered
gunzip -c /opt/backups/postgres/trading_bot_20240115_020000.sql.gz | psql -U trading_bot_user trading_bot_prod_recovered

# 2. Redis Recovery
sudo systemctl stop redis-server
gunzip -c /opt/backups/redis/redis_20240115_030000.rdb.gz > /var/lib/redis/dump.rdb
sudo chown redis:redis /var/lib/redis/dump.rdb
sudo systemctl start redis-server

# 3. Application Recovery
cd /opt/trading-bot
git pull origin main
npm ci --only=production
npm run build
pm2 reload ecosystem.config.js
```

#### High Availability Setup
```yaml
# docker-compose.ha.yml
version: '3.8'

services:
  trading-bot-primary:
    <<: *trading-bot-service
    deploy:
      replicas: 2

  trading-bot-secondary:
    <<: *trading-bot-service
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == worker

  postgres-primary:
    image: timescale/timescaledb:latest-pg14
    environment:
      POSTGRES_REPLICATION_MODE: master
      POSTGRES_REPLICATION_USER: replicator
      POSTGRES_REPLICATION_PASSWORD: replication_password

  postgres-replica:
    image: timescale/timescaledb:latest-pg14
    environment:
      POSTGRES_REPLICATION_MODE: slave
      POSTGRES_MASTER_HOST: postgres-primary
      POSTGRES_REPLICATION_USER: replicator
      POSTGRES_REPLICATION_PASSWORD: replication_password
```

---

## ⚡ Performance Tuning

### Node.js Optimization

#### Memory Management
```javascript
// Optimize garbage collection
process.env.NODE_OPTIONS = "--max-old-space-size=4096 --max-semi-space-size=256";

// src/server.js
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster && process.env.NODE_ENV === 'production') {
  console.log(`Master ${process.pid} is running`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork(); // Restart worker
  });
} else {
  // Worker processes
  require('./app');
  console.log(`Worker ${process.pid} started`);
}
```

#### Connection Pooling
```javascript
// Database connection pooling
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  // Pool configuration
  min: 2,                    // Minimum connections
  max: 20,                   // Maximum connections
  idleTimeoutMillis: 30000,  // Close idle connections after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection cannot be established

  // Keep connections alive
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Redis connection pooling
const redis = require('redis');
const client = redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,

  // Connection pool settings
  connectTimeout: 5000,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: null,

  // Keep-alive
  keepAlive: 30000,
});
```

### Caching Strategy

#### Multi-level Caching
```javascript
// src/cache/index.js
const NodeCache = require('node-cache');
const redis = require('redis');

class CacheManager {
  constructor() {
    // L1 Cache - In-memory (fastest)
    this.l1Cache = new NodeCache({
      stdTTL: 60,        // 1 minute default TTL
      checkperiod: 120,  // Check for expired keys every 2 minutes
      maxKeys: 1000      // Maximum number of keys
    });

    // L2 Cache - Redis (shared across instances)
    this.l2Cache = redis.createClient({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD
    });
  }

  async get(key) {
    // Try L1 first
    let value = this.l1Cache.get(key);
    if (value !== undefined) {
      return value;
    }

    // Try L2
    value = await this.l2Cache.get(key);
    if (value !== null) {
      // Store in L1 for next time
      this.l1Cache.set(key, JSON.parse(value), 60);
      return JSON.parse(value);
    }

    return null;
  }

  async set(key, value, ttl = 300) {
    // Set in both caches
    this.l1Cache.set(key, value, Math.min(ttl, 60));
    await this.l2Cache.setex(key, ttl, JSON.stringify(value));
  }
}

module.exports = new CacheManager();
```

### Database Performance

#### Query Optimization
```sql
-- Add indexes for frequently queried columns
CREATE INDEX CONCURRENTLY idx_market_data_pair_timestamp ON market_data (pair, timestamp DESC);
CREATE INDEX CONCURRENTLY idx_alerts_user_active ON alerts (user_id, active) WHERE active = true;
CREATE INDEX CONCURRENTLY idx_commands_executed_at ON command_logs USING BRIN (executed_at);

-- Partitioning for large tables
CREATE TABLE market_data_2024_01 PARTITION OF market_data
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Materialized views for complex queries
CREATE MATERIALIZED VIEW daily_stats AS
SELECT
  DATE(timestamp) as date,
  pair,
  COUNT(*) as total_requests,
  AVG(response_time) as avg_response_time
FROM command_logs
GROUP BY DATE(timestamp), pair;

-- Refresh materialized view
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_stats;
```

#### Connection Optimization
```bash
# PostgreSQL configuration
# postgresql.conf
max_connections = 200
shared_buffers = 512MB
effective_cache_size = 2GB
maintenance_work_mem = 256MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 64MB
```

---

## 🔍 Troubleshooting

### Common Issues

#### Bot Not Starting
```bash
# Check application logs
tail -f /opt/trading-bot/logs/error-$(date +%Y-%m-%d).log

# Check PM2 process status
pm2 list
pm2 describe trading-bot

# Check system resources
free -h
df -h
htop

# Common fixes
pm2 restart trading-bot
npm run build  # Rebuild if needed
```

#### Database Connection Issues
```bash
# Test database connectivity
psql -U trading_bot_user -h localhost -d trading_bot_prod -c "\dt"

# Check PostgreSQL status
sudo systemctl status postgresql

# Check connection limits
psql -U trading_bot_user -c "SELECT count(*) FROM pg_stat_activity;"

# Common fixes
sudo systemctl restart postgresql
# Adjust max_connections in postgresql.conf
```

#### Redis Connection Issues
```bash
# Test Redis connectivity
redis-cli -h localhost -p 6379 -a your_password ping

# Check Redis status
sudo systemctl status redis-server

# Check memory usage
redis-cli info memory

# Common fixes
sudo systemctl restart redis-server
# Increase maxmemory in redis.conf
```

#### High Memory Usage
```bash
# Monitor application memory
pm2 monit

# Check for memory leaks
node --inspect dist/bot/index.js
# Connect Chrome DevTools for heap analysis

# Common fixes
pm2 restart trading-bot
# Adjust max_memory_restart in ecosystem.config.js
```

### Performance Issues

#### Slow API Responses
```bash
# Check database query performance
EXPLAIN ANALYZE SELECT * FROM market_data WHERE pair = 'EURUSD' ORDER BY timestamp DESC LIMIT 100;

# Monitor system load
iostat -x 1
vmstat 1

# Common fixes
# Add appropriate indexes
# Optimize queries
# Increase database connection pool
```

#### Rate Limiting Issues
```bash
# Check rate limiting logs
grep "Rate limit exceeded" /opt/trading-bot/logs/combined-$(date +%Y-%m-%d).log

# Monitor Redis for rate limit keys
redis-cli keys "rate_limit:*"

# Common fixes
# Adjust rate limits in configuration
# Implement user-specific rate limits
# Use Redis cluster for scaling
```

### Diagnostic Commands

```bash
# System health check
curl -s http://localhost:3000/health | jq

# Database health
pg_isready -U trading_bot_user -d trading_bot_prod

# Redis health
redis-cli ping

# Application metrics
curl -s http://localhost:3000/metrics

# Process monitoring
pm2 monit
htop
iotop

# Log analysis
tail -f /opt/trading-bot/logs/combined-$(date +%Y-%m-%d).log | grep ERROR
journalctl -u nginx -f
```

### Emergency Procedures

#### Quick Restart
```bash
# Full application restart
pm2 restart trading-bot

# Database restart
sudo systemctl restart postgresql

# Redis restart
sudo systemctl restart redis-server

# Nginx restart
sudo systemctl restart nginx
```

#### Rollback Deployment
```bash
# Git rollback
cd /opt/trading-bot
git log --oneline -5  # Find last good commit
git checkout <commit-hash>
npm ci --only=production
npm run build
pm2 restart trading-bot
```

#### Emergency Maintenance Mode
```nginx
# nginx maintenance configuration
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    location / {
        return 503 "Service temporarily unavailable for maintenance";
        add_header Content-Type text/plain;
    }
}
```

---

## 📞 Support

For deployment support:
- **Documentation**: [GitHub Wiki](https://github.com/your-repo/wiki)
- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Discord**: Join our deployment support channel
- **Email**: devops@trading-bot.com

---

## 📝 Deployment Checklist

### Pre-Deployment
- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] Database migrations run
- [ ] Dependencies installed
- [ ] Build artifacts generated
- [ ] Backup strategy implemented

### Deployment
- [ ] Application deployed
- [ ] Health checks passing
- [ ] Load balancer configured
- [ ] Monitoring enabled
- [ ] Logging configured
- [ ] Security settings applied

### Post-Deployment
- [ ] Functionality tested
- [ ] Performance verified
- [ ] Alerts configured
- [ ] Documentation updated
- [ ] Team notified
- [ ] Rollback plan tested

---

*This deployment guide covers production-ready deployment scenarios. For development setup, refer to the main [README.md](../README.md).*