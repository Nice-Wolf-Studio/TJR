# ADR-0305: Discord Bot Multi-Environment Deployment

## Status
Accepted

## Date
2024-01-30

## Context
The TJR Discord bot needs to support multiple deployment environments (development, staging, production) with different configurations and command sets. We require a system that ensures:
- Environment-specific command registration
- Idempotent deployments
- Clear separation between environments
- Rollback capabilities
- Deployment auditability

Currently, the bot has basic command registration but lacks environment awareness and deployment management.

## Decision
We will implement a profile-based deployment system with the following components:

1. **Environment Profiles**: Predefined configurations for dev, stage, and prod environments
2. **Manifest System**: JSON files tracking deployed commands per environment
3. **Deployment CLI**: Command-line tools for diff, validate, and apply operations
4. **Environment Variables**: Separate credentials for each environment

## Architecture

### Profile Configuration
```typescript
interface ProfileConfig {
  environment: 'dev' | 'stage' | 'prod';
  global: boolean;  // Global vs guild-specific registration
  guildIds?: string[];
  enabledCommands: string[];
  commandOverrides?: Record<string, CommandOverrides>;
  manifestPath: string;
}
```

### Deployment Flow
```
1. Load environment profile
2. Validate credentials
3. Generate command manifest
4. Compare with deployed manifest
5. Apply changes if needed
6. Save new manifest
```

### Manifest Structure
```json
{
  "version": "1.0.0",
  "commands": [...],
  "environment": "dev",
  "deployedAt": "ISO-8601",
  "global": false,
  "guildIds": ["..."]
}
```

## Implementation Details

### Environment Separation
- **Dev**: Guild-specific, all commands, test servers only
- **Stage**: Guild-specific, all commands, staging server
- **Prod**: Global registration, production commands only

### Credential Management
```bash
DISCORD_<ENV>_TOKEN
DISCORD_<ENV>_APPLICATION_ID
DISCORD_<ENV>_GUILD_IDS  # Not needed for prod
```

### CLI Commands
```bash
commands-deploy diff --env <env>      # Show changes
commands-deploy validate --env <env>  # Validate config
commands-deploy apply --env <env>     # Deploy changes
commands-deploy status --env <env>    # Current state
commands-deploy rollback --env <env>  # Restore previous
```

### Idempotency Guarantees
- Manifest comparison before deployment
- No-op when no changes detected
- Dry-run mode for preview
- Force flag for override

## Consequences

### Positive
- **Environment isolation**: Clear separation between dev/stage/prod
- **Safe deployments**: Dry-run and diff capabilities
- **Rollback support**: Can restore previous configurations
- **Audit trail**: Manifest history provides deployment tracking
- **CI/CD ready**: Scriptable deployment process
- **Idempotent**: Same command produces same result

### Negative
- **Additional complexity**: More configuration to manage
- **Manifest maintenance**: Need to track manifest files
- **Environment setup**: Requires multiple Discord applications
- **Credential management**: More secrets to secure

### Neutral
- **Build requirement**: Must build TypeScript before deployment
- **Storage overhead**: Manifest files per environment
- **Learning curve**: Team needs to understand new deployment process

## Alternatives Considered

### 1. Single Bot with Feature Flags
- **Pros**: Simpler setup, one set of credentials
- **Cons**: Risk of affecting production, complex runtime logic
- **Rejected**: Environment isolation is critical

### 2. Manual Discord Developer Portal Management
- **Pros**: No custom tooling needed
- **Cons**: Error-prone, no automation, no audit trail
- **Rejected**: Doesn't scale with team or command count

### 3. Infrastructure as Code (Terraform/Pulumi)
- **Pros**: Industry standard, declarative
- **Cons**: Overkill for Discord commands, requires additional tooling
- **Rejected**: Too heavy for current needs

## Migration Path

1. **Phase 1**: Deploy to development environment
2. **Phase 2**: Set up staging environment
3. **Phase 3**: Production deployment with monitoring
4. **Phase 4**: CI/CD integration

## Security Considerations

- Separate bot tokens per environment
- No production credentials in development
- Guild restrictions for non-production
- Environment variable validation
- Automated backup before deployment

## Monitoring and Alerts

- Deployment success/failure logging
- Manifest diff notifications
- Rollback tracking
- Command registration metrics

## Related Documents

- [Discord Environments Documentation](../ops/discord-envs.md)
- [Discord Bot Core ADR](ADR-0206-discord-core.md)
- [Development Scripts ADR](ADR-0104-dev-scripts.md)

## References

- [Discord.js Deployment Guide](https://discordjs.guide/creating-your-bot/command-deployment.html)
- [Discord Application Commands](https://discord.com/developers/docs/interactions/application-commands)
- [12-Factor App Environment Config](https://12factor.net/config)