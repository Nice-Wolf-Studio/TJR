/**
 * Text summary formatter for backtest results
 *
 * Generates human-readable deterministic text summaries of backtest metrics.
 *
 * @module @tjr/dev-scripts/formatters/summary
 */

import type { BacktestMetrics } from '../metrics/types';

/**
 * Backtest result data for summary formatting
 */
export interface BacktestResult {
  fixture: string;
  symbol: string;
  date: string;
  barCount: number;
  modules: string[];
  metrics: BacktestMetrics;
}

/**
 * Generate deterministic text summary of backtest results
 *
 * Creates a human-readable multi-line summary with sections for:
 * - Fixture metadata (symbol, date, bars, modules)
 * - Hit-rate metrics (overall, long, short)
 * - Precision@K metrics
 * - Latency metrics
 * - Signal counts
 *
 * Output is deterministic - same input always produces same output.
 *
 * @param result - Backtest result data
 * @returns Multi-line text summary
 *
 * @example
 * const result = { ... };
 * const summary = formatSummary(result);
 * console.log(summary);
 * // === Backtest Summary ===
 * // Fixture: samples/day.json
 * // Symbol: ES | Date: 2024-10-01 | Bars: 78
 * // Modules: analysis-kit, tjr-tools
 * //
 * // Hit-Rate: 65.5% (29/45 signals)
 * //   Long:  70.0% (14/20)
 * //   Short: 60.0% (15/25)
 * // ...
 */
export function formatSummary(result: BacktestResult): string {
  const lines: string[] = [];

  // Header
  lines.push('=== Backtest Summary ===');
  lines.push(`Fixture: ${result.fixture}`);
  lines.push(`Symbol: ${result.symbol} | Date: ${result.date} | Bars: ${result.barCount}`);
  lines.push(`Modules: ${result.modules.join(', ')}`);
  lines.push('');

  // Hit-rate section
  if (result.metrics.hitRate) {
    const hr = result.metrics.hitRate;
    lines.push(`Hit-Rate: ${hr.overall}% (${hr.successful}/${hr.totalSignals} signals)`);
    lines.push(`  Long:  ${hr.long}%`);
    lines.push(`  Short: ${hr.short}%`);
    lines.push('');
  }

  // Precision@K section
  if (result.metrics.precisionAtK) {
    const pk = result.metrics.precisionAtK;
    lines.push('Precision@K:');
    lines.push(`  @1: ${pk.k1}% | @3: ${pk.k3}% | @5: ${pk.k5}% | @10: ${pk.k10}%`);
    lines.push('');
  }

  // Latency section
  const lat = result.metrics.latency;
  lines.push('Latency (ms):');
  lines.push(`  Mean: ${lat.mean} | Median: ${lat.median} | P95: ${lat.p95} | P99: ${lat.p99}`);
  lines.push(`  Min: ${lat.min} | Max: ${lat.max} | Total: ${lat.total}`);
  lines.push('');

  // Signals section
  const sig = result.metrics.signals;
  const signalParts: string[] = [];
  if (sig.fvgs !== undefined) signalParts.push(`FVGs: ${sig.fvgs}`);
  if (sig.orderBlocks !== undefined) signalParts.push(`Order Blocks: ${sig.orderBlocks}`);
  if (sig.executions !== undefined) signalParts.push(`Executions: ${sig.executions}`);
  if (sig.swings !== undefined) signalParts.push(`Swings: ${sig.swings}`);

  if (signalParts.length > 0) {
    lines.push('Signals:');
    lines.push(`  ${signalParts.join(' | ')}`);
  }

  if (sig.avgConfluence !== undefined) {
    lines.push(`  Avg Confluence: ${sig.avgConfluence}`);
  }

  return lines.join('\n');
}

/**
 * Generate compact one-line summary for JSON data field
 *
 * Provides a terse summary suitable for embedding in JSON output.
 *
 * @param result - Backtest result data
 * @returns Single-line summary string
 *
 * @example
 * const result = { ... };
 * const summary = formatCompactSummary(result);
 * // => "65.5% hit-rate | 5 executions | 265ms total"
 */
export function formatCompactSummary(result: BacktestResult): string {
  const parts: string[] = [];

  if (result.metrics.hitRate) {
    parts.push(`${result.metrics.hitRate.overall}% hit-rate`);
  }

  if (result.metrics.signals.executions !== undefined) {
    parts.push(`${result.metrics.signals.executions} executions`);
  }

  parts.push(`${result.metrics.latency.total}ms total`);

  return parts.join(' | ');
}
