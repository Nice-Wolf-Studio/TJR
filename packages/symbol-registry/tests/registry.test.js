const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeSymbol, toDatabentoContinuous } = require('../dist/index.js');

test('normalizeSymbol canonicalizes ES aliases', () => {
  assert.equal(normalizeSymbol('ES'), 'ES');
  assert.equal(normalizeSymbol('es1!'), 'ES');
  assert.equal(normalizeSymbol('ES.c.0'), 'ES');
});

test('toDatabentoContinuous mapping', () => {
  assert.equal(toDatabentoContinuous('ES'), 'ES.c.0');
});

