# ADR-0101: Logger and Global Error Handling

**Status:** Accepted
**Date:** 2025-09-30
**Scope:** packages/logger, cross-cutting concerns

## Context

We need a small, dependency-light logging utility with:
- Structured JSON logs for automation and observability.
- Redaction of sensitive keys.
- Process-level global error/rejection handlers.
- Zero I/O dependencies beyond console; portable across packages.

## Decision

Create `@tjr/logger` exposing:
- `createLogger(opts)` -> `{ info, warn, error, debug, child }` with context bindings.
- `attachGlobalHandlers(logger)` to capture `uncaughtException` and `unhandledRejection`.
- Redaction of keys in a configurable list (default: `['password','token','apikey','secret']`).

### Constraints
- No external runtime deps; keep output stable and machine-friendly.
- Timestamps in ISO 8601 UTC.
- Level field required; message optional; arbitrary metadata allowed.

## Alternatives Considered
- Winston/Pino: powerful but unnecessary for bootstrap; adds heavy deps.

## Consequences
- Simple, consistent logs across all packages.
- Easy future swap if we later adopt a fuller logging stack.

## Acceptance Criteria
- Unit tests pass (timestamp shape, redaction, global handlers).
- Console output is single-line JSON per entry.

## Changelog
- 2025-09-30: Initial version.

