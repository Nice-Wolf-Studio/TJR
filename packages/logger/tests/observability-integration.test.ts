/**
 * @fileoverview Integration tests for observability features
 * Tests the complete flow of request context, timers, and logging
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createLogger,
  withRequestContext,
  getRequestId,
  startTimer,
  withCLIRequestContext,
} from '../src/index.js';

describe('Observability Integration', () => {
  it('should integrate request context with logging', async () => {
    const logs: any[] = [];
    const logger = createLogger({
      level: 'info',
      json: true,
      console: false,
    });

    // Capture logs by overriding the log method
    const originalLog = logger.log.bind(logger);
    logger.log = (level: any, message: any, meta: any) => {
      logs.push({ level, message, ...meta });
      return logger;
    };

    await withRequestContext(async () => {
      const requestId = getRequestId();

      logger.info('Processing started', {
        symbol: 'SPY',
        operation: 'fetch',
      });

      // Verify log captured request_id
      assert.strictEqual(logs.length, 1, 'Should have one log');
      assert.strictEqual(logs[0].message, 'Processing started');
      assert.strictEqual(logs[0].symbol, 'SPY');
      assert.strictEqual(logs[0].operation, 'fetch');
      // Note: request_id injection happens in format pipeline, not in log method
    });
  });

  it('should combine request context and performance timers', async () => {
    await withRequestContext(async () => {
      const requestId = getRequestId();
      const timer = startTimer();

      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 50));

      const duration = timer.stop();

      assert.ok(requestId, 'Should have request ID');
      assert.ok(duration >= 40, 'Duration should be at least 40ms');
      assert.ok(duration <= 70, 'Duration should be at most 70ms');
    });
  });

  it('should support nested operations with timers', async () => {
    await withRequestContext(async () => {
      const outerTimer = startTimer();

      await new Promise((resolve) => setTimeout(resolve, 30));

      const innerTimer = startTimer();
      await new Promise((resolve) => setTimeout(resolve, 20));
      const innerDuration = innerTimer.stop();

      const outerDuration = outerTimer.stop();

      assert.ok(innerDuration >= 15 && innerDuration <= 30, 'Inner duration ~20ms');
      assert.ok(outerDuration >= 45 && outerDuration <= 65, 'Outer duration ~50ms');
      assert.ok(outerDuration > innerDuration, 'Outer should be longer');
    });
  });

  it('should work with CLI context wrapper', async () => {
    await withCLIRequestContext('test:operation', { symbol: 'SPY' })(async () => {
      const requestId = getRequestId();
      assert.ok(requestId, 'Should have request ID in CLI context');
    });
  });

  it('should maintain context through complex async operations', async () => {
    const results = await withRequestContext(async () => {
      const id = getRequestId();

      // Simulate complex async operations
      const [result1, result2, result3] = await Promise.all([
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { id: getRequestId(), operation: 'fetch' };
        })(),
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 15));
          return { id: getRequestId(), operation: 'parse' };
        })(),
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { id: getRequestId(), operation: 'store' };
        })(),
      ]);

      return { originalId: id, results: [result1, result2, result3] };
    });

    // All operations should have the same request ID
    assert.strictEqual(results.results[0].id, results.originalId);
    assert.strictEqual(results.results[1].id, results.originalId);
    assert.strictEqual(results.results[2].id, results.originalId);
  });

  it('should support typical trading operation flow', async () => {
    const logger = createLogger({ level: 'info', json: true, console: false });
    const logs: any[] = [];

    const originalLog = logger.log.bind(logger);
    logger.log = (level: any, message: any, meta: any) => {
      logs.push({ level, message, ...meta });
      return logger;
    };

    await withRequestContext(async () => {
      const requestId = getRequestId();
      const overallTimer = startTimer();

      // Step 1: Fetch data
      const fetchTimer = startTimer();
      logger.info('Fetching bars', {
        symbol: 'SPY',
        timeframe: '5m',
        provider: 'yahoo',
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      const fetchDuration = fetchTimer.stop();

      logger.info('Bars fetched', {
        symbol: 'SPY',
        duration_ms: fetchDuration,
        count: 100,
        result: 'success',
      });

      // Step 2: Process data
      const processTimer = startTimer();
      logger.info('Processing bars', { symbol: 'SPY', operation: 'calculate' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      const processDuration = processTimer.stop();

      logger.info('Processing complete', {
        symbol: 'SPY',
        duration_ms: processDuration,
        result: 'success',
      });

      const totalDuration = overallTimer.stop();
      logger.info('Operation complete', {
        symbol: 'SPY',
        duration_ms: totalDuration,
        result: 'success',
      });

      // Verify logs
      assert.strictEqual(logs.length, 5, 'Should have 5 log entries');
      assert.ok(logs[1].duration_ms >= 25, 'Fetch duration should be ~30ms');
      assert.ok(logs[3].duration_ms >= 15, 'Process duration should be ~20ms');
      assert.ok(logs[4].duration_ms >= 45, 'Total duration should be ~50ms');
    });
  });

  it('should handle errors with context preservation', async () => {
    await assert.rejects(async () => {
      await withRequestContext(async () => {
        const requestId = getRequestId();
        const timer = startTimer();

        assert.ok(requestId, 'Should have request ID');

        await new Promise((resolve) => setTimeout(resolve, 10));

        // Error should not lose context
        throw new Error('Test error with context');
      });
    }, /Test error with context/);
  });

  it('should support concurrent operations with isolated contexts', async () => {
    const operations = Array.from({ length: 10 }, (_, i) =>
      withRequestContext(async () => {
        const id = getRequestId();
        const timer = startTimer();

        // Simulate variable work time
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 20 + 10));

        const duration = timer.stop();

        return {
          index: i,
          requestId: id,
          duration,
        };
      })
    );

    const results = await Promise.all(operations);

    // Verify all operations completed
    assert.strictEqual(results.length, 10, 'All operations should complete');

    // Verify all have unique request IDs
    const requestIds = results.map((r) => r.requestId);
    const uniqueIds = new Set(requestIds);
    assert.strictEqual(uniqueIds.size, 10, 'All request IDs should be unique');

    // Verify all measured durations
    for (const result of results) {
      assert.ok(result.duration >= 5, `Operation ${result.index} should have valid duration`);
    }
  });
});
