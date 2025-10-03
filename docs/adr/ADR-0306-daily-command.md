# ADR-0306: Daily Command Architecture

**Status:** Accepted
**Date:** 2025-01-30
**Author:** TJR Development Team

## Context

The TJR trading system requires a production-ready `/daily` command that provides comprehensive market analysis with high reliability. The command needs to handle multiple data sources, implement intelligent caching, format output deterministically, and gracefully handle failures.

## Decision

We will enhance the existing daily command implementation with:

1. **Composite Provider Pattern**: Multi-provider fallback chain with timeout handling
2. **Intelligent Caching**: TTL-based caching with different strategies for historical vs real-time data
3. **Modular Formatting**: Separate formatter module supporting multiple output formats
4. **Resilient Error Handling**: Graceful degradation with partial results support
5. **Comprehensive Testing**: Fixture-based E2E tests with provider simulation

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────┐
│                  /daily Command                  │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐ │
│  │  Cache   │───▶│Composite │───▶│Formatter │ │
│  │  Check   │    │ Provider │    │  Module  │ │
│  └──────────┘    └──────────┘    └──────────┘ │
│                        │                        │
│                  ┌─────┴──────┐                 │
│           ┌──────▼─────┐ ┌────▼──────┐         │
│           │  Primary   │ │Secondary  │         │
│           │  Provider  │ │ Provider  │         │
│           └────────────┘ └───────────┘         │
│                    │           │                │
│                    └─────┬─────┘                │
│                    ┌─────▼─────┐                │
│                    │  Fixture  │                │
│                    │  Provider │                │
│                    └───────────┘                │
└─────────────────────────────────────────────────┘
```

### Data Flow

1. **Request Processing**
   - Parse command arguments and options
   - Build deterministic cache key
   - Validate input parameters

2. **Cache Layer**
   - Check for cached results first
   - Use different TTLs for historical vs real-time data
   - Cache successful analysis results

3. **Provider Chain**
   - Primary provider with timeout protection
   - Automatic fallback to secondary provider
   - Final fallback to fixture data for resilience
   - Each provider has individual timeout configuration

4. **Analysis Processing**
   - Leverage existing analysis-kit functions
   - Handle partial data gracefully
   - Generate comprehensive market bias and profile

5. **Output Formatting**
   - Support multiple formats (text, json, table, markdown)
   - Deterministic output for testing
   - Handle missing data fields gracefully

### Configuration Schema

```typescript
interface DailyCommandConfig {
  providers: {
    primary: {
      type: 'polygon' | 'alpaca' | 'yahoo';
      timeout: number; // milliseconds
      apiKey?: string;
    };
    secondary: {
      type: 'polygon' | 'alpaca' | 'yahoo';
      timeout: number;
      apiKey?: string;
    };
    fallback: {
      type: 'fixture';
      enabled: boolean;
    };
  };

  cache: {
    enabled: boolean;
    ttl: {
      historical: number; // milliseconds
      realtime: number; // milliseconds
    };
    keyPrefix: string;
  };

  formatting: {
    defaultFormat: 'text' | 'json' | 'table' | 'markdown';
    includeMetadata: boolean;
    verbose: boolean;
  };

  errorHandling: {
    retryAttempts: number;
    retryDelayMs: number;
    partialResultsAllowed: boolean;
    logLevel: string;
  };
}
```

### Error Handling Strategy

```typescript
enum ProviderErrorType {
  TIMEOUT = 'TIMEOUT', // Provider exceeded timeout
  RATE_LIMIT = 'RATE_LIMIT', // API rate limit hit
  AUTH_FAILED = 'AUTH_FAILED', // Authentication failure
  INVALID_SYMBOL = 'INVALID_SYMBOL', // Symbol not found
  NO_DATA = 'NO_DATA', // No data for date range
  NETWORK = 'NETWORK', // Network connectivity
  UNKNOWN = 'UNKNOWN', // Unclassified error
}

// Error resolution strategies
interface ErrorResolution {
  action: 'FALLBACK' | 'RETRY' | 'DELAY_RETRY' | 'PARTIAL_RESULT' | 'FAIL';
  retryable: boolean;
  delayMs?: number;
  message: string;
}
```

### Cache Key Strategy

Cache keys are deterministic and include:

- Symbol
- Date (normalized to day boundary)
- Timeframe
- Analysis version

Example: `daily:SPY:2025-01-30:5m:v1`

### Output Format Examples

#### Text Format (Default)

```
Daily Analysis: SPY - 2025-01-30
==================================================

Market Bias:
  Direction: BULLISH
  Confidence: 75%
  Reason: Higher highs and higher lows pattern

Day Profile:
  Type: TREND_UP
  Characteristics:
    - Strong opening drive
    - Sustained buying pressure
    - Late day continuation

Session Extremes:
  Morning:
    High: 425.50
    Low: 423.20
    Range: 2.30

  Afternoon:
    High: 426.80
    Low: 425.00
    Range: 1.80

Statistics:
  Bars Analyzed: 78
  Day High: 426.80
  Day Low: 423.20
  Close: 426.45
```

#### Markdown Format

```markdown
# Daily Analysis Report

## SPY - 2025-01-30

### Market Bias

- **Direction**: BULLISH
- **Confidence**: 75%
- **Reason**: Higher highs and higher lows pattern

### Session Analysis

| Session   | High   | Low    | Range |
| --------- | ------ | ------ | ----- |
| Morning   | 425.50 | 423.20 | 2.30  |
| Afternoon | 426.80 | 425.00 | 1.80  |
```

## Implementation Path

### Phase 1: Composite Provider (Week 1)

- [ ] Implement CompositeProvider class
- [ ] Add timeout wrapper functionality
- [ ] Create provider chain configuration
- [ ] Unit tests for fallback logic

### Phase 2: Enhanced Cache Integration (Week 1)

- [ ] Modify daily command for cache-first approach
- [ ] Implement TTL strategies
- [ ] Add cache key generation
- [ ] Integration tests with cache

### Phase 3: Formatter Module (Week 2)

- [ ] Create DailyFormatter class
- [ ] Implement format handlers (text, json, table, markdown)
- [ ] Add template system
- [ ] Unit tests for each format

### Phase 4: Error Handling (Week 2)

- [ ] Implement error classification
- [ ] Add retry logic with backoff
- [ ] Create partial result handling
- [ ] Comprehensive error scenarios tests

### Phase 5: E2E Testing (Week 3)

- [ ] Fixture-based E2E tests
- [ ] Provider timeout simulation
- [ ] Fallback scenario testing
- [ ] Format output validation

## Testing Strategy

### Unit Tests

- Provider timeout handling
- Cache hit/miss scenarios
- Format output determinism
- Error classification

### Integration Tests

- Provider chain fallback
- Cache integration
- Analysis pipeline
- Configuration loading

### E2E Tests

- Full command execution with fixtures
- Provider failure scenarios
- Multiple format outputs
- Performance benchmarks

## Monitoring and Observability

### Metrics to Track

- Provider success/failure rates
- Cache hit ratio
- Command execution time
- Error frequency by type

### Logging Strategy

- DEBUG: Provider selection, cache operations
- INFO: Command execution, analysis results
- WARN: Provider failures, fallbacks used
- ERROR: Unrecoverable failures, missing configuration

## Security Considerations

- API keys stored in environment variables
- Cache data encrypted at rest (future)
- No sensitive data in logs
- Rate limiting awareness

## Consequences

### Positive

- High reliability through fallback chain
- Improved performance via caching
- Consistent output formatting
- Better error visibility
- Production-ready resilience

### Negative

- Increased complexity
- Multiple provider configurations needed
- Cache invalidation complexity
- More comprehensive testing required

### Mitigations

- Clear documentation
- Sensible defaults
- Monitoring and alerting
- Gradual rollout strategy

## References

- [ADR-0055: Market Data Core](./ADR-0055-market-data-core.md)
- [ADR-0059: Analysis Kit](./ADR-0059-analysis-kit.md)
- [ADR-0206: Discord Core](./ADR-0206-discord-core.md)
- [Analysis Kit Documentation](../../packages/analysis-kit/README.md)
- [Provider Service Patterns](../../packages/app/src/services/providers/README.md)

## Decision Record

- **Decided By**: Architecture Team
- **Reviewed By**: TJR Development Team
- **Approval Date**: 2025-01-30
- **Implementation Target**: Phase 3, Sprint 2
