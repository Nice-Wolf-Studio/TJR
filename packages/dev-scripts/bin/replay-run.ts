#!/usr/bin/env node

/**
 * replay-run - Re-run historical bar data through parsers for regression testing
 *
 * PURPOSE:
 * Replays historical market data bars through parsing logic to validate:
 * - Parser correctness (does it extract expected signals?)
 * - Regression testing (do code changes break existing behavior?)
 * - Performance benchmarking (how fast does parsing run?)
 * - Edge case coverage (test rare market conditions)
 *
 * USAGE:
 *   replay-run --fixture=path.json [--help] [--pretty] [--execute | --dry-run]
 *
 * DESIGN DECISIONS:
 * - Mutating operation: Defaults to --dry-run mode (parser state not modified)
 * - Requires --fixture=path.json argument (path to test data)
 * - Fixture format: Array of objects with { id, text, timestamp, expectedResult }
 * - Reports pass/fail per bar and summary statistics
 * - Can be used in CI for automated regression testing
 *
 * EXIT CODES:
 *   0 - All bars processed successfully (100% pass rate)
 *   1 - Some bars failed (parser errors or mismatches)
 *   2 - Fatal error (fixture not found, invalid format, etc.)
 *
 * IMPLEMENTATION STATUS: STUB
 * This is a stub implementation that reads fixtures and returns fake results.
 * Future implementation will:
 * - Load actual parser logic from @tjr-suite/parser
 * - Execute parser on each bar in fixture
 * - Compare parser output with expectedResult
 * - Track timing and memory usage
 * - Support filtering by date range or bar ID
 *
 * FIXTURE FORMAT (examples/es_2024-10-01.json):
 * [
 *   {
 *     "id": "es_2024-10-01_09:30:00",
 *     "text": "ES 5850.25 +12.50 vol 15234",
 *     "timestamp": "2024-10-01T09:30:00Z",
 *     "expectedResult": {
 *       "symbol": "ES",
 *       "price": 5850.25,
 *       "change": 12.50,
 *       "volume": 15234
 *     }
 *   }
 * ]
 *
 * EXAMPLE OUTPUT (JSON):
 * {
 *   "success": true,
 *   "command": "replay-run",
 *   "timestamp": "2025-09-29T12:34:56.789Z",
 *   "dryRun": true,
 *   "data": {
 *     "fixture": "examples/es_2024-10-01.json",
 *     "totalBars": 8,
 *     "passed": 7,
 *     "failed": 1,
 *     "skipped": 0,
 *     "duration": "45ms",
 *     "failures": [
 *       {
 *         "barId": "es_2024-10-01_14:15:00",
 *         "reason": "Expected volume 12345, got 12344"
 *       }
 *     ]
 *   }
 * }
 */

import { parseArgs, printHelp, outputResult, createResult } from '../src/cli-utils';
import { readFileSync } from 'fs';

// Main execution
async function main(): Promise<void> {
  // Parse command-line arguments
  // Note: defaultDryRun=true because this modifies parser state
  const args = parseArgs(process.argv.slice(2), true);

  // Show help if requested
  if (args.help) {
    printHelp(
      'replay-run',
      'Re-run historical bar data through parsers',
      'Required: --fixture=path.json\n' +
      'This operation processes bars through parser logic.\n' +
      'Use --execute to actually modify parser state (if applicable).\n' +
      'Defaults to --dry-run mode (read-only validation).'
    );
    process.exit(0);
  }

  // Validate required --fixture argument
  if (!args.fixture) {
    const result = createResult('replay-run', false, null, {
      errors: ['Missing required argument: --fixture=path.json'],
    });
    outputResult(result, args.pretty);
    process.exit(2);
  }

  try {
    // Load fixture file
    const fixtureData = loadFixture(args.fixture);

    // Validate fixture format
    validateFixture(fixtureData);

    // Determine if this is a dry-run or actual execution
    const isDryRun = args.dryRun;

    // STUB: In real implementation, would run parser on each bar
    // For now, simulate processing with fake results
    const replayResults = generateStubReplayResults(args.fixture, fixtureData);

    // Create result object
    const result = createResult('replay-run', replayResults.failed === 0, replayResults, {
      dryRun: isDryRun,
      warnings: isDryRun
        ? ['Dry-run mode: Parser state not modified. Use --execute for actual replay.']
        : replayResults.failed > 0
        ? [`${replayResults.failed} bars failed - check failures array for details`]
        : undefined,
    });

    // Output result in JSON or pretty format
    outputResult(result, args.pretty);

    // Exit with appropriate code
    // 0 if all passed, 1 if some failed
    process.exit(replayResults.failed > 0 ? 1 : 0);
  } catch (error) {
    // Fatal error occurred
    const errorMessage = error instanceof Error ? error.message : String(error);
    const result = createResult('replay-run', false, null, {
      errors: [errorMessage],
      dryRun: args.dryRun,
    });

    outputResult(result, args.pretty);
    process.exit(2);
  }
}

/**
 * Load fixture file from disk
 *
 * @param fixturePath - Path to fixture JSON file
 * @returns Parsed fixture data
 * @throws Error if file not found or invalid JSON
 */
function loadFixture(fixturePath: string): unknown {
  try {
    const fileContent = readFileSync(fixturePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Fixture file not found: ${fixturePath}`);
    }
    throw new Error(`Failed to parse fixture JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate fixture format
 *
 * Ensures fixture is an array of bar objects with required fields.
 *
 * @param data - Parsed fixture data
 * @throws Error if fixture format is invalid
 */
function validateFixture(data: unknown): asserts data is Array<{
  id: string;
  text: string;
  timestamp: string;
  expectedResult: unknown;
}> {
  if (!Array.isArray(data)) {
    throw new Error('Fixture must be an array of bar objects');
  }

  if (data.length === 0) {
    throw new Error('Fixture array is empty');
  }

  for (let i = 0; i < data.length; i++) {
    const bar = data[i];
    if (typeof bar !== 'object' || bar === null) {
      throw new Error(`Bar at index ${i} is not an object`);
    }

    const requiredFields = ['id', 'text', 'timestamp', 'expectedResult'];
    for (const field of requiredFields) {
      if (!(field in bar)) {
        throw new Error(`Bar at index ${i} missing required field: ${field}`);
      }
    }
  }
}

/**
 * Generate stub replay results
 *
 * STUB: Returns fake processing results for demonstration.
 * Real implementation would:
 * - Load parser logic from @tjr-suite/parser
 * - Execute parser on each bar
 * - Compare output with expectedResult
 * - Track timing and memory usage
 *
 * @param fixturePath - Path to fixture file
 * @param fixtureData - Parsed fixture data
 * @returns Replay results
 */
function generateStubReplayResults(
  fixturePath: string,
  fixtureData: Array<{ id: string; text: string; timestamp: string; expectedResult: unknown }>
): {
  fixture: string;
  totalBars: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: string;
  failures: Array<{ barId: string; reason: string }>;
} {
  const totalBars = fixtureData.length;

  // Simulate one failure for demonstration
  const passed = totalBars - 1;
  const failed = 1;
  const failures = [
    {
      barId: fixtureData[Math.floor(totalBars / 2)]?.id ?? 'unknown',
      reason: 'Expected volume 12345, got 12344 (off by 1)',
    },
  ];

  return {
    fixture: fixturePath,
    totalBars,
    passed,
    failed,
    skipped: 0,
    duration: `${totalBars * 5}ms`, // Simulate 5ms per bar
    failures,
  };
}

// Run main function
main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(2);
});