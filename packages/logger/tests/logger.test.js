const test = require('node:test');
const assert = require('node:assert/strict');

const { createLogger, attachGlobalHandlers } = require('../dist/index.js');

function capture(fn) {
  const orig = console.log;
  const out = [];
  console.log = (line) => out.push(line);
  try {
    fn();
  } finally {
    console.log = orig;
  }
  return out;
}

test('logger emits JSON with required fields', () => {
  const logs = capture(() => {
    const logger = createLogger({ context: { svc: 'test' } });
    logger.info('hello', { user: 'alice' });
  });
  assert.equal(logs.length, 1);
  const row = JSON.parse(logs[0]);
  assert.equal(row.level, 'info');
  assert.equal(row.message, 'hello');
  assert.equal(row.svc, 'test');
  assert.equal(row.meta.user, 'alice');
  assert.match(row.ts, /^\d{4}-\d{2}-\d{2}T/);
});

test('logger redacts secret keys', () => {
  const logs = capture(() => {
    const logger = createLogger();
    logger.info('x', { token: 'abc', nested: { apiKey: 'db-123' } });
  });
  const row = JSON.parse(logs[0]);
  assert.equal(row.meta.token, '[REDACTED]');
  assert.equal(row.meta.nested.apiKey, '[REDACTED]');
});

test('error path logs Error objects', () => {
  const logs = capture(() => {
    const logger = createLogger();
    logger.error(new Error('boom'));
  });
  const row = JSON.parse(logs[0]);
  assert.equal(row.level, 'error');
  assert.equal(row.meta.name, 'Error');
  assert.equal(row.message, 'boom');
});

test('attachGlobalHandlers registers listeners', () => {
  const before = process.listenerCount('unhandledRejection');
  const logger = createLogger();
  attachGlobalHandlers(logger);
  const after = process.listenerCount('unhandledRejection');
  assert.ok(after >= before + 1);
});
