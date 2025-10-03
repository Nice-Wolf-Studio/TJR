# Log Fields Reference

Standardized log field definitions for TJR Suite observability.

## Overview

All packages in the TJR Suite should use standardized log fields to enable consistent observability across the system. This document defines required and recommended fields for different types of operations.

## Core Fields

These fields should be included in all log entries where applicable:

### `request_id` (string)

- **Required**: For all user-facing operations and API requests
- **Format**: UUID v4 (e.g., `550e8400-e29b-41d4-a716-446655440000`)
- **Purpose**: Correlation across distributed operations
- **Auto-injected**: Yes, via AsyncLocalStorage when using `withRequestContext()`

```typescript
logger.info('Processing request', {
  request_id: '550e8400-e29b-41d4-a716-446655440000',
});
```

### `symbol` (string)

- **Required**: For all trading/market data operations
- **Format**: Uppercase ticker symbol (e.g., `SPY`, `AAPL`, `BTCUSD`)
- **Purpose**: Identify which asset the operation relates to

```typescript
logger.info('Fetching bars', {
  symbol: 'SPY',
  timeframe: '5m',
});
```

### `timeframe` (string)

- **Required**: For all time-series data operations
- **Format**: Standard timeframe notation (e.g., `1m`, `5m`, `1h`, `1d`)
- **Purpose**: Identify the data resolution

```typescript
logger.info('Cache lookup', {
  symbol: 'SPY',
  timeframe: '5m',
  cache: 'hit',
});
```

### `provider` (string)

- **Required**: For all external data provider operations
- **Format**: Lowercase provider name (e.g., `yahoo`, `polygon`, `alphavantage`, `databento`)
- **Purpose**: Identify which data source was used

```typescript
logger.info('Fetching data', {
  provider: 'yahoo',
  symbol: 'SPY',
});
```

### `duration_ms` (number)

- **Required**: For all timed operations
- **Format**: Integer milliseconds
- **Purpose**: Performance monitoring and SLA tracking
- **How to measure**: Use `startTimer()` utility

```typescript
const timer = startTimer();
// ... do work ...
const duration_ms = timer.stop();

logger.info('Operation complete', {
  duration_ms,
  result: 'success',
});
```

### `asOf` (string)

- **Required**: For all data operations
- **Format**: ISO 8601 timestamp (e.g., `2025-09-30T12:34:56.789Z`)
- **Purpose**: Identify the effective date/time of the data

```typescript
logger.info('Data fetched', {
  asOf: '2025-09-30T12:34:56.789Z',
  symbol: 'SPY',
  count: 100,
});
```

### `result` (string)

- **Required**: For all operations that can succeed or fail
- **Format**: One of `success`, `error`, `partial`, `timeout`
- **Purpose**: Quick filtering of operation outcomes

```typescript
logger.info('Operation complete', {
  result: 'success',
  duration_ms: 123,
});

logger.error('Operation failed', {
  result: 'error',
  error_code: 'RATE_LIMIT_EXCEEDED',
});
```

## Optional Fields

### `operation` (string)

- **Format**: snake_case operation name (e.g., `fetch_bars`, `calculate_indicators`)
- **Purpose**: Identify the type of operation being performed

```typescript
logger.info('Starting operation', {
  operation: 'fetch_bars',
  symbol: 'SPY',
});
```

### `component` (string)

- **Format**: Component/module name (e.g., `bars-cache`, `provider-yahoo`, `discord-bot`)
- **Purpose**: Identify which system component generated the log
- **Best practice**: Use with child loggers

```typescript
const cacheLogger = logger.child({ component: 'bars-cache' });
cacheLogger.info('Cache initialized');
```

### `error_code` (string)

- **Format**: UPPER_SNAKE_CASE error code (e.g., `RATE_LIMIT_EXCEEDED`, `INVALID_SYMBOL`)
- **Purpose**: Machine-readable error classification
- **Required when**: `result` is `error`

```typescript
logger.error('Request failed', {
  result: 'error',
  error_code: 'RATE_LIMIT_EXCEEDED',
  provider: 'yahoo',
});
```

### `count` (number)

- **Format**: Integer count
- **Purpose**: Number of items processed, fetched, cached, etc.

```typescript
logger.info('Bars cached', {
  symbol: 'SPY',
  count: 100,
  cache: 'miss',
});
```

### `cache` (string)

- **Format**: One of `hit`, `miss`
- **Purpose**: Track cache effectiveness

```typescript
logger.info('Cache lookup', {
  symbol: 'SPY',
  cache: 'hit',
  duration_ms: 5,
});
```

## Usage Examples

### Market Data Fetch Operation

```typescript
import { withRequestContext, startTimer, logger } from '@tjr/logger';

await withRequestContext(async () => {
  const timer = startTimer();

  logger.info('Fetching bars', {
    symbol: 'SPY',
    timeframe: '5m',
    provider: 'yahoo',
    operation: 'fetch_bars',
  });

  try {
    const bars = await fetchBars('SPY', '5m');

    logger.info('Bars fetched', {
      symbol: 'SPY',
      timeframe: '5m',
      provider: 'yahoo',
      duration_ms: timer.stop(),
      count: bars.length,
      result: 'success',
    });
  } catch (error) {
    logger.error('Fetch failed', {
      symbol: 'SPY',
      timeframe: '5m',
      provider: 'yahoo',
      duration_ms: timer.stop(),
      result: 'error',
      error_code: 'PROVIDER_ERROR',
    });
  }
});
```

### Cache Operation

```typescript
import { startTimer, logger } from '@tjr/logger';

const timer = startTimer();
const cached = cache.get('SPY:5m');

if (cached) {
  logger.info('Cache hit', {
    symbol: 'SPY',
    timeframe: '5m',
    cache: 'hit',
    duration_ms: timer.stop(),
    count: cached.length,
  });
} else {
  logger.info('Cache miss', {
    symbol: 'SPY',
    timeframe: '5m',
    cache: 'miss',
    duration_ms: timer.stop(),
  });
}
```

### Discord Command

```typescript
import { withDiscordRequestContext, startTimer, logger } from '@tjr/logger';

export const execute = withDiscordRequestContext(async (interaction) => {
  const timer = startTimer();

  logger.info('Processing command', {
    operation: 'discord_chart',
    symbol: interaction.options.getString('symbol'),
  });

  // ... process command ...

  logger.info('Command complete', {
    operation: 'discord_chart',
    duration_ms: timer.stop(),
    result: 'success',
  });
});
```

## Anti-Patterns

### ❌ DO NOT Log PII

Never log personally identifiable information:

```typescript
// ❌ BAD
logger.info('User action', {
  email: 'user@example.com',
  ip_address: '192.168.1.1',
  api_key: 'sk_live_abcdef123456',
});

// ✅ GOOD
logger.info('User action', {
  user_id: 'hashed_user_id',
  action: 'chart_generated',
});
```

### ❌ DO NOT Log Sensitive Credentials

```typescript
// ❌ BAD
logger.debug('API call', {
  url: 'https://api.example.com',
  api_key: process.env.API_KEY,
});

// ✅ GOOD
logger.debug('API call', {
  url: 'https://api.example.com',
  provider: 'yahoo',
});
```

### ❌ DO NOT Use Inconsistent Field Names

```typescript
// ❌ BAD - mixing naming conventions
logger.info('Data fetched', {
  Symbol: 'SPY', // Wrong: should be lowercase
  time_frame: '5m', // Wrong: inconsistent with 'timeframe'
  durationMs: 123, // Wrong: inconsistent with 'duration_ms'
  Count: 100, // Wrong: should be lowercase
});

// ✅ GOOD
logger.info('Data fetched', {
  symbol: 'SPY',
  timeframe: '5m',
  duration_ms: 123,
  count: 100,
});
```

### ❌ DO NOT Log Without Context

```typescript
// ❌ BAD
logger.info('Request failed');

// ✅ GOOD
logger.error('Request failed', {
  symbol: 'SPY',
  provider: 'yahoo',
  error_code: 'RATE_LIMIT_EXCEEDED',
  result: 'error',
});
```

## Validation

Use the built-in validation utilities to ensure log fields are correct:

```typescript
import { validateLogFields, validateRequiredFields } from '@tjr/logger';

// Validate for PII
const fields = { symbol: 'SPY', email: 'user@example.com' };
const validation = validateLogFields(fields);
if (!validation.isValid) {
  console.warn('Log validation warnings:', validation.warnings);
}

// Validate required fields
const result = validateRequiredFields({ symbol: 'SPY' }, ['symbol', 'timeframe', 'provider']);
if (!result.isValid) {
  console.error('Missing required fields:', result.missing);
}
```

## Field Taxonomy Summary

| Field         | Required When            | Format            | Example                                |
| ------------- | ------------------------ | ----------------- | -------------------------------------- |
| `request_id`  | User-facing operations   | UUID v4           | `550e8400-e29b-41d4-a716-446655440000` |
| `symbol`      | Trading operations       | Uppercase ticker  | `SPY`                                  |
| `timeframe`   | Time-series data         | Standard notation | `5m`                                   |
| `provider`    | External data            | Lowercase name    | `yahoo`                                |
| `duration_ms` | Timed operations         | Integer ms        | `123`                                  |
| `asOf`        | Data operations          | ISO 8601          | `2025-09-30T12:34:56.789Z`             |
| `result`      | Outcome tracking         | Enum              | `success`, `error`, `partial`          |
| `operation`   | Operation identification | snake_case        | `fetch_bars`                           |
| `component`   | Component logs           | kebab-case        | `bars-cache`                           |
| `error_code`  | Error cases              | UPPER_SNAKE_CASE  | `RATE_LIMIT_EXCEEDED`                  |
| `count`       | Item counting            | Integer           | `100`                                  |
| `cache`       | Cache operations         | Enum              | `hit`, `miss`                          |

## Migration Checklist

When updating existing code to use standardized log fields:

- [ ] Add `request_id` to user-facing operations using `withRequestContext()`
- [ ] Add `duration_ms` to timed operations using `startTimer()`
- [ ] Ensure `symbol` is always uppercase
- [ ] Ensure `provider` is always lowercase
- [ ] Add `result` field to operation outcomes
- [ ] Use `asOf` for data timestamps
- [ ] Remove any PII from log statements
- [ ] Validate field names match this taxonomy
- [ ] Use child loggers for `component` context
- [ ] Add tests to verify log field consistency
