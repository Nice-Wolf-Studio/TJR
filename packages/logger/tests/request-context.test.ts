/**
 * @fileoverview Tests for request context management with AsyncLocalStorage
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  generateRequestId,
  getRequestContext,
  getRequestId,
  withRequestContext,
  withRequestContextSync,
  setRequestContext,
} from '../src/request-context.js';

describe('Request Context', () => {
  it('should generate unique request IDs', () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();

    assert.ok(id1, 'ID should be generated');
    assert.ok(id2, 'ID should be generated');
    assert.notStrictEqual(id1, id2, 'IDs should be unique');

    // Validate UUID v4 format
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    assert.ok(uuidPattern.test(id1), 'Should be valid UUID v4');
    assert.ok(uuidPattern.test(id2), 'Should be valid UUID v4');
  });

  it('should return undefined when not in request context', () => {
    const context = getRequestContext();
    const requestId = getRequestId();

    assert.strictEqual(context, undefined);
    assert.strictEqual(requestId, undefined);
  });

  it('should propagate request_id through async calls', async () => {
    await withRequestContext(async () => {
      const id1 = getRequestId();
      assert.ok(id1, 'Request ID should be available');

      // Nested async operation
      await new Promise((resolve) => {
        setTimeout(() => {
          const id2 = getRequestId();
          assert.strictEqual(id2, id1, 'Request ID should be same in nested async');
          resolve(undefined);
        }, 10);
      });

      const id3 = getRequestId();
      assert.strictEqual(id3, id1, 'Request ID should persist after async operation');
    });
  });

  it('should isolate contexts between requests', async () => {
    const context1Promise = withRequestContext(async () => {
      const id = getRequestId();
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { id, check: getRequestId() };
    });

    const context2Promise = withRequestContext(async () => {
      const id = getRequestId();
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { id, check: getRequestId() };
    });

    const [result1, result2] = await Promise.all([context1Promise, context2Promise]);

    assert.ok(result1.id, 'Context 1 should have ID');
    assert.ok(result2.id, 'Context 2 should have ID');
    assert.notStrictEqual(result1.id, result2.id, 'Contexts should have different IDs');
    assert.strictEqual(result1.id, result1.check, 'Context 1 ID should persist');
    assert.strictEqual(result2.id, result2.check, 'Context 2 ID should persist');
  });

  it('should accept custom request ID', async () => {
    const customId = 'custom-request-123';

    await withRequestContext(async () => {
      const id = getRequestId();
      assert.strictEqual(id, customId, 'Should use custom request ID');
    }, customId);
  });

  it('should support additional context fields', async () => {
    await withRequestContext(
      async () => {
        const context = getRequestContext();
        assert.ok(context, 'Context should exist');
        assert.ok(context.request_id, 'Should have request_id');
        assert.strictEqual(context.userId, '123', 'Should have custom field');
        assert.strictEqual(context.operation, 'test', 'Should have custom field');
      },
      undefined,
      { userId: '123', operation: 'test' }
    );
  });

  it('should work with synchronous context', () => {
    const result = withRequestContextSync(() => {
      const id = getRequestId();
      assert.ok(id, 'Request ID should be available in sync context');
      return id;
    });

    assert.ok(result, 'Should return result from sync function');
  });

  it('should allow setting additional context fields', async () => {
    await withRequestContext(async () => {
      const initialContext = getRequestContext();
      assert.ok(initialContext, 'Context should exist');
      assert.strictEqual(initialContext.symbol, undefined, 'Should not have symbol initially');

      const success = setRequestContext({ symbol: 'SPY', timeframe: '5m' });
      assert.strictEqual(success, true, 'Should successfully set context');

      const updatedContext = getRequestContext();
      assert.strictEqual(updatedContext?.symbol, 'SPY', 'Should have symbol');
      assert.strictEqual(updatedContext?.timeframe, '5m', 'Should have timeframe');
    });
  });

  it('should return false when setting context outside of context', () => {
    const success = setRequestContext({ test: 'value' });
    assert.strictEqual(success, false, 'Should return false outside context');
  });

  it('should handle errors in async context', async () => {
    const testError = new Error('Test error');

    await assert.rejects(
      async () => {
        await withRequestContext(async () => {
          const id = getRequestId();
          assert.ok(id, 'Should have request ID before error');
          throw testError;
        });
      },
      testError,
      'Should propagate error'
    );

    // Context should be cleaned up after error
    const context = getRequestContext();
    assert.strictEqual(context, undefined, 'Context should be cleaned up');
  });

  it('should handle nested request contexts', async () => {
    await withRequestContext(async () => {
      const outerContext = getRequestContext();
      const outerId = outerContext?.request_id;

      await withRequestContext(async () => {
        const innerContext = getRequestContext();
        const innerId = innerContext?.request_id;

        assert.ok(outerId, 'Outer context should have ID');
        assert.ok(innerId, 'Inner context should have ID');
        assert.notStrictEqual(outerId, innerId, 'Nested contexts should have different IDs');
      });

      // Should restore outer context
      const restoredContext = getRequestContext();
      assert.strictEqual(restoredContext?.request_id, outerId, 'Should restore outer context');
    });
  });

  it('should handle rapid concurrent requests', async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      withRequestContext(async () => {
        const id = getRequestId();
        // Simulate some async work
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
        const finalId = getRequestId();
        return { index: i, initialId: id, finalId };
      })
    );

    const results = await Promise.all(promises);

    // Verify all contexts maintained their IDs
    for (const result of results) {
      assert.strictEqual(
        result.initialId,
        result.finalId,
        `Request ${result.index} should maintain same ID`
      );
    }

    // Verify all IDs are unique
    const ids = results.map((r) => r.initialId);
    const uniqueIds = new Set(ids);
    assert.strictEqual(uniqueIds.size, ids.length, 'All IDs should be unique');
  });
});
