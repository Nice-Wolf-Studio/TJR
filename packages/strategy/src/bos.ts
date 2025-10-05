/**
 * BOS (Break of Structure) Reversal Engine for TJR trading system
 *
 * Implements non-repainting deterministic break of structure detection
 * with O(1) performance per active window and proper window management.
 *
 * Original Attribution:
 * - Source: GladOSv2 repository (src/strategy/reversal/bos.ts)
 * - Commit: dee236c1e762db08cf7d6f34885eb4779f73600c
 * - Date: 2025-09-22
 * - Author: Nice Wolf Studio
 * - Lines: 531
 *
 * Migration Notes:
 * - Migrated to tjr-suite monorepo 2025-10-05
 * - Updated imports to use @tjr/contracts for types
 * - Updated imports to use ./pivots.js for LtfPivotTracker
 * - Converted to ES module syntax
 * - Preserved all BOS detection logic exactly as in GladOSv2
 * - Maintained window management and pivot tracking algorithms
 * - Kept all performance optimizations
 */

import type {
  BarData,
  PivotPoint,
  BosWindow,
  BosSignal,
  BosEngineState,
  IBosReversalEngine,
  BosConfig,
  BosPerformanceMetrics,
} from '@tjr/contracts';
import { DEFAULT_BOS_CONFIG, BosError } from '@tjr/contracts';
import { LtfPivotTracker } from './pivots.js';

/**
 * Window performance tracker for O(1) optimizations
 */
interface WindowTracker {
  window: BosWindow;
  lastCheckedTimestamp: number;
  hitCount: number;
}

/**
 * BOS Reversal Engine Implementation
 *
 * Features:
 * - Non-repainting deterministic logic
 * - O(1) performance per active window
 * - Automatic window expiration and cleanup
 * - Configurable strict/non-strict inequality handling
 * - Memory-efficient window management
 */
export class BosReversalEngine implements IBosReversalEngine {
  private config: BosConfig;
  private pivotTracker: LtfPivotTracker;
  private activeWindows: Map<string, WindowTracker> = new Map();
  private windowCounter = 0;
  private lastCleanupTime = 0;
  private signals: BosSignal[] = [];
  private stats = {
    totalWindowsOpened: 0,
    totalSignals: 0,
    totalBarsProcessed: 0,
    uptimeMs: 0,
    startTime: Date.now()
  };
  private lastSignalTime: Map<string, number> = new Map(); // symbol -> timestamp

  constructor(
    symbol: string,
    config: Partial<BosConfig> = {}
  ) {
    this.config = {
      ...DEFAULT_BOS_CONFIG,
      ...config,
      pivots: { ...DEFAULT_BOS_CONFIG.pivots, ...config.pivots },
      windows: { ...DEFAULT_BOS_CONFIG.windows, ...config.windows },
      signals: { ...DEFAULT_BOS_CONFIG.signals, ...config.signals },
      performance: { ...DEFAULT_BOS_CONFIG.performance, ...config.performance }
    };

    this.pivotTracker = new LtfPivotTracker(symbol, this.config.pivots);

    // Validate configuration
    this.validateConfig();
  }

  /**
   * Open a new BOS detection window
   * @param referencePivot The pivot point that triggers window opening
   * @param durationMs Window duration in milliseconds
   * @param direction Expected break direction
   * @returns Opened window or null if rejected
   */
  openWindow(
    referencePivot: PivotPoint,
    durationMs?: number,
    direction?: 'bullish' | 'bearish'
  ): BosWindow | null {
    // Validate input
    if (!this.isValidPivot(referencePivot)) {
      throw new BosError('INVALID_PIVOT', 'Invalid pivot point provided');
    }

    // Check window limits per symbol
    const symbolWindows = Array.from(this.activeWindows.values())
      .filter(tracker => tracker.window.symbol === referencePivot.timestamp.toString());

    if (symbolWindows.length >= this.config.windows.maxWindowsPerSymbol) {
      return null; // Reject due to limit
    }

    // Determine direction if not specified
    const windowDirection = direction || (referencePivot.type === 'high' ? 'bearish' : 'bullish');

    // Calculate window parameters
    const duration = durationMs || this.config.windows.defaultDurationMs;
    const windowId = this.generateWindowId();
    const openedAt = Date.now();
    const expiresAt = openedAt + duration;

    // Determine trigger price and strict inequality
    const triggerPrice = windowDirection === 'bullish'
      ? referencePivot.price // Break above high
      : referencePivot.price; // Break below low

    const window: BosWindow = {
      id: windowId,
      openedAt,
      expiresAt,
      symbol: referencePivot.timestamp.toString(), // Using timestamp as symbol for this example
      referencePivot,
      status: 'active',
      direction: windowDirection,
      triggerPrice,
      strictInequality: this.config.signals.strictInequality
    };

    // Add to active windows with performance tracker
    const tracker: WindowTracker = {
      window,
      lastCheckedTimestamp: 0,
      hitCount: 0
    };

    this.activeWindows.set(windowId, tracker);
    this.stats.totalWindowsOpened++;

    return window;
  }

  /**
   * Process new bar data
   * @param bar New OHLCV bar data
   * @returns Array of generated signals
   */
  onBar(bar: BarData): BosSignal[] {
    this.stats.totalBarsProcessed++;

    // Process pivot detection first
    const newPivots = this.pivotTracker.onBar(bar);

    // Auto-open windows for significant new pivots
    if (this.shouldAutoOpenWindows()) {
      this.autoOpenWindows(newPivots);
    }

    // Check active windows for breaks
    const newSignals = this.checkActiveWindows(bar);

    // Periodic cleanup
    if (this.shouldRunCleanup()) {
      this.cleanup();
    }

    // Store signals with memory management
    this.addSignals(newSignals);

    return newSignals;
  }

  /**
   * Get current engine state
   * @returns Current state snapshot
   */
  getState(): BosEngineState {
    this.stats.uptimeMs = Date.now() - this.stats.startTime;

    return {
      activeWindows: Array.from(this.activeWindows.values()).map(t => ({ ...t.window })),
      recentPivots: this.pivotTracker.getRecentPivots(20),
      signals: [...this.signals],
      lastProcessedAt: Date.now(),
      stats: { ...this.stats }
    };
  }

  /**
   * Close specific window
   * @param windowId Window identifier
   * @returns True if window was closed
   */
  closeWindow(windowId: string): boolean {
    const tracker = this.activeWindows.get(windowId);
    if (!tracker) {
      return false;
    }

    tracker.window.status = 'expired';
    this.activeWindows.delete(windowId);
    return true;
  }

  /**
   * Cleanup expired windows
   * @returns Number of windows cleaned up
   */
  cleanup(): number {
    const now = Date.now();
    let cleanupCount = 0;

    for (const [windowId, tracker] of this.activeWindows.entries()) {
      if (now >= tracker.window.expiresAt) {
        tracker.window.status = 'expired';
        this.activeWindows.delete(windowId);
        cleanupCount++;
      }
    }

    this.lastCleanupTime = now;
    return cleanupCount;
  }

  /**
   * Check active windows for BOS triggers - O(1) per window
   * @param bar Current bar data
   * @returns Array of triggered signals
   */
  private checkActiveWindows(bar: BarData): BosSignal[] {
    const signals: BosSignal[] = [];
    const now = Date.now();

    for (const [windowId, tracker] of this.activeWindows.entries()) {
      const window = tracker.window;

      // Skip if window expired
      if (now >= window.expiresAt) {
        continue;
      }

      // Skip if symbol doesn't match (in real implementation)
      // For this example, we'll process all windows

      // O(1) break detection
      const triggered = this.checkWindowTrigger(window, bar);

      if (triggered) {
        // Check cooldown period
        if (this.isInCooldown(window.symbol)) {
          continue;
        }

        const signal = this.createSignal(window, bar);
        signals.push(signal);

        // Update window status
        window.status = 'triggered';
        this.activeWindows.delete(windowId);

        // Update cooldown
        this.lastSignalTime.set(window.symbol, bar.timestamp);

        this.stats.totalSignals++;
      }

      // Update tracker stats
      tracker.lastCheckedTimestamp = bar.timestamp;
      tracker.hitCount++;
    }

    return signals;
  }

  /**
   * O(1) window trigger check
   * @param window BOS window to check
   * @param bar Current bar data
   * @returns True if window triggered
   */
  private checkWindowTrigger(window: BosWindow, bar: BarData): boolean {
    const { direction, triggerPrice, strictInequality } = window;

    if (direction === 'bullish') {
      // Break above resistance (high pivot)
      const breakPrice = Math.max(bar.high, bar.close);
      return strictInequality
        ? breakPrice > triggerPrice
        : breakPrice >= triggerPrice;
    } else {
      // Break below support (low pivot)
      const breakPrice = Math.min(bar.low, bar.close);
      return strictInequality
        ? breakPrice < triggerPrice
        : breakPrice <= triggerPrice;
    }
  }

  /**
   * Create BOS signal from triggered window
   * @param window Triggered window
   * @param bar Trigger bar
   * @returns Generated signal
   */
  private createSignal(window: BosWindow, bar: BarData): BosSignal {
    const signalType = window.direction === 'bullish' ? 'BOS_BULLISH' : 'BOS_BEARISH';

    // Calculate confidence based on pivot strength and market conditions
    const confidence = this.calculateSignalConfidence(window, bar);

    // Calculate strength based on break magnitude
    const strength = this.calculateSignalStrength(window, bar);

    return {
      timestamp: bar.timestamp,
      symbol: bar.symbol,
      type: signalType,
      triggerPrice: window.triggerPrice,
      brokenPivot: window.referencePivot,
      windowId: window.id,
      confidence,
      strength,
      triggerBar: bar
    };
  }

  /**
   * Calculate signal confidence score
   * @param window Triggered window
   * @param bar Trigger bar
   * @returns Confidence score (0-100)
   */
  private calculateSignalConfidence(window: BosWindow, bar: BarData): number {
    const pivotStrength = window.referencePivot.strength;
    const volumeWeight = this.calculateVolumeWeight(bar);
    const timeWeight = this.calculateTimeWeight(window);

    // Weighted confidence calculation
    const confidence = Math.round(
      pivotStrength * 0.5 +
      volumeWeight * 0.3 +
      timeWeight * 0.2
    );

    return Math.max(this.config.signals.minConfidence, Math.min(100, confidence));
  }

  /**
   * Calculate signal strength score
   * @param window Triggered window
   * @param bar Trigger bar
   * @returns Strength score (0-100)
   */
  private calculateSignalStrength(window: BosWindow, bar: BarData): number {
    const breakMagnitude = Math.abs(bar.close - window.triggerPrice);
    const priceRange = window.triggerPrice * 0.001; // 0.1% of price

    const breakStrength = Math.min(100, (breakMagnitude / priceRange) * 20);
    const volumeStrength = this.calculateVolumeWeight(bar);

    return Math.round((breakStrength + volumeStrength) / 2);
  }

  /**
   * Calculate volume weight for signal scoring
   * @param bar Current bar
   * @returns Volume weight (0-100)
   */
  private calculateVolumeWeight(bar: BarData): number {
    // Simplified volume analysis - in production would use volume profile
    const avgVolume = bar.volume; // Would calculate from historical data
    const currentVolume = bar.volume;

    if (avgVolume === 0) return 50; // Default when no volume data

    const volumeRatio = currentVolume / avgVolume;
    return Math.min(100, Math.max(0, volumeRatio * 50));
  }

  /**
   * Calculate time weight for signal scoring
   * @param window BOS window
   * @returns Time weight (0-100)
   */
  private calculateTimeWeight(window: BosWindow): number {
    const now = Date.now();
    const windowAge = now - window.openedAt;
    const totalDuration = window.expiresAt - window.openedAt;

    if (totalDuration === 0) return 50;

    const ageRatio = windowAge / totalDuration;
    // Early triggers get higher weight
    return Math.round(100 - (ageRatio * 50));
  }

  /**
   * Auto-open windows for significant new pivots
   * @param newPivots Recently confirmed pivots
   */
  private autoOpenWindows(newPivots: PivotPoint[]): void {
    for (const pivot of newPivots) {
      if (pivot.strength >= 60) { // Only for strong pivots
        this.openWindow(pivot);
      }
    }
  }

  /**
   * Check if in signal cooldown period
   * @param symbol Trading symbol
   * @returns True if in cooldown
   */
  private isInCooldown(symbol: string): boolean {
    const lastSignal = this.lastSignalTime.get(symbol);
    if (!lastSignal) return false;

    const now = Date.now();
    return (now - lastSignal) < this.config.signals.cooldownMs;
  }

  /**
   * Add signals with memory management
   * @param newSignals Signals to add
   */
  private addSignals(newSignals: BosSignal[]): void {
    this.signals.push(...newSignals);

    // Memory management - keep only recent signals
    const maxSignals = this.config.performance.maxSignalsHistory;
    if (this.signals.length > maxSignals) {
      this.signals = this.signals.slice(-maxSignals);
    }
  }

  /**
   * Check if should run cleanup
   * @returns True if cleanup needed
   */
  private shouldRunCleanup(): boolean {
    const now = Date.now();
    return (now - this.lastCleanupTime) >= this.config.windows.cleanupIntervalMs;
  }

  /**
   * Check if should auto-open windows
   * @returns True if auto-opening enabled
   */
  private shouldAutoOpenWindows(): boolean {
    return true; // Configurable in production
  }

  /**
   * Validate pivot point
   * @param pivot Pivot to validate
   * @returns True if valid
   */
  private isValidPivot(pivot: PivotPoint): boolean {
    return (
      pivot.timestamp > 0 &&
      pivot.price > 0 &&
      ['high', 'low'].includes(pivot.type) &&
      pivot.leftBars >= 0 &&
      pivot.rightBars >= 0 &&
      pivot.strength >= 0 && pivot.strength <= 100
    );
  }

  /**
   * Generate unique window ID
   * @returns Unique window identifier
   */
  private generateWindowId(): string {
    return `bos_${Date.now()}_${this.windowCounter++}`;
  }

  /**
   * Validate engine configuration
   */
  private validateConfig(): void {
    if (this.config.windows.maxWindowsPerSymbol <= 0) {
      throw new BosError('INVALID_CONFIG', 'maxWindowsPerSymbol must be positive');
    }

    if (this.config.signals.minConfidence < 0 || this.config.signals.minConfidence > 100) {
      throw new BosError('INVALID_CONFIG', 'minConfidence must be between 0 and 100');
    }
  }

  /**
   * Get performance metrics
   * @returns Current performance metrics
   */
  getPerformanceMetrics(): BosPerformanceMetrics {
    const now = Date.now();
    const uptimeMs = now - this.stats.startTime;
    const avgProcessingTime = uptimeMs > 0
      ? (uptimeMs / this.stats.totalBarsProcessed)
      : 0;

    return {
      avgProcessingTimeMs: avgProcessingTime,
      memoryUsageBytes: this.estimateMemoryUsage(),
      cacheHitRatio: 0.95, // Would implement actual cache metrics
      activeWindowsCount: this.activeWindows.size,
      signalsPerMinute: this.calculateSignalsPerMinute(),
      measurementTimestamp: now
    };
  }

  /**
   * Estimate memory usage
   * @returns Estimated memory usage in bytes
   */
  private estimateMemoryUsage(): number {
    const windowSize = 200; // Estimated bytes per window
    const signalSize = 150; // Estimated bytes per signal
    const pivotSize = 100; // Estimated bytes per pivot

    return (
      this.activeWindows.size * windowSize +
      this.signals.length * signalSize +
      this.pivotTracker.getRecentPivots(100).length * pivotSize
    );
  }

  /**
   * Calculate signals per minute rate
   * @returns Signals per minute
   */
  private calculateSignalsPerMinute(): number {
    const uptimeMinutes = (Date.now() - this.stats.startTime) / (60 * 1000);
    return uptimeMinutes > 0 ? this.stats.totalSignals / uptimeMinutes : 0;
  }
}
