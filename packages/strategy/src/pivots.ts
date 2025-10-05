/**
 * LTF (Lower Time Frame) Pivot Tracker for TJR trading system
 *
 * Implements non-repainting pivot point detection with deterministic logic.
 * Maintains O(1) performance per bar through efficient data structures.
 *
 * Original Attribution:
 * - Source: GladOSv2 repository (src/strategy/reversal/pivots.ts)
 * - Commit: dee236c1e762db08cf7d6f34885eb4779f73600c
 * - Date: 2025-09-22
 * - Author: Nice Wolf Studio
 * - Lines: 400
 *
 * Migration Notes:
 * - Migrated to tjr-suite monorepo 2025-10-05
 * - Updated imports to use @tjr/contracts
 * - Converted to ES module syntax
 * - Preserved all BOS detection logic exactly as in GladOSv2
 */

import type {
  BarData,
  PivotPoint,
  LtfPivotState,
  ILtfPivotTracker,
  BosConfig,
  PivotCandidate,
} from '@tjr/contracts';
import { DEFAULT_BOS_CONFIG } from '@tjr/contracts';

/**
 * Internal pivot candidate for confirmation tracking
 */
interface InternalPivotCandidate extends PivotCandidate {
  barIndex: number;
}

/**
 * LTF Pivot Tracker Implementation
 *
 * Features:
 * - Non-repainting deterministic pivot detection
 * - O(1) performance per bar with efficient data structures
 * - Configurable left/right bar requirements
 * - Memory-efficient circular buffer for bars
 */
export class LtfPivotTracker implements ILtfPivotTracker {
  private state: LtfPivotState;
  private candidates: InternalPivotCandidate[] = [];
  private config: BosConfig['pivots'];
  private barIndex = 0;

  constructor(
    symbol: string,
    config: Partial<BosConfig['pivots']> = {}
  ) {
    this.config = {
      ...DEFAULT_BOS_CONFIG.pivots,
      ...config
    };

    this.state = {
      symbol,
      bars: [],
      pivots: [],
      candidates: [],
      lastUpdated: 0
    };
  }

  /**
   * Process new bar and detect pivot points
   * @param bar New OHLCV bar data
   * @returns Array of newly confirmed pivots
   */
  onBar(bar: BarData): PivotPoint[] {
    if (bar.symbol !== this.state.symbol) {
      throw new Error(`Bar symbol ${bar.symbol} does not match tracker symbol ${this.state.symbol}`);
    }

    // Add bar to circular buffer
    this.addBar(bar);
    this.barIndex++;

    // Update candidates and detect new ones
    const confirmedPivots = this.updateCandidates();
    this.detectNewCandidates();

    // Update state
    this.state.lastUpdated = bar.timestamp;
    this.state.candidates = this.candidates.map(c => ({
      timestamp: c.timestamp,
      price: c.price,
      type: c.type,
      leftBars: c.leftBars,
      rightBarsNeeded: c.rightBarsNeeded
    }));

    return confirmedPivots;
  }

  /**
   * Get current tracker state
   * @returns Current state snapshot
   */
  getState(): LtfPivotState {
    return {
      ...this.state,
      bars: [...this.state.bars],
      pivots: [...this.state.pivots],
      candidates: [...this.state.candidates]
    };
  }

  /**
   * Get recent confirmed pivots
   * @param count Maximum number of pivots to return
   * @returns Array of recent pivots
   */
  getRecentPivots(count: number = 10): PivotPoint[] {
    return this.state.pivots
      .slice(-count)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Reset tracker state
   */
  reset(): void {
    this.state.bars = [];
    this.state.pivots = [];
    this.state.candidates = [];
    this.state.lastUpdated = 0;
    this.candidates = [];
    this.barIndex = 0;
  }

  /**
   * Add bar to circular buffer with memory management
   * @param bar Bar to add
   */
  private addBar(bar: BarData): void {
    this.state.bars.push(bar);

    // Maintain memory efficiency with circular buffer
    const maxBars = this.config.maxLookback * 2; // Extra buffer for lookback
    if (this.state.bars.length > maxBars) {
      const removeCount = this.state.bars.length - maxBars;
      this.state.bars.splice(0, removeCount);

      // Adjust candidate bar indices
      this.candidates = this.candidates
        .map(c => ({ ...c, barIndex: c.barIndex - removeCount }))
        .filter(c => c.barIndex >= 0);
    }
  }

  /**
   * Update existing candidates and confirm pivots
   * @returns Array of newly confirmed pivots
   */
  private updateCandidates(): PivotPoint[] {
    const confirmedPivots: PivotPoint[] = [];
    const barsLength = this.state.bars.length;

    // Update candidates with new right bar confirmations
    this.candidates = this.candidates.filter(candidate => {
      const rightBarsAvailable = barsLength - 1 - candidate.barIndex;

      if (rightBarsAvailable >= candidate.rightBarsNeeded) {
        // Check if pivot is still valid with required right bars
        if (this.isPivotValid(candidate, candidate.barIndex)) {
          const pivot = this.createPivotFromCandidate(candidate);
          confirmedPivots.push(pivot);
          this.state.pivots.push(pivot);
          return false; // Remove confirmed candidate
        } else {
          return false; // Remove invalidated candidate
        }
      }

      return true; // Keep pending candidate
    });

    return confirmedPivots;
  }

  /**
   * Detect new pivot candidates from recent bars
   */
  private detectNewCandidates(): void {
    const barsLength = this.state.bars.length;
    const minRequiredBars = this.config.minLeftBars + this.config.minRightBars + 1;

    if (barsLength < minRequiredBars) {
      return;
    }

    // Check recent bars for potential pivots
    const startIndex = Math.max(
      this.config.minLeftBars,
      barsLength - this.config.maxLookback
    );

    const endIndex = barsLength - this.config.minRightBars - 1;

    for (let i = startIndex; i <= endIndex; i++) {
      const bar = this.state.bars[i];
      if (!bar) continue;

      // Check for high pivot
      if (this.isPotentialHighPivot(i)) {
        const candidate: InternalPivotCandidate = {
          timestamp: bar.timestamp,
          price: bar.high,
          type: 'high',
          leftBars: this.config.minLeftBars,
          rightBarsNeeded: this.config.minRightBars,
          barIndex: i
        };

        if (!this.candidateExists(candidate)) {
          this.candidates.push(candidate);
        }
      }

      // Check for low pivot
      if (this.isPotentialLowPivot(i)) {
        const candidate: InternalPivotCandidate = {
          timestamp: bar.timestamp,
          price: bar.low,
          type: 'low',
          leftBars: this.config.minLeftBars,
          rightBarsNeeded: this.config.minRightBars,
          barIndex: i
        };

        if (!this.candidateExists(candidate)) {
          this.candidates.push(candidate);
        }
      }
    }
  }

  /**
   * Check if bar index represents a potential high pivot
   * @param index Bar index to check
   * @returns True if potential high pivot
   */
  private isPotentialHighPivot(index: number): boolean {
    const bars = this.state.bars;
    const bar = bars[index];
    if (!bar) return false;
    const currentHigh = bar.high;

    // Check left bars
    for (let i = index - this.config.minLeftBars; i < index; i++) {
      const leftBar = bars[i];
      if (i < 0 || !leftBar || leftBar.high >= currentHigh) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if bar index represents a potential low pivot
   * @param index Bar index to check
   * @returns True if potential low pivot
   */
  private isPotentialLowPivot(index: number): boolean {
    const bars = this.state.bars;
    const bar = bars[index];
    if (!bar) return false;
    const currentLow = bar.low;

    // Check left bars
    for (let i = index - this.config.minLeftBars; i < index; i++) {
      const leftBar = bars[i];
      if (i < 0 || !leftBar || leftBar.low <= currentLow) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate pivot with required right bars
   * @param candidate Pivot candidate to validate
   * @param index Bar index of candidate
   * @returns True if pivot is valid
   */
  private isPivotValid(candidate: InternalPivotCandidate, index: number): boolean {
    const bars = this.state.bars;
    const endIndex = index + candidate.rightBarsNeeded;

    if (endIndex >= bars.length) {
      return false;
    }

    if (candidate.type === 'high') {
      // Check right bars for high pivot
      for (let i = index + 1; i <= endIndex; i++) {
        const bar = bars[i];
        if (!bar || bar.high >= candidate.price) {
          return false;
        }
      }
    } else {
      // Check right bars for low pivot
      for (let i = index + 1; i <= endIndex; i++) {
        const bar = bars[i];
        if (!bar || bar.low <= candidate.price) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Create confirmed pivot from candidate
   * @param candidate Pivot candidate
   * @returns Confirmed pivot point
   */
  private createPivotFromCandidate(candidate: InternalPivotCandidate): PivotPoint {
    return {
      timestamp: candidate.timestamp,
      price: candidate.price,
      type: candidate.type,
      leftBars: candidate.leftBars,
      rightBars: candidate.rightBarsNeeded,
      strength: this.calculatePivotStrength(candidate),
      confirmed: true
    };
  }

  /**
   * Calculate pivot strength based on surrounding price action
   * @param candidate Pivot candidate
   * @returns Strength score (0-100)
   */
  private calculatePivotStrength(candidate: InternalPivotCandidate): number {
    const bars = this.state.bars;
    const index = candidate.barIndex;
    const lookback = Math.min(10, index, bars.length - index - 1);

    if (lookback < 2) {
      return 50; // Default strength for insufficient data
    }

    let totalDifference = 0;
    let count = 0;

    // Calculate average price difference in surrounding area
    for (let i = index - lookback; i <= index + lookback; i++) {
      if (i < 0 || i >= bars.length || i === index) continue;

      const bar = bars[i];
      if (!bar) continue;

      const barPrice = candidate.type === 'high' ? bar.high : bar.low;
      const difference = Math.abs(candidate.price - barPrice);
      totalDifference += difference;
      count++;
    }

    if (count === 0) {
      return 50;
    }

    const avgDifference = totalDifference / count;
    const priceRange = candidate.price * 0.01; // 1% of price as base range

    // Normalize strength to 0-100 scale
    const strength = Math.min(100, (avgDifference / priceRange) * 25);
    return Math.max(10, Math.round(strength)); // Minimum 10% strength
  }

  /**
   * Check if candidate already exists
   * @param candidate Candidate to check
   * @returns True if candidate exists
   */
  private candidateExists(candidate: InternalPivotCandidate): boolean {
    return this.candidates.some(existing =>
      existing.timestamp === candidate.timestamp &&
      existing.type === candidate.type &&
      Math.abs(existing.price - candidate.price) < 0.001
    );
  }

  /**
   * Get pivot statistics for debugging
   * @returns Pivot statistics
   */
  getStatistics(): {
    totalBars: number;
    totalPivots: number;
    activeCandidates: number;
    avgPivotStrength: number;
    lastPivotAge: number;
  } {
    const now = Date.now();
    const avgStrength = this.state.pivots.length > 0
      ? this.state.pivots.reduce((sum, p) => sum + p.strength, 0) / this.state.pivots.length
      : 0;

    const lastPivot = this.state.pivots[this.state.pivots.length - 1];
    const lastPivotAge = lastPivot ? now - lastPivot.timestamp : 0;

    return {
      totalBars: this.state.bars.length,
      totalPivots: this.state.pivots.length,
      activeCandidates: this.candidates.length,
      avgPivotStrength: Math.round(avgStrength),
      lastPivotAge
    };
  }
}
