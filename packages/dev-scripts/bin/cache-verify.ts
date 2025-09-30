#!/usr/bin/env node

/**
 * cache-verify - Display cache corrections and verify data integrity
 *
 * PURPOSE:
 * Shows correction events for cached market data bars, helping identify:
 * - Late revisions from data providers
 * - Provider priority overrides
 * - Data quality issues requiring attention
 * - Stale bars that need refreshing
 *
 * USAGE:
 *   cache-verify --symbol <SYMBOL> --timeframe <TF> --window <N> [--help] [--pretty]
 *
 * REQUIRED FLAGS:
 *   --symbol      Symbol to verify (e.g., ES, AAPL, BTC-USD)
 *   --timeframe   Timeframe to verify (e.g., 1m, 5m, 1h, 1D)
 *   --window      Number of recent bars to check
 *
 * OPTIONAL FLAGS:
 *   --pretty      Format output with colors and indentation
 *   --help        Show this help message
 *
 * DESIGN DECISIONS:
 * - Read-only operation: No cache modifications
 * - Shows before/after data for corrections
 * - Reports staleness based on TTL policies
 * - Groups corrections by type (revision, provider override)
 *
 * EXIT CODES:
 *   0 - Verification completed successfully
 *   1 - Warnings found (stale bars, corrections detected)
 *   2 - Critical errors (cache unavailable, missing data)
 *
 * EXAMPLE OUTPUT (JSON):
 * {
 *   "success": true,
 *   "command": "cache-verify",
 *   "timestamp": "2025-09-30T12:34:56.789Z",
 *   "data": {
 *     "symbol": "ES",
 *     "timeframe": "1m",
 *     "window": 200,
 *     "totalBars": 198,
 *     "freshBars": 180,
 *     "staleBars": 18,
 *     "corrections": [
 *       {
 *         "timestamp": 1633024800000,
 *         "type": "revision",
 *         "before": { "close": 4502.5, "volume": 1000, "revision": 1 },
 *         "after": { "close": 4503.0, "volume": 1050, "revision": 2 },
 *         "detectedAt": "2025-09-30T12:30:00.000Z"
 *       }
 *     ]
 *   }
 * }
 */

import { parseArgs, printHelp, outputResult, createResult } from '../src/cli-utils';
import { connect } from '@tjr-suite/db-simple';
import type { DbConnection } from '@tjr-suite/db-simple';
import {
  CacheStore,
  DbCacheStore,
  MarketDataCacheService,
  EventBus,
  getStaleBars,
} from '@tjr/bars-cache';
import type { CachedBar, CorrectionEvent, Timeframe } from '@tjr/bars-cache';

// Main execution
async function main(): Promise<void> {
  // Parse command-line arguments with custom parsing for cache-verify flags
  const rawArgs = process.argv.slice(2);
  const args = parseCustomArgs(rawArgs);

  // Show help if requested
  if (args.help) {
    printHelp(
      'cache-verify',
      'Display cache corrections and verify data integrity',
      'Shows correction events and staleness for cached market data bars.\n\n' +
        'Required flags:\n' +
        '  --symbol <SYMBOL>      Symbol to verify (e.g., ES, AAPL)\n' +
        '  --timeframe <TF>       Timeframe (e.g., 1m, 5m, 1h, 1D)\n' +
        '  --window <N>           Number of recent bars to check\n\n' +
        'Example:\n' +
        '  cache-verify --symbol ES --timeframe 1m --window 200 --pretty'
    );
    process.exit(0);
  }

  // Validate required arguments
  if (!args.symbol || !args.timeframe || !args.window) {
    const result = createResult('cache-verify', false, null, {
      errors: ['Missing required arguments: --symbol, --timeframe, and --window are required'],
    });
    outputResult(result, args.pretty);
    process.exit(2);
  }

  let db: DbConnection | null = null;

  try {
    // Connect to database
    const dbPath = process.env.CACHE_DB_PATH || 'data/cache.db';
    db = await connect(`sqlite:${dbPath}`);

    // Initialize cache service
    const memCache = new CacheStore(10000);
    const dbCache = new DbCacheStore(db, ['polygon', 'yahoo', 'alpaca']);
    await dbCache.init();

    const eventBus = new EventBus();
    const service = new MarketDataCacheService(
      memCache,
      dbCache,
      ['polygon', 'yahoo', 'alpaca'],
      eventBus
    );

    // Track corrections
    const corrections: CorrectionEvent[] = [];
    eventBus.on('correction', (event) => corrections.push(event));

    // Calculate time range based on window
    const now = Date.now();
    const windowMs = calculateWindowMs(args.timeframe as Timeframe, args.window);
    const start = now - windowMs;
    const end = now;

    // Query bars from cache
    const bars = await service.getBars({
      symbol: args.symbol,
      timeframe: args.timeframe as Timeframe,
      start,
      end,
    });

    if (bars.length === 0) {
      const result = createResult('cache-verify', false, null, {
        warnings: [`No cached bars found for ${args.symbol} ${args.timeframe} in the last ${args.window} bars`],
      });
      outputResult(result, args.pretty);
      process.exit(1);
    }

    // Check for stale bars
    const staleBars = getStaleBars(bars, args.timeframe as Timeframe);

    // Format corrections for output
    const formattedCorrections = corrections.map((c) => ({
      timestamp: c.timestamp,
      timestampISO: new Date(c.timestamp).toISOString(),
      type: c.correctionType,
      before: c.oldBar
        ? {
            open: c.oldBar.open,
            high: c.oldBar.high,
            low: c.oldBar.low,
            close: c.oldBar.close,
            volume: c.oldBar.volume,
            provider: c.oldBar.provider,
            revision: c.oldBar.revision,
          }
        : null,
      after: {
        open: c.newBar.open,
        high: c.newBar.high,
        low: c.newBar.low,
        close: c.newBar.close,
        volume: c.newBar.volume,
        provider: c.newBar.provider,
        revision: c.newBar.revision,
      },
      detectedAt: new Date(c.detectedAt).toISOString(),
    }));

    // Build verification data
    const verificationData = {
      symbol: args.symbol,
      timeframe: args.timeframe,
      window: args.window,
      totalBars: bars.length,
      freshBars: bars.length - staleBars.length,
      staleBars: staleBars.length,
      corrections: formattedCorrections,
      revisionCounts: countByRevision(bars),
      providerCounts: countByProvider(bars),
    };

    // Determine warnings
    const warnings: string[] = [];
    if (staleBars.length > 0) {
      warnings.push(`${staleBars.length} stale bars need refreshing`);
    }
    if (corrections.length > 0) {
      warnings.push(`${corrections.length} corrections detected`);
    }

    // Create result
    const exitCode = warnings.length > 0 ? 1 : 0;
    const result = createResult('cache-verify', exitCode === 0, verificationData, {
      warnings: warnings.length > 0 ? warnings : undefined,
    });

    outputResult(result, args.pretty);

    await db.close();
    process.exit(exitCode);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const result = createResult('cache-verify', false, null, {
      errors: [errorMessage],
    });

    outputResult(result, args.pretty);

    if (db) {
      await db.close();
    }
    process.exit(2);
  }
}

/**
 * Parse custom command-line arguments for cache-verify
 */
function parseCustomArgs(args: string[]): {
  help: boolean;
  pretty: boolean;
  symbol?: string;
  timeframe?: string;
  window?: number;
} {
  const result: any = {
    help: false,
    pretty: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--pretty') {
      result.pretty = true;
    } else if (arg === '--symbol' && i + 1 < args.length) {
      const symbol = args[++i];
      if (!/^[A-Z0-9\-._]+$/i.test(symbol)) {
        throw new Error(`Invalid symbol format: ${symbol}`);
      }
      result.symbol = symbol;
    } else if (arg === '--timeframe' && i + 1 < args.length) {
      const timeframe = args[++i];
      const validTimeframes = ['1m', '5m', '10m', '15m', '30m', '1h', '2h', '4h', '1D'];
      if (!validTimeframes.includes(timeframe)) {
        throw new Error(`Invalid timeframe: ${timeframe}. Valid options: ${validTimeframes.join(', ')}`);
      }
      result.timeframe = timeframe;
    } else if (arg === '--window' && i + 1 < args.length) {
      const window = parseInt(args[++i], 10);
      if (isNaN(window) || window <= 0 || window > 10000) {
        throw new Error(`Invalid window: must be a number between 1 and 10000`);
      }
      result.window = window;
    }
  }

  return result;
}

/**
 * Calculate window in milliseconds based on timeframe and bar count
 */
function calculateWindowMs(timeframe: Timeframe, window: number): number {
  const timeframeMs: Record<string, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '10m': 10 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '2h': 2 * 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1D': 24 * 60 * 60 * 1000,
  };

  const intervalMs = timeframeMs[timeframe] || 60 * 1000;
  return intervalMs * window;
}

/**
 * Count bars by revision number
 */
function countByRevision(bars: CachedBar[]): Record<number, number> {
  const counts: Record<number, number> = {};

  for (const bar of bars) {
    counts[bar.revision] = (counts[bar.revision] || 0) + 1;
  }

  return counts;
}

/**
 * Count bars by provider
 */
function countByProvider(bars: CachedBar[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const bar of bars) {
    counts[bar.provider] = (counts[bar.provider] || 0) + 1;
  }

  return counts;
}

// Run main function
main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(2);
});