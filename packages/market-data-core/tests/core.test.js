const test = require('node:test');
const assert = require('node:assert/strict');

const { timeframeToMinutes, aggregateBars, clipBars } = require('../dist/index.js');

test('timeframeToMinutes', () => {
  assert.equal(timeframeToMinutes('1h'), 60);
  assert.equal(timeframeToMinutes('4h'), 240);
});

test('aggregate 1m to 1h', () => {
  const base = [];
  for (let i = 0; i < 60; i++) base.push({ timestamp: i, open: 1+i, high: 2+i, low: 1+i, close: 2+i, volume: 1 });
  const h1 = aggregateBars(base, '1m', '1h');
  assert.equal(h1.length, 1);
  assert.equal(h1[0].open, 1);
  assert.equal(h1[0].close, 61);
  assert.equal(h1[0].high, 61); // last high value
  assert.equal(h1[0].low, 1);
  assert.equal(h1[0].volume, 60);
});

test('clipBars', () => {
  const bars = [{ timestamp: 100 }, { timestamp: 200 }, { timestamp: 300 }];
  const out = clipBars(bars, 150, 300);
  assert.deepEqual(out, [{ timestamp: 200 }]);
});
