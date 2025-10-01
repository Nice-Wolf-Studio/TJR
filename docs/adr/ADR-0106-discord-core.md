# ADR-0106: Discord Bot Core (Schema + Registrar, Fixture-Only)

**Status:** Accepted
**Date:** 2025-09-30
**Scope:** packages/discord-bot-core

## Decision
Introduce a minimal, fixture-only Discord core with:
- Command schema types and manifest generator.
- Idempotent registrar CLI that diffs local vs deployed JSON manifests and exits with deterministic codes.

No live API calls in this shard. Future shard will add API integration.

## Exit Codes
- 0: In sync (no changes needed)
- 1: Differences found (apply needed)
- 2: Fatal error (invalid input)

