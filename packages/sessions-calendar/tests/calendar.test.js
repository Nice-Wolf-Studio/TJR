/**
 * Matrix tests for sessions-calendar package
 *
 * Tests cover:
 * - Holiday detection (full closures and early closes)
 * - Regular trading days
 * - DST transition dates
 * - Session retrieval (RTH and ETH)
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { getSessions, isHoliday, rthWindow } = require('../dist/index.js');

/**
 * Test matrix for holidays
 */
test('isHoliday - detects full closure holidays', () => {
  const testCases = [
    { date: new Date('2025-01-01'), symbol: 'ES', expected: true, name: "New Year's Day" },
    { date: new Date('2025-04-18'), symbol: 'ES', expected: true, name: 'Good Friday' },
    { date: new Date('2025-12-25'), symbol: 'ES', expected: true, name: 'Christmas' },
    { date: new Date('2026-01-01'), symbol: 'NQ', expected: true, name: "New Year's Day 2026" },
  ];

  for (const tc of testCases) {
    const result = isHoliday(tc.date, tc.symbol);
    assert.strictEqual(
      result,
      tc.expected,
      `${tc.name} (${tc.date.toISOString()}) should be ${tc.expected ? 'a holiday' : 'not a holiday'}`,
    );
  }
});

test('isHoliday - detects early close days', () => {
  const testCases = [
    {
      date: new Date('2025-11-28'),
      symbol: 'ES',
      expected: true,
      name: 'Day After Thanksgiving',
    },
    {
      date: new Date('2025-12-24'),
      symbol: 'ES',
      expected: true,
      name: 'Christmas Eve',
    },
  ];

  for (const tc of testCases) {
    const result = isHoliday(tc.date, tc.symbol);
    assert.strictEqual(
      result,
      tc.expected,
      `${tc.name} (${tc.date.toISOString()}) should be ${tc.expected ? 'a holiday' : 'not a holiday'}`,
    );
  }
});

test('isHoliday - returns false for regular trading days', () => {
  const testCases = [
    { date: new Date('2025-06-15'), symbol: 'ES', expected: false, name: 'Regular Monday' },
    { date: new Date('2025-03-10'), symbol: 'ES', expected: false, name: 'Day after DST spring' },
    { date: new Date('2025-11-03'), symbol: 'ES', expected: false, name: 'Day after DST fall' },
  ];

  for (const tc of testCases) {
    const result = isHoliday(tc.date, tc.symbol);
    assert.strictEqual(
      result,
      tc.expected,
      `${tc.name} (${tc.date.toISOString()}) should be ${tc.expected ? 'a holiday' : 'not a holiday'}`,
    );
  }
});

test('isHoliday - throws error for unknown symbol', () => {
  assert.throws(
    () => isHoliday(new Date('2025-01-01'), 'INVALID'),
    /Unknown symbol: INVALID/,
    'Should throw error for unknown symbol',
  );
});

/**
 * Test matrix for rthWindow
 */
test('rthWindow - returns null for full closure holidays', () => {
  const testCases = [
    { date: new Date('2025-01-01'), symbol: 'ES', name: "New Year's Day" },
    { date: new Date('2025-12-25'), symbol: 'ES', name: 'Christmas' },
  ];

  for (const tc of testCases) {
    const result = rthWindow(tc.date, tc.symbol);
    assert.strictEqual(
      result,
      null,
      `${tc.name} should have no RTH window (market closed)`,
    );
  }
});

test('rthWindow - returns window for regular trading days', () => {
  const testCases = [
    { date: new Date('2025-06-15'), symbol: 'ES', name: 'Regular Monday' },
    { date: new Date('2025-03-10'), symbol: 'NQ', name: 'Day after DST spring' },
  ];

  for (const tc of testCases) {
    const result = rthWindow(tc.date, tc.symbol);
    assert.ok(result !== null, `${tc.name} should have RTH window`);
    assert.ok(result.start instanceof Date, 'Start should be a Date');
    assert.ok(result.end instanceof Date, 'End should be a Date');
    assert.ok(
      result.start < result.end,
      `Start (${result.start.toISOString()}) should be before end (${result.end.toISOString()})`,
    );
  }
});

test('rthWindow - returns adjusted window for early close days', () => {
  const testCases = [
    { date: new Date('2025-11-28'), symbol: 'ES', name: 'Day After Thanksgiving' },
    { date: new Date('2025-12-24'), symbol: 'ES', name: 'Christmas Eve' },
  ];

  for (const tc of testCases) {
    const result = rthWindow(tc.date, tc.symbol);
    assert.ok(result !== null, `${tc.name} should have RTH window (early close)`);
    assert.ok(result.start instanceof Date, 'Start should be a Date');
    assert.ok(result.end instanceof Date, 'End should be a Date');
    assert.ok(
      result.start < result.end,
      `Start should be before end on early close day`,
    );
  }
});

test('rthWindow - throws error for unknown symbol', () => {
  assert.throws(
    () => rthWindow(new Date('2025-01-01'), 'UNKNOWN'),
    /Unknown symbol: UNKNOWN/,
    'Should throw error for unknown symbol',
  );
});

/**
 * Test matrix for getSessions
 */
test('getSessions - returns empty array for full closure holidays', () => {
  const testCases = [
    { date: new Date('2025-01-01'), symbol: 'ES', name: "New Year's Day" },
    { date: new Date('2025-12-25'), symbol: 'ES', name: 'Christmas' },
  ];

  for (const tc of testCases) {
    const result = getSessions(tc.date, tc.symbol);
    assert.strictEqual(
      result.length,
      0,
      `${tc.name} should have no sessions (market closed)`,
    );
  }
});

test('getSessions - returns all sessions for regular trading days', () => {
  const testCases = [
    { date: new Date('2025-06-15'), symbol: 'ES', name: 'Regular Monday' },
    { date: new Date('2025-03-10'), symbol: 'NQ', name: 'Day after DST spring' },
  ];

  for (const tc of testCases) {
    const result = getSessions(tc.date, tc.symbol);
    assert.ok(result.length >= 2, `${tc.name} should have at least 2 sessions (RTH + ETH_PRE)`);

    // Verify session types
    const types = result.map((s) => s.type);
    assert.ok(types.includes('RTH'), 'Should include RTH session');
    assert.ok(types.includes('ETH_PRE'), 'Should include ETH_PRE session');

    // Verify all sessions have required fields
    for (const session of result) {
      assert.ok(session.start instanceof Date, 'Session start should be a Date');
      assert.ok(session.end instanceof Date, 'Session end should be a Date');
      assert.ok(
        session.start < session.end,
        `Session start should be before end for ${session.type}`,
      );
      assert.ok(typeof session.exchange === 'string', 'Session should have exchange string');
      assert.ok(
        ['RTH', 'ETH_PRE', 'ETH_POST'].includes(session.type),
        'Session type should be valid',
      );
    }
  }
});

test('getSessions - handles early close days correctly', () => {
  const testCases = [
    { date: new Date('2025-11-28'), symbol: 'ES', name: 'Day After Thanksgiving' },
    { date: new Date('2025-12-24'), symbol: 'ES', name: 'Christmas Eve' },
  ];

  for (const tc of testCases) {
    const result = getSessions(tc.date, tc.symbol);
    assert.ok(result.length >= 1, `${tc.name} should have at least RTH session`);

    // Find RTH session
    const rthSession = result.find((s) => s.type === 'RTH');
    assert.ok(rthSession, 'Should have RTH session on early close day');

    // Verify no ETH_POST on early close days
    const ethPostSession = result.find((s) => s.type === 'ETH_POST');
    assert.strictEqual(
      ethPostSession,
      undefined,
      'Should not have ETH_POST session on early close day',
    );
  }
});

test('getSessions - throws error for unknown symbol', () => {
  assert.throws(
    () => getSessions(new Date('2025-01-01'), 'BADSTUFF'),
    /Unknown symbol: BADSTUFF/,
    'Should throw error for unknown symbol',
  );
});

/**
 * DST Transition Tests
 *
 * DST transitions in 2025:
 * - Spring forward: March 9, 2025 at 2:00 AM (lose 1 hour)
 * - Fall back: November 2, 2025 at 2:00 AM (gain 1 hour)
 */
test('getSessions - handles DST spring transition day', () => {
  const dstSpringDates = [
    { date: new Date('2025-03-09'), year: 2025, name: 'DST Spring 2025' },
    { date: new Date('2026-03-08'), year: 2026, name: 'DST Spring 2026' },
  ];

  for (const tc of dstSpringDates) {
    const result = getSessions(tc.date, 'ES');
    assert.ok(result.length >= 2, `${tc.name} should have sessions`);

    // Verify RTH session exists and is valid
    const rthSession = result.find((s) => s.type === 'RTH');
    assert.ok(rthSession, `${tc.name} should have RTH session`);
    assert.ok(
      rthSession.start < rthSession.end,
      `${tc.name} RTH session should have valid start/end times`,
    );
  }
});

test('getSessions - handles DST fall transition day', () => {
  const dstFallDates = [
    { date: new Date('2025-11-02'), year: 2025, name: 'DST Fall 2025' },
    { date: new Date('2026-11-01'), year: 2026, name: 'DST Fall 2026' },
  ];

  for (const tc of dstFallDates) {
    const result = getSessions(tc.date, 'ES');
    assert.ok(result.length >= 2, `${tc.name} should have sessions`);

    // Verify RTH session exists and is valid
    const rthSession = result.find((s) => s.type === 'RTH');
    assert.ok(rthSession, `${tc.name} should have RTH session`);
    assert.ok(
      rthSession.start < rthSession.end,
      `${tc.name} RTH session should have valid start/end times`,
    );
  }
});

/**
 * Cross-symbol consistency tests
 */
test('getSessions - ES and NQ return same session structure on same date', () => {
  const date = new Date('2025-06-15');

  const esSessions = getSessions(date, 'ES');
  const nqSessions = getSessions(date, 'NQ');

  assert.strictEqual(
    esSessions.length,
    nqSessions.length,
    'ES and NQ should have same number of sessions',
  );

  // Verify both have same session types
  const esTypes = esSessions.map((s) => s.type).sort();
  const nqTypes = nqSessions.map((s) => s.type).sort();
  assert.deepStrictEqual(
    esTypes,
    nqTypes,
    'ES and NQ should have same session types',
  );
});

/**
 * Determinism tests - verify same inputs produce same outputs
 */
test('getSessions - produces deterministic results', () => {
  const date = new Date('2025-06-15');
  const symbol = 'ES';

  const result1 = getSessions(date, symbol);
  const result2 = getSessions(date, symbol);

  assert.strictEqual(result1.length, result2.length, 'Should return same number of sessions');

  for (let i = 0; i < result1.length; i++) {
    assert.strictEqual(result1[i].type, result2[i].type, 'Session types should match');
    assert.strictEqual(
      result1[i].start.getTime(),
      result2[i].start.getTime(),
      'Session start times should match',
    );
    assert.strictEqual(
      result1[i].end.getTime(),
      result2[i].end.getTime(),
      'Session end times should match',
    );
    assert.strictEqual(result1[i].exchange, result2[i].exchange, 'Exchange should match');
  }
});

test('isHoliday - produces deterministic results', () => {
  const date = new Date('2025-12-25');
  const symbol = 'ES';

  const result1 = isHoliday(date, symbol);
  const result2 = isHoliday(date, symbol);
  const result3 = isHoliday(date, symbol);

  assert.strictEqual(result1, result2, 'Should return same result on repeat calls');
  assert.strictEqual(result2, result3, 'Should return same result on repeat calls');
});

test('rthWindow - produces deterministic results', () => {
  const date = new Date('2025-06-15');
  const symbol = 'ES';

  const result1 = rthWindow(date, symbol);
  const result2 = rthWindow(date, symbol);

  assert.ok(result1 !== null && result2 !== null, 'Both should return windows');
  assert.strictEqual(
    result1.start.getTime(),
    result2.start.getTime(),
    'Start times should match',
  );
  assert.strictEqual(
    result1.end.getTime(),
    result2.end.getTime(),
    'End times should match',
  );
});