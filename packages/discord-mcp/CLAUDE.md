# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Discord MCP Server is a Model Context Protocol (MCP) server that enables LLMs to interact with Discord channels through two primary tools: `send-message` and `read-messages`. The server uses the MCP SDK's stdio transport to communicate with Claude and discord.js to interact with Discord's API.

## Commands

### Build and Development
```bash
# Build the TypeScript source
pnpm build

# Start the server (requires DISCORD_TOKEN env var)
pnpm start

# Watch mode for development
pnpm dev

# Clean build artifacts
pnpm clean
```

### Testing with MCP Inspector
```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Architecture

### Core Components

**Single-file MCP Server** (`src/index.ts`):
- Discord.js client setup with required Gateway Intents (Guilds, GuildMessages, MessageContent)
- MCP Server instance using stdio transport
- Two request handlers: `ListToolsRequestSchema` and `CallToolRequestSchema`
- Helper functions for guild and channel resolution

### Key Design Patterns

**Guild/Channel Resolution Strategy** (src/index.ts:24-92):
- `findGuild()`: Auto-detects if bot is in single server, otherwise requires explicit server name/ID
- `findChannel()`: Searches by ID first, then falls back to name-based lookup within guild context
- Both helpers provide detailed error messages listing available options when lookup fails

**Tool Schema Validation**:
- Uses Zod schemas (`SendMessageSchema`, `ReadMessagesSchema`) for parameter validation
- Server parameter is optional when bot is in exactly one guild
- Channel can be specified by name (e.g., "general") or Discord ID
- Read limit capped at 100 messages per Discord API constraints

**Error Handling**:
- Zod validation errors are caught and reformatted into user-friendly messages
- Channel/guild not found errors list available options
- Ambiguous matches (multiple guilds/channels with same name) prompt for ID specification

### Discord Bot Requirements

**Required Gateway Intents** (must be enabled in Discord Developer Portal):
- `Guilds` - Access to guild information
- `GuildMessages` - Receive message events
- `MessageContent` - **Privileged Intent** - Read message content (required for read-messages tool)

**Required Permissions**:
- Read Messages/View Channels
- Send Messages
- Read Message History

### MCP Integration

**Server Metadata**:
- Server name: "discord"
- Version: "1.0.0"
- Capabilities: `tools: {}`

**Tool Registration**:
- Tools defined in `ListToolsRequestSchema` handler with JSON Schema input schemas
- Tool execution handled in `CallToolRequestSchema` handler via switch/case on tool name

**Lifecycle**:
1. Load DISCORD_TOKEN from environment (dotenv or explicit env var)
2. Login to Discord via bot token
3. Wait for 'ready' event
4. Initialize stdio transport and connect MCP server
5. Server runs until process termination

## Configuration

### Environment Variables
- `DISCORD_TOKEN` (required): Bot token from Discord Developer Portal

### MCP Server Registration

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "discord": {
      "command": "node",
      "args": ["/absolute/path/to/tjr-suite/packages/discord-mcp/dist/index.js"],
      "env": {
        "DISCORD_TOKEN": "your_token_here"
      }
    }
  }
}
```

**Claude Code** (project `.mcp.json`):
```json
{
  "mcpServers": {
    "discord": {
      "type": "stdio",
      "command": "node",
      "args": ["packages/discord-mcp/dist/index.js"],
      "env": {
        "DISCORD_TOKEN": "your_token_here"
      }
    }
  }
}
```

Or via CLI:
```bash
claude mcp add-json discord '{"type":"stdio","command":"node","args":["$PWD/packages/discord-mcp/dist/index.js"],"env":{"DISCORD_TOKEN":"your_token"}}' -s user
```

## Available Tools

### send-message
**Parameters**:
- `server` (optional string): Server name or ID (omit if bot in single server)
- `channel` (required string): Channel name or ID
- `message` (required string): Message content

**Returns**: Confirmation with channel name, guild name, and message ID

### read-messages
**Parameters**:
- `server` (optional string): Server name or ID (omit if bot in single server)
- `channel` (required string): Channel name or ID
- `limit` (optional number): Messages to fetch (default: 50, max: 100)

**Returns**: JSON array of messages with channel, server, author, content, timestamp

## Common Issues

**"Used disallowed intents" error**: Enable MESSAGE CONTENT INTENT in Discord Developer Portal → Bot settings → Privileged Gateway Intents

**"Bot is in multiple servers" error**: Specify `server` parameter in tool calls

**Channel/guild not found**: Error message lists available options; use exact name or ID
