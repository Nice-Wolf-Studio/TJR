/**
 * Smoke tests for @tjr-suite/smoke package
 *
 * Uses Node.js built-in test runner (available in Node.js 18+)
 * No external test framework needed (Jest, Mocha, etc.)
 *
 * Run with: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Import the compiled JavaScript (not TypeScript source)
// This validates that the build process worked correctly
const { add, greet } = require('../dist/index.js');

// Test suite for add() function
test('add() should add two positive numbers', () => {
  const result = add(2, 3);
  assert.strictEqual(result, 5);
});

test('add() should handle negative numbers', () => {
  const result = add(-5, 3);
  assert.strictEqual(result, -2);
});

test('add() should handle zero', () => {
  const result = add(0, 0);
  assert.strictEqual(result, 0);
});

test('add() should throw on non-number inputs', () => {
  assert.throws(() => add('2', 3), TypeError);
  assert.throws(() => add(2, '3'), TypeError);
});

test('add() should throw on NaN inputs', () => {
  assert.throws(() => add(NaN, 3), TypeError);
  assert.throws(() => add(2, NaN), TypeError);
});

// Test suite for greet() function
test('greet() should return greeting with name', () => {
  const result = greet('Alice');
  assert.strictEqual(result, 'Hello, Alice!');
});

test('greet() should handle names with spaces', () => {
  const result = greet('Bob Smith');
  assert.strictEqual(result, 'Hello, Bob Smith!');
});

test('greet() should throw on empty string', () => {
  assert.throws(() => greet(''), TypeError);
  assert.throws(() => greet('   '), TypeError);
});

test('greet() should throw on non-string inputs', () => {
  assert.throws(() => greet(123), TypeError);
  assert.throws(() => greet(null), TypeError);
});
