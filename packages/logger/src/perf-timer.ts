/**
 * @fileoverview Performance timing utilities for measuring operation durations
 * Uses high-resolution timers (performance.now()) for accurate measurements
 */

/**
 * Performance timer for measuring operation durations
 */
export interface PerfTimer {
  /** Start time in milliseconds (high-resolution) */
  readonly startTime: number;

  /**
   * Get elapsed time since timer started
   * @returns Elapsed time in milliseconds
   */
  elapsed(): number;

  /**
   * Stop the timer and return final duration
   * @returns Final duration in milliseconds
   */
  stop(): number;

  /**
   * Check if timer is still running
   * @returns true if timer is running, false if stopped
   */
  isRunning(): boolean;
}

/**
 * Timer state interface
 */
interface TimerState {
  startTime: number;
  endTime: number | null;
}

/**
 * Create a new performance timer
 * Uses performance.now() for high-resolution timing
 *
 * @returns A new PerfTimer instance
 *
 * @example
 * ```typescript
 * const timer = startTimer();
 * await doSomeWork();
 * const duration = timer.elapsed();
 * logger.info('Work completed', { duration_ms: duration });
 * ```
 */
export function startTimer(): PerfTimer {
  const state: TimerState = {
    startTime: performance.now(),
    endTime: null,
  };

  return {
    get startTime() {
      return state.startTime;
    },

    elapsed(): number {
      const endTime = state.endTime ?? performance.now();
      return Math.round(endTime - state.startTime);
    },

    stop(): number {
      if (state.endTime === null) {
        state.endTime = performance.now();
      }
      return Math.round(state.endTime - state.startTime);
    },

    isRunning(): boolean {
      return state.endTime === null;
    },
  };
}

/**
 * Measure the duration of a synchronous function
 *
 * @param fn - Function to measure
 * @returns Object containing the function result and duration in milliseconds
 *
 * @example
 * ```typescript
 * const { result, duration_ms } = measureSync(() => {
 *   return processData();
 * });
 * logger.info('Processing complete', { duration_ms, result });
 * ```
 */
export function measureSync<T>(fn: () => T): { result: T; duration_ms: number } {
  const timer = startTimer();
  const result = fn();
  const duration_ms = timer.stop();
  return { result, duration_ms };
}

/**
 * Measure the duration of an async function
 *
 * @param fn - Async function to measure
 * @returns Promise resolving to object containing the function result and duration in milliseconds
 *
 * @example
 * ```typescript
 * const { result, duration_ms } = await measureAsync(async () => {
 *   return await fetchData();
 * });
 * logger.info('Fetch complete', { duration_ms, result });
 * ```
 */
export async function measureAsync<T>(
  fn: () => Promise<T>
): Promise<{ result: T; duration_ms: number }> {
  const timer = startTimer();
  const result = await fn();
  const duration_ms = timer.stop();
  return { result, duration_ms };
}

/**
 * Named timer manager for tracking multiple concurrent operations
 */
export class TimerManager {
  private timers: Map<string, PerfTimer> = new Map();

  /**
   * Start a named timer
   *
   * @param name - Unique name for this timer
   * @returns The started timer instance
   * @throws Error if a timer with this name already exists and is running
   *
   * @example
   * ```typescript
   * const manager = new TimerManager();
   * manager.start('fetch');
   * // ... do work ...
   * const duration = manager.stop('fetch');
   * ```
   */
  start(name: string): PerfTimer {
    if (this.timers.has(name)) {
      const existing = this.timers.get(name)!;
      if (existing.isRunning()) {
        throw new Error(`Timer "${name}" is already running`);
      }
    }

    const timer = startTimer();
    this.timers.set(name, timer);
    return timer;
  }

  /**
   * Get elapsed time for a named timer
   *
   * @param name - Name of the timer
   * @returns Elapsed time in milliseconds
   * @throws Error if timer doesn't exist
   *
   * @example
   * ```typescript
   * const manager = new TimerManager();
   * manager.start('process');
   * // ... do work ...
   * const elapsed = manager.elapsed('process');
   * logger.info('Still processing', { duration_ms: elapsed });
   * ```
   */
  elapsed(name: string): number {
    const timer = this.timers.get(name);
    if (!timer) {
      throw new Error(`Timer "${name}" does not exist`);
    }
    return timer.elapsed();
  }

  /**
   * Stop a named timer and return duration
   *
   * @param name - Name of the timer
   * @returns Final duration in milliseconds
   * @throws Error if timer doesn't exist
   *
   * @example
   * ```typescript
   * const manager = new TimerManager();
   * manager.start('calculate');
   * // ... do work ...
   * const duration = manager.stop('calculate');
   * ```
   */
  stop(name: string): number {
    const timer = this.timers.get(name);
    if (!timer) {
      throw new Error(`Timer "${name}" does not exist`);
    }
    return timer.stop();
  }

  /**
   * Check if a named timer exists and is running
   *
   * @param name - Name of the timer
   * @returns true if timer exists and is running
   *
   * @example
   * ```typescript
   * if (manager.isRunning('fetch')) {
   *   console.log('Fetch still in progress');
   * }
   * ```
   */
  isRunning(name: string): boolean {
    const timer = this.timers.get(name);
    return timer ? timer.isRunning() : false;
  }

  /**
   * Remove a timer from the manager
   *
   * @param name - Name of the timer to remove
   * @returns true if timer was removed, false if it didn't exist
   *
   * @example
   * ```typescript
   * manager.clear('fetch');
   * ```
   */
  clear(name: string): boolean {
    return this.timers.delete(name);
  }

  /**
   * Remove all timers from the manager
   *
   * @example
   * ```typescript
   * manager.clearAll();
   * ```
   */
  clearAll(): void {
    this.timers.clear();
  }

  /**
   * Get all timer names
   *
   * @returns Array of timer names
   *
   * @example
   * ```typescript
   * const names = manager.getTimerNames();
   * console.log('Active timers:', names);
   * ```
   */
  getTimerNames(): string[] {
    return Array.from(this.timers.keys());
  }
}
