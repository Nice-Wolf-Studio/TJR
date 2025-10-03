# @tjr/discord-bot-core

Core Discord bot functionality with command schema and registrar for the TJR trading system.

## Features

- 🎯 Type-safe command schemas
- 🔧 Centralized command handler
- 🚀 CLI registrar with dry-run support
- 📸 Deterministic manifest generation
- ✅ Comprehensive test coverage

## Installation

```bash
pnpm add @tjr/discord-bot-core
```

## Usage

### Define a Command

```typescript
import type { Command } from '@tjr/discord-bot-core';

const myCommand: Command = {
  schema: {
    name: 'mycommand',
    description: 'Does something useful',
    options: [
      {
        type: 3, // STRING
        name: 'input',
        description: 'Input value',
        required: true,
      },
    ],
  },
  handler: async (interaction) => {
    const input = interaction.options.getString('input');
    await interaction.reply(`You said: ${input}`);
  },
};
```

### Register Commands

```typescript
import { CommandHandler } from '@tjr/discord-bot-core';
import { Client } from 'discord.js';

const client = new Client({ intents: [] });
const handler = new CommandHandler(client);

// Register your commands
handler.registerCommand(myCommand);

// Handle interactions
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    await handler.handleInteraction(interaction);
  }
});
```

### Use the Registrar CLI

```bash
# Set environment variables
export DISCORD_TOKEN="your-bot-token"
export DISCORD_APPLICATION_ID="your-app-id"

# Dry-run to preview changes
pnpm discord-registrar --dry-run

# Apply changes
pnpm discord-registrar

# Force update all commands
pnpm discord-registrar --force

# Guild-specific commands
pnpm discord-registrar --guild-id "your-guild-id"
```

## Built-in Commands

### /health

Check bot health and system status.

```
/health [detailed:boolean]
```

- `detailed`: Show comprehensive health metrics

### /daily

Generate daily trading reports.

```
/daily [type:string] [date:string] [export:boolean]
```

- `type`: Report type (summary, performance, risk, full)
- `date`: Report date (YYYY-MM-DD)
- `export`: Export as markdown file

## CLI Options

| Option                 | Description                           | Default                   |
| ---------------------- | ------------------------------------- | ------------------------- |
| `--token, -t`          | Discord bot token                     | `$DISCORD_TOKEN`          |
| `--application-id, -a` | Discord application ID                | `$DISCORD_APPLICATION_ID` |
| `--guild-id, -g`       | Guild ID for guild commands           | Optional                  |
| `--dry-run, -d`        | Preview changes without applying      | `false`                   |
| `--force, -f`          | Force registration even if no changes | `false`                   |
| `--manifest, -m`       | Manifest file path                    | `./command-manifest.json` |
| `--verbose, -v`        | Show detailed output                  | `false`                   |

## Development

### Project Structure

```
src/
├── types/       # TypeScript interfaces
├── schemas/     # Command schemas
├── commands/    # Command handlers
└── handlers/    # Core logic

cli/
└── registrar.ts # CLI tool

test/
├── manifest.test.ts
├── CommandHandler.test.ts
└── commands.test.ts
```

### Testing

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch

# Update snapshots
pnpm test:snapshot
```

### Building

```bash
# Build the package
pnpm build

# Clean build artifacts
pnpm clean
```

## API Reference

### CommandHandler

Main class for managing commands.

```typescript
class CommandHandler {
  constructor(client: Client);
  registerCommand(command: Command): void;
  registerCommands(commands: Command[]): void;
  getCommand(name: string): Command | undefined;
  getAllCommands(): Command[];
  handleInteraction(interaction: ChatInputCommandInteraction): Promise<void>;
  buildCommand(schema: CommandSchema): SlashCommandBuilder;
  toJSON(): any[];
  generateManifest(): CommandManifest;
}
```

### Types

```typescript
interface CommandSchema {
  name: string;
  description: string;
  options?: CommandOption[];
  dmPermission?: boolean;
  defaultMemberPermissions?: bigint | string | null;
  nsfw?: boolean;
}

interface Command {
  schema: CommandSchema;
  handler: CommandHandler;
  builder?: SlashCommandBuilder;
}

interface CommandManifest {
  version: string;
  generatedAt: string;
  commands: CommandSchema[];
  hash: string;
}
```

## Best Practices

1. **Always use dry-run first** to preview changes
2. **Version control manifests** for tracking changes
3. **Test command handlers** with mock interactions
4. **Use TypeScript** for type safety
5. **Handle errors gracefully** in command handlers

## License

UNLICENSED - Private package
