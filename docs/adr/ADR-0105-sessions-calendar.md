# ADR-0105: Sessions Calendar (Futures Sessions UTC)

**Status:** Accepted
**Date:** 2025-09-30
**Scope:** packages/sessions-calendar

## Context
- Analysis requires deterministic trading session windows.
- For futures (CME), we adopt three UTC sessions used in strategy docs.

## Decision
- Implement a small pure package providing UTC session boundaries for a given date and helper to compute the active session for a timestamp.
- Sessions (UTC): Asian 23:00–08:00, London 08:00–13:00, NY 13:00–23:00.
- No external timezone lib initially; deterministic UTC windows suffice.

## Consequences
- Simple, reproducible windows for analysis-kit usage.

## Acceptance Criteria
- Unit tests pass for boundaries and active-session detection.

## Changelog
- 2025-09-30: Initial version.

