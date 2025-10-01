# ADR-0103: Symbol Registry

**Status:** Accepted
**Date:** 2025-09-30
**Scope:** packages/symbol-registry

## Decision
Provide a tiny registry for futures symbols:
- Canonical base symbols: 'ES', 'NQ'.
- Mapping to provider-specific forms, e.g., Databento continuous (ES.c.0, NQ.c.0).
- Normalization for common aliases (ES1!, NQ1!).

