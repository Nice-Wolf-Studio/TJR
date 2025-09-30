# Logging Security Policy

**Document Version:** 1.0
**Last Updated:** 2025-09-29
**Owner:** Security Team

---

## Purpose

This document defines security policies and best practices for logging in the TJR Suite monorepo. It ensures that sensitive data is protected while maintaining observability for debugging and monitoring.

---

## PII (Personally Identifiable Information) Handling

### Prohibited Data in Logs

The following data types **MUST NEVER** be logged in plain text:

#### Authentication & Authorization
- Passwords, password hashes, password hints
- API keys, access tokens, refresh tokens
- Session tokens, JWT tokens
- OAuth secrets and authorization codes
- Private keys, certificate private keys
- Basic auth credentials

#### Financial & Payment Data
- Full credit card numbers (PAN)
- CVV/CVC codes
- Bank account numbers
- Cryptocurrency private keys and mnemonics
- Payment processor secrets

#### Personal Identifiers
- Social Security Numbers (SSN)
- Government-issued ID numbers (passport, driver's license)
- Full dates of birth (year is acceptable)
- Biometric data

#### Sensitive Business Data
- Encryption keys and secrets
- Database connection strings with credentials
- Third-party service API keys
- Signing secrets and HMAC keys

---

## Automatic Redaction

The `@tjr/logger` package automatically redacts sensitive fields matching these patterns (case-insensitive):

- `password`, `passwd`, `pwd`
- `secret`, `api_key`, `apiKey`, `token`
- `authorization`, `auth`
- `private_key`, `privateKey`
- `credit_card`, `creditCard`
- `ssn`

### Redaction Behavior

```typescript
// Input
logger.info('User login', {
  username: 'alice@example.com',
  password: 'secret123',
  api_key: 'sk-abc123'
});

// Output
{
  "level": "info",
  "message": "User login",
  "username": "alice@example.com",
  "password": "[REDACTED]",
  "api_key": "[REDACTED]"
}
```

---

## Acceptable Data in Logs

The following data types **MAY** be logged with appropriate context:

### Identifiers
- User IDs (numeric or opaque UUIDs)
- Request IDs and correlation IDs
- Session IDs (if anonymized/hashed)
- Transaction IDs

### Operational Data
- Timestamps
- IP addresses (with consideration for GDPR)
- User agents (browser/device info)
- Request methods and paths (without query parameters containing sensitive data)
- HTTP status codes
- Performance metrics (latency, throughput)

### Trading-Specific Data
- Trading symbols (e.g., "AAPL", "BTCUSD")
- Timeframes (e.g., "1h", "5m")
- Signal types (BUY, SELL)
- Aggregate statistics (no individual trades)

### Example

```typescript
logger.info('Trade signal generated', {
  request_id: 'req-abc-123',
  user_id: 'user-456',          // OK: Opaque ID
  symbol: 'AAPL',               // OK: Public symbol
  timeframe: '1h',              // OK: Timeframe
  signal_type: 'BUY',           // OK: Trading data
  confidence: 0.87,             // OK: Metric
  // username: 'alice'          // AVOID: PII username
  // email: 'alice@example.com' // AVOID: PII email
});
```

---

## Log Retention and Access Control

### Retention Policies

- **Production Logs:** Retained for 30 days, then archived or deleted
- **Development Logs:** Retained for 7 days, then deleted
- **Audit Logs:** Retained for 1 year for compliance

### Access Control

- Production logs accessible only to:
  - On-call engineers (read-only)
  - Security team (read-only)
  - Platform team (read-write for rotation/cleanup)
- Log access must be audited and traceable
- No logs may be exported to personal devices without approval

---

## Query Parameter and Header Filtering

### HTTP Request Logging

When logging HTTP requests, sensitive data in query parameters and headers must be filtered:

```typescript
// BAD: Logs entire URL with sensitive params
logger.info('API request', { url: '/api/users?api_key=sk-abc123' });

// GOOD: Filters query parameters
const safeUrl = url.split('?')[0]; // Only log path
logger.info('API request', { path: safeUrl });

// GOOD: Redacts authorization headers
const safeHeaders = { ...headers };
delete safeHeaders.authorization;
logger.info('API request', { headers: safeHeaders });
```

---

## Error Stack Traces

### Production

- **Include:** Error message, error type, stack trace
- **Exclude:** Variable values containing sensitive data
- **Redact:** File paths that reveal internal structure (if necessary)

### Development

- **Include:** Full error details, stack traces, variable values
- **Acceptable:** Sensitive data in dev logs (not exposed publicly)

### Example

```typescript
try {
  await authenticateUser(username, password);
} catch (error) {
  // GOOD: Logs error without exposing password
  logger.error('Authentication failed', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    username, // OK: Username is acceptable
    // password, // BAD: Never log password
  });
}
```

---

## Third-Party Service Logs

When logging interactions with third-party services:

- **Redact:** API keys, OAuth tokens, webhook secrets
- **Include:** Service name, operation type, response status
- **Mask:** Partial data for debugging (e.g., last 4 digits of keys)

### Example

```typescript
// GOOD: Logs service interaction without exposing keys
logger.info('External API call', {
  service: 'stripe',
  operation: 'create_payment',
  status: 200,
  duration_ms: 120,
  api_key_suffix: '...xyz123', // Only last 7 chars
});
```

---

## Compliance Requirements

### GDPR (General Data Protection Regulation)

- Users have the right to request deletion of their data from logs
- IP addresses may be considered PII; log only when necessary
- Implement log retention policies to auto-delete after retention period

### CCPA (California Consumer Privacy Act)

- Users may request disclosure of what personal data is logged
- Provide mechanism to export or delete user-specific log entries

### PCI DSS (Payment Card Industry)

- **Never log:** Full credit card numbers, CVV codes
- **Acceptable:** Last 4 digits of card number (for debugging)
- Implement encryption for logs containing any payment data

---

## Audit and Monitoring

### Security Audits

- Quarterly review of logging patterns for accidental PII exposure
- Automated scanning for sensitive patterns in log files
- Manual review of new logging code during code review

### Alerting

Set up alerts for:
- Logs containing patterns matching sensitive data (escaped redaction)
- Unusually large log volumes (potential DoS or data exfiltration)
- Log access by unauthorized users

---

## Developer Guidelines

### Before Logging

1. **Ask:** Does this data need to be logged?
2. **Check:** Does this field contain sensitive data?
3. **Use:** Child loggers with context instead of inline sensitive data
4. **Test:** Review log output in tests to verify redaction

### Code Review Checklist

- [ ] No passwords, tokens, or keys logged
- [ ] Sensitive fields use redaction-triggering names
- [ ] Error logs exclude variable values with sensitive data
- [ ] HTTP logs exclude query parameters and authorization headers
- [ ] Tests verify PII redaction for new log statements

---

## Incident Response

### If Sensitive Data is Logged

1. **Immediate:** Rotate compromised credentials (API keys, passwords)
2. **Contain:** Delete or redact affected log entries
3. **Investigate:** Determine scope of exposure (who had access, when)
4. **Notify:** Inform security team and affected users (if required by law)
5. **Remediate:** Update code to prevent future occurrences

### Reporting

Report logging security issues to: `security@nicewolfstudio.com`

---

## References

- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [GDPR Logging Requirements](https://gdpr.eu/data-protection-impact-assessment-template/)
- [PCI DSS Logging Requirements](https://www.pcisecuritystandards.org/)

---

## Changelog

- **2025-09-29:** Initial policy document created for Phase 51, Shard A3