# Dependency Security Audit

This document outlines the dependency security audit process for the TJR Suite monorepo.

---

## Overview

We use `pnpm audit` to scan for known vulnerabilities in our dependencies. The audit runs:

- **Locally:** Developers can run `pnpm audit` before committing
- **In CI:** Automated checks on every push and pull request (see `.github/workflows/ci.yml`)

---

## Audit Levels

`pnpm audit` categorizes vulnerabilities by severity:

| Severity     | Description                                 | Action                          |
| ------------ | ------------------------------------------- | ------------------------------- |
| **Critical** | Actively exploited, immediate risk          | Block CI, fix immediately       |
| **High**     | Significant risk, exploitable               | Block CI, fix within 24h        |
| **Moderate** | Moderate risk, requires specific conditions | Warn, fix within 1 week         |
| **Low**      | Minimal risk, theoretical exploit           | Warn, fix within 2 weeks        |
| **Info**     | No risk, informational only                 | Acknowledge, no action required |

---

## Current Policy (Phase 51 - Bootstrap)

### Non-Blocking Warnings

During the initial bootstrap phase, `pnpm audit` runs in **non-blocking mode**:

```bash
pnpm audit --audit-level moderate || true
```

**Rationale:**

- Allows us to establish baseline infrastructure without being blocked by upstream issues
- Gives visibility into vulnerabilities without blocking development
- Provides time to evaluate and remediate issues systematically

**What this means:**

- ✅ CI will **pass** even if vulnerabilities are found
- ⚠️ Vulnerabilities will be **logged** in CI output
- 📋 Security team will **track** and remediate in a follow-up issue

---

## Future Policy (Post-Bootstrap)

After Phase 51 completes, we will enable **strict blocking mode**:

```bash
pnpm audit --audit-level moderate
```

This will:

- ❌ **Fail CI** if any moderate or higher vulnerabilities are found
- 🚫 **Block PR merges** until vulnerabilities are resolved
- 🔄 **Force updates** to safe versions before deployment

---

## Running Audits Locally

### Basic Audit

Check all dependencies for vulnerabilities:

```bash
pnpm audit
```

### Audit with Specific Threshold

Only report moderate or higher:

```bash
pnpm audit --audit-level moderate
```

### Audit Fix (Automatic)

Attempt to automatically fix vulnerabilities by updating to safe versions:

```bash
pnpm audit --fix
```

**⚠️ Warning:** This may introduce breaking changes. Always:

1. Review the changes before committing
2. Run tests after updating
3. Check for any behavioral changes

---

## Remediation Workflow

When a vulnerability is discovered:

### 1. **Assess Severity**

Check the vulnerability details:

```bash
pnpm audit --json > audit-report.json
```

Review:

- Affected package and version
- Vulnerability type (XSS, RCE, DoS, etc.)
- Attack vector (network, local, etc.)
- Exploitability (proof-of-concept available?)

### 2. **Determine Impact**

Ask:

- Is the vulnerable package actually used by our code?
- Is the vulnerable code path reachable in our application?
- Does the vulnerability apply to our runtime environment (Node.js vs. browser)?

### 3. **Remediate**

Choose the appropriate strategy:

#### Option A: Update to Safe Version

```bash
# Update the vulnerable package
pnpm update <package-name>

# Verify the fix
pnpm audit
```

#### Option B: Replace Package

If no safe version exists, find an alternative:

```bash
# Remove vulnerable package
pnpm remove <package-name>

# Install secure alternative
pnpm add <alternative-package>
```

#### Option C: Accept Risk (Temporary)

If the vulnerability is not exploitable in our context:

1. Document the decision in `security/exceptions.md`
2. Create a follow-up issue to monitor for fixes
3. Set a review date (e.g., 30 days)
4. Get approval from 2+ security team members

### 4. **Document**

After remediation:

- Update journal entry (in `docs/journal/_fragments/`)
- Close the related security issue
- Update this document if the policy changed

---

## CI Integration

The security audit runs as a separate job in `.github/workflows/ci.yml`:

```yaml
security:
  name: Security Audit
  runs-on: ubuntu-latest
  steps:
    - name: Run pnpm audit
      run: pnpm audit --audit-level moderate || true
      continue-on-error: true # Non-blocking during Phase 51
```

**Post-Bootstrap:** Remove `|| true` and `continue-on-error: true` to enable blocking.

---

## Exceptions and False Positives

If a vulnerability is reported but not applicable:

1. Investigate thoroughly - don't dismiss too quickly
2. Document why it's not applicable in `security/exceptions.md`
3. Use `pnpm audit --audit-level <level>` to suppress lower-severity warnings
4. Consider contributing a fix upstream if possible

---

## Resources

- [pnpm audit documentation](https://pnpm.io/cli/audit)
- [National Vulnerability Database (NVD)](https://nvd.nist.gov/)
- [Snyk Vulnerability Database](https://snyk.io/vuln)
- [GitHub Advisory Database](https://github.com/advisories)

---

## Changelog

- **2025-09-29:** Initial version (Phase 51, non-blocking mode)
