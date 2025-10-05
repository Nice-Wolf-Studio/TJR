# Session Levels Engine - Migration Dependencies

This document tracks the dependencies required to complete the migration of the Session Levels Engine from GladOSv2 to tjr-suite.

## Migration Status

**Current File:** `/Users/jeremymiranda/Dev/TJR Project/6/tjr-suite/packages/strategy/src/session-levels.ts`

**Status:** ✅ Core logic migrated, ⚠️ Dependencies pending

## Required Type Definitions (for @tjr/contracts)

The following types from `GladOSv2/src/strategy/types.ts` need to be added to `@tjr/contracts`:

### 1. Session-Related Types

```typescript
// Session name enumeration
export type SessionName = "ASIA" | "LONDON" | "NY";

// Session boundary with absolute timestamps
export interface SessionBoundary {
  name: SessionName;
  start: Date;
  end: Date;
}

// Session window configuration (relative times)
export interface SessionWindow {
  name: SessionName;
  start: string;  // HH:mm format
  end: string;    // HH:mm format
  timezone: string;
}

// Symbol-specific session configuration
export interface SymbolSessionsConfig {
  symbol: string;
  windows: SessionWindow[];
}

// Session levels output
export interface SessionLevels {
  symbol: string;
  date: string;
  session: SessionName;
  high: number;
  low: number;
  highTime: Date;
  lowTime: Date;
}

// Complete session snapshot
export interface SessionLevelsSnapshot {
  symbol: string;
  boundaries: SessionBoundary[];
  levels: SessionLevels[];
}
```

**Recommendation:** Add these types to a new file `@tjr/contracts/src/sessions.ts` and export from the main index.

## Required Utility Functions (for separate migration)

The following utilities from `GladOSv2/src/services/time/sessions.ts` need to be migrated:

### 1. materializeSessionBoundaries()

**Source:** `GladOSv2/src/services/time/sessions.ts` lines 491-559

**Signature:**
```typescript
function materializeSessionBoundaries(
  dateLocal: string,
  symbol: string,
  cfg: SymbolSessionsConfig
): SessionBoundary[];
```

**Purpose:** Converts relative session window configurations into absolute session boundaries with timezone-aware Date objects for a specific trading date.

**Dependencies:**
- `getExchangeTimezone()` - Symbol to timezone mapping
- `parseTimeString()` - Parse HH:mm time strings
- `createTimezoneAwareDate()` - Create timezone-aware dates handling DST

### 2. isWithin()

**Source:** `GladOSv2/src/services/time/sessions.ts` lines 678-694

**Signature:**
```typescript
function isWithin(boundary: SessionBoundary, t: Date): boolean;
```

**Purpose:** Checks if a timestamp falls within a session boundary (inclusive start, exclusive end).

**Dependencies:** None

### 3. Supporting Utilities

Additional helper functions from the same file:

- `getExchangeTimezone()` - Symbol to timezone mapping (lines 402-455)
- `parseTimeString()` - Time string parser (lines 564-584)
- `createTimezoneAwareDate()` - Timezone-aware date creation (lines 590-609)
- `getTimezoneOffset()` - Timezone offset calculation (lines 615-653)

**Recommendation:** Create a new package `@tjr/time-utils` or add to existing `@tjr/analysis-kit` as a `session-utils.ts` module.

## Migration Priority

1. **High Priority** - Required for Session Levels Engine to work:
   - [ ] Add session types to `@tjr/contracts`
   - [ ] Port `materializeSessionBoundaries()` utility
   - [ ] Port `isWithin()` utility

2. **Medium Priority** - Supporting utilities:
   - [ ] Port `getExchangeTimezone()` with SYMBOL_TIMEZONE_MAP
   - [ ] Port timezone helper functions

3. **Low Priority** - Optional enhancements:
   - [ ] Port `clampToBoundary()` utility (lines 733-758)
   - [ ] Port `SessionService` class if needed for broader session management

## Integration Notes

### Current Workaround

The migrated file currently has:
- Local type definitions (duplicated from GladOSv2)
- Placeholder `declare function` statements for missing utilities
- These will cause **TypeScript compilation errors** until dependencies are resolved

### Next Steps

1. **Create session types in @tjr/contracts**
   - Add `src/sessions.ts` file
   - Export from `src/index.ts`
   - Update imports in `session-levels.ts`

2. **Create time utilities module**
   - Decision needed: New package `@tjr/time-utils` vs. add to existing package
   - Port session boundary materialization logic
   - Port timezone utilities

3. **Update session-levels.ts**
   - Replace local type definitions with `@tjr/contracts` imports
   - Replace placeholder declarations with actual utility imports
   - Ensure all tests pass

## Testing Requirements

Once dependencies are resolved:

1. Unit tests for `SessionLevelsEngine`:
   - Test session boundary calculation
   - Test bar processing and level updates
   - Test edge cases (midnight crossing, overlaps, out-of-order bars)

2. Integration tests:
   - Test with real market data
   - Verify timezone handling across DST transitions
   - Test multiple symbols (ES, NQ, etc.)

## Source Files Reference

- **Original Session Levels Engine:** `/Users/jeremymiranda/Dev/Wolf Agent Project/11/gladosv2/src/strategy/levels/session-levels.ts`
- **Original Types:** `/Users/jeremymiranda/Dev/Wolf Agent Project/11/gladosv2/src/strategy/types.ts`
- **Original Time Utilities:** `/Users/jeremymiranda/Dev/Wolf Agent Project/11/gladosv2/src/services/time/sessions.ts`
- **Migrated Engine:** `/Users/jeremymiranda/Dev/TJR Project/6/tjr-suite/packages/strategy/src/session-levels.ts`

## Attribution

All migrated code originates from:
- **Source Repository:** GladOSv2
- **Commit:** dee236c1e762db08cf7d6f34885eb4779f73600c
- **Date:** 2025-09-22
- **Original Author:** Nice Wolf Studio
