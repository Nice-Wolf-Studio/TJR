const test = require('node:test');
const assert = require('node:assert/strict');

const { createInMemoryDB } = require('../dist/index.js');

test('in-memory DB basic ops', async () => {
  const db = createInMemoryDB();
  assert.equal(await db.get('k'), null);
  await db.set('k', 'v');
  assert.equal(await db.get('k'), 'v');
  await db.del('k');
  assert.equal(await db.get('k'), null);
  await db.set('a', '1');
  await db.clear();
  assert.equal(await db.get('a'), null);
});
