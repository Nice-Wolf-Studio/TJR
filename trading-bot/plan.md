# TJR Bot Current Focus

The detailed spec for the Daily Bias and Day Profile work now lives at `docs/design/daily-bias-and-profile.md`. Treat that document as the source of truth for requirements, command contracts, and acceptance criteria while we refactor.

Immediate priorities:
1. Stand up the historical market data provider shim (Alpha Vantage + Yahoo Finance; Polygon third).
2. Implement deterministic `/bias` and `/profile` pipelines against the design spec, including tests/fixtures.
3. Prune legacy bias/liquidity modules once the new flow is in place.

Keep the doc and this tracker in sync as the implementation evolves.
