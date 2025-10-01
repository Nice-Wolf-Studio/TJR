const test = require('node:test');
const assert = require('node:assert/strict');

const { getUtcSessionBoundaries, getActiveUtcSession } = require('../dist/index.js');

test('London session boundaries UTC', () => {
  const d = new Date('2025-09-29T00:00:00Z');
  const w = getUtcSessionBoundaries(d, 'London');
  assert.equal(w.start.toISOString(), '2025-09-29T08:00:00.000Z');
  assert.equal(w.end.toISOString(), '2025-09-29T13:00:00.000Z');
});

test('Asian session spans previous day start', () => {
  const d = new Date('2025-09-29T00:00:00Z');
  const w = getUtcSessionBoundaries(d, 'Asian');
  assert.equal(w.start.toISOString(), '2025-09-28T23:00:00.000Z');
  assert.equal(w.end.toISOString(), '2025-09-29T08:00:00.000Z');
});

test('Active session detection', () => {
  const asia = getActiveUtcSession(new Date('2025-09-29T00:15:00Z'));
  assert.equal(asia.session, 'Asian');
  const lon = getActiveUtcSession(new Date('2025-09-29T09:00:00Z'));
  assert.equal(lon.session, 'London');
  const ny = getActiveUtcSession(new Date('2025-09-29T17:00:00Z'));
  assert.equal(ny.session, 'NY');
});

