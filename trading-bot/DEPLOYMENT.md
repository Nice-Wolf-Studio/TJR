# Deployment Guide (Daily Plan Edition)

> **Heads up:** The runtime now focuses on slash commands `/bias`, `/profile`, and `/levels` powered by the daily plan pipeline. Legacy components (alert manager, trading webhooks, analysis engine) are deprecated and no longer required for deployment.

This guide covers various deployment options for the Trading Bot, from development to production environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Cloud Deployment](#cloud-deployment)
- [Production Deployment](#production-deployment)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

- **Node.js**: v18.0.0 or higher (required)
- **npm**: v8.0.0 or higher (or yarn v1.22.0+)
- **PostgreSQL / Redis**: optional; the current daily plan flow runs without them
- **Docker**: optional, if you prefer containerized deployments

### Discord Setup

1. **Create Discord Application**:
   - Visit [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application" and name it
   - Navigate to "Bot" section and create a bot
   - Copy the bot token (keep it secure)

2. **Configure Bot Permissions**:
   Required permissions:
   - Send Messages (2048)
   - Read Messages (1024)
   - Embed Links (16384)
   - Read Message History (65536)
   - Use Slash Commands (2147483648)

   Permission integer: `2147548672`

3. **Invite Bot to Server**:
   ```
   https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2147548672&scope=bot
   ```

## Environment Setup

### 1. Clone Repository
```bash
git clone <repository-url>
cd trading-bot
```

### 2. Environment Configuration
```bash
# Copy environment template
cp .env.example .env

# Edit configuration
nano .env
```

### 3. Required Environment Variables
```env
# Discord (Required)
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id

# Market data providers
ALPHAVANTAGE_API_KEY=your_alpha_vantage_key   # Optional but recommended
POLYGON_API_KEY=your_polygon_key              # Optional secondary provider

# Runtime mode
NODE_ENV=development
```

> PostgreSQL/Redis credentials are only needed if you re-enable the legacy pipeline or want persistent storage.

## Local Development

### Quick Start
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Development with Database
```bash
# Start PostgreSQL and Redis (if using Docker)
docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=mypassword postgres:15
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Set database password in .env
echo "DB_PASSWORD=mypassword" >> .env

# Start bot
npm run dev
```

### Available Development Commands
```bash
npm run dev          # Start with nodemon (auto-restart)
npm run build        # Compile TypeScript
npm run lint         # Check code style
npm run lint:fix     # Fix style issues
npm test            # Run tests
```

## Docker Deployment

### Simple Docker Deployment
```bash
# Build image
docker build -t trading-bot .

# Run container
docker run -d \
  --name trading-bot \
  --env-file .env \
  -p 3000:3000 \
  trading-bot
```

### Docker Compose Deployment
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f trading-bot

# Stop services
docker-compose down
```

### Docker Compose with Monitoring
```bash
# Start with monitoring stack
docker-compose --profile monitoring up -d

# Access services
# Bot: http://localhost:3000
# Grafana: http://localhost:3001 (admin/admin)
# Prometheus: http://localhost:9090
```

## Cloud Deployment

### AWS Deployment

#### Using AWS ECS
```bash
# Build and push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
docker build -t trading-bot .
docker tag trading-bot:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/trading-bot:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/trading-bot:latest

# Deploy using ECS service
aws ecs update-service --cluster trading-bot-cluster --service trading-bot-service --force-new-deployment
```

#### Using AWS Lambda (Serverless)
```javascript
// lambda-handler.js
const bot = require('./dist/bot/index');

exports.handler = async (event, context) => {
    // Lambda-specific implementation
    // Note: Full Discord bot may not be suitable for Lambda
    // Consider using for webhook handlers only
};
```

### Google Cloud Platform

#### Using Cloud Run
```bash
# Build and deploy
gcloud builds submit --tag gcr.io/PROJECT_ID/trading-bot
gcloud run deploy --image gcr.io/PROJECT_ID/trading-bot --platform managed --region us-central1
```

#### Using GKE
```yaml
# kubernetes-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: trading-bot
spec:
  replicas: 1
  selector:
    matchLabels:
      app: trading-bot
  template:
    metadata:
      labels:
        app: trading-bot
    spec:
      containers:
      - name: trading-bot
        image: gcr.io/PROJECT_ID/trading-bot:latest
        ports:
        - containerPort: 3000
        envFrom:
        - secretRef:
            name: trading-bot-secrets
```

### DigitalOcean

#### Using App Platform
```yaml
# .do/app.yaml
name: trading-bot
services:
- name: bot
  source_dir: /
  github:
    repo: your-username/trading-bot
    branch: main
  run_command: npm start
  environment_slug: node-js
  instance_count: 1
  instance_size_slug: basic-xxs
  envs:
  - key: NODE_ENV
    value: production
  - key: DISCORD_TOKEN
    value: ${DISCORD_TOKEN}
    type: SECRET
```

### Heroku

```bash
# Install Heroku CLI and login
npm install -g heroku

# Create app
heroku create your-trading-bot

# Set environment variables
heroku config:set DISCORD_TOKEN=your_token
heroku config:set NODE_ENV=production

# Deploy
git push heroku main

# Scale
heroku ps:scale web=1
```

## Production Deployment

### VPS/Dedicated Server Setup

#### 1. Server Preparation
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Install Redis
sudo apt install redis-server

# Install PM2 for process management
npm install -g pm2
```

#### 2. Application Setup
```bash
# Clone repository
git clone <repository-url> /opt/trading-bot
cd /opt/trading-bot

# Install dependencies
npm ci --only=production

# Build application
npm run build

# Setup environment
cp .env.example .env
# Edit .env with production values
```

#### 3. Database Setup
```bash
# Create database user and database
sudo -u postgres psql
CREATE USER trading_bot WITH PASSWORD 'secure_password';
CREATE DATABASE trading_bot OWNER trading_bot;
GRANT ALL PRIVILEGES ON DATABASE trading_bot TO trading_bot;
\q
```

#### 4. PM2 Configuration
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'trading-bot',
    script: 'dist/bot/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/var/log/trading-bot/error.log',
    out_file: '/var/log/trading-bot/out.log',
    log_file: '/var/log/trading-bot/combined.log',
    time: true,
    max_memory_restart: '500M',
    node_args: '--max-old-space-size=1024'
  }]
};
```

#### 5. Start Services
```bash
# Start with PM2
pm2 start ecosystem.config.js

# Setup startup script
pm2 startup
pm2 save

# Setup log rotation
pm2 install pm2-logrotate
```

### Nginx Reverse Proxy (Optional)
```nginx
# /etc/nginx/sites-available/trading-bot
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }
}
```

### SSL Certificate (Let's Encrypt)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal (crontab)
0 12 * * * /usr/bin/certbot renew --quiet
```

## Monitoring and Maintenance

### Health Monitoring
```bash
# Check application health
curl http://localhost:3000/health

# Monitor with PM2
pm2 monit

# View logs
pm2 logs trading-bot --lines 100
```

### Automated Monitoring Script
```bash
#!/bin/bash
# health-check.sh

HEALTH_URL="http://localhost:3000/health"
WEBHOOK_URL="your_discord_webhook_url"

response=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $response -ne 200 ]; then
    curl -X POST -H "Content-Type: application/json" \
         -d "{\"content\":\"⚠️ Trading Bot health check failed! Status: $response\"}" \
         $WEBHOOK_URL
fi
```

### Log Management
```bash
# Setup logrotate
cat > /etc/logrotate.d/trading-bot << EOF
/var/log/trading-bot/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
}
EOF
```

### Backup Strategy
```bash
#!/bin/bash
# backup.sh

# Database backup
pg_dump -h localhost -U trading_bot trading_bot | gzip > /backups/db-$(date +%Y%m%d).sql.gz

# Application backup
tar -czf /backups/app-$(date +%Y%m%d).tar.gz /opt/trading-bot

# Keep last 30 days
find /backups -name "*.gz" -mtime +30 -delete
```

## Troubleshooting

### Common Issues

#### Bot Not Starting
```bash
# Check logs
pm2 logs trading-bot

# Check configuration
node -r ts-node/register -e "console.log(require('./src/config/bot'))"

# Test Discord token
curl -H "Authorization: Bot YOUR_BOT_TOKEN" \
     https://discord.com/api/v10/users/@me
```

#### Database Connection Issues
```bash
# Test PostgreSQL connection
psql -h localhost -U trading_bot -d trading_bot -c "SELECT NOW();"

# Check PostgreSQL status
sudo systemctl status postgresql

# View PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

#### High Memory Usage
```bash
# Check memory usage
pm2 show trading-bot

# Enable memory monitoring
pm2 set pm2-logrotate:max_size 10M
pm2 restart trading-bot --max-memory-restart 400M
```

#### Discord API Rate Limits
```bash
# Monitor rate limit headers in logs
grep -i "rate" /var/log/trading-bot/combined.log

# Implement exponential backoff in code
# Check Discord API status: https://discordstatus.com/
```

### Performance Optimization

#### Node.js Optimization
```bash
# Increase memory limit
node --max-old-space-size=2048 dist/bot/index.js

# Enable V8 optimizations
node --optimize-for-size dist/bot/index.js
```

#### Database Optimization
```sql
-- Add indexes for commonly queried fields
CREATE INDEX idx_commands_user_id ON command_logs(user_id);
CREATE INDEX idx_commands_timestamp ON command_logs(timestamp);

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM command_logs WHERE user_id = '123';
```

### Disaster Recovery

#### Automated Recovery Script
```bash
#!/bin/bash
# recovery.sh

# Stop application
pm2 stop trading-bot

# Restore from backup
tar -xzf /backups/app-latest.tar.gz -C /

# Restore database
gunzip -c /backups/db-latest.sql.gz | psql -h localhost -U trading_bot trading_bot

# Start application
pm2 start trading-bot

# Verify health
sleep 30
curl http://localhost:3000/health
```

## Security Considerations

### Environment Security
- Store sensitive data in environment variables, not in code
- Use strong database passwords
- Regularly rotate API tokens and passwords
- Implement IP whitelisting for database access
- Use HTTPS for all external communications

### Application Security
- Validate all user inputs
- Implement rate limiting on commands
- Log security events
- Keep dependencies updated
- Use least privilege principle for database users

### Infrastructure Security
- Configure firewall rules
- Enable automatic security updates
- Monitor system logs
- Use SSH keys instead of passwords
- Implement fail2ban for brute force protection

This deployment guide covers most common scenarios. For specific questions or issues, check the application logs and refer to the troubleshooting section.
