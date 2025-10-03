# ADR-0102: Market Data Core Utilities

**Status:** Accepted
**Date:** 2025-09-30
**Scope:** packages/market-data-core

## Decision

Provide pure utilities for:

- Timeframe conversions (e.g., '1m'|'5m'|'1h'|'4h').
- Aggregation of lower timeframes to higher (e.g., 1m→1h/4h).
- Clipping bar arrays to a time window.

## Acceptance

- Unit tests for aggregation and clipping pass.
