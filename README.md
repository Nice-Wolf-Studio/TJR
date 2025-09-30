# TJR Suite

[![CI](https://github.com/Nice-Wolf-Studio/tjr-suite/workflows/CI/badge.svg)](https://github.com/Nice-Wolf-Studio/tjr-suite/actions/workflows/ci.yml)

> Unified monorepo for the TJR Suite project

---

## Overview

TJR Suite is a monorepo containing all packages and tools for the TJR project. This repository uses:

- **[pnpm](https://pnpm.io/)** - Fast, disk-efficient package manager with workspace support
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe development with project references for incremental builds
- **[ESLint](https://eslint.org/)** + **[Prettier](https://prettier.io/)** - Code quality and formatting
- **[Changesets](https://github.com/changesets/changesets)** - Version management and changelog generation
- **[GitHub Actions](https://github.com/features/actions)** - Automated CI/CD pipelines

---

## Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0

Install pnpm globally if you don't have it:

```bash
npm install -g pnpm@8.15.0
```

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/Nice-Wolf-Studio/tjr-suite.git
cd tjr-suite
pnpm install
```

### Build All Packages

```bash
pnpm build
```

This will build all workspace packages in dependency order using TypeScript project references.

### Run Tests

```bash
pnpm test
```

Runs tests across all packages using Node.js built-in test runner.

### Lint and Format

```bash
# Run ESLint on all packages
pnpm lint

# Check formatting with Prettier
pnpm format:check

# Auto-fix formatting issues
pnpm format
```

---

## Workspace Structure

```
tjr-suite/
├── packages/              # Workspace packages
│   └── smoke/            # Smoke test package (validates toolchain)
├── docs/                 # Documentation
│   ├── adr/              # Architectural Decision Records
│   ├── governance/       # Team policies and procedures
│   └── journal/          # Implementation journals
├── security/             # Security policies and audit reports
├── .github/              # GitHub Actions workflows and CODEOWNERS
├── .changeset/           # Changesets for version management
└── [config files]        # Shared tooling configuration
```

### Packages

| Package            | Description                                    | Status    |
| ------------------ | ---------------------------------------------- | --------- |
| `@tjr-suite/smoke` | Smoke test package to validate build toolchain | ✅ Active |

---

## Development Workflow

### Creating a New Package

1. Create a new directory under `packages/`:

```bash
mkdir -p packages/my-package/src
cd packages/my-package
```

2. Create `package.json`:

```json
{
  "name": "@tjr-suite/my-package",
  "version": "0.0.1",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc --build",
    "test": "node --test tests/*.test.js",
    "lint": "eslint src --ext .ts"
  }
}
```

3. Create `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

4. Add source code in `src/` and tests in `tests/`

5. Run from root:

```bash
pnpm install  # Link the new package
pnpm build    # Build the new package
pnpm test     # Test the new package
```

### Making Changes

1. Create a feature branch:

```bash
git checkout -b feature/my-feature
```

2. Make your changes to package code

3. Create a changeset (for version management):

```bash
pnpm changeset
```

Follow the prompts to describe your changes.

4. Commit your changes:

```bash
git add .
git commit -m "feat: add my feature"
```

5. Push and create a pull request

---

## Scripts Reference

All scripts can be run from the monorepo root and will execute across all packages:

| Command                  | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `pnpm build`             | Build all packages (TypeScript compilation)          |
| `pnpm test`              | Run tests across all packages                        |
| `pnpm lint`              | Lint all packages with ESLint                        |
| `pnpm format`            | Auto-format code with Prettier                       |
| `pnpm format:check`      | Check formatting without modifying files             |
| `pnpm typecheck`         | Run TypeScript type checking without emitting        |
| `pnpm clean`             | Remove all build artifacts and node_modules          |
| `pnpm changeset`         | Create a new changeset for version management        |
| `pnpm changeset:version` | Bump versions based on changesets (maintainers only) |
| `pnpm changeset:publish` | Publish packages to npm (maintainers only)           |

---

## CI/CD

All commits and pull requests are automatically validated via GitHub Actions:

- ✅ **Build** - TypeScript compilation of all packages
- ✅ **Test** - Run test suites across all packages
- ✅ **Lint** - ESLint and Prettier checks
- 🔒 **Security Audit** - Dependency vulnerability scanning (non-blocking)

See [`.github/workflows/ci.yml`](.github/workflows/ci.yml) for the full pipeline.

---

## Documentation

- **[ADRs](docs/adr/)** - Architectural Decision Records documenting major design choices
- **[Governance](docs/governance/)** - Team policies, branch protections, and workflows
- **[Journal](docs/journal/)** - Implementation journals tracking development progress
- **[Security](security/)** - Security policies and audit procedures

---

## Contributing

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes following the code style (ESLint + Prettier)
4. Add tests for new functionality
5. Create a changeset: `pnpm changeset`
6. Push your branch and create a pull request
7. Ensure CI passes and request review from CODEOWNERS

See [CODEOWNERS](.github/CODEOWNERS) for package ownership.

---

## Versioning

We use [Changesets](https://github.com/changesets/changesets) for version management:

- **Major** - Breaking changes (e.g., 1.0.0 → 2.0.0)
- **Minor** - New features, backwards-compatible (e.g., 1.0.0 → 1.1.0)
- **Patch** - Bug fixes (e.g., 1.0.0 → 1.0.1)

Run `pnpm changeset` when making changes to automatically track version bumps.

---

## License

UNLICENSED - Internal use only

---

## Support

For questions or issues:

- **GitHub Issues:** [tjr-suite/issues](https://github.com/Nice-Wolf-Studio/tjr-suite/issues)
- **Team:** @Nice-Wolf-Studio/maintainers

---

**Built with ❤️ by Nice Wolf Studio**
