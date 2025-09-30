#!/usr/bin/env node

/**
 * replay-run - Backtesting CLI v2 with metrics and reports
 *
 * PURPOSE:
 * Runs analysis modules on historical bar data and computes comprehensive metrics:
 * - Hit-rate: Success rate of trading signals
 * - Precision@K: Relevance of top-K predictions
 * - Latency: Performance benchmarking
 * - Signal counts: FVGs, Order Blocks, Executions, Swings
 *
 * USAGE:
 *   replay-run --fixture=path.json --modules=analysis-kit,tjr-tools [--json|--csv] [--pretty]
 *
 * EXIT CODES:
 *   0 - Analysis completed successfully
 *   2 - Fatal error (fixture not found, invalid format, etc.)
 */

import { parseArgs, printHelp, outputResult, createResult } from '../src/cli-utils';
import { readFileSync } from 'fs';

// Import analysis modules
import { detectSwings, type Bar as AnalysisBar } from '@tjr/analysis-kit';
import { analyze as tjrAnalyze } from '@tjr/tjr-tools';
import type { Timeframe, MarketBar } from '@tjr/contracts';

// Import metrics and formatters
import { LatencyTracker, type BacktestMetrics, type SignalMetrics } from '../src/metrics';
import { formatCsv, formatSummary, formatCompactSummary } from '../src/formatters';

interface BarFixture {
  symbol: string;
  date: string;
  timeframe: string;
  bars: MarketBar[];
  expected?: {
    fvgCount?: number;
    orderBlockCount?: number;
    executionCount?: number;
    hitRate?: number;
  };
}

// Main execution
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), false);

  if (args.help) {
    printHelp(
      'replay-run',
      'Run backtesting analysis with metrics computation',
      'Required: --fixture=path.json\n' +
        'Optional: --modules=analysis-kit,tjr-tools (comma-separated)\n' +
        'Optional: --json (default) or --csv for output format\n' +
        'Optional: --pretty for human-readable text summary\n' +
        'This operation analyzes bars and outputs comprehensive metrics.'
    );
    process.exit(0);
  }

  if (!args.fixture) {
    const result = createResult('replay-run', false, null, {
      errors: ['Missing required argument: --fixture=path.json'],
    });
    outputResult(result, args.pretty);
    process.exit(2);
  }

  try {
    // Load fixture
    const fixture = loadBarFixture(args.fixture);
    validateBarFixture(fixture);

    // Determine modules to run
    const modulesArg = args.modules || 'analysis-kit,tjr-tools';
    const modules = modulesArg.split(',').map(m => m.trim());

    // Run analysis and collect metrics
    const latencyTracker = new LatencyTracker();
    const signals: SignalMetrics = {};

    // Run analysis-kit if requested
    if (modules.includes('analysis-kit') || modules.includes('all')) {
      latencyTracker.start();
      // Convert MarketBar to analysis-kit Bar format (timestamp as number)
      const bars: AnalysisBar[] = fixture.bars.map(b => ({
        ...b,
        timestamp: new Date(b.timestamp).getTime()
      }));
      const swings = detectSwings(bars, 3);
      latencyTracker.stop();

      signals.swings = swings.length;
    }

    // Run tjr-tools if requested
    if (modules.includes('tjr-tools') || modules.includes('all')) {
      latencyTracker.start();
      const result = tjrAnalyze({
        symbol: fixture.symbol,
        timeframe: fixture.timeframe as Timeframe,
        bars: fixture.bars,
        analysisTimestamp: new Date().toISOString(),
      });
      latencyTracker.stop();

      signals.fvgs = result.fvgZones.length;
      signals.orderBlocks = result.orderBlocks.length;
      signals.executions = result.execution ? 1 : 0;

      // Calculate average confluence
      if (result.confluence.score > 0) {
        signals.avgConfluence = Math.round(result.confluence.score * 10) / 10;
      }
    }

    // Compute final metrics
    const metrics: BacktestMetrics = {
      latency: latencyTracker.getMetrics(),
      signals,
    };

    // Format output based on flags
    if (args.csv) {
      const csvData = formatCsv({
        fixture: args.fixture,
        symbol: fixture.symbol,
        date: fixture.date,
        barCount: fixture.bars.length,
        modules,
        metrics,
      });
      console.log(csvData);
      process.exit(0);
    }

    if (args.pretty) {
      const summary = formatSummary({
        fixture: args.fixture,
        symbol: fixture.symbol,
        date: fixture.date,
        barCount: fixture.bars.length,
        modules,
        metrics,
      });
      console.log(summary);
      process.exit(0);
    }

    // Default JSON output
    const compactSummary = formatCompactSummary({
      fixture: args.fixture,
      symbol: fixture.symbol,
      date: fixture.date,
      barCount: fixture.bars.length,
      modules,
      metrics,
    });

    const result = createResult('replay-run', true, {
      fixture: args.fixture,
      symbol: fixture.symbol,
      date: fixture.date,
      barCount: fixture.bars.length,
      modules,
      metrics,
      summary: compactSummary,
    });

    outputResult(result, false);
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const result = createResult('replay-run', false, null, {
      errors: [errorMessage],
    });

    outputResult(result, args.pretty);
    process.exit(2);
  }
}

/**
 * Load bar fixture from disk
 */
function loadBarFixture(fixturePath: string): BarFixture {
  try {
    const fileContent = readFileSync(fixturePath, 'utf-8');
    return JSON.parse(fileContent) as BarFixture;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Fixture file not found: ${fixturePath}`);
    }
    throw new Error(`Failed to parse fixture JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate bar fixture format
 */
function validateBarFixture(data: unknown): asserts data is BarFixture {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Fixture must be an object');
  }

  const fixture = data as Partial<BarFixture>;

  if (!fixture.symbol || typeof fixture.symbol !== 'string') {
    throw new Error('Fixture missing required field: symbol');
  }

  if (!fixture.date || typeof fixture.date !== 'string') {
    throw new Error('Fixture missing required field: date');
  }

  if (!fixture.timeframe || typeof fixture.timeframe !== 'string') {
    throw new Error('Fixture missing required field: timeframe');
  }

  if (!Array.isArray(fixture.bars)) {
    throw new Error('Fixture missing required field: bars (must be array)');
  }

  if (fixture.bars.length === 0) {
    throw new Error('Fixture bars array is empty');
  }
}

// Run main function
main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(2);
});