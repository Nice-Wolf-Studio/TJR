/**
 * CSV output formatter for backtest results
 *
 * Converts backtest metrics to CSV format for analysis in spreadsheets
 * or data analysis tools like Python/R.
 *
 * @module @tjr/dev-scripts/formatters/csv
 */

import type { BacktestMetrics } from '../metrics/types';

/**
 * Backtest result data for CSV formatting
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
 * Format backtest result as CSV rows
 *
 * Generates CSV header and data row with deterministic column order.
 *
 * CSV columns:
 * - symbol: Trading symbol
 * - date: Trading date
 * - barCount: Number of bars analyzed
 * - modules: Comma-separated module names
 * - hitRate: Overall hit-rate percentage
 * - totalSignals: Total number of signals
 * - successful: Number of successful signals
 * - failed: Number of failed signals
 * - hitRateLong: Long trade hit-rate
 * - hitRateShort: Short trade hit-rate
 * - precisionK1: Precision at K=1
 * - precisionK3: Precision at K=3
 * - precisionK5: Precision at K=5
 * - precisionK10: Precision at K=10
 * - latencyMin: Minimum latency (ms)
 * - latencyMax: Maximum latency (ms)
 * - latencyMean: Mean latency (ms)
 * - latencyMedian: Median latency (ms)
 * - latencyP95: 95th percentile latency (ms)
 * - latencyP99: 99th percentile latency (ms)
 * - latencyTotal: Total duration (ms)
 * - fvgs: Number of FVGs detected
 * - orderBlocks: Number of Order Blocks detected
 * - executions: Number of execution triggers
 * - avgConfluence: Average confluence score
 * - swings: Number of swing points
 *
 * @param result - Backtest result data
 * @returns CSV string with header and data row
 *
 * @example
 * const result = {
 *   fixture: 'samples/day.json',
 *   symbol: 'ES',
 *   date: '2024-10-01',
 *   barCount: 78,
 *   modules: ['analysis-kit', 'tjr-tools'],
 *   metrics: { ... }
 * };
 * const csv = formatCsv(result);
 * console.log(csv);
 * // symbol,date,barCount,modules,hitRate,...
 * // ES,2024-10-01,78,"analysis-kit,tjr-tools",65.5,...
 */
export function formatCsv(result: BacktestResult): string {
  const header = [
    'symbol',
    'date',
    'barCount',
    'modules',
    'hitRate',
    'totalSignals',
    'successful',
    'failed',
    'hitRateLong',
    'hitRateShort',
    'precisionK1',
    'precisionK3',
    'precisionK5',
    'precisionK10',
    'latencyMin',
    'latencyMax',
    'latencyMean',
    'latencyMedian',
    'latencyP95',
    'latencyP99',
    'latencyTotal',
    'fvgs',
    'orderBlocks',
    'executions',
    'avgConfluence',
    'swings',
  ];

  const row = [
    result.symbol,
    result.date,
    result.barCount.toString(),
    result.modules.join(','),
    formatNumber(result.metrics.hitRate?.overall),
    formatNumber(result.metrics.hitRate?.totalSignals),
    formatNumber(result.metrics.hitRate?.successful),
    formatNumber(result.metrics.hitRate?.failed),
    formatNumber(result.metrics.hitRate?.long),
    formatNumber(result.metrics.hitRate?.short),
    formatNumber(result.metrics.precisionAtK?.k1),
    formatNumber(result.metrics.precisionAtK?.k3),
    formatNumber(result.metrics.precisionAtK?.k5),
    formatNumber(result.metrics.precisionAtK?.k10),
    formatNumber(result.metrics.latency.min),
    formatNumber(result.metrics.latency.max),
    formatNumber(result.metrics.latency.mean),
    formatNumber(result.metrics.latency.median),
    formatNumber(result.metrics.latency.p95),
    formatNumber(result.metrics.latency.p99),
    formatNumber(result.metrics.latency.total),
    formatNumber(result.metrics.signals.fvgs),
    formatNumber(result.metrics.signals.orderBlocks),
    formatNumber(result.metrics.signals.executions),
    formatNumber(result.metrics.signals.avgConfluence),
    formatNumber(result.metrics.signals.swings),
  ];

  return `${header.join(',')}\n${row.join(',')}`;
}

/**
 * Format number for CSV, handling undefined/null
 */
function formatNumber(value: number | undefined): string {
  if (value === undefined || value === null) {
    return '';
  }
  return value.toString();
}
