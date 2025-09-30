# ADR-0206: Discord Bot Core Architecture

**Status:** Accepted
**Date:** 2024-01-30
**Author:** TJR Development Team

## Context

The TJR trading system requires a Discord bot interface to provide real-time trading information, system health monitoring, and interactive commands for users. The bot needs to be maintainable, extensible, and follow Discord's best practices for slash commands.

## Decision

We will implement a modular Discord bot core package (`@tjr/discord-bot-core`) with:

1. **Command Schema System**: Type-safe command definitions with full Discord API support
2. **Command Handler**: Centralized command processing with error handling
3. **Command Registrar CLI**: Tool for registering commands with dry-run support
4. **Deterministic Manifests**: Reproducible command registration for CI/CD

## Architecture

### Core Components

```typescript
// Type-safe command schemas
interface CommandSchema {
  name: string;
  description: string;
  options?: CommandOption[];
  dmPermission?: boolean;
  defaultMemberPermissions?: bigint | string | null;
}

// Command handler pattern
interface Command {
  schema: CommandSchema;
  handler: CommandHandler;
}

// Centralized handler
class CommandHandler {
  registerCommand(command: Command): void;
  handleInteraction(interaction: ChatInputCommandInteraction): Promise<void>;
  generateManifest(): CommandManifest;
}
```

### CLI Design

The registrar CLI follows dev-scripts philosophy:
- **Dry-run by default mindset**: Shows changes before applying
- **Idempotent operations**: Safe to run multiple times
- **Deterministic output**: Consistent manifest generation

```bash
# Dry-run to see changes
discord-registrar --dry-run

# Apply changes
discord-registrar --token $TOKEN --application-id $APP_ID

# Force update even if no changes
discord-registrar --force

# Verbose output with all details
discord-registrar --verbose
```

### Command Structure

Commands are organized into:
- `/src/schemas/`: Schema definitions
- `/src/commands/`: Command handlers
- `/src/handlers/`: Core processing logic
- `/cli/`: CLI tools

## Consequences

### Positive

1. **Type Safety**: Full TypeScript support prevents runtime errors
2. **Testability**: Modular design enables comprehensive testing
3. **Maintainability**: Clear separation of concerns
4. **Extensibility**: Easy to add new commands
5. **CI/CD Ready**: Deterministic manifests enable automation
6. **Developer Experience**: Dry-run mode prevents mistakes

### Negative

1. **Initial Complexity**: More setup than simple bot scripts
2. **Build Step Required**: TypeScript compilation needed
3. **Manifest Management**: Additional file to track

### Trade-offs

- **Flexibility vs Structure**: We chose structure for long-term maintainability
- **Simplicity vs Features**: We added features like dry-run for safety
- **Speed vs Safety**: Dry-run checks add a step but prevent errors

## Implementation Notes

### Testing Strategy

1. **Snapshot Tests**: Ensure command schemas don't change unexpectedly
2. **Unit Tests**: Verify handler logic and error cases
3. **Integration Tests**: Test command registration flow

### Security Considerations

1. **Token Management**: Never commit tokens, use environment variables
2. **Permission Scoping**: Commands specify required permissions
3. **DM Restrictions**: Control which commands work in DMs

### Future Enhancements

1. **Command Versioning**: Track schema changes over time
2. **Auto-discovery**: Automatically find and register commands
3. **Hot Reload**: Update commands without bot restart
4. **Command Analytics**: Track usage and performance

## Related

- ADR-0201: Monorepo Structure
- ADR-0202: Package Architecture
- ADR-0205: Dev-Scripts Philosophy

## References

- [Discord.js Guide](https://discordjs.guide/)
- [Discord API Documentation](https://discord.com/developers/docs/intro)
- [Application Commands](https://discord.com/developers/docs/interactions/application-commands)