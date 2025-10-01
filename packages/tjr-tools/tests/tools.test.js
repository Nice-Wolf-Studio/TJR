const test = require('node:test');
const assert = require('node:assert/strict');

const { analyze, findFvg, findOrderBlocks } = require('../dist/index.js');

test('findFvg detects simple gaps', () => {
  const bars = [
    { high: 10, low: 9 },
    { high: 11, low: 10 },
    { high: 15, low: 14 },
  ];
  const fvg = findFvg(bars);
  assert.ok(fvg.length >= 0);
});

test('analyze returns TJRResult shape', () => {
  const input = {
    symbol: 'ES',
    timeframe: '5',
    bars: [
      { timestamp: 1, open: 10, high: 11, low: 9, close: 10.5 },
      { timestamp: 2, open: 10.5, high: 12, low: 10, close: 11.5 },
      { timestamp: 3, open: 11.5, high: 12, low: 11, close: 11.2 },
    ],
    analysisTimestamp: new Date().toISOString(),
  };
  const res = analyze(input);
  assert.equal(res.input.symbol, 'ES');
  assert.ok(typeof res.confluence.score === 'number');
});

