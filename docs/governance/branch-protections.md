# Branch Protection Rules

This document outlines the branch protection rules for the TJR Suite monorepo. These rules ensure code quality, prevent accidental mistakes, and maintain a clean git history.

> **Note:** These rules must be configured manually in GitHub repository settings under **Settings → Branches → Branch protection rules**.

---

## Protected Branches

### `main`

The primary integration branch. All releases are cut from `main`.

#### Required Status Checks

Must pass before merging:

- ✅ **CI / CI (ubuntu-latest)** - Build, test, and lint all packages
- ✅ **Security / Security Audit** - Dependency vulnerability scan

**Settings:**
- ☑️ Require status checks to pass before merging
- ☑️ Require branches to be up to date before merging

#### Pull Request Requirements

- **Minimum 1 approval required** from a CODEOWNERS member
- ☑️ Dismiss stale pull request approvals when new commits are pushed
- ☑️ Require review from Code Owners

#### Commit Signing

- ☑️ Require signed commits (recommended, not enforced initially)

#### Additional Restrictions

- ☑️ **Restrict who can push** to maintainers team only
- ☑️ **Do not allow bypassing** the above settings (no admin override)
- ☑️ **Restrict force pushes** - Prevent rewriting history
- ☑️ **Restrict deletions** - Prevent accidental branch deletion

#### Linear History

- ☑️ **Require linear history** - Enforce merge strategies:
  - **Squash and merge** (preferred for feature PRs)
  - **Rebase and merge** (for clean history)
  - ❌ **Create a merge commit** (disabled to maintain linearity)

---

### `phase-*` Branches

Development branches for specific phases (e.g., `phase-51.A1-monorepo-bootstrap`).

#### Required Status Checks

Same as `main`:

- ✅ **CI / CI (ubuntu-latest)**
- ✅ **Security / Security Audit**

#### Pull Request Requirements

- **Minimum 1 approval required**
- ☑️ Require review from Code Owners

#### Additional Restrictions

- ☑️ **Restrict force pushes** to collaborators only (maintainers can force-push if needed)
- ☑️ **Restrict deletions** - Prevent accidental deletion
- ❌ **Do not require linear history** (allow flexibility during development)

---

## Enforcement Timeline

### Phase 1 (Current - Bootstrap)

- **Soft enforcement:** Warnings but not blocking
- CI must pass, but maintainers can override if needed
- Focus on establishing baseline

### Phase 2 (After Initial Release)

- **Full enforcement:** All rules strictly enforced
- No overrides except in emergencies (requires ADR)

---

## Exception Process

If a rule must be bypassed:

1. **Document why** - Create an ADR explaining the exception
2. **Get approval** - At least 2 maintainers must approve
3. **Time-limit** - Specify when the exception expires
4. **Journal entry** - Document the bypass in the project journal

---

## Configuring in GitHub

### Step-by-Step

1. Navigate to **Settings → Branches** in the GitHub repository
2. Click **Add branch protection rule**
3. Enter branch name pattern:
   - `main` (for main branch)
   - `phase-*` (for all phase branches)
4. Configure settings as outlined above
5. Click **Create** or **Save changes**

### Import via GitHub CLI (if available)

```bash
# Protect main branch
gh api repos/Nice-Wolf-Studio/tjr-suite/branches/main/protection \
  --method PUT \
  --input protection-config-main.json

# Protect phase-* branches
gh api repos/Nice-Wolf-Studio/tjr-suite/branches/phase-*/protection \
  --method PUT \
  --input protection-config-phase.json
```

*(Protection config JSON files would need to be created separately)*

---

## References

- [GitHub Branch Protection Documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Status Checks Best Practices](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks)
- [CODEOWNERS Documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)

---

## Changelog

- **2025-09-29:** Initial version (Phase 51, Shard A1)