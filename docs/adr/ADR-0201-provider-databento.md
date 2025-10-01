# ADR-0201: Databento Provider (Primary Futures Data)

**Status:** Accepted
**Date:** 2025-09-30
**Scope:** packages/databento

## Context
- Primary live provider is Databento for CME futures (ES, NQ).
- API returns CSV with prices in 1e9 units and ns timestamps.
- We need typed adapters returning simple bar/quote structures compatible with analysis-kit.

## Decision
- Create `@tjr/databento` with:
  - `DatabentoClient` (HTTP, retries, timeouts, CSV parsing, unit conversion).
  - `PriceProvider.getCurrentPrice(symbol)` via `mbp-1` best bid/ask mid.
  - `BarProvider.getRecentBars(symbol, timeframe, count)` using `ohlcv-1m` or `ohlcv-1h`; resample H4 locally.
- Symbols map to continuous contracts: ES → `ES.c.0`, NQ → `NQ.c.0`.
- Env var: `DATABENTO_API_KEY` (must start with `db-`), Basic Auth header.

## Consequences
- Deterministic, typed access to live bars/prices.
- Reusable by a gated live test and future app wiring.

## Acceptance Criteria
- CSV parsing tests (fixtures) pass.
- Live tests gated behind `ALLOW_LIVE_TESTS=1` pass locally with valid key.

## Changelog
- 2025-09-30: Initial version.

