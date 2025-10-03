/**
 * Tests for bars_cache table migration
 *
 * Validates:
 * 1. Schema creation (table exists with correct columns)
 * 2. Migration idempotency (can run multiple times safely)
 * 3. Index creation and functionality
 * 4. Data insertion and retrieval
 * 5. Primary key constraint enforcement
 * 6. Query performance with indexes
 */

const test = require('node:test');
const assert = require('node:assert');
const { connect, runMigrations } = require('../dist/index.js');

test('bars_cache migration: schema creation', async () => {
  const db = await connect('sqlite::memory:');

  try {
    // Run migration
    await runMigrations('./migrations/sqlite', db);

    // Verify table exists with correct columns
    const schema = await db.query(`
      SELECT name, type FROM pragma_table_info('bars_cache')
      ORDER BY cid
    `);

    const columnNames = schema.map((col) => col.name);
    const expectedColumns = [
      'symbol',
      'provider',
      'timeframe',
      'timestamp',
      'open',
      'high',
      'low',
      'close',
      'volume',
      'revision',
      'providerPriority',
      'insertedAt',
    ];

    assert.deepStrictEqual(columnNames, expectedColumns, 'All expected columns should exist');

    // Verify data types
    const columnTypes = schema.reduce((acc, col) => {
      acc[col.name] = col.type;
      return acc;
    }, {});

    assert.strictEqual(columnTypes.symbol, 'TEXT', 'symbol should be TEXT');
    assert.strictEqual(columnTypes.timestamp, 'INTEGER', 'timestamp should be INTEGER');
    assert.strictEqual(columnTypes.open, 'REAL', 'open should be REAL');
    assert.strictEqual(columnTypes.volume, 'REAL', 'volume should be REAL');
  } finally {
    await db.close();
  }
});

test('bars_cache migration: idempotency', async () => {
  const db = await connect('sqlite::memory:');

  try {
    // Run migration twice
    await runMigrations('./migrations/sqlite', db);
    await runMigrations('./migrations/sqlite', db); // Should not fail

    // Insert test data
    await db.exec(
      `INSERT INTO bars_cache
       (symbol, provider, timeframe, timestamp, open, high, low, close, volume)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['AAPL', 'alpaca', '5m', 1672531200000, 100.0, 101.0, 99.0, 100.5, 1000000.0]
    );

    // Run migration again - data should persist
    await runMigrations('./migrations/sqlite', db);

    const rows = await db.query('SELECT * FROM bars_cache');
    assert.strictEqual(rows.length, 1, 'Data should persist after re-running migration');
    assert.strictEqual(rows[0].symbol, 'AAPL', 'Data should remain intact');
  } finally {
    await db.close();
  }
});

test('bars_cache migration: indexes created', async () => {
  const db = await connect('sqlite::memory:');

  try {
    await runMigrations('./migrations/sqlite', db);

    // Verify indexes exist
    const indexes = await db.query(`
      SELECT name FROM sqlite_master
      WHERE type='index' AND tbl_name='bars_cache'
      ORDER BY name
    `);

    const indexNames = indexes.map((idx) => idx.name);
    assert.ok(
      indexNames.includes('idx_bars_cache_lookup'),
      'idx_bars_cache_lookup index should exist'
    );
    assert.ok(
      indexNames.includes('idx_bars_cache_provider'),
      'idx_bars_cache_provider index should exist'
    );
  } finally {
    await db.close();
  }
});

test('bars_cache migration: data insertion and retrieval', async () => {
  const db = await connect('sqlite::memory:');

  try {
    await runMigrations('./migrations/sqlite', db);

    // Insert multiple bars for different symbols and timeframes
    const bars = [
      ['AAPL', 'alpaca', '5m', 1672531200000, 100.0, 101.0, 99.0, 100.5, 1000000.0],
      ['AAPL', 'alpaca', '5m', 1672531500000, 100.5, 102.0, 100.0, 101.5, 1100000.0],
      ['AAPL', 'polygon', '5m', 1672531200000, 100.1, 101.1, 99.1, 100.6, 1020000.0],
      ['TSLA', 'alpaca', '1h', 1672531200000, 200.0, 205.0, 198.0, 203.0, 5000000.0],
    ];

    for (const bar of bars) {
      await db.exec(
        `INSERT INTO bars_cache
         (symbol, provider, timeframe, timestamp, open, high, low, close, volume)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bar
      );
    }

    // Query by symbol and timeframe
    const aaplBars = await db.query(
      `SELECT * FROM bars_cache
       WHERE symbol = ? AND timeframe = ?
       ORDER BY timestamp, provider`,
      ['AAPL', '5m']
    );

    assert.strictEqual(aaplBars.length, 3, 'Should retrieve all AAPL 5m bars');
    assert.strictEqual(
      aaplBars[0].timestamp,
      1672531200000,
      'First bar should have correct timestamp'
    );
    assert.strictEqual(
      aaplBars[1].timestamp,
      1672531200000,
      'Second bar should have same timestamp (different provider)'
    );
    assert.strictEqual(
      aaplBars[2].timestamp,
      1672531500000,
      'Third bar should have later timestamp'
    );

    // Query by time range
    const rangeBars = await db.query(
      `SELECT * FROM bars_cache
       WHERE symbol = ? AND timeframe = ? AND timestamp BETWEEN ? AND ?`,
      ['AAPL', '5m', 1672531200000, 1672531400000]
    );

    assert.strictEqual(rangeBars.length, 2, 'Should retrieve bars in time range');
  } finally {
    await db.close();
  }
});

test('bars_cache migration: primary key constraint', async () => {
  const db = await connect('sqlite::memory:');

  try {
    await runMigrations('./migrations/sqlite', db);

    // Insert a bar
    await db.exec(
      `INSERT INTO bars_cache
       (symbol, provider, timeframe, timestamp, open, high, low, close, volume)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['AAPL', 'alpaca', '5m', 1672531200000, 100.0, 101.0, 99.0, 100.5, 1000000.0]
    );

    // Attempt to insert duplicate (same symbol, provider, timeframe, timestamp)
    await assert.rejects(
      async () => {
        await db.exec(
          `INSERT INTO bars_cache
           (symbol, provider, timeframe, timestamp, open, high, low, close, volume)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ['AAPL', 'alpaca', '5m', 1672531200000, 101.0, 102.0, 100.0, 101.5, 1100000.0]
        );
      },
      (err) => {
        // Check for primary key or unique constraint violation
        return (
          err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
          /UNIQUE constraint failed|PRIMARY KEY/i.test(err.message || '')
        );
      },
      'Should reject duplicate bars with same composite key'
    );

    // Verify different provider allows same symbol/timeframe/timestamp
    await db.exec(
      `INSERT INTO bars_cache
       (symbol, provider, timeframe, timestamp, open, high, low, close, volume)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['AAPL', 'polygon', '5m', 1672531200000, 100.1, 101.1, 99.1, 100.6, 1020000.0]
    );

    const rows = await db.query('SELECT * FROM bars_cache');
    assert.strictEqual(rows.length, 2, 'Should allow same symbol/time from different providers');
  } finally {
    await db.close();
  }
});

test('bars_cache migration: index usage for performance', async () => {
  const db = await connect('sqlite::memory:');

  try {
    await runMigrations('./migrations/sqlite', db);

    // Insert test data
    for (let i = 0; i < 100; i++) {
      await db.exec(
        `INSERT INTO bars_cache
         (symbol, provider, timeframe, timestamp, open, high, low, close, volume)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['AAPL', 'alpaca', '5m', 1672531200000 + i * 300000, 100.0, 101.0, 99.0, 100.5, 1000000.0]
      );
    }

    // Verify query uses index (check EXPLAIN QUERY PLAN)
    const queryPlan = await db.query(`
      EXPLAIN QUERY PLAN
      SELECT * FROM bars_cache
      WHERE symbol = 'AAPL' AND timeframe = '5m' AND timestamp BETWEEN 1672531200000 AND 1672545600000
    `);

    const planText = queryPlan.map((row) => row.detail).join(' ');
    assert.ok(
      planText.includes('idx_bars_cache_lookup') || planText.includes('USING INDEX'),
      'Query should use idx_bars_cache_lookup index'
    );
  } finally {
    await db.close();
  }
});

test('bars_cache migration: metadata fields', async () => {
  const db = await connect('sqlite::memory:');

  try {
    await runMigrations('./migrations/sqlite', db);

    // Insert bar with default metadata
    await db.exec(
      `INSERT INTO bars_cache
       (symbol, provider, timeframe, timestamp, open, high, low, close, volume)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['AAPL', 'alpaca', '5m', 1672531200000, 100.0, 101.0, 99.0, 100.5, 1000000.0]
    );

    const row = await db.query('SELECT * FROM bars_cache LIMIT 1');
    assert.strictEqual(row[0].revision, 0, 'revision should default to 0');
    assert.strictEqual(row[0].providerPriority, 100, 'providerPriority should default to 100');
    assert.ok(row[0].insertedAt > 0, 'insertedAt should be set automatically');

    // Insert bar with custom metadata
    await db.exec(
      `INSERT INTO bars_cache
       (symbol, provider, timeframe, timestamp, open, high, low, close, volume, revision, providerPriority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['TSLA', 'polygon', '1h', 1672531200000, 200.0, 205.0, 198.0, 203.0, 5000000.0, 2, 50]
    );

    const customRow = await db.query('SELECT * FROM bars_cache WHERE symbol = ? AND provider = ?', [
      'TSLA',
      'polygon',
    ]);
    assert.strictEqual(customRow[0].revision, 2, 'revision should be set to custom value');
    assert.strictEqual(
      customRow[0].providerPriority,
      50,
      'providerPriority should be set to custom value'
    );
  } finally {
    await db.close();
  }
});
