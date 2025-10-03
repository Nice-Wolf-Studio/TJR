#!/usr/bin/env node

/**
 * backtest - Run analysis modules on historical bar data for backtesting
 *
 * PURPOSE:
 * Runs analysis-kit functions on historical bar data to validate:
 * - Analysis correctness (do functions detect expected patterns?)
 * - Regression testing (do code changes break existing behavior?)
 * - Performance benchmarking (how fast does analysis run?)
 * - Metrics calculation (hit rate, precision, signal counts)
 *
 * USAGE:
 *   backtest --fixture=path.json --modules=analysis-kit [--json | --csv] [--pretty]
 *
 * DESIGN DECISIONS:
 * - Read-only operation: Does not modify any state
 * - Requires --fixture=path.json argument (path to bar data)
 * - Fixture format: { symbol, date, timeframe, bars: Bar[] }
 * - Supports --modules parameter to select which analysis to run
 * - Outputs deterministic metrics in JSON or CSV format
 * - Can be used in CI for automated regression testing
 *
 * EXIT CODES:
 *   0 - Analysis completed successfully
 *   2 - Fatal error (fixture not found, invalid format, etc.)
 *
 * FIXTURE FORMAT (examples/backtest-day.json):
 * {
 *   "symbol": "ES",
 *   "date": "2024-10-01",
 *   "timeframe": "5m",
 *   "bars": [
 *     { "timestamp": 1234567890000, "open": 100, "high": 105, "low": 99, "close": 104, "volume": 15000 },
 *     ...
 *   ]
 * }
 *
 * EXAMPLE OUTPUT (JSON):
 * {
 *   "success": true,
 *   "command": "backtest",
 *   "timestamp": "2025-09-30T12:34:56.789Z",
 *   "data": {
 *     "fixture": "examples/backtest-day.json",
 *     "symbol": "ES",
 *     "date": "2024-10-01",
 *     "timeframe": "5m",
 *     "barCount": 78,
 *     "modules": ["analysis-kit"],
 *     "metrics": {
 *       "swings": {
 *         "total": 12,
 *         "higherHighs": 4,
 *         "higherLows": 3,
 *         "lowerHighs": 2,
 *         "lowerLows": 3
 *       },
 *       "bias": {
 *         "value": "bullish",
 *         "confidence": 0.75
 *       },
 *       "profile": {
 *         "type": "trend_day",
 *         "direction": "up"
 *       }
 *     },
 *     "duration": "45ms"
 *   }
 * }
 */

import { parseArgs, printHelp, outputResult, createResult } from '../src/cli-utils';
import { readFileSync } from 'fs';

// Import analysis-kit functions
import {
  detectSwings,
  calculateDailyBias,
  extractSessionExtremes,
  classifyDayProfile,
  type Bar,
  type SwingPoint,
  type BiasResult,
  type DayProfile,
} from '@tjr/analysis-kit';

interface BarFixture {
  symbol: string;
  date: string;
  timeframe: string;
  bars: Bar[];
}

interface BacktestMetrics {
  swings?: {
    total: number;
    higherHighs: number;
    higherLows: number;
    lowerHighs: number;
    lowerLows: number;
    points: SwingPoint[];
  };
  bias?: BiasResult;
  profile?: DayProfile;
  sessionExtremes?: {
    rthOpen: number;
    rthClose: number;
    rthHigh: number;
    rthLow: number;
  };
}

// Main execution
async function main(): Promise<void> {
  // Parse command-line arguments
  const args = parseArgs(process.argv.slice(2), false);

  // Show help if requested
  if (args.help) {
    printHelp(
      'backtest',
      'Run analysis modules on historical bar data',
      'Required: --fixture=path.json\n' +
        'Optional: --modules=analysis-kit (comma-separated)\n' +
        'Optional: --json (default) or --csv for output format\n' +
        'This operation analyzes bars and outputs metrics.\n' +
        'All analysis is read-only and deterministic.'
    );
    process.exit(0);
  }

  // Validate required --fixture argument
  if (!args.fixture) {
    const result = createResult('backtest', false, null, {
      errors: ['Missing required argument: --fixture=path.json'],
    });
    outputResult(result, args.pretty);
    process.exit(2);
  }

  try {
    // Load fixture file
    const fixture = loadBarFixture(args.fixture);

    // Validate fixture format
    validateBarFixture(fixture);

    // Determine which modules to run
    const modulesArg = (args as { modules?: string }).modules;
    const modules = modulesArg
      ? modulesArg.split(',').map((m: string) => m.trim())
      : ['analysis-kit'];

    // Run analysis and collect metrics
    const startTime = Date.now();
    const metrics = runAnalysis(fixture.bars, modules);
    const duration = Date.now() - startTime;

    // Create result object
    const result = createResult('backtest', true, {
      fixture: args.fixture,
      symbol: fixture.symbol,
      date: fixture.date,
      timeframe: fixture.timeframe,
      barCount: fixture.bars.length,
      modules,
      metrics,
      duration: `${duration}ms`,
    });

    // Output result
    outputResult(result, args.pretty);

    process.exit(0);
  } catch (error) {
    // Fatal error occurred
    const errorMessage = error instanceof Error ? error.message : String(error);
    const result = createResult('backtest', false, null, {
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
    throw new Error(
      `Failed to parse fixture JSON: ${error instanceof Error ? error.message : String(error)}`
    );
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

  // Validate each bar has required OHLCV fields
  for (let i = 0; i < fixture.bars.length; i++) {
    const bar = fixture.bars[i];
    if (!bar || typeof bar !== 'object') {
      throw new Error(`Bar at index ${i} is not an object`);
    }
    const requiredFields = ['timestamp', 'open', 'high', 'low', 'close', 'volume'];
    for (const field of requiredFields) {
      if (!(field in bar)) {
        throw new Error(`Bar at index ${i} missing required field: ${field}`);
      }
    }
  }
}

/**
 * Run analysis modules and collect metrics
 */
function runAnalysis(bars: Bar[], modules: string[]): BacktestMetrics {
  const metrics: BacktestMetrics = {};

  for (const module of modules) {
    if (module === 'analysis-kit' || module === 'all') {
      // Run swing detection
      const swings = detectSwings(bars, 3); // lookback = 3
      metrics.swings = {
        total: swings.length,
        higherHighs: swings.filter((s: SwingPoint) => s.type === 'HH').length,
        higherLows: swings.filter((s: SwingPoint) => s.type === 'HL').length,
        lowerHighs: swings.filter((s: SwingPoint) => s.type === 'LH').length,
        lowerLows: swings.filter((s: SwingPoint) => s.type === 'LL').length,
        points: swings,
      };

      // Extract session extremes (using full day as RTH window for simplicity)
      if (bars.length > 0) {
        const firstBar = bars[0];
        const lastBar = bars[bars.length - 1];
        if (firstBar && lastBar) {
          const rthWindow = {
            start: new Date(firstBar.timestamp),
            end: new Date(lastBar.timestamp),
          };

          const sessionExtremes = extractSessionExtremes(bars, rthWindow);

          if (sessionExtremes) {
            metrics.sessionExtremes = sessionExtremes;

            // Calculate daily bias
            const bias = calculateDailyBias(bars, sessionExtremes);
            metrics.bias = bias;

            // Classify day profile
            const profile = classifyDayProfile(bars, sessionExtremes);
            metrics.profile = profile;
          }
        }
      }
    }
  }

  return metrics;
}

// Run main function
main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(2);
});
