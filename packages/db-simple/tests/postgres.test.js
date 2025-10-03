/**
 * PostgreSQL-specific tests for @tjr-suite/db-simple
 *
 * These tests require a PostgreSQL database to be available.
 * Set TEST_POSTGRES_URL environment variable to run these tests.
 *
 * Example:
 *   export TEST_POSTGRES_URL=postgresql://user:pass@localhost:5432/testdb
 *   node --test tests/postgres.test.js
 *
 * If TEST_POSTGRES_URL is not set, tests will be skipped.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { connect, runMigrations } = require('../dist/index.js');

// Check if PostgreSQL connection string is available
const POSTGRES_URL = process.env.TEST_POSTGRES_URL;

if (!POSTGRES_URL) {
  console.log('⚠️  Skipping PostgreSQL tests: TEST_POSTGRES_URL not set');
  console.log('   Set TEST_POSTGRES_URL to run PostgreSQL integration tests');
  process.exit(0);
}

// Helper to clean up test tables
async function cleanupTestTables(db) {
  try {
    await db.exec('DROP TABLE IF EXISTS _migrations CASCADE');
    await db.exec('DROP TABLE IF EXISTS test_table CASCADE');
    await db.exec('DROP TABLE IF EXISTS users CASCADE');
    await db.exec('DROP TABLE IF EXISTS numbers CASCADE');
    await db.exec('DROP TABLE IF EXISTS transaction_test CASCADE');
  } catch (error) {
    console.warn('Cleanup warning:', error.message);
  }
}

// Test suite for PostgreSQL connection
test('connect() should connect to PostgreSQL database', async () => {
  const db = await connect(POSTGRES_URL);
  assert.ok(db, 'Database connection should exist');
  assert.strictEqual(db.dbType, 'postgres', 'Database type should be postgres');
  await cleanupTestTables(db);
  await db.close();
});

test('connect() should execute PostgreSQL commands', async () => {
  const db = await connect(POSTGRES_URL);
  await cleanupTestTables(db);

  await db.exec('CREATE TABLE users (id BIGSERIAL PRIMARY KEY, name TEXT)');
  await db.exec('INSERT INTO users (name) VALUES ($1)', ['Alice']);

  const users = await db.query('SELECT * FROM users');
  assert.strictEqual(users.length, 1);
  assert.strictEqual(users[0].name, 'Alice');

  await cleanupTestTables(db);
  await db.close();
});

test('connect() should query PostgreSQL data correctly', async () => {
  const db = await connect(POSTGRES_URL);
  await cleanupTestTables(db);

  await db.exec('CREATE TABLE numbers (value INTEGER)');
  await db.exec('INSERT INTO numbers (value) VALUES ($1), ($2), ($3)', [1, 2, 3]);

  const results = await db.query('SELECT value FROM numbers ORDER BY value');
  assert.strictEqual(results.length, 3);
  assert.strictEqual(results[0].value, 1);
  assert.strictEqual(results[1].value, 2);
  assert.strictEqual(results[2].value, 3);

  await cleanupTestTables(db);
  await db.close();
});

// Test suite for PostgreSQL migrations
test('runMigrations() should create PostgreSQL migrations table', async () => {
  const db = await connect(POSTGRES_URL);
  await cleanupTestTables(db);

  const fixturesDir = path.join(__dirname, 'fixtures-postgres');

  await runMigrations(fixturesDir, db);

  // Check that _migrations table exists with PostgreSQL schema
  const tables = await db.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = '_migrations'`
  );
  assert.strictEqual(tables.length, 1);

  // Verify column types (BIGSERIAL should create a BIGINT column)
  const columns = await db.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name = '_migrations'
     ORDER BY ordinal_position`
  );
  assert.ok(columns.some((c) => c.column_name === 'id' && c.data_type === 'bigint'));
  assert.ok(columns.some((c) => c.column_name === 'name' && c.data_type === 'text'));
  assert.ok(
    columns.some((c) => c.column_name === 'applied_at' && c.data_type.includes('timestamp'))
  );

  await cleanupTestTables(db);
  await db.close();
});

test('runMigrations() should apply PostgreSQL migrations', async () => {
  const db = await connect(POSTGRES_URL);
  await cleanupTestTables(db);

  const fixturesDir = path.join(__dirname, 'fixtures-postgres');

  await runMigrations(fixturesDir, db);

  // Check that test_table was created by migration
  const tables = await db.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'test_table'`
  );
  assert.strictEqual(tables.length, 1);

  // Check that migration was recorded
  const migrations = await db.query('SELECT name FROM _migrations');
  assert.strictEqual(migrations.length, 1);
  assert.strictEqual(migrations[0].name, '001_test_migration_postgres.sql');

  await cleanupTestTables(db);
  await db.close();
});

test('runMigrations() should not re-apply PostgreSQL migrations', async () => {
  const db = await connect(POSTGRES_URL);
  await cleanupTestTables(db);

  const fixturesDir = path.join(__dirname, 'fixtures-postgres');

  // Run migrations twice
  await runMigrations(fixturesDir, db);
  await runMigrations(fixturesDir, db);

  // Check that migration was only recorded once
  const migrations = await db.query('SELECT name FROM _migrations');
  assert.strictEqual(migrations.length, 1);

  await cleanupTestTables(db);
  await db.close();
});

// Test suite for PostgreSQL transactions
test('transaction() should commit successful PostgreSQL transaction', async () => {
  const db = await connect(POSTGRES_URL);
  await cleanupTestTables(db);

  await db.exec('CREATE TABLE transaction_test (value INTEGER)');

  await db.transaction(async (txDb) => {
    await txDb.exec('INSERT INTO transaction_test (value) VALUES ($1)', [42]);
    await txDb.exec('INSERT INTO transaction_test (value) VALUES ($1)', [99]);
  });

  const results = await db.query('SELECT value FROM transaction_test ORDER BY value');
  assert.strictEqual(results.length, 2);
  assert.strictEqual(results[0].value, 42);
  assert.strictEqual(results[1].value, 99);

  await cleanupTestTables(db);
  await db.close();
});

test('transaction() should rollback failed PostgreSQL transaction', async () => {
  const db = await connect(POSTGRES_URL);
  await cleanupTestTables(db);

  await db.exec('CREATE TABLE transaction_test (value INTEGER)');

  await assert.rejects(async () => {
    await db.transaction(async (txDb) => {
      await txDb.exec('INSERT INTO transaction_test (value) VALUES ($1)', [42]);
      throw new Error('Intentional failure');
    });
  }, /Intentional failure/);

  // Verify rollback - no rows should exist
  const results = await db.query('SELECT value FROM transaction_test');
  assert.strictEqual(results.length, 0);

  await cleanupTestTables(db);
  await db.close();
});

test('transaction() should handle PostgreSQL constraint violations', async () => {
  const db = await connect(POSTGRES_URL);
  await cleanupTestTables(db);

  await db.exec('CREATE TABLE transaction_test (value INTEGER UNIQUE)');
  await db.exec('INSERT INTO transaction_test (value) VALUES ($1)', [42]);

  // Try to insert duplicate value in transaction
  await assert.rejects(async () => {
    await db.transaction(async (txDb) => {
      await txDb.exec('INSERT INTO transaction_test (value) VALUES ($1)', [42]);
    });
  });

  // Verify original row still exists
  const results = await db.query('SELECT value FROM transaction_test');
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].value, 42);

  await cleanupTestTables(db);
  await db.close();
});

console.log('✅ All PostgreSQL tests configured. Running...');
