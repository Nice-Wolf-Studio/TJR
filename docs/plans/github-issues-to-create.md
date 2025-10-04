# GitHub Issues to Create

These issues track backlogged features and technical debt for the Discord bot implementation.

---

## Issue 1: Add chart visualization feature for Discord bot

**Labels**: `enhancement`, `backlog`, `discord-bot`

### Summary

Add chart/visualization capabilities to the Discord bot's `/ask` command to display market data visually in addition to text responses.

### Background

Currently, the Discord bot responds with text-only analysis. Users would benefit from visual charts showing:
- Price action with bias indicators
- Session extremes marked on charts
- Historical comparison views

### Requirements

1. **Chart Generation**:
   - Generate charts from OHLCV data
   - Mark RTH session extremes (open, high, low, close)
   - Highlight bias indicators (bullish/bearish zones)

2. **Discord Integration**:
   - Send charts as image attachments in Discord
   - Optionally include text summary alongside chart
   - Handle chart generation errors gracefully

3. **Format Options**:
   - Support multiple timeframes (1h, 4h, 1d)
   - Allow custom date ranges
   - Configurable chart styles

### Technical Considerations

- **Charting Library**: Consider lightweight options (e.g., QuickChart.io API, node-canvas, or server-side rendering)
- **Performance**: Chart generation should not exceed Discord's 3-second interaction timeout
- **Caching**: Generated charts should be cached to reduce regeneration overhead
- **Storage**: Consider where to store generated chart images (ephemeral vs. persistent)

### Priority

**Backlog** - Not blocking current functionality, but valuable enhancement for user experience.

---

## Issue 2: Security tech debt: Symbol validation and prompt injection prevention

**Labels**: `security`, `tech-debt`, `discord-bot`

### Summary

Implement robust security measures for Discord bot's prompt processing, focusing on symbol validation and prompt injection prevention.

### Background

The current implementation accepts user input with minimal validation:
- Symbol extraction relies on simple string matching (`extractSymbol()` only supports ES/NQ)
- No validation of symbol format or existence
- Prompt processing is vulnerable to injection attacks
- No rate limiting or abuse prevention

### Security Concerns

#### 1. Symbol Validation

**Current Issue**: `extractSymbol()` in `prompt-processor.ts` only recognizes hardcoded symbols (ES, NQ).

**Required**:
- Validate symbol format against Databento's symbol schema
- Verify symbol exists before querying API
- Prevent invalid symbols from causing API errors or leaking error messages
- Support any valid futures symbol (ES, NQ, CL, GC, etc.)

#### 2. Prompt Injection Prevention

**Current Issue**: Raw user prompts are processed with keyword matching, vulnerable to injection.

**Risks**:
- Malicious prompts could manipulate intent detection
- SQL injection if prompts are stored in database without sanitization
- Command injection if prompts are passed to shell commands
- Excessive API calls from crafted prompts

**Required**:
- Input sanitization for all user-provided strings
- Whitelist-based intent detection instead of keyword matching
- Parameterized queries for database operations
- Length limits and character restrictions on prompts

#### 3. Rate Limiting

**Current Issue**: No throttling on `/ask` command or API endpoint.

**Required**:
- Per-user rate limits (e.g., 10 requests per minute)
- Per-channel rate limits
- Global API rate limits
- Graceful degradation when limits exceeded

#### 4. Error Message Security

**Current Issue**: API errors may leak sensitive information (API keys, internal paths).

**Required**:
- Sanitize error messages before sending to Discord
- Log detailed errors server-side only
- Generic user-facing error messages
- No stack traces in production

### Implementation Plan

1. **Symbol Validation Module**:
   - Create `validateSymbol(symbol: string)` function
   - Integrate with Databento symbol schema/API
   - Add to `extractSymbol()` logic

2. **Prompt Sanitization**:
   - Input validation middleware in `http-server.ts`
   - Whitelist allowed characters in prompts
   - Max length enforcement (already 500 chars in Discord schema)

3. **Rate Limiting**:
   - Add rate limiting middleware to Express server
   - Track requests per user/channel in memory or Redis
   - Return 429 status when limits exceeded

4. **Error Handling Review**:
   - Audit all error messages in `prompt-processor.ts`
   - Create error formatter utility
   - Ensure no sensitive data in Discord responses

### Testing Requirements

- Unit tests for symbol validation edge cases
- Fuzz testing for prompt injection vulnerabilities
- Load testing for rate limiting thresholds
- Error message security audit

### Priority

**High** - Security vulnerabilities should be addressed before production deployment.

---

## Issue 3: Production hardening: Rate limiting, monitoring, and operational concerns

**Labels**: `production`, `operations`, `monitoring`, `discord-bot`

### Summary

Prepare the Discord bot and HTTP API for production deployment with proper rate limiting, monitoring, error handling, and operational best practices.

### Background

The current implementation is a development prototype. Before production deployment, we need to address:
- API rate limiting (Databento has usage quotas)
- System monitoring and alerting
- Error tracking and debugging
- Performance optimization
- Deployment and scaling strategy

### Production Readiness Checklist

#### 1. Rate Limiting

**Databento API Protection**:
- Databento has rate limits and quota restrictions
- Need to track API usage and prevent quota exhaustion
- Implement backoff/retry logic for rate limit errors
- Cache responses to reduce API calls

**Discord Bot Protection**:
- Prevent abuse via `/ask` command spam
- Per-user and per-channel rate limits
- Global request throttling

#### 2. Monitoring and Observability

**Metrics to Track**:
- API request latency (Discord → HTTP API → Databento)
- Databento API quota usage
- Error rates by type (network, validation, Databento errors)
- Cache hit/miss rates (once caching implemented)
- Discord bot uptime and connection status

**Tools**:
- Structured logging with correlation IDs
- Metrics export (Prometheus/StatsD)
- Error tracking (Sentry or similar)
- Health check endpoints (`/health`, `/metrics`)

#### 3. Error Handling and Recovery

**Failure Modes**:
- Databento API unavailable → Graceful degradation, user-friendly message
- Database unavailable → Fallback to direct API calls
- Discord gateway disconnect → Automatic reconnection
- HTTP server crash → Process manager (pm2, systemd)

**Required**:
- Circuit breaker pattern for Databento calls
- Exponential backoff for retries
- Dead letter queue for failed requests
- Graceful shutdown handling

#### 4. Performance Optimization

**Current Bottlenecks**:
- Databento API calls take 2-3 seconds
- No caching (every request hits API)
- RTH session calculation runs on every query

**Optimizations**:
- Response caching (in-memory or Redis)
- Pre-warm cache for popular symbols
- Batch API requests where possible
- Optimize RTH window calculation

#### 5. Deployment and Scaling

**Infrastructure**:
- Process manager (pm2, systemd)
- Environment-specific configs (dev, staging, prod)
- Secrets management (not .env files in production)
- Log rotation and retention

**Scaling Considerations**:
- Current architecture is single-machine only (localhost HTTP)
- If scaling needed: Replace HTTP with message queue or distribute API
- Discord bot can only run single instance per token

#### 6. Security Hardening

**Production Security**:
- HTTPS for API endpoints (if exposed externally)
- API authentication/authorization (if multi-tenant)
- Secrets rotation policy
- Audit logging for sensitive operations
- Input validation (see related security tech debt issue)

#### 7. Documentation

**Operational Docs**:
- Runbook for common failures
- Deployment procedure
- Rollback procedure
- Monitoring and alerting setup guide
- Incident response playbook

### Implementation Priority

**Phase 1 (Pre-Production)**:
- Rate limiting (Databento + Discord)
- Basic monitoring (logs + health checks)
- Error tracking setup
- Process manager configuration

**Phase 2 (Post-Launch)**:
- Advanced metrics and dashboards
- Performance optimization
- Scaling strategy
- Full runbook documentation

### Acceptance Criteria

- [ ] Rate limiting implemented and tested
- [ ] Monitoring dashboards operational
- [ ] Error tracking configured
- [ ] Deployment runbook written
- [ ] Load testing completed
- [ ] Incident response plan documented
- [ ] Production environment configured
- [ ] Secrets management in place
