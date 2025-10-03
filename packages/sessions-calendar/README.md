# @tjr/sessions-calendar

Pure-function trading session calendar with holiday and DST awareness.

## Overview

`@tjr/sessions-calendar` provides deterministic, zero-I/O functions for working with trading sessions (RTH/ETH) across different symbols and exchanges. All functions are pure: same inputs always produce same outputs.

### Key Features

- ✅ **Holiday awareness** - Detects full closures and early closes
- ✅ **DST handling** - Correctly adjusts session times during daylight saving transitions
- ✅ **Zero I/O** - No network calls, file reads, or external dependencies at runtime
- ✅ **Deterministic** - Same inputs always produce same outputs (perfect for testing)
- ✅ **Type-safe** - Full TypeScript support with exported types
- ✅ **Symbol-specific** - Different symbols have different exchange hours

## Installation

```bash
pnpm add @tjr/sessions-calendar
```

## Usage

### Basic Example

```typescript
import { getSessions, isHoliday, rthWindow } from '@tjr/sessions-calendar';

// Check if a date is a holiday
const isChristmas = isHoliday(new Date('2025-12-25'), 'ES');
console.log(isChristmas); // true

// Get regular trading hours for a normal day
const window = rthWindow(new Date('2025-06-15'), 'ES');
console.log(window);
// { start: Date, end: Date }

// Get all sessions (RTH + ETH)
const sessions = getSessions(new Date('2025-06-15'), 'ES');
sessions.forEach((s) => {
  console.log(`${s.type}: ${s.start} to ${s.end}`);
});
// RTH: ...
// ETH_PRE: ...
// ETH_POST: ...
```

### API Reference

#### `isHoliday(date: Date, symbol: string): boolean`

Check if a date is a market holiday for the given symbol.

**Parameters:**

- `date` - Date to check (Date object)
- `symbol` - Trading symbol (e.g., "ES", "NQ")

**Returns:** `true` if the date is a holiday (full or early close), `false` otherwise

**Throws:** Error if symbol is unknown

```typescript
isHoliday(new Date('2025-07-04'), 'ES'); // true (Independence Day)
isHoliday(new Date('2025-06-15'), 'ES'); // false (regular Monday)
```

---

#### `rthWindow(date: Date, symbol: string): TimeWindow | null`

Get the regular trading hours (RTH) window for a date and symbol.

**Parameters:**

- `date` - Trading date
- `symbol` - Trading symbol (e.g., "ES", "NQ")

**Returns:** `{ start: Date, end: Date }` or `null` if market is closed

**Throws:** Error if symbol is unknown

```typescript
const window = rthWindow(new Date('2025-06-15'), 'ES');
// { start: Date (9:30 AM ET), end: Date (4:00 PM ET) }

const closedDay = rthWindow(new Date('2025-12-25'), 'ES');
// null (Christmas - market closed)
```

---

#### `getSessions(date: Date, symbol: string): Session[]`

Get all trading sessions (RTH and ETH) for a date and symbol.

**Parameters:**

- `date` - Trading date
- `symbol` - Trading symbol (e.g., "ES", "NQ")

**Returns:** Array of `Session` objects, or empty array if market is closed

**Throws:** Error if symbol is unknown

```typescript
const sessions = getSessions(new Date('2025-06-15'), 'ES');
// [
//   { type: 'RTH', start: Date, end: Date, exchange: 'CME' },
//   { type: 'ETH_PRE', start: Date, end: Date, exchange: 'CME' },
//   { type: 'ETH_POST', start: Date, end: Date, exchange: 'CME' }
// ]

const holiday = getSessions(new Date('2025-12-25'), 'ES');
// [] (Christmas - no sessions)
```

---

### Types

```typescript
interface Session {
  type: 'RTH' | 'ETH_PRE' | 'ETH_POST';
  start: Date; // UTC
  end: Date; // UTC
  exchange: string;
}

interface TimeWindow {
  start: Date; // UTC
  end: Date; // UTC
}
```

## Supported Symbols

### CME Group (Current Coverage)

- **ES** - E-mini S&P 500 Futures
- **NQ** - E-mini NASDAQ-100 Futures

**RTH:** 9:30 AM - 4:00 PM ET (CME equity index futures hours)
**ETH:** Pre-market (evening/overnight) and post-market sessions

## Holidays

The package includes CME holiday calendar data for 2025-2027:

### Full Closures

- New Year's Day
- Good Friday
- Memorial Day
- Independence Day
- Labor Day
- Thanksgiving Day
- Christmas Day

### Early Close Days

- Day After Thanksgiving (1:00 PM ET close)
- Christmas Eve (1:00 PM ET close, if not a full closure)

## DST Handling

Sessions automatically adjust for daylight saving time transitions using the IANA timezone database.

**DST Transitions (US):**

- **Spring forward** - Second Sunday in March at 2:00 AM (lose 1 hour)
- **Fall back** - First Sunday in November at 2:00 AM (gain 1 hour)

**Note:** RTH sessions (9:30 AM - 4:00 PM ET) are unaffected by DST transitions as they occur during stable hours.

## Known Limitations

This initial release has the following limitations:

1. **Limited symbol coverage** - Only CME ES and NQ futures; no NYSE, NASDAQ, Forex, or crypto
2. **Static calendar data** - Covers 2025-2027; requires package update for future years
3. **No real-time adjustments** - Cannot represent intraday schedule changes (e.g., emergency early close)
4. **Simplified timezone handling** - Uses hardcoded offset for Chicago timezone instead of full IANA timezone library
5. **No regional exchanges** - No support for LSE, TSE, HKEx, or other international exchanges

These limitations are acceptable for Phase 51 (initial implementation). Future shards will expand coverage and add dynamic data support.

## Data Validity

The embedded calendar data is valid from **2025-01-01** to **2027-12-31**.

Using dates outside this range will still return results but may not be accurate for future holidays or DST rules.

## Architecture

This package follows a pure-function, zero-I/O architecture:

- All calendar data is pre-packaged and loaded at module initialization
- No network calls, file system access, or environment variables at runtime
- Deterministic outputs (same inputs → same outputs)
- Perfect for testing and reproducible builds

See [ADR-0058](../../docs/adr/ADR-0058-sessions-calendar.md) for detailed architectural decisions.

## Testing

The package includes comprehensive matrix tests covering:

- Holiday detection (18 test cases)
- DST transitions (2025-2027)
- Cross-symbol consistency
- Determinism verification

Run tests:

```bash
pnpm test
```

## Development

```bash
# Build the package
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint

# Type check
pnpm typecheck

# Clean build artifacts
pnpm clean
```

## Contributing

Contributions are welcome! Please follow the TJR Suite contribution guidelines.

### Adding New Symbols

1. Update `src/data/cme-calendar.json` (or create new calendar file)
2. Add symbol session definitions with timezone and hours
3. Update this README with new symbol documentation
4. Add test cases for the new symbol

### Extending Calendar Data

1. Update `validTo` date in calendar JSON
2. Add holiday entries for new years
3. Update DST transitions array
4. Run tests to verify correctness

## License

UNLICENSED - Internal use only

## Support

For issues, questions, or feature requests, please contact the TJR Suite team.

---

**Phase:** 51 | **Shard:** C2 | **Status:** Accepted
**ADR:** [ADR-0058](../../docs/adr/ADR-0058-sessions-calendar.md)
