/**
 * @fileoverview Tests for performance timing utilities
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { startTimer, measureSync, measureAsync, TimerManager } from '../src/perf-timer.js';

/**
 * Sleep utility for testing
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if duration is within acceptable tolerance (±10ms)
 */
function isWithinTolerance(actual: number, expected: number, tolerance = 10): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

describe('Performance Timers', () => {
  describe('startTimer', () => {
    it('should measure durations accurately within ±10ms', async () => {
      const timer = startTimer();
      await sleep(50);
      const duration = timer.elapsed();

      assert.ok(
        isWithinTolerance(duration, 50, 10),
        `Duration ${duration}ms should be ~50ms (±10ms)`
      );
    });

    it('should return elapsed time multiple times', async () => {
      const timer = startTimer();
      await sleep(30);
      const elapsed1 = timer.elapsed();

      await sleep(20);
      const elapsed2 = timer.elapsed();

      assert.ok(elapsed2 > elapsed1, 'Second elapsed should be greater');
      assert.ok(isWithinTolerance(elapsed1, 30, 10), `First elapsed ${elapsed1}ms should be ~30ms`);
      assert.ok(
        isWithinTolerance(elapsed2, 50, 10),
        `Second elapsed ${elapsed2}ms should be ~50ms`
      );
    });

    it('should stop timer and return final duration', async () => {
      const timer = startTimer();
      await sleep(40);
      const finalDuration = timer.stop();

      assert.ok(
        isWithinTolerance(finalDuration, 40, 10),
        `Final duration ${finalDuration}ms should be ~40ms`
      );

      // Should return same duration after stopping
      await sleep(20);
      const afterStop = timer.elapsed();
      assert.strictEqual(afterStop, finalDuration, 'Duration should not change after stopping');
    });

    it('should report running state correctly', async () => {
      const timer = startTimer();
      assert.strictEqual(timer.isRunning(), true, 'Should be running initially');

      timer.stop();
      assert.strictEqual(timer.isRunning(), false, 'Should not be running after stop');
    });

    it('should handle multiple stop calls gracefully', async () => {
      const timer = startTimer();
      await sleep(30);

      const duration1 = timer.stop();
      await sleep(20);
      const duration2 = timer.stop();

      assert.strictEqual(duration1, duration2, 'Multiple stops should return same duration');
    });

    it('should round durations to nearest millisecond', async () => {
      const timer = startTimer();
      await sleep(25);
      const duration = timer.elapsed();

      assert.strictEqual(duration, Math.round(duration), 'Duration should be rounded');
      assert.strictEqual(duration % 1, 0, 'Duration should be integer');
    });
  });

  describe('measureSync', () => {
    it('should measure synchronous function duration', () => {
      const { result, duration_ms } = measureSync(() => {
        let sum = 0;
        for (let i = 0; i < 1000000; i++) {
          sum += i;
        }
        return sum;
      });

      assert.ok(result > 0, 'Should return function result');
      assert.ok(duration_ms >= 0, 'Should measure duration');
      assert.strictEqual(typeof duration_ms, 'number', 'Duration should be number');
    });

    it('should handle errors in sync functions', () => {
      assert.throws(() => {
        measureSync(() => {
          throw new Error('Test error');
        });
      }, /Test error/);
    });
  });

  describe('measureAsync', () => {
    it('should measure async function duration', async () => {
      const { result, duration_ms } = await measureAsync(async () => {
        await sleep(30);
        return 'test result';
      });

      assert.strictEqual(result, 'test result', 'Should return function result');
      assert.ok(
        isWithinTolerance(duration_ms, 30, 10),
        `Duration ${duration_ms}ms should be ~30ms`
      );
    });

    it('should handle errors in async functions', async () => {
      await assert.rejects(async () => {
        await measureAsync(async () => {
          await sleep(10);
          throw new Error('Async error');
        });
      }, /Async error/);
    });

    it('should measure longer durations accurately', async () => {
      const { duration_ms } = await measureAsync(async () => {
        await sleep(100);
        return true;
      });

      assert.ok(
        isWithinTolerance(duration_ms, 100, 10),
        `Duration ${duration_ms}ms should be ~100ms`
      );
    });
  });

  describe('TimerManager', () => {
    it('should support named timers', async () => {
      const manager = new TimerManager();

      manager.start('task1');
      await sleep(30);
      const duration1 = manager.stop('task1');

      assert.ok(
        isWithinTolerance(duration1, 30, 10),
        `Task1 duration ${duration1}ms should be ~30ms`
      );
    });

    it('should support multiple concurrent timers', async () => {
      const manager = new TimerManager();

      manager.start('task1');
      await sleep(20);
      manager.start('task2');
      await sleep(20);

      const duration1 = manager.stop('task1');
      const duration2 = manager.stop('task2');

      assert.ok(isWithinTolerance(duration1, 40, 10), `Task1 ${duration1}ms should be ~40ms`);
      assert.ok(isWithinTolerance(duration2, 20, 10), `Task2 ${duration2}ms should be ~20ms`);
    });

    it('should throw error for duplicate timer names', () => {
      const manager = new TimerManager();

      manager.start('duplicate');
      assert.throws(
        () => manager.start('duplicate'),
        /already running/,
        'Should throw for duplicate timer'
      );
    });

    it('should throw error for non-existent timer', () => {
      const manager = new TimerManager();

      assert.throws(
        () => manager.elapsed('nonexistent'),
        /does not exist/,
        'Should throw for non-existent timer'
      );

      assert.throws(
        () => manager.stop('nonexistent'),
        /does not exist/,
        'Should throw for non-existent timer'
      );
    });

    it('should check if timer is running', async () => {
      const manager = new TimerManager();

      manager.start('test');
      assert.strictEqual(manager.isRunning('test'), true, 'Should be running');

      manager.stop('test');
      assert.strictEqual(manager.isRunning('test'), false, 'Should not be running after stop');

      assert.strictEqual(
        manager.isRunning('nonexistent'),
        false,
        'Non-existent timer should not be running'
      );
    });

    it('should clear individual timers', () => {
      const manager = new TimerManager();

      manager.start('task1');
      manager.start('task2');

      const cleared = manager.clear('task1');
      assert.strictEqual(cleared, true, 'Should clear timer');

      assert.strictEqual(manager.isRunning('task1'), false, 'Task1 should be cleared');
      assert.strictEqual(manager.isRunning('task2'), true, 'Task2 should still exist');
    });

    it('should clear all timers', () => {
      const manager = new TimerManager();

      manager.start('task1');
      manager.start('task2');
      manager.start('task3');

      manager.clearAll();

      assert.strictEqual(manager.isRunning('task1'), false);
      assert.strictEqual(manager.isRunning('task2'), false);
      assert.strictEqual(manager.isRunning('task3'), false);
    });

    it('should list all timer names', () => {
      const manager = new TimerManager();

      manager.start('task1');
      manager.start('task2');
      manager.start('task3');

      const names = manager.getTimerNames();
      assert.strictEqual(names.length, 3, 'Should have 3 timers');
      assert.ok(names.includes('task1'), 'Should include task1');
      assert.ok(names.includes('task2'), 'Should include task2');
      assert.ok(names.includes('task3'), 'Should include task3');
    });

    it('should get elapsed time for running timer', async () => {
      const manager = new TimerManager();

      manager.start('task');
      await sleep(30);
      const elapsed = manager.elapsed('task');

      assert.ok(isWithinTolerance(elapsed, 30, 10), `Elapsed ${elapsed}ms should be ~30ms`);
    });

    it('should allow reusing timer name after clearing', () => {
      const manager = new TimerManager();

      manager.start('reusable');
      manager.stop('reusable');
      manager.clear('reusable');

      // Should not throw
      manager.start('reusable');
      assert.ok(manager.isRunning('reusable'), 'Should be able to reuse name');
    });

    it('should handle high-frequency timer operations', () => {
      const manager = new TimerManager();

      // Start and stop many timers rapidly
      for (let i = 0; i < 100; i++) {
        manager.start(`timer${i}`);
      }

      const names = manager.getTimerNames();
      assert.strictEqual(names.length, 100, 'Should have 100 timers');

      for (let i = 0; i < 100; i++) {
        const duration = manager.stop(`timer${i}`);
        assert.ok(duration >= 0, `Timer${i} should have valid duration`);
      }
    });
  });

  describe('Duration Accuracy', () => {
    it('should measure very short durations', async () => {
      const timer = startTimer();
      await sleep(5);
      const duration = timer.elapsed();

      assert.ok(duration >= 0, 'Should measure short duration');
      // Very short durations have higher variance, so wider tolerance
      assert.ok(duration < 20, 'Should be reasonably short');
    });

    it('should handle zero-duration operations', () => {
      const { duration_ms } = measureSync(() => {
        return 42;
      });

      assert.ok(duration_ms >= 0, 'Duration should be non-negative');
    });

    it('should maintain accuracy across multiple measurements', async () => {
      const durations: number[] = [];

      for (let i = 0; i < 5; i++) {
        const timer = startTimer();
        await sleep(50);
        durations.push(timer.stop());
      }

      // All measurements should be within tolerance
      for (const duration of durations) {
        assert.ok(isWithinTolerance(duration, 50, 10), `Duration ${duration}ms should be ~50ms`);
      }
    });
  });
});
