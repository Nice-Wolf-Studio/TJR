const test = require('node:test');
const assert = require('node:assert/strict');
const { writeFileSync, mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const { CompositeProvider } = require('../dist/index.js');

test('fixture mode reads bars', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fixture-'));
  const path = join(dir, 'bars.json');
  writeFileSync(
    path,
    JSON.stringify([
      { timestamp: 1, open: 1, high: 2, low: 1, close: 2 },
      { timestamp: 2, open: 2, high: 3, low: 2, close: 3 },
    ])
  );
  const cp = new CompositeProvider({ mode: 'fixture', fixturePath: path });
  const bars = await cp.getBars('ES', '1m', 2);
  assert.equal(bars.length, 2);
});
