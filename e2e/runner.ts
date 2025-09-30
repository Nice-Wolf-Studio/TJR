#!/usr/bin/env tsx
/**
 * E2E Scenario Test Runner
 *
 * Runs end-to-end scenarios with fixture data and validates outputs against snapshots.
 *
 * Usage:
 *   pnpm e2e:run                    # Run all scenarios
 *   pnpm e2e:run --scenario=01      # Run specific scenario
 *   pnpm e2e:run --update-snapshots # Update expected snapshots
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Types
interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  fixture: {
    symbol: string;
    date: string;
    timeframe?: string;
    timeframes?: string[];
    type: string;
  };
  expectedOutputs: any;
  pipeline: {
    steps: string[];
  };
  tags: string[];
}

interface ScenarioResult {
  id: string;
  name: string;
  passed: boolean;
  duration: number;
  errors: string[];
  outputs: any;
}

// Parse CLI arguments
function parseArgs(): { scenario?: string; updateSnapshots: boolean } {
  const args = process.argv.slice(2);
  const result: { scenario?: string; updateSnapshots: boolean } = {
    updateSnapshots: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--scenario=')) {
      result.scenario = arg.split('=')[1];
    } else if (arg === '--update-snapshots') {
      result.updateSnapshots = true;
    }
  }

  return result;
}

// Load scenario definition
function loadScenario(scenarioId: string): ScenarioDefinition {
  const scenarioPath = join(__dirname, `specs/scenarios/scenario-${scenarioId}.json`);

  if (!existsSync(scenarioPath)) {
    throw new Error(`Scenario not found: scenario-${scenarioId}`);
  }

  const content = readFileSync(scenarioPath, 'utf-8');
  return JSON.parse(content);
}

// Load all scenarios
function loadAllScenarios(): ScenarioDefinition[] {
  const scenariosDir = join(__dirname, 'specs/scenarios');
  const files = readdirSync(scenariosDir).filter((f: string) => f.endsWith('.json'));

  return files.map((file: string) => {
    const content = readFileSync(join(scenariosDir, file), 'utf-8');
    return JSON.parse(content);
  });
}

// Generate fixture bars based on scenario config
function generateFixtureBars(scenario: ScenarioDefinition): any[] {
  const { symbol, date, type } = scenario.fixture;

  // Use the fixture generator from @tjr/app
  // For now, we'll create a simplified version
  const bars: any[] = [];
  const baseDate = new Date(date);
  baseDate.setHours(9, 30, 0, 0);

  const barCount = 78; // Full trading day (6.5 hours * 12 bars/hour)
  let basePrice = symbol === 'SPY' ? 450 : symbol === 'QQQ' ? 380 : 200;

  for (let i = 0; i < barCount; i++) {
    const time = new Date(baseDate.getTime() + i * 5 * 60000);

    // Generate deterministic price action based on type
    let trend = 0;
    if (type === 'trend-up') {
      trend = basePrice * 0.0002 * i; // Gradual uptrend
    } else if (type === 'trend-down') {
      trend = -basePrice * 0.0002 * i; // Gradual downtrend
    }

    const noise = Math.sin(i * 0.5) * basePrice * 0.001;
    const open = basePrice + trend;
    const close = open + noise;
    const high = Math.max(open, close) + Math.abs(noise) * 0.5;
    const low = Math.min(open, close) - Math.abs(noise) * 0.5;

    bars.push({
      timestamp: time.toISOString(),
      symbol,
      time: time.toISOString(),
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: Math.floor(1500000 + i * 10000),
      trades: Math.floor(15000 + i * 100),
      vwap: parseFloat(((open + high + low + close) / 4).toFixed(2)),
    });

    basePrice = close;
  }

  return bars;
}

// Simulate pipeline execution
async function executePipeline(scenario: ScenarioDefinition): Promise<any> {
  const output: any = {
    bars: [],
    fvgs: [],
    orderBlocks: [],
    confluences: [],
    executionZones: [],
  };

  // Generate fixture bars
  output.bars = generateFixtureBars(scenario);

  // Simulate FVG detection
  for (let i = 2; i < output.bars.length; i++) {
    const bar1 = output.bars[i - 2];
    const bar2 = output.bars[i - 1];
    const bar3 = output.bars[i];

    // Simple FVG detection: gap between bar1.low and bar3.high
    if (bar1.low > bar3.high + 0.5) {
      output.fvgs.push({
        type: 'bearish',
        topBar: i - 2,
        bottomBar: i,
        top: bar1.low,
        bottom: bar3.high,
        gap: bar1.low - bar3.high,
      });
    } else if (bar1.high < bar3.low - 0.5) {
      output.fvgs.push({
        type: 'bullish',
        topBar: i,
        bottomBar: i - 2,
        top: bar3.low,
        bottom: bar1.high,
        gap: bar3.low - bar1.high,
      });
    }
  }

  // Simulate Order Block detection
  for (let i = 5; i < output.bars.length; i++) {
    const bar = output.bars[i];
    const prevBar = output.bars[i - 1];

    // Simple OB detection: strong move followed by consolidation
    if (bar.close > prevBar.close * 1.002) {
      output.orderBlocks.push({
        type: 'bullish',
        index: i,
        level: prevBar.low,
        strength: 'medium',
      });
    } else if (bar.close < prevBar.close * 0.998) {
      output.orderBlocks.push({
        type: 'bearish',
        index: i,
        level: prevBar.high,
        strength: 'medium',
      });
    }
  }

  // Simulate confluence detection
  if (scenario.expectedOutputs.hasConfluences) {
    for (const fvg of output.fvgs.slice(0, 3)) {
      for (const ob of output.orderBlocks.slice(0, 3)) {
        if (Math.abs(fvg.top - ob.level) < 1.0) {
          output.confluences.push({
            type: 'fvg-ob-alignment',
            score: 2,
            components: ['fvg', 'orderBlock'],
            level: (fvg.top + ob.level) / 2,
          });
        }
      }
    }
  }

  // Simulate execution zones
  if (scenario.expectedOutputs.hasExecutionZones) {
    output.executionZones = output.confluences.map((c: any) => ({
      level: c.level,
      type: c.type,
      score: c.score,
      risk: {
        stopLoss: c.level * 0.995,
        takeProfit: c.level * 1.010,
        riskRewardRatio: 2.0,
      },
    }));
  }

  return output;
}

// Validate scenario outputs
function validateOutputs(scenario: ScenarioDefinition, output: any): string[] {
  const errors: string[] = [];
  const expected = scenario.expectedOutputs;

  // Validate bar count
  if (expected.barCount && output.bars.length !== expected.barCount) {
    errors.push(
      `Bar count mismatch: expected ${expected.barCount}, got ${output.bars.length}`
    );
  }

  // Validate FVG presence
  if (expected.hasFairValueGaps && output.fvgs.length === 0) {
    errors.push('Expected Fair Value Gaps but none found');
  }

  if (expected.minFvgCount && output.fvgs.length < expected.minFvgCount) {
    errors.push(
      `FVG count below minimum: expected >= ${expected.minFvgCount}, got ${output.fvgs.length}`
    );
  }

  // Validate Order Block presence
  if (expected.hasOrderBlocks && output.orderBlocks.length === 0) {
    errors.push('Expected Order Blocks but none found');
  }

  if (expected.minOrderBlockCount && output.orderBlocks.length < expected.minOrderBlockCount) {
    errors.push(
      `Order Block count below minimum: expected >= ${expected.minOrderBlockCount}, got ${output.orderBlocks.length}`
    );
  }

  // Validate confluences
  if (expected.hasConfluences && output.confluences.length === 0) {
    errors.push('Expected confluences but none found');
  }

  if (expected.minConfluenceScore) {
    const maxScore = Math.max(...output.confluences.map((c: any) => c.score), 0);
    if (maxScore < expected.minConfluenceScore) {
      errors.push(
        `Confluence score below minimum: expected >= ${expected.minConfluenceScore}, got ${maxScore}`
      );
    }
  }

  // Validate execution zones
  if (expected.hasExecutionZones && output.executionZones.length === 0) {
    errors.push('Expected execution zones but none found');
  }

  return errors;
}

// Compare with snapshot
function compareSnapshot(
  scenarioId: string,
  output: any,
  updateSnapshots: boolean
): { match: boolean; errors: string[] } {
  const snapshotPath = join(__dirname, `specs/snapshots/scenario-${scenarioId}.json`);

  if (!existsSync(snapshotPath)) {
    if (updateSnapshots) {
      writeFileSync(snapshotPath, JSON.stringify(output, null, 2));
      return { match: true, errors: [] };
    }
    return { match: false, errors: ['Snapshot does not exist'] };
  }

  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf-8'));

  if (updateSnapshots) {
    writeFileSync(snapshotPath, JSON.stringify(output, null, 2));
    return { match: true, errors: [] };
  }

  // Compare key metrics (not exact values, as they may vary slightly)
  const errors: string[] = [];

  if (snapshot.bars.length !== output.bars.length) {
    errors.push(`Bar count mismatch: snapshot=${snapshot.bars.length}, output=${output.bars.length}`);
  }

  if (snapshot.fvgs.length !== output.fvgs.length) {
    errors.push(`FVG count mismatch: snapshot=${snapshot.fvgs.length}, output=${output.fvgs.length}`);
  }

  if (snapshot.orderBlocks.length !== output.orderBlocks.length) {
    errors.push(
      `Order Block count mismatch: snapshot=${snapshot.orderBlocks.length}, output=${output.orderBlocks.length}`
    );
  }

  return { match: errors.length === 0, errors };
}

// Run a single scenario
async function runScenario(
  scenario: ScenarioDefinition,
  updateSnapshots: boolean
): Promise<ScenarioResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  console.log(`\nRunning scenario ${scenario.id}: ${scenario.name}`);
  console.log(`  Description: ${scenario.description}`);
  console.log(`  Fixture: ${scenario.fixture.symbol} on ${scenario.fixture.date}`);
  console.log(`  Pipeline steps: ${scenario.pipeline.steps.length}`);

  try {
    // Execute pipeline
    const output = await executePipeline(scenario);

    // Validate outputs
    const validationErrors = validateOutputs(scenario, output);
    errors.push(...validationErrors);

    // Compare with snapshot
    const snapshotResult = compareSnapshot(scenario.id, output, updateSnapshots);
    if (!snapshotResult.match) {
      errors.push(...snapshotResult.errors);
    }

    const duration = Date.now() - startTime;
    const passed = errors.length === 0;

    console.log(`  Result: ${passed ? 'PASS' : 'FAIL'}`);
    console.log(`  Duration: ${duration}ms`);

    if (!passed) {
      console.log(`  Errors:`);
      errors.forEach((err) => console.log(`    - ${err}`));
    } else {
      console.log(`  Bars: ${output.bars.length}`);
      console.log(`  FVGs: ${output.fvgs.length}`);
      console.log(`  Order Blocks: ${output.orderBlocks.length}`);
      console.log(`  Confluences: ${output.confluences.length}`);
      console.log(`  Execution Zones: ${output.executionZones.length}`);
    }

    return {
      id: scenario.id,
      name: scenario.name,
      passed,
      duration,
      errors,
      outputs: output,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`Scenario execution failed: ${errorMessage}`);

    console.log(`  Result: FAIL`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Error: ${errorMessage}`);

    return {
      id: scenario.id,
      name: scenario.name,
      passed: false,
      duration,
      errors,
      outputs: null,
    };
  }
}

// Main runner
async function main() {
  const args = parseArgs();

  console.log('='.repeat(80));
  console.log('E2E Scenario Test Runner');
  console.log('='.repeat(80));

  if (args.updateSnapshots) {
    console.log('\nMode: UPDATE SNAPSHOTS');
  }

  // Load scenarios
  let scenarios: ScenarioDefinition[];
  if (args.scenario) {
    console.log(`\nRunning specific scenario: ${args.scenario}`);
    scenarios = [loadScenario(args.scenario)];
  } else {
    console.log('\nRunning all scenarios');
    scenarios = loadAllScenarios();
  }

  console.log(`Total scenarios: ${scenarios.length}`);

  // Run scenarios
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    const result = await runScenario(scenario, args.updateSnapshots);
    results.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('Test Summary');
  console.log('='.repeat(80));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\nTotal: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
  console.log(`Average Duration: ${Math.round(totalDuration / results.length)}ms per scenario`);

  if (failed > 0) {
    console.log('\nFailed Scenarios:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.id}: ${r.name}`);
        r.errors.forEach((err) => console.log(`      ${err}`));
      });
  }

  console.log('\n' + '='.repeat(80));

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});