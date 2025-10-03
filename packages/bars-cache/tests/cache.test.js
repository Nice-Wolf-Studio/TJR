const test = require('node:test');
const assert = require('node:assert/strict');

const { InMemoryBarsCache } = require('../dist/index.js');

test('TTL behavior', async () => {
  const cache = new InMemoryBarsCache(50);
  await cache.set('ES', '1m', [{ timestamp: 1, open: 1, high: 1, low: 1, close: 1 }]);
  const got = await cache.get('ES', '1m');
  assert.ok(got && got.length === 1);
  await new Promise((r) => setTimeout(r, 60));
  const expired = await cache.get('ES', '1m');
  assert.equal(expired, null);
});
