/**
 * Tests for symbol aliases
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { resolveAlias, registerAlias, getAllAliases } = require('../dist/aliases');

describe('resolveAlias', () => {
  it('should resolve Yahoo Finance format', () => {
    assert.strictEqual(resolveAlias('ES=F'), 'ES');
    assert.strictEqual(resolveAlias('NQ=F'), 'NQ');
  });

  it('should resolve IQFeed format', () => {
    assert.strictEqual(resolveAlias('@ES'), 'ES');
    assert.strictEqual(resolveAlias('@NQ'), 'NQ');
  });

  it('should resolve TradingView format', () => {
    assert.strictEqual(resolveAlias('/ES'), 'ES');
    assert.strictEqual(resolveAlias('/NQ'), 'NQ');
  });

  it('should pass through canonical symbols', () => {
    assert.strictEqual(resolveAlias('ES'), 'ES');
    assert.strictEqual(resolveAlias('AAPL'), 'AAPL');
    assert.strictEqual(resolveAlias('ESH25'), 'ESH25');
  });

  it('should handle empty or invalid input', () => {
    assert.strictEqual(resolveAlias(''), null);
    assert.strictEqual(resolveAlias('   '), null);
    assert.strictEqual(resolveAlias(null), null);
    assert.strictEqual(resolveAlias(undefined), null);
  });

  it('should trim whitespace', () => {
    assert.strictEqual(resolveAlias('  ES  '), 'ES');
    assert.strictEqual(resolveAlias('  @ES  '), 'ES');
  });
});

describe('registerAlias', () => {
  it('should register custom alias', () => {
    registerAlias('SPX.XO', 'SPX');
    assert.strictEqual(resolveAlias('SPX.XO'), 'SPX');
  });

  it('should throw on invalid input', () => {
    assert.throws(() => registerAlias('', 'SPX'), /must be non-empty strings/);
    assert.throws(() => registerAlias('SPX.XO', ''), /must be non-empty strings/);
    assert.throws(() => registerAlias(null, 'SPX'), /must be non-empty strings/);
  });
});

describe('getAllAliases', () => {
  it('should return registered aliases', () => {
    registerAlias('TEST1', 'CANONICAL1');
    const aliases = getAllAliases();

    assert.ok('TEST1' in aliases);
    assert.strictEqual(aliases['TEST1'], 'CANONICAL1');
  });

  it('should return a copy not affecting internal state', () => {
    const aliases = getAllAliases();
    aliases['SHOULD_NOT_EXIST'] = 'TEST';

    const aliases2 = getAllAliases();
    assert.ok(!('SHOULD_NOT_EXIST' in aliases2));
  });
});
