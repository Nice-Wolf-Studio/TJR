/**
 * Tests for @tjr-suite/db-simple package
 *
 * Uses Node.js built-in test runner (available in Node.js 18+)
 * Tests SQLite in-memory database for fast, isolated tests
 *
 * Run with: node --test tests/*.test.js
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { connect, runMigrations } = require('../dist/index.js')

// Test suite for connect()
test('connect() should connect to SQLite in-memory database', async () => {
  const db = await connect('sqlite::memory:')
  assert.ok(db, 'Database connection should exist')
  await db.close()
})

test('connect() should connect to SQLite file database', async () => {
  const db = await connect('sqlite:test-temp.db')
  assert.ok(db, 'Database connection should exist')
  await db.close()

  // Cleanup
  const fs = require('node:fs')
  if (fs.existsSync('test-temp.db')) {
    fs.unlinkSync('test-temp.db')
  }
})

test('connect() should execute SQL commands', async () => {
  const db = await connect('sqlite::memory:')

  await db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
  await db.exec('INSERT INTO users (name) VALUES (?)', ['Alice'])

  const users = await db.query('SELECT * FROM users')
  assert.strictEqual(users.length, 1)
  assert.strictEqual(users[0].name, 'Alice')

  await db.close()
})

test('connect() should query data correctly', async () => {
  const db = await connect('sqlite::memory:')

  await db.exec('CREATE TABLE numbers (value INTEGER)')
  await db.exec('INSERT INTO numbers (value) VALUES (?), (?), (?)', [1, 2, 3])

  const results = await db.query('SELECT value FROM numbers ORDER BY value')
  assert.strictEqual(results.length, 3)
  assert.strictEqual(results[0].value, 1)
  assert.strictEqual(results[1].value, 2)
  assert.strictEqual(results[2].value, 3)

  await db.close()
})

// Test suite for runMigrations()
test('runMigrations() should create migrations table', async () => {
  const db = await connect('sqlite::memory:')
  const fixturesDir = path.join(__dirname, 'fixtures')

  await runMigrations(fixturesDir, db)

  // Check that _migrations table exists
  const tables = await db.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'"
  )
  assert.strictEqual(tables.length, 1)

  await db.close()
})

test('runMigrations() should apply pending migrations', async () => {
  const db = await connect('sqlite::memory:')
  const fixturesDir = path.join(__dirname, 'fixtures')

  await runMigrations(fixturesDir, db)

  // Check that test_table was created by migration
  const tables = await db.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'"
  )
  assert.strictEqual(tables.length, 1)

  // Check that migration was recorded
  const migrations = await db.query('SELECT name FROM _migrations')
  assert.strictEqual(migrations.length, 1)
  assert.strictEqual(migrations[0].name, '001_test_migration.sql')

  await db.close()
})

test('runMigrations() should not re-apply migrations', async () => {
  const db = await connect('sqlite::memory:')
  const fixturesDir = path.join(__dirname, 'fixtures')

  // Run migrations twice
  await runMigrations(fixturesDir, db)
  await runMigrations(fixturesDir, db)

  // Check that migration was only recorded once
  const migrations = await db.query('SELECT name FROM _migrations')
  assert.strictEqual(migrations.length, 1)

  await db.close()
})

test('runMigrations() should work with logger', async () => {
  const db = await connect('sqlite::memory:')
  const fixturesDir = path.join(__dirname, 'fixtures')

  const logs = []
  const logger = {
    info: (msg, meta) => logs.push({ level: 'info', msg, meta }),
    error: (msg, meta) => logs.push({ level: 'error', msg, meta }),
  }

  await runMigrations(fixturesDir, db, { logger })

  // Verify logger was called
  assert.ok(logs.length > 0, 'Logger should have been called')
  assert.ok(logs.some((log) => log.msg.includes('migration')), 'Logger should mention migrations')

  await db.close()
})

test('runMigrations() should throw on missing directory', async () => {
  const db = await connect('sqlite::memory:')

  await assert.rejects(
    async () => runMigrations('/nonexistent/path', db),
    /Migrations directory not found/
  )

  await db.close()
})