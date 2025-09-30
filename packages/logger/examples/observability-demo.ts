/**
 * Demonstration of TJR Suite observability features
 * Run with: npx tsx examples/observability-demo.ts
 */

import {
  createLogger,
  withRequestContext,
  startTimer,
  getRequestId,
} from '../src/index.js';

// Create logger with JSON output
const logger = createLogger({
  level: 'info',
  json: true,
});

/**
 * Simulate fetching market data from a provider
 */
async function fetchMarketData(symbol: string, timeframe: string): Promise<void> {
  const timer = startTimer();

  logger.info('Fetching bars', {
    symbol,
    timeframe,
    provider: 'yahoo',
    operation: 'fetch_bars',
  });

  // Simulate API call
  await new Promise((resolve) => setTimeout(resolve, 100));

  logger.info('Bars fetched', {
    symbol,
    timeframe,
    provider: 'yahoo',
    duration_ms: timer.stop(),
    count: 100,
    result: 'success',
  });
}

/**
 * Simulate cache lookup
 */
async function checkCache(symbol: string, timeframe: string): Promise<boolean> {
  const timer = startTimer();

  // Simulate cache miss
  const hit = Math.random() > 0.5;

  logger.info('Cache lookup', {
    symbol,
    timeframe,
    cache: hit ? 'hit' : 'miss',
    duration_ms: timer.stop(),
  });

  return hit;
}

/**
 * Process a trading signal
 */
async function processSignal(symbol: string): Promise<void> {
  const operationTimer = startTimer();

  logger.info('Processing signal', {
    symbol,
    operation: 'process_signal',
  });

  // Step 1: Check cache
  const cached = await checkCache(symbol, '5m');

  // Step 2: Fetch if not cached
  if (!cached) {
    await fetchMarketData(symbol, '5m');
  }

  // Step 3: Calculate (simulate)
  const calcTimer = startTimer();
  await new Promise((resolve) => setTimeout(resolve, 50));

  logger.info('Calculation complete', {
    symbol,
    operation: 'calculate_indicators',
    duration_ms: calcTimer.stop(),
    result: 'success',
  });

  logger.info('Signal processed', {
    symbol,
    operation: 'process_signal',
    duration_ms: operationTimer.stop(),
    result: 'success',
  });
}

/**
 * Main demo function
 */
async function main(): Promise<void> {
  console.log('='.repeat(80));
  console.log('TJR Suite Observability Demo');
  console.log('='.repeat(80));
  console.log('');
  console.log('Demonstrating:');
  console.log('  1. Request ID propagation through async operations');
  console.log('  2. Performance timing with duration_ms');
  console.log('  3. Standardized log fields (symbol, timeframe, provider, etc.)');
  console.log('  4. Structured JSON logging');
  console.log('');
  console.log('Watch for request_id in each log entry - it will be the same for');
  console.log('all operations within the same request context.');
  console.log('');
  console.log('='.repeat(80));
  console.log('');

  // Example 1: Single request context
  console.log('Example 1: Single Request Context');
  console.log('-'.repeat(80));

  await withRequestContext(async () => {
    const requestId = getRequestId();
    console.log(`Request ID: ${requestId}`);
    console.log('');

    await processSignal('SPY');
  });

  console.log('');
  console.log('='.repeat(80));
  console.log('');

  // Example 2: Concurrent requests with isolated contexts
  console.log('Example 2: Concurrent Requests (Note different request_ids)');
  console.log('-'.repeat(80));

  await Promise.all([
    withRequestContext(async () => {
      const requestId = getRequestId();
      console.log(`Request ID for AAPL: ${requestId}`);
      await processSignal('AAPL');
    }),
    withRequestContext(async () => {
      const requestId = getRequestId();
      console.log(`Request ID for MSFT: ${requestId}`);
      await processSignal('MSFT');
    }),
  ]);

  console.log('');
  console.log('='.repeat(80));
  console.log('');
  console.log('Demo Complete!');
  console.log('');
  console.log('Key Observations:');
  console.log('  - Each request has a unique request_id (UUID v4 format)');
  console.log('  - request_id is automatically propagated to all log entries');
  console.log('  - duration_ms shows performance of each operation');
  console.log('  - Standardized fields make logs machine-readable');
  console.log('  - JSON format enables log aggregation and analysis');
  console.log('');
}

// Run the demo
main().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});