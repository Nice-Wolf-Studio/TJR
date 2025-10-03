# ADR-0315: Discord Bot with HTTP API Architecture

**Status:** Accepted
**Date:** 2025-10-03
**Deciders:** Wolf Agents (PM, Coder, Architect)
**Tags:** `discord`, `http-api`, `architecture`, `databento`, `bias-calculation`

---

## Context

We needed to integrate Discord bot functionality with our existing Databento-based market analysis system. The bot should support natural language queries like "what is the ES bias?" and return real-time analysis.

### Requirements

1. Discord bot with slash command `/ask` for natural language queries
2. Real-time market data integration via Databento
3. Support for bias calculation, quotes, and session info queries
4. Testable architecture that separates concerns
5. Support for both pre-market and during-market-hours queries

### Options Considered

1. **HTTP API Server (Chosen)**
   - Discord bot sends prompts to localhost HTTP API
   - API server processes prompts and calls Databento
   - Clear separation: Discord layer, API layer, analysis layer
   - Testable independently (can curl the API directly)

2. **Direct Integration**
   - Discord bot directly calls Databento and analysis functions
   - Simpler architecture, fewer moving parts
   - Harder to test, tighter coupling

3. **Message Queue (SQLite)**
   - Bot writes prompts to SQLite queue
   - Worker process reads queue and responds
   - Async, more complex, unnecessary for local deployment

## Decision

We chose **HTTP API Server** architecture for the following reasons:

### Architectural Benefits

1. **Separation of Concerns**
   - `discord-bot.ts`: Discord gateway and command handling
   - `http-server.ts`: Express API with `/api/ask` endpoint
   - `prompt-processor.ts`: Intent detection and routing
   - Clean boundaries between Discord, API, and business logic

2. **Testability**
   - Can test HTTP API independently: `curl -X POST http://localhost:3000/api/ask -d '{"prompt":"ES bias"}'`
   - Mock Discord interactions without running real bot
   - Unit test prompt processor in isolation

3. **Extensibility**
   - Easy to add authentication/rate limiting to API
   - Can expose API to other clients (CLI, web UI)
   - Monitoring and logging at API boundary

### Implementation Details

**HTTP Server (port 3000)**
```typescript
POST /api/ask
Body: { prompt: string, userId?: string, channelId?: string }
Response: { success: boolean, response: string }
```

**Prompt Processor**
- Intent detection via keyword matching
- Routes to handlers: `handleBiasQuery()`, `handleQuoteQuery()`, `handleSessionQuery()`
- Integrates directly with `@tjr/databento` package

**RTH Session Detection**
- Smart algorithm searches backward through available bars
- Finds most recent RTH session (13:30-20:00 UTC) with data
- Handles pre-market and off-hours queries correctly

### Key Technical Decisions

1. **Direct Databento Integration**: Use `@tjr/databento` package directly instead of MCP at runtime (MCP for development/testing only)

2. **Smart RTH Window**: Calculate RTH window based on available bar data, not current wall-clock time. Searches backward up to 3 days to find session with data.

3. **Express over Fastify**: Standard Express.js for simplicity, proven reliability

4. **Environment Variables**: Discord credentials in `.env`, loaded via `dotenv/config`

## Consequences

### Positive

- ✅ Clean architecture with testable components
- ✅ HTTP API can be reused for web UI or CLI
- ✅ Easy to add monitoring/logging/rate-limiting
- ✅ Discord bot restart doesn't affect API state
- ✅ RTH detection works for pre-market and off-hours

### Negative

- ❌ Additional process (HTTP server) must run
- ❌ Localhost-only (not distributed), but acceptable for single-machine deployment
- ❌ Slight latency from HTTP round-trip (negligible for user experience)

###Operational
 Notes

**Startup Order**
1. HTTP server starts on port 3000
2. Discord bot connects to gateway
3. Slash commands registered to guild

**Environment Variables Required**
```bash
DISCORD_ENABLED=true
DISCORD_TOKEN=<bot_token>
DISCORD_CLIENT_ID=<application_id>
DISCORD_GUILD_ID=<guild_id>  # Optional, for faster registration
DATABENTO_API_KEY=db-<key>
SERVER_ENABLED=true
SERVER_PORT=3000
```

**Failure Modes**
- If HTTP server fails, Discord bot can't process `/ask` commands
- If Databento API unavailable, user sees error message
- If no RTH data in 24h window, graceful error message

## Related

- **ADR-0201**: Databento provider integration
- **ADR-0059**: Analysis kit pure functions
- **ADR-0106**: Discord bot core package

## Future Considerations

1. **Authentication**: Add API key validation for non-localhost requests
2. **Rate Limiting**: Prevent abuse, especially for Databento API calls
3. **Caching**: Cache recent Databento responses to reduce API usage
4. **WebSocket**: Consider WebSocket for streaming updates
5. **Multi-Symbol**: Expand beyond ES/NQ to support more futures
6. **Historical Queries**: "What was ES bias on Monday?" with date parsing

---

**Wolf Ethos Alignment**
- ✅ **Additive Strategy**: HTTP API added alongside existing architecture
- ✅ **Reversible**: Can switch to direct integration if needed
- ✅ **Boring Tech**: Express.js, standard HTTP patterns
- ✅ **Operability**: Clear logs, health endpoints, testable components
