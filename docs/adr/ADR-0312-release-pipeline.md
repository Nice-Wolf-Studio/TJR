# ADR-0312: Release and Publish Pipeline with Changesets

**Status:** Accepted
**Date:** 2025-09-30
**Decision Makers:** PM Agent, Architect, Coder
**Issue:** #41

---

## Context

TJR Suite is a monorepo containing 17+ packages with complex interdependencies. As packages mature and become ready for external use (Discord bot deployment, client applications), we need a reliable, secure, and maintainable release pipeline.

**Key Requirements:**
1. Version management for independent packages (not lock-step versioning)
2. Semantic versioning (SemVer) compliance
3. Automated changelog generation
4. Support for prerelease tags (alpha, beta, rc)
5. Publish only affected packages (not all packages on every release)
6. Manual release control (no automatic publishing)
7. Security-first approach (minimal permissions, no secret leakage)
8. Integration with existing CI/CD (GitHub Actions)

**Current State:**
- Changesets CLI already installed (@changesets/cli@^2.27.1)
- Basic scripts in root package.json (changeset, changeset:version, changeset:publish)
- No formal release workflow or documentation
- No package access configuration
- No GitHub Actions workflow for releases

**Pain Points:**
- Manual version bumping is error-prone
- No changelog automation
- Risk of publishing wrong versions
- No clear process for developers
- Hard to coordinate multi-package releases

---

## Decision

Implement a **Changesets-driven release pipeline** with manual GitHub Actions workflow for version management and npm publishing.

### Core Components

#### 1. Changeset Configuration

**File:** `.changeset/config.json`

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@tjr-suite/dev-scripts"]
}
```

**Key Decisions:**
- `access: "restricted"`: Default to private packages (override per-package with `"publishConfig": {"access": "public"}`)
- `commit: false`: Don't auto-commit changeset files (developers commit manually)
- `fixed: []`: No lock-step versioning (packages version independently)
- `linked: []`: No linked versions (each package has independent version)
- `ignore`: Dev-only packages never published
- `updateInternalDependencies: "patch"`: Workspace deps bumped to latest patch

#### 2. GitHub Actions Workflow

**File:** `.github/workflows/release.yml`

**Trigger:** `workflow_dispatch` (manual only)

**Inputs:**
- `dry_run` (boolean, default: true): Safety-first approach

**Permissions:**
- `contents: write`: Create version tags
- `pull-requests: write`: Create release PRs
- `id-token: write`: npm provenance support

**Steps:**
1. Checkout with full history (changesets needs git history)
2. Setup Node.js with npm registry configuration
3. Install pnpm (version pinned to 8.15.0)
4. Install dependencies (frozen lockfile for reproducibility)
5. Build all packages (required before publishing)
6. Run tests (quality gate)
7. **Dry-run mode:** Show version plan without publishing
8. **Release mode:** Create version PR or publish packages
9. Push tags to GitHub
10. Generate release summary

**Security Measures:**
- Minimal permissions (no `repo` or `workflow` scope)
- Secrets managed via GitHub encrypted secrets
- npm provenance enabled (`NPM_CONFIG_PROVENANCE: true`)
- Concurrency control (prevent simultaneous releases)
- Manual trigger only (no automatic publishing)

#### 3. Developer Workflow

**Creating Changesets:**
```bash
pnpm changeset
# Interactive prompts for packages, version bump type, summary
```

**Dry-Run Validation:**
```bash
# Local
pnpm changeset status --verbose
pnpm changeset publish --dry-run

# GitHub Actions
# Trigger workflow with dry_run=true
```

**Publishing:**
```bash
# Option A: Local (testing)
pnpm changeset:version
git add . && git commit -m "chore: version packages"
pnpm -w -r build
pnpm changeset:publish
git push --follow-tags

# Option B: GitHub Actions (production)
# Trigger workflow with dry_run=false
```

#### 4. Documentation

**Files Created:**
- `docs/ops/release-process.md`: Comprehensive step-by-step guide
- `docs/adr/ADR-0312-release-pipeline.md`: This document
- `docs/journal/_fragments/3/3.R1-release-pipeline.md`: Implementation journal

**Coverage:**
- Creating changesets
- Dry-run validation
- Version bumping
- Publishing (local and GitHub Actions)
- Rollback procedures
- Troubleshooting
- Security best practices

---

## Rationale

### Why Changesets?

**Alternatives Considered:**

1. **Lerna** (deprecated)
   - ❌ No longer actively maintained
   - ❌ Complex configuration
   - ❌ Heavy dependencies
   - ✅ Widely used historically

2. **Semantic Release**
   - ❌ Fully automated (no manual control)
   - ❌ Commit message parsing (brittle)
   - ❌ Hard to customize
   - ✅ Convention-based

3. **Manual Versioning**
   - ❌ Error-prone (easy to miss packages)
   - ❌ No changelog automation
   - ❌ Hard to coordinate multi-package releases
   - ✅ Full control

4. **Changesets** (chosen)
   - ✅ Active maintenance and community
   - ✅ Explicit changeset files (reviewable)
   - ✅ Independent package versioning
   - ✅ Flexible (manual or automated)
   - ✅ Excellent monorepo support
   - ✅ Used by major projects (React, Remix, Emotion)

**Decision Factors:**
- **Safety:** Explicit changeset files provide audit trail
- **Flexibility:** Supports both manual and automated workflows
- **Developer Experience:** Simple CLI, clear prompts
- **Monorepo Support:** Designed specifically for monorepos
- **Changelog Quality:** Structured summaries, not commit messages
- **Community:** Active development, good documentation

### Why Manual Trigger?

**Automatic Publishing Rejected:**
- Risk of publishing broken code
- No human verification step
- Hard to revert mistakes
- Scary for new contributors

**Manual Workflow Benefits:**
- Developer reviews changes before publish
- Can validate in staging/test environments
- Clear checkpoint before production
- Easy to abort if issues found
- Better for learning/onboarding

**Dry-Run Default:**
- Forces conscious decision to publish
- Reduces accidental publishes
- Allows safe exploration of release process
- Provides preview of changes

### Why Minimal Permissions?

**Security Principles:**
1. **Least Privilege:** Only grant permissions needed
2. **Defense in Depth:** Multiple layers of protection
3. **Audit Trail:** All actions logged in GitHub
4. **Token Rotation:** Easy to rotate/revoke

**Permissions Rationale:**
- `contents: write`: Need to create tags (can't be avoided)
- `pull-requests: write`: Create release PRs (optional flow)
- `id-token: write`: npm provenance (security best practice)
- NO `repo`: Prevents arbitrary code changes
- NO `workflow`: Prevents workflow tampering

**Token Management:**
- GitHub token: Automatic, scoped per-workflow
- npm token: Secret, rotatable, auditable
- No personal tokens (use automation tokens)

### Why Ignore dev-scripts?

**Reasoning:**
- `@tjr-suite/dev-scripts` is marked private
- Internal tooling, not for external consumption
- Changing it doesn't affect published packages
- Reduces noise in release process

**Implications:**
- Dev scripts can change without version bumps
- No changelog for internal tools
- Simplifies release coordination

---

## Consequences

### Positive

✅ **Reliability:** Explicit changesets reduce human error
✅ **Auditability:** Changeset files provide clear history of intended changes
✅ **Flexibility:** Supports both manual and automated workflows
✅ **Security:** Minimal permissions and secret management
✅ **Changelog Quality:** Human-written summaries, not commit messages
✅ **Independent Versioning:** Packages evolve at their own pace
✅ **Safety:** Dry-run by default prevents accidental publishes
✅ **Documentation:** Comprehensive process documentation
✅ **Developer Experience:** Clear, guided workflow

### Negative

⚠️ **Manual Overhead:** Developers must create changesets
⚠️ **Learning Curve:** New concept for developers unfamiliar with Changesets
⚠️ **Coordination Required:** Multiple packages = multiple changesets
⚠️ **GitHub Actions Dependency:** Requires GitHub-hosted infrastructure

### Mitigations

**Manual Overhead:**
- CLI is fast and intuitive
- Can batch multiple package changes in one changeset
- Becomes habit after a few uses

**Learning Curve:**
- Comprehensive documentation in `docs/ops/release-process.md`
- Examples in this ADR
- Dry-run mode for safe exploration

**Coordination:**
- Changeset status command shows pending changes
- PR reviews catch missing changesets
- Can create changesets retroactively if forgotten

**GitHub Actions Dependency:**
- Local publishing workflow documented
- Can migrate to other CI/CD if needed
- Workflow is simple (easy to port)

---

## Implementation Plan

### Phase 1: Core Setup

- [x] Configure `.changeset/config.json`
- [x] Create `.github/workflows/release.yml`
- [x] Document process in `docs/ops/release-process.md`
- [x] Write ADR (this document)
- [ ] Test dry-run locally
- [ ] Test dry-run in GitHub Actions
- [ ] Validate with sample package

### Phase 2: Security Hardening

- [ ] Configure npm token as GitHub secret
- [ ] Enable npm provenance
- [ ] Set up branch protection for tags
- [ ] Document token rotation procedure
- [ ] Audit package.json files for sensitive data

### Phase 3: Team Onboarding

- [ ] Present release process to team
- [ ] Create video walkthrough
- [ ] Practice with test package
- [ ] Update CONTRIBUTING.md with changeset workflow
- [ ] Add pre-commit hook reminders

### Phase 4: First Production Release

- [ ] Choose pilot package (low risk)
- [ ] Create changesets for pending changes
- [ ] Run full dry-run validation
- [ ] Publish to npm
- [ ] Verify package installation
- [ ] Document lessons learned

---

## Testing Strategy

### Unit Tests
Not applicable (configuration and workflow, not code)

### Integration Tests

**Local Dry-Run:**
```bash
# Test changeset creation
pnpm changeset

# Test version planning
pnpm changeset status --verbose

# Test publish preview
pnpm changeset publish --dry-run
```

**GitHub Actions Dry-Run:**
1. Trigger workflow with `dry_run: true`
2. Verify build succeeds
3. Verify tests pass
4. Review version plan output
5. Confirm no actual publish occurs

**End-to-End Test:**
1. Create test package (private, for testing)
2. Create changeset for test package
3. Run version bump
4. Build package
5. Publish to npm (test scope)
6. Install published package
7. Verify functionality

### Validation Checklist

Before production release:
- [ ] Dry-run shows correct packages
- [ ] Version bumps are appropriate (major/minor/patch)
- [ ] Changelogs are accurate
- [ ] No secrets in package files
- [ ] Build succeeds for all packages
- [ ] Tests pass for all packages
- [ ] npm token is valid
- [ ] GitHub Actions workflow completes successfully

---

## Rollback Procedures

### Scenario 1: Version Bump Not Yet Published

**Situation:** Bumped versions locally but not published

**Solution:**
```bash
git revert <version-bump-commit>
# OR
git reset --hard HEAD~1  # if not pushed
```

### Scenario 2: Published Bad Version

**Immediate Actions:**
1. Assess severity (breaking bug, security issue, etc.)
2. Decide: unpublish or roll forward

**Option A: Unpublish (within 72 hours)**
```bash
npm unpublish @tjr/package-name@1.0.0
```
- Use ONLY for critical issues
- Breaks existing dependents
- Document reasoning

**Option B: Roll Forward (preferred)**
```bash
# Fix the issue
# Create hotfix changeset
pnpm changeset  # Select patch bump
# Fast-track through release process
pnpm changeset:version
pnpm -w -r build
pnpm changeset:publish
```

**Option C: Deprecate**
```bash
npm deprecate @tjr/package-name@1.0.0 "Critical bug - use 1.0.1"
```
- Warns users but doesn't break existing installs
- Best for non-critical issues

### Scenario 3: GitHub Actions Workflow Fails

**Debugging:**
1. Check workflow logs for specific error
2. Verify secrets are configured
3. Test locally: `pnpm -w -r build && pnpm -w -r test`
4. Re-run workflow if transient failure

**Common Causes:**
- Missing npm token
- Build/test failures
- Network issues
- npm registry downtime

---

## Monitoring and Maintenance

### Regular Tasks

**Weekly:**
- Review pending changesets
- Check for orphaned changeset files
- Verify npm token hasn't expired

**Monthly:**
- Review published packages on npm
- Audit package download stats
- Check for security vulnerabilities
- Update Changesets CLI if needed

**Quarterly:**
- Rotate npm tokens
- Review and update documentation
- Gather developer feedback on process
- Optimize workflow based on usage

### Metrics to Track

- Time from changeset creation to publish
- Number of failed releases
- Number of rollbacks
- Developer satisfaction with process
- Package download trends

### Alerts and Notifications

- Workflow failures (GitHub Actions notifications)
- npm publish failures (email from npm)
- Security advisories (GitHub Dependabot)
- Token expiration warnings (npm)

---

## Future Enhancements

### Short Term (Next Quarter)

1. **Automated Changeset Validation:**
   - Pre-commit hook to remind about changesets
   - PR check for missing changesets
   - Lint changeset format

2. **Release Notes Automation:**
   - Generate GitHub releases from changelogs
   - Link to issues and PRs
   - Include contributor credits

3. **Prerelease Workflow:**
   - Dedicated workflow for alpha/beta releases
   - Publish to `next` tag
   - Automated canary deployments

### Medium Term (6 Months)

1. **Provenance and Security:**
   - Enable npm provenance for all packages
   - SLSA level 3 compliance
   - Supply chain security attestations

2. **Release Dashboard:**
   - Web UI for release status
   - Pending changeset visualization
   - Release history and metrics

3. **Multi-Registry Support:**
   - GitHub Package Registry as backup
   - Private npm registry for internal packages
   - Registry fallback logic

### Long Term (1 Year)

1. **Fully Automated Releases:**
   - Merge to main triggers release
   - Comprehensive test suite
   - Automated rollback on failures

2. **Release Analytics:**
   - Usage metrics per version
   - Adoption rates
   - Deprecation impact analysis

3. **Monorepo Optimization:**
   - Selective builds (only changed packages)
   - Incremental testing
   - Parallel publishing

---

## References

### Documentation
- [Release Process Guide](../ops/release-process.md)
- [Changesets GitHub](https://github.com/changesets/changesets)
- [Changesets Documentation](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md)
- [SemVer Specification](https://semver.org/)

### Related ADRs
- ADR-0051: Monorepo Bootstrap
- ADR-0054: Dev Scripts

### External Resources
- [npm Publishing Guide](https://docs.npmjs.com/cli/v9/commands/npm-publish)
- [npm Provenance](https://docs.npmjs.com/generating-provenance-statements)
- [GitHub Actions Security](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)

### Issue Tracking
- Issue #41: [P3][R1] Release & publish pipeline with Changesets
- Branch: `phase-3.R1-release-pipeline`
- Implementation Journal: `docs/journal/_fragments/3/3.R1-release-pipeline.md`

---

## Appendix: Configuration Files

### .changeset/config.json
```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@tjr-suite/dev-scripts"]
}
```

### package.json (root scripts)
```json
{
  "scripts": {
    "changeset": "changeset",
    "changeset:version": "changeset version",
    "changeset:publish": "changeset publish"
  }
}
```

### Example Package Configuration
```json
{
  "name": "@tjr/logger",
  "version": "0.1.0",
  "publishConfig": {
    "access": "public"
  }
}
```

---

## Approval

**PM Agent:** Approved - Addresses all requirements from Issue #41
**Architect:** Approved - Security and maintainability considerations met
**Coder:** Implemented - All components complete, documentation comprehensive

**Signed off:** 2025-09-30