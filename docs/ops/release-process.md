# TJR Suite Release Process

**Version:** 1.0
**Last Updated:** 2025-09-30
**Owner:** DevOps / Engineering Lead

---

## Overview

TJR Suite uses [Changesets](https://github.com/changesets/changesets) for version management and publishing. This document describes the complete release process, from creating changesets to publishing packages to npm.

**Key Principles:**
- Manual, controlled releases (no automatic publishing)
- Affected packages only (not all packages bumped on every release)
- Semantic versioning (SemVer) compliance
- Support for prerelease tags (alpha, beta, rc)
- Security-first approach (minimal permissions, no secret leakage)

---

## Prerequisites

### Required Access
- Write access to the GitHub repository
- npm organization membership with publish rights
- Access to GitHub Actions workflows

### Required Setup
- Node.js 18+ installed
- pnpm 8.15.0+ installed
- Authenticated with npm (`npm login`)
- Git configured with your name and email

### Environment Variables
For local testing:
```bash
export NPM_TOKEN="npm_xxxxxxxxxxxx"  # Your npm token with publish rights
```

For GitHub Actions:
- `NPM_TOKEN` secret configured in repository settings
- `GITHUB_TOKEN` automatically provided by GitHub

---

## Release Workflow

### Phase 1: Creating Changesets

When you make changes to a package that should trigger a version bump, create a changeset:

```bash
# From the repository root
pnpm changeset
```

This interactive CLI will:
1. Ask which packages have changed
2. Ask whether each change is major, minor, or patch
3. Prompt for a summary of changes

**Example Session:**
```
? Which packages would you like to include?
  ✓ @tjr/logger
  ✓ @tjr/market-data-core

? Which packages should have a major bump? (none selected)
? Which packages should have a minor bump?
  ✓ @tjr/market-data-core
? Which packages should have a patch bump?
  ✓ @tjr/logger

? Please enter a summary for this change (this will be in the changelog)
  Fixed logging race condition and added new market data provider
```

This creates a markdown file in `.changeset/` with your changes:

```markdown
---
"@tjr/market-data-core": minor
"@tjr/logger": patch
---

Fixed logging race condition and added new market data provider
```

**Best Practices:**
- Create changesets as part of your feature branch work
- One changeset per logical change (can span multiple packages)
- Write clear, user-facing summaries (these become changelog entries)
- Commit changeset files with your code changes

### Phase 2: Dry-Run Validation

Before publishing, always validate what would be released:

#### Local Dry-Run

```bash
# Show current changeset status
pnpm changeset status --verbose

# Preview version bumps (creates a snapshot)
pnpm changeset version --snapshot dry-run

# Preview what would be published
pnpm changeset publish --dry-run
```

**Expected Output:**
```
🦋  info @tjr/market-data-core will be bumped to 0.2.0
🦋  info @tjr/logger will be bumped to 0.1.1
🦋  info The following packages will be published:
🦋  info   - @tjr/market-data-core@0.2.0
🦋  info   - @tjr/logger@0.1.1
```

#### GitHub Actions Dry-Run

Trigger the release workflow in dry-run mode:

1. Go to Actions tab in GitHub
2. Select "Release" workflow
3. Click "Run workflow"
4. Ensure "Run in dry-run mode" is checked (default)
5. Click "Run workflow"

Review the workflow output to verify:
- Correct packages are affected
- Version bumps are appropriate (major/minor/patch)
- No unexpected packages included
- Build and tests pass

### Phase 3: Version Bumping

Once dry-run is validated, bump versions locally:

```bash
# Apply all pending changesets
pnpm changeset:version
```

This will:
1. Update package.json versions for affected packages
2. Update CHANGELOG.md files with changeset summaries
3. Delete consumed changeset files
4. Update internal dependencies (workspace:* references)

**Review Changes:**
```bash
git status
git diff
```

Verify:
- Version numbers are correct
- CHANGELOGs are accurate
- No unintended files modified
- Internal dependencies updated properly

**Commit Version Bump:**
```bash
git add .
git commit -m "chore: version packages"
git push
```

**Alternative: Use GitHub Actions**

The release workflow can also create a version bump PR automatically:
1. Trigger workflow with dry-run disabled
2. If changesets exist, a PR will be created
3. Review and merge the PR
4. This becomes your version bump commit

### Phase 4: Publishing

Once versions are bumped and committed, publish to npm:

#### Option A: Local Publishing (Recommended for Testing)

```bash
# Ensure you're on the latest commit
git pull

# Build all packages
pnpm -w -r build

# Publish affected packages
pnpm changeset:publish
```

This will:
1. Publish each changed package to npm
2. Create git tags for each published version
3. Skip private packages (like @tjr-suite/dev-scripts)

**Push Tags:**
```bash
git push --follow-tags
```

#### Option B: GitHub Actions Publishing (Recommended for Production)

1. Go to Actions tab in GitHub
2. Select "Release" workflow
3. Click "Run workflow"
4. **Uncheck** "Run in dry-run mode"
5. Click "Run workflow"

The workflow will:
1. Build and test all packages
2. If changesets exist: Create version bump PR (merge it, then re-run)
3. If no changesets: Publish changed packages to npm
4. Push tags to GitHub

**Monitoring:**
- Watch workflow logs in real-time
- Verify packages appear on npm (may take 1-2 minutes)
- Check tags were created in GitHub

---

## Versioning Strategy

### Semantic Versioning

TJR Suite follows [SemVer 2.0](https://semver.org/):

- **Major (X.0.0)**: Breaking changes (incompatible API changes)
- **Minor (0.X.0)**: New features (backward-compatible additions)
- **Patch (0.0.X)**: Bug fixes (backward-compatible fixes)

**Pre-1.0.0 Packages:**
- Minor bumps may include breaking changes
- Communicate clearly in changelogs
- Consider moving to 1.0.0 once API is stable

### Prerelease Tags

For testing changes before stable release:

```bash
# Create a prerelease version
pnpm changeset version --snapshot alpha

# Example: 0.2.0 becomes 0.2.0-alpha.20250930
```

**Supported Tags:**
- `alpha`: Early testing, unstable
- `beta`: Feature-complete, testing
- `rc`: Release candidate, final testing

**Publishing Prereleases:**
```bash
# Publish with next tag (doesn't affect latest)
pnpm changeset publish --tag next
```

### Internal Dependencies

Workspace packages depend on each other using `workspace:*`:

```json
{
  "dependencies": {
    "@tjr/logger": "workspace:*"
  }
}
```

On publish, these are automatically resolved to specific versions:
```json
{
  "dependencies": {
    "@tjr/logger": "^0.1.1"
  }
}
```

**Update Strategy:**
- Default: `patch` - Internal deps bumped to latest patch
- Configured in `.changeset/config.json`

---

## Rollback Procedures

### Unpublishing (Emergency Only)

npm allows unpublishing within 72 hours of publish:

```bash
# Unpublish a specific version
npm unpublish @tjr/package-name@1.0.0

# WARNING: This breaks dependents! Only for critical issues.
```

**When to Unpublish:**
- Critical security vulnerability
- Major data corruption bug
- Accidental secret leakage

**Better Alternative: Deprecate**
```bash
# Mark version as deprecated (doesn't remove it)
npm deprecate @tjr/package-name@1.0.0 "Critical bug - use 1.0.1 instead"
```

### Rolling Forward (Preferred)

Instead of unpublishing, publish a fix:

1. Create fix in a branch
2. Create changeset with appropriate version bump
3. Fast-track through release process
4. Communicate issue and fix in changelog

**Example:**
```bash
# Create hotfix branch
git checkout -b hotfix/critical-bug

# Fix the issue
# ... make changes ...

# Create changeset
pnpm changeset
# Select patch bump
# Summary: "Fix critical bug in data processing"

# Version and publish immediately
pnpm changeset:version
git add . && git commit -m "chore: hotfix version bump"
pnpm -w -r build
pnpm changeset:publish
git push --follow-tags
```

### Reverting Version Bumps

If version bump was committed but not published:

```bash
# Revert the version commit
git revert <commit-hash>

# OR reset if not pushed
git reset --hard HEAD~1

# Recreate changesets if needed
```

---

## Troubleshooting

### Issue: "No changesets present"

**Symptom:** Running `pnpm changeset status` shows no changesets.

**Solution:**
1. Ensure you've created changesets: `pnpm changeset`
2. Check `.changeset/` directory for `.md` files
3. Verify changesets weren't already consumed

### Issue: "Package not found on npm"

**Symptom:** Package failed to publish, not visible on npm.

**Causes:**
1. Package is marked `"private": true` in package.json
2. npm authentication failed
3. Organization/scope doesn't match npm account

**Solutions:**
```bash
# Check package.json
cat packages/my-package/package.json | grep private

# Verify npm authentication
npm whoami

# Check npm organization access
npm org ls <org-name>
```

### Issue: "Version already published"

**Symptom:** `npm ERR! 403 You cannot publish over the previously published version`

**Cause:** Version number already exists on npm.

**Solution:**
1. Bump version manually in package.json
2. Re-run `pnpm changeset:version`
3. Or publish with a new changeset

### Issue: "Workspace dependency not resolved"

**Symptom:** Published package has `workspace:*` in dependencies.

**Cause:** Package wasn't built before publishing.

**Solution:**
```bash
# Always build before publishing
pnpm -w -r build
pnpm changeset:publish
```

### Issue: "Git tags already exist"

**Symptom:** `tag already exists` error when pushing tags.

**Cause:** Previous publish created tags that weren't pushed.

**Solution:**
```bash
# Force update tags (use with caution)
git push --tags --force

# OR delete and recreate
git tag -d @tjr/package@1.0.0
git push --follow-tags
```

### Issue: "GitHub Actions workflow fails"

**Common Causes:**
1. Missing `NPM_TOKEN` secret
2. Token doesn't have publish rights
3. Build failures in packages
4. Test failures

**Debugging:**
1. Check workflow logs for specific error
2. Verify secrets in repository settings
3. Run build/test locally: `pnpm -w -r build && pnpm -w -r test`
4. Test npm auth: `npm whoami` (using same token)

---

## Security Best Practices

### Token Management

**Never:**
- Commit tokens to git
- Share tokens via insecure channels
- Use tokens in public repos without secrets
- Grant tokens more permissions than needed

**Always:**
- Use GitHub encrypted secrets
- Rotate tokens periodically (every 90 days)
- Use automation tokens (not personal tokens)
- Audit token usage in npm settings

### Access Control

**npm Organization:**
- Use organization scoped packages (@tjr/*)
- Grant publish rights to specific users only
- Enable 2FA for all npm accounts
- Review access logs regularly

**GitHub Repository:**
- Require PR reviews for main branch
- Use branch protection rules
- Enable required status checks
- Restrict workflow approvals

### Publishing Checklist

Before every release:
- [ ] Run dry-run and review output
- [ ] Verify no secrets in changelogs
- [ ] Check for sensitive data in packages
- [ ] Ensure tests pass
- [ ] Review version numbers
- [ ] Verify affected packages are correct
- [ ] Confirm npm token is valid
- [ ] Check no credentials in package files

---

## Changelog Best Practices

### Writing Good Summaries

**Good:**
```
Add support for WebSocket data streaming
Fix memory leak in bar cache cleanup
Breaking: Remove deprecated getPrice() method
```

**Bad:**
```
Updated code
Bug fix
Changes
```

### Changelog Format

Changesets automatically generates:

```markdown
## 0.2.0

### Minor Changes

- abc1234: Add support for WebSocket data streaming

### Patch Changes

- def5678: Fix memory leak in bar cache cleanup
- Updated dependencies
  - @tjr/logger@0.1.1
```

**Manual Editing:**
- You can edit CHANGELOG.md after `changeset version`
- Add context or breaking change notices
- Group related changes
- Add migration guides for breaking changes

---

## References

- [Changesets Documentation](https://github.com/changesets/changesets)
- [SemVer Specification](https://semver.org/)
- [npm Publishing Guide](https://docs.npmjs.com/cli/v9/commands/npm-publish)
- [ADR-0312: Release Pipeline](../adr/ADR-0312-release-pipeline.md)
- [GitHub Actions Workflows](../../.github/workflows/release.yml)

---

## Support

For issues or questions:
1. Check Troubleshooting section above
2. Review workflow logs in GitHub Actions
3. Consult team DevOps lead
4. Create issue in repository with `release` label