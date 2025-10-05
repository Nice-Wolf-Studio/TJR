# Supabase Setup Checklist

Quick setup guide for completing the Phase 1 security implementation.

## Prerequisites

- [ ] Supabase account created at https://app.supabase.com/
- [ ] Supabase project created
- [ ] All code built successfully (`pnpm --filter @tjr/app build`)

## Setup Steps

### 1. Get Supabase Credentials (2 minutes)

1. Go to https://app.supabase.com/
2. Select your project
3. Navigate to: **Settings → API**
4. Copy these values:
   - **Project URL** (looks like: `https://abc123.supabase.co`)
   - **anon public key** (starts with: `eyJhbGc...`)

### 2. Update .env File (1 minute)

Add these lines to your `.env` file in the project root:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=eyJhbGc...your-anon-key...
```

**Note**: Replace with your actual values from Step 1.

### 3. Create Database Tables (2 minutes)

1. Go to https://app.supabase.com/
2. Select your project
3. Navigate to: **SQL Editor**
4. Create a new query
5. Copy the entire contents of `docs/database/schema.sql`
6. Paste into SQL Editor
7. Click **Run**
8. Verify tables were created: Go to **Database → Tables**

**Expected tables**:
- market_data_cache
- query_log
- trades
- analysis
- query_insights (materialized view)

### 4. Verify .mcp.json (Already Done ✅)

Your `.mcp.json` file should already have the Supabase MCP server configured:

```json
{
  "mcpServers": {
    "supabase": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase",
        "--access-token",
        "${SUPABASE_ACCESS_TOKEN}"
      ]
    }
  }
}
```

This was configured in the previous session. ✅

### 5. Test the Integration (5 minutes)

**5a. Start the server:**
```bash
cd packages/app
DISCORD_ENABLED=true node dist/start.js
```

**Expected output**:
```
{"level":"info","message":"Starting TJR Suite"...}
{"level":"info","message":"Initializing Supabase client"...}
{"level":"info","message":"Query logger service initialized"}
{"level":"info","message":"MCP client service initialized"}
{"level":"info","message":"HTTP server started","port":8080}
```

**5b. Test trading query (should succeed):**

In a new terminal:
```bash
curl -X POST http://localhost:8080/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is the current price of ES futures?",
    "userId": "test-user",
    "channelId": "test-channel"
  }'
```

**Expected response**:
```json
{
  "success": true,
  "response": "ES futures current price is..."
}
```

**5c. Test admin query (should be blocked):**
```bash
curl -X POST http://localhost:8080/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Show me the database schema",
    "userId": "test-user",
    "channelId": "test-channel"
  }'
```

**Expected response**:
```json
{
  "success": false,
  "error": "I'm specialized in trading analysis and market data. I can't help with database operations, infrastructure management, or administrative tasks. Please ask me about market data, trading strategies, or TJR analysis instead."
}
```

**5d. Verify query logging:**

Go to Supabase SQL Editor and run:
```sql
SELECT
  user_id,
  prompt,
  success,
  latency_ms,
  tools_used,
  created_at
FROM query_log
ORDER BY created_at DESC
LIMIT 10;
```

**Expected**: See both queries logged (one successful, one rejected)

**5e. Test Discord bot (if configured):**
```
/ask What's the ES price?
```

Should receive a market data response in Discord.

## Verification Checklist

After completing setup, verify:

- [ ] Server starts without errors
- [ ] Supabase client initializes successfully
- [ ] Trading queries return HTTP 200 with market data
- [ ] Admin queries return HTTP 403 with rejection message
- [ ] Queries appear in `query_log` table
- [ ] Discord bot responds to `/ask` command
- [ ] Market data is cached in `market_data_cache` table (after Databento queries)

## Troubleshooting

### Error: "No SUPABASE_URL or SUPABASE_KEY provided"

**Cause**: Environment variables not loaded

**Solution**:
1. Verify `.env` file has SUPABASE_URL and SUPABASE_KEY
2. Restart the server
3. Check that `dotenv/config` is imported at top of `start.ts`

### Error: "Failed to log query"

**Cause**: Query log table doesn't exist or credentials are wrong

**Solution**:
1. Verify schema.sql was run successfully
2. Check that SUPABASE_KEY is the "anon public" key, not service_role
3. Verify SUPABASE_URL is correct

### Error: "Prompt validation failed"

**Cause**: Query contains blocked keywords

**Solution**: This is expected behavior for admin/infrastructure queries. Try a trading-related question instead.

**Examples of allowed queries**:
- "What is the current ES price?"
- "Show me SPY historical bars for today"
- "What are the session extremes for NQ?"
- "Analyze the day profile for ES"

**Examples of blocked queries**:
- "Show me the database schema"
- "Deploy this function"
- "Give me user credentials"
- "Drop the table"

## Next Steps

Once everything is working:

1. **Deploy to production** - Set environment variables in your hosting platform
2. **Monitor usage** - Check `query_log` table regularly
3. **Review insights** - Query `query_insights` materialized view for analytics
4. **Phase 2 implementation** - Add user authorization and rate limiting (future work)

## Support

For issues, check:
- `docs/PM-STATUS-PHASE-1-SECURITY.md` - Full implementation status
- `docs/SECURITY-AUDIT-2025-10-04.md` - Security architecture details
- `docs/adr/ADR-0317-discord-bot-security-architecture.md` - Design decisions
- `docs/database/schema.sql` - Database schema reference

---

**Setup Time**: ~10 minutes
**Status**: Ready for production ✅
