/**
 * Tests for symbol normalization
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  normalizeSymbol,
  extractFuturesRoot,
  isValidContractMonth,
  registerFuturesRoot,
  getKnownFuturesRoots,
} = require('../dist/normalize');

describe('normalizeSymbol', () => {
  it('should normalize stock symbols', () => {
    const result = normalizeSymbol('AAPL');
    assert.strictEqual(result.canonical, 'AAPL');
    assert.strictEqual(result.type, 'stock');
  });

  it('should normalize futures contract codes', () => {
    const result = normalizeSymbol('ESH25');
    assert.strictEqual(result.canonical, 'ESH25');
    assert.strictEqual(result.type, 'future-contract');
    assert.strictEqual(result.root, 'ES');
    assert.strictEqual(result.contractMonth, 'H25');
  });

  it('should normalize 4-digit year to 2-digit', () => {
    const result = normalizeSymbol('ESH2025');
    assert.strictEqual(result.canonical, 'ESH25');
    assert.strictEqual(result.type, 'future-contract');
    assert.strictEqual(result.root, 'ES');
    assert.strictEqual(result.contractMonth, 'H25');
  });

  it('should recognize continuous futures roots', () => {
    const result = normalizeSymbol('ES');
    assert.strictEqual(result.canonical, 'ES');
    assert.strictEqual(result.type, 'continuous-future');
    assert.strictEqual(result.root, 'ES');
  });

  it('should handle vendor-specific formats via aliases', () => {
    const result = normalizeSymbol('ES=F');
    assert.strictEqual(result.canonical, 'ES');
    assert.strictEqual(result.type, 'continuous-future');
  });

  it('should handle IQFeed format', () => {
    const result = normalizeSymbol('@ES');
    assert.strictEqual(result.canonical, 'ES');
    assert.strictEqual(result.type, 'continuous-future');
  });

  it('should handle TradingView format', () => {
    const result = normalizeSymbol('/ES');
    assert.strictEqual(result.canonical, 'ES');
    assert.strictEqual(result.type, 'continuous-future');
  });

  it('should throw on empty symbol', () => {
    assert.throws(() => normalizeSymbol(''), /must be a non-empty string/);
  });

  it('should throw on null symbol', () => {
    assert.throws(() => normalizeSymbol(null), /must be a non-empty string/);
  });
});

describe('extractFuturesRoot', () => {
  it('should extract root from contract code', () => {
    const root = extractFuturesRoot('ESH25');
    assert.strictEqual(root, 'ES');
  });

  it('should extract root from continuous symbol', () => {
    const root = extractFuturesRoot('ES');
    assert.strictEqual(root, 'ES');
  });

  it('should return null for non-futures symbols', () => {
    const root = extractFuturesRoot('AAPL');
    assert.strictEqual(root, null);
  });
});

describe('isValidContractMonth', () => {
  it('should validate correct month codes', () => {
    assert.strictEqual(isValidContractMonth('H25'), true);
    assert.strictEqual(isValidContractMonth('M24'), true);
    assert.strictEqual(isValidContractMonth('Z23'), true);
  });

  it('should reject invalid month codes', () => {
    assert.strictEqual(isValidContractMonth('A25'), false);
    assert.strictEqual(isValidContractMonth('B25'), false);
    assert.strictEqual(isValidContractMonth(''), false);
  });
});

describe('registerFuturesRoot', () => {
  it('should register new futures root', () => {
    const beforeRoots = getKnownFuturesRoots();
    registerFuturesRoot('TEST');
    const afterRoots = getKnownFuturesRoots();

    assert.ok(afterRoots.includes('TEST'));
    assert.strictEqual(afterRoots.length, beforeRoots.length + 1);

    // Now normalize should recognize it
    const result = normalizeSymbol('TEST');
    assert.strictEqual(result.type, 'continuous-future');
  });
});