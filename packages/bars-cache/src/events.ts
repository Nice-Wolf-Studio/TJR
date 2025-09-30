/**
 * Event bus for market data cache corrections.
 *
 * Emits events when bar data is corrected (revision > 1), allowing
 * downstream systems to react to data changes. This is critical for:
 * - Alerting traders to revised prices
 * - Updating calculations that depend on historical bars
 * - Audit trails and compliance
 * - Debugging data quality issues
 */

import type { Timeframe } from '@tjr-suite/market-data-core'
import type { CachedBar } from './types.js'

/**
 * Event emitted when a bar is corrected with a higher revision.
 *
 * Contains both old and new bar data to enable detailed analysis
 * of what changed and why.
 */
export interface CorrectionEvent {
  /**
   * Symbol that was corrected (e.g., 'AAPL', 'ES').
   */
  symbol: string

  /**
   * Timeframe of the corrected bar (e.g., '1m', '5m', '1h').
   */
  timeframe: Timeframe

  /**
   * Bar timestamp (Unix milliseconds, UTC).
   */
  timestamp: number

  /**
   * Previous bar data before correction.
   *
   * Null if this is the first time we're seeing this bar.
   */
  oldBar: CachedBar | null

  /**
   * New bar data after correction.
   */
  newBar: CachedBar

  /**
   * Type of correction event.
   *
   * - 'revision': Higher revision number from same provider
   * - 'provider_override': Different provider with higher priority
   * - 'initial': First time seeing this bar (no old data)
   */
  correctionType: 'revision' | 'provider_override' | 'initial'

  /**
   * Unix timestamp (ms) when the correction was detected.
   */
  detectedAt: number
}

/**
 * Event listener callback for correction events.
 */
export type CorrectionEventListener = (event: CorrectionEvent) => void

/**
 * Event bus for cache correction events.
 *
 * Implements a simple pub-sub pattern for correction events.
 * Subscribers can listen to all corrections or filter by symbol/timeframe.
 *
 * Thread-safety: This implementation is NOT thread-safe. If used in a
 * concurrent environment, external synchronization is required.
 *
 * Example:
 * ```typescript
 * const eventBus = new EventBus();
 *
 * // Subscribe to all correction events
 * eventBus.on('correction', (event) => {
 *   console.log(`Correction detected for ${event.symbol} at ${event.timestamp}`);
 *   console.log(`Old: ${event.oldBar?.close}, New: ${event.newBar.close}`);
 * });
 *
 * // Emit a correction event
 * eventBus.emit('correction', {
 *   symbol: 'AAPL',
 *   timeframe: '5m',
 *   timestamp: Date.now(),
 *   oldBar: { ...oldData },
 *   newBar: { ...newData },
 *   correctionType: 'revision',
 *   detectedAt: Date.now()
 * });
 * ```
 */
export class EventBus {
  private listeners: Map<string, CorrectionEventListener[]>

  constructor() {
    this.listeners = new Map()
  }

  /**
   * Subscribe to correction events.
   *
   * @param eventType - Event type to listen for (currently only 'correction')
   * @param listener - Callback function to invoke on events
   * @returns Unsubscribe function
   *
   * Example:
   * ```typescript
   * const unsubscribe = eventBus.on('correction', (event) => {
   *   if (event.symbol === 'AAPL') {
   *     console.log('AAPL correction:', event);
   *   }
   * });
   *
   * // Later: stop listening
   * unsubscribe();
   * ```
   */
  on(eventType: 'correction', listener: CorrectionEventListener): () => void {
    const eventListeners = this.listeners.get(eventType) ?? []
    eventListeners.push(listener)
    this.listeners.set(eventType, eventListeners)

    // Return unsubscribe function
    return () => {
      this.off(eventType, listener)
    }
  }

  /**
   * Unsubscribe from correction events.
   *
   * @param eventType - Event type to stop listening for
   * @param listener - Listener function to remove
   */
  off(eventType: 'correction', listener: CorrectionEventListener): void {
    const eventListeners = this.listeners.get(eventType) ?? []
    const index = eventListeners.indexOf(listener)
    if (index !== -1) {
      eventListeners.splice(index, 1)
    }

    if (eventListeners.length === 0) {
      this.listeners.delete(eventType)
    } else {
      this.listeners.set(eventType, eventListeners)
    }
  }

  /**
   * Emit a correction event to all subscribers.
   *
   * @param eventType - Event type to emit (currently only 'correction')
   * @param event - Correction event data
   *
   * Example:
   * ```typescript
   * eventBus.emit('correction', {
   *   symbol: 'ES',
   *   timeframe: '1m',
   *   timestamp: 1633024800000,
   *   oldBar: oldData,
   *   newBar: newData,
   *   correctionType: 'revision',
   *   detectedAt: Date.now()
   * });
   * ```
   */
  emit(eventType: 'correction', event: CorrectionEvent): void {
    const eventListeners = this.listeners.get(eventType) ?? []

    // Invoke all listeners synchronously
    for (const listener of eventListeners) {
      try {
        listener(event)
      } catch (error) {
        // Swallow errors from individual listeners to not disrupt others
        // In production, you might want to log these to a proper logger
      }
    }
  }

  /**
   * Get the number of active listeners for an event type.
   *
   * @param eventType - Event type to check
   * @returns Number of active listeners
   */
  listenerCount(eventType: 'correction'): number {
    return this.listeners.get(eventType)?.length ?? 0
  }

  /**
   * Remove all listeners for all event types.
   */
  removeAllListeners(): void {
    this.listeners.clear()
  }

  /**
   * Remove all listeners for a specific event type.
   *
   * @param eventType - Event type to clear listeners for
   */
  removeAllListenersForEvent(eventType: 'correction'): void {
    this.listeners.delete(eventType)
  }
}

/**
 * Utility function to detect the type of correction.
 *
 * Determines whether a bar update is a revision, provider override,
 * or initial insertion.
 *
 * @param oldBar - Previous bar data (null if not present)
 * @param newBar - New bar data
 * @returns Correction type
 */
export function detectCorrectionType(
  oldBar: CachedBar | null,
  newBar: CachedBar
): 'revision' | 'provider_override' | 'initial' {
  if (oldBar === null) {
    return 'initial'
  }

  // Same provider, higher revision
  if (oldBar.provider === newBar.provider && newBar.revision > oldBar.revision) {
    return 'revision'
  }

  // Different provider (priority-based override)
  if (oldBar.provider !== newBar.provider) {
    return 'provider_override'
  }

  // Same provider, same revision (this shouldn't trigger a correction event)
  // but we'll classify it as a revision for consistency
  return 'revision'
}

/**
 * Helper to create a correction event.
 *
 * @param symbol - Symbol identifier
 * @param timeframe - Timeframe
 * @param timestamp - Bar timestamp
 * @param oldBar - Previous bar (null if new)
 * @param newBar - New bar
 * @returns Correction event object
 */
export function createCorrectionEvent(
  symbol: string,
  timeframe: Timeframe,
  timestamp: number,
  oldBar: CachedBar | null,
  newBar: CachedBar
): CorrectionEvent {
  return {
    symbol,
    timeframe,
    timestamp,
    oldBar,
    newBar,
    correctionType: detectCorrectionType(oldBar, newBar),
    detectedAt: Date.now(),
  }
}