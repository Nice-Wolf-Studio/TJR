# ADR-0051: Monorepo Bootstrap

**Status:** Accepted
**Date:** 2025-09-29
**Deciders:** Architecture Team
**Phase:** 51
**Shard:** A1

---

## Context

The TJR Suite requires a unified codebase structure that enables:

- Shared TypeScript configurations and tooling across multiple packages
- Consistent linting, formatting, and build processes
- Coordinated versioning and release management
- Efficient CI/CD pipelines with selective testing and builds
- Clear code ownership and governance

Without a monorepo strategy, we face:

- Configuration drift across packages
- Duplicate tooling setup and maintenance
- Complex versioning and dependency management
- Inefficient CI runs testing unaffected code
- Fragmented code review processes

---

## Decision

### 1. **Package Manager: pnpm**

We will use **pnpm** as our monorepo package manager.

**Rationale:**

- **Disk efficiency:** Uses content-addressable storage, saving disk space
- **Performance:** Faster installs due to hard-linking from global store
- **Strict dependency resolution:** Prevents phantom dependencies (packages not declared in package.json)
- **Workspace support:** Native, robust workspace implementation
- **Compatibility:** Drop-in replacement for npm with better defaults

**Alternative considered:** Yarn Workspaces

- Pros: More mature, wider adoption
- Cons: Slower installs, less strict dependency resolution, larger disk footprint
- Decision: pnpm's performance and strictness align better with our quality goals

---

### 2. **Build System: TypeScript Project References**

We will use **TypeScript project references** for incremental builds across packages.

**Rationale:**

- **Incremental builds:** Only rebuilds changed packages and their dependents
- **Type safety across packages:** Ensures type consistency in the workspace
- **IDE performance:** Faster IntelliSense with pre-built declaration files
- **Explicit dependencies:** Forces clear package boundaries

**Configuration:**

- `tsconfig.base.json` at root with strict settings
- Each package has its own `tsconfig.json` extending the base
- Path mappings for internal package references (e.g., `@tjr-suite/*`)

---

### 3. **Code Quality: ESLint + Prettier + EditorConfig**

Unified linting and formatting enforced at the root level.

**Rationale:**

- **Consistency:** Same rules across all packages
- **Automation:** Pre-commit hooks and CI checks prevent style drift
- **Developer experience:** Editor integration provides instant feedback

**Configurations:**

- `.eslintrc.cjs`: TypeScript-aware rules, extensible per-package
- `.prettierrc`: Opinionated formatting (2-space indent, single quotes, trailing commas)
- `.editorconfig`: Cross-editor consistency (indent style, line endings)

---

### 4. **Version Management: Changesets**

We will use **Changesets** for versioning and changelog generation.

**Rationale:**

- **Developer-driven:** Contributors write intent-based change descriptions
- **Atomic versioning:** Groups related changes across packages
- **Semantic versioning:** Automatically determines version bumps (major/minor/patch)
- **CI integration:** Automates releases with proper changelogs

**Workflow:**

1. Developer runs `pnpm changeset` when making changes
2. CI validates changesets are present for modified packages
3. Release manager runs `pnpm changeset version` to bump versions
4. CI publishes packages and creates GitHub releases

---

### 5. **CI/CD: GitHub Actions with Matrix Builds**

A single workflow file with matrix builds per package.

**Rationale:**

- **Efficiency:** Only runs tests for changed packages (future optimization)
- **Parallelization:** Concurrent package builds and tests
- **Caching:** pnpm store caching via `actions/setup-node`
- **Consistency:** Same environment as local development (Node.js version, pnpm version)

**Workflow stages:**

1. **Setup:** Checkout, install Node.js, cache pnpm store
2. **Install:** `pnpm install --frozen-lockfile`
3. **Build:** `pnpm -w -r build` (all workspaces, recursive)
4. **Test:** `pnpm -w -r test` (all workspaces, recursive)
5. **Lint:** `pnpm -w -r lint`

---

### 6. **Governance: CODEOWNERS + Branch Protections**

Code ownership and review policies enforced via GitHub features.

**Rationale:**

- **Accountability:** Clear ownership per package/directory
- **Quality gates:** Required reviews before merging
- **Security:** Prevents unauthorized changes to critical paths

**Setup:**

- `.github/CODEOWNERS`: Maps paths to teams/individuals (e.g., `packages/core/ @tjr-team/core-maintainers`)
- `docs/governance/branch-protections.md`: Documents required PR checks (CI pass, 1+ review, no force-push)

---

### 7. **Workspace Layout**

```
tjr-suite/
├── packages/              # Application packages (publishable)
│   ├── smoke/            # Initial smoke test package (QA requirement)
│   └── [future packages]
├── docs/                 # Project documentation
│   ├── adr/              # Architectural Decision Records
│   ├── governance/       # Team policies and procedures
│   └── journal/          # Implementation journals
├── .github/              # GitHub-specific configs
│   ├── workflows/        # CI/CD workflows
│   └── CODEOWNERS        # Code ownership mapping
├── .changeset/           # Changesets configuration
├── pnpm-workspace.yaml   # pnpm workspace definition
├── tsconfig.base.json    # Shared TypeScript config
├── .eslintrc.cjs         # Shared ESLint config
├── .prettierrc           # Shared Prettier config
├── .editorconfig         # Editor configuration
├── .gitignore            # Git ignore patterns
└── package.json          # Root package (workspace scripts)
```

---

## Alternatives Considered

### Multi-Repo Strategy

**Pros:**

- Independent versioning per package
- Simpler permissions model (repo-level access control)

**Cons:**

- Configuration duplication across repos
- Complex cross-repo changes (requires multiple PRs)
- Inefficient CI (each repo builds in isolation)
- Dependency hell (version mismatches between packages)

**Decision:** Rejected. The complexity of managing multiple repos outweighs the benefits for our use case.

---

### Git Submodules

**Pros:**

- Allows independent repos with unified view

**Cons:**

- Notoriously difficult to use correctly (detached HEAD states, nested commits)
- Poor tooling support
- Doesn't solve configuration drift or dependency management

**Decision:** Rejected. Submodules introduce more problems than they solve for a monorepo use case.

---

## Risks and Mitigations

### Risk 1: Large repository size over time

**Impact:** Slow clones, large disk usage
**Mitigation:**

- Use pnpm (shared global store reduces duplication)
- Implement `git lfs` for binary assets if needed
- Consider shallow clones in CI (`--depth=1`)

---

### Risk 2: CI runtime increases as packages grow

**Impact:** Slow feedback loop for developers
**Mitigation:**

- Implement affected package detection (only test changed packages)
- Use GitHub Actions matrix builds for parallelization
- Cache build artifacts across CI runs

---

### Risk 3: Breaking changes cascade across packages

**Impact:** One bad change breaks multiple packages
**Mitigation:**

- TypeScript project references catch type errors early
- Comprehensive test coverage per package
- Changesets force explicit versioning of breaking changes
- Branch protections require passing CI before merge

---

### Risk 4: Unclear package boundaries

**Impact:** Tight coupling, hard-to-extract packages
**Mitigation:**

- Enforce explicit dependencies via pnpm workspace protocol
- Code review focus on package API design
- Periodic architecture reviews (documented as ADRs)

---

## Rollback Plan

If the monorepo strategy proves unworkable:

1. **Extract packages:** Each `packages/*` directory becomes its own repo
2. **Migrate CI:** Duplicate `.github/workflows/ci.yml` to each repo
3. **Dependency management:** Publish packages to npm, consume as external deps
4. **Versioning:** Migrate changesets to per-repo semantic-release or manual versioning

**Estimated effort:** 2-3 days per package (scripted extraction possible)

---

## Success Metrics

1. **CI feedback time:** < 5 minutes for typical PR (baseline: TBD after smoke package)
2. **Developer onboarding:** New contributor can run full build in < 15 minutes
3. **Consistency:** 100% of packages use base TypeScript/ESLint/Prettier configs (no overrides without ADR)
4. **Release cadence:** Ability to release individual packages independently within 1 hour

---

## References

- [pnpm Workspaces Documentation](https://pnpm.io/workspaces)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [Changesets Documentation](https://github.com/changesets/changesets)
- [GitHub CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)

---

## Changelog

- **2025-09-29:** Initial ADR created (Phase 51, Shard A1)
