# Changesets

This directory contains changeset files that describe changes made to packages in the TJR Suite monorepo.

## What are changesets?

Changesets are a way to declare the **intent** of changes to packages. They track:

- **Which packages** are affected by your changes
- **What type of version bump** is needed (major, minor, patch)
- **A description** of what changed (for the changelog)

## Workflow

### 1. Making Changes

When you modify code in a package, create a changeset:

```bash
pnpm changeset
```

This will:

1. Ask which packages have changed
2. Ask what type of version bump is needed:
   - **Major** (breaking change, e.g., 1.0.0 → 2.0.0)
   - **Minor** (new feature, backwards-compatible, e.g., 1.0.0 → 1.1.0)
   - **Patch** (bug fix, e.g., 1.0.0 → 1.0.1)
3. Prompt for a summary of the change

This creates a markdown file in `.changeset/` describing your change.

### 2. Committing Changesets

Commit the generated changeset file along with your code changes:

```bash
git add .changeset/*.md
git commit -m "Add changeset for feature X"
```

### 3. Releasing (Maintainers Only)

When ready to release, run:

```bash
# Update versions and changelogs
pnpm changeset version

# Publish to npm (if applicable)
pnpm changeset publish
```

This will:

- Consume all changeset files in this directory
- Update package versions based on the declared intents
- Generate CHANGELOG.md entries for each package
- Delete the consumed changeset files

## Example Changeset

```markdown
---
'@tjr-suite/core': minor
'@tjr-suite/utils': patch
---

Add new logging utility and fix bug in string helper

- Adds `Logger` class to core package for structured logging
- Fixes off-by-one error in `truncate()` function in utils
```

## CI Integration

CI will validate that:

1. Every PR with package changes includes at least one changeset
2. Changesets correctly reference the modified packages

## References

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Changeset CLI Commands](https://github.com/changesets/changesets/blob/main/packages/cli/README.md)
