# Discord Environment Configuration

## Overview

The TJR Discord bot supports multiple deployment environments (dev, stage, prod) with environment-specific command registration and configuration. This document describes how to configure and manage Discord bot deployments across different environments.

## Environment Profiles

### Development (dev)
- **Purpose**: Local development and testing
- **Registration**: Guild-specific (test servers only)
- **Commands**: All available commands
- **Manifest**: `./manifests/dev-manifest.json`

### Staging (stage)
- **Purpose**: Pre-production testing
- **Registration**: Guild-specific (staging servers)
- **Commands**: All available commands
- **Manifest**: `./manifests/stage-manifest.json`

### Production (prod)
- **Purpose**: Live production environment
- **Registration**: Global (all servers)
- **Commands**: Production-ready commands only
- **Manifest**: `./manifests/prod-manifest.json`

## Environment Variables

Each environment requires specific Discord credentials and configuration:

### Development
```bash
DISCORD_DEV_TOKEN=your_dev_bot_token
DISCORD_DEV_APPLICATION_ID=your_dev_app_id
DISCORD_DEV_GUILD_IDS=guild_id_1,guild_id_2
```

### Staging
```bash
DISCORD_STAGE_TOKEN=your_stage_bot_token
DISCORD_STAGE_APPLICATION_ID=your_stage_app_id
DISCORD_STAGE_GUILD_IDS=staging_guild_id
```

### Production
```bash
DISCORD_PROD_TOKEN=your_prod_bot_token
DISCORD_PROD_APPLICATION_ID=your_prod_app_id
# No GUILD_IDS needed for global registration
```

## Deployment Commands

### Using discord-registrar directly

```bash
# Build the discord-bot-core package first
cd packages/discord-bot-core
pnpm build

# Deploy to development
node ./dist/cli/registrar.js --env dev

# Deploy to staging with dry-run
node ./dist/cli/registrar.js --env stage --dry-run

# Deploy to production with verbose output
node ./dist/cli/registrar.js --env prod --verbose
```

### Using dev-scripts commands

```bash
# Install dependencies
pnpm install

# Show what would change (dry-run)
pnpm commands-deploy diff --env dev

# Validate environment configuration
pnpm commands-deploy validate --env stage

# Apply changes to Discord
pnpm commands-deploy apply --env prod

# Check deployment status
pnpm commands-deploy status --env dev

# Rollback to previous deployment
pnpm commands-deploy rollback --env prod
```

## Deployment Workflow

### 1. Development
```bash
# Set up dev environment variables
export DISCORD_DEV_TOKEN=...
export DISCORD_DEV_APPLICATION_ID=...
export DISCORD_DEV_GUILD_IDS=...

# Test changes locally
pnpm commands-deploy diff --env dev
pnpm commands-deploy apply --env dev
```

### 2. Staging
```bash
# Validate staging configuration
pnpm commands-deploy validate --env stage

# Deploy to staging
pnpm commands-deploy apply --env stage

# Verify deployment
pnpm commands-deploy status --env stage
```

### 3. Production
```bash
# Final validation
pnpm commands-deploy validate --env prod

# Review changes
pnpm commands-deploy diff --env prod

# Deploy to production
pnpm commands-deploy apply --env prod

# Confirm deployment
pnpm commands-deploy status --env prod
```

## Manifest Files

Command manifests are stored in `./manifests/` and contain:
- List of registered commands
- Environment metadata
- Deployment timestamp
- Registration scope (global/guild-specific)

Example manifest structure:
```json
{
  "version": "1.0.0",
  "commands": [
    {
      "name": "health",
      "description": "Check bot health status",
      "options": []
    },
    {
      "name": "daily",
      "description": "Get today's trading session information",
      "options": []
    }
  ],
  "environment": "dev",
  "deployedAt": "2024-01-01T00:00:00.000Z",
  "global": false,
  "guildIds": ["123456789012345678"]
}
```

## Idempotent Deployments

The deployment system ensures idempotency through:

1. **Manifest Comparison**: Compares current commands with deployed manifest
2. **Change Detection**: Only applies changes when differences exist
3. **Dry-Run Mode**: Preview changes without applying them
4. **Force Flag**: Override change detection when needed

### Verifying Idempotency

```bash
# First deployment
pnpm commands-deploy apply --env dev

# Second deployment (should show no changes)
pnpm commands-deploy diff --env dev
# Output: "✅ No changes detected. Commands are up to date."
```

## Rollback Procedures

If a deployment causes issues:

```bash
# List available backups
ls ./manifests/*backup*

# Rollback to most recent backup
pnpm commands-deploy rollback --env prod

# Rollback to specific backup
pnpm commands-deploy rollback --env prod --backup prod-manifest.backup.1704067200000.json
```

## Security Considerations

1. **Never commit tokens**: Use environment variables or secure vaults
2. **Separate credentials**: Use different bots for each environment
3. **Guild restrictions**: Limit dev/stage to specific test servers
4. **Audit trail**: Manifests provide deployment history
5. **Backup strategy**: Automatic backups before each deployment

## Troubleshooting

### Missing Environment Variables
```bash
pnpm commands-deploy validate --env dev --verbose
```

### Command Registration Failures
- Check bot permissions in Discord Developer Portal
- Verify application ID matches bot token
- Ensure bot is invited to guild (for guild-specific deployments)

### Manifest Corruption
```bash
# Remove corrupted manifest
rm ./manifests/dev-manifest.json

# Rebuild from scratch
pnpm commands-deploy apply --env dev --force
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Deploy Discord Commands

on:
  push:
    branches: [main]
    paths:
      - 'packages/discord-bot-core/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - name: Install dependencies
        run: pnpm install

      - name: Build packages
        run: pnpm -F discord-bot-core build

      - name: Deploy to staging
        env:
          DISCORD_STAGE_TOKEN: ${{ secrets.DISCORD_STAGE_TOKEN }}
          DISCORD_STAGE_APPLICATION_ID: ${{ secrets.DISCORD_STAGE_APP_ID }}
          DISCORD_STAGE_GUILD_IDS: ${{ secrets.DISCORD_STAGE_GUILDS }}
        run: |
          pnpm commands-deploy validate --env stage
          pnpm commands-deploy apply --env stage

      - name: Upload manifest
        uses: actions/upload-artifact@v3
        with:
          name: stage-manifest
          path: ./manifests/stage-manifest.json
```

## Best Practices

1. **Test in dev first**: Always validate changes in development
2. **Use dry-run**: Preview changes before applying
3. **Monitor deployments**: Check status after each deployment
4. **Keep backups**: Maintain manifest history for rollbacks
5. **Document changes**: Update command documentation with deployments
6. **Environment separation**: Never share tokens between environments
7. **Progressive rollout**: Dev → Stage → Prod deployment flow