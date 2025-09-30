/**
 * @fileoverview Tests for logger creation and basic functionality
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../src/createLogger.js';
import type { LoggerConfig } from '../src/types.js';

describe('createLogger', () => {
  const testLogFile = path.join(process.cwd(), 'test.log');

  afterEach(() => {
    // Clean up test log file
    if (fs.existsSync(testLogFile)) {
      fs.unlinkSync(testLogFile);
    }
  });

  it('should create a logger with basic configuration', () => {
    const config: LoggerConfig = {
      level: 'info',
      json: true,
      console: false,
    };

    const logger = createLogger(config);

    assert.ok(logger, 'Logger should be created');
    assert.strictEqual(logger.level, 'info', 'Logger level should match config');
  });

  it('should create a logger with all log levels', () => {
    const levels: LoggerConfig['level'][] = ['error', 'warn', 'info', 'debug'];

    for (const level of levels) {
      const logger = createLogger({ level, console: false });
      assert.strictEqual(logger.level, level, `Logger should support ${level} level`);
    }
  });

  it('should support file transport', async () => {
    const logger = createLogger({
      level: 'info',
      json: true,
      filePath: testLogFile,
      console: false,
    });

    logger.info('Test message', { foo: 'bar' });

    // Give Winston time to flush
    await new Promise(resolve => setTimeout(resolve, 100));

    const logExists = fs.existsSync(testLogFile);
    assert.ok(logExists, 'Log file should be created');

    const logContent = fs.readFileSync(testLogFile, 'utf-8');
    assert.ok(logContent.includes('Test message'), 'Log should contain message');
    assert.ok(logContent.includes('"foo":"bar"'), 'Log should contain custom fields');
  });

  it('should create child logger with context', async () => {
    const logger = createLogger({
      level: 'info',
      json: true,
      filePath: testLogFile,
      console: false,
    });

    const childLogger = logger.child({ component: 'test-component' });
    childLogger.info('Child log message');

    await new Promise(resolve => setTimeout(resolve, 100));

    const logContent = fs.readFileSync(testLogFile, 'utf-8');
    assert.ok(logContent.includes('"component":"test-component"'), 'Child logger should include context');
  });

  it('should support multiple context fields in child logger', async () => {
    const logger = createLogger({
      level: 'info',
      json: true,
      filePath: testLogFile,
      console: false,
    });

    const childLogger = logger.child({
      component: 'trading',
      symbol: 'AAPL',
      timeframe: '1h',
      request_id: 'req-123',
    });

    childLogger.info('Trade signal');

    await new Promise(resolve => setTimeout(resolve, 100));

    const logContent = fs.readFileSync(testLogFile, 'utf-8');
    assert.ok(logContent.includes('"component":"trading"'), 'Should include component');
    assert.ok(logContent.includes('"symbol":"AAPL"'), 'Should include symbol');
    assert.ok(logContent.includes('"timeframe":"1h"'), 'Should include timeframe');
    assert.ok(logContent.includes('"request_id":"req-123"'), 'Should include request_id');
  });

  it('should include timestamp in logs', async () => {
    const logger = createLogger({
      level: 'info',
      json: true,
      filePath: testLogFile,
      console: false,
    });

    logger.info('Timestamped message');

    await new Promise(resolve => setTimeout(resolve, 100));

    const logContent = fs.readFileSync(testLogFile, 'utf-8');
    assert.ok(logContent.includes('"timestamp"'), 'Log should include timestamp');
  });

  it('should support error logging with stack traces', async () => {
    const logger = createLogger({
      level: 'error',
      json: true,
      filePath: testLogFile,
      console: false,
    });

    const error = new Error('Test error');
    logger.error('Error occurred', { error: error.message, stack: error.stack });

    await new Promise(resolve => setTimeout(resolve, 100));

    const logContent = fs.readFileSync(testLogFile, 'utf-8');
    assert.ok(logContent.includes('Test error'), 'Log should include error message');
    assert.ok(logContent.includes('Error occurred'), 'Log should include main message');
  });

  it('should respect log level filtering', async () => {
    const logger = createLogger({
      level: 'warn',
      json: true,
      filePath: testLogFile,
      console: false,
    });

    logger.debug('Debug message'); // Should NOT appear
    logger.info('Info message');   // Should NOT appear
    logger.warn('Warn message');   // Should appear
    logger.error('Error message'); // Should appear

    await new Promise(resolve => setTimeout(resolve, 100));

    const logContent = fs.readFileSync(testLogFile, 'utf-8');
    assert.ok(!logContent.includes('Debug message'), 'Debug should be filtered');
    assert.ok(!logContent.includes('Info message'), 'Info should be filtered');
    assert.ok(logContent.includes('Warn message'), 'Warn should appear');
    assert.ok(logContent.includes('Error message'), 'Error should appear');
  });
});