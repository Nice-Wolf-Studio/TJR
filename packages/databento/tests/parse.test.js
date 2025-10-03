const test = require('node:test');
const assert = require('node:assert/strict');

const { resampleToH4 } = require('../dist/index.js');

test('resampleToH4 aggregates 4 hourly bars', () => {
  const hourly = [
    { symbol: 'ES', timestamp: 1, open: 10, high: 12, low: 9, close: 11, volume: 1 },
    { symbol: 'ES', timestamp: 2, open: 11, high: 13, low: 10, close: 12, volume: 2 },
    { symbol: 'ES', timestamp: 3, open: 12, high: 14, low: 11, close: 13, volume: 3 },
    { symbol: 'ES', timestamp: 4, open: 13, high: 15, low: 12, close: 14, volume: 4 },
  ];
  const h4 = resampleToH4(hourly);
  assert.equal(h4.length, 1);
  assert.equal(h4[0].open, 10);
  assert.equal(h4[0].close, 14);
  assert.equal(h4[0].high, 15);
  assert.equal(h4[0].low, 9);
  assert.equal(h4[0].volume, 10);
});
