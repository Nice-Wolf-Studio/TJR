/**
 * Latency metrics calculation
 *
 * Tracks execution time for performance benchmarking and regression testing.
 * Provides min, max, mean, median, and percentile statistics.
 *
 * @module @tjr/dev-scripts/metrics/latency
 */

import type { LatencyMetrics } from './types';

/**
 * Calculate latency metrics from timing measurements
 *
 * Computes:
 * - min: Fastest execution
 * - max: Slowest execution
 * - mean: Average execution time
 * - median: Middle value when sorted
 * - p95: 95th percentile (95% of executions faster than this)
 * - p99: 99th percentile (99% of executions faster than this)
 * - total: Sum of all execution times
 *
 * @param latencies - Array of latency measurements in milliseconds
 * @returns Latency metrics object
 *
 * @example
 * const latencies = [1.2, 3.5, 2.1, 15.3, 4.8, 2.9, 3.2];
 * const metrics = calculateLatency(latencies);
 * // => { min: 1.2, max: 15.3, mean: 4.7, median: 3.2, p95: 15.3, p99: 15.3, total: 33.0 }
 */
export function calculateLatency(latencies: number[]): LatencyMetrics {
  if (latencies.length === 0) {
    return {
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      p95: 0,
      p99: 0,
      total: 0,
    };
  }

  // Sort for percentile calculations
  const sorted = [...latencies].sort((a, b) => a - b);

  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const total = latencies.reduce((sum, l) => sum + l, 0);
  const mean = total / latencies.length;
  const median = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);

  return {
    min: round1(min),
    max: round1(max),
    mean: round1(mean),
    median: round1(median),
    p95: round1(p95),
    p99: round1(p99),
    total: round1(total),
  };
}

/**
 * Calculate percentile value from sorted array
 *
 * Uses linear interpolation between values if index is not an integer.
 *
 * @param sorted - Sorted array of values
 * @param p - Percentile (0-100)
 * @returns Value at the given percentile
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;

  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower] ?? 0;
  }

  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? 0;
  const fraction = index - lower;

  return lowerValue + (upperValue - lowerValue) * fraction;
}

/**
 * Round number to 1 decimal place for display
 */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Simple latency tracker class
 *
 * Provides convenient start/stop interface for measuring execution time.
 *
 * @example
 * const tracker = new LatencyTracker();
 * tracker.start();
 * // ... do work ...
 * tracker.stop();
 * const metrics = tracker.getMetrics();
 */
export class LatencyTracker {
  private latencies: number[] = [];
  private startTime: number = 0;

  /**
   * Start timing measurement
   */
  start(): void {
    this.startTime = performance.now();
  }

  /**
   * Stop timing measurement and record latency
   * @returns The recorded latency in milliseconds
   */
  stop(): number {
    const elapsed = performance.now() - this.startTime;
    this.latencies.push(elapsed);
    return elapsed;
  }

  /**
   * Add a pre-measured latency
   * @param latency - Latency in milliseconds
   */
  add(latency: number): void {
    this.latencies.push(latency);
  }

  /**
   * Get all recorded latencies
   */
  getLatencies(): number[] {
    return [...this.latencies];
  }

  /**
   * Calculate and return latency metrics
   */
  getMetrics(): LatencyMetrics {
    return calculateLatency(this.latencies);
  }

  /**
   * Reset the tracker
   */
  reset(): void {
    this.latencies = [];
    this.startTime = 0;
  }
}
