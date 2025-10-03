/**
 * @fileoverview Risk management module tests.
 */

import { test } from 'node:test';
import assert from 'node:assert';

// Dynamic import of the package (will be compiled from TypeScript)
const tjrTools = await import('../dist/index.js');
const {
  calculatePositionSize,
  calculateDailyStop,
  calculatePartialExits,
  calculateRisk,
  calculateRiskRewardRatio,
  calculateTrailingStop,
  canTakeNewTrade,
  validateRiskConfig,
  mergeRiskConfig,
  DEFAULT_RISK_CONFIG,
} = tjrTools;

// === Risk Configuration Tests ===

test('Risk Configuration - Default config should be valid', () => {
  assert.ok(DEFAULT_RISK_CONFIG);
  assert.strictEqual(DEFAULT_RISK_CONFIG.account.balance, 10000);
  assert.strictEqual(DEFAULT_RISK_CONFIG.perTrade.maxRiskPercent, 1.0);
  assert.strictEqual(DEFAULT_RISK_CONFIG.dailyLimits.maxLossPercent, 3.0);
});

test('Risk Configuration - Validate valid config', () => {
  assert.doesNotThrow(() => validateRiskConfig(DEFAULT_RISK_CONFIG));
});

test('Risk Configuration - Reject negative balance', () => {
  const config = {
    ...DEFAULT_RISK_CONFIG,
    account: { ...DEFAULT_RISK_CONFIG.account, balance: -1000 },
  };
  assert.throws(() => validateRiskConfig(config), /balance must be positive/);
});

test('Risk Configuration - Reject invalid risk percentage', () => {
  const config = {
    ...DEFAULT_RISK_CONFIG,
    perTrade: { ...DEFAULT_RISK_CONFIG.perTrade, maxRiskPercent: 150 },
  };
  assert.throws(() => validateRiskConfig(config), /maxRiskPercent must be between/);
});

test('Risk Configuration - Merge partial config with defaults', () => {
  const partial = {
    account: { balance: 50000 },
  };
  const merged = mergeRiskConfig(partial);
  assert.strictEqual(merged.account.balance, 50000);
  assert.strictEqual(merged.account.currency, 'USD');
  assert.strictEqual(merged.perTrade.maxRiskPercent, 1.0);
});

// === Position Sizing Tests ===

test('Position Sizing - Calculate with fixed percentage method', () => {
  const result = calculatePositionSize(100, 98, DEFAULT_RISK_CONFIG);

  // Risk = 1% of $10,000 = $100
  // Stop distance = $2
  // Base calculation: $100 / $2 = 50 shares
  // BUT: maxPositionPercent = 20% of $10k = $2k max position / $100 price = 20 shares max
  assert.strictEqual(result.shares, 20);
  assert.strictEqual(result.dollarRisk, 40); // 20 shares * $2 stop = $40
  assert.strictEqual(result.percentRisk, 0.4);
  assert.strictEqual(result.method, 'fixed');
});

test('Position Sizing - Calculate for short trade', () => {
  const result = calculatePositionSize(100, 102, DEFAULT_RISK_CONFIG);

  // Same constraint applies: 20 shares max at $100 price
  assert.strictEqual(result.shares, 20);
  assert.strictEqual(result.dollarRisk, 40); // 20 shares * $2 stop = $40
});

test('Position Sizing - Use Kelly Criterion when configured', () => {
  const kellyConfig = {
    ...DEFAULT_RISK_CONFIG,
    perTrade: {
      ...DEFAULT_RISK_CONFIG.perTrade,
      useKelly: true,
      winRate: 0.6,
      avgWin: 200,
      avgLoss: 100,
      kellyFraction: 0.25,
    },
  };

  const result = calculatePositionSize(100, 98, kellyConfig);

  assert.strictEqual(result.method, 'kelly');
  assert.ok(result.shares <= 50);
  assert.ok(result.warnings.some((w) => w.includes('Kelly')));
});

test('Position Sizing - Respect maximum position percentage', () => {
  const config = {
    ...DEFAULT_RISK_CONFIG,
    perTrade: { ...DEFAULT_RISK_CONFIG.perTrade, maxRiskPercent: 50 },
    constraints: { ...DEFAULT_RISK_CONFIG.constraints, maxPositionPercent: 10 },
  };

  const result = calculatePositionSize(100, 90, config);

  assert.ok(result.shares <= 10);
  assert.ok(result.warnings.some((w) => w.includes('max position percentage')));
});

test('Position Sizing - Round to lot sizes', () => {
  const lotConfig = {
    ...DEFAULT_RISK_CONFIG,
    constraints: {
      ...DEFAULT_RISK_CONFIG.constraints,
      roundLots: true,
      lotSize: 10,
    },
  };

  const result = calculatePositionSize(100, 98, lotConfig);

  assert.strictEqual(result.shares % 10, 0);
});

test('Position Sizing - Handle zero stop distance', () => {
  const result = calculatePositionSize(100, 100, DEFAULT_RISK_CONFIG);

  assert.strictEqual(result.shares, 0);
  assert.strictEqual(result.dollarRisk, 0);
  assert.ok(result.warnings.some((w) => w.includes('zero')));
});

test('Position Sizing - Deterministic calculation', () => {
  const result1 = calculatePositionSize(100, 98, DEFAULT_RISK_CONFIG);
  const result2 = calculatePositionSize(100, 98, DEFAULT_RISK_CONFIG);

  assert.strictEqual(result1.shares, result2.shares);
  assert.strictEqual(result1.dollarRisk, result2.dollarRisk);
});

// === Daily Stop Tracking Tests ===

test('Daily Stop - Track daily losses', () => {
  const trades = [
    { timestamp: '2025-01-15T14:30:00Z', pnl: -100, fees: 2 },
    { timestamp: '2025-01-15T15:00:00Z', pnl: -50, fees: 1 },
  ];
  const currentTime = '2025-01-15T16:00:00Z';

  const result = calculateDailyStop(trades, currentTime, DEFAULT_RISK_CONFIG);

  assert.strictEqual(result.realizedLoss, 153);
  assert.strictEqual(result.date, '2025-01-15');
  assert.strictEqual(result.isLimitReached, false);
});

test('Daily Stop - Only count losses not wins', () => {
  const trades = [
    { timestamp: '2025-01-15T14:30:00Z', pnl: -100 },
    { timestamp: '2025-01-15T15:00:00Z', pnl: 200 },
    { timestamp: '2025-01-15T15:30:00Z', pnl: -50 },
  ];
  const currentTime = '2025-01-15T16:00:00Z';

  const result = calculateDailyStop(trades, currentTime, DEFAULT_RISK_CONFIG);

  assert.strictEqual(result.realizedLoss, 150);
});

test('Daily Stop - Filter trades to current day only', () => {
  const trades = [
    { timestamp: '2025-01-14T14:30:00Z', pnl: -200 },
    { timestamp: '2025-01-15T14:30:00Z', pnl: -100 },
  ];
  const currentTime = '2025-01-15T16:00:00Z';

  const result = calculateDailyStop(trades, currentTime, DEFAULT_RISK_CONFIG);

  assert.strictEqual(result.realizedLoss, 100);
  assert.strictEqual(result.date, '2025-01-15');
});

test('Daily Stop - Detect when daily limit reached', () => {
  const trades = [{ timestamp: '2025-01-15T14:30:00Z', pnl: -300 }];
  const currentTime = '2025-01-15T16:00:00Z';

  const result = calculateDailyStop(trades, currentTime, DEFAULT_RISK_CONFIG);

  assert.strictEqual(result.realizedLoss, 300);
  assert.strictEqual(result.isLimitReached, true);
  assert.strictEqual(result.remainingCapacity, 0);
});

test('Daily Stop - Include open position risk', () => {
  const trades = [{ timestamp: '2025-01-15T14:30:00Z', pnl: -100 }];
  const currentTime = '2025-01-15T16:00:00Z';

  const result = calculateDailyStop(trades, currentTime, DEFAULT_RISK_CONFIG, 150);

  assert.strictEqual(result.openRisk, 150);
  assert.strictEqual(result.remainingCapacity, 50);
});

test('Daily Stop - Track consecutive losses', () => {
  const trades = [
    { timestamp: '2025-01-15T14:00:00Z', pnl: -50 },
    { timestamp: '2025-01-15T14:30:00Z', pnl: -60 },
    { timestamp: '2025-01-15T15:00:00Z', pnl: -70 },
  ];
  const currentTime = '2025-01-15T16:00:00Z';

  const result = calculateDailyStop(trades, currentTime, DEFAULT_RISK_CONFIG);

  assert.strictEqual(result.consecutiveLosses, 3);
});

test('Daily Stop - Reset consecutive losses on win', () => {
  const trades = [
    { timestamp: '2025-01-15T14:00:00Z', pnl: -50 },
    { timestamp: '2025-01-15T14:30:00Z', pnl: -60 },
    { timestamp: '2025-01-15T15:00:00Z', pnl: 100 },
    { timestamp: '2025-01-15T15:30:00Z', pnl: -40 },
  ];
  const currentTime = '2025-01-15T16:00:00Z';

  const result = calculateDailyStop(trades, currentTime, DEFAULT_RISK_CONFIG);

  assert.strictEqual(result.consecutiveLosses, 1);
});

test('Daily Stop - Handle empty trade history', () => {
  const currentTime = '2025-01-15T16:00:00Z';
  const result = calculateDailyStop([], currentTime, DEFAULT_RISK_CONFIG);

  assert.strictEqual(result.realizedLoss, 0);
  assert.strictEqual(result.consecutiveLosses, 0);
  assert.strictEqual(result.isLimitReached, false);
  assert.strictEqual(result.remainingCapacity, 300);
});

test('Daily Stop - Deterministic calculation', () => {
  const trades = [{ timestamp: '2025-01-15T14:30:00Z', pnl: -100 }];
  const currentTime = '2025-01-15T16:00:00Z';

  const result1 = calculateDailyStop(trades, currentTime, DEFAULT_RISK_CONFIG);
  const result2 = calculateDailyStop(trades, currentTime, DEFAULT_RISK_CONFIG);

  assert.strictEqual(result1.realizedLoss, result2.realizedLoss);
  assert.strictEqual(result1.remainingCapacity, result2.remainingCapacity);
});

// === Partial Exits Tests ===

test('Partial Exits - Calculate R-multiple exits for long trade', () => {
  const exits = calculatePartialExits(100, 98, 'long', 100, DEFAULT_RISK_CONFIG);

  assert.strictEqual(exits.length, 3);
  assert.strictEqual(exits[0].price, 102);
  assert.strictEqual(exits[0].rMultiple, 1.0);
  assert.strictEqual(exits[0].quantity, 33);
  assert.strictEqual(exits[1].price, 104);
  assert.strictEqual(exits[2].price, 106);
  assert.strictEqual(exits[2].quantity, 34);
});

test('Partial Exits - Calculate R-multiple exits for short trade', () => {
  const exits = calculatePartialExits(100, 102, 'short', 100, DEFAULT_RISK_CONFIG);

  assert.strictEqual(exits.length, 3);
  assert.strictEqual(exits[0].price, 98);
  assert.strictEqual(exits[1].price, 96);
  assert.strictEqual(exits[2].price, 94);
});

test('Partial Exits - Exit quantities sum to position size', () => {
  const positionSize = 100;
  const exits = calculatePartialExits(100, 98, 'long', positionSize, DEFAULT_RISK_CONFIG);

  const totalQuantity = exits.reduce((sum, exit) => sum + exit.quantity, 0);
  assert.strictEqual(totalQuantity, positionSize);
});

test('Partial Exits - Calculate cumulative percentages', () => {
  const exits = calculatePartialExits(100, 98, 'long', 100, DEFAULT_RISK_CONFIG);

  assert.ok(Math.abs(exits[0].cumulative - 33) <= 1);
  assert.ok(Math.abs(exits[1].cumulative - 66) <= 1);
  assert.ok(Math.abs(exits[2].cumulative - 100) <= 1);
});

test('Partial Exits - Sort exits by price', () => {
  const exits = calculatePartialExits(100, 98, 'long', 100, DEFAULT_RISK_CONFIG);

  for (let i = 1; i < exits.length; i++) {
    assert.ok(exits[i].price > exits[i - 1].price);
  }
});

test('Partial Exits - Deterministic calculation', () => {
  const exits1 = calculatePartialExits(100, 98, 'long', 100, DEFAULT_RISK_CONFIG);
  const exits2 = calculatePartialExits(100, 98, 'long', 100, DEFAULT_RISK_CONFIG);

  assert.deepStrictEqual(exits1, exits2);
});

// === Risk-Reward Ratio Tests ===

test('Risk-Reward Ratio - Calculate correct ratio', () => {
  const rr = calculateRiskRewardRatio(100, 98, 106);
  assert.strictEqual(rr, 3.0);
});

test('Risk-Reward Ratio - Handle zero risk', () => {
  const rr = calculateRiskRewardRatio(100, 100, 106);
  assert.strictEqual(rr, 0);
});

// === Complete Risk Calculation Tests ===

test('Complete Risk Calculation - Calculate full analysis', () => {
  const input = {
    symbol: 'SPY',
    entryPrice: 450,
    stopLoss: 448,
    takeProfit: 456,
    direction: 'long',
    currentTimestamp: '2025-01-15T16:00:00Z',
    tradeHistory: [],
  };

  const result = calculateRisk(input, DEFAULT_RISK_CONFIG);

  assert.ok(result.positionSize.shares > 0);
  assert.ok(result.positionSize.dollarRisk <= 100);
  assert.strictEqual(result.dailyStop.currentLoss, 0);
  assert.strictEqual(result.dailyStop.remainingCapacity, 300);
  assert.strictEqual(result.partialExits.length, 3);
  assert.strictEqual(result.riskRewardRatio, 3.0);
  assert.strictEqual(result.recommendation.canTrade, true);
});

test('Complete Risk Calculation - Reject when daily limit reached', () => {
  const input = {
    symbol: 'SPY',
    entryPrice: 450,
    stopLoss: 448,
    direction: 'long',
    currentTimestamp: '2025-01-15T16:00:00Z',
    tradeHistory: [{ timestamp: '2025-01-15T14:00:00Z', pnl: -300 }],
  };

  const result = calculateRisk(input, DEFAULT_RISK_CONFIG);

  assert.strictEqual(result.dailyStop.isLimitReached, true);
  assert.strictEqual(result.recommendation.canTrade, false);
  assert.ok(result.recommendation.reasons.some((r) => r.includes('Daily loss limit')));
});

test('Complete Risk Calculation - Lower confidence on consecutive losses', () => {
  const input = {
    symbol: 'SPY',
    entryPrice: 450,
    stopLoss: 448,
    takeProfit: 456,
    direction: 'long',
    currentTimestamp: '2025-01-15T16:00:00Z',
    tradeHistory: [
      { timestamp: '2025-01-15T14:00:00Z', pnl: -50 },
      { timestamp: '2025-01-15T14:30:00Z', pnl: -50 },
      { timestamp: '2025-01-15T15:00:00Z', pnl: -50 },
    ],
  };

  const result = calculateRisk(input, DEFAULT_RISK_CONFIG);

  assert.strictEqual(result.dailyStop.consecutiveLosses, 3);
  assert.strictEqual(result.recommendation.confidence, 'low');
});

test('Complete Risk Calculation - Deterministic result', () => {
  const input = {
    symbol: 'SPY',
    entryPrice: 450,
    stopLoss: 448,
    takeProfit: 456,
    direction: 'long',
    currentTimestamp: '2025-01-15T16:00:00Z',
    tradeHistory: [{ timestamp: '2025-01-15T14:00:00Z', pnl: -50 }],
  };

  const result1 = calculateRisk(input, DEFAULT_RISK_CONFIG);
  const result2 = calculateRisk(input, DEFAULT_RISK_CONFIG);

  assert.strictEqual(result1.positionSize.shares, result2.positionSize.shares);
  assert.strictEqual(result1.dailyStop.currentLoss, result2.dailyStop.currentLoss);
  assert.strictEqual(result1.recommendation.canTrade, result2.recommendation.canTrade);
});

// === Edge Cases and Invariants ===

test('Edge Cases - Handle very small prices', () => {
  const result = calculatePositionSize(0.01, 0.009, DEFAULT_RISK_CONFIG);

  assert.ok(result.shares > 0);
  assert.ok(result.dollarRisk <= 100);
});

test('Edge Cases - Handle very large prices', () => {
  // Use higher balance for expensive stock
  const config = {
    ...DEFAULT_RISK_CONFIG,
    account: { ...DEFAULT_RISK_CONFIG.account, balance: 100000 },
  };
  const result = calculatePositionSize(5000, 4900, config);

  // With $100k account and 20% max position = $20k max / $5k price = 4 shares max
  // Risk is $100 per share, so 1% of $100k = $1000 risk / $100 = 10 shares
  // Constrained to 4 shares by maxPositionPercent
  assert.ok(result.shares > 0);
  assert.strictEqual(result.shares, 4);
});

test('Invariants - Never exceed max risk percentage', () => {
  const testCases = [
    [100, 98],
    [500, 490],
    [0.5, 0.49],
    [10000, 9950],
  ];

  for (const [entry, stop] of testCases) {
    const result = calculatePositionSize(entry, stop, DEFAULT_RISK_CONFIG);
    assert.ok(result.percentRisk <= DEFAULT_RISK_CONFIG.perTrade.maxRiskPercent + 0.01);
  }
});

test('Invariants - Partial exits always sum to 100%', () => {
  const testCases = [
    { entry: 100, stop: 98, size: 100 },
    { entry: 50, stop: 49, size: 50 },
    { entry: 200, stop: 195, size: 75 },
  ];

  for (const { entry, stop, size } of testCases) {
    const exits = calculatePartialExits(entry, stop, 'long', size, DEFAULT_RISK_CONFIG);
    const totalQty = exits.reduce((sum, e) => sum + e.quantity, 0);
    assert.strictEqual(totalQty, size);
  }
});
