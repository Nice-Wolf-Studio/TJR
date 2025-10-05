/**
 * HTF Swing Detection Engine - Migrated from GladOSv2
 *
 * Original source: GladOSv2/src/strategy/levels/htf-swings.ts
 * Commit: dee236c1e762db08cf7d6f34885eb4779f73600c
 * Date: 2025-09-22
 * Original author: Nice Wolf Studio
 *
 * Adapted for tjr-suite monorepo with the following changes:
 * - Import paths updated for @tjr/contracts types
 * - All logic preserved exactly as in GladOSv2
 *
 * @packageDocumentation
 */

/**
 * H1/H4 Swing Extremes Detection - Phase 1.2
 *
 * Implements deterministic, non-repainting swing high/low detection for trading level identification.
 * Uses O(1) performance with ring buffer approach and memory bounded by keepRecent parameter.
 */

import type {
  HTF,
  BaseTF,
  SwingPoint,
  SwingSeries,
  HtfSwingsSnapshot,
  SwingConfig,
  HtfSwingsConfig,
  OhlcBar,
  RingBuffer,
  SwingMetrics,
} from '@tjr/contracts';

import { DEFAULT_SWING_CONFIG } from '@tjr/contracts';

/**
 * Ring buffer implementation for efficient bar storage
 */
class BarRingBuffer implements RingBuffer<OhlcBar> {
  private buffer: (OhlcBar | undefined)[];
  private head: number = 0;
  private count: number = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(item: OhlcBar): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  get(index: number): OhlcBar | undefined {
    if (index >= this.count) {
      return undefined;
    }
    const actualIndex = (this.head - 1 - index + this.capacity) % this.capacity;
    return this.buffer[actualIndex];
  }

  size(): number {
    return this.count;
  }

  isFull(): boolean {
    return this.count === this.capacity;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
    this.buffer.fill(undefined);
  }
}

/**
 * Main class for H1/H4 swing point detection
 */
export class HtfSwings {
  private readonly symbol: string;
  private readonly config: { H1: SwingConfig; H4: SwingConfig };
  private readonly aggregate: boolean;
  private readonly baseTf?: BaseTF;

  // Ring buffers for each timeframe
  private readonly h1Buffer: BarRingBuffer;
  private readonly h4Buffer: BarRingBuffer;

  // Swing series data
  private h1Series: SwingSeries;
  private h4Series: SwingSeries;

  // Current date tracking
  private currentDate: string = '';

  // Bar counters for unique IDs
  private h1BarCount: number = 0;
  private h4BarCount: number = 0;

  // Performance tracking
  private metrics: SwingMetrics = {
    processingTime: 0,
    barsProcessed: 0,
    memoryUsage: 0,
    swingPointsDetected: 0,
    timestamp: Date.now()
  };

  constructor(opts: HtfSwingsConfig) {
    this.symbol = opts.symbol;
    this.config = {
      H1: { ...DEFAULT_SWING_CONFIG.H1, ...opts.config.H1 },
      H4: { ...DEFAULT_SWING_CONFIG.H4, ...opts.config.H4 }
    };
    this.aggregate = opts.aggregate ?? false;
    this.baseTf = opts.baseTf;

    // Initialize ring buffers with sufficient capacity for swing detection
    const h1BufferSize = Math.max(this.config.H1.left + this.config.H1.right + this.config.H1.confirm + 5, 20);
    const h4BufferSize = Math.max(this.config.H4.left + this.config.H4.right + this.config.H4.confirm + 5, 20);

    this.h1Buffer = new BarRingBuffer(h1BufferSize);
    this.h4Buffer = new BarRingBuffer(h4BufferSize);

    // Initialize swing series
    this.h1Series = {
      htf: 'H1',
      highs: [],
      lows: [],
      pendingHigh: undefined,
      pendingLow: undefined
    };

    this.h4Series = {
      htf: 'H4',
      highs: [],
      lows: [],
      pendingHigh: undefined,
      pendingLow: undefined
    };
  }

  /**
   * Start processing for a specific date
   */
  startDate(dateLocal: string): void {
    this.currentDate = dateLocal;
    this.h1BarCount = 0;
    this.h4BarCount = 0;

    // Clear buffers and series for new date
    this.h1Buffer.clear();
    this.h4Buffer.clear();

    this.h1Series = {
      htf: 'H1',
      highs: [],
      lows: [],
      pendingHigh: undefined,
      pendingLow: undefined
    };

    this.h4Series = {
      htf: 'H4',
      highs: [],
      lows: [],
      pendingHigh: undefined,
      pendingLow: undefined
    };

    this.metrics = {
      processingTime: 0,
      barsProcessed: 0,
      memoryUsage: 0,
      swingPointsDetected: 0,
      timestamp: Date.now()
    };
  }

  /**
   * Process a new bar for the specified timeframe
   */
  onBar(htf: HTF, bar: OhlcBar): void {
    const startTime = performance.now();

    if (htf === 'H1') {
      this.h1Buffer.push(bar);
      this.h1BarCount++;
      this.detectSwings('H1', this.h1Buffer, this.h1Series, this.config.H1);
    } else if (htf === 'H4') {
      this.h4Buffer.push(bar);
      this.h4BarCount++;
      this.detectSwings('H4', this.h4Buffer, this.h4Series, this.config.H4);
    }

    this.metrics.processingTime += performance.now() - startTime;
    this.metrics.barsProcessed++;
  }

  /**
   * Process base timeframe bar for aggregation (if enabled)
   */
  onBaseBar?(_bar: OhlcBar): void {
    if (!this.aggregate || !this.baseTf) {
      return;
    }

    // Implementation for base timeframe aggregation would go here
    // This is a placeholder for the optional aggregation feature
    // In a full implementation, this would aggregate M1/M5 bars into H1/H4
  }

  /**
   * Core swing detection algorithm
   */
  private detectSwings(
    htf: HTF,
    buffer: BarRingBuffer,
    series: SwingSeries,
    config: SwingConfig
  ): void {
    const bufferSize = buffer.size();
    const minBarsForPattern = config.left + config.right + 1;
    const minBarsForConfirmation = minBarsForPattern + config.confirm;

    if (bufferSize < minBarsForPattern) {
      return; // Not enough bars for swing detection
    }

    // The pivot index is the position we're checking for a swing
    // With confirm=1, we check the bar at position (left + confirm) from the most recent
    const pivotIndex = config.left + config.confirm;

    // Only process if we have enough bars to check this pivot
    if (pivotIndex >= bufferSize) {
      return;
    }

    const pivotBar = buffer.get(pivotIndex);
    if (!pivotBar) return;

    // Check for swing high - only confirm if we have enough total bars
    if (this.isSwingHigh(buffer, pivotIndex, config)) {
      const swingPoint = this.createSwingPoint(
        htf,
        'HIGH',
        pivotBar,
        config,
        htf === 'H1' ? this.h1BarCount - pivotIndex : this.h4BarCount - pivotIndex
      );

      // Only confirm if we have enough bars for full confirmation
      if (bufferSize >= minBarsForConfirmation) {
        // Check if we already have this swing to avoid duplicates
        const existingSwing = series.highs.find(s => s.id === swingPoint.id);
        if (!existingSwing) {
          swingPoint.confirmed = true;
          series.highs.push(swingPoint);
          this.trimSwingPoints(series.highs, config.keepRecent);
          this.metrics.swingPointsDetected++;
        }
      } else {
        // Update pending swing
        if (!series.pendingHigh || series.pendingHigh.id !== swingPoint.id) {
          series.pendingHigh = swingPoint;
        }
      }
    }

    // Check for swing low
    if (this.isSwingLow(buffer, pivotIndex, config)) {
      const swingPoint = this.createSwingPoint(
        htf,
        'LOW',
        pivotBar,
        config,
        htf === 'H1' ? this.h1BarCount - pivotIndex : this.h4BarCount - pivotIndex
      );

      // Only confirm if we have enough bars for full confirmation
      if (bufferSize >= minBarsForConfirmation) {
        // Check if we already have this swing to avoid duplicates
        const existingSwing = series.lows.find(s => s.id === swingPoint.id);
        if (!existingSwing) {
          swingPoint.confirmed = true;
          series.lows.push(swingPoint);
          this.trimSwingPoints(series.lows, config.keepRecent);
          this.metrics.swingPointsDetected++;
        }
      } else {
        // Update pending swing
        if (!series.pendingLow || series.pendingLow.id !== swingPoint.id) {
          series.pendingLow = swingPoint;
        }
      }
    }
  }

  /**
   * Check if bar at index is a swing high
   */
  private isSwingHigh(buffer: BarRingBuffer, pivotIndex: number, config: SwingConfig): boolean {
    const pivotBar = buffer.get(pivotIndex);
    if (!pivotBar) return false;

    // Check left side
    for (let i = 1; i <= config.left; i++) {
      const leftBar = buffer.get(pivotIndex + i);
      if (!leftBar || leftBar.high >= pivotBar.high) {
        return false;
      }
    }

    // Check right side
    for (let i = 1; i <= config.right; i++) {
      const rightBar = buffer.get(pivotIndex - i);
      if (!rightBar || rightBar.high >= pivotBar.high) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if bar at index is a swing low
   */
  private isSwingLow(buffer: BarRingBuffer, pivotIndex: number, config: SwingConfig): boolean {
    const pivotBar = buffer.get(pivotIndex);
    if (!pivotBar) return false;

    // Check left side
    for (let i = 1; i <= config.left; i++) {
      const leftBar = buffer.get(pivotIndex + i);
      if (!leftBar || leftBar.low <= pivotBar.low) {
        return false;
      }
    }

    // Check right side
    for (let i = 1; i <= config.right; i++) {
      const rightBar = buffer.get(pivotIndex - i);
      if (!rightBar || rightBar.low <= pivotBar.low) {
        return false;
      }
    }

    return true;
  }

  /**
   * Create a swing point from detected swing
   */
  private createSwingPoint(
    htf: HTF,
    kind: 'HIGH' | 'LOW',
    bar: OhlcBar,
    config: SwingConfig,
    sourceBarIndex: number
  ): SwingPoint {
    const timestamp = new Date(bar.timestamp);
    return {
      id: `${htf}:${bar.timestamp}`,
      htf,
      kind,
      price: kind === 'HIGH' ? bar.high : bar.low,
      time: timestamp,
      left: config.left,
      right: config.right,
      confirm: config.confirm,
      confirmed: false,
      sourceBarIndex
    };
  }

  /**
   * Trim swing points array to keep only recent ones
   */
  private trimSwingPoints(swingPoints: SwingPoint[], keepRecent: number): void {
    if (swingPoints.length > keepRecent) {
      swingPoints.splice(0, swingPoints.length - keepRecent);
    }
  }

  /**
   * Get current snapshot of swing analysis
   */
  getSnapshot(): HtfSwingsSnapshot {
    return {
      symbol: this.symbol,
      date: this.currentDate,
      h1: { ...this.h1Series },
      h4: { ...this.h4Series }
    };
  }

  /**
   * Get latest confirmed swing point
   */
  latestConfirmed(htf: HTF, kind: 'HIGH' | 'LOW'): SwingPoint | undefined {
    const series = htf === 'H1' ? this.h1Series : this.h4Series;
    const points = kind === 'HIGH' ? series.highs : series.lows;
    return points.length > 0 ? points[points.length - 1] : undefined;
  }

  /**
   * Find nearest swing point above given price
   */
  nearestAbove(htf: HTF, price: number): SwingPoint | undefined {
    const series = htf === 'H1' ? this.h1Series : this.h4Series;
    const allPoints = [...series.highs, ...series.lows]
      .filter(p => p.confirmed && p.price > price)
      .sort((a, b) => a.price - b.price);

    return allPoints.length > 0 ? allPoints[0] : undefined;
  }

  /**
   * Find nearest swing point below given price
   */
  nearestBelow(htf: HTF, price: number): SwingPoint | undefined {
    const series = htf === 'H1' ? this.h1Series : this.h4Series;
    const allPoints = [...series.highs, ...series.lows]
      .filter(p => p.confirmed && p.price < price)
      .sort((a, b) => b.price - a.price);

    return allPoints.length > 0 ? allPoints[0] : undefined;
  }

  /**
   * Finalize processing for current date and return snapshot
   */
  endDate(): HtfSwingsSnapshot {
    // Confirm any pending swings that have enough confirmation bars
    this.finalizeIncompletePendingSwings();

    return this.getSnapshot();
  }

  /**
   * Get performance metrics
   */
  getMetrics(): SwingMetrics {
    this.metrics.memoryUsage = this.estimateMemoryUsage();
    this.metrics.timestamp = Date.now();
    return { ...this.metrics };
  }

  /**
   * Estimate memory usage in bytes
   */
  private estimateMemoryUsage(): number {
    const bytesPerSwingPoint = 200; // Rough estimate
    const h1Points = this.h1Series.highs.length + this.h1Series.lows.length;
    const h4Points = this.h4Series.highs.length + this.h4Series.lows.length;
    const bufferBytes = (this.h1Buffer.size() + this.h4Buffer.size()) * 100; // Rough estimate for bars

    return (h1Points + h4Points) * bytesPerSwingPoint + bufferBytes;
  }

  /**
   * Finalize any pending swings that now have enough confirmation
   */
  private finalizeIncompletePendingSwings(): void {
    // In a complete implementation, this would check if pending swings
    // now have enough confirmation bars and promote them to confirmed status
    // For now, we'll leave pending swings as-is
  }
}
