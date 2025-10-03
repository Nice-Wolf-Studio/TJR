# Secrets Management Guide

**Status:** Active
**Last Updated:** 2025-09-30
**Owners:** Security Team, DevOps
**Related:** ADR-0313-secrets-hardening

---

## Table of Contents

1. [Overview](#overview)
2. [Secret Naming Conventions](#secret-naming-conventions)
3. [Rotation Policies](#rotation-policies)
4. [Local Development Best Practices](#local-development-best-practices)
5. [CI/CD Secret Management](#cicd-secret-management)
6. [What NOT to Commit](#what-not-to-commit)
7. [Incident Response](#incident-response)
8. [Secret Types and Guidelines](#secret-types-and-guidelines)

---

## Overview

This guide establishes the standards and procedures for handling secrets, API keys, tokens, and other sensitive credentials within the TJR Suite project. Proper secrets management is critical for:

- **Security**: Preventing unauthorized access to systems and data
- **Compliance**: Meeting security audit requirements
- **Operations**: Enabling safe rotation without service disruption
- **Development**: Allowing local development without production credentials

### Core Principles

1. **Never commit secrets** to version control
2. **Rotate regularly** according to priority levels
3. **Use environment variables** for all secrets
4. **Separate by environment** (dev, staging, production)
5. **Monitor and audit** secret access and usage
6. **Respond quickly** to any suspected compromise

---

## Secret Naming Conventions

All secrets follow a consistent naming pattern for clarity and automation:

### Pattern

```
PROVIDER_NAME_SECRET_TYPE[_ENVIRONMENT]
```

### Components

- **PROVIDER_NAME**: The service or system (e.g., `ALPHAVANTAGE`, `DATABENTO`, `DISCORD`, `DATABASE`)
- **SECRET_TYPE**: The type of credential (e.g., `API_KEY`, `TOKEN`, `PASSWORD`, `CLIENT_SECRET`)
- **ENVIRONMENT** (optional): For environment-specific secrets (e.g., `DEV`, `STAGE`, `PROD`)

### Examples

#### Single Environment Secrets

```bash
# Market data providers (same key across environments or local only)
ALPHAVANTAGE_API_KEY=your_alphavantage_key_here
DATABENTO_API_KEY=your_databento_key_here

# Database connection
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

#### Multi-Environment Secrets

```bash
# Discord bot tokens (separate per environment)
DISCORD_DEV_TOKEN=your_development_bot_token
DISCORD_STAGE_TOKEN=your_staging_bot_token
DISCORD_PROD_TOKEN=your_production_bot_token

# Discord application IDs (separate per environment)
DISCORD_DEV_APPLICATION_ID=123456789012345678
DISCORD_STAGE_APPLICATION_ID=234567890123456789
DISCORD_PROD_APPLICATION_ID=345678901234567890
```

### Why These Conventions?

1. **Consistency**: Easy to identify secrets in code reviews
2. **Automation**: Scripts can validate naming patterns
3. **Documentation**: Self-documenting variable names
4. **Filtering**: CI/CD can mask variables matching patterns
5. **Rotation**: Easy to track which secrets need rotation

---

## Rotation Policies

Regular secret rotation reduces the window of opportunity for compromised credentials to be exploited.

### Priority Levels

#### HIGH PRIORITY - Rotate Every 90 Days

**Critical secrets with broad system access:**

- `DATABASE_URL` - Full database access
- `DATABENTO_API_KEY` - Paid service with rate limits
- `DISCORD_*_TOKEN` - Complete bot control

**Rotation Procedure:**

1. Generate new credential in provider portal
2. Update secret in environment (CI/CD, production)
3. Deploy and verify service continuity
4. Revoke old credential
5. Update local development .env files
6. Document rotation in internal log

#### MEDIUM PRIORITY - Rotate Every 180 Days

**Lower-risk secrets with limited scope:**

- `ALPHAVANTAGE_API_KEY` - Free tier, public data only

**Rotation Procedure:**

1. Generate new API key in provider portal
2. Update in all environments
3. Test data retrieval
4. Revoke old key
5. Document rotation

#### IMMEDIATE ROTATION REQUIRED

Rotate immediately (within 1 hour) if:

- Secret accidentally committed to version control
- Secret exposed in application logs
- Secret shared with unauthorized party
- Suspicious account activity detected
- Employee with access leaves company
- Third-party breach announced

**Emergency Rotation Procedure:**

1. Immediately revoke compromised secret at provider
2. Generate replacement secret
3. Update all environments ASAP
4. Monitor for unauthorized usage
5. File incident report
6. Review and update procedures to prevent recurrence

### Rotation Calendar

Set calendar reminders for regular rotation:

```
Q1 (January): Rotate all HIGH priority secrets
Q2 (April): Rotate MEDIUM priority secrets
Q3 (July): Rotate all HIGH priority secrets
Q4 (October): Rotate MEDIUM priority secrets
```

---

## Local Development Best Practices

### Initial Setup

1. **Copy the example file:**

   ```bash
   cp .env.example .env
   ```

2. **Never commit .env:**
   Verify it's in `.gitignore`:

   ```bash
   grep -q "^\.env$" .gitignore && echo "✓ Protected" || echo "✗ NOT PROTECTED"
   ```

3. **Use fixture mode when possible:**
   ```bash
   # In packages/app/.env
   PROVIDER_TYPE=fixture
   DRY_RUN=true
   ```
   This allows development without real API keys.

### Obtaining Development Secrets

1. **AlphaVantage (optional for local dev):**
   - Visit: https://www.alphavantage.co/support/#api-key
   - Get free API key
   - Add to `.env`: `ALPHAVANTAGE_API_KEY=your_key`

2. **Databento (optional for local dev):**
   - Visit: https://databento.com/portal/keys
   - Create API key (requires account)
   - Add to `.env`: `DATABENTO_API_KEY=your_key`

3. **Discord Bot (required for Discord features):**
   - Visit: https://discord.com/developers/applications
   - Create new application or use existing dev bot
   - Get bot token from "Bot" section
   - Get application ID from "General Information"
   - Add to `.env`:
     ```
     DISCORD_DEV_TOKEN=your_token
     DISCORD_DEV_APPLICATION_ID=your_app_id
     DISCORD_DEV_GUILD_IDS=your_test_server_ids
     ```

### Development Environment Isolation

- **Use separate bots** for dev/staging/production
- **Use test guilds** (servers) for development
- **Use free tiers** or sandboxes when available
- **Never use production secrets** in local development

### Sharing Secrets Within Team

**NEVER share secrets via:**

- Email
- Slack/Discord messages
- Shared documents
- Screenshot/photo

**DO use:**

- Secure secret management tools (1Password, Bitwarden)
- Encrypted communication channels
- In-person secure transfer (for highly sensitive)
- Environment-specific access controls

---

## CI/CD Secret Management

### GitHub Actions Secrets

All CI/CD secrets are stored in GitHub repository secrets, never in workflow files.

#### Setting Up Secrets

1. **Navigate to repository settings:**

   ```
   Settings > Secrets and variables > Actions > New repository secret
   ```

2. **Add required secrets:**

   ```
   ALPHAVANTAGE_API_KEY - For smoke tests
   DATABENTO_API_KEY - For smoke tests
   DISCORD_DEV_TOKEN - For Discord integration tests
   DISCORD_DEV_APPLICATION_ID - For Discord integration tests
   ```

3. **Use environment-specific secrets:**
   ```yaml
   # In workflow file
   env:
     ALPHAVANTAGE_API_KEY: ${{ secrets.ALPHAVANTAGE_API_KEY }}
   ```

### Secret Masking

GitHub Actions automatically masks secrets in logs, but follow these practices:

```yaml
# GOOD - secret masked automatically
- name: Run tests
  env:
    API_KEY: ${{ secrets.MY_API_KEY }}
  run: npm test

# BAD - might expose secret in logs
- name: Debug
  run: echo "Key is ${{ secrets.MY_API_KEY }}" # NEVER DO THIS
```

### Workflow Secret Lint

The `secret-lint.yml` workflow runs on every PR to detect accidentally committed secrets:

```yaml
# .github/workflows/secret-lint.yml
name: Secret Lint
on: [push, pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
```

This scans for:

- API keys and tokens
- Database connection strings
- Private keys
- AWS credentials
- Common secret patterns

---

## What NOT to Commit

### NEVER Commit

**Credential Files:**

- `.env` (local environment files)
- `.env.local`, `.env.*.local`
- `credentials.json`
- `secrets.json`
- `config.local.json`
- `*.key`, `*.pem`, `*.crt`, `*.p12`

**Code with Hardcoded Secrets:**

```typescript
// BAD - hardcoded secret
const API_KEY = 'abc123def456';

// GOOD - from environment
const API_KEY = process.env.ALPHAVANTAGE_API_KEY;
```

**Configuration with Actual Secrets:**

```json
// BAD - config.json with real credentials
{
  "database": {
    "password": "myRealPassword123"
  }
}

// GOOD - config.json with placeholder
{
  "database": {
    "password": "${DATABASE_PASSWORD}"
  }
}
```

### Safe to Commit

- `.env.example` (with placeholder values)
- Public configuration
- Non-sensitive identifiers (Discord application IDs, guild IDs)
- Encrypted secrets (if encryption key is stored separately)
- Documentation about secrets (this file)

### Verifying .gitignore

Ensure `.gitignore` includes:

```gitignore
# Environment variables & secrets
.env
.env.local
.env.*.local
*.key
*.pem
*.crt
*.p12
credentials.json
secrets.json
config.local.json
```

Check if a file would be ignored:

```bash
git check-ignore -v .env
# Should output: .gitignore:27:.env	.env
```

---

## Incident Response

### If You Accidentally Commit a Secret

**Act immediately - time is critical!**

#### Step 1: Revoke the Secret (IMMEDIATE)

1. **Go to the provider portal** and revoke/regenerate the credential
2. **For each secret type:**
   - **Discord tokens**: Bot settings > Reset Token
   - **AlphaVantage**: Generate new key, old remains valid (rotate ASAP)
   - **Databento**: Revoke in API Keys portal
   - **Database**: Change password immediately

#### Step 2: Remove from Git History

```bash
# OPTION A: If commit not pushed yet
git reset --soft HEAD~1
# Edit files to remove secret
git add .
git commit -m "Remove accidentally committed secret"

# OPTION B: If already pushed (requires force push)
# WARNING: Coordinate with team before force pushing
git rebase -i HEAD~N  # N = number of commits back
# Mark commit as 'drop' or 'edit', remove secret
git push --force-with-lease

# OPTION C: Use git-filter-repo (recommended for complex cases)
# https://github.com/newren/git-filter-repo
```

#### Step 3: Generate and Deploy New Secret

1. Create new credential at provider
2. Update in all environments:
   - Local `.env` files (coordinate with team)
   - CI/CD secrets (GitHub Actions)
   - Production deployment secrets
3. Verify services still work

#### Step 4: Document and Report

1. **File incident report** with:
   - What secret was exposed
   - When it was committed/pushed
   - When it was revoked
   - How it was removed
   - Preventive measures taken

2. **Monitor for misuse:**
   - Check provider usage dashboards
   - Review application logs for anomalies
   - Monitor for 24-48 hours post-incident

3. **Team notification:**
   - Alert team via secure channel
   - Request secret rotation in local envs
   - Share lessons learned

### If You Detect Unauthorized Access

1. **Immediately revoke all potentially compromised credentials**
2. **Rotate all secrets** in the affected environment
3. **Review access logs** to determine scope
4. **Lock down systems** if necessary
5. **Investigate root cause**
6. **Update procedures** to prevent recurrence
7. **Notify stakeholders** per incident response plan

---

## Secret Types and Guidelines

### Database Credentials

**Format:**

```
postgresql://username:password@hostname:port/database
sqlite:path/to/database.db
```

**Security Guidelines:**

- Use strong passwords (16+ characters, mixed case, numbers, symbols)
- Different passwords per environment
- Enable SSL/TLS for production connections
- Use connection pooling with appropriate limits
- Consider managed database services (AWS RDS, etc.)
- Rotate every 90 days

**Example:**

```bash
# Development (SQLite - no secrets)
DATABASE_URL=sqlite:data/dev.db

# Production (PostgreSQL with strong password)
DATABASE_URL=postgresql://tjr_prod:Xy9$mK2!nP8@qR5vL3wN@db.example.com:5432/tjr_prod
```

### API Keys

#### AlphaVantage

**Format:** Alphanumeric, ~16 characters
**Scope:** Free tier, public market data
**Risk Level:** Low (rate-limited, free tier)
**Rotation:** Every 180 days or if compromised

**Security Guidelines:**

- Free tier key is low risk but should still be protected
- Monitor rate limit usage for anomalies
- Use fixture mode for local dev when possible

**Example:**

```bash
ALPHAVANTAGE_API_KEY=A1B2C3D4E5F6G7H8
```

#### Databento

**Format:** Alphanumeric with hyphens, ~32+ characters
**Scope:** Paid tier with rate limits and usage charges
**Risk Level:** HIGH (financial impact if misused)
**Rotation:** Every 90 days or immediately if compromised

**Security Guidelines:**

- Treat as high-value secret
- Monitor usage closely
- Set up billing alerts
- Use separate keys for dev/staging/prod if possible
- Revoke immediately if exposed

**Example:**

```bash
DATABENTO_API_KEY=db-1234567890abcdef-1234567890abcdef
```

### Discord Bot Tokens

**Format:** Base64 with dots, 59-72 characters
**Scope:** Full bot access to Discord API
**Risk Level:** CRITICAL (can control bot completely)
**Rotation:** Every 90 days or immediately if compromised

**Security Guidelines:**

- NEVER share or log tokens
- Use separate bots for dev/staging/prod
- Enable 2FA on Discord developer account
- Review bot permissions regularly
- Monitor bot activity for anomalies
- Revoke immediately if suspicious activity

**Token Structure:**

```
MTk4NjIyNDgzNDcxOTI1MjQ4.Cl2FMQ.ZnCjm1XVW7vRze4b7Cq4se7kKWs
└─────────────┬────────────┘ └──┬─┘ └──────────┬─────────┘
          User ID         Timestamp      HMAC
```

**Example:**

```bash
# Development bot
DISCORD_DEV_TOKEN=MTk4NjIyNDgzNDcxOTI1MjQ4.REPLACE.WITH_YOUR_DEV_BOT_TOKEN
DISCORD_DEV_APPLICATION_ID=123456789012345678
DISCORD_DEV_GUILD_IDS=123456789012345678,234567890123456789

# Production bot
DISCORD_PROD_TOKEN=MTk4NjIyNDgzNDcxOTI1MjQ4.REPLACE.WITH_YOUR_PROD_BOT_TOKEN
DISCORD_PROD_APPLICATION_ID=345678901234567890
```

### Discord Application and Guild IDs

**Format:** Numeric snowflake, 18-19 digits
**Scope:** Public/semi-public identifiers
**Risk Level:** NONE (not secrets)
**Rotation:** Not required

**Note:** These are identifiers, not credentials. Safe to commit in code if needed, but conventionally kept in environment variables for configuration flexibility.

---

## Validation and Testing

### Pre-Deployment Validation

Run the validation script before deploying:

```bash
node scripts/validate-env.js
```

This checks:

- All required secrets are set
- Secret formats are valid
- No placeholder values in production
- Environment-appropriate configuration

### Local Testing

Test your local .env setup:

```bash
# Check if secrets are loaded
npm run env:check

# Run in dry-run mode (uses fixtures)
DRY_RUN=true npm start

# Run with real secrets (use caution)
npm start
```

### CI/CD Testing

The secret-lint workflow runs automatically on:

- Every push to any branch
- Every pull request
- Manual workflow dispatch

To run locally:

```bash
# Install gitleaks
brew install gitleaks  # macOS
# or download from https://github.com/gitleaks/gitleaks

# Scan repository
gitleaks detect --source . --verbose

# Scan specific commit
gitleaks detect --log-opts="--since='2024-01-01'"
```

---

## Troubleshooting

### "Secret not found" errors

```bash
# Check if secret is set
printenv | grep ALPHAVANTAGE_API_KEY

# Check .env file exists and is loaded
ls -la .env
cat .env | grep -v "^#" | grep -v "^$"

# Verify .env is loaded by your app
node -e "require('dotenv').config(); console.log(process.env.ALPHAVANTAGE_API_KEY)"
```

### "Invalid secret format" errors

```bash
# Validate secret format
node scripts/validate-env.js

# Common issues:
# - Extra whitespace: DISCORD_TOKEN= abc123  (should be =abc123)
# - Missing quotes: DATABASE_URL=postgresql://user:pass word@host (needs quotes)
# - Wrong delimiter: GUILD_IDS=123;456 (should be comma-separated)
```

### CI/CD secret issues

```bash
# Verify secret is set in GitHub
gh secret list

# Test secret masking
echo "Test: ${{ secrets.MY_SECRET }}" | grep "\*\*\*"

# Common issues:
# - Secret name mismatch (case-sensitive)
# - Secret not set for the environment
# - Secret value has trailing newline
```

---

## Additional Resources

- **GitHub Secrets Documentation**: https://docs.github.com/en/actions/security-guides/encrypted-secrets
- **Gitleaks Project**: https://github.com/gitleaks/gitleaks
- **OWASP Secrets Management**: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- **12-Factor App Config**: https://12factor.net/config

---

## Review and Updates

This document should be reviewed and updated:

- Quarterly (with secret rotation)
- After any security incident
- When adding new secrets/providers
- When changing deployment infrastructure

**Last Review:** 2025-09-30
**Next Review Due:** 2025-12-30
