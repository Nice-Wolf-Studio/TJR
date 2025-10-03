# ADR-0313: Secrets Management and Environment Hardening

**Status:** Accepted
**Date:** 2025-09-30
**Decision Makers:** Security Team, DevOps, Tech Lead
**Issue:** #42

---

## Context

The TJR Suite handles multiple types of sensitive credentials across different environments:

- **Market data API keys** (AlphaVantage, Databento)
- **Discord bot tokens** (dev, staging, production)
- **Database connection strings** with credentials
- **Third-party service credentials** (future expansion)

Prior to this ADR, the project had basic secrets management but lacked:

1. **Standardized naming conventions** - Inconsistent variable naming made automation difficult
2. **Documented rotation policies** - No clear guidance on when/how to rotate secrets
3. **Automated secret scanning** - Risk of accidentally committing secrets
4. **Environment validation** - No pre-deployment checks for proper secret configuration
5. **Comprehensive documentation** - Limited guidance for developers

This presented several risks:

- **Accidental exposure** through commits or logs
- **Stale credentials** without rotation procedures
- **Configuration errors** in production
- **Developer friction** without clear guidelines
- **Compliance gaps** for security audits

---

## Decision

Implement a comprehensive secrets management and hardening framework with the following components:

### 1. Naming Convention Standard

Adopt the pattern: `PROVIDER_NAME_SECRET_TYPE[_ENVIRONMENT]`

**Examples:**

```bash
ALPHAVANTAGE_API_KEY
DATABENTO_API_KEY
DISCORD_DEV_TOKEN
DISCORD_PROD_TOKEN
DISCORD_DEV_APPLICATION_ID
DATABASE_URL
```

**Rationale:**

- Self-documenting variable names
- Easy pattern matching for CI/CD secret masking
- Consistent across all providers
- Supports environment-specific secrets
- Aligns with industry best practices

### 2. Rotation Policy

Establish priority-based rotation schedule:

**HIGH PRIORITY (90 days):**

- `DATABASE_URL` - Full database access
- `DATABENTO_API_KEY` - Paid service, rate-limited
- `DISCORD_*_TOKEN` - Complete bot control

**MEDIUM PRIORITY (180 days):**

- `ALPHAVANTAGE_API_KEY` - Free tier, public data

**IMMEDIATE:**

- Any secret suspected of compromise
- Secrets exposed in commits, logs, or communications

**Rationale:**

- Balances security with operational overhead
- Prioritizes high-value/high-risk credentials
- Provides clear guidance for developers
- Reduces window of opportunity for exploitation

### 3. CI/CD Secret Detection

Implement GitHub Actions workflow using **Gitleaks** for automated scanning.

**Why Gitleaks:**

| Criteria           | Gitleaks       | TruffleHog | git-secrets |
| ------------------ | -------------- | ---------- | ----------- |
| Detection accuracy | Excellent      | Very Good  | Good        |
| Performance        | Fast           | Moderate   | Fast        |
| Configuration      | Easy           | Moderate   | Complex     |
| Maintenance        | Active         | Active     | Stale       |
| GitHub Actions     | Native support | Available  | Limited     |
| False positives    | Low            | Moderate   | Low         |

**Decision:** Gitleaks provides the best balance of accuracy, performance, and ease of integration.

**Implementation:**

- Run on all pushes and PRs
- Scan full git history (fetch-depth: 0)
- Fail builds if secrets detected
- Upload reports as artifacts
- Multiple validation jobs:
  - Secret scanning (Gitleaks)
  - .gitignore validation
  - .env.example validation

### 4. Environment Validation Script

Create `scripts/validate-env.js` to validate configuration before deployment.

**Features:**

- Format validation (regex patterns)
- Length constraints
- Placeholder detection in production
- Environment-specific checks
- Color-coded output
- Non-zero exit codes for CI/CD

**Rationale:**

- Catch configuration errors before deployment
- Prevent placeholder values in production
- Provide clear error messages
- Can be integrated into deployment pipelines
- Language-agnostic (Node.js)

### 5. Comprehensive Documentation

Create `docs/security/secrets.md` covering:

- Naming conventions
- Rotation procedures
- Local development setup
- CI/CD integration
- Incident response
- Provider-specific guidelines

**Rationale:**

- Single source of truth
- Reduces onboarding friction
- Clear procedures reduce errors
- Supports compliance requirements
- Living document (reviewed quarterly)

### 6. Enhanced .env.example

Update `.env.example` with:

- Inline security warnings
- Rotation frequency documentation
- Format descriptions
- Placeholder values showing expected format
- Links to comprehensive documentation

**Rationale:**

- Documentation at point of use
- Reduces need to search for information
- Examples show expected formats
- Security reminders are visible

---

## Alternatives Considered

### Alternative 1: Vault/Secret Management Service

**Considered:** HashiCorp Vault, AWS Secrets Manager, Azure Key Vault

**Pros:**

- Centralized secret storage
- Audit logging
- Dynamic secrets
- Access control

**Cons:**

- Additional infrastructure complexity
- Operational overhead
- Learning curve
- Cost (for managed services)
- Overkill for current scale

**Decision:** Deferred. Revisit when team size > 10 or if compliance requires.

### Alternative 2: TruffleHog for Secret Scanning

**Considered:** TruffleHog instead of Gitleaks

**Pros:**

- Very accurate detection
- Good community support
- Verified secret detection

**Cons:**

- Slower than Gitleaks
- Higher false positive rate
- More complex configuration

**Decision:** Gitleaks chosen for better performance and lower false positives.

### Alternative 3: No Rotation Policy

**Considered:** Ad-hoc rotation only when suspected compromise

**Pros:**

- Less operational overhead
- Simpler procedures

**Cons:**

- Higher risk window
- No proactive security
- Difficult to audit
- Poor security posture

**Decision:** Rejected. Regular rotation is industry best practice.

### Alternative 4: Manual Validation

**Considered:** Manual checklist instead of automated validation

**Pros:**

- No code maintenance
- Flexible

**Cons:**

- Error-prone
- Time-consuming
- Not scalable
- Can't integrate into CI/CD

**Decision:** Rejected. Automation provides consistent, reliable validation.

---

## Trade-offs

### Accepted Trade-offs

1. **Operational Overhead vs Security**
   - **Trade-off:** Regular rotation requires effort
   - **Mitigation:** Calendar reminders, documented procedures
   - **Justification:** Security risk reduction worth the effort

2. **Strict Validation vs Flexibility**
   - **Trade-off:** Validation script may reject valid unusual formats
   - **Mitigation:** Clear error messages, escape hatches for edge cases
   - **Justification:** Catching 95% of errors worth occasional false positive

3. **Documentation Maintenance vs Drift**
   - **Trade-off:** Documentation can become outdated
   - **Mitigation:** Quarterly review schedule, ADR updates
   - **Justification:** Current documentation better than perfect future docs

### Rejected Trade-offs

1. **Complexity vs Security**
   - Rejected simpler approaches that sacrificed security
   - Current complexity is manageable with documentation

2. **Developer Experience vs Safety**
   - Could make secrets easier to use at expense of safety
   - Chose safety with good DX through documentation

---

## Implementation Details

### File Structure

```
tjr-suite/
├── .env.example                          # Enhanced with documentation
├── .gitignore                            # Verified secret patterns
├── docs/
│   └── security/
│       └── secrets.md                    # Comprehensive guide
├── .github/
│   └── workflows/
│       └── secret-lint.yml              # Automated scanning
├── scripts/
│   ├── validate-env.js                  # Runtime validation (JS)
│   └── validate-env.ts                  # Runtime validation (TS)
└── docs/
    └── adr/
        └── ADR-0313-secrets-hardening.md # This document
```

### Naming Pattern Details

```
PROVIDER_NAME_SECRET_TYPE[_ENVIRONMENT]
└─────┬──────┘ └────┬────┘  └─────┬─────┘
   Provider       Type      Optional Env

Examples:
- ALPHAVANTAGE_API_KEY          (single env)
- DATABENTO_API_KEY             (single env)
- DISCORD_DEV_TOKEN             (multi-env)
- DISCORD_STAGE_TOKEN           (multi-env)
- DISCORD_PROD_TOKEN            (multi-env)
- DATABASE_URL                  (connection string)
```

### Rotation Workflow

```
1. Generate new credential at provider portal
   ↓
2. Update in CI/CD secrets (GitHub Actions)
   ↓
3. Update in production environment
   ↓
4. Deploy and verify service continuity
   ↓
5. Revoke old credential at provider
   ↓
6. Notify team to update local .env files
   ↓
7. Document rotation in audit log
```

### CI/CD Integration

```yaml
# GitHub Actions workflow triggers
on:
  push: # Every commit
  pull_request: # Every PR
  workflow_dispatch: # Manual trigger

# Multiple validation jobs
jobs:
  scan: # Gitleaks scanning
  validate-gitignore: # .gitignore validation
  check-example-files: # .env.example validation
  report: # Summary report
```

### Validation Checks

The validation script checks:

```javascript
// Format validation
ALPHAVANTAGE_API_KEY: /^[A-Za-z0-9]{8,32}$/
DATABENTO_API_KEY: /^db-[A-Za-z0-9-]{20,}$/
DISCORD_*_TOKEN: /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}$/
DISCORD_*_APPLICATION_ID: /^\d{17,19}$/
DATABASE_URL: /^postgresql:\/\/([^:]+):([^@]+)@([^:\/]+):(\d+)\/(.+)$/

// Production checks
- No placeholder values
- Strong password requirements
- Appropriate hosts/endpoints
```

---

## Consequences

### Positive

1. **Reduced Security Risk**
   - Automated detection prevents accidental exposure
   - Regular rotation limits exploitation window
   - Validation prevents misconfigurations

2. **Improved Developer Experience**
   - Clear documentation reduces confusion
   - Consistent patterns easy to remember
   - Validation provides helpful error messages

3. **Better Operations**
   - Automated checks reduce manual review burden
   - Clear procedures reduce rotation friction
   - Audit trail for compliance

4. **Scalability**
   - Patterns support adding new providers
   - Documentation template for new secrets
   - CI/CD integration works at any scale

5. **Compliance Ready**
   - Documented policies
   - Audit trail via git history
   - Regular rotation schedule

### Negative

1. **Operational Overhead**
   - Quarterly rotation requires effort
   - Documentation maintenance needed
   - CI/CD failures require investigation

2. **Initial Learning Curve**
   - Developers must learn new patterns
   - More complex .env setup process
   - Additional validation step

3. **Potential False Positives**
   - Gitleaks may flag non-secrets
   - Validation may reject valid configs
   - Requires occasional manual override

### Mitigation Strategies

1. **For Operational Overhead:**
   - Calendar automation for rotation reminders
   - Documented step-by-step procedures
   - Rotation bundled with quarterly reviews

2. **For Learning Curve:**
   - Comprehensive onboarding documentation
   - Example .env.example with inline comments
   - Team training session

3. **For False Positives:**
   - Gitleaks configuration tuning
   - Clear error messages in validation
   - Documented override procedures

---

## Validation and Testing

### Pre-Implementation Validation

- [x] Review existing .env usage patterns
- [x] Audit current secrets for compliance
- [x] Test Gitleaks on repository
- [x] Validate .gitignore coverage

### Post-Implementation Validation

- [ ] Run secret-lint workflow on main branch
- [ ] Test validate-env.js with sample configs
- [ ] Verify documentation completeness
- [ ] Test rotation procedure with one secret
- [ ] Gather developer feedback

### Success Metrics

1. **Zero secrets committed** in 90 days (Gitleaks reports)
2. **100% rotation compliance** in first quarter
3. **< 2 hours** to onboard new developer
4. **Zero production incidents** due to misconfiguration
5. **Positive developer feedback** on documentation

---

## Future Considerations

### Near Term (6 months)

1. **Add npm scripts** for common validation tasks:

   ```json
   {
     "validate:env": "node scripts/validate-env.js",
     "validate:env:prod": "node scripts/validate-env.js --env=production"
   }
   ```

2. **Pre-commit hook** for local secret scanning
3. **Rotation reminder automation** (calendar integration)
4. **Expanded provider support** as new services added

### Long Term (12+ months)

1. **Secret management service** if team scales beyond 10 people
2. **Dynamic secrets** for ephemeral credentials
3. **Secret scanning** in commit messages and PR descriptions
4. **Compliance automation** for audit reports

### Reevaluation Triggers

1. **Team size > 10 people** - Consider centralized secret management
2. **Regulatory compliance** required - May need audit logging
3. **Multiple products** - May need cross-product secret sharing
4. **High false positive rate** - Tune or replace Gitleaks
5. **Developer complaints** - Reassess complexity vs benefit

---

## Related Documents

- **Documentation:** [docs/security/secrets.md](/docs/security/secrets.md)
- **.env Template:** [.env.example](/.env.example)
- **CI Workflow:** [.github/workflows/secret-lint.yml](/.github/workflows/secret-lint.yml)
- **Validation Script:** [scripts/validate-env.js](/scripts/validate-env.js)
- **Issue:** #42 [P3][S1] Secrets management & environment hardening

---

## Approval and Sign-off

**Decision Status:** Accepted

**Approval Date:** 2025-09-30

**Implementation Status:** Complete

- [x] .env.example updated
- [x] docs/security/secrets.md created
- [x] .github/workflows/secret-lint.yml created
- [x] scripts/validate-env.js created
- [x] ADR-0313 documented

**Next Review:** 2025-12-30 (quarterly)

---

## Appendix A: Secret Detection Patterns

Gitleaks uses the following patterns (excerpt):

```toml
[[rules]]
id = "discord-bot-token"
description = "Discord Bot Token"
regex = '''[MN][A-Za-z\d]{23}\.[\w-]{6}\.[\w-]{27}'''
tags = ["key", "Discord"]

[[rules]]
id = "generic-api-key"
description = "Generic API Key"
regex = '''(?i)(api[_-]?key|apikey).*['|\"'][0-9a-zA-Z]{32,}['|\"]'''
tags = ["key", "API"]

[[rules]]
id = "postgres-connection-string"
description = "PostgreSQL connection string"
regex = '''postgresql://[^:]+:[^@]+@[^/]+/\w+'''
tags = ["database", "connection"]
```

---

## Appendix B: Incident Response Checklist

If secret is accidentally committed:

- [ ] **IMMEDIATE:** Revoke secret at provider portal
- [ ] Generate new secret
- [ ] Update CI/CD secrets
- [ ] Update production environment
- [ ] Verify services still operational
- [ ] Remove secret from git history
- [ ] Force push (coordinate with team)
- [ ] Notify team to update local .env
- [ ] Monitor for unauthorized usage (24-48 hours)
- [ ] File incident report
- [ ] Review procedures to prevent recurrence
- [ ] Update documentation if needed

---

## Change Log

| Date       | Version | Changes     | Author        |
| ---------- | ------- | ----------- | ------------- |
| 2025-09-30 | 1.0     | Initial ADR | Security Team |

**Next Review Due:** 2025-12-30
